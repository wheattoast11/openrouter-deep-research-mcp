/**
 * Protocol Bridge
 *
 * Translates between Signal protocol and MCP JSON-RPC.
 * Handles sampling requests (SEP-1577) and tool call translation.
 *
 * @module cli/orchestrator/bus/protocolBridge
 */

'use strict';

const { EventEmitter } = require('events');
const { Signal, SignalType } = require('../../../core/signal');

/**
 * JSON-RPC error codes
 */
const JsonRpcError = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603
};

/**
 * MCP message types
 */
const McpMethod = {
  // Tool operations
  TOOLS_LIST: 'tools/list',
  TOOLS_CALL: 'tools/call',

  // Resource operations
  RESOURCES_LIST: 'resources/list',
  RESOURCES_READ: 'resources/read',

  // Sampling (SEP-1577)
  SAMPLING_CREATE_MESSAGE: 'sampling/createMessage',

  // Completion
  COMPLETION_COMPLETE: 'completion/complete',

  // Logging
  LOG_MESSAGE: 'notifications/message'
};

/**
 * Protocol Bridge
 *
 * Bidirectional translation between Signal protocol and MCP JSON-RPC.
 *
 * Events:
 * - signal: Signal created from MCP message (signal, agentId)
 * - rpc: MCP message created from Signal (message, agentId)
 * - toolCall: Tool call detected (toolName, args, agentId)
 * - samplingRequest: Sampling request detected (request, agentId)
 * - error: Translation error (error, message)
 */
class ProtocolBridge extends EventEmitter {
  /**
   * Create protocol bridge
   *
   * @param {Object} options - Bridge options
   * @param {Object} [options.tools] - Available tools map
   * @param {boolean} [options.samplingEnabled] - Enable sampling handling
   */
  constructor(options = {}) {
    super();
    this.tools = options.tools || {};
    this.samplingEnabled = options.samplingEnabled ?? true;
    this.pendingRequests = new Map(); // id -> { resolve, reject, signal }
    this.requestId = 0;
  }

  /**
   * Generate unique request ID
   *
   * @returns {string}
   */
  _nextId() {
    return `rpc-${++this.requestId}-${Date.now()}`;
  }

  /**
   * Convert Signal to MCP JSON-RPC message
   *
   * @param {Signal} signal - Signal to convert
   * @param {Object} [options] - Conversion options
   * @returns {Object} JSON-RPC message
   */
  signalToRpc(signal, options = {}) {
    const id = options.id || this._nextId();

    switch (signal.type) {
      case SignalType.QUERY:
        // Convert query to tool call or sampling request
        if (options.asSampling) {
          return this._createSamplingMessage(signal, id);
        }
        return this._createToolCall(signal, id, options);

      case SignalType.RESPONSE:
        // Convert response to JSON-RPC result
        return {
          jsonrpc: '2.0',
          id: options.requestId || id,
          result: signal.payload
        };

      case SignalType.ERROR:
        // Convert error to JSON-RPC error
        return {
          jsonrpc: '2.0',
          id: options.requestId || id,
          error: {
            code: JsonRpcError.INTERNAL_ERROR,
            message: signal.payload.message || 'Unknown error',
            data: signal.payload
          }
        };

      default:
        // Generic notification
        return {
          jsonrpc: '2.0',
          method: McpMethod.LOG_MESSAGE,
          params: {
            level: 'info',
            data: signal.toJSON()
          }
        };
    }
  }

  /**
   * Create sampling request message
   *
   * @param {Signal} signal - Query signal
   * @param {string} id - Request ID
   * @returns {Object} JSON-RPC sampling message
   * @private
   */
  _createSamplingMessage(signal, id) {
    const content = typeof signal.payload === 'string'
      ? signal.payload
      : JSON.stringify(signal.payload);

    return {
      jsonrpc: '2.0',
      id,
      method: McpMethod.SAMPLING_CREATE_MESSAGE,
      params: {
        messages: [
          { role: 'user', content }
        ],
        maxTokens: 4096,
        includeContext: 'thisServer'
      }
    };
  }

  /**
   * Create tool call message
   *
   * @param {Signal} signal - Query signal
   * @param {string} id - Request ID
   * @param {Object} options - Options
   * @returns {Object} JSON-RPC tool call message
   * @private
   */
  _createToolCall(signal, id, options) {
    const toolName = options.toolName || 'process_query';
    const args = typeof signal.payload === 'object'
      ? signal.payload
      : { query: signal.payload };

    return {
      jsonrpc: '2.0',
      id,
      method: McpMethod.TOOLS_CALL,
      params: {
        name: toolName,
        arguments: args
      }
    };
  }

  /**
   * Convert MCP JSON-RPC message to Signal
   *
   * @param {Object} message - JSON-RPC message
   * @param {string} agentId - Source agent
   * @returns {Signal|null} Converted Signal or null
   */
  rpcToSignal(message, agentId) {
    if (!message || !message.jsonrpc) {
      return null;
    }

    // Handle request (has method)
    if (message.method) {
      return this._requestToSignal(message, agentId);
    }

    // Handle response (has result or error)
    if ('result' in message || 'error' in message) {
      return this._responseToSignal(message, agentId);
    }

    return null;
  }

  /**
   * Convert JSON-RPC request to Signal
   *
   * @param {Object} message - JSON-RPC request
   * @param {string} agentId - Source agent
   * @returns {Signal}
   * @private
   */
  _requestToSignal(message, agentId) {
    const { method, params, id } = message;

    switch (method) {
      case McpMethod.TOOLS_CALL:
        // Tool call is a query
        this.emit('toolCall', params.name, params.arguments, agentId);
        return Signal.query(
          { tool: params.name, arguments: params.arguments },
          agentId,
          { tags: ['tool-call', params.name], phase: 1 }
        );

      case McpMethod.SAMPLING_CREATE_MESSAGE:
        // Sampling request
        this.emit('samplingRequest', params, agentId);
        const content = params.messages?.[0]?.content || '';
        return Signal.query(
          content,
          agentId,
          { tags: ['sampling'], phase: 1 }
        );

      case McpMethod.RESOURCES_READ:
        // Resource read request
        return Signal.query(
          { resource: params.uri },
          agentId,
          { tags: ['resource-read'] }
        );

      default:
        // Generic method call
        return Signal.query(
          { method, params },
          agentId,
          { tags: ['rpc', method] }
        );
    }
  }

  /**
   * Convert JSON-RPC response to Signal
   *
   * @param {Object} message - JSON-RPC response
   * @param {string} agentId - Source agent
   * @returns {Signal}
   * @private
   */
  _responseToSignal(message, agentId) {
    if (message.error) {
      return Signal.error(
        message.error.message || 'RPC Error',
        agentId,
        { tags: ['rpc-error'], phase: 2 }
      );
    }

    // Extract content from MCP tool result format
    let payload = message.result;
    if (message.result?.content) {
      // MCP tool results have content array
      const textContent = message.result.content.find(c => c.type === 'text');
      if (textContent) {
        payload = textContent.text;
      }
    }

    // Estimate confidence based on result structure
    const confidence = this._estimateConfidence(payload);

    return Signal.response(
      payload,
      agentId,
      confidence,
      { tags: ['rpc-response'], phase: 2 }
    );
  }

  /**
   * Estimate confidence for a response
   *
   * @param {*} payload - Response payload
   * @returns {number} Confidence score 0-1
   * @private
   */
  _estimateConfidence(payload) {
    if (!payload) return 0.3;
    if (typeof payload === 'string') {
      // Longer, more detailed responses tend to be higher confidence
      const length = payload.length;
      if (length > 1000) return 0.9;
      if (length > 200) return 0.8;
      if (length > 50) return 0.7;
      return 0.6;
    }
    if (typeof payload === 'object') {
      // Objects with more fields suggest more complete responses
      const fields = Object.keys(payload).length;
      if (fields > 5) return 0.9;
      if (fields > 2) return 0.8;
      return 0.7;
    }
    return 0.5;
  }

  /**
   * Send a Signal as RPC and wait for response
   *
   * @param {Signal} signal - Signal to send
   * @param {Function} sendFn - Function to send the RPC message
   * @param {Object} [options] - Options
   * @param {number} [options.timeout] - Response timeout
   * @returns {Promise<Signal>} Response as Signal
   */
  async sendAndWait(signal, sendFn, options = {}) {
    const timeout = options.timeout || 30000;
    const rpc = this.signalToRpc(signal, options);

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(rpc.id);
        reject(new Error('RPC timeout'));
      }, timeout);

      this.pendingRequests.set(rpc.id, {
        resolve: (responseSignal) => {
          clearTimeout(timeoutHandle);
          this.pendingRequests.delete(rpc.id);
          resolve(responseSignal);
        },
        reject: (error) => {
          clearTimeout(timeoutHandle);
          this.pendingRequests.delete(rpc.id);
          reject(error);
        },
        signal
      });

      sendFn(rpc);
    });
  }

  /**
   * Handle incoming RPC response
   *
   * @param {Object} message - JSON-RPC response
   * @param {string} agentId - Source agent
   * @returns {boolean} True if handled
   */
  handleResponse(message, agentId) {
    if (!message.id || !this.pendingRequests.has(message.id)) {
      return false;
    }

    const pending = this.pendingRequests.get(message.id);
    const signal = this.rpcToSignal(message, agentId);

    if (signal.type === SignalType.ERROR) {
      pending.reject(new Error(signal.payload.message));
    } else {
      pending.resolve(signal);
    }

    return true;
  }

  /**
   * Create JSON-RPC error response
   *
   * @param {string|number} id - Request ID
   * @param {number} code - Error code
   * @param {string} message - Error message
   * @param {*} [data] - Additional data
   * @returns {Object} JSON-RPC error response
   */
  createError(id, code, message, data) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data
      }
    };
  }

  /**
   * Create JSON-RPC success response
   *
   * @param {string|number} id - Request ID
   * @param {*} result - Result value
   * @returns {Object} JSON-RPC response
   */
  createResult(id, result) {
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }

  /**
   * Create MCP-formatted tool result
   *
   * @param {string|number} id - Request ID
   * @param {string} text - Result text
   * @param {boolean} [isError] - Is error result
   * @returns {Object} JSON-RPC response with MCP content format
   */
  createToolResult(id, text, isError = false) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text }],
        isError
      }
    };
  }

  /**
   * Register available tools
   *
   * @param {Object} tools - Tool definitions { name: { description, inputSchema } }
   */
  registerTools(tools) {
    this.tools = { ...this.tools, ...tools };
  }

  /**
   * Create tools/list response
   *
   * @returns {Object} Tools list
   */
  getToolsList() {
    return {
      tools: Object.entries(this.tools).map(([name, def]) => ({
        name,
        description: def.description || '',
        inputSchema: def.inputSchema || { type: 'object', properties: {} }
      }))
    };
  }

  /**
   * Get bridge statistics
   *
   * @returns {Object}
   */
  getStats() {
    return {
      pendingRequests: this.pendingRequests.size,
      registeredTools: Object.keys(this.tools).length,
      samplingEnabled: this.samplingEnabled
    };
  }
}

module.exports = {
  ProtocolBridge,
  McpMethod,
  JsonRpcError
};
