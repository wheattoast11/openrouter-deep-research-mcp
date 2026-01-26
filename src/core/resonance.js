/**
 * Resonance Detection
 *
 * Detects phase coherence in multi-model signal streams.
 * Resonance occurs when models converge on similar conclusions,
 * creating "constructive interference" in the consensus.
 *
 * Uses IQ quadrature and crystallization scoring for detection.
 * Now integrated with the quadrature module for provider-aware phase assignment.
 *
 * @module core/resonance
 */

'use strict';

const { EventEmitter } = require('events');
const crypto = require('crypto');

// Lazy-load quadrature module
let _quadratureModule = null;
function getQuadratureModule() {
  if (_quadratureModule === null) {
    try {
      _quadratureModule = require('./math/quadrature');
    } catch {
      _quadratureModule = {
        IQDecomposition: null,
        quickPhaseLock: () => ({ locked: false, variance: 1, strength: 0 }),
        getProviderPhase: () => 0,
        ProviderPhases: {}
      };
    }
  }
  return _quadratureModule;
}

// Lazy-load stabilization module
let _stabilizationModule = null;
function getStabilizationModule() {
  if (_stabilizationModule === null) {
    try {
      _stabilizationModule = require('./stabilization');
    } catch {
      _stabilizationModule = null;
    }
  }
  return _stabilizationModule;
}

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
    this.id = crypto.randomUUID();
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
 * Uses IQDecomposition from the quadrature module for provider-aware
 * phase assignment and phase-lock detection.
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
   * @param {boolean} [options.trackProviders=true] - Track provider diversity
   * @param {boolean} [options.wireStabilization=false] - Wire to stabilization monitor
   */
  constructor(options = {}) {
    super();
    this.windowSize = options.windowSize ?? 10;
    this.phaseThreshold = options.phaseThreshold ?? 0.7;
    this.crystallizationThreshold = options.crystallizationThreshold ?? 0.5;
    this.minSignals = options.minSignals ?? 3;
    this.trackProviders = options.trackProviders ?? true;
    this.wireStabilization = options.wireStabilization ?? false;

    this._window = [];
    this._state = ResonanceState.SILENT;
    this._lastResonance = null;
    this._events = [];

    // Initialize IQ decomposition from quadrature module
    this._initIQ();

    // Provider tracking
    this._providers = new Map(); // provider -> count

    this._stats = {
      signalsProcessed: 0,
      resonanceEvents: 0,
      phaseLocks: 0,
      divergenceEvents: 0
    };

    // Wire to stabilization monitor if requested
    this._stabilizationMonitor = null;
    if (this.wireStabilization) {
      this._wireToStabilization();
    }
  }

  /**
   * Initialize IQ decomposition from quadrature module
   *
   * @private
   */
  _initIQ() {
    const quad = getQuadratureModule();

    if (quad.IQDecomposition) {
      this._iq = new quad.IQDecomposition({
        phaseLockThreshold: 1 - this.phaseThreshold,
        minSamples: this.minSignals,
        windowSize: this.windowSize
      });
      this._hasQuadrature = true;
    } else {
      // Fallback: simple stub implementation
      this._iq = {
        samples: [],
        addSignal: (s) => this._iq.samples.push(s),
        detectPhaseLock: () => ({ locked: false, variance: 0.5, meanPhase: 0, strength: 0.5 }),
        resonanceStrength: () => 0.5,
        weightedConsensus: () => ({ I: 0, Q: 0, magnitude: 0, phase: 0 }),
        exportState: () => ({ samples: [], centroid: { I: 0, Q: 0 }, metrics: {} }),
        providerDiversity: () => 0
      };
      this._hasQuadrature = false;
    }
  }

  /**
   * Wire to stabilization monitor for cross-module coordination
   *
   * @private
   */
  _wireToStabilization() {
    const stab = getStabilizationModule();
    if (stab?.getGlobalMonitor) {
      this._stabilizationMonitor = stab.getGlobalMonitor();

      // Forward resonance events to stabilization monitor
      this.on('resonance', (event) => {
        if (this._stabilizationMonitor) {
          // Create a pseudo-signal for the stabilization monitor
          const pseudoSignal = {
            confidence: event.metrics.phaseCoherence || 0.5,
            crystallization: event.metrics.avgCrystallization || 0,
            phase: event.metrics.consensus?.phase || 0
          };
          this._stabilizationMonitor.process(pseudoSignal);
        }
      });
    }
  }

  /**
   * Get provider phase using quadrature module
   *
   * @param {string} source - Model source
   * @returns {number} Phase in radians
   */
  getProviderPhase(source) {
    const quad = getQuadratureModule();
    if (quad.getProviderPhase) {
      return quad.getProviderPhase(source);
    }
    return 0;
  }

  /**
   * Add a signal to the detector
   *
   * @param {object} signal - Signal with source, confidence, and payload
   * @returns {ResonanceEvent | null}
   */
  addSignal(signal) {
    this._stats.signalsProcessed++;

    // Enrich signal with provider phase if not present
    const enrichedSignal = {
      ...signal,
      timestamp: signal.timestamp || Date.now(),
      phase: signal.phase ?? this.getProviderPhase(signal.source)
    };

    // Add to window
    this._window.push(enrichedSignal);

    // Trim to window size
    while (this._window.length > this.windowSize) {
      this._window.shift();
    }

    // Add to IQ decomposition
    if (this._iq && typeof this._iq.addSignal === 'function') {
      this._iq.addSignal(enrichedSignal);

      // Trim IQ samples if needed
      if (this._iq.samples && this._iq.samples.length > this.windowSize) {
        this._iq.samples.shift();
      }
    }

    // Track provider
    if (this.trackProviders && signal.source) {
      const provider = this._extractProvider(signal.source);
      this._providers.set(provider, (this._providers.get(provider) || 0) + 1);
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
   * Extract provider from source string
   *
   * @private
   * @param {string} source
   * @returns {string}
   */
  _extractProvider(source) {
    if (!source) return 'unknown';
    const parts = source.toLowerCase().split('/');
    return parts[0] || 'unknown';
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
    const phaseLockResult = this._iq.detectPhaseLock();
    const { locked, variance, meanPhase, strength } = phaseLockResult;
    const resonanceStrength = this._iq.resonanceStrength();
    const avgCrystallization = this._calculateAvgCrystallization();
    const phaseCoherence = 1 - variance;
    const providerDiversity = this._hasQuadrature && this._iq.providerDiversity
      ? this._iq.providerDiversity()
      : this._calculateProviderDiversity();

    const metrics = {
      signalCount: this._window.length,
      phaseCoherence,
      variance,
      meanPhase,
      resonanceStrength,
      avgCrystallization,
      providerDiversity,
      consensus: this._iq.weightedConsensus(),
      phaseLocked: locked
    };

    // Determine state
    let newState = this._state;

    if (phaseCoherence >= this.phaseThreshold &&
        avgCrystallization >= this.crystallizationThreshold) {
      // Full resonance
      newState = ResonanceState.RESONANT;
      this._stats.resonanceEvents++;
      this._lastResonance = Date.now();
    } else if (phaseCoherence >= this.phaseThreshold || locked) {
      // Phase lock without crystallization
      newState = ResonanceState.PHASE_LOCK;
      this._stats.phaseLocks++;
    } else if (variance > 0.5) {
      // High variance = divergence
      newState = ResonanceState.DIVERGENT;
      this._stats.divergenceEvents++;
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
   * Calculate provider diversity
   *
   * @private
   * @returns {number} Diversity score [0, 1]
   */
  _calculateProviderDiversity() {
    if (this._providers.size === 0) return 0;
    const maxProviders = 6; // Approximate max providers
    return Math.min(1, this._providers.size / Math.min(maxProviders, this._window.length));
  }

  /**
   * Get current state
   *
   * @returns {{ state: string, metrics: object }}
   */
  getState() {
    const { locked, variance, meanPhase } = this._iq.detectPhaseLock();

    return {
      state: this._state,
      signalCount: this._window.length,
      isResonant: this._state === ResonanceState.RESONANT,
      isPhaseLocked: locked || this._state === ResonanceState.PHASE_LOCK,
      lastResonance: this._lastResonance,
      metrics: {
        phaseCoherence: 1 - variance,
        meanPhase,
        resonanceStrength: this._iq.resonanceStrength(),
        avgCrystallization: this._calculateAvgCrystallization(),
        providerDiversity: this._calculateProviderDiversity(),
        consensus: this._iq.weightedConsensus()
      },
      stats: { ...this._stats },
      hasQuadrature: this._hasQuadrature
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
   * Get resonance strength
   *
   * @returns {number}
   */
  getResonanceStrength() {
    return this._iq.resonanceStrength();
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
   * Get provider statistics
   *
   * @returns {object}
   */
  getProviderStats() {
    return {
      providers: Object.fromEntries(this._providers),
      diversity: this._calculateProviderDiversity(),
      uniqueCount: this._providers.size
    };
  }

  /**
   * Clear window and reset state
   */
  reset() {
    this._window = [];
    this._state = ResonanceState.SILENT;
    this._providers.clear();
    this._events = [];
    this._initIQ();
  }

  /**
   * Export IQ constellation for visualization
   *
   * @returns {object}
   */
  exportConstellation() {
    return this._iq.exportState();
  }

  /**
   * Returns introspection data for debugging
   *
   * @returns {object}
   */
  explain() {
    return {
      type: 'ResonanceDetector',
      config: {
        windowSize: this.windowSize,
        phaseThreshold: this.phaseThreshold,
        crystallizationThreshold: this.crystallizationThreshold,
        minSignals: this.minSignals,
        trackProviders: this.trackProviders
      },
      state: this._state,
      hasQuadrature: this._hasQuadrature,
      hasStabilization: this._stabilizationMonitor !== null,
      stats: this._stats,
      providerStats: this.getProviderStats()
    };
  }
}

/**
 * Quick resonance check for signal arrays
 *
 * @param {Array<{source: string, confidence: number, payload: *}>} signals
 * @param {object} [options]
 * @returns {{ isResonant: boolean, phaseCoherence: number, crystallization: number, strength: number }}
 */
function quickResonanceCheck(signals, options = {}) {
  const { phaseThreshold = 0.7, crystallizationThreshold = 0.5 } = options;

  if (!signals || signals.length < 2) {
    return { isResonant: false, phaseCoherence: 0, crystallization: 0, strength: 0 };
  }

  const quad = getQuadratureModule();
  let phaseLockResult;

  if (quad.quickPhaseLock) {
    phaseLockResult = quad.quickPhaseLock(signals, options);
  } else {
    phaseLockResult = { locked: false, variance: 0.5, strength: 0.5 };
  }

  const { locked, variance, strength } = phaseLockResult;
  const phaseCoherence = 1 - (variance ?? 0.5);

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
    strength: strength ?? 0,
    phaseLocked: locked ?? false
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

// Global detector singleton
let _globalDetector = null;

/**
 * Get global resonance detector
 *
 * @param {object} [options]
 * @returns {ResonanceDetector}
 */
function getGlobalDetector(options) {
  if (!_globalDetector) {
    _globalDetector = new ResonanceDetector(options);
  }
  return _globalDetector;
}

/**
 * Reset global detector
 */
function resetGlobalDetector() {
  if (_globalDetector) {
    _globalDetector.reset();
  }
  _globalDetector = null;
}

module.exports = {
  ResonanceState,
  ResonanceEvent,
  ResonanceDetector,
  quickResonanceCheck,
  createDetector,
  getGlobalDetector,
  resetGlobalDetector
};
