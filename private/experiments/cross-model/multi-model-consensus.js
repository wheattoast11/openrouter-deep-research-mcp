/**
 * Multi-Model Consensus System
 *
 * Implements TEJ_CLAUDE_GEMINI_ZERO_UIT phase-locked arbitration
 * for cross-model consensus on research outputs.
 *
 * EXPERIMENTAL - DO NOT USE IN PRODUCTION
 *
 * @see src/core/signal.js for production Signal and ConsensusCalculator
 */

// Import from core Signal protocol
const {
  Signal,
  SignalType,
  ConsensusCalculator,
  ModelWeights: CoreWeights
} = require('../../../src/core/signal');

/**
 * Consensus strategies
 */
const ConsensusStrategy = {
  MAJORITY: 'majority',      // Simple majority vote
  WEIGHTED: 'weighted',      // Weight by model capability
  UNANIMOUS: 'unanimous',    // All must agree
  ARBITRATED: 'arbitrated'   // Designated arbiter resolves conflicts
};

/**
 * Model capability weights (extended from core)
 */
const ModelWeights = {
  ...CoreWeights,
  // Extended experimental weights
  'meta/llama-4-maverick': 0.80,
  'mistral/mistral-large-2': 0.78
};

/**
 * Multi-model consensus coordinator
 */
class MultiModelConsensus {
  constructor(options = {}) {
    this.strategy = options.strategy || ConsensusStrategy.WEIGHTED;
    this.arbiterModel = options.arbiterModel || 'anthropic/claude-sonnet-4';
    this.minAgreement = options.minAgreement || 0.6;
    this.phaseId = `phase_${Date.now()}`;
  }

  /**
   * Get weight for a model
   */
  getModelWeight(modelId) {
    return ModelWeights[modelId] || ModelWeights.default;
  }

  /**
   * Calculate consensus from multiple model responses
   * @param {Array} responses - Array of {model, response, confidence}
   * @returns {Object} Consensus result
   */
  async calculateConsensus(responses) {
    if (!responses || responses.length === 0) {
      return { consensus: null, confidence: 0, method: 'no-responses' };
    }

    if (responses.length === 1) {
      return {
        consensus: responses[0].response,
        confidence: responses[0].confidence || 0.5,
        method: 'single-model'
      };
    }

    switch (this.strategy) {
      case ConsensusStrategy.MAJORITY:
        return this._majorityVote(responses);
      case ConsensusStrategy.WEIGHTED:
        return this._weightedConsensus(responses);
      case ConsensusStrategy.UNANIMOUS:
        return this._unanimousCheck(responses);
      case ConsensusStrategy.ARBITRATED:
        return this._arbitratedConsensus(responses);
      default:
        return this._weightedConsensus(responses);
    }
  }

  /**
   * Simple majority vote
   */
  _majorityVote(responses) {
    // Group by semantic similarity (simplified: exact match)
    const groups = new Map();

    for (const r of responses) {
      const key = this._extractKeyPoints(r.response);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(r);
    }

    // Find largest group
    let largest = null;
    let largestSize = 0;
    for (const [key, group] of groups) {
      if (group.length > largestSize) {
        largestSize = group.length;
        largest = group;
      }
    }

    return {
      consensus: largest[0].response,
      confidence: largestSize / responses.length,
      method: 'majority',
      agreement: largestSize,
      total: responses.length
    };
  }

  /**
   * Weighted consensus based on model capabilities
   */
  _weightedConsensus(responses) {
    let totalWeight = 0;
    let weightedConfidence = 0;

    for (const r of responses) {
      const weight = this.getModelWeight(r.model);
      totalWeight += weight;
      weightedConfidence += (r.confidence || 0.5) * weight;
    }

    // Use highest-weighted model's response as base
    const sorted = [...responses].sort((a, b) =>
      this.getModelWeight(b.model) - this.getModelWeight(a.model)
    );

    return {
      consensus: sorted[0].response,
      confidence: weightedConfidence / totalWeight,
      method: 'weighted',
      topModel: sorted[0].model,
      totalWeight
    };
  }

  /**
   * Unanimous agreement check
   */
  _unanimousCheck(responses) {
    const first = this._extractKeyPoints(responses[0].response);
    const allAgree = responses.every(r =>
      this._extractKeyPoints(r.response) === first
    );

    if (allAgree) {
      return {
        consensus: responses[0].response,
        confidence: 0.95,
        method: 'unanimous'
      };
    }

    // Fall back to weighted if not unanimous
    return {
      ...this._weightedConsensus(responses),
      method: 'unanimous-failed-weighted',
      unanimous: false
    };
  }

  /**
   * Arbitrated consensus - designated model resolves conflicts
   */
  async _arbitratedConsensus(responses) {
    // Check for agreement first
    const weighted = this._weightedConsensus(responses);

    if (weighted.confidence >= this.minAgreement) {
      return weighted;
    }

    // Need arbitration - would call arbiter model here
    // For now, use weighted result with flag
    return {
      ...weighted,
      method: 'arbitrated',
      needsArbiter: true,
      arbiterModel: this.arbiterModel
    };
  }

  /**
   * Extract key points for comparison (simplified)
   */
  _extractKeyPoints(response) {
    if (!response) return '';
    const text = typeof response === 'string' ? response : JSON.stringify(response);
    // Normalize and extract key phrases
    return text.toLowerCase().replace(/\s+/g, ' ').substring(0, 200);
  }

  /**
   * Get phase lock status
   */
  getPhaseLockStatus() {
    return {
      phaseId: this.phaseId,
      strategy: this.strategy,
      arbiterModel: this.arbiterModel,
      minAgreement: this.minAgreement,
      status: 'ACTIVE'
    };
  }
}

module.exports = {
  ConsensusStrategy,
  ModelWeights,
  MultiModelConsensus
};
