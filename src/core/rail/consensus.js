/**
 * Rail Consensus: Streaming Multi-Model Verification
 *
 * Provides real-time consensus updates during multi-model research,
 * streaming partial results as agreement is calculated.
 *
 * Implements MCP notification: notifications/rail.consensus
 *
 * @module core/rail/consensus
 */

'use strict';

const crypto = require('crypto');
const { Rail, Token, Ok, Err } = require('../rail');

/**
 * Consensus state enum
 */
const ConsensusState = {
  PENDING: 'pending',
  PARTIAL: 'partial',
  CONVERGED: 'converged',
  DIVERGED: 'diverged',
  TIMEOUT: 'timeout'
};

/**
 * StreamingConsensus - Calculates consensus with real-time updates
 */
class StreamingConsensus {
  /**
   * @param {object} [options]
   * @param {number} [options.minAgreement=0.6] - Minimum agreement threshold
   * @param {number} [options.timeoutMs=30000] - Timeout for consensus
   * @param {number} [options.updateIntervalMs=500] - Notification interval
   */
  constructor(options = {}) {
    this.id = crypto.randomUUID();
    this.minAgreement = options.minAgreement ?? 0.6;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.updateIntervalMs = options.updateIntervalMs ?? 500;
    this._signals = [];
    this._rail = Rail.create({ maxBuffer: 50 });
    this._state = ConsensusState.PENDING;
    this._startTime = null;
    this._intervalId = null;
  }

  /**
   * Start the consensus calculation
   * @param {string} progressToken - MCP progress token for notifications
   */
  start(progressToken) {
    this._startTime = Date.now();
    this._progressToken = progressToken;

    this._intervalId = setInterval(() => {
      this._emitUpdate();
    }, this.updateIntervalMs);

    // Set timeout
    setTimeout(() => {
      if (this._state !== ConsensusState.CONVERGED) {
        this._state = ConsensusState.TIMEOUT;
        this._emitUpdate();
        this.stop();
      }
    }, this.timeoutMs);
  }

  /**
   * Add a signal to the consensus calculation
   * @param {object} signal - Signal with source and confidence
   */
  addSignal(signal) {
    this._signals.push({
      source: signal.source,
      confidence: signal.confidence ?? 1.0,
      payload: signal.payload,
      vote: this._extractVote(signal),
      timestamp: Date.now()
    });

    // Check for convergence
    const current = this.calculate();
    if (current.agreement >= this.minAgreement && this._signals.length >= 2) {
      this._state = ConsensusState.CONVERGED;
      this._emitUpdate();
      this.stop();
    } else if (this._signals.length > 0) {
      this._state = ConsensusState.PARTIAL;
    }
  }

  /**
   * Extract vote/position from signal for agreement calculation
   * @private
   */
  _extractVote(signal) {
    // Simple hash-based vote extraction
    const payload = typeof signal.payload === 'string'
      ? signal.payload
      : JSON.stringify(signal.payload);

    // Extract key phrases or use first 100 chars as vote signature
    return payload.slice(0, 100).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Calculate current consensus
   * @returns {{ agreement: number, signals: Array, state: string }}
   */
  calculate() {
    if (this._signals.length === 0) {
      return { agreement: 0, signals: [], state: this._state };
    }

    // Group by vote similarity
    const votes = new Map();
    for (const sig of this._signals) {
      const existing = votes.get(sig.vote);
      if (existing) {
        existing.count++;
        existing.totalConfidence += sig.confidence;
        existing.sources.push(sig.source);
      } else {
        votes.set(sig.vote, {
          count: 1,
          totalConfidence: sig.confidence,
          sources: [sig.source]
        });
      }
    }

    // Find majority vote
    let maxVote = null;
    let maxCount = 0;
    for (const [vote, data] of votes) {
      if (data.count > maxCount) {
        maxCount = data.count;
        maxVote = { vote, ...data };
      }
    }

    const agreement = maxCount / this._signals.length;
    const avgConfidence = maxVote
      ? maxVote.totalConfidence / maxVote.count
      : 0;

    return {
      agreement,
      confidence: avgConfidence,
      majority: maxVote,
      state: this._state,
      signalCount: this._signals.length,
      elapsed: Date.now() - (this._startTime || Date.now())
    };
  }

  /**
   * Emit consensus update notification
   * @private
   */
  _emitUpdate() {
    const current = this.calculate();
    const token = Token.from({
      progressToken: this._progressToken,
      state: this._state,
      signals: this._signals.map(s => ({
        source: s.source,
        confidence: s.confidence,
        vote: s.vote.slice(0, 50) + '...'
      })),
      currentConsensus: current.agreement,
      confidence: current.confidence,
      complete: this._state === ConsensusState.CONVERGED ||
                this._state === ConsensusState.TIMEOUT,
      elapsed: current.elapsed
    }, 'consensus');

    this._rail.send(token);
  }

  /**
   * Get update stream
   * @returns {AsyncIterator<Token>}
   */
  updates() {
    return this._rail.receive();
  }

  /**
   * Stop the consensus calculation
   */
  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  /**
   * Get final result
   * @returns {object}
   */
  getResult() {
    return {
      ...this.calculate(),
      signals: this._signals,
      duration: Date.now() - (this._startTime || Date.now())
    };
  }
}

/**
 * ConsensusManager - Manages multiple consensus sessions
 */
class ConsensusManager {
  constructor() {
    this._sessions = new Map();
  }

  /**
   * Create a new consensus session
   * @param {object} options - Consensus options
   * @returns {StreamingConsensus}
   */
  create(options = {}) {
    const session = new StreamingConsensus(options);
    this._sessions.set(session.id, session);
    return session;
  }

  /**
   * Get session by ID
   * @param {string} id
   * @returns {StreamingConsensus|null}
   */
  get(id) {
    return this._sessions.get(id) || null;
  }

  /**
   * End and remove session
   * @param {string} id
   */
  end(id) {
    const session = this._sessions.get(id);
    if (session) {
      session.stop();
      this._sessions.delete(id);
    }
  }

  /**
   * List active sessions
   * @returns {Array}
   */
  list() {
    return Array.from(this._sessions.values()).map(s => ({
      id: s.id,
      state: s._state,
      signalCount: s._signals.length
    }));
  }
}

// Singleton manager
const manager = new ConsensusManager();

module.exports = {
  ConsensusState,
  StreamingConsensus,
  ConsensusManager,
  manager,
  // MCP notification name
  NOTIFICATION_TYPE: 'notifications/rail.consensus'
};
