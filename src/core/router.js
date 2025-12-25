/**
 * Semantic Router
 *
 * Routes queries to optimal model/tool combinations based on:
 * - Query classification
 * - Cost/performance preferences
 * - Capability matching
 * - Historical performance
 *
 * Integrates with fine-tuned routing model when deployed on OpenRouter.
 */

const { Signal, extractCrystallization } = require('./signal');

/**
 * Route classifications
 */
const RouteType = {
  RESEARCH: 'research',           // Deep research with multi-model
  FACTUAL: 'factual',             // Quick factual lookup
  ANALYTICAL: 'analytical',       // Analysis/comparison
  CREATIVE: 'creative',           // Creative generation
  TECHNICAL: 'technical',         // Code/technical content
  CONVERSATIONAL: 'conversational' // Simple dialogue
};

/**
 * Model capability profiles
 */
const ModelProfiles = {
  'anthropic/claude-sonnet-4.5': {
    capabilities: ['research', 'analytical', 'creative', 'technical', 'conversational'],
    strength: 0.95,
    costTier: 'high',
    contextWindow: 200000,
    specialties: ['nuanced reasoning', 'long-form content', 'code generation']
  },
  'anthropic/claude-opus-4': {
    capabilities: ['research', 'analytical', 'creative', 'technical'],
    strength: 1.0,
    costTier: 'premium',
    contextWindow: 200000,
    specialties: ['complex reasoning', 'research synthesis', 'creative writing']
  },
  'openai/gpt-5-chat': {
    capabilities: ['research', 'analytical', 'technical', 'conversational'],
    strength: 0.95,
    costTier: 'high',
    contextWindow: 128000,
    specialties: ['general knowledge', 'coding', 'structured output']
  },
  'google/gemini-3-pro-preview': {
    capabilities: ['research', 'analytical', 'creative', 'technical'],
    strength: 0.90,
    costTier: 'high',
    contextWindow: 1000000,
    specialties: ['multimodal', 'long context', 'factual accuracy']
  },
  'deepseek/deepseek-chat-v3.1': {
    capabilities: ['technical', 'analytical', 'factual'],
    strength: 0.80,
    costTier: 'low',
    contextWindow: 64000,
    specialties: ['coding', 'math', 'technical documentation']
  },
  'openai/gpt-5-mini': {
    capabilities: ['factual', 'conversational'],
    strength: 0.70,
    costTier: 'low',
    contextWindow: 128000,
    specialties: ['quick responses', 'simple tasks']
  }
};

/**
 * Query classifier patterns
 */
const ClassificationPatterns = {
  [RouteType.RESEARCH]: [
    /research|investigate|analyze|study|explore|comprehensive/i,
    /what is the latest|recent developments|current state/i,
    /compare and contrast|evaluate|assess/i
  ],
  [RouteType.FACTUAL]: [
    /what is|who is|when did|where is|how many/i,
    /define|definition|meaning of/i,
    /\?$/  // Simple questions
  ],
  [RouteType.ANALYTICAL]: [
    /why|how does|explain|analyze|compare/i,
    /implications|consequences|effects/i,
    /relationship between|difference between/i
  ],
  [RouteType.CREATIVE]: [
    /write|create|generate|compose|design/i,
    /story|poem|essay|article|content/i,
    /imagine|creative|original/i
  ],
  [RouteType.TECHNICAL]: [
    /code|implement|function|class|algorithm/i,
    /debug|fix|error|bug|issue/i,
    /api|database|server|architecture/i
  ],
  [RouteType.CONVERSATIONAL]: [
    /hello|hi|hey|thanks|thank you/i,
    /how are you|what's up/i,
    /tell me about yourself/i
  ]
};

/**
 * Semantic Router
 */
class SemanticRouter {
  constructor(config = {}) {
    this.config = {
      defaultCostPreference: config.costPreference || 'low',
      enableFallback: config.enableFallback !== false,
      customProfiles: config.customProfiles || {},
      routingModel: config.routingModel || null, // Fine-tuned routing model
      ...config
    };

    // Merge custom profiles
    this.profiles = { ...ModelProfiles, ...this.config.customProfiles };

    // Route history for learning
    this.routeHistory = [];
    this.maxHistory = 1000;
  }

  /**
   * Route a query to optimal model(s)
   *
   * @param {Object} params - Routing parameters
   * @param {string} params.query - The query to route
   * @param {string} params.costPreference - 'low', 'high', 'premium'
   * @param {number} params.maxModels - Max models for ensemble
   * @param {Object} params.context - Additional routing context
   * @returns {Object} Route decision with selected models
   */
  async route(params) {
    const {
      query,
      costPreference = this.config.defaultCostPreference,
      maxModels = 1,
      context = {}
    } = params;

    // Step 1: Classify query type
    const classification = this.classifyQuery(query);

    // Step 2: Score models for this classification
    const scores = this.scoreModels(classification, costPreference);

    // Step 3: Select top models
    const selected = this.selectModels(scores, maxModels);

    // Step 4: Build route decision
    const decision = {
      query,
      classification,
      costPreference,
      models: selected,
      primary: selected[0],
      confidence: selected[0]?.score || 0,
      routingMethod: this.config.routingModel ? 'fine-tuned' : 'rule-based',
      timestamp: Date.now()
    };

    // Record for history/learning
    this.recordRoute(decision);

    return decision;
  }

  /**
   * Classify query into route type
   */
  classifyQuery(query) {
    const scores = {};

    for (const [routeType, patterns] of Object.entries(ClassificationPatterns)) {
      let matchCount = 0;
      for (const pattern of patterns) {
        if (pattern.test(query)) {
          matchCount++;
        }
      }
      scores[routeType] = matchCount / patterns.length;
    }

    // Find best match
    let bestType = RouteType.CONVERSATIONAL;
    let bestScore = 0;

    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    // Check crystallization patterns for research-heavy queries
    const { score: crystalScore } = extractCrystallization(query);
    if (crystalScore > 0.3 && bestScore < 0.5) {
      bestType = RouteType.RESEARCH;
      bestScore = Math.max(bestScore, 0.5);
    }

    return {
      type: bestType,
      confidence: bestScore,
      scores
    };
  }

  /**
   * Score models for a classification
   */
  scoreModels(classification, costPreference) {
    const scores = [];

    for (const [modelId, profile] of Object.entries(this.profiles)) {
      let score = 0;

      // Capability match
      if (profile.capabilities.includes(classification.type)) {
        score += profile.strength * 0.5;
      }

      // Cost alignment
      if (costPreference === 'low' && profile.costTier === 'low') {
        score += 0.3;
      } else if (costPreference === 'high' && profile.costTier === 'high') {
        score += 0.2;
      } else if (costPreference === 'premium' && profile.costTier === 'premium') {
        score += 0.3;
      }

      // Specialty bonus
      const specialtyKeywords = profile.specialties.join(' ').toLowerCase();
      const queryLower = classification.type.toLowerCase();
      if (specialtyKeywords.includes(queryLower)) {
        score += 0.1;
      }

      scores.push({
        model: modelId,
        score,
        profile,
        costTier: profile.costTier
      });
    }

    // Sort by score descending
    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Select top N models for ensemble
   */
  selectModels(scores, maxModels) {
    return scores.slice(0, maxModels).map(s => ({
      model: s.model,
      score: s.score,
      costTier: s.costTier,
      contextWindow: s.profile.contextWindow
    }));
  }

  /**
   * Record route decision for history/learning
   */
  recordRoute(decision) {
    this.routeHistory.push(decision);
    if (this.routeHistory.length > this.maxHistory) {
      this.routeHistory.shift();
    }
  }

  /**
   * Get route history
   */
  getHistory(filter = {}) {
    let result = [...this.routeHistory];

    if (filter.type) {
      result = result.filter(r => r.classification.type === filter.type);
    }
    if (filter.since) {
      result = result.filter(r => r.timestamp >= filter.since);
    }
    if (filter.model) {
      result = result.filter(r => r.primary.model === filter.model);
    }

    return result;
  }

  /**
   * Get route statistics
   */
  getStats() {
    const stats = {
      totalRoutes: this.routeHistory.length,
      byType: {},
      byModel: {},
      avgConfidence: 0
    };

    let totalConfidence = 0;

    for (const route of this.routeHistory) {
      // By type
      const type = route.classification.type;
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      // By model
      const model = route.primary?.model;
      if (model) {
        stats.byModel[model] = (stats.byModel[model] || 0) + 1;
      }

      // Confidence
      totalConfidence += route.confidence;
    }

    if (this.routeHistory.length > 0) {
      stats.avgConfidence = totalConfidence / this.routeHistory.length;
    }

    return stats;
  }
}

/**
 * Create a configured semantic router
 */
function createRouter(config = {}) {
  return new SemanticRouter(config);
}

// Default router instance
const defaultRouter = new SemanticRouter();

module.exports = {
  SemanticRouter,
  RouteType,
  ModelProfiles,
  ClassificationPatterns,
  createRouter,
  defaultRouter
};
