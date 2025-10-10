// src/server/wsTransport.js
// WebSocket-based MCP transport for bidirectional agent communication

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config');
const dbClient = require('../utils/dbClient'); // Import dbClient for job monitoring
const { createAuthMiddleware } = require('./oauthResourceServer');

/**
 * Validate and negotiate MCP protocol version.
 * Returns the negotiated version string or null if unsupported.
 */
function negotiateProtocolVersion(requestedVersion) {
  const supported = config.mcp?.supportedVersions || ['2024-11-05', '2025-03-26'];
  // If client requests a supported version, use it.
  if (supported.includes(requestedVersion)) {
    return requestedVersion;
  }
  // Per spec, if no version is requested, server picks latest.
  if (!requestedVersion) {
    return config.mcp?.protocolVersion || '2025-03-26';
  }
  // If requested version is unsupported, negotiation fails.
  return null;
}

/**
 * WebSocket-based MCP Transport
 * Enables bidirectional, real-time communication between client and agent
 */
class WebSocketTransport {
  constructor(ws, sessionId, policy = {}) {
    this.ws = ws;
    this.sessionId = sessionId || uuidv4();
    this.isConnected = true;
    this.messageQueue = [];
    this.requestHandlers = new Map();
    this.jobMonitors = new Map(); // Store active job monitors
    this.policy = policy;

    // Protocol state
    this.state = 'pre-init'; // pre-init -> initialized
    this.protocolVersion = null;
    this.clientCapabilities = null;

    // Telemetry state
    this.telemetry = {
      tokenCount: 0,
      firstTokenTs: null,
      lastTokenTs: null,
      jitterSamples: [],
      fanoutK: 0,
      compressionRatio: 1,
      targetTokenRate: policy?.pll?.targetTokenRate || 0,
      emaError: 0,
      emaAlpha: this.#computeEmaAlpha(policy?.pll?.smoothingHalfLifeMs || 300),
      circuitBreakerTrips: 0,
      circuitBreakerOpen: false,
      circuitBreakerOpenedAt: null
    };

    this.flushTimer = null;
    this.pendingBuffer = [];
    this.pendingBytes = 0;
    this.lastFlushTs = 0;
    
    // Set up WebSocket event handlers
    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('close', () => this.handleClose());
    this.ws.on('error', (error) => this.handleError(error));
  }

  #ingestMetrics(metrics) {
    if (!metrics || typeof metrics !== 'object') return;
    if (typeof metrics.tokens === 'number') {
      if (this.telemetry.tokenCount === 0) {
        this.telemetry.firstTokenTs = Date.now();
      } else if (this.telemetry.lastTokenTs) {
        const delta = Date.now() - this.telemetry.lastTokenTs;
        if (delta > 0 && delta < 2000) {
          this.telemetry.jitterSamples.push(delta);
          if (this.telemetry.jitterSamples.length > 50) {
            this.telemetry.jitterSamples.shift();
          }
        }
      }
      this.telemetry.tokenCount += metrics.tokens;
      this.telemetry.lastTokenTs = Date.now();
    }

    if (typeof metrics.targetTokenRate === 'number') {
      this.telemetry.targetTokenRate = metrics.targetTokenRate;
    }

    if (typeof metrics.fanout_k === 'number') {
      this.telemetry.fanoutK = metrics.fanout_k;
    }

    if (typeof metrics.compression_ratio === 'number') {
      this.telemetry.compressionRatio = metrics.compression_ratio;
    }

    if (typeof metrics.cadence_error === 'number') {
      const ema = this.#updateEmaError(metrics.cadence_error);
      this.#maybeTripCircuitBreaker(ema);
    } else {
      this.#maybeResetCircuitBreaker();
    }

    this.#emitTelemetry('update', { metrics });
  }

  #computeEmaAlpha(halfLifeMs) {
    const hl = Math.max(halfLifeMs, 1);
    return 1 - Math.exp(Math.log(0.5) / Math.max(hl / 50, 1));
  }

  #updateEmaError(errorValue) {
    const alpha = this.telemetry.emaAlpha;
    this.telemetry.emaError = (1 - alpha) * this.telemetry.emaError + alpha * errorValue;
    return this.telemetry.emaError;
  }

  #maybeTripCircuitBreaker(errorMagnitude) {
    const threshold = this.policy?.pll?.circuitBreakerThreshold || Infinity;
    if (!Number.isFinite(threshold)) return;
    if (Math.abs(errorMagnitude) >= threshold && !this.telemetry.circuitBreakerOpen) {
      this.telemetry.circuitBreakerOpen = true;
      this.telemetry.circuitBreakerOpenedAt = Date.now();
      this.telemetry.circuitBreakerTrips += 1;
      this.pendingBuffer.length = 0;
      this.pendingBytes = 0;
      this.#emitTelemetry('circuit_breaker', {
        state: 'open',
        errorMagnitude,
        trips: this.telemetry.circuitBreakerTrips
      });
    }
  }

  #maybeResetCircuitBreaker() {
    if (!this.telemetry.circuitBreakerOpen) return;
    const cooldown = this.policy?.pll?.fallbackCooldownMs || 10000;
    if (Date.now() - (this.telemetry.circuitBreakerOpenedAt || 0) >= cooldown) {
      this.telemetry.circuitBreakerOpen = false;
      this.telemetry.circuitBreakerOpenedAt = null;
      this.#emitTelemetry('circuit_breaker', { state: 'closed' });
    }
  }

  #emitTelemetry(type, payload = {}) {
    // Only emit telemetry if PLL is enabled
    if (!this.policy?.pll?.enable) return;
    
    try {
      this.sendEvent(`metrics.${type}`, {
        ...payload,
        token_rate: this.telemetry.tokenCount > 1 && this.telemetry.firstTokenTs
          ? (this.telemetry.tokenCount - 1) / ((Date.now() - this.telemetry.firstTokenTs) / 1000)
          : 0,
        jitter_ms: this.#currentJitter(),
        fanout_k: this.telemetry.fanoutK,
        compression_ratio: this.telemetry.compressionRatio,
        ema_error: this.telemetry.emaError
      });
    } catch (_) {}
  }

  #currentJitter() {
    if (this.telemetry.jitterSamples.length === 0) return 0;
    const sum = this.telemetry.jitterSamples.reduce((acc, v) => acc + v, 0);
    return sum / this.telemetry.jitterSamples.length;
  }

  #enqueueForFlush(message) {
    if (!this.policy?.websocket?.pacing?.enable) {
      this.ws.send(message);
      return;
    }

    const credits = this.#availableCredits();
    if (credits <= 0 && !this.telemetry.circuitBreakerOpen) {
      this.#maybeTripCircuitBreaker(this.telemetry.emaError);
      if (this.telemetry.circuitBreakerOpen) return;
    }

    if (!this.policy?.websocket?.pacing?.enable) {
      this.ws.send(message);
      return;
    }

    if (this.telemetry.circuitBreakerOpen) {
      if (Date.now() - (this.telemetry.circuitBreakerOpenedAt || 0) < (this.policy?.pll?.fallbackCooldownMs || 10000)) {
        return; // drop until cooldown
      }
      this.telemetry.circuitBreakerOpen = false;
    }

    this.pendingBuffer.push(message);
    this.pendingBytes += Buffer.byteLength(message);
    const now = Date.now();
    const minFlush = this.policy.websocket.pacing.minFlushIntervalMs || 15;
    const maxFlush = this.policy.websocket.pacing.maxFlushIntervalMs || 120;
    const maxBuffer = this.policy.websocket.pacing.maxBufferSize || 4096;

    const shouldFlush =
      this.pendingBytes >= maxBuffer ||
      this.pendingBuffer.length === 1 ||
      (now - this.lastFlushTs >= maxFlush);

    if (shouldFlush) {
      this.#flushPending();
    } else if (!this.flushTimer) {
      const delay = Math.max(minFlush, Math.min(maxFlush, maxFlush - (now - this.lastFlushTs)));
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.#flushPending();
      }, delay);
    }
  }

  #flushPending() {
    if (!this.isConnected || this.pendingBuffer.length === 0) {
      this.pendingBuffer.length = 0;
      this.pendingBytes = 0;
      return;
    }
    const payload = this.pendingBuffer.join('\n');
    this.ws.send(payload);
    this.lastFlushTs = Date.now();
    this.pendingBuffer.length = 0;
    this.pendingBytes = 0;
  }

  #availableCredits() {
    if (!this.telemetry.firstTokenTs || !this.telemetry.targetTokenRate) return Infinity;
    const elapsedSec = Math.max((Date.now() - this.telemetry.firstTokenTs) / 1000, 0.001);
    const expectedTokens = this.telemetry.targetTokenRate * elapsedSec;
    const deficit = expectedTokens - this.telemetry.tokenCount;
    return deficit;
  }

  async handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());

      if (Array.isArray(message)) {
        return this.send({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Batch requests are not supported.' },
          id: null
        });
      }

      // Handle initialize message (must be the first message)
      if (message.method === 'initialize') {
        if (this.state !== 'pre-init') {
          return this.send({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32002, message: 'Session already initialized' }
          });
        }

        const negotiatedVersion = negotiateProtocolVersion(message.params?.protocolVersion);

        if (!negotiatedVersion) {
          this.send({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32600,
              message: `Unsupported protocol version: ${message.params?.protocolVersion}`,
              data: { supported: config.mcp?.supportedVersions || ['2024-11-05', '2025-03-26'] }
            }
          });
          return this.ws.close(1002, 'Unsupported protocol version');
        }

        this.protocolVersion = negotiatedVersion;
        this.clientCapabilities = message.params?.capabilities || {};
        this.state = 'initialized';

        // Build server capabilities
        const serverCapabilities = {
          tools: { list: true, call: true },
          prompts: { list: true, get: true, listChanged: true },
          resources: { list: true, read: true, subscribe: true, listChanged: true },
          logging: {},
          completions: {}
        };

        return this.send({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: this.protocolVersion,
            capabilities: serverCapabilities,
            serverInfo: {
              name: config.server.name,
              version: config.server.version
            },
            sessionId: this.sessionId
          }
        });
      }

      // Gate all other messages until initialized
      if (this.state !== 'initialized') {
        return this.send({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32002, message: 'Session not initialized. Send initialize request first.' }
        });
      }
      
      // Handle JSON-RPC requests
      if (message.method) {
        const handler = this.requestHandlers.get(message.method);
        if (handler) {
          const result = await handler(message.params, message.id);
          this.send({
            jsonrpc: '2.0',
            id: message.id,
            result
          });
        } else {
          this.send({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32601, message: `Method not found: ${message.method}` }
          });
        }
      }
      
      // Handle agent steering commands
      if (message.type === 'agent.steer') {
        await this.handleSteering(message.payload);
      }
      
      // Handle context provision
      if (message.type === 'agent.provide_context') {
        await this.handleContextProvision(message.payload);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [${this.sessionId}] Error handling WebSocket message:`, error);
      this.sendEvent('error', { message: error.message });
    }
  }

  async handleSteering(payload) {
    // Allow clients to modify the agent's current goal or focus
    console.error(`[${new Date().toISOString()}] [${this.sessionId}] Agent steering received:`, payload);
    this.sendEvent('agent.steered', { new_goal: payload.new_goal, acknowledged: true });
  }

  async handleContextProvision(payload) {
    // Allow clients to inject new context at any time
    console.error(`[${new Date().toISOString()}] [${this.sessionId}] Context provision received:`, payload);
    this.sendEvent('agent.context_updated', { acknowledged: true, context_id: uuidv4() });
  }

  startJobMonitoring(jobId, policyOverrides = {}, getMetrics) {
    if (policyOverrides?.pll) {
      this.policy = {
        ...this.policy,
        pll: { ...this.policy?.pll, ...policyOverrides.pll }
      };
      this.telemetry.targetTokenRate = this.policy?.pll?.targetTokenRate || this.telemetry.targetTokenRate;
      this.telemetry.emaAlpha = this.#computeEmaAlpha(this.policy?.pll?.smoothingHalfLifeMs || 300);
    }
    if (policyOverrides?.websocket?.pacing) {
      this.policy = {
        ...this.policy,
        websocket: {
          pacing: {
            ...this.policy?.websocket?.pacing,
            ...policyOverrides.websocket.pacing
          }
        }
      };
    }
    if (this.jobMonitors.has(jobId)) return;

    let lastEventId = policyOverrides.since_event_id || 0;
    let isMonitoring = true;

    const monitorJob = async () => {
      if (!this.isConnected || !isMonitoring) {
        clearInterval(intervalId);
        this.jobMonitors.delete(jobId);
        return;
      }

      try {
        // Fetch new events
        const newEvents = await dbClient.getJobEvents(jobId, lastEventId, 50); // Get up to 50 events
        if (newEvents.length > 0) {
          lastEventId = newEvents[newEvents.length - 1].id;

          // Send events in batches for better performance
          for (const event of newEvents) {
            if (event.payload?.metrics) {
              this.#ingestMetrics(event.payload.metrics);
            }
            this.sendEvent('job.event', {
              jobId,
              eventId: event.id,
              eventType: event.event_type,
              timestamp: event.ts,
              payload: event.payload
            });
          }
        }

        // Check final status
        const jobStatus = await dbClient.getJobStatus(jobId);
        if (jobStatus && ['completed', 'failed', 'canceled'].includes(jobStatus.status)) {
          if (typeof getMetrics === 'function') {
            const metrics = getMetrics();
            if (metrics) {
              this.#ingestMetrics({
                cadence_error: metrics.lastCadenceError,
                dynamic_concurrency: metrics.lastDynamicConcurrency
              });
            }
          }
          this.sendEvent('job.completed', {
            jobId,
            status: jobStatus.status,
            result: jobStatus.result,
            duration: jobStatus.finished_at ? new Date(jobStatus.finished_at) - new Date(jobStatus.started_at) : null
          });
          this.#emitTelemetry('job_final', {
            jobId,
            status: jobStatus.status,
            duration_ms: jobStatus.finished_at && jobStatus.started_at ? (new Date(jobStatus.finished_at) - new Date(jobStatus.started_at)) : null
          });
          clearInterval(intervalId);
          this.jobMonitors.delete(jobId);
          return;
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] [${this.sessionId}] Error monitoring job ${jobId}:`, error);
        this.sendEvent('job.error', { jobId, error: error.message });
        clearInterval(intervalId);
        this.jobMonitors.delete(jobId);
      }
    };

    // Poll every 500ms for more responsive streaming
    const intervalId = setInterval(monitorJob, 500);

    this.jobMonitors.set(jobId, { intervalId, isMonitoring });

    // Start monitoring immediately
    monitorJob();
  }

  stopJobMonitoring(jobId) {
    const monitor = this.jobMonitors.get(jobId);
    if (monitor) {
      monitor.isMonitoring = false;
      clearInterval(monitor.intervalId);
      this.jobMonitors.delete(jobId);
    }
  }

  handleClose() {
    console.error(`[${new Date().toISOString()}] [${this.sessionId}] WebSocket connection closed`);
    this.isConnected = false;
    // Stop all active job monitors for this session
    this.jobMonitors.forEach(monitor => clearInterval(monitor.intervalId));
    this.jobMonitors.clear();
  }

  handleError(error) {
    console.error(`[${new Date().toISOString()}] [${this.sessionId}] WebSocket error:`, error);
  }

  /**
   * Send a JSON-RPC message to the client
   */
  send(message) {
    if (!this.isConnected) return;
    const payload = JSON.stringify(message);
    this.#enqueueForFlush(payload);
  }

  /**
   * Send an event to the client (non-request/response)
   */
  sendEvent(type, payload) {
    this.send({
      type,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      payload
    });
  }

  /**
   * Proactive agent update
   */
  sendAgentThinking(thought) {
    this.sendEvent('agent.thinking', { thought });
  }

  sendAgentStatusUpdate(status, details = {}) {
    this.sendEvent('agent.status_update', { status, ...details });
  }

  sendProactiveSuggestion(suggestion) {
    this.sendEvent('agent.proactive_suggestion', suggestion);
  }

  /**
   * Register a handler for a specific JSON-RPC method
   */
  on(method, handler) {
    this.requestHandlers.set(method, handler);
  }

  /**
   * Close the WebSocket connection
   */
  close() {
    if (this.isConnected) {
      this.ws.close();
      this.isConnected = false;
    }
  }
}

/**
 * Create and initialize a WebSocket server on top of an Express app
 */
function setupWebSocketServer(httpServer, mcpServer, authenticate, requireScopes, getScopesForMethod) {
  const wss = new WebSocket.Server({ 
    server: httpServer,
    path: '/mcp/ws'
  });

  const sessions = new Map();

  function enforceScopes(required, userScopes = []) {
    if (!required || required.length === 0) return;
    if (userScopes.includes('*')) return;
    const missing = required.filter(scope => !userScopes.includes(scope));
    if (missing.length === 0) return;
    const err = new Error('Forbidden: Insufficient scope');
    err.code = -32001;
    err.missingScopes = missing;
    throw err;
  }

  wss.on('connection', async (ws, req) => {
    const headers = req.headers || {};
    const url = new URL(req.url, `ws://${req.headers.host || 'localhost'}`);
    const tokenFromQuery = url.searchParams.get('token');
    let authInfo = null;

    const authResult = await new Promise((resolve) => {
      const fakeRes = {
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.payload = payload;
          resolve({ ok: false, payload });
        },
        setHeader() {}
      };

      const fakeReq = {
        method: 'GET',
        headers: {
          ...headers,
          authorization: headers.authorization || (tokenFromQuery ? `Bearer ${tokenFromQuery}` : undefined)
        }
      };

      authenticate(fakeReq, fakeRes, () => {
        authInfo = {
          user: fakeReq.user,
          scopes: fakeReq.scopes
        };
        resolve({ ok: true });
      });
    });

    if (!authResult.ok || !authInfo) {
      const reason = authResult.payload?.error || 'Unauthorized';
      ws.close(4401, reason);
      return;
    }

    const sessionId = uuidv4();
    const transport = new WebSocketTransport(ws, sessionId, config?.policies || {});
    transport.authInfo = authInfo;
    sessions.set(sessionId, transport);
    try {
      const { registerSessionStream } = require('./mcpServer');
      registerSessionStream(sessionId, transport, 'ws');
    } catch (e) {
      console.error(`[${new Date().toISOString()}] [${sessionId}] Failed to register session stream:`, e.message);
    }

    console.error(`[${new Date().toISOString()}] [${sessionId}] New WebSocket connection established. Waiting for initialize...`);

    // Register JSON-RPC method handlers
    transport.on('tools/list', async () => {
      try {
        if (requireScopes && getScopesForMethod) {
          const required = getScopesForMethod('tools/list') || config.auth.scopes?.minimal || [];
          enforceScopes(required, authInfo.scopes);
        }
      } catch (err) {
        const reason = err.missingScopes ? `Insufficient scope: ${err.missingScopes.join(',')}` : err.message;
        ws.close(4403, reason);
        throw err;
      }
      return mcpServer.listTools();
    });

    transport.on('tools/call', async (params) => {
      const { name, arguments: args } = params;
      const callArgs = { ...args };
      let zeroInstance = null;
      if (name === 'agent') {
        const { ZeroAgent } = require('../agents/zeroAgent');
        zeroInstance = new ZeroAgent();
        callArgs.__zeroInstance = zeroInstance;
      }

      try {
        if (requireScopes && getScopesForMethod) {
          const required = getScopesForMethod('tools/call') || config.auth.scopes?.minimal || [];
          enforceScopes(required, authInfo.scopes);
        }
      } catch (err) {
        const reason = err.missingScopes ? `Insufficient scope: ${err.missingScopes.join(',')}` : err.message;
        ws.close(4403, reason);
        throw err;
      }

      const result = await mcpServer.callTool({ name, arguments: callArgs, extra: { authInfo } });

      if (result && result.job_id) {
        let metricsGetter = null;
        if (zeroInstance && typeof zeroInstance.getLastMetrics === 'function') {
          metricsGetter = () => zeroInstance.getLastMetrics();
        }
        transport.startJobMonitoring(result.job_id, callArgs?.policy, metricsGetter);
      } else if (zeroInstance && typeof zeroInstance.getLastMetrics === 'function') {
        const metrics = zeroInstance.getLastMetrics();
        if (metrics && Object.keys(metrics).length > 0) {
          transport.sendEvent('metrics.final', {
            jobless: true,
            metrics
          });
        }
      }

      if (callArgs.__zeroInstance) {
        delete callArgs.__zeroInstance;
      }

      return result;
    });

    transport.on('resources/list', async () => {
      try {
        if (requireScopes && getScopesForMethod) {
          const required = getScopesForMethod('resources/list') || config.auth.scopes?.minimal || [];
          enforceScopes(required, authInfo.scopes);
        }
      } catch (err) {
        const reason = err.missingScopes ? `Insufficient scope: ${err.missingScopes.join(',')}` : err.message;
        ws.close(4403, reason);
        throw err;
      }
      return mcpServer.listResources();
    });

    transport.on('resources/subscribe', async (params) => {
      try {
        if (requireScopes && getScopesForMethod) {
          const required = getScopesForMethod('resources/subscribe') || config.auth.scopes?.minimal || [];
          enforceScopes(required, authInfo.scopes);
        }
      } catch (err) {
        const reason = err.missingScopes ? `Insufficient scope: ${err.missingScopes.join(',')}` : err.message;
        ws.close(4403, reason);
        throw err;
      }
      const { uri } = params;
      console.error(`[${new Date().toISOString()}] [${sessionId}] Client subscribed to resource: ${uri}`);
      return { subscribed: true, uri };
    });

    ws.on('close', () => {
      sessions.delete(sessionId);
      try {
        const { releaseSessionStream } = require('./mcpServer');
        releaseSessionStream(sessionId);
      } catch (e) {
        console.error(`[${new Date().toISOString()}] [${sessionId}] Failed to release session stream:`, e.message);
      }
      console.error(`[${new Date().toISOString()}] [${sessionId}] WebSocket session ended`);
    });
  });

  return {
    wss,
    sessions,
    broadcast: (type, payload) => {
      sessions.forEach(transport => transport.sendEvent(type, payload));
    },
    sendToSession: (sessionId, type, payload) => {
      const transport = sessions.get(sessionId);
      if (transport) {
        transport.sendEvent(type, payload);
      }
    }
  };
}

module.exports = {
  WebSocketTransport,
  setupWebSocketServer
};

