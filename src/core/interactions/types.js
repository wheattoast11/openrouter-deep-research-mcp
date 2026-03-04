/**
 * Google Interactions API Primitive (Terminals Implementation)
 *
 * Defines the 'Interaction' typed object, representing a discreet unit of
 * intent-driven exchange between a User and the System.
 *
 * Aligns with the Terminals/Google "Interaction Combinator" net view.
 *
 * v1.14.1: Added IntentClassifier for semantic intent extraction
 */

'use strict';

const crypto = require('crypto');

// Native JS validation used to avoid external dependencies like Joi

const InteractionType = {
  RESEARCH: 'RESEARCH',
  CODE_GENERATION: 'CODE_GENERATION',
  VERIFICATION: 'VERIFICATION',
  SYSTEM_COMMAND: 'SYSTEM_COMMAND',
  CREATIVE: 'CREATIVE',
  ANALYTICAL: 'ANALYTICAL',
  FACTUAL: 'FACTUAL',
  UNKNOWN: 'UNKNOWN'
};

const InteractionStatus = {
  PENDING: 'PENDING',
  ROUTING: 'ROUTING',
  EXECUTING: 'EXECUTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
};

/**
 * Intent categories for query classification
 */
const IntentCategory = {
  RESEARCH: 'research',           // Deep research queries
  FACTUAL: 'factual',             // Simple fact lookups
  ANALYTICAL: 'analytical',       // Analysis/comparison tasks
  CREATIVE: 'creative',           // Creative generation
  CODE: 'code',                   // Code-related queries
  SYSTEM: 'system',               // System commands
  CONVERSATIONAL: 'conversational', // Casual conversation
  UNKNOWN: 'unknown'
};

/**
 * Model tier recommendations based on intent
 */
const ModelTierForIntent = {
  [IntentCategory.RESEARCH]: ['high', 'medium'],
  [IntentCategory.FACTUAL]: ['low', 'medium'],
  [IntentCategory.ANALYTICAL]: ['high', 'medium'],
  [IntentCategory.CREATIVE]: ['high', 'medium'],
  [IntentCategory.CODE]: ['high', 'medium'],
  [IntentCategory.SYSTEM]: ['low'],
  [IntentCategory.CONVERSATIONAL]: ['low'],
  [IntentCategory.UNKNOWN]: ['medium']
};

/**
 * Intent patterns for classification
 * Each pattern has regex, category, and confidence boost
 */
const INTENT_PATTERNS = [
  // Research patterns
  { regex: /\b(research|investigate|explore|study|analyze in depth)\b/i, category: IntentCategory.RESEARCH, boost: 0.3 },
  { regex: /\b(comprehensive|thorough|detailed analysis|deep dive)\b/i, category: IntentCategory.RESEARCH, boost: 0.2 },
  { regex: /\b(state of the art|latest developments|cutting.?edge)\b/i, category: IntentCategory.RESEARCH, boost: 0.25 },

  // Factual patterns
  { regex: /\b(what is|who is|when did|where is|define|meaning of)\b/i, category: IntentCategory.FACTUAL, boost: 0.25 },
  { regex: /\b(how many|how much|how old|how long|how far)\b/i, category: IntentCategory.FACTUAL, boost: 0.2 },
  { regex: /\b(tell me about|explain briefly|quick question)\b/i, category: IntentCategory.FACTUAL, boost: 0.15 },

  // Analytical patterns
  { regex: /\b(compare|contrast|analyze|evaluate|assess)\b/i, category: IntentCategory.ANALYTICAL, boost: 0.25 },
  { regex: /\b(pros and cons|advantages|disadvantages|trade.?offs)\b/i, category: IntentCategory.ANALYTICAL, boost: 0.2 },
  { regex: /\b(difference between|similarities|relationship)\b/i, category: IntentCategory.ANALYTICAL, boost: 0.2 },

  // Creative patterns
  { regex: /\b(write|create|generate|compose|draft)\b/i, category: IntentCategory.CREATIVE, boost: 0.2 },
  { regex: /\b(story|poem|essay|article|content)\b/i, category: IntentCategory.CREATIVE, boost: 0.15 },
  { regex: /\b(creative|imaginative|original|unique)\b/i, category: IntentCategory.CREATIVE, boost: 0.15 },

  // Code patterns
  { regex: /\b(code|implement|function|class|algorithm)\b/i, category: IntentCategory.CODE, boost: 0.25 },
  { regex: /\b(debug|fix|refactor|optimize|test)\b/i, category: IntentCategory.CODE, boost: 0.2 },
  { regex: /\b(python|javascript|typescript|java|rust|go)\b/i, category: IntentCategory.CODE, boost: 0.15 },
  { regex: /```[\s\S]*```/i, category: IntentCategory.CODE, boost: 0.3 },

  // System patterns
  { regex: /\b(status|config|settings|help|version)\b/i, category: IntentCategory.SYSTEM, boost: 0.3 },
  { regex: /^(zero|mcp)\s+(status|config|help)/i, category: IntentCategory.SYSTEM, boost: 0.4 },

  // Conversational patterns
  { regex: /\b(hello|hi|hey|thanks|thank you|bye|goodbye)\b/i, category: IntentCategory.CONVERSATIONAL, boost: 0.3 },
  { regex: /\b(how are you|what do you think|your opinion)\b/i, category: IntentCategory.CONVERSATIONAL, boost: 0.2 }
];

/**
 * Intent classification result
 */
class IntentResult {
  /**
   * @param {object} params
   * @param {string} params.category - Primary intent category
   * @param {number} params.confidence - Confidence score [0, 1]
   * @param {Array<string>} params.suggestedTiers - Recommended model tiers
   * @param {Array<{category: string, score: number}>} params.scores - All category scores
   * @param {object} params.metadata - Additional classification metadata
   */
  constructor({ category, confidence, suggestedTiers, scores, metadata }) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.category = category;
    this.confidence = confidence;
    this.suggestedTiers = suggestedTiers;
    this.scores = scores;
    this.metadata = metadata || {};
  }

  /**
   * Check if classification is high confidence
   * @returns {boolean}
   */
  isHighConfidence() {
    return this.confidence >= 0.7;
  }

  /**
   * Get primary model tier recommendation
   * @returns {string}
   */
  get primaryTier() {
    return this.suggestedTiers[0] || 'medium';
  }

  /**
   * Serialize to JSON
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      category: this.category,
      confidence: this.confidence,
      suggestedTiers: this.suggestedTiers,
      scores: this.scores,
      metadata: this.metadata,
      isHighConfidence: this.isHighConfidence(),
      primaryTier: this.primaryTier
    };
  }
}

/**
 * IntentClassifier - Classifies user queries into intent categories
 *
 * Uses pattern matching and heuristics to determine query intent.
 * Provides model tier recommendations based on intent category.
 *
 * @class
 */
class IntentClassifier {
  /**
   * @param {object} [options]
   * @param {number} [options.defaultConfidence=0.5] - Base confidence for unknown intents
   * @param {number} [options.minConfidence=0.3] - Minimum confidence threshold
   * @param {Array} [options.customPatterns] - Additional classification patterns
   */
  constructor(options = {}) {
    this.defaultConfidence = options.defaultConfidence ?? 0.5;
    this.minConfidence = options.minConfidence ?? 0.3;
    this.patterns = [...INTENT_PATTERNS, ...(options.customPatterns || [])];
    this._history = [];
    this._historyLimit = 100;
  }

  /**
   * Classify a query into an intent category
   *
   * @param {string} query - The user query to classify
   * @param {object} [context] - Optional context (session history, etc.)
   * @returns {IntentResult}
   */
  classify(query, context = {}) {
    if (!query || typeof query !== 'string') {
      return new IntentResult({
        category: IntentCategory.UNKNOWN,
        confidence: 0,
        suggestedTiers: ['medium'],
        scores: [],
        metadata: { error: 'Invalid query' }
      });
    }

    // Initialize scores for all categories
    const scores = {};
    for (const cat of Object.values(IntentCategory)) {
      scores[cat] = 0;
    }

    // Apply pattern matching
    const matchedPatterns = [];
    for (const pattern of this.patterns) {
      if (pattern.regex.test(query)) {
        scores[pattern.category] += pattern.boost;
        matchedPatterns.push({
          category: pattern.category,
          boost: pattern.boost,
          pattern: pattern.regex.source.slice(0, 30)
        });
      }
    }

    // Apply heuristics
    this._applyHeuristics(query, scores, context);

    // Find winner
    let maxScore = 0;
    let winner = IntentCategory.UNKNOWN;
    const scoreArray = [];

    for (const [cat, score] of Object.entries(scores)) {
      scoreArray.push({ category: cat, score });
      if (score > maxScore) {
        maxScore = score;
        winner = cat;
      }
    }

    // Calculate confidence (normalize to [0, 1])
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    let confidence = totalScore > 0
      ? maxScore / totalScore
      : this.defaultConfidence;

    // Boost confidence if multiple patterns matched same category
    const categoryMatches = matchedPatterns.filter(p => p.category === winner).length;
    if (categoryMatches > 1) {
      confidence = Math.min(1, confidence + 0.1 * (categoryMatches - 1));
    }

    // Apply minimum confidence
    if (maxScore < 0.1) {
      winner = IntentCategory.UNKNOWN;
      confidence = this.defaultConfidence;
    }

    // Get model tier recommendations
    const suggestedTiers = ModelTierForIntent[winner] || ['medium'];

    const result = new IntentResult({
      category: winner,
      confidence: Math.min(1, Math.max(0, confidence)),
      suggestedTiers,
      scores: scoreArray.sort((a, b) => b.score - a.score).slice(0, 5),
      metadata: {
        queryLength: query.length,
        matchedPatterns: matchedPatterns.length,
        patterns: matchedPatterns.slice(0, 5),
        hasContext: Object.keys(context).length > 0
      }
    });

    // Record in history
    this._recordHistory(query, result);

    return result;
  }

  /**
   * Apply heuristic rules for classification
   *
   * @private
   * @param {string} query
   * @param {object} scores
   * @param {object} context
   */
  _applyHeuristics(query, scores, context) {
    // Query length heuristics
    const wordCount = query.split(/\s+/).length;

    if (wordCount < 5) {
      scores[IntentCategory.FACTUAL] += 0.1;
      scores[IntentCategory.SYSTEM] += 0.05;
    } else if (wordCount > 50) {
      scores[IntentCategory.RESEARCH] += 0.15;
      scores[IntentCategory.ANALYTICAL] += 0.1;
    }

    // Question mark presence
    if (query.includes('?')) {
      scores[IntentCategory.FACTUAL] += 0.1;
      scores[IntentCategory.ANALYTICAL] += 0.05;
    }

    // Technical indicator density
    const technicalTerms = query.match(/\b(api|sdk|framework|database|algorithm|architecture|protocol|interface)\b/gi);
    if (technicalTerms && technicalTerms.length > 1) {
      scores[IntentCategory.RESEARCH] += 0.1;
      scores[IntentCategory.CODE] += 0.05;
    }

    // Context-based adjustments
    if (context.previousIntent) {
      // Continuity bonus - likely same category as previous
      scores[context.previousIntent] += 0.05;
    }

    if (context.isFollowUp) {
      // Follow-ups often inherit parent intent
      if (context.parentIntent) {
        scores[context.parentIntent] += 0.1;
      }
    }
  }

  /**
   * Record classification in history for analysis
   *
   * @private
   * @param {string} query
   * @param {IntentResult} result
   */
  _recordHistory(query, result) {
    this._history.push({
      query: query.slice(0, 100),
      result: result.toJSON(),
      timestamp: Date.now()
    });

    while (this._history.length > this._historyLimit) {
      this._history.shift();
    }
  }

  /**
   * Get classification history
   *
   * @param {number} [limit=10]
   * @returns {Array}
   */
  getHistory(limit = 10) {
    return this._history.slice(-limit);
  }

  /**
   * Get classification statistics
   *
   * @returns {object}
   */
  getStats() {
    const byCategory = {};
    let totalConfidence = 0;

    for (const entry of this._history) {
      const cat = entry.result.category;
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      totalConfidence += entry.result.confidence;
    }

    return {
      total: this._history.length,
      byCategory,
      avgConfidence: this._history.length > 0
        ? totalConfidence / this._history.length
        : 0
    };
  }

  /**
   * Export state for debugging
   *
   * @returns {object}
   */
  exportState() {
    return {
      patternCount: this.patterns.length,
      historySize: this._history.length,
      stats: this.getStats(),
      recentHistory: this.getHistory(10)
    };
  }
}

/**
 * Quick intent classification utility
 *
 * @param {string} query
 * @param {object} [context]
 * @returns {IntentResult}
 */
function classifyIntent(query, context = {}) {
  const classifier = new IntentClassifier();
  return classifier.classify(query, context);
}

/**
 * Global classifier singleton
 */
let _globalClassifier = null;

/**
 * Get or create global classifier
 *
 * @param {object} [options]
 * @returns {IntentClassifier}
 */
function getGlobalClassifier(options) {
  if (!_globalClassifier) {
    _globalClassifier = new IntentClassifier(options);
  }
  return _globalClassifier;
}

class Interaction {
  constructor({
    id,
    type = InteractionType.UNKNOWN,
    input, // The raw query or command
    context = {}, // Session context
    constraints = {} // Cost, time, model constraints
  }) {
    this.id = id || crypto.randomUUID();
    this.type = type;
    this.input = input;
    this.context = context;
    this.constraints = constraints;
    this.status = InteractionStatus.PENDING;
    this.trace = []; // Execution trace
    this.signals = []; // Output signals
    this.cost = 0;
    
    // Google Interactions API / Terminals Isomorphism
    // Represents the multi-turn exchange state
    this.turns = [
      {
        role: 'user',
        content: input,
        timestamp: Date.now()
      }
    ];
  }

  addTrace(step) {
    this.trace.push({
      timestamp: Date.now(),
      step
    });
  }
  
  addTurn(role, content, metadata = {}) {
    this.turns.push({
      role,
      content,
      timestamp: Date.now(),
      metadata
    });
  }

  complete(result, signal) {
    this.status = InteractionStatus.COMPLETED;
    this.result = result;
    if (signal) this.signals.push(signal);
    this.addTurn('system', result, { signalId: signal?.id });
    this.addTrace('completed');
  }

  fail(error) {
    this.status = InteractionStatus.FAILED;
    this.error = error;
    this.addTurn('system', `Error: ${error.message}`, { error: true });
    this.addTrace('failed');
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      input: this.input,
      trace: this.trace,
      result: this.result
    };
  }
}

module.exports = {
  // Core types
  Interaction,
  InteractionType,
  InteractionStatus,

  // Intent classification
  IntentCategory,
  IntentResult,
  IntentClassifier,
  ModelTierForIntent,
  INTENT_PATTERNS,
  classifyIntent,
  getGlobalClassifier
};
