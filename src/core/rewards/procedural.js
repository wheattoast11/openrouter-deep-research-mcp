/**
 * Procedural Reward System
 *
 * Calculates rewards for signals based on crystallization, uncertainty,
 * trace determinism, and intent alignment. Provides observability for
 * AI-assisted improvement.
 *
 * Reward formula (v1.14.1):
 *   R = α * crystallization - β * uncertainty + γ * traceReward + δ * intentAlignment
 *
 * Where:
 *   α (crystallizationWeight) = 0.4 - Pattern recognition reward
 *   β (uncertaintyPenalty) = 0.25 - Penalize low confidence
 *   γ (traceBonus) = 0.15 - Reward deterministic provenance
 *   δ (intentAlignmentWeight) = 0.2 - Reward responses aligned with user intent
 *
 * @module core/rewards/procedural
 */

'use strict';

const crypto = require('crypto');
const { EventEmitter } = require('events');

/**
 * Default reward weights (v1.14.1 - with intent alignment)
 */
const DEFAULT_WEIGHTS = {
  crystallizationWeight: 0.4,  // α - reward for pattern detection
  uncertaintyPenalty: 0.25,    // β - penalty for uncertainty
  traceBonus: 0.15,            // γ - bonus for trace determinism
  intentAlignmentWeight: 0.2   // δ - reward for intent alignment
};

/**
 * Intent category keywords for alignment scoring
 */
const INTENT_KEYWORDS = {
  research: ['analysis', 'study', 'research', 'investigate', 'explore', 'findings', 'evidence', 'data'],
  factual: ['fact', 'is', 'are', 'definition', 'means', 'refers', 'specifically', 'exactly'],
  analytical: ['compare', 'contrast', 'analysis', 'evaluate', 'assess', 'examine', 'breakdown', 'components'],
  creative: ['imagine', 'story', 'creative', 'novel', 'unique', 'innovative', 'design', 'create'],
  code: ['function', 'class', 'code', 'implementation', 'algorithm', 'syntax', 'compile', 'debug'],
  system: ['status', 'health', 'metrics', 'config', 'settings', 'parameter', 'system'],
  conversational: ['hi', 'hello', 'thanks', 'appreciate', 'great', 'interesting', 'agree']
};

/**
 * Reward calculation result
 */
class RewardResult {
  /**
   * @param {object} params
   * @param {number} params.total - Total reward [-1, 1]
   * @param {number} params.crystallization - Crystallization component
   * @param {number} params.uncertainty - Uncertainty component (subtracted)
   * @param {number} params.trace - Trace determinism component
   * @param {number} [params.intentAlignment=0] - Intent alignment component (v1.14.1)
   * @param {object} params.components - Raw component values before weighting
   */
  constructor({ total, crystallization, uncertainty, trace, intentAlignment = 0, components }) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.total = total;
    this.crystallization = crystallization;
    this.uncertainty = uncertainty;
    this.trace = trace;
    this.intentAlignment = intentAlignment;
    this.components = components;
  }

  /**
   * Check if reward is positive
   *
   * @returns {boolean}
   */
  isPositive() {
    return this.total > 0;
  }

  /**
   * Get dominant factor
   *
   * @returns {'crystallization' | 'uncertainty' | 'trace' | 'intentAlignment'}
   */
  dominantFactor() {
    const abs = {
      crystallization: Math.abs(this.crystallization),
      uncertainty: Math.abs(this.uncertainty),
      trace: Math.abs(this.trace),
      intentAlignment: Math.abs(this.intentAlignment)
    };

    return Object.entries(abs)
      .sort(([, a], [, b]) => b - a)[0][0];
  }

  /**
   * Serialize to JSON
   *
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      total: this.total,
      crystallization: this.crystallization,
      uncertainty: this.uncertainty,
      trace: this.trace,
      intentAlignment: this.intentAlignment,
      components: this.components,
      isPositive: this.isPositive(),
      dominantFactor: this.dominantFactor()
    };
  }
}

/**
 * Trace context for reward calculation
 */
class TraceContext {
  /**
   * @param {object} [options]
   * @param {Array<string>} [options.provenance] - Origin chain
   * @param {number} [options.depth] - Reduction depth
   * @param {boolean} [options.deterministic] - Is trace deterministic?
   * @param {number} [options.forkCount] - Number of forks/branches
   * @param {number} [options.reductionCount] - Number of reductions
   */
  constructor(options = {}) {
    this.provenance = options.provenance || [];
    this.depth = options.depth ?? 0;
    this.deterministic = options.deterministic ?? true;
    this.forkCount = options.forkCount ?? 0;
    this.reductionCount = options.reductionCount ?? 0;
  }

  /**
   * Calculate trace determinism score [0, 1]
   *
   * Higher score for:
   * - Shorter provenance chains
   * - Fewer forks
   * - More reductions
   * - Deterministic execution
   *
   * @returns {number}
   */
  determinismScore() {
    if (!this.deterministic) {
      return 0.1; // Non-deterministic gets minimal score
    }

    // Decay for long provenance chains
    const provenanceDecay = Math.exp(-this.provenance.length / 10);

    // Penalty for forks (non-linear)
    const forkPenalty = 1 / (1 + this.forkCount);

    // Bonus for reductions (diminishing returns)
    const reductionBonus = Math.min(1, Math.log(1 + this.reductionCount) / 5);

    // Weighted combination
    return 0.4 * provenanceDecay + 0.4 * forkPenalty + 0.2 * reductionBonus;
  }

  /**
   * Create from token
   *
   * @param {object} token - Rail token
   * @returns {TraceContext}
   */
  static fromToken(token) {
    return new TraceContext({
      provenance: token.trace || [],
      depth: (token.trace || []).length,
      deterministic: true,
      forkCount: 0,
      reductionCount: 0
    });
  }

  /**
   * Create from HVM interpreter state
   *
   * @param {object} state - HVM interpreter state
   * @returns {TraceContext}
   */
  static fromHVMState(state) {
    return new TraceContext({
      provenance: ['hvm'],
      depth: 1,
      deterministic: true,
      forkCount: state.forks ?? 0,
      reductionCount: state.reductions ?? 0
    });
  }
}

/**
 * Procedural Reward Calculator
 *
 * Calculates rewards based on signal quality and trace context.
 * Emits events for observability and maintains history for debugging.
 *
 * @class
 * @extends EventEmitter
 */
class ProceduralReward extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {number} [options.crystallizationWeight=0.4] - α weight
   * @param {number} [options.uncertaintyPenalty=0.25] - β weight
   * @param {number} [options.traceBonus=0.15] - γ weight
   * @param {number} [options.intentAlignmentWeight=0.2] - δ weight (v1.14.1)
   * @param {number} [options.historyLimit=1000] - Max history entries
   */
  constructor(options = {}) {
    super();

    // Weights (normalized to sum to 1)
    this.alpha = options.crystallizationWeight ?? DEFAULT_WEIGHTS.crystallizationWeight;
    this.beta = options.uncertaintyPenalty ?? DEFAULT_WEIGHTS.uncertaintyPenalty;
    this.gamma = options.traceBonus ?? DEFAULT_WEIGHTS.traceBonus;
    this.delta = options.intentAlignmentWeight ?? DEFAULT_WEIGHTS.intentAlignmentWeight;

    // Ensure weights are positive
    this.alpha = Math.max(0, this.alpha);
    this.beta = Math.max(0, this.beta);
    this.gamma = Math.max(0, this.gamma);
    this.delta = Math.max(0, this.delta);

    this.historyLimit = options.historyLimit ?? 1000;

    // State
    this._history = [];
    this._stats = {
      calculated: 0,
      positive: 0,
      negative: 0,
      avgTotal: 0,
      avgCrystallization: 0,
      avgUncertainty: 0,
      avgTrace: 0,
      avgIntentAlignment: 0
    };
  }

  /**
   * Calculate reward for a signal
   *
   * R = α * crystallization - β * uncertainty + γ * traceReward + δ * intentAlignment
   *
   * @param {object} signal - Signal object with confidence and payload
   * @param {TraceContext} [traceContext] - Optional trace context
   * @param {object} [intentContext] - Optional intent context (v1.14.1)
   * @param {string} [intentContext.query] - Original query
   * @param {string} [intentContext.classification] - Classified intent category
   * @param {number} [intentContext.confidence] - Classification confidence
   * @returns {RewardResult}
   */
  calculate(signal, traceContext = null, intentContext = null) {
    // Extract components
    const crystallization = this._extractCrystallization(signal);
    const uncertainty = this._extractUncertainty(signal);
    const traceDeterminism = traceContext
      ? traceContext.determinismScore()
      : 0.5; // Default middle score
    const intentAlignment = this._extractIntentAlignment(signal, intentContext);

    // Calculate weighted components
    const crystalComponent = this.alpha * crystallization;
    const uncertaintyComponent = this.beta * uncertainty;
    const traceComponent = this.gamma * traceDeterminism;
    const intentComponent = this.delta * intentAlignment;

    // Total reward: crystal - uncertainty + trace + intent
    // Clamp to [-1, 1]
    const total = Math.max(-1, Math.min(1,
      crystalComponent - uncertaintyComponent + traceComponent + intentComponent
    ));

    const result = new RewardResult({
      total,
      crystallization: crystalComponent,
      uncertainty: uncertaintyComponent,
      trace: traceComponent,
      intentAlignment: intentComponent,
      components: {
        rawCrystallization: crystallization,
        rawUncertainty: uncertainty,
        rawTraceDeterminism: traceDeterminism,
        rawIntentAlignment: intentAlignment,
        intentCategory: intentContext?.classification || null,
        intentConfidence: intentContext?.confidence || 0
      }
    });

    // Update history and stats
    this._recordResult(result, signal, traceContext, intentContext);

    // Emit event
    this.emit('reward:calculated', {
      result: result.toJSON(),
      signal: this._signalSummary(signal),
      context: traceContext ? { provenance: traceContext.provenance, depth: traceContext.depth } : null,
      intent: intentContext ? { classification: intentContext.classification, confidence: intentContext.confidence } : null
    });

    return result;
  }

  /**
   * Extract crystallization score from signal
   *
   * @private
   * @param {object} signal
   * @returns {number} Score [0, 1]
   */
  _extractCrystallization(signal) {
    // Direct crystallization score if available
    if (signal.crystallization !== undefined) {
      return Math.max(0, Math.min(1, signal.crystallization));
    }

    // Try to extract from payload patterns
    const payload = signal.payload || signal.content || '';
    if (typeof payload === 'string') {
      return this._calculateCrystallizationFromText(payload);
    }

    // Default based on confidence
    const confidence = signal.confidence ?? 0.5;
    return confidence * 0.8; // Confidence is a proxy for crystallization
  }

  /**
   * Calculate crystallization from text patterns
   *
   * @private
   * @param {string} text
   * @returns {number}
   */
  _calculateCrystallizationFromText(text) {
    if (!text || text.length === 0) return 0;

    let score = 0;
    let factors = 0;

    // Pattern 1: Structure markers (headers, lists)
    const structurePatterns = /^(#{1,6}\s|[-*]\s|\d+\.\s)/gm;
    const structureMatches = (text.match(structurePatterns) || []).length;
    score += Math.min(1, structureMatches / 10);
    factors++;

    // Pattern 2: Code blocks
    const codeBlocks = (text.match(/```[\s\S]*?```/g) || []).length;
    score += Math.min(1, codeBlocks / 3);
    factors++;

    // Pattern 3: Definitive language
    const definitivePatterns = /\b(is|are|means|therefore|thus|consequently|specifically)\b/gi;
    const definitiveMatches = (text.match(definitivePatterns) || []).length;
    score += Math.min(1, definitiveMatches / 10);
    factors++;

    // Pattern 4: Hedging (negative indicator)
    const hedgingPatterns = /\b(might|could|perhaps|possibly|maybe|uncertain|unclear)\b/gi;
    const hedgingMatches = (text.match(hedgingPatterns) || []).length;
    const hedgingPenalty = Math.min(0.5, hedgingMatches / 10);
    score -= hedgingPenalty;
    factors++;

    return Math.max(0, Math.min(1, score / factors + 0.3)); // Normalize with baseline
  }

  /**
   * Extract uncertainty from signal
   *
   * @private
   * @param {object} signal
   * @returns {number} Score [0, 1] where 1 is highly uncertain
   */
  _extractUncertainty(signal) {
    // Uncertainty = 1 - confidence
    const confidence = signal.confidence ?? 0.5;
    let uncertainty = 1 - confidence;

    // Additional uncertainty indicators
    const payload = signal.payload || signal.content || '';
    if (typeof payload === 'string') {
      // Hedging language increases uncertainty
      const hedgingPatterns = /\b(might|could|perhaps|possibly|maybe|uncertain|unclear|not sure)\b/gi;
      const hedgingMatches = (payload.match(hedgingPatterns) || []).length;
      uncertainty += Math.min(0.3, hedgingMatches * 0.05);

      // Questions increase uncertainty
      const questionCount = (payload.match(/\?/g) || []).length;
      uncertainty += Math.min(0.2, questionCount * 0.04);
    }

    return Math.max(0, Math.min(1, uncertainty));
  }

  /**
   * Extract intent alignment score from signal and intent context
   *
   * Measures how well the response aligns with the classified intent.
   * Uses keyword matching weighted by intent confidence.
   *
   * @private
   * @param {object} signal
   * @param {object} [intentContext]
   * @returns {number} Score [0, 1]
   */
  _extractIntentAlignment(signal, intentContext) {
    // No intent context = neutral alignment (0.5)
    if (!intentContext || !intentContext.classification) {
      return 0.5;
    }

    const category = intentContext.classification.toLowerCase();
    const keywords = INTENT_KEYWORDS[category];

    // Unknown category = neutral
    if (!keywords || keywords.length === 0) {
      return 0.5;
    }

    const payload = signal.payload || signal.content || '';
    if (typeof payload !== 'string' || payload.length === 0) {
      return 0.3; // Empty response doesn't align well
    }

    const payloadLower = payload.toLowerCase();

    // Count keyword matches
    let matchCount = 0;
    for (const keyword of keywords) {
      // Use word boundary matching for accuracy
      const regex = new RegExp(`\\b${this._escapeRegex(keyword)}\\b`, 'gi');
      const matches = payloadLower.match(regex);
      if (matches) {
        matchCount += matches.length;
      }
    }

    // Calculate base alignment score
    // Diminishing returns after 5 matches
    const baseAlignment = Math.min(1, matchCount / 5);

    // Weight by intent classification confidence
    const intentConfidence = intentContext.confidence ?? 0.5;

    // Also consider structural alignment for certain categories
    let structuralBonus = 0;
    if (category === 'code') {
      // Code should have code blocks
      const codeBlocks = (payload.match(/```[\s\S]*?```/g) || []).length;
      structuralBonus = Math.min(0.3, codeBlocks * 0.15);
    } else if (category === 'analytical') {
      // Analytical should have structure (headers, lists)
      const structurePatterns = /^(#{1,6}\s|[-*]\s|\d+\.\s)/gm;
      const structureMatches = (payload.match(structurePatterns) || []).length;
      structuralBonus = Math.min(0.2, structureMatches * 0.04);
    } else if (category === 'factual') {
      // Factual should have definitive statements
      const definitivePatterns = /\b(is|are|was|were|means|refers to|defined as)\b/gi;
      const definitiveMatches = (payload.match(definitivePatterns) || []).length;
      structuralBonus = Math.min(0.2, definitiveMatches * 0.02);
    }

    // Combine: base alignment + structural bonus, weighted by confidence
    const rawAlignment = Math.min(1, baseAlignment + structuralBonus);
    const weightedAlignment = rawAlignment * intentConfidence + 0.5 * (1 - intentConfidence);

    return Math.max(0, Math.min(1, weightedAlignment));
  }

  /**
   * Escape special regex characters
   *
   * @private
   * @param {string} str
   * @returns {string}
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Record result in history and update stats
   *
   * @private
   * @param {RewardResult} result
   * @param {object} signal
   * @param {TraceContext} traceContext
   * @param {object} [intentContext] - Optional intent context (v1.14.1)
   */
  _recordResult(result, signal, traceContext, intentContext = null) {
    // Add to history
    this._history.push({
      timestamp: result.timestamp,
      result: result.toJSON(),
      signalId: signal.id || 'unknown',
      source: signal.source || 'unknown',
      intentCategory: intentContext?.classification || null
    });

    // Trim history
    while (this._history.length > this.historyLimit) {
      this._history.shift();
    }

    // Update running stats
    this._stats.calculated++;
    if (result.isPositive()) {
      this._stats.positive++;
    } else {
      this._stats.negative++;
    }

    // Running averages
    const n = this._stats.calculated;
    this._stats.avgTotal = this._runningAvg(this._stats.avgTotal, result.total, n);
    this._stats.avgCrystallization = this._runningAvg(this._stats.avgCrystallization, result.crystallization, n);
    this._stats.avgUncertainty = this._runningAvg(this._stats.avgUncertainty, result.uncertainty, n);
    this._stats.avgTrace = this._runningAvg(this._stats.avgTrace, result.trace, n);
    this._stats.avgIntentAlignment = this._runningAvg(this._stats.avgIntentAlignment, result.intentAlignment, n);
  }

  /**
   * Calculate running average
   *
   * @private
   * @param {number} oldAvg
   * @param {number} newValue
   * @param {number} n
   * @returns {number}
   */
  _runningAvg(oldAvg, newValue, n) {
    return oldAvg + (newValue - oldAvg) / n;
  }

  /**
   * Get signal summary for events
   *
   * @private
   * @param {object} signal
   * @returns {object}
   */
  _signalSummary(signal) {
    return {
      id: signal.id || 'unknown',
      source: signal.source || 'unknown',
      confidence: signal.confidence ?? 0.5,
      type: signal.type || 'unknown'
    };
  }

  /**
   * Get recent reward history
   *
   * @param {number} [limit=10]
   * @returns {Array}
   */
  getRewardTrace(limit = 10) {
    return this._history.slice(-limit);
  }

  /**
   * Get statistics
   *
   * @returns {object}
   */
  getStats() {
    return {
      ...this._stats,
      historySize: this._history.length,
      positiveRate: this._stats.calculated > 0
        ? this._stats.positive / this._stats.calculated
        : 0
    };
  }

  /**
   * Export full state for AI-assisted improvement
   *
   * @returns {object}
   */
  exportState() {
    return {
      config: {
        alpha: this.alpha,
        beta: this.beta,
        gamma: this.gamma,
        delta: this.delta,
        historyLimit: this.historyLimit
      },
      stats: this.getStats(),
      recentHistory: this.getRewardTrace(50),
      distribution: this._calculateDistribution(),
      intentCategories: Object.keys(INTENT_KEYWORDS)
    };
  }

  /**
   * Calculate reward distribution
   *
   * @private
   * @returns {object}
   */
  _calculateDistribution() {
    if (this._history.length === 0) {
      return { buckets: [], min: 0, max: 0, median: 0 };
    }

    const totals = this._history.map(h => h.result.total);
    totals.sort((a, b) => a - b);

    const min = totals[0];
    const max = totals[totals.length - 1];
    const median = totals[Math.floor(totals.length / 2)];

    // Create 10 buckets from -1 to 1
    const buckets = new Array(10).fill(0);
    for (const total of totals) {
      const bucketIdx = Math.min(9, Math.floor((total + 1) * 5));
      buckets[bucketIdx]++;
    }

    return {
      buckets,
      bucketLabels: ['-1.0', '-0.8', '-0.6', '-0.4', '-0.2', '0.0', '0.2', '0.4', '0.6', '0.8'],
      min,
      max,
      median,
      count: totals.length
    };
  }

  /**
   * Reset state
   */
  reset() {
    this._history = [];
    this._stats = {
      calculated: 0,
      positive: 0,
      negative: 0,
      avgTotal: 0,
      avgCrystallization: 0,
      avgUncertainty: 0,
      avgTrace: 0,
      avgIntentAlignment: 0
    };
  }

  /**
   * Adjust weights based on observed outcomes
   * (Simple learning: move towards what produces good results)
   *
   * @param {number} targetReward - Desired average reward
   * @param {number} learningRate - How fast to adjust (0-1)
   */
  adjustWeights(targetReward, learningRate = 0.1) {
    const stats = this.getStats();
    const diff = targetReward - stats.avgTotal;

    // If we want higher rewards:
    // - Increase alpha (more crystallization weight)
    // - Decrease beta (less uncertainty penalty)
    // - Increase gamma (more trace bonus)
    // - Increase delta (more intent alignment)
    if (diff > 0) {
      this.alpha += learningRate * diff * 0.4;
      this.beta -= learningRate * diff * 0.25;
      this.gamma += learningRate * diff * 0.15;
      this.delta += learningRate * diff * 0.2;
    } else {
      // If rewards are too high, do the opposite
      this.alpha -= learningRate * Math.abs(diff) * 0.4;
      this.beta += learningRate * Math.abs(diff) * 0.25;
      this.gamma -= learningRate * Math.abs(diff) * 0.15;
      this.delta -= learningRate * Math.abs(diff) * 0.2;
    }

    // Ensure weights stay positive and bounded
    this.alpha = Math.max(0.1, Math.min(1, this.alpha));
    this.beta = Math.max(0.1, Math.min(1, this.beta));
    this.gamma = Math.max(0.1, Math.min(1, this.gamma));
    this.delta = Math.max(0.05, Math.min(0.5, this.delta));

    this.emit('weights:adjusted', {
      alpha: this.alpha,
      beta: this.beta,
      gamma: this.gamma,
      delta: this.delta,
      targetReward,
      actualAvg: stats.avgTotal
    });
  }
}

/**
 * Quick reward calculation without history
 *
 * @param {object} signal
 * @param {TraceContext} [traceContext]
 * @param {object} [weights]
 * @returns {number} Reward [-1, 1]
 */
function quickReward(signal, traceContext = null, weights = DEFAULT_WEIGHTS) {
  const calc = new ProceduralReward(weights);
  const result = calc.calculate(signal, traceContext);
  return result.total;
}

/**
 * Create reward calculator with custom weights
 *
 * @param {object} [options]
 * @returns {ProceduralReward}
 */
function createRewardCalculator(options) {
  return new ProceduralReward(options);
}

/**
 * Global singleton reward calculator
 */
let _globalCalculator = null;

/**
 * Get or create global calculator
 *
 * @param {object} [options]
 * @returns {ProceduralReward}
 */
function getGlobalCalculator(options) {
  if (!_globalCalculator) {
    _globalCalculator = new ProceduralReward(options);
  }
  return _globalCalculator;
}

module.exports = {
  DEFAULT_WEIGHTS,
  INTENT_KEYWORDS,
  RewardResult,
  TraceContext,
  ProceduralReward,
  quickReward,
  createRewardCalculator,
  getGlobalCalculator
};
