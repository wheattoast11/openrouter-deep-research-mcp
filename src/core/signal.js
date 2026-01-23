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
const { deterministicStringify } = require('../utils/deterministic');

// Lazy-loaded modules to avoid circular dependencies
function getPadicModule() {
  return { modelDistance: () => 1.0 };
}

function getRewardModule() {
  // Disabled
  return { 
    quickReward: () => 0.5,
    getGlobalCalculator: () => ({ calculate: () => ({ total: 0.5 }) }),
    TraceContext: class {}
  };
}

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
  TEMPLATE: 'template',
  // Intent types (v1.14.1)
  INTENT: 'intent',
  STABILIZATION: 'stabilization'
};

/**
 * AgentSignal - Core inter-agent communication primitive
 * (Renamed from Signal for SDK alignment)
 */
class AgentSignal {
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
   * Layer address for AXON architecture (L3 = Mesh/Transport Layer)
   * Format: L{layer}:{type}:{id}
   * @returns {string} SDKAddress-compatible string
   */
  get address() {
    return `L3:signal:${this.id}`;
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
   * Calculate deterministic ShapeHash (L1 Isomorphism)
   * Uses SHA-256 to fingerprint the structural payload.
   */
  get shapeHash() {
    const canonical = deterministicStringify({
      type: this.type,
      payload: this.payload,
      confidence: this.confidence
    });
    
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Serialize for storage/transmission (MeshEvent compatible)
   */
  toJSON() {
    return {
      id: this.id,
      type: `signal:${this.type}`,
      payload: this.payload,
      confidence: this.confidence,
      source: this.source,
      timestamp: this.timestamp,
      phase: this.phase,
      tags: this.tags,
      shapeHash: this.shapeHash
    };
  }

  /**
   * Create from stored JSON
   */
  static fromJSON(json) {
    const signal = new AgentSignal(json.type, json.payload, {
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
    return new AgentSignal(SignalType.QUERY, payload, { source, ...opts });
  }

  /**
   * Factory: Create response signal
   */
  static response(payload, source, confidence = 1.0, opts = {}) {
    return new AgentSignal(SignalType.RESPONSE, payload, { source, confidence, ...opts });
  }

  /**
   * Factory: Create error signal
   */
  static error(message, source, opts = {}) {
    return new AgentSignal(SignalType.ERROR, { message }, { source, confidence: 0, ...opts });
  }

  /**
   * Factory: Create intent signal (v1.14.1)
   *
   * Intent signals capture the classified intent of a user query,
   * enabling intent-aligned routing and reward calculation.
   *
   * @param {string} query - The original user query
   * @param {object} classification - Intent classification result
   * @param {string} classification.category - Intent category (research, factual, etc.)
   * @param {number} classification.confidence - Classification confidence [0, 1]
   * @param {Array<string>} [classification.suggestedTiers] - Recommended model tiers
   * @param {object} [opts] - Additional signal options
   * @returns {AgentSignal} Intent signal
   *
   * @example
   * const intent = Signal.intent(
   *   "What is quantum computing?",
   *   { category: 'factual', confidence: 0.85, suggestedTiers: ['low', 'medium'] }
   * );
   */
  static intent(query, classification, opts = {}) {
    const payload = {
      query,
      category: classification.category,
      suggestedTiers: classification.suggestedTiers || ['medium'],
      metadata: classification.metadata || {},
      scores: classification.scores || []
    };

    return new AgentSignal(SignalType.INTENT, payload, {
      source: 'user',
      confidence: classification.confidence ?? 0.5,
      tags: ['intent', classification.category],
      ...opts
    });
  }

  /**
   * Factory: Create stabilization signal (v1.14.1)
   *
   * Stabilization signals track the convergence state of the system,
   * indicating when consensus has been reached.
   *
   * @param {string} state - Stabilization state (UNSTABLE, CONVERGING, STABLE, LOCKED)
   * @param {object} metrics - Stabilization metrics
   * @param {number} metrics.variance - Current variance
   * @param {number} metrics.crystallization - Crystallization score
   * @param {number} metrics.phaseCoherence - Phase coherence [0, 1]
   * @param {object} [opts] - Additional signal options
   * @returns {AgentSignal} Stabilization signal
   */
  static stabilization(state, metrics, opts = {}) {
    const payload = {
      state,
      variance: metrics.variance ?? 1,
      crystallization: metrics.crystallization ?? 0,
      phaseCoherence: metrics.phaseCoherence ?? 0,
      signalCount: metrics.signalCount ?? 0,
      timestamp: Date.now()
    };

    // Confidence based on how stable the state is
    const stateConfidence = {
      UNSTABLE: 0.2,
      CONVERGING: 0.5,
      STABLE: 0.8,
      LOCKED: 1.0
    };

    return new AgentSignal(SignalType.STABILIZATION, payload, {
      source: 'system',
      confidence: stateConfidence[state] ?? 0.5,
      tags: ['stabilization', state.toLowerCase()],
      ...opts
    });
  }

  /**
   * Check if this signal is an intent signal
   * @returns {boolean}
   */
  isIntent() {
    return this.type === SignalType.INTENT;
  }

  /**
   * Extract intent category if this is an intent signal
   * @returns {string|null} Intent category or null
   */
  getIntentCategory() {
    if (this.type !== SignalType.INTENT) return null;
    return this.payload?.category ?? null;
  }

  /**
   * Get suggested model tier from intent signal
   * @returns {string} Primary suggested tier or 'medium'
   */
  getSuggestedTier() {
    if (this.type !== SignalType.INTENT) return 'medium';
    return this.payload?.suggestedTiers?.[0] ?? 'medium';
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

    return new AgentSignal(SignalType.COMPOSE, mergedPayload, {
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
      return new AgentSignal(SignalType.ERROR, { message: 'No signals to reduce' }, { confidence: 0 });
    }

    if (signals.length === 1) {
      return new AgentSignal(SignalType.REDUCE, signals[0].payload, {
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
      accumulated = AgentSignal.compose(accumulated, sorted[i]);
    }

    // Extract crystallization for convergence detection
    const crystallization = extractCrystallization(accumulated.payload);

    return new AgentSignal(SignalType.REDUCE, {
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

    return new AgentSignal(SignalType.TEMPLATE, {
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
      return new AgentSignal(SignalType.ERROR, {
        message: 'substitute requires a template signal'
      }, { confidence: 0 });
    }

    const { template, variables } = templateSignal.payload;

    // Check all variables are bound
    const unbound = variables.filter(v => !(v in bindings));
    if (unbound.length > 0) {
      return new AgentSignal(SignalType.ERROR, {
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

    return new AgentSignal(SignalType.SUBSTITUTION, {
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

  /**
   * Calculate p-adic distance to another signal.
   *
   * P-adic distance is based on source/provider lineage similarity.
   * Signals from the same provider family are "closer".
   *
   * @param {AgentSignal} other - Signal to compare against
   * @returns {number} P-adic distance [0, 1]
   */
  padicDistance(other) {
    if (!other || !(other instanceof AgentSignal)) {
      return 1.0; // Maximum distance for invalid input
    }

    try {
      const { modelDistance } = getPadicModule();

      // Use model source as primary distance metric
      return modelDistance(this.source, other.source);
    } catch (e) {
      // Fallback: simple string comparison
      if (this.source === other.source) return 0;
      if (this.source.split('/')[0] === other.source.split('/')[0]) return 0.5;
      return 1.0;
    }
  }

  /**
   * Calculate procedural reward for this signal.
   *
   * R = α * crystallization - β * uncertainty + γ * traceReward
   *
   * @param {object} [traceContext] - Optional trace context for trace bonus
   * @returns {number} Reward value [-1, 1]
   */
  get reward() {
    try {
      const { quickReward } = getRewardModule();
      return quickReward(this);
    } catch (e) {
      // Fallback: simple reward based on confidence and crystallization
      const { score } = this.crystallization;
      const uncertainty = 1 - this.confidence;
      return 0.5 * score - 0.3 * uncertainty + 0.1;
    }
  }

  /**
   * Calculate reward with explicit trace context.
   *
   * @param {object} traceContext - Trace context for trace bonus
   * @returns {object} Full RewardResult
   */
  calculateReward(traceContext = null) {
    try {
      const { getGlobalCalculator, TraceContext } = getRewardModule();
      const calc = getGlobalCalculator();

      const ctx = traceContext
        ? (traceContext instanceof TraceContext ? traceContext : new TraceContext(traceContext))
        : null;

      return calc.calculate(this, ctx);
    } catch (e) {
      // Fallback simple result
      return {
        total: this.reward,
        crystallization: this.crystallization.score * 0.5,
        uncertainty: (1 - this.confidence) * 0.3,
        trace: 0.1
      };
    }
  }

  /**
   * Get phase angle for IQ quadrature.
   *
   * Phase is derived from source model and timing.
   *
   * @returns {number} Phase in radians [0, 2π)
   */
  get phase() {
    return this._phase ?? 0;
  }

  set phase(value) {
    this._phase = value;
  }

  /**
   * Calculate phase based on source model.
   *
   * Different model families get different base phases.
   *
   * @returns {number} Phase in radians
   */
  calculatePhase() {
    const TWO_PI = 2 * Math.PI;

    // Model family phase offsets
    const phaseOffsets = {
      'anthropic': 0,
      'openai': TWO_PI / 4,
      'google': TWO_PI / 2,
      'deepseek': (3 * TWO_PI) / 4,
      'x-ai': TWO_PI / 6
    };

    const family = this.source.split('/')[0];
    const basePhase = phaseOffsets[family] ?? 0;

    // Add timing-based variation
    const timingOffset = (this.timestamp % 1000) / 1000 * 0.1 * TWO_PI;

    return (basePhase + timingOffset) % TWO_PI;
  }

  /**
   * Returns introspection data for debugging and SDK tooling
   * @returns {object} Explanation object
   */
  explain() {
    return {
      id: this.id,
      layer: 'L3',
      type: 'AgentSignal',
      address: this.address,
      capabilities: ['query', 'response', 'consensus', 'crystallization', 'compose', 'reduce', 'template', 'substitute'],
      state: {
        signalType: this.type,
        source: this.source,
        confidence: this.confidence,
        phase: this.phase,
        weight: this.weight,
        crystallization: this.crystallization?.score ?? 0,
        tagCount: this.tags?.length ?? 0,
        shapeHash: this.shapeHash
      }
    };
  }

  /**
   * Convert to SDKMessage format for SDK integration
   * NOTE: Adapter method - when @terminals-tech/core exports createMessage,
   * this can be replaced with: return createMessage('event', this.address, target, this.payload);
   *
   * @param {string} [target='*'] - Target address (default: broadcast)
   * @returns {object} SDKMessage-compatible object
   */
  toSDKMessage(target = '*') {
    return {
      id: this.id,
      type: 'event',
      from: this.address,
      to: target,
      payload: this.payload,
      metadata: {
        signalType: this.type,
        source: this.source,
        confidence: this.confidence,
        phase: this.phase,
        timestamp: this.timestamp,
        shapeHash: this.shapeHash
      }
    };
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

/**
 * CoherenceScorer - Multi-dimensional agreement analysis
 *
 * Scores signals across multiple dimensions for ensemble coherence.
 * Unlike simple consensus, this measures how "together" signals are.
 *
 * @class
 */
class CoherenceScorer {
  /**
   * @param {object} [options]
   * @param {Array<string>} [options.dimensions] - Dimensions to score
   * @param {object} [options.weights] - Weight per dimension
   */
  constructor(options = {}) {
    this.dimensions = options.dimensions ?? [
      'factual',      // Agreement on facts/entities
      'structural',   // Response structure similarity
      'temporal',     // Timeline consistency
      'confidence'    // Confidence level alignment
    ];

    this.weights = options.weights ?? {
      factual: 0.35,
      structural: 0.25,
      temporal: 0.15,
      confidence: 0.25
    };
  }

  /**
   * Calculate coherence across all dimensions
   *
   * @param {Array<AgentSignal>} signals
   * @returns {object} Coherence result with total and per-dimension scores
   */
  score(signals) {
    if (!signals || signals.length < 2) {
      return {
        coherence: signals?.length === 1 ? 1.0 : 0,
        dimensions: {},
        signalCount: signals?.length ?? 0
      };
    }

    const dimensions = {};
    let weightedSum = 0;
    let totalWeight = 0;

    for (const dim of this.dimensions) {
      const scorer = this[`_score${dim.charAt(0).toUpperCase() + dim.slice(1)}`];
      if (scorer) {
        dimensions[dim] = scorer.call(this, signals);
        const weight = this.weights[dim] ?? 0.25;
        weightedSum += dimensions[dim] * weight;
        totalWeight += weight;
      }
    }

    return {
      coherence: totalWeight > 0 ? weightedSum / totalWeight : 0,
      dimensions,
      signalCount: signals.length
    };
  }

  /**
   * Score factual agreement using Jaccard similarity
   *
   * @private
   * @param {Array<AgentSignal>} signals
   * @returns {number} Score [0, 1]
   */
  _scoreFactual(signals) {
    // Extract key tokens/entities from each signal
    const tokenSets = signals.map(s => this._extractTokens(s.payload));

    if (tokenSets.length < 2) return 1.0;

    // Pairwise Jaccard similarity
    let totalSimilarity = 0;
    let pairs = 0;

    for (let i = 0; i < tokenSets.length; i++) {
      for (let j = i + 1; j < tokenSets.length; j++) {
        totalSimilarity += this._jaccard(tokenSets[i], tokenSets[j]);
        pairs++;
      }
    }

    return pairs > 0 ? totalSimilarity / pairs : 0;
  }

  /**
   * Extract significant tokens from payload
   *
   * @private
   * @param {*} payload
   * @returns {Set<string>}
   */
  _extractTokens(payload) {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);

    // Extract words, removing common stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in',
      'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
      'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why',
      'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
      'some', 'such', 'no', 'nor', 'not', 'only', 'same', 'so', 'than',
      'too', 'very', 'just', 'also', 'now', 'here', 'there', 'this', 'that'
    ]);

    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    return new Set(words);
  }

  /**
   * Calculate Jaccard similarity between two sets
   *
   * @private
   * @param {Set} a
   * @param {Set} b
   * @returns {number}
   */
  _jaccard(a, b) {
    if (a.size === 0 && b.size === 0) return 1.0;

    const intersection = new Set([...a].filter(x => b.has(x)));
    const union = new Set([...a, ...b]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Score structural similarity
   *
   * @private
   * @param {Array<AgentSignal>} signals
   * @returns {number} Score [0, 1]
   */
  _scoreStructural(signals) {
    // Compare payload structure: length, format markers, etc.
    const features = signals.map(s => this._extractStructuralFeatures(s.payload));

    if (features.length < 2) return 1.0;

    // Calculate variance in features
    let totalSimilarity = 0;
    let pairs = 0;

    for (let i = 0; i < features.length; i++) {
      for (let j = i + 1; j < features.length; j++) {
        totalSimilarity += this._structuralSimilarity(features[i], features[j]);
        pairs++;
      }
    }

    return pairs > 0 ? totalSimilarity / pairs : 0;
  }

  /**
   * Extract structural features
   *
   * @private
   * @param {*} payload
   * @returns {object}
   */
  _extractStructuralFeatures(payload) {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);

    return {
      length: text.length,
      paragraphs: (text.match(/\n\n/g) || []).length + 1,
      sentences: (text.match(/[.!?]+/g) || []).length,
      headers: (text.match(/^#+\s/gm) || []).length,
      lists: (text.match(/^[-*]\s/gm) || []).length,
      codeBlocks: (text.match(/```/g) || []).length / 2,
      hasNumbers: /\d/.test(text),
      hasUrls: /https?:\/\//.test(text)
    };
  }

  /**
   * Compare structural features
   *
   * @private
   * @param {object} a
   * @param {object} b
   * @returns {number}
   */
  _structuralSimilarity(a, b) {
    // Normalize numeric features and compare
    const lengthSim = 1 - Math.abs(a.length - b.length) / Math.max(a.length, b.length, 1);
    const paraSim = 1 - Math.abs(a.paragraphs - b.paragraphs) / Math.max(a.paragraphs, b.paragraphs, 1);
    const sentSim = 1 - Math.abs(a.sentences - b.sentences) / Math.max(a.sentences, b.sentences, 1);

    // Boolean feature agreement
    const boolSim = (
      (a.hasNumbers === b.hasNumbers ? 1 : 0) +
      (a.hasUrls === b.hasUrls ? 1 : 0) +
      (a.headers > 0 === b.headers > 0 ? 1 : 0) +
      (a.lists > 0 === b.lists > 0 ? 1 : 0)
    ) / 4;

    return 0.4 * lengthSim + 0.2 * paraSim + 0.2 * sentSim + 0.2 * boolSim;
  }

  /**
   * Score temporal consistency
   *
   * @private
   * @param {Array<AgentSignal>} signals
   * @returns {number} Score [0, 1]
   */
  _scoreTemporal(signals) {
    // Extract time references and compare
    const timeRefs = signals.map(s => this._extractTimeReferences(s.payload));

    if (timeRefs.every(t => t.length === 0)) {
      return 1.0; // No temporal references = no conflict
    }

    // Check for contradictions
    let agreements = 0;
    let comparisons = 0;

    for (let i = 0; i < timeRefs.length; i++) {
      for (let j = i + 1; j < timeRefs.length; j++) {
        if (timeRefs[i].length > 0 && timeRefs[j].length > 0) {
          const overlap = timeRefs[i].filter(t => timeRefs[j].includes(t)).length;
          const maxRefs = Math.max(timeRefs[i].length, timeRefs[j].length);
          agreements += overlap / maxRefs;
          comparisons++;
        }
      }
    }

    return comparisons > 0 ? agreements / comparisons : 1.0;
  }

  /**
   * Extract time references
   *
   * @private
   * @param {*} payload
   * @returns {Array<string>}
   */
  _extractTimeReferences(payload) {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);

    const patterns = [
      /\b(19|20)\d{2}\b/g,  // Years
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
      /\b(yesterday|today|tomorrow|last week|next week|last month|next month)\b/gi,
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g  // Dates
    ];

    const refs = [];
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        refs.push(...matches.map(m => m.toLowerCase()));
      }
    }

    return [...new Set(refs)];
  }

  /**
   * Score confidence alignment
   *
   * @private
   * @param {Array<AgentSignal>} signals
   * @returns {number} Score [0, 1]
   */
  _scoreConfidence(signals) {
    const confidences = signals.map(s => s.confidence);

    if (confidences.length < 2) return 1.0;

    // Calculate standard deviation of confidences
    const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const variance = confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length;
    const stdDev = Math.sqrt(variance);

    // Lower std dev = higher coherence
    // stdDev of 0 = perfect alignment (score 1.0)
    // stdDev of 0.5 = very divergent (score ~0)
    return Math.max(0, 1 - 2 * stdDev);
  }
}

// Backward compatibility alias (deprecated - use AgentSignal)
const Signal = AgentSignal;

module.exports = {
  // SDK-aligned name (preferred)
  AgentSignal,
  // Backward compatibility alias (deprecated)
  Signal,
  SignalType,
  SignalBus,
  ConsensusCalculator,
  CoherenceScorer,
  ModelWeights,
  CrystallizationPatterns,
  extractCrystallization
};
