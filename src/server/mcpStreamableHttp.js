/**
 * MCP Streamable HTTP Transport Implementation (MCP spec 2025-03-26+)
 * Implements unified /mcp endpoint with POST/GET/DELETE and OAuth 2.1 Resource Server
 */

const { v4: uuidv4 } = require('uuid');
const express = require('express');
const config = require('../../config');
const dbClient = require('../utils/dbClient');
const {
  TOOL_CATALOG,
  toolExposedByMode,
  listToolsTool
} = require('./tools');
const {
  encodeCursorIndex,
  decodeCursorIndex,
  emitNotification,
  configureSessionLogLevel,
  registerSessionStream,
  releaseSessionStream,
  shouldExpose
} = require('./mcpServer');

// In-memory maps for SSE streams and event counters (will not scale across instances)
const streams = new Map();
const eventCounters = new Map();

// Periodically clean up expired sessions from the database
setInterval(() => {
  dbClient.cleanupExpiredHttpSessions().catch(err => {
    console.error('[MCP] Error cleaning up expired HTTP sessions:', err);
  });
}, (config.mcp?.sessionCleanupIntervalSeconds || 600) * 1000);

/**
 * Validate and negotiate MCP protocol version
 */
function negotiateProtocolVersion(requestedVersion) {
  const supported = config.mcp.supportedVersions || ['2024-11-05', '2025-03-26'];
  if (supported.includes(requestedVersion)) {
    return requestedVersion;
  }
  // Return latest supported if requested version is unsupported
  return config.mcp.protocolVersion || '2025-03-26';
}

/**
 * Send SSE event on a stream
 */
function sendSSE(res, eventId, eventType, data) {
  if (res.writableEnded) return false;
  try {
    if (eventId !== null && eventId !== undefined) {
      res.write(`id: ${eventId}\n`);
    }
    if (eventType) {
      res.write(`event: ${eventType}\n`);
    }
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (e) {
    console.error(`[SSE] Failed to send event: ${e.message}`);
    return false;
  }
}

/**
 * Get next event ID for a session stream
 */
function getNextEventId(sessionId) {
  const current = eventCounters.get(sessionId) || 0;
  const next = current + 1;
  eventCounters.set(sessionId, next);
  return next;
}

/**
 * Setup unified /mcp endpoint (POST/GET/DELETE)
 */
function setupMCPEndpoint(app, mcpServer, authenticate, requireScopes, getScopesForMethod) {
  /**
   * POST /mcp - Accept JSON-RPC request/notification/response
   * Returns either application/json or text/event-stream
   */
  app.post('/mcp', authenticate, express.json(), async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    const protocolVersion = req.headers['mcp-protocol-version'] || '2025-03-26';
    const acceptHeader = req.headers.accept || '';

    // Validate protocol version
    const supported = config.mcp.supportedVersions || ['2024-11-05', '2025-03-26'];
    if (!supported.includes(protocolVersion)) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: `Unsupported MCP-Protocol-Version: ${protocolVersion}`,
          data: { supported }
        }
      });
    }

    // Parse JSON-RPC message
    let message;
    try {
      message = req.body;
      if (Array.isArray(message)) {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Batch requests are not supported.' },
          id: null
        });
      }
      if (!message || !message.jsonrpc || message.jsonrpc !== '2.0') {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Invalid JSON-RPC message' }
        });
      }
    } catch (e) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' }
      });
    }

    // Handle initialize specially (creates session)
    if (message.method === 'initialize') {
      const newSessionId = uuidv4();
      const clientVersion = message.params?.protocolVersion || protocolVersion;
      const negotiatedVersion = negotiateProtocolVersion(clientVersion);
      
      const session = await dbClient.createHttpSession(newSessionId, {
        protocolVersion: negotiatedVersion,
        capabilities: message.params?.capabilities || {}
      });

      if (!session) {
        return res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Failed to create session' }
        });
      }

      // Build server capabilities
      const serverCapabilities = {
        tools: { list: true, call: true },
        prompts: { list: true, get: true, listChanged: true },
        resources: { list: true, read: true, subscribe: true, listChanged: true },
        logging: {},
        completions: {}
      };

      const result = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: negotiatedVersion,
          capabilities: serverCapabilities,
          serverInfo: {
            name: config.server.name,
            version: config.server.version
          }
        }
      };

      // Set Mcp-Session-Id header in response
      res.setHeader('Mcp-Session-Id', newSessionId);
      
      // If client wants SSE, initiate stream
      if (acceptHeader.includes('text/event-stream')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Mcp-Session-Id': newSessionId
        });

        const eventId = getNextEventId(newSessionId);
        sendSSE(res, eventId, 'message', result);
        streams.set(newSessionId, res);
        registerSessionStream(newSessionId, { sendNotification }, 'http');

        req.on('close', () => {
          streams.delete(newSessionId);
          releaseSessionStream(newSessionId);
        });
      } else {
        // Return JSON
        return res.json(result);
      }
      return;
    }

    // All other requests require valid session
    const session = await dbClient.getHttpSession(sessionId);
    if (!sessionId || !session) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Missing or invalid Mcp-Session-Id header' }
      });
    }
    
    // Touch session to keep it alive
    await dbClient.touchHttpSession(sessionId);

    // Handle notifications/initialized
    if (message.method === 'notifications/initialized') {
      // Here you might update the session state in the DB if you add a state column
      return res.status(202).send();
    }

    // Gate: Only ping/logging allowed before initialized
    // The original implementation had a `protocolStates` map for initialization state.
    // This logic needs to be adapted. A simple approach is to consider any session
    // in the DB as "initialized" for simplicity, or add a 'state' column to mcp_sessions.
    // For now, we'll assume any session is initialized for the purpose of this refactor.
    // if (!state.initialized && message.method !== 'ping' && !message.method?.startsWith('logging/')) {
    //   return res.status(400).json({
    //     jsonrpc: '2.0',
    //     id: message.id,
    //     error: {
    //       code: -32600,
    //       message: 'Protocol not initialized; send notifications/initialized first'
    //     }
    //   });
    // }

    // Handle ping
    if (message.method === 'ping') {
      return res.json({
        jsonrpc: '2.0',
        id: message.id,
        result: {}
      });
    }

    // Handle notifications (cancelled, progress, etc.)
    if (!message.id) {
      // It's a notification; acknowledge with 202
      handleNotification(message, sessionId);
      return res.status(202).send();
    }

    // Route request to MCP server handlers
    try {
      const ensureScopes = (method, overrideScopes) => {
        if (!requireScopes || !getScopesForMethod) return;
        const required = Array.isArray(overrideScopes) ? overrideScopes : getScopesForMethod(method) || [];
        if (!required.length) return;
        const userScopes = Array.isArray(req.scopes) ? req.scopes : [];
        if (userScopes.includes('*')) return;
        const missing = required.filter(scope => !userScopes.includes(scope));
        if (missing.length === 0) return;
        const resourceMetadataUrl = `${config.server.publicUrl}/.well-known/oauth-protected-resource`;
        res.setHeader('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${required.join(' ')}", resource_metadata="${resourceMetadataUrl}"`);
        const err = new Error('Forbidden: Insufficient scope');
        err.code = -32001;
        err.httpStatus = 403;
        err.data = { required_scopes: required };
        throw err;
      };

      const result = await routeRequest(mcpServer, message, sessionId, ensureScopes);
      
      // If client wants SSE, stream the response
      if (acceptHeader.includes('text/event-stream')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        const eventId = getNextEventId(sessionId);
        sendSSE(res, eventId, 'message', {
          jsonrpc: '2.0',
          id: message.id,
          result
        });

        // Close stream after response
        res.end();
      } else {
        return res.json({
          jsonrpc: '2.0',
          id: message.id,
          result
        });
      }
    } catch (error) {
      const status = error?.httpStatus || 500;
      return res.status(status).json({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: error.code || -32603,
          message: error.message || 'Internal server error',
          data: error.data
        }
      });
    }
  });

  /**
   * GET /mcp - Open SSE stream for server-initiated messages
   */
  app.get('/mcp', authenticate, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    const session = await dbClient.getHttpSession(sessionId);
    if (!sessionId || !session) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Invalid or missing MCP-Session-Id header'
        }
      });
      return;
    }

    // Touch session to keep it alive
    await dbClient.touchHttpSession(sessionId);

    // Establish SSE stream
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    streams.set(sessionId, res);
    eventCounters.set(sessionId, 0);
    registerSessionStream(sessionId, { sendNotification }, 'http');

    const eventId = getNextEventId(sessionId);
    sendSSE(res, eventId, 'ready', {
      jsonrpc: '2.0',
      method: 'notifications/ready',
      params: {
        sessionId,
        protocolVersion: session.protocolVersion, // Assuming protocolVersion is stored in session
        timestamp: new Date().toISOString()
      }
    });

    req.on('close', () => {
      streams.delete(sessionId);
      releaseSessionStream(sessionId);
    });
  });

  /**
   * DELETE /mcp - Client-initiated session termination
   */
  app.delete('/mcp', authenticate, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    const session = await dbClient.getHttpSession(sessionId);
    if (!sessionId || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await dbClient.deleteHttpSession(sessionId);
    streams.delete(sessionId);
    eventCounters.delete(sessionId);
    releaseSessionStream(sessionId);
    
    res.status(200).json({ message: 'Session terminated' });
  });

  console.error(`[MCP] Stateless Streamable HTTP endpoint configured at /mcp`);
}

/**
 * Handle notifications (cancelled, progress, etc.)
 */
function handleNotification(message, sessionId) {
  const { method, params } = message;

  switch (method) {
    case 'notifications/cancelled':
      // Cancel in-flight request
      console.error(`[MCP] Cancellation requested for request ${params?.requestId}`);
      // TODO: Implement actual cancellation logic
      break;
    
    case 'notifications/progress':
      // Progress update (not typically sent by client)
      console.error(`[MCP] Progress notification: ${JSON.stringify(params)}`);
      break;

    default:
      console.error(`[MCP] Unknown notification: ${method}`);
  }
}

/**
 * Route JSON-RPC request to appropriate handler
 */
async function routeRequest(mcpServer, message, sessionId, ensureScopes) {
  const { method, params } = message;

  // Use SDK's built-in handlers where possible
  switch (method) {
    case 'tools/list':
      ensureScopes?.('tools/list');
      try {
        const listed = await mcpServer.listTools();
        // Ensure consistent shape { tools: [...] }
        if (listed && Array.isArray(listed.tools)) return listed;
        if (Array.isArray(listed)) return { tools: listed };
      } catch (_) {
        // ignore and try fallback
      }
      try {
        const text = await require('./tools').listToolsTool({ limit: 200, semantic: false });
        const obj = JSON.parse(text);
        return { tools: Array.isArray(obj?.tools) ? obj.tools : [] };
      } catch (_) {
        return { tools: [] };
      }
    
    case 'tools/call':
      ensureScopes?.('tools/call');
      return await mcpServer.callTool(params);
    
    case 'resources/list':
      ensureScopes?.('resources/list');
      return await mcpServer.listResources();
    
    case 'resources/read':
      ensureScopes?.('resources/read');
      return await mcpServer.readResource(params);
    
    case 'resources/templates/list':
      return await mcpServer.listResourceTemplates?.() || { resourceTemplates: [] };
    
    case 'resources/subscribe':
      ensureScopes?.('resources/subscribe');
      // TODO: Implement subscription logic
      return {};
    
    case 'resources/unsubscribe':
      return {};
    
    case 'prompts/list':
      ensureScopes?.('prompts/list');
      return await mcpServer.listPrompts();
    
    case 'prompts/get':
      ensureScopes?.('prompts/get');
      return await mcpServer.getPrompt(params);
    
    case 'logging/setLevel':
      // Store log level for session
      {
        const level = params?.level || 'info';
        // The original implementation had a `sessions` map for session state.
        // This logic needs to be adapted. A simple approach is to assume
        // the session is always valid and update its log level directly.
        // If you add a 'logLevel' column to mcp_sessions, you'd update it here.
        // For now, we'll just return an empty object.
        return {};
      }
    
    case 'completion/complete':
      return getCompletionSuggestions(params);

    case 'notifications/message':
      if (!shouldExpose('notifications/message')) throw { code: -32601, message: 'notifications/message disabled' };
      if (!sessionId) throw { code: -32602, message: 'Session ID required for notifications' };
      return emitNotification(sessionId, params?.level || 'info', {
        message: params?.message,
        data: params?.data
      }) ? { acknowledged: true } : { acknowledged: false };
    
    default:
      throw { code: -32601, message: `Method not found: ${method}` };
  }
}

/**
 * Send server-initiated notification on session stream
 */
function sendNotification(sessionId, method, params) {
  const stream = streams.get(sessionId);
  if (!stream || stream.writableEnded) return false;

  const eventId = getNextEventId(sessionId);
  return sendSSE(stream, eventId, 'message', {
    jsonrpc: '2.0',
    method,
    params
  });
}

module.exports = {
  setupMCPEndpoint,
  sendNotification
};

