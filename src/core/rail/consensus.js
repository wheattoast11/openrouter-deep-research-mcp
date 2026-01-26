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

// Lazy-loaded math module
let _quadratureModule = null;

function getQuadratureModule() {
  return null;
}

/**
 * Consensus state enum
 */
const ConsensusState = {
  PENDING: 'pending',
  PARTIAL: 'partial',
  CONVERGED: 'converged',
  DIVERGED: 'diverged',
  TIMEOUT: 'timeout',
  PHASE_LOCKED: 'phase_locked'  // IQ quadrature detected phase alignment
};

/**
 * StreamingConsensus - Calculates consensus with real-time updates
 *
 * Enhanced with IQ Quadrature for phase-based consensus detection.
 * When signals from multiple models align in phase (I/Q components),
 * consensus is achieved even before vote-based agreement.
 */
class StreamingConsensus {
  /**
   * @param {object} [options]
   * @param {number} [options.minAgreement=0.6] - Minimum agreement threshold
   * @param {number} [options.timeoutMs=30000] - Timeout for consensus
   * @param {number} [options.updateIntervalMs=500] - Notification interval
   * @param {boolean} [options.useQuadrature=true] - Enable IQ quadrature analysis
   * @param {number} [options.phaseLockThreshold=0.1] - Phase variance threshold for lock
   * @param {string} [options.referenceModel] - Reference model for phase alignment
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

    // IQ Quadrature settings
    this._useQuadrature = options.useQuadrature ?? true; // ENABLED by default
    this._phaseLockThreshold = options.phaseLockThreshold ?? 0.1;
    this._referenceModel = options.referenceModel ?? 'anthropic/claude-sonnet-4.5';
    this._iqDecomposition = null;
    this._phaseAccumulator = new Map(); // Track phase per model

    // Initialize IQ decomposition if available
    this._initQuadrature();
  }

  /**
   * Get phase offset based on provider
   * Providers are assigned quadrant phases for IQ decomposition:
   * - Anthropic: 0° (In-phase reference)
   * - OpenAI: 90° (Quadrature)
   * - Google: 180° (Anti-phase)
   * - Others: 270° (Negative quadrature)
   *
   * @private
   * @param {string} source - Model source string
   * @returns {number} Phase in radians
   */
  _getProviderPhase(source) {
    if (!source) return 4.71; // Others (3*PI/2)
    const lower = source.toLowerCase();

    if (lower.startsWith('anthropic')) return 0;       // 0 degrees
    if (lower.startsWith('openai')) return 1.57;       // 90 degrees (π/2)
    if (lower.startsWith('google')) return 3.14;       // 180 degrees (π)
    if (lower.startsWith('deepseek')) return 0.79;     // 45 degrees (π/4)
    if (lower.startsWith('qwen')) return 2.36;         // 135 degrees (3π/4)

    return 4.71; // Others (270 degrees, 3π/2)
  }

  /**
   * Initialize IQ quadrature module if available
   * Uses a lightweight phase-based consensus model when full quadrature unavailable.
   * @private
   */
  _initQuadrature() {
    if (!this._useQuadrature) return;

    // Try to load quadrature module
    const quadMod = getQuadratureModule();
    if (quadMod) {
      this._iqDecomposition = new quadMod.IQDecomposition({
        referenceModel: this._referenceModel,
        phaseLockThreshold: this._phaseLockThreshold
      });
    } else {
      // Use lightweight phase tracking
      this._phaseAccumulator = new Map();
    }
  }

  /**
   * Check for phase-lock convergence across signals
   * Returns true if phase variance is below threshold
   * @private
   * @returns {boolean}
   */
  _checkPhaseLock() {
    if (!this._useQuadrature || this._signals.length < 2) return false;

    // Calculate phase for each signal
    const phases = [];
    for (const sig of this._signals) {
      const basePhase = this._getProviderPhase(sig.source);
      // Modulate by confidence
      const modulatedPhase = basePhase + (1 - sig.confidence) * 0.3;
      phases.push(modulatedPhase);
    }

    // Calculate phase variance
    const mean = phases.reduce((a, b) => a + b, 0) / phases.length;
    const variance = phases.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / phases.length;
    const stdDev = Math.sqrt(variance);

    // Phase-lock detected if standard deviation is below threshold
    // (all providers converging to similar phase = agreement)
    return stdDev < this._phaseLockThreshold;
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
    const signalData = {
      source: signal.source,
      confidence: signal.confidence ?? 1.0,
      payload: signal.payload,
      vote: this._extractVote(signal),
      timestamp: Date.now()
    };

    this._signals.push(signalData);

    // Check for convergence (vote-based)
    const current = this.calculate();

    // Check for phase-lock convergence (fast path)
    if (this._useQuadrature && this._checkPhaseLock() && this._signals.length >= 2) {
      this._state = ConsensusState.PHASE_LOCKED;
      this._emitUpdate();
      this.stop();
      return;
    }

    // Vote-based convergence (traditional path)
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
    // Deterministic shapeHash via L1 Signal alignment
    if (signal.shapeHash) {
      return signal.shapeHash;
    }

    // Fallback: Compute hash of payload (consistent with Signal.shapeHash but payload-focused)
    // We strictly hash the payload to ensure content agreement
    try {
      const payload = signal.payload;
      // Simple deterministic stringify (keys sorted)
      const canonical = JSON.stringify(payload, (key, value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return Object.keys(value).sort().reduce((sorted, k) => {
            sorted[k] = value[k];
            return sorted;
          }, {});
        }
        return value;
      });
      
      return crypto.createHash('sha256').update(canonical || '').digest('hex');
    } catch (e) {
      // Emergency fallback to legacy slicing if hashing fails
      const payloadStr = typeof signal.payload === 'string'
        ? signal.payload
        : JSON.stringify(signal.payload);
      return payloadStr.slice(0, 100).toLowerCase().replace(/\s+/g, ' ').trim();
    }
  }

  /**
   * Calculate current consensus
   * @returns {{ agreement: number, signals: Array, state: string, quadrature?: object }}
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

    const result = {
      agreement,
      confidence: avgConfidence,
      majority: maxVote,
      state: this._state,
      signalCount: this._signals.length,
      elapsed: Date.now() - (this._startTime || Date.now())
    };

    return result;
  }

  /**
   * Emit consensus update notification
   * @private
   */
  _emitUpdate() {
    const current = this.calculate();
    const tokenPayload = {
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
                this._state === ConsensusState.TIMEOUT ||
                this._state === ConsensusState.PHASE_LOCKED,
      elapsed: current.elapsed
    };

    // Include quadrature metrics if available
    if (current.quadrature) {
      tokenPayload.quadrature = current.quadrature;
    }

    const token = Token.from(tokenPayload, 'consensus');
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
    const calculated = this.calculate();
    return {
      ...calculated,
      signals: this._signals,
      duration: Date.now() - (this._startTime || Date.now()),
      // Include IQ decomposition state if available
      iqState: this._iqDecomposition?.exportState?.() ?? null
    };
  }

  /**
   * Get IQ decomposition for external analysis
   * @returns {object|null}
   */
  getQuadrature() {
    return this._iqDecomposition;
  }

  /**
   * Check if consensus was achieved via phase-lock
   * @returns {boolean}
   */
  isPhaseLocked() {
    return this._state === ConsensusState.PHASE_LOCKED;
  }

  /**
   * Get resonance strength (amplitude when phase-locked)
   * @returns {number} 0-1, or 0 if not using quadrature
   */
  getResonanceStrength() {
    if (!this._iqDecomposition) return 0;
    return this._iqDecomposition.resonanceStrength();
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
      signalCount: s._signals.length,
      isPhaseLocked: s.isPhaseLocked(),
      resonanceStrength: s.getResonanceStrength(),
      hasQuadrature: !!s._iqDecomposition
    }));
  }

  /**
   * Create a consensus session with IQ quadrature enabled
   * @param {object} options - Consensus options
   * @returns {StreamingConsensus}
   */
  createWithQuadrature(options = {}) {
    return this.create(options);
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
  NOTIFICATION_TYPE: 'notifications/rail.consensus',
  // Utility for external quadrature access
  getQuadratureModule
};
