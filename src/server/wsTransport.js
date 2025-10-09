// src/server/wsTransport.js
// WebSocket-based MCP transport for bidirectional agent communication

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config');
const dbClient = require('../utils/dbClient'); // Import dbClient for job monitoring

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
      
      // Handle JSON-RPC requests
      if (message.method) {
        const handler = this.requestHandlers.get(message.method);
        if (handler) {
          const result = await handler(message.params);
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

    let lastEventId = 0;
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
function setupWebSocketServer(httpServer, mcpServer, authenticate) {
  const wss = new WebSocket.Server({ 
    server: httpServer,
    path: '/mcp/ws'
  });

  const sessions = new Map();

  wss.on('connection', async (ws, req) => {
    // Authentication check
    const token = new URL(req.url, 'ws://localhost').searchParams.get('token');
    
    // Simple auth bypass for demo; in production, validate token
    const allowNoAuth = process.env.ALLOW_NO_API_KEY === 'true';
    if (!allowNoAuth && !token) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    const sessionId = uuidv4();
    const transport = new WebSocketTransport(ws, sessionId, config?.policies || {});
    sessions.set(sessionId, transport);

    console.error(`[${new Date().toISOString()}] [${sessionId}] New WebSocket connection established`);

    // Send session started event
    transport.sendEvent('session.started', {
      sessionId,
      capabilities: {
        bidirectional: true,
        proactive: true,
        temporal: true
      }
    });

    // Register JSON-RPC method handlers
    transport.on('tools/list', async () => mcpServer.listTools());

    transport.on('tools/call', async (params) => {
      const { name, arguments: args } = params;
      const callArgs = { ...args };
      let zeroInstance = null;
      if (name === 'agent') {
        const { ZeroAgent } = require('../agents/zeroAgent');
        zeroInstance = new ZeroAgent();
        callArgs.__zeroInstance = zeroInstance;
      }

      const result = await mcpServer.callTool({ name, arguments: callArgs });

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

    transport.on('resources/list', async () => mcpServer.listResources());

    transport.on('resources/subscribe', async (params) => {
      const { uri } = params;
      console.error(`[${new Date().toISOString()}] [${sessionId}] Client subscribed to resource: ${uri}`);
      return { subscribed: true, uri };
    });

    ws.on('close', () => {
      sessions.delete(sessionId);
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

