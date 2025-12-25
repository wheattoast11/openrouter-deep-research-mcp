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
  'anthropic/claude-sonnet-4.5': 1.0,
  'anthropic/claude-opus-4': 1.0,
  'openai/gpt-5-chat': 0.95,
  'google/gemini-3-pro-preview': 0.90,
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
  ERROR: 'error',
  // Combinator types (Agent Zero)
  COMPOSE: 'compose',
  REDUCE: 'reduce',
  SUBSTITUTION: 'substitution',
  TEMPLATE: 'template'
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

  // ============================================
  // COMBINATOR PRIMITIVES (Agent Zero)
  // Lambda calculus-inspired thread reduction
  // ============================================

  /**
   * Compose two signals into unified response.
   * Merges payloads with confidence-weighted combination.
   *
   * @param {Signal} sig1 - First signal
   * @param {Signal} sig2 - Second signal
   * @param {Object} opts - Composition options
   * @returns {Signal} Composed signal with merged payload
   */
  static compose(sig1, sig2, opts = {}) {
    const w1 = sig1.weight * sig1.confidence;
    const w2 = sig2.weight * sig2.confidence;
    const totalWeight = w1 + w2;

    // Merge payloads (string concatenation or object merge)
    let mergedPayload;
    if (typeof sig1.payload === 'string' && typeof sig2.payload === 'string') {
      mergedPayload = `${sig1.payload}\n\n${sig2.payload}`;
    } else {
      mergedPayload = {
        sources: [
          { source: sig1.source, payload: sig1.payload, weight: w1 },
          { source: sig2.source, payload: sig2.payload, weight: w2 }
        ],
        merged: true
      };
    }

    return new Signal(SignalType.COMPOSE, mergedPayload, {
      confidence: (sig1.confidence * w1 + sig2.confidence * w2) / totalWeight,
      source: `compose(${sig1.source},${sig2.source})`,
      tags: [...(sig1.tags || []), ...(sig2.tags || []), 'composed'],
      ...opts
    });
  }

  /**
   * Reduce multiple signals to single consensus via combinator semantics.
   * Applies pairwise composition with crystallization-weighted convergence.
   *
   * @param {Array<Signal>} signals - Signals to reduce
   * @param {Object} opts - Reduction options
   * @returns {Signal} Reduced signal
   */
  static reduce(signals, opts = {}) {
    if (!signals || signals.length === 0) {
      return new Signal(SignalType.ERROR, { message: 'No signals to reduce' }, { confidence: 0 });
    }

    if (signals.length === 1) {
      return new Signal(SignalType.REDUCE, signals[0].payload, {
        confidence: signals[0].confidence,
        source: `reduce(${signals[0].source})`,
        tags: ['reduced', 'single'],
        ...opts
      });
    }

    // Sort by weighted confidence for optimal reduction order
    const sorted = [...signals].sort((a, b) => {
      const aScore = a.weight * a.confidence;
      const bScore = b.weight * b.confidence;
      return bScore - aScore;
    });

    // Pairwise reduction (fold left)
    let accumulated = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      accumulated = Signal.compose(accumulated, sorted[i]);
    }

    // Extract crystallization for convergence detection
    const crystallization = extractCrystallization(accumulated.payload);

    return new Signal(SignalType.REDUCE, {
      result: accumulated.payload,
      crystallization: crystallization.score,
      patterns: crystallization.patterns,
      sourceCount: signals.length,
      reductionPath: sorted.map(s => s.source)
    }, {
      confidence: accumulated.confidence,
      source: `reduce(${signals.length} signals)`,
      tags: ['reduced', ...(crystallization.score > 0.5 ? ['crystallized'] : [])],
      ...opts
    });
  }

  /**
   * Create a template signal for structured generation.
   *
   * @param {string} templateString - Template with ${variable} placeholders
   * @param {Object} opts - Template options
   * @returns {Signal} Template signal
   */
  static template(templateString, opts = {}) {
    // Extract variable names from template
    const variables = [];
    const varRegex = /\$\{(\w+)\}/g;
    let match;
    while ((match = varRegex.exec(templateString)) !== null) {
      variables.push(match[1]);
    }

    return new Signal(SignalType.TEMPLATE, {
      template: templateString,
      variables,
      bound: {}
    }, {
      confidence: 1.0,
      source: 'template',
      tags: ['template'],
      ...opts
    });
  }

  /**
   * Substitute bindings into template signal.
   * Lambda calculus β-reduction semantics.
   *
   * @param {Signal} templateSignal - Template to instantiate
   * @param {Object} bindings - Variable -> Signal mappings
   * @param {Object} opts - Substitution options
   * @returns {Signal} Instantiated signal
   */
  static substitute(templateSignal, bindings, opts = {}) {
    if (templateSignal.type !== SignalType.TEMPLATE) {
      return new Signal(SignalType.ERROR, {
        message: 'substitute requires a template signal'
      }, { confidence: 0 });
    }

    const { template, variables } = templateSignal.payload;

    // Check all variables are bound
    const unbound = variables.filter(v => !(v in bindings));
    if (unbound.length > 0) {
      return new Signal(SignalType.ERROR, {
        message: `Unbound variables: ${unbound.join(', ')}`
      }, { confidence: 0 });
    }

    // Perform substitution
    let result = template;
    let totalConfidence = 0;
    let bindingCount = 0;
    const sources = [];

    for (const [varName, binding] of Object.entries(bindings)) {
      const payload = binding instanceof Signal ? binding.payload : binding;
      const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      result = result.replace(new RegExp(`\\$\\{${varName}\\}`, 'g'), payloadStr);

      if (binding instanceof Signal) {
        totalConfidence += binding.confidence;
        bindingCount++;
        sources.push(binding.source);
      }
    }

    const avgConfidence = bindingCount > 0 ? totalConfidence / bindingCount : 1.0;

    return new Signal(SignalType.SUBSTITUTION, {
      result,
      template: template,
      bindings: Object.keys(bindings),
      sources
    }, {
      confidence: avgConfidence * templateSignal.confidence,
      source: `substitute(${sources.join(',') || 'literal'})`,
      tags: ['substituted'],
      ...opts
    });
  }

  /**
   * Check if signal represents a converged/crystallized state.
   * Used for reduction termination detection.
   *
   * @returns {boolean} True if signal shows crystallization
   */
  isConverged() {
    const { score } = this.crystallization;
    return score > 0.5;
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
      confidence: totalWeight > 0 ? weightedConfidence / totalWeight : 0,
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
