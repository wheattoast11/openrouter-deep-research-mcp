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
  PEER: 'peer'         // Symmetric: either can initiate
};

/**
 * Pending request tracker
 */
class RequestTracker {
  constructor() {
    this.pending = new Map();
    this.timeout = 60000; // 1 minute default
  }

  /**
   * Create a pending request
   */
  create(type, context = {}) {
    const id = `req_${crypto.randomUUID().slice(0, 8)}`;
    const request = {
      id,
      type,
      context,
      createdAt: Date.now(),
      resolved: false,
      result: null
    };
    this.pending.set(id, request);

    // Auto-cleanup after timeout
    setTimeout(() => {
      if (this.pending.has(id) && !this.pending.get(id).resolved) {
        this.pending.delete(id);
      }
    }, this.timeout);

    return request;
  }

  /**
   * Resolve a pending request
   */
  resolve(id, result) {
    const request = this.pending.get(id);
    if (!request) {
      throw new Error(`Request not found: ${id}`);
    }
    request.resolved = true;
    request.result = result;
    request.resolvedAt = Date.now();
    return request;
  }

  /**
   * Get pending request
   */
  get(id) {
    return this.pending.get(id);
  }

  /**
   * List pending requests
   */
  list() {
    return Array.from(this.pending.values()).filter(r => !r.resolved);
  }
}

/**
 * RoleShift Protocol Handler
 */
class RoleShiftProtocol {
  constructor(options = {}) {
    this.mode = options.mode ?? RoleMode.SERVER;
    this.sampling = options.sampling ?? null;     // MCP sampling capability
    this.elicitation = options.elicitation ?? null; // MCP elicitation capability
    this.tracker = new RequestTracker();
    this.handlers = new Map();
  }

  /**
   * Set MCP capabilities (called when server initializes)
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
   * Check if role shift is available
   */
  get canShift() {
    return this.sampling !== null || this.elicitation !== null;
  }

  /**
   * Request synthesis from client (server → client)
   *
   * Uses MCP sampling to ask the client LLM to process something.
   * Returns a Signal with the response.
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
   * Request clarification from user (server → user via client)
   *
   * Uses MCP elicitation to ask the user for input.
   * Returns the user's response.
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
   * Request tool execution via sampling
   *
   * Asks the client to execute a tool and return results.
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
   * Request multi-model consensus
   *
   * Asks multiple models to respond and calculates consensus.
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
   * Handle incoming role-shift response (for async flows)
   */
  handleResponse(requestId, response) {
    return this.tracker.resolve(requestId, response);
  }

  /**
   * Get pending requests
   */
  getPendingRequests() {
    return this.tracker.list();
  }

  /**
   * Register a handler for incoming shifted requests
   */
  onRequest(type, handler) {
    this.handlers.set(type, handler);
  }

  /**
   * Process an incoming shifted request
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
 * Create protocol instance with default configuration
 */
function createRoleShift(options = {}) {
  return new RoleShiftProtocol(options);
}

module.exports = {
  RoleMode,
  RoleShiftProtocol,
  RequestTracker,
  createRoleShift
};
