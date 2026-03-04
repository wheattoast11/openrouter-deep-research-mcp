/**
 * Observable Stabilization Protocol (v1.14.1)
 *
 * Provides documented, observable convergence guarantees for multi-model consensus.
 * Monitors signal streams and detects when the system reaches stable consensus.
 *
 * Stabilization States:
 * - UNSTABLE: High variance, no consensus forming
 * - CONVERGING: Variance decreasing, phase lock forming
 * - STABLE: Resonant state with crystallization > threshold
 * - LOCKED: Stable + no new signals changing state
 *
 * @module core/stabilization
 */

'use strict';

const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * Stabilization states
 */
const StabilizationState = {
  UNSTABLE: 'UNSTABLE',
  CONVERGING: 'CONVERGING',
  STABLE: 'STABLE',
  LOCKED: 'LOCKED'
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // Variance threshold for STABLE state
  varianceThreshold: 0.3,
  // Crystallization threshold for STABLE state
  crystallizationThreshold: 0.6,
  // Phase coherence threshold for STABLE state
  phaseCoherenceThreshold: 0.7,
  // Number of consecutive stable signals for LOCKED state
  lockThreshold: 5,
  // Window size for variance calculation
  windowSize: 10,
  // Minimum signals before evaluation
  minSignals: 3,
  // Debounce time for state transitions (ms)
  debounceMs: 100
};

/**
 * StabilizationMetrics - Current state metrics
 *
 * @class
 */
class StabilizationMetrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.variance = 1.0;
    this.crystallization = 0;
    this.phaseCoherence = 0;
    this.signalCount = 0;
    this.consecutiveStable = 0;
    this.lastUpdate = Date.now();
    this.history = [];
  }

  /**
   * Update metrics with new signal data
   *
   * @param {object} data
   * @param {number} data.confidence - Signal confidence
   * @param {number} data.crystallization - Signal crystallization
   * @param {number} data.phase - Signal phase
   */
  update(data) {
    this.signalCount++;
    this.lastUpdate = Date.now();

    // Add to history
    this.history.push({
      confidence: data.confidence,
      crystallization: data.crystallization,
      phase: data.phase,
      timestamp: Date.now()
    });

    // Trim history to window size
    const windowSize = DEFAULT_CONFIG.windowSize;
    if (this.history.length > windowSize) {
      this.history = this.history.slice(-windowSize);
    }

    // Calculate variance from confidence values
    if (this.history.length >= 2) {
      const confidences = this.history.map(h => h.confidence);
      const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      this.variance = confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length;
    }

    // Update crystallization (moving average)
    const crystals = this.history.map(h => h.crystallization);
    this.crystallization = crystals.reduce((a, b) => a + b, 0) / crystals.length;

    // Calculate phase coherence
    this.phaseCoherence = this._calculatePhaseCoherence();
  }

  /**
   * Calculate phase coherence using circular variance
   *
   * @private
   * @returns {number} Phase coherence [0, 1]
   */
  _calculatePhaseCoherence() {
    if (this.history.length < 2) return 0;

    const phases = this.history.map(h => h.phase || 0);

    // Circular mean and variance
    let sumSin = 0;
    let sumCos = 0;

    for (const phase of phases) {
      sumSin += Math.sin(phase);
      sumCos += Math.cos(phase);
    }

    const n = phases.length;
    const meanSin = sumSin / n;
    const meanCos = sumCos / n;

    // R = sqrt(meanSin^2 + meanCos^2) is the mean resultant length
    // R close to 1 = high coherence, R close to 0 = low coherence
    const R = Math.sqrt(meanSin * meanSin + meanCos * meanCos);

    return R;
  }

  /**
   * Export metrics for display
   *
   * @returns {object}
   */
  toJSON() {
    return {
      variance: this.variance,
      crystallization: this.crystallization,
      phaseCoherence: this.phaseCoherence,
      signalCount: this.signalCount,
      consecutiveStable: this.consecutiveStable,
      lastUpdate: this.lastUpdate,
      historySize: this.history.length
    };
  }
}

/**
 * StabilizationMonitor - Monitors signal streams for convergence
 *
 * Emits events on state transitions:
 * - 'state:change' - State transition
 * - 'metrics:update' - Metrics updated
 * - 'locked' - System reached LOCKED state
 *
 * @class
 * @extends EventEmitter
 */
class StabilizationMonitor extends EventEmitter {
  /**
   * @param {object} [options] - Configuration options
   */
  constructor(options = {}) {
    super();

    this.config = { ...DEFAULT_CONFIG, ...options };
    this.metrics = new StabilizationMetrics();
    this.state = StabilizationState.UNSTABLE;
    this.stateHistory = [];
    this._debounceTimer = null;
  }

  /**
   * Process a new signal
   *
   * @param {object} signal - Signal or signal-like object
   * @returns {string} Current state after processing
   */
  process(signal) {
    // Extract metrics from signal
    const data = {
      confidence: signal.confidence ?? 0.5,
      crystallization: signal.crystallization?.score ?? signal.crystallization ?? 0,
      phase: signal.phase ?? signal.calculatePhase?.() ?? 0
    };

    this.metrics.update(data);

    // Debounced state evaluation
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }

    this._debounceTimer = setTimeout(() => {
      this._evaluateState();
    }, this.config.debounceMs);

    this.emit('metrics:update', this.metrics.toJSON());

    return this.state;
  }

  /**
   * Evaluate and potentially transition state
   *
   * @private
   */
  _evaluateState() {
    const metrics = this.metrics;
    const config = this.config;

    // Not enough signals yet
    if (metrics.signalCount < config.minSignals) {
      return;
    }

    const isStable =
      metrics.variance <= config.varianceThreshold &&
      metrics.crystallization >= config.crystallizationThreshold &&
      metrics.phaseCoherence >= config.phaseCoherenceThreshold;

    const previousState = this.state;
    let newState = this.state;

    if (isStable) {
      metrics.consecutiveStable++;

      if (metrics.consecutiveStable >= config.lockThreshold) {
        newState = StabilizationState.LOCKED;
      } else if (this.state !== StabilizationState.LOCKED) {
        newState = StabilizationState.STABLE;
      }
    } else {
      metrics.consecutiveStable = 0;

      // Determine if converging or unstable
      if (metrics.variance <= config.varianceThreshold * 2 ||
          metrics.crystallization >= config.crystallizationThreshold * 0.5) {
        newState = StabilizationState.CONVERGING;
      } else {
        newState = StabilizationState.UNSTABLE;
      }
    }

    if (newState !== previousState) {
      this._transitionState(previousState, newState);
    }
  }

  /**
   * Handle state transition
   *
   * @private
   * @param {string} from
   * @param {string} to
   */
  _transitionState(from, to) {
    this.state = to;

    const transition = {
      from,
      to,
      timestamp: Date.now(),
      metrics: this.metrics.toJSON()
    };

    this.stateHistory.push(transition);

    // Keep last 100 transitions
    if (this.stateHistory.length > 100) {
      this.stateHistory = this.stateHistory.slice(-100);
    }

    this.emit('state:change', transition);

    if (to === StabilizationState.LOCKED) {
      this.emit('locked', this.metrics.toJSON());
    }
  }

  /**
   * Force state evaluation without waiting for debounce
   *
   * @returns {string} Current state
   */
  evaluate() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._evaluateState();
    return this.state;
  }

  /**
   * Reset monitor to initial state
   */
  reset() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this.metrics.reset();
    this.state = StabilizationState.UNSTABLE;
    this.stateHistory = [];
  }

  /**
   * Get current state
   *
   * @returns {string}
   */
  getState() {
    return this.state;
  }

  /**
   * Get current metrics
   *
   * @returns {object}
   */
  getMetrics() {
    return this.metrics.toJSON();
  }

  /**
   * Check if system is stable (STABLE or LOCKED)
   *
   * @returns {boolean}
   */
  isStable() {
    return this.state === StabilizationState.STABLE ||
           this.state === StabilizationState.LOCKED;
  }

  /**
   * Check if system is locked
   *
   * @returns {boolean}
   */
  isLocked() {
    return this.state === StabilizationState.LOCKED;
  }

  /**
   * Get state history
   *
   * @param {number} [limit=10]
   * @returns {Array}
   */
  getHistory(limit = 10) {
    return this.stateHistory.slice(-limit);
  }

  /**
   * Export full state for debugging
   *
   * @returns {object}
   */
  exportState() {
    return {
      state: this.state,
      metrics: this.metrics.toJSON(),
      config: this.config,
      history: this.stateHistory.slice(-10)
    };
  }

  /**
   * Generate coherence dashboard display
   *
   * @returns {object} Dashboard data for CLI rendering
   */
  generateDashboard() {
    const metrics = this.metrics.toJSON();
    const config = this.config;

    // Calculate progress toward stable state
    const varianceProgress = 1 - Math.min(1, metrics.variance / config.varianceThreshold);
    const crystalProgress = Math.min(1, metrics.crystallization / config.crystallizationThreshold);
    const phaseProgress = Math.min(1, metrics.phaseCoherence / config.phaseCoherenceThreshold);
    const overallProgress = (varianceProgress + crystalProgress + phaseProgress) / 3;

    // State indicator
    const stateIndicators = {
      [StabilizationState.UNSTABLE]: { symbol: '~', color: 'red' },
      [StabilizationState.CONVERGING]: { symbol: '>', color: 'yellow' },
      [StabilizationState.STABLE]: { symbol: '*', color: 'green' },
      [StabilizationState.LOCKED]: { symbol: '#', color: 'cyan' }
    };

    const indicator = stateIndicators[this.state] || stateIndicators[StabilizationState.UNSTABLE];

    // IQ constellation representation
    const constellation = this._generateConstellation();

    return {
      state: this.state,
      indicator,
      metrics: {
        variance: {
          value: metrics.variance.toFixed(3),
          threshold: config.varianceThreshold,
          progress: varianceProgress,
          met: metrics.variance <= config.varianceThreshold
        },
        crystallization: {
          value: metrics.crystallization.toFixed(3),
          threshold: config.crystallizationThreshold,
          progress: crystalProgress,
          met: metrics.crystallization >= config.crystallizationThreshold
        },
        phaseCoherence: {
          value: metrics.phaseCoherence.toFixed(3),
          threshold: config.phaseCoherenceThreshold,
          progress: phaseProgress,
          met: metrics.phaseCoherence >= config.phaseCoherenceThreshold
        }
      },
      overallProgress,
      signalCount: metrics.signalCount,
      consecutiveStable: metrics.consecutiveStable,
      lockProgress: Math.min(1, metrics.consecutiveStable / config.lockThreshold),
      constellation,
      isStable: this.isStable(),
      isLocked: this.isLocked()
    };
  }

  /**
   * Generate IQ constellation visualization data
   *
   * @private
   * @returns {object}
   */
  _generateConstellation() {
    const history = this.metrics.history;

    if (history.length === 0) {
      return { points: [], centroid: { x: 0, y: 0 } };
    }

    // Map signals to IQ plane (I = cos(phase), Q = sin(phase))
    // Scale by confidence for radius
    const points = history.map((h, i) => {
      const phase = h.phase || 0;
      const radius = h.confidence;
      return {
        x: Math.cos(phase) * radius,
        y: Math.sin(phase) * radius,
        confidence: h.confidence,
        index: i
      };
    });

    // Calculate centroid
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;

    return {
      points,
      centroid: { x: cx, y: cy },
      spread: Math.sqrt(
        points.reduce((sum, p) =>
          sum + Math.pow(p.x - cx, 2) + Math.pow(p.y - cy, 2), 0
        ) / points.length
      )
    };
  }
}

/**
 * Global stabilization monitor singleton
 */
let _globalMonitor = null;

/**
 * Get or create global stabilization monitor
 *
 * @param {object} [options]
 * @returns {StabilizationMonitor}
 */
function getGlobalMonitor(options) {
  if (!_globalMonitor) {
    _globalMonitor = new StabilizationMonitor(options);
  }
  return _globalMonitor;
}

/**
 * Reset global monitor
 */
function resetGlobalMonitor() {
  if (_globalMonitor) {
    _globalMonitor.reset();
  }
}

/**
 * Quick stabilization check utility
 *
 * @param {Array<object>} signals - Array of signals to check
 * @param {object} [options] - Monitor options
 * @returns {object} Stabilization result
 */
function checkStabilization(signals, options = {}) {
  const monitor = new StabilizationMonitor(options);

  for (const signal of signals) {
    monitor.process(signal);
  }

  monitor.evaluate();

  return {
    state: monitor.getState(),
    metrics: monitor.getMetrics(),
    isStable: monitor.isStable(),
    dashboard: monitor.generateDashboard()
  };
}

module.exports = {
  StabilizationState,
  StabilizationMetrics,
  StabilizationMonitor,
  getGlobalMonitor,
  resetGlobalMonitor,
  checkStabilization,
  DEFAULT_CONFIG
};
