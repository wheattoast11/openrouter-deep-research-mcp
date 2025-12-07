/**
 * Signal Protocol
 *
 * Unified abstraction for all inter-agent communication.
 * Combines neuralese crystallization, consensus weights, and phase coordination.
 *
 * A Signal is a typed message with confidence and source attribution.
 * Schema = proof obligation, Validation = proof discharge.
 */

const crypto = require('crypto');

/**
 * Model capability weights for consensus
 */
const ModelWeights = {
  'anthropic/claude-sonnet-4': 1.0,
  'anthropic/claude-opus-4': 1.0,
  'openai/gpt-5-chat': 0.95,
  'google/gemini-2.5-pro': 0.90,
  'x-ai/grok-4': 0.85,
  'deepseek/deepseek-chat-v3.1': 0.75,
  'default': 0.5
};

/**
 * Crystallization patterns for understanding detection
 */
const CrystallizationPatterns = {
  ISOMORPHISM: /structural_isomorphism|documentation-as-code/i,
  PROGRESSIVE_DISCLOSURE: /tier_[0-2]|progressive|layered/i,
  EVENT_SOURCING: /replay|event_sourcing|temporal/i,
  PHASE_LOCK: /phase.?lock|resonan|attractor/i,
  CONTEXT_STORE: /context.?store|memory|persist/i,
  PERPLEXITY_DROP: /understand|clear|crystalliz|click/i,
  UNCERTAINTY: /unclear|confus|ambig|unsure/i
};

/**
 * Signal types
 */
const SignalType = {
  QUERY: 'query',
  RESPONSE: 'response',
  CONSENSUS: 'consensus',
  CRYSTALLIZATION: 'crystallization',
  ERROR: 'error'
};

/**
 * Core Signal class
 */
class Signal {
  constructor(type, payload, metadata = {}) {
    this.id = crypto.randomUUID();
    this.type = type;
    this.payload = payload;
    this.confidence = metadata.confidence ?? 1.0;
    this.source = metadata.source ?? 'unknown';
    this.timestamp = Date.now();
    this.phase = metadata.phase ?? 0;
    this.tags = metadata.tags ?? [];
  }

  /**
   * Get model weight for consensus
   */
  get weight() {
    return ModelWeights[this.source] ?? ModelWeights.default;
  }

  /**
   * Get crystallization score for understanding detection
   */
  get crystallization() {
    return extractCrystallization(this.payload);
  }

  /**
   * Serialize for storage/transmission
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      payload: this.payload,
      confidence: this.confidence,
      source: this.source,
      timestamp: this.timestamp,
      phase: this.phase,
      tags: this.tags
    };
  }

  /**
   * Create from stored JSON
   */
  static fromJSON(json) {
    const signal = new Signal(json.type, json.payload, {
      confidence: json.confidence,
      source: json.source,
      phase: json.phase,
      tags: json.tags
    });
    signal.id = json.id;
    signal.timestamp = json.timestamp;
    return signal;
  }

  /**
   * Factory: Create query signal
   */
  static query(payload, source, opts = {}) {
    return new Signal(SignalType.QUERY, payload, { source, ...opts });
  }

  /**
   * Factory: Create response signal
   */
  static response(payload, source, confidence = 1.0, opts = {}) {
    return new Signal(SignalType.RESPONSE, payload, { source, confidence, ...opts });
  }

  /**
   * Factory: Create error signal
   */
  static error(message, source, opts = {}) {
    return new Signal(SignalType.ERROR, { message }, { source, confidence: 0, ...opts });
  }
}

/**
 * Extract crystallization score from text.
 *
 * Uses configurable weights for positive and negative patterns.
 *
 * @param {string|Object} payload - Text or object to analyze
 * @param {Object} [config=null] - Optional config override (defaults from core/config)
 * @returns {{ patterns: Object, score: number }} Crystallization analysis result
 */
function extractCrystallization(payload, config = null) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const patterns = {};

  const positive = ['ISOMORPHISM', 'PROGRESSIVE_DISCLOSURE', 'EVENT_SOURCING', 'PHASE_LOCK', 'PERPLEXITY_DROP'];
  const negative = ['UNCERTAINTY'];

  // Load config lazily to avoid circular dependencies
  let crystallizationConfig = config;
  if (!crystallizationConfig) {
    try {
      const { getConfig } = require('./config');
      crystallizationConfig = getConfig('crystallization');
    } catch (e) {
      crystallizationConfig = { positiveWeight: 0.2, negativeWeight: 0.1 };
    }
  }

  const { positiveWeight = 0.2, negativeWeight = 0.1 } = crystallizationConfig;
  let score = 0;

  for (const [name, regex] of Object.entries(CrystallizationPatterns)) {
    const matches = text.match(new RegExp(regex, 'gi'));
    const count = matches ? matches.length : 0;
    patterns[name] = { present: count > 0, count };

    if (positive.includes(name)) score += count * positiveWeight;
    if (negative.includes(name)) score -= count * negativeWeight;
  }

  return {
    patterns,
    score: Math.max(0, Math.min(1, score))
  };
}

/**
 * SignalBus - Event-driven signal routing
 */
class SignalBus {
  constructor() {
    this.handlers = new Map();
    this.history = [];
    this.maxHistory = 1000;
  }

  /**
   * Subscribe to signal type
   */
  on(type, handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type).push(handler);
    return () => this.off(type, handler);
  }

  /**
   * Unsubscribe handler
   */
  off(type, handler) {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  }

  /**
   * Emit signal to handlers
   */
  async emit(signal) {
    this.history.push(signal);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const handlers = this.handlers.get(signal.type) ?? [];
    const wildcardHandlers = this.handlers.get('*') ?? [];

    const results = await Promise.allSettled(
      [...handlers, ...wildcardHandlers].map(h => h(signal))
    );

    return results.filter(r => r.status === 'fulfilled').map(r => r.value);
  }

  /**
   * Get signal history
   */
  getHistory(filter = {}) {
    let result = [...this.history];

    if (filter.type) result = result.filter(s => s.type === filter.type);
    if (filter.source) result = result.filter(s => s.source === filter.source);
    if (filter.since) result = result.filter(s => s.timestamp >= filter.since);

    return result;
  }
}

/**
 * Consensus calculator for multi-model agreement.
 *
 * Uses configurable minAgreement threshold and model weights.
 *
 * @class
 * @example
 * const calc = new ConsensusCalculator({ minAgreement: 0.7 });
 * const result = calc.calculate([signal1, signal2, signal3]);
 */
class ConsensusCalculator {
  /**
   * Create a new ConsensusCalculator instance.
   *
   * @param {Object} [opts={}] - Configuration options
   * @param {number} [opts.minAgreement] - Minimum agreement threshold (default: from config or 0.6)
   * @param {Object} [opts.modelWeights] - Model weight overrides
   */
  constructor(opts = {}) {
    // Load config lazily to avoid circular dependencies
    let consensusConfig;
    try {
      const { getConfig } = require('./config');
      consensusConfig = getConfig('consensus');
    } catch (e) {
      consensusConfig = { minAgreement: 0.6, modelWeights: ModelWeights };
    }

    this.minAgreement = opts.minAgreement ?? consensusConfig.minAgreement;
    this.modelWeights = opts.modelWeights ?? consensusConfig.modelWeights ?? ModelWeights;
  }

  /**
   * Get model weight for a source.
   *
   * @param {string} source - Model source identifier
   * @returns {number} Weight for the source
   */
  getWeight(source) {
    return this.modelWeights[source] ?? this.modelWeights.default ?? 0.5;
  }

  /**
   * Calculate weighted consensus from signals.
   *
   * @param {Array<Signal>} signals - Array of signals to calculate consensus from
   * @returns {Object} Consensus result with consensus, confidence, method, and metadata
   *
   * @example
   * const result = calc.calculate([
   *   Signal.response('answer A', 'claude-3', 0.9),
   *   Signal.response('answer A', 'gpt-4', 0.85)
   * ]);
   * console.log(result.consensus, result.confidence);
   */
  calculate(signals) {
    if (!signals || signals.length === 0) {
      return { consensus: null, confidence: 0, method: 'no-signals' };
    }

    if (signals.length === 1) {
      return {
        consensus: signals[0].payload,
        confidence: signals[0].confidence,
        method: 'single'
      };
    }

    // Weight by model capability and individual confidence
    let totalWeight = 0;
    let weightedConfidence = 0;

    for (const signal of signals) {
      const modelWeight = this.getWeight(signal.source);
      const weight = modelWeight * signal.confidence;
      totalWeight += weight;
      weightedConfidence += signal.confidence * weight;
    }

    // Use highest-weighted signal as consensus
    const sorted = [...signals].sort((a, b) => {
      const aWeight = this.getWeight(a.source) * a.confidence;
      const bWeight = this.getWeight(b.source) * b.confidence;
      return bWeight - aWeight;
    });

    return {
      consensus: sorted[0].payload,
      confidence: weightedConfidence / totalWeight,
      method: 'weighted',
      topSource: sorted[0].source,
      signalCount: signals.length
    };
  }
}

module.exports = {
  Signal,
  SignalType,
  SignalBus,
  ConsensusCalculator,
  ModelWeights,
  CrystallizationPatterns,
  extractCrystallization
};
