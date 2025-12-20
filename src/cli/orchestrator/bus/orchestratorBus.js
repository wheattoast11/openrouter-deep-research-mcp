/**
 * Orchestrator Bus
 *
 * Extends SignalBus with orchestrator-specific functionality.
 * Provides broadcast, routing, response collection, and consensus calculation.
 *
 * @module cli/orchestrator/bus/orchestratorBus
 */

'use strict';

const { EventEmitter } = require('events');
const {
  Signal,
  SignalBus,
  SignalType,
  ConsensusCalculator
} = require('../../../core/signal');

/**
 * Query state for tracking responses
 */
const QueryState = {
  PENDING: 'pending',
  COLLECTING: 'collecting',
  COMPLETE: 'complete',
  TIMEOUT: 'timeout'
};

/**
 * Query tracker for collecting responses
 */
class QueryTracker {
  /**
   * Create query tracker
   *
   * @param {Object} options - Tracker options
   * @param {string} options.queryId - Query identifier
   * @param {Signal} options.query - Original query signal
   * @param {Array<string>} options.targets - Expected respondents
   * @param {number} [options.timeout] - Collection timeout
   * @param {number} [options.minResponses] - Minimum responses needed
   */
  constructor(options) {
    this.queryId = options.queryId;
    this.query = options.query;
    this.targets = new Set(options.targets);
    this.timeout = options.timeout || 30000;
    this.minResponses = options.minResponses || 1;
    this.responses = new Map(); // agentId -> Signal
    this.state = QueryState.PENDING;
    this.createdAt = Date.now();
    this.completedAt = null;
    this.timeoutHandle = null;
    this.resolvers = [];
  }

  /**
   * Add a response
   *
   * @param {string} agentId - Responding agent
   * @param {Signal} signal - Response signal
   * @returns {boolean} True if collection complete
   */
  addResponse(agentId, signal) {
    if (this.state === QueryState.COMPLETE || this.state === QueryState.TIMEOUT) {
      return false;
    }

    this.responses.set(agentId, signal);
    this.state = QueryState.COLLECTING;

    // Check if we have all expected responses
    if (this.responses.size >= this.targets.size) {
      this._complete();
      return true;
    }

    // Check if we have minimum responses
    if (this.responses.size >= this.minResponses) {
      // Could complete early if all high-confidence
      const avgConfidence = this._getAverageConfidence();
      if (avgConfidence > 0.9) {
        this._complete();
        return true;
      }
    }

    return false;
  }

  /**
   * Get average confidence of responses
   * @returns {number}
   * @private
   */
  _getAverageConfidence() {
    if (this.responses.size === 0) return 0;
    let total = 0;
    for (const signal of this.responses.values()) {
      total += signal.confidence;
    }
    return total / this.responses.size;
  }

  /**
   * Mark query as complete
   * @private
   */
  _complete() {
    this.state = QueryState.COMPLETE;
    this.completedAt = Date.now();
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    this._resolve();
  }

  /**
   * Mark query as timed out
   */
  _timeout() {
    if (this.state === QueryState.COMPLETE) return;
    this.state = QueryState.TIMEOUT;
    this.completedAt = Date.now();
    this._resolve();
  }

  /**
   * Resolve waiting promises
   * @private
   */
  _resolve() {
    const result = this.getResult();
    for (const resolver of this.resolvers) {
      resolver(result);
    }
    this.resolvers = [];
  }

  /**
   * Wait for query completion
   *
   * @returns {Promise<Object>}
   */
  async wait() {
    if (this.state === QueryState.COMPLETE || this.state === QueryState.TIMEOUT) {
      return this.getResult();
    }

    return new Promise((resolve) => {
      this.resolvers.push(resolve);

      // Set timeout if not already set
      if (!this.timeoutHandle) {
        this.timeoutHandle = setTimeout(() => this._timeout(), this.timeout);
      }
    });
  }

  /**
   * Get query result
   *
   * @returns {Object}
   */
  getResult() {
    return {
      queryId: this.queryId,
      state: this.state,
      query: this.query,
      responses: Array.from(this.responses.values()),
      respondents: Array.from(this.responses.keys()),
      expectedTargets: Array.from(this.targets),
      responseCount: this.responses.size,
      expectedCount: this.targets.size,
      elapsed: this.completedAt ? this.completedAt - this.createdAt : Date.now() - this.createdAt
    };
  }
}

/**
 * Orchestrator Bus
 *
 * Extended signal bus for multi-agent orchestration.
 * Handles broadcasting, targeted routing, response collection,
 * and consensus calculation.
 *
 * Events:
 * - signal: Any signal received (signal, agentId)
 * - query: Query signal received (queryId, signal, agentId)
 * - response: Response to query received (queryId, signal, agentId)
 * - consensus: Consensus reached (queryId, consensus)
 * - crystallization: Understanding crystallized (queryId, score)
 */
class OrchestratorBus extends EventEmitter {
  /**
   * Create orchestrator bus
   *
   * @param {Object} options - Bus options
   * @param {Object} options.bridge - ZeroBridge instance
   * @param {Object} [options.consensusConfig] - ConsensusCalculator config
   */
  constructor(options) {
    super();
    this.bridge = options.bridge;
    this.signalBus = new SignalBus();
    this.consensusCalculator = new ConsensusCalculator(options.consensusConfig || {});
    this.queries = new Map(); // queryId -> QueryTracker
    this.signalCount = 0;

    this._setupBridgeHandlers();
  }

  /**
   * Set up bridge event handlers
   * @private
   */
  _setupBridgeHandlers() {
    this.bridge.on('message', (message, agentId) => {
      this._handleMessage(message, agentId);
    });

    this.bridge.on('broadcast', (payload, agentId) => {
      this._handleBroadcast(payload, agentId);
    });

    this.bridge.on('jsonrpc', (message, agentId) => {
      this._handleJsonRpc(message, agentId);
    });
  }

  /**
   * Handle incoming message
   *
   * @param {Object} message - Message object
   * @param {string} agentId - Source agent
   * @private
   */
  _handleMessage(message, agentId) {
    // Check if it's a Signal
    if (message.type && Object.values(SignalType).includes(message.type)) {
      const signal = Signal.fromJSON(message);
      this._handleSignal(signal, agentId);
      return;
    }

    // Check for response to query
    if (message.queryId && message.signal) {
      const signal = Signal.fromJSON(message.signal);
      this._handleQueryResponse(message.queryId, signal, agentId);
    }
  }

  /**
   * Handle Signal
   *
   * @param {Signal} signal - Received signal
   * @param {string} agentId - Source agent
   * @private
   */
  _handleSignal(signal, agentId) {
    this.signalCount++;

    // Emit to internal bus
    this.signalBus.emit(signal);

    // Emit event
    this.emit('signal', signal, agentId);

    // Check for crystallization
    const crystallization = signal.crystallization;
    if (crystallization.score > 0.5) {
      this.emit('crystallization', signal.id, crystallization);
    }
  }

  /**
   * Handle query response
   *
   * @param {string} queryId - Query identifier
   * @param {Signal} signal - Response signal
   * @param {string} agentId - Source agent
   * @private
   */
  _handleQueryResponse(queryId, signal, agentId) {
    const tracker = this.queries.get(queryId);
    if (!tracker) {
      return;
    }

    this.emit('response', queryId, signal, agentId);

    const complete = tracker.addResponse(agentId, signal);
    if (complete) {
      this._calculateConsensus(tracker);
    }
  }

  /**
   * Handle broadcast message
   *
   * @param {Object} payload - Broadcast payload
   * @param {string} agentId - Source agent
   * @private
   */
  _handleBroadcast(payload, agentId) {
    if (payload.type && Object.values(SignalType).includes(payload.type)) {
      const signal = Signal.fromJSON(payload);
      this._handleSignal(signal, agentId);
    }
  }

  /**
   * Handle JSON-RPC message
   *
   * @param {Object} message - JSON-RPC message
   * @param {string} agentId - Source agent
   * @private
   */
  _handleJsonRpc(message, agentId) {
    // Check if response to a query
    if (message.id && this.queries.has(message.id)) {
      const signal = Signal.response(
        message.result || message.error,
        agentId,
        message.error ? 0.3 : 0.9
      );
      this._handleQueryResponse(message.id, signal, agentId);
    }
  }

  /**
   * Calculate consensus for completed query
   *
   * @param {QueryTracker} tracker - Query tracker
   * @private
   */
  _calculateConsensus(tracker) {
    const responses = Array.from(tracker.responses.values());
    const consensus = this.consensusCalculator.calculate(responses);

    this.emit('consensus', tracker.queryId, consensus);

    // Clean up
    this.queries.delete(tracker.queryId);
  }

  /**
   * Broadcast a signal to all connected agents
   *
   * @param {Signal} signal - Signal to broadcast
   * @returns {number} Number of agents sent to
   */
  broadcast(signal) {
    return this.bridge.broadcast(signal.toJSON());
  }

  /**
   * Route a signal to a specific agent
   *
   * @param {string} agentId - Target agent
   * @param {Signal} signal - Signal to send
   * @returns {boolean} True if sent
   */
  routeTo(agentId, signal) {
    return this.bridge.send(agentId, signal.toJSON());
  }

  /**
   * Query all connected agents and collect responses
   *
   * @param {string|Object} queryPayload - Query payload (string or object)
   * @param {Object} [options] - Query options
   * @param {number} [options.timeout] - Response timeout
   * @param {number} [options.minResponses] - Minimum responses needed
   * @param {Array<string>} [options.targets] - Specific agents to query
   * @returns {Promise<Object>} Query result with responses
   */
  async collectResponses(queryPayload, options = {}) {
    const targets = options.targets || this.bridge.getConnectedAgents();
    if (targets.length === 0) {
      return {
        queryId: null,
        state: QueryState.COMPLETE,
        responses: [],
        consensus: null
      };
    }

    // Create query signal
    const signal = Signal.query(queryPayload, 'orchestrator');
    const queryId = signal.id;

    // Create tracker
    const tracker = new QueryTracker({
      queryId,
      query: signal,
      targets,
      timeout: options.timeout || 30000,
      minResponses: options.minResponses || Math.ceil(targets.length / 2)
    });
    this.queries.set(queryId, tracker);

    // Broadcast query with query ID
    const message = {
      queryId,
      signal: signal.toJSON()
    };

    if (options.targets) {
      // Send to specific targets
      for (const agentId of targets) {
        this.bridge.send(agentId, message);
      }
    } else {
      // Broadcast to all
      this.bridge.broadcast(message);
    }

    this.emit('query', queryId, signal);

    // Wait for responses
    try {
      const result = await tracker.wait();

      // Calculate consensus
      if (result.responses.length > 0) {
        result.consensus = this.consensusCalculator.calculate(result.responses);
      }

      return result;
    } finally {
      // Always clean up query tracker to prevent memory leaks
      this.queries.delete(queryId);
      if (tracker.destroy) {
        tracker.destroy();
      }
    }
  }

  /**
   * Query agents with crystallization detection
   *
   * @param {string|Object} queryPayload - Query payload
   * @param {Object} [options] - Query options
   * @returns {Promise<Object>} Result with crystallization info
   */
  async queryWithCrystallization(queryPayload, options = {}) {
    const result = await this.collectResponses(queryPayload, options);

    // Analyze crystallization across responses
    const crystallizations = [];
    for (const response of result.responses) {
      const crystal = response.crystallization;
      crystallizations.push(crystal);
    }

    // Calculate aggregate crystallization
    if (crystallizations.length > 0) {
      const avgScore = crystallizations.reduce((sum, c) => sum + c.score, 0) / crystallizations.length;
      const patterns = {};

      for (const crystal of crystallizations) {
        for (const [pattern, data] of Object.entries(crystal.patterns)) {
          if (!patterns[pattern]) {
            patterns[pattern] = { count: 0, present: 0 };
          }
          patterns[pattern].count += data.count;
          if (data.present) patterns[pattern].present++;
        }
      }

      result.crystallization = {
        score: avgScore,
        patterns,
        isUnderstanding: avgScore > 0.6,
        responseCount: crystallizations.length
      };
    }

    return result;
  }

  /**
   * Subscribe to signal type
   *
   * @param {string} type - Signal type
   * @param {Function} handler - Handler function
   * @returns {Function} Unsubscribe function
   */
  on(type, handler) {
    if (Object.values(SignalType).includes(type)) {
      return this.signalBus.on(type, handler);
    }
    EventEmitter.prototype.on.call(this, type, handler);
    return () => this.off(type, handler);
  }

  /**
   * Get signal history
   *
   * @param {Object} [filter] - Filter options
   * @returns {Array<Signal>}
   */
  getHistory(filter) {
    return this.signalBus.getHistory(filter);
  }

  /**
   * Get pending queries
   *
   * @returns {Array<Object>}
   */
  getPendingQueries() {
    const pending = [];
    for (const [queryId, tracker] of this.queries) {
      if (tracker.state === QueryState.PENDING || tracker.state === QueryState.COLLECTING) {
        pending.push(tracker.getResult());
      }
    }
    return pending;
  }

  /**
   * Cancel a pending query
   *
   * @param {string} queryId - Query to cancel
   */
  cancelQuery(queryId) {
    const tracker = this.queries.get(queryId);
    if (tracker) {
      tracker._timeout();
      this.queries.delete(queryId);
    }
  }

  /**
   * Get bus statistics
   *
   * @returns {Object}
   */
  getStats() {
    return {
      signalCount: this.signalCount,
      historySize: this.signalBus.history.length,
      pendingQueries: this.queries.size,
      connectedAgents: this.bridge.getConnectedAgents().length
    };
  }
}

module.exports = {
  OrchestratorBus,
  QueryTracker,
  QueryState
};
