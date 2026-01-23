/**
 * Resonance Detection
 *
 * Detects phase coherence in multi-model signal streams.
 * Resonance occurs when models converge on similar conclusions,
 * creating "constructive interference" in the consensus.
 *
 * Uses IQ quadrature and crystallization scoring for detection.
 *
 * @module core/resonance
 */

'use strict';

const { EventEmitter } = require('events');
const { IQDecomposition, quickPhaseLock } = require('./math/quadrature');
const { extractCrystallization } = require('./signal');

/**
 * Resonance state
 */
const ResonanceState = {
  SILENT: 'silent',           // No signals
  BUILDING: 'building',       // Collecting signals
  PHASE_LOCK: 'phase_lock',   // Phase variance low
  RESONANT: 'resonant',       // Full resonance detected
  DIVERGENT: 'divergent'      // Models disagree
};

/**
 * Resonance event
 */
class ResonanceEvent {
  /**
   * @param {string} state
   * @param {object} metrics
   */
  constructor(state, metrics = {}) {
    this.id = require('crypto').randomUUID();
    this.state = state;
    this.timestamp = Date.now();
    this.metrics = metrics;
  }

  toJSON() {
    return {
      id: this.id,
      state: this.state,
      timestamp: this.timestamp,
      metrics: this.metrics
    };
  }
}

/**
 * Resonance Detector - monitors signal streams for convergence
 *
 * @class
 * @extends EventEmitter
 */
class ResonanceDetector extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {number} [options.windowSize=10] - Number of signals in analysis window
   * @param {number} [options.phaseThreshold=0.7] - Phase coherence threshold
   * @param {number} [options.crystallizationThreshold=0.5] - Crystallization score threshold
   * @param {number} [options.minSignals=3] - Minimum signals for detection
   */
  constructor(options = {}) {
    super();
    this.windowSize = options.windowSize ?? 10;
    this.phaseThreshold = options.phaseThreshold ?? 0.7;
    this.crystallizationThreshold = options.crystallizationThreshold ?? 0.5;
    this.minSignals = options.minSignals ?? 3;

    this._window = [];
    this._state = ResonanceState.SILENT;
    this._lastResonance = null;
    this._events = [];
    this._iq = new IQDecomposition({ phaseLockThreshold: 1 - this.phaseThreshold });

    this._stats = {
      signalsProcessed: 0,
      resonanceEvents: 0,
      phaseLocks: 0
    };
  }

  /**
   * Add a signal to the detector
   *
   * @param {object} signal - Signal with source, confidence, and payload
   * @returns {ResonanceEvent | null}
   */
  addSignal(signal) {
    this._stats.signalsProcessed++;

    // Add to window
    this._window.push({
      ...signal,
      timestamp: signal.timestamp || Date.now()
    });

    // Trim to window size
    while (this._window.length > this.windowSize) {
      this._window.shift();
    }

    // Add to IQ decomposition
    this._iq.addSignal(signal);
    if (this._iq.samples.length > this.windowSize) {
      this._iq.samples.shift();
    }

    // Detect resonance
    const event = this._detectResonance();
    if (event) {
      this._events.push(event);
      this.emit('resonance', event);
    }

    return event;
  }

  /**
   * Detect resonance based on current window
   *
   * @private
   * @returns {ResonanceEvent | null}
   */
  _detectResonance() {
    if (this._window.length < this.minSignals) {
      if (this._state !== ResonanceState.BUILDING && this._window.length > 0) {
        this._state = ResonanceState.BUILDING;
        return new ResonanceEvent(ResonanceState.BUILDING, {
          signalCount: this._window.length,
          required: this.minSignals
        });
      }
      return null;
    }

    // Calculate metrics
    const { locked, variance } = this._iq.detectPhaseLock();
    const resonanceStrength = this._iq.resonanceStrength();
    const avgCrystallization = this._calculateAvgCrystallization();
    const phaseCoherence = 1 - variance;

    const metrics = {
      signalCount: this._window.length,
      phaseCoherence,
      variance,
      resonanceStrength,
      avgCrystallization,
      consensus: this._iq.weightedConsensus()
    };

    // Determine state
    let newState = this._state;

    if (phaseCoherence >= this.phaseThreshold &&
        avgCrystallization >= this.crystallizationThreshold) {
      // Full resonance
      newState = ResonanceState.RESONANT;
      this._stats.resonanceEvents++;
      this._lastResonance = Date.now();
    } else if (phaseCoherence >= this.phaseThreshold) {
      // Phase lock without crystallization
      newState = ResonanceState.PHASE_LOCK;
      this._stats.phaseLocks++;
    } else if (variance > 0.5) {
      // High variance = divergence
      newState = ResonanceState.DIVERGENT;
    } else {
      newState = ResonanceState.BUILDING;
    }

    // Emit event on state change
    if (newState !== this._state) {
      this._state = newState;
      return new ResonanceEvent(newState, metrics);
    }

    // Always emit on resonance
    if (newState === ResonanceState.RESONANT) {
      return new ResonanceEvent(newState, metrics);
    }

    return null;
  }

  /**
   * Calculate average crystallization across window
   *
   * @private
   * @returns {number}
   */
  _calculateAvgCrystallization() {
    if (this._window.length === 0) return 0;

    let total = 0;
    for (const signal of this._window) {
      const { score } = extractCrystallization(signal.payload);
      total += score;
    }

    return total / this._window.length;
  }

  /**
   * Get current state
   *
   * @returns {{ state: string, metrics: object }}
   */
  getState() {
    const { locked, variance } = this._iq.detectPhaseLock();

    return {
      state: this._state,
      signalCount: this._window.length,
      isResonant: this._state === ResonanceState.RESONANT,
      lastResonance: this._lastResonance,
      metrics: {
        phaseCoherence: 1 - variance,
        resonanceStrength: this._iq.resonanceStrength(),
        avgCrystallization: this._calculateAvgCrystallization(),
        consensus: this._iq.weightedConsensus()
      },
      stats: { ...this._stats }
    };
  }

  /**
   * Check if currently resonant
   *
   * @returns {boolean}
   */
  isResonant() {
    return this._state === ResonanceState.RESONANT;
  }

  /**
   * Check if in phase lock
   *
   * @returns {boolean}
   */
  isPhaseLocked() {
    return this._state === ResonanceState.PHASE_LOCK ||
           this._state === ResonanceState.RESONANT;
  }

  /**
   * Get recent events
   *
   * @param {number} [limit=10]
   * @returns {Array<ResonanceEvent>}
   */
  getRecentEvents(limit = 10) {
    return this._events.slice(-limit);
  }

  /**
   * Clear window and reset state
   */
  reset() {
    this._window = [];
    this._state = ResonanceState.SILENT;
    this._iq = new IQDecomposition({ phaseLockThreshold: 1 - this.phaseThreshold });
    this._events = [];
  }

  /**
   * Export IQ constellation for visualization
   *
   * @returns {object}
   */
  exportConstellation() {
    return this._iq.exportState();
  }
}

/**
 * Quick resonance check for signal arrays
 *
 * @param {Array<{source: string, confidence: number, payload: *}>} signals
 * @param {object} [options]
 * @returns {{ isResonant: boolean, phaseCoherence: number, crystallization: number }}
 */
function quickResonanceCheck(signals, options = {}) {
  const { phaseThreshold = 0.7, crystallizationThreshold = 0.5 } = options;

  if (signals.length < 2) {
    return { isResonant: false, phaseCoherence: 0, crystallization: 0 };
  }

  const { locked, variance, strength } = quickPhaseLock(signals);
  const phaseCoherence = 1 - variance;

  // Calculate crystallization
  let totalCrystal = 0;
  for (const signal of signals) {
    const { score } = extractCrystallization(signal.payload);
    totalCrystal += score;
  }
  const crystallization = totalCrystal / signals.length;

  const isResonant = phaseCoherence >= phaseThreshold &&
                     crystallization >= crystallizationThreshold;

  return {
    isResonant,
    phaseCoherence,
    crystallization,
    strength
  };
}

/**
 * Create a resonance detector with custom thresholds
 *
 * @param {object} [options]
 * @returns {ResonanceDetector}
 */
function createDetector(options) {
  return new ResonanceDetector(options);
}

module.exports = {
  ResonanceState,
  ResonanceEvent,
  ResonanceDetector,
  quickResonanceCheck,
  createDetector
};
