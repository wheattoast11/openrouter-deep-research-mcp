/**
 * Message Transformer
 *
 * Provides isomorphic transformations between Claude SDK messages and
 * the terminals.tech Signal protocol. Round-trip preserves semantic content.
 *
 * SDK Message ↔ Signal ↔ Token (with provenance tracking)
 *
 * @module core/sdk/messageTransformer
 */

'use strict';

const { Signal, SignalType } = require('../signal');
const { Token, tokenFromSignal, signalFromToken } = require('../rail');

/**
 * SDK Message types (based on Claude Agents SDK patterns)
 */
const SDKMessageType = {
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL_USE: 'tool_use',
  TOOL_RESULT: 'tool_result',
  SYSTEM: 'system',
  SUBAGENT_START: 'subagent_start',
  SUBAGENT_RESULT: 'subagent_result',
  STREAM: 'stream',
  ERROR: 'error'
};

/**
 * Mapping from SDK message types to Signal types
 */
const SDK_TO_SIGNAL_TYPE = {
  [SDKMessageType.USER]: SignalType.QUERY,
  [SDKMessageType.ASSISTANT]: SignalType.RESPONSE,
  [SDKMessageType.TOOL_USE]: SignalType.TEMPLATE,
  [SDKMessageType.TOOL_RESULT]: SignalType.RESPONSE,
  [SDKMessageType.SYSTEM]: SignalType.COMPOSE,
  [SDKMessageType.SUBAGENT_START]: SignalType.COMPOSE,
  [SDKMessageType.SUBAGENT_RESULT]: SignalType.REDUCE,
  [SDKMessageType.STREAM]: SignalType.RESPONSE,
  [SDKMessageType.ERROR]: SignalType.ERROR
};

/**
 * Mapping from Signal types to SDK message types
 */
const SIGNAL_TO_SDK_TYPE = {
  [SignalType.QUERY]: SDKMessageType.USER,
  [SignalType.RESPONSE]: SDKMessageType.ASSISTANT,
  [SignalType.TEMPLATE]: SDKMessageType.TOOL_USE,
  [SignalType.COMPOSE]: SDKMessageType.SUBAGENT_START,
  [SignalType.REDUCE]: SDKMessageType.SUBAGENT_RESULT,
  [SignalType.SUBSTITUTION]: SDKMessageType.TOOL_RESULT,
  [SignalType.ERROR]: SDKMessageType.ERROR,
  [SignalType.CONSENSUS]: SDKMessageType.ASSISTANT,
  [SignalType.CRYSTALLIZATION]: SDKMessageType.ASSISTANT
};

/**
 * Message Transformer
 *
 * Handles bidirectional conversion between SDK and Signal formats.
 * All transformations are designed to be isomorphic (round-trip safe).
 */
class MessageTransformer {
  /**
   * Create a message transformer
   *
   * @param {Object} [options]
   * @param {string} [options.defaultSource='sdk'] - Default source attribution
   * @param {boolean} [options.preserveMetadata=true] - Preserve original metadata in transformations
   */
  constructor(options = {}) {
    this.defaultSource = options.defaultSource || 'sdk';
    this.preserveMetadata = options.preserveMetadata !== false;
  }

  /**
   * Convert SDK message to Signal
   *
   * @param {Object} message - SDK message
   * @param {string} message.type - Message type (user, assistant, tool_use, etc.)
   * @param {string|Object} message.content - Message content
   * @param {Object} [message.metadata] - Additional metadata
   * @returns {Signal}
   */
  toSignal(message) {
    if (!message) {
      throw new Error('Message is required for transformation');
    }

    const signalType = SDK_TO_SIGNAL_TYPE[message.type] || SignalType.RESPONSE;

    // Extract payload from content
    const payload = this._extractPayload(message);

    // Build metadata for Signal
    const metadata = {
      source: message.source || message.model || this.defaultSource,
      confidence: message.confidence ?? 1.0,
      phase: message.phase ?? 0,
      tags: message.tags || []
    };

    // Preserve original SDK metadata if enabled
    if (this.preserveMetadata && message.metadata) {
      metadata.original = message.metadata;
    }

    // Handle specific message types
    if (message.type === SDKMessageType.TOOL_USE) {
      metadata.tags.push('tool_use');
      metadata.toolName = message.name || message.tool_name;
      metadata.toolInput = message.input || message.arguments;
    }

    if (message.type === SDKMessageType.TOOL_RESULT) {
      metadata.tags.push('tool_result');
      metadata.toolName = message.tool_name;
      metadata.toolId = message.tool_use_id;
    }

    if (message.type === SDKMessageType.SUBAGENT_START) {
      metadata.tags.push('subagent');
      metadata.subagentId = message.subagent_id;
      metadata.subagentConfig = message.config;
    }

    const signal = new Signal(signalType, payload, metadata);

    // Preserve original ID if present
    if (message.id) {
      signal.sdkId = message.id;
    }

    return signal;
  }

  /**
   * Convert Signal to SDK message
   *
   * @param {Signal} signal - Signal to convert
   * @returns {Object} SDK message
   */
  fromSignal(signal) {
    if (!signal) {
      throw new Error('Signal is required for transformation');
    }

    const messageType = SIGNAL_TO_SDK_TYPE[signal.type] || SDKMessageType.ASSISTANT;

    // Build base message
    const message = {
      id: signal.sdkId || signal.id,
      type: messageType,
      content: this._buildContent(signal),
      source: signal.source,
      confidence: signal.confidence,
      timestamp: signal.timestamp
    };

    // Handle tool use signals
    if (signal.tags?.includes('tool_use')) {
      message.type = SDKMessageType.TOOL_USE;
      message.name = signal.toolName;
      message.input = signal.toolInput;
    }

    // Handle tool result signals
    if (signal.tags?.includes('tool_result')) {
      message.type = SDKMessageType.TOOL_RESULT;
      message.tool_name = signal.toolName;
      message.tool_use_id = signal.toolId;
    }

    // Handle subagent signals
    if (signal.tags?.includes('subagent')) {
      message.type = signal.type === SignalType.COMPOSE
        ? SDKMessageType.SUBAGENT_START
        : SDKMessageType.SUBAGENT_RESULT;
      message.subagent_id = signal.subagentId;
    }

    // Handle error signals
    if (signal.type === SignalType.ERROR) {
      message.type = SDKMessageType.ERROR;
      message.error = signal.payload?.message || signal.payload;
    }

    // Restore original metadata if present
    if (this.preserveMetadata && signal.original) {
      message.metadata = signal.original;
    }

    return message;
  }

  /**
   * Convert Signal to Token (with provenance tracking)
   *
   * @param {Signal} signal - Signal to convert
   * @param {string} [origin] - Origin identifier for provenance
   * @returns {Token}
   */
  toToken(signal, origin) {
    const token = tokenFromSignal(signal, origin);
    return token;
  }

  /**
   * Convert Token to Signal (preserving lineage)
   *
   * @param {Token} token - Token to convert
   * @returns {Signal}
   */
  fromToken(token) {
    const signal = signalFromToken(token);
    // Attach provenance information
    if (token.trace) {
      signal.provenance = {
        origin: token.origin,
        trace: token.trace
      };
    }
    return signal;
  }

  /**
   * Convert SDK message directly to Token
   *
   * @param {Object} message - SDK message
   * @param {string} [origin] - Origin identifier
   * @returns {Token}
   */
  messageToToken(message, origin) {
    const signal = this.toSignal(message);
    return this.toToken(signal, origin);
  }

  /**
   * Convert Token directly to SDK message
   *
   * @param {Token} token - Token to convert
   * @returns {Object}
   */
  tokenToMessage(token) {
    const signal = this.fromToken(token);
    return this.fromSignal(signal);
  }

  /**
   * Transform a stream of SDK messages to Signals
   *
   * @param {AsyncIterable<Object>} stream - Stream of SDK messages
   * @yields {Signal}
   */
  async *transformStream(stream) {
    for await (const message of stream) {
      yield this.toSignal(message);
    }
  }

  /**
   * Batch transform multiple messages
   *
   * @param {Array<Object>} messages - Array of SDK messages
   * @returns {Array<Signal>}
   */
  transformBatch(messages) {
    return messages.map(msg => this.toSignal(msg));
  }

  /**
   * Check if round-trip transformation preserves content
   *
   * @param {Object} message - Original SDK message
   * @returns {boolean}
   */
  verifyRoundTrip(message) {
    const signal = this.toSignal(message);
    const restored = this.fromSignal(signal);

    // Compare essential fields
    return (
      message.type === restored.type &&
      this._contentEquals(message.content, restored.content)
    );
  }

  /**
   * Extract payload from SDK message content
   *
   * @private
   * @param {Object} message
   * @returns {any}
   */
  _extractPayload(message) {
    const content = message.content;

    // Handle string content
    if (typeof content === 'string') {
      return content;
    }

    // Handle array content (e.g., multiple content blocks)
    if (Array.isArray(content)) {
      // Extract text from content blocks
      const textBlocks = content
        .filter(block => block.type === 'text')
        .map(block => block.text);

      if (textBlocks.length === 1) {
        return textBlocks[0];
      }
      if (textBlocks.length > 1) {
        return textBlocks.join('\n\n');
      }

      // Return full content array if no text blocks
      return content;
    }

    // Handle object content
    if (content && typeof content === 'object') {
      // Check for text field
      if (content.text) {
        return content.text;
      }
      // Return as-is
      return content;
    }

    // Default to message itself
    return message;
  }

  /**
   * Build SDK content from Signal payload
   *
   * @private
   * @param {Signal} signal
   * @returns {string|Array|Object}
   */
  _buildContent(signal) {
    const payload = signal.payload;

    // String payload → string content
    if (typeof payload === 'string') {
      return payload;
    }

    // Object with text → extract text or return as content block
    if (payload && typeof payload === 'object') {
      if (payload.text) {
        return payload.text;
      }
      if (payload.message) {
        return payload.message;
      }
    }

    // Default: serialize as JSON
    return JSON.stringify(payload);
  }

  /**
   * Compare content equality for round-trip verification
   *
   * @private
   * @param {any} a
   * @param {any} b
   * @returns {boolean}
   */
  _contentEquals(a, b) {
    // Fast path for identical refs or primitives
    if (a === b) return true;
    if (typeof a === 'string' && typeof b === 'string') {
      return false; // Already checked a === b above
    }
    // Deep comparison for objects
    return JSON.stringify(a) === JSON.stringify(b);
  }
}

/**
 * Create a message transformer
 *
 * @param {Object} [options]
 * @returns {MessageTransformer}
 */
function createMessageTransformer(options = {}) {
  return new MessageTransformer(options);
}

module.exports = {
  MessageTransformer,
  createMessageTransformer,
  SDKMessageType,
  SDK_TO_SIGNAL_TYPE,
  SIGNAL_TO_SDK_TYPE
};
