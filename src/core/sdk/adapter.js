/**
 * SDK Adapter
 *
 * Main entry point for Claude Agents SDK integration.
 * Bridges SDK patterns to terminals.tech native abstractions (Signal/Rail/HVM).
 *
 * Data Flow:
 * SDK query() → SDKAdapter → Signal.query() → ZeroAgent.execute()
 *                                              ↓
 *                              HVM combinator trace → logit bias
 *                                              ↓
 *                              CognitiveRouter → OpenRouter API
 *                                              ↓
 *                              Rail/Token provenance tracking
 *                                              ↓
 *                              MessageTransformer → SDK response
 *
 * @module core/sdk/adapter
 */

'use strict';

const { EventEmitter } = require('events');
const { Signal, SignalType, SignalBus, ConsensusCalculator } = require('../signal');
const { MessageTransformer, SDKMessageType } = require('./messageTransformer');

/**
 * SDK Adapter Configuration
 */
const DEFAULTS = {
  defaultModel: 'anthropic/claude-sonnet-4',
  maxTokens: 4096,
  temperature: 0.7,
  streamEnabled: true,
  hvmEnabled: true,
  consensusEnabled: true,
  minConsensusAgreement: 0.6
};

/**
 * SDK Session state
 */
class SDKSession {
  constructor(sessionId, config = {}) {
    this.id = sessionId;
    this.config = config;
    this.messages = [];
    this.signals = [];
    this.startTime = Date.now();
    this.lastActivity = Date.now();
    this.metadata = {};
  }

  addMessage(message) {
    this.messages.push({
      ...message,
      timestamp: Date.now()
    });
    this.lastActivity = Date.now();
  }

  addSignal(signal) {
    this.signals.push(signal);
    this.lastActivity = Date.now();
  }

  getState() {
    return {
      id: this.id,
      messageCount: this.messages.length,
      signalCount: this.signals.length,
      duration: Date.now() - this.startTime,
      lastActivity: this.lastActivity,
      config: this.config,
      metadata: this.metadata
    };
  }
}

/**
 * SDK Adapter
 *
 * Bridges Claude Agents SDK patterns to the terminals.tech architecture.
 */
class SDKAdapter extends EventEmitter {
  /**
   * Create an SDK adapter
   *
   * @param {Object} options
   * @param {Object} options.cognitiveRouter - CognitiveRouter instance for model routing
   * @param {SignalBus} [options.signalBus] - Signal bus for inter-agent communication
   * @param {Object} [options.toolRegistry] - Tool registry for SDK tool integration
   * @param {Object} [options.hvmClient] - HVM client for combinator-based steering
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();

    this.cognitiveRouter = options.cognitiveRouter;
    this.signalBus = options.signalBus || new SignalBus();
    this.toolRegistry = options.toolRegistry || new Map();
    this.hvmClient = options.hvmClient || null;
    this.logger = options.logger || console;

    // Configuration
    this.config = { ...DEFAULTS, ...options.config };

    // Message transformer for SDK ↔ Signal conversion
    this.transformer = new MessageTransformer({
      defaultSource: 'sdk-adapter',
      preserveMetadata: true
    });

    // Consensus calculator for multi-model responses
    this.consensusCalculator = new ConsensusCalculator({
      minAgreement: this.config.minConsensusAgreement
    });

    // Active sessions
    this.sessions = new Map();

    // Request tracking
    this.requestCount = 0;
  }

  /**
   * Execute an SDK-style query
   *
   * @param {string} prompt - The prompt to process
   * @param {Object} [options] - Query options
   * @param {string} [options.model] - Model to use
   * @param {number} [options.maxTokens] - Maximum tokens
   * @param {string} [options.sessionId] - Session ID
   * @param {Object} [options.hvmContext] - HVM context for steering
   * @yields {Object} SDK message chunks
   */
  async *query(prompt, options = {}) {
    this.requestCount++;
    const requestId = `sdk-${this.requestCount}-${Date.now()}`;

    const {
      model = this.config.defaultModel,
      maxTokens = this.config.maxTokens,
      sessionId = 'default',
      hvmContext = null,
      stream = this.config.streamEnabled
    } = options;

    // Get or create session
    const session = this._getOrCreateSession(sessionId, options);

    // Create query signal
    const querySignal = Signal.query(prompt, 'sdk-user', {
      tags: ['sdk', 'query'],
      phase: 0
    });

    session.addSignal(querySignal);
    this.signalBus.publish(querySignal);
    this.emit('query-start', { requestId, prompt, sessionId });

    try {
      // Apply HVM steering if available
      let logitBias = {};
      if (this.config.hvmEnabled && this.hvmClient && hvmContext) {
        logitBias = this.hvmClient.hvmToLogitBias(hvmContext);
        this.emit('hvm-applied', { requestId, bias: logitBias });
      }

      // Route through cognitive router
      if (!this.cognitiveRouter) {
        throw new Error('CognitiveRouter not available');
      }

      // Create SDK-style user message
      const userMessage = {
        type: SDKMessageType.USER,
        content: prompt
      };
      session.addMessage(userMessage);

      // Execute the query through the router
      const routerResult = await this.cognitiveRouter.route({
        messages: session.messages,
        model,
        maxTokens,
        logitBias,
        stream
      });

      // Handle streaming response
      if (stream && routerResult[Symbol.asyncIterator]) {
        let fullContent = '';

        for await (const chunk of routerResult) {
          // Convert chunk to SDK message format
          const sdkChunk = {
            type: SDKMessageType.STREAM,
            content: chunk.content || chunk.delta?.content || '',
            model: chunk.model,
            metadata: {
              finish_reason: chunk.finish_reason,
              usage: chunk.usage
            }
          };

          fullContent += sdkChunk.content;
          yield sdkChunk;

          // Create signal for tracking
          const chunkSignal = this.toSignal(sdkChunk);
          this.signalBus.publish(chunkSignal);
        }

        // Create final assistant message
        const assistantMessage = {
          type: SDKMessageType.ASSISTANT,
          content: fullContent,
          model,
          confidence: 1.0
        };
        session.addMessage(assistantMessage);

        // Create response signal
        const responseSignal = Signal.response(fullContent, model, 1.0, {
          tags: ['sdk', 'response', 'complete']
        });
        session.addSignal(responseSignal);

      } else {
        // Handle non-streaming response
        const content = routerResult.content || routerResult.message?.content || routerResult;

        const assistantMessage = {
          type: SDKMessageType.ASSISTANT,
          content,
          model,
          confidence: 1.0
        };
        session.addMessage(assistantMessage);

        const responseSignal = Signal.response(content, model, 1.0, {
          tags: ['sdk', 'response']
        });
        session.addSignal(responseSignal);

        yield assistantMessage;
      }

      this.emit('query-complete', { requestId, sessionId });

    } catch (error) {
      this.logger.error?.('SDK query failed', { requestId, error: error.message });

      const errorMessage = {
        type: SDKMessageType.ERROR,
        error: error.message,
        code: error.code || 'SDK_ERROR'
      };
      yield errorMessage;

      const errorSignal = Signal.error(error.message, 'sdk-adapter');
      session.addSignal(errorSignal);
      this.signalBus.publish(errorSignal);

      this.emit('query-error', { requestId, error });
    }
  }

  /**
   * Create a new SDK session
   *
   * @param {Object} config - Session configuration
   * @param {string} [config.id] - Session ID (auto-generated if not provided)
   * @param {Object} [config.metadata] - Session metadata
   * @returns {SDKSession}
   */
  createSession(config = {}) {
    const sessionId = config.id || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = new SDKSession(sessionId, config);

    if (config.metadata) {
      session.metadata = config.metadata;
    }

    this.sessions.set(sessionId, session);
    this.emit('session-created', { sessionId });

    return session;
  }

  /**
   * Get session by ID
   *
   * @param {string} sessionId
   * @returns {SDKSession|null}
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Convert SDK message to Signal
   *
   * @param {Object} message - SDK message
   * @returns {Signal}
   */
  toSignal(message) {
    return this.transformer.toSignal(message);
  }

  /**
   * Convert Signal to SDK message
   *
   * @param {Signal} signal
   * @returns {Object}
   */
  fromSignal(signal) {
    return this.transformer.fromSignal(signal);
  }

  /**
   * Create a subagent with HVM context
   *
   * @param {Object} config - Subagent configuration
   * @param {string} config.description - What the subagent should do
   * @param {string} [config.model] - Model to use
   * @param {Object} [config.hvmContext] - HVM context for steering
   * @returns {Object} Subagent instance
   */
  createSubagent(config, hvmContext = null) {
    const subagentId = `subagent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // If HVM is enabled, compute logit bias from context
    let logitBias = {};
    if (this.config.hvmEnabled && this.hvmClient && hvmContext) {
      logitBias = this.hvmClient.hvmToLogitBias(hvmContext);
    }

    const subagent = {
      id: subagentId,
      description: config.description,
      model: config.model || this.config.defaultModel,
      logitBias,
      hvmContext,
      created: Date.now(),

      // Execute the subagent's task
      execute: async (input) => {
        const results = [];
        for await (const chunk of this.query(input, {
          model: subagent.model,
          hvmContext: subagent.hvmContext,
          sessionId: subagentId
        })) {
          results.push(chunk);
        }
        return results;
      }
    };

    this.emit('subagent-created', { subagentId, config });
    return subagent;
  }

  /**
   * Calculate consensus from multiple signals
   *
   * @param {Array<Signal>} signals
   * @returns {Object}
   */
  calculateConsensus(signals) {
    if (!this.config.consensusEnabled) {
      return null;
    }
    return this.consensusCalculator.calculate(signals);
  }

  /**
   * Register an SDK tool
   *
   * @param {string} name - Tool name
   * @param {Object} schema - Zod schema for tool input
   * @param {Function} handler - Tool handler function
   */
  registerTool(name, schema, handler) {
    this.toolRegistry.set(name, { name, schema, handler });
    this.emit('tool-registered', { name });
  }

  /**
   * Get adapter state
   *
   * @returns {Object}
   */
  getState() {
    return {
      requestCount: this.requestCount,
      sessionCount: this.sessions.size,
      toolCount: this.toolRegistry.size,
      config: this.config,
      hvmEnabled: this.config.hvmEnabled && !!this.hvmClient,
      consensusEnabled: this.config.consensusEnabled
    };
  }

  /**
   * Get or create a session
   *
   * @private
   * @param {string} sessionId
   * @param {Object} options
   * @returns {SDKSession}
   */
  _getOrCreateSession(sessionId, options) {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createSession({ id: sessionId, ...options });
    }
    return session;
  }

  /**
   * Cleanup adapter resources
   */
  destroy() {
    this.sessions.clear();
    this.toolRegistry.clear();
    this.removeAllListeners();
  }
}

/**
 * Create an SDK adapter
 *
 * @param {Object} options
 * @returns {SDKAdapter}
 */
function createSDKAdapter(options = {}) {
  return new SDKAdapter(options);
}

module.exports = {
  SDKAdapter,
  SDKSession,
  createSDKAdapter,
  DEFAULTS
};
