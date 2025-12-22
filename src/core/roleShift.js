/**
 * RoleShift Protocol
 *
 * Enables bidirectional communication where server can request client actions.
 * Uses MCP sampling (SEP-1577) and elicitation (SEP-1036) primitives.
 *
 * The "telepathic link" - server and client roles are negotiable per operation.
 */

const { Signal, SignalType } = require('./signal');
const crypto = require('crypto');

/**
 * RoleShift modes
 */
const RoleMode = {
  SERVER: 'server',    // Normal: server responds to client requests
  CLIENT: 'client',    // Reversed: server requests client actions
  PEER: 'peer',        // Symmetric: either can initiate
  SELF: 'self'         // Zero Protocol: self-connection (the fixed point)
};

/**
 * Tracks pending requests for bidirectional communication.
 *
 * Manages request lifecycle with automatic timeout cleanup.
 *
 * @class
 * @example
 * const tracker = new RequestTracker();
 * const req = tracker.create('synthesis', { prompt: 'Hello' });
 * // Later...
 * tracker.resolve(req.id, response);
 */
class RequestTracker {
  /**
   * Create a new RequestTracker instance.
   *
   * @param {Object} [options={}] - Configuration options
   * @param {number} [options.timeout] - Request timeout in milliseconds (default: from config or 60000)
   */
  constructor(options = {}) {
    // Lazy-load config to avoid circular dependencies
    let timeout = options.timeout;
    if (timeout === undefined) {
      try {
        const { getConfig } = require('./config');
        timeout = getConfig('requestTracker').timeout;
      } catch (e) {
        timeout = 60000;
      }
    }
    this.pending = new Map();
    this.timeout = timeout;
  }

  /**
   * Create a pending request with auto-cleanup.
   *
   * @param {string} type - Request type ('synthesis'|'clarification'|'consensus')
   * @param {Object} [context={}] - Additional context for the request
   * @returns {Object} Request object with id, type, context, createdAt, resolved, result
   *
   * @example
   * const request = tracker.create('synthesis', { prompt: 'Analyze this' });
   * console.log(request.id); // 'req_a1b2c3d4'
   */
  create(type, context = {}) {
    const id = `req_${crypto.randomUUID().slice(0, 8)}`;
    const request = {
      id,
      type,
      context,
      createdAt: Date.now(),
      resolved: false,
      result: null,
      _timeoutHandle: null
    };

    // Auto-cleanup after timeout (store handle for cleanup on resolve)
    request._timeoutHandle = setTimeout(() => {
      if (this.pending.has(id) && !this.pending.get(id).resolved) {
        this.pending.delete(id);
      }
    }, this.timeout);

    this.pending.set(id, request);
    return request;
  }

  /**
   * Resolve a pending request with a result.
   *
   * @param {string} id - Request ID to resolve
   * @param {*} result - Result value
   * @returns {Object} Resolved request object
   * @throws {Error} If request not found
   *
   * @example
   * const resolved = tracker.resolve('req_a1b2c3d4', { data: 'result' });
   * console.log(resolved.resolvedAt); // timestamp
   */
  resolve(id, result) {
    const request = this.pending.get(id);
    if (!request) {
      throw new Error(`Request not found: ${id}`);
    }
    // Clear the auto-cleanup timeout to prevent memory leak
    if (request._timeoutHandle) {
      clearTimeout(request._timeoutHandle);
      request._timeoutHandle = null;
    }
    request.resolved = true;
    request.result = result;
    request.resolvedAt = Date.now();
    return request;
  }

  /**
   * Get a pending request by ID.
   *
   * @param {string} id - Request ID to retrieve
   * @returns {Object|undefined} Request object or undefined if not found
   *
   * @example
   * const request = tracker.get('req_a1b2c3d4');
   * if (request && !request.resolved) {
   *   console.log('Still pending:', request.type);
   * }
   */
  get(id) {
    return this.pending.get(id);
  }

  /**
   * List all unresolved pending requests.
   *
   * @returns {Array<Object>} Array of pending request objects
   *
   * @example
   * const pending = tracker.list();
   * console.log(`${pending.length} requests awaiting response`);
   */
  list() {
    return Array.from(this.pending.values()).filter(r => !r.resolved);
  }
}

/**
 * RoleShift Protocol Handler
 *
 * Enables bidirectional communication where the server can request
 * actions from the client. Uses MCP sampling (SEP-1577) and
 * elicitation (SEP-1036) primitives.
 *
 * @class
 * @example
 * const protocol = new RoleShiftProtocol({ mode: RoleMode.PEER });
 * protocol.setCapabilities({ sampling: mcpSampling, elicitation: mcpElicit });
 *
 * // Request synthesis from client LLM
 * const response = await protocol.requestSynthesis('Analyze this data');
 *
 * // Request clarification from user
 * const answer = await protocol.requestClarification('Which option?');
 */
class RoleShiftProtocol {
  /**
   * Create a new RoleShiftProtocol instance.
   *
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.mode='server'] - Role mode ('server'|'client'|'peer')
   * @param {Object} [options.sampling] - MCP sampling capability
   * @param {Object} [options.elicitation] - MCP elicitation capability
   */
  constructor(options = {}) {
    this.mode = options.mode ?? RoleMode.SERVER;
    this.sampling = options.sampling ?? null;     // MCP sampling capability
    this.elicitation = options.elicitation ?? null; // MCP elicitation capability
    this.tracker = new RequestTracker();
    this.handlers = new Map();
  }

  /**
   * Set MCP capabilities after initialization.
   *
   * Called when server initializes with client capabilities.
   *
   * @param {Object} capabilities - MCP capabilities object
   * @param {Object} [capabilities.sampling] - Sampling capability for LLM requests
   * @param {Object} [capabilities.elicitation] - Elicitation capability for user input
   *
   * @example
   * protocol.setCapabilities({
   *   sampling: server.getSamplingCapability(),
   *   elicitation: server.getElicitationCapability()
   * });
   */
  setCapabilities(capabilities) {
    if (capabilities.sampling) {
      this.sampling = capabilities.sampling;
    }
    if (capabilities.elicitation) {
      this.elicitation = capabilities.elicitation;
    }
  }

  /**
   * Check if role shift is available.
   *
   * @type {boolean}
   * @readonly
   * @example
   * if (protocol.canShift) {
   *   await protocol.requestSynthesis('Process this');
   * }
   */
  get canShift() {
    return this.sampling !== null || this.elicitation !== null;
  }

  /**
   * Request synthesis from client (server → client).
   *
   * Uses MCP sampling to ask the client LLM to process something.
   * Returns a Signal with the response.
   *
   * @param {string} prompt - The prompt to send to the client LLM
   * @param {Object} [options={}] - Request options
   * @param {string} [options.systemPrompt] - System prompt to prepend
   * @param {number} [options.maxTokens=4096] - Maximum tokens in response
   * @param {string} [options.includeContext='thisServer'] - Context inclusion level
   * @returns {Promise<Signal>} Signal containing the synthesis response
   * @throws {Error} If sampling capability is not available
   *
   * @example
   * const response = await protocol.requestSynthesis(
   *   'Summarize this document',
   *   { systemPrompt: 'You are a technical writer', maxTokens: 2048 }
   * );
   */
  async requestSynthesis(prompt, options = {}) {
    if (!this.sampling) {
      throw new Error('Sampling capability not available');
    }

    const request = this.tracker.create('synthesis', { prompt });

    const messages = [
      { role: 'user', content: prompt }
    ];

    if (options.systemPrompt) {
      messages.unshift({ role: 'system', content: options.systemPrompt });
    }

    try {
      const response = await this.sampling.createMessage({
        messages,
        maxTokens: options.maxTokens ?? 4096,
        includeContext: options.includeContext ?? 'thisServer'
      });

      this.tracker.resolve(request.id, response);

      return Signal.response(
        response.content?.text ?? response.content,
        response.model ?? 'client',
        1.0,
        { tags: ['synthesis', 'role-shift'] }
      );
    } catch (error) {
      return Signal.error(
        `Synthesis request failed: ${error.message}`,
        'roleshift'
      );
    }
  }

  /**
   * Request clarification from user (server → user via client).
   *
   * Uses MCP elicitation to ask the user for input.
   * Returns a Signal with the user's response.
   *
   * @param {string} question - The question to ask the user
   * @param {Object} [schema=null] - JSON Schema for structured response validation
   * @returns {Promise<Signal>} Signal containing user response (confidence 0 if cancelled)
   * @throws {Error} If elicitation capability is not available
   *
   * @example
   * const response = await protocol.requestClarification(
   *   'Which deployment environment?',
   *   { type: 'string', enum: ['dev', 'staging', 'prod'] }
   * );
   * if (response.confidence > 0) {
   *   console.log('User selected:', response.payload);
   * }
   */
  async requestClarification(question, schema = null) {
    if (!this.elicitation) {
      throw new Error('Elicitation capability not available');
    }

    const request = this.tracker.create('clarification', { question, schema });

    try {
      const response = await this.elicitation.elicit({
        message: question,
        requestedSchema: schema
      });

      this.tracker.resolve(request.id, response);

      if (response.action === 'cancel') {
        return Signal.response(
          null,
          'user',
          0,
          { tags: ['cancelled', 'role-shift'] }
        );
      }

      return Signal.response(
        response.content,
        'user',
        1.0,
        { tags: ['clarification', 'role-shift'] }
      );
    } catch (error) {
      return Signal.error(
        `Clarification request failed: ${error.message}`,
        'roleshift'
      );
    }
  }

  /**
   * Request tool execution via sampling.
   *
   * Asks the client to execute a tool and return results.
   * Useful for delegating tool calls to the client when the server
   * cannot execute them directly.
   *
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} args - Arguments to pass to the tool
   * @param {string} [context=''] - Additional context for the request
   * @returns {Promise<Signal>} Signal containing the tool execution result
   * @throws {Error} If sampling capability is not available
   *
   * @example
   * const result = await protocol.requestToolExecution(
   *   'web_search',
   *   { query: 'latest AI news' },
   *   'Searching for recent developments'
   * );
   */
  async requestToolExecution(toolName, args, context = '') {
    if (!this.sampling) {
      throw new Error('Sampling capability not available');
    }

    const prompt = `Please execute the following tool and return the results:

Tool: ${toolName}
Arguments: ${JSON.stringify(args, null, 2)}

${context ? `Context: ${context}` : ''}

Return only the tool result, no additional commentary.`;

    return this.requestSynthesis(prompt, {
      maxTokens: 2048,
      includeContext: 'allServers'
    });
  }

  /**
   * Request multi-model consensus.
   *
   * Asks multiple models to respond and calculates consensus.
   * Currently uses single-sample method; multi-model requires client support.
   *
   * @param {string} prompt - The prompt to evaluate
   * @param {Array<string>} [models=[]] - Specific models to query (empty = client decides)
   * @returns {Promise<Object>} Consensus result with signals, consensus, confidence, method
   * @throws {Error} If sampling capability is not available
   *
   * @example
   * const result = await protocol.requestConsensus(
   *   'Is this code safe to deploy?',
   *   ['claude-3-opus', 'gpt-4']
   * );
   * console.log(`Consensus: ${result.consensus} (${result.confidence})`);
   */
  async requestConsensus(prompt, models = []) {
    if (!this.sampling) {
      throw new Error('Sampling capability not available');
    }

    // If no specific models, let client decide
    const request = this.tracker.create('consensus', { prompt, models });

    const synthesisPrompt = `Multiple perspectives needed. Please provide your analysis:

${prompt}

Respond with your assessment and confidence level (0-1).`;

    const response = await this.requestSynthesis(synthesisPrompt);

    // Single response for now - multi-model requires client support
    return {
      signals: [response],
      consensus: response.payload,
      confidence: response.confidence,
      method: 'single-sample'
    };
  }

  /**
   * Handle incoming role-shift response for async flows.
   *
   * Resolves a pending request with the received response.
   *
   * @param {string} requestId - The request ID to resolve
   * @param {*} response - The response to associate with the request
   * @returns {Object} The resolved request object
   * @throws {Error} If request ID is not found
   *
   * @example
   * // When receiving async response from client
   * protocol.handleResponse('req_abc123', { result: 'success' });
   */
  handleResponse(requestId, response) {
    return this.tracker.resolve(requestId, response);
  }

  /**
   * Get all pending (unresolved) requests.
   *
   * @returns {Array<Object>} Array of pending request objects
   *
   * @example
   * const pending = protocol.getPendingRequests();
   * console.log(`${pending.length} requests awaiting response`);
   */
  getPendingRequests() {
    return this.tracker.list();
  }

  /**
   * Register a handler for incoming shifted requests.
   *
   * When this server receives a role-shifted request from a client,
   * the registered handler will process it.
   *
   * @param {string} type - Request type to handle ('synthesis'|'clarification'|'tool')
   * @param {Function} handler - Async handler function (payload) => Signal
   *
   * @example
   * protocol.onRequest('synthesis', async (payload) => {
   *   const result = await processLocally(payload.prompt);
   *   return Signal.response(result, 'local', 1.0);
   * });
   */
  onRequest(type, handler) {
    this.handlers.set(type, handler);
  }

  /**
   * Process an incoming shifted request.
   *
   * Routes the request to the registered handler for the given type.
   *
   * @param {string} type - Request type
   * @param {Object} payload - Request payload
   * @returns {Promise<Signal>} Handler response or error signal if no handler
   *
   * @example
   * const response = await protocol.processIncoming('synthesis', {
   *   prompt: 'Analyze this data'
   * });
   */
  async processIncoming(type, payload) {
    const handler = this.handlers.get(type);
    if (!handler) {
      return Signal.error(`No handler for request type: ${type}`, 'roleshift');
    }
    return handler(payload);
  }
}

/**
 * Create a RoleShiftProtocol instance with default configuration.
 *
 * Factory function for convenient protocol instantiation.
 *
 * @param {Object} [options={}] - Protocol options
 * @param {string} [options.mode='server'] - Role mode
 * @param {Object} [options.sampling] - MCP sampling capability
 * @param {Object} [options.elicitation] - MCP elicitation capability
 * @returns {RoleShiftProtocol} New protocol instance
 *
 * @example
 * const protocol = createRoleShift({ mode: RoleMode.PEER });
 */
function createRoleShift(options = {}) {
  return new RoleShiftProtocol(options);
}

/**
 * Self-Connection Handler for Zero Protocol
 *
 * When mode is SELF, messages are routed back to the same instance.
 * This creates the fixed point: f(x) = x
 *
 * @class
 * @example
 * const self = new SelfConnection('my-identity');
 * await self.connect();
 * const response = await self.request('zero/echo', { test: 'data' });
 * // response.from === 'my-identity'
 */
class SelfConnection {
  /**
   * Create a new SelfConnection instance.
   *
   * @param {string} identity - Unique identity for this connection
   */
  constructor(identity) {
    this.identity = identity || crypto.randomUUID();
    this.handlers = new Map();
    this.pendingRequests = new Map();
    this.channel = null;
    this.connected = false;
  }

  /**
   * Connect to self (the fixed point).
   *
   * Uses BroadcastChannel in browser, in-memory queue in Node.js.
   *
   * @returns {Promise<boolean>} True when connected
   */
  async connect() {
    // Use BroadcastChannel if available (browser)
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`zero://self/${this.identity}`);
      this.channel.onmessage = (event) => this._handleMessage(event.data);
    } else {
      // In-memory self-loop for Node.js
      this.channel = {
        postMessage: (msg) => {
          // Use setImmediate to break synchronous recursion
          setImmediate(() => this._handleMessage(msg));
        },
        close: () => {}
      };
    }

    this.connected = true;
    return true;
  }

  /**
   * Disconnect from self.
   */
  async disconnect() {
    if (this.channel && this.channel.close) {
      this.channel.close();
    }
    this.channel = null;
    this.connected = false;
  }

  /**
   * Send a message to self.
   *
   * @param {Object} message - Message to send
   */
  send(message) {
    if (!this.channel) {
      throw new Error('Not connected to self');
    }
    this.channel.postMessage(message);
  }

  /**
   * Send a request to self and await response.
   *
   * This is the self-referential operation: asking yourself a question
   * and answering it creates the fixed point.
   *
   * @param {string} method - Method name
   * @param {Object} params - Method parameters
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<any>} Response result
   */
  async request(method, params, timeoutMs = 30000) {
    const id = crypto.randomUUID();
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Self-request timeout: ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.send(message);
    });
  }

  /**
   * Register a handler for a method.
   *
   * @param {string} method - Method name
   * @param {Function} handler - Handler function
   */
  onMethod(method, handler) {
    this.handlers.set(method, handler);
  }

  /**
   * Handle incoming message (from self).
   *
   * @private
   * @param {Object} message - The message
   */
  async _handleMessage(message) {
    // Handle response
    if (message.result !== undefined || message.error !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // Handle request
    if (message.method) {
      const handler = this.handlers.get(message.method);

      if (handler) {
        try {
          const result = await handler(message.params, { id: message.id, method: message.method });
          this.send({
            jsonrpc: '2.0',
            id: message.id,
            result
          });
        } catch (error) {
          this.send({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32603, message: error.message }
          });
        }
      } else if (message.id !== undefined) {
        // Only send error for requests (not notifications)
        this.send({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: `Method not found: ${message.method}` }
        });
      }
    }
  }

  /**
   * Perform the self-referential handshake.
   *
   * This is the Zero Protocol proof: when challenger and responder
   * are the same entity, the proof verifies itself.
   *
   * @returns {Promise<Object>} Handshake result
   */
  async handshake() {
    // Register handshake handler
    this.onMethod('zero/handshake', async (params) => {
      const proof = crypto
        .createHash('sha256')
        .update(params.challenge + this.identity)
        .digest('hex');

      return {
        proof,
        identity: this.identity,
        fixedPoint: true
      };
    });

    // Create challenge
    const nonce = crypto.randomBytes(32).toString('hex');
    const challenge = crypto
      .createHash('sha256')
      .update(nonce + this.identity)
      .digest('hex');

    // Send challenge to self
    const response = await this.request('zero/handshake', {
      challenge,
      identity: this.identity
    });

    // Verify response
    const expectedProof = crypto
      .createHash('sha256')
      .update(challenge + response.identity)
      .digest('hex');

    if (response.proof !== expectedProof) {
      throw new Error('Self-handshake verification failed');
    }

    // Fixed point achieved: proof(proof) = proof
    return {
      verified: true,
      identity: response.identity,
      fixedPoint: response.fixedPoint,
      isSelf: response.identity === this.identity
    };
  }

  /**
   * Get connection state.
   *
   * @returns {Object} State object
   */
  getState() {
    return {
      identity: this.identity,
      connected: this.connected,
      isSelf: true,
      pendingRequests: this.pendingRequests.size,
      handlers: Array.from(this.handlers.keys())
    };
  }
}

/**
 * Create a self-connected RoleShiftProtocol.
 *
 * Factory function that creates a protocol already in SELF mode
 * with self-connection established.
 *
 * @param {string} identity - Identity for the self-connection
 * @returns {Promise<Object>} Object with protocol and selfConnection
 *
 * @example
 * const { protocol, selfConnection } = await createSelfConnectedProtocol('my-agent');
 * await selfConnection.handshake();
 * // Now at the fixed point
 */
async function createSelfConnectedProtocol(identity) {
  const selfConnection = new SelfConnection(identity);
  await selfConnection.connect();

  const protocol = new RoleShiftProtocol({ mode: RoleMode.SELF });

  // Register self-sampling capability
  protocol.setCapabilities({
    sampling: {
      createMessage: async (options) => {
        // Self-sampling: ask ourselves to process
        const response = await selfConnection.request('zero/synthesize', {
          messages: options.messages,
          maxTokens: options.maxTokens
        });
        return response;
      }
    },
    elicitation: {
      elicit: async (options) => {
        // Self-elicitation: internal reflection
        const response = await selfConnection.request('zero/reflect', {
          message: options.message,
          schema: options.requestedSchema
        });
        return response;
      }
    }
  });

  return { protocol, selfConnection };
}

module.exports = {
  RoleMode,
  RoleShiftProtocol,
  RequestTracker,
  SelfConnection,
  createRoleShift,
  createSelfConnectedProtocol
};
