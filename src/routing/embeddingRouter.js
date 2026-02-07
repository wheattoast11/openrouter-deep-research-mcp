/**
 * Embedding-based Model Router
 *
 * Uses @terminals-tech/embeddings for local, fast model selection.
 * Replaces LLM-based classification with semantic similarity matching.
 *
 * @module routing/embeddingRouter
 */

'use strict';

const logger = require('../utils/logger').child('EmbeddingRouter');
const { ROUTING, DEFAULT_MODELS } = require('../config/constants');

/**
 * Domain seed phrases for semantic matching
 * These are embedded once at initialization
 */
const DOMAIN_SEEDS = {
  general: [
    'general knowledge question',
    'explain this topic',
    'tell me about',
    'what is the meaning of',
    'describe how'
  ],
  technical: [
    'technical implementation',
    'system architecture',
    'API design',
    'infrastructure setup',
    'engineering solution'
  ],
  reasoning: [
    'analyze this problem',
    'logical deduction',
    'compare and contrast',
    'evaluate the tradeoffs',
    'critical analysis'
  ],
  coding: [
    'write code for',
    'implement a function',
    'debug this error',
    'refactor the code',
    'programming solution'
  ],
  creative: [
    'write a story',
    'creative writing',
    'generate ideas',
    'brainstorm solutions',
    'imaginative content'
  ],
  search: [
    'find information about',
    'research the topic',
    'look up',
    'search for',
    'discover facts about'
  ],
  multimodal: [
    'analyze this image',
    'describe the picture',
    'visual content',
    'image understanding',
    'what do you see'
  ],
  vision: [
    'look at this screenshot',
    'analyze the diagram',
    'read the chart',
    'extract text from image',
    'visual analysis'
  ]
};

/**
 * Complexity seed phrases
 */
const COMPLEXITY_SEEDS = {
  simple: [
    'quick question',
    'simple lookup',
    'basic fact',
    'short answer needed',
    'straightforward query'
  ],
  moderate: [
    'explain in detail',
    'moderate analysis',
    'some depth needed',
    'typical question',
    'standard complexity'
  ],
  complex: [
    'deep research required',
    'comprehensive analysis',
    'multi-faceted problem',
    'extensive investigation',
    'complex reasoning needed'
  ]
};

class EmbeddingRouter {
  constructor() {
    this.initialized = false;
    this.embeddingProvider = null;
    this.domainEmbeddings = new Map();
    this.complexityEmbeddings = new Map();
    this.modelProfiles = new Map();
  }

  /**
   * Initialize the router with embeddings
   */
  async initialize() {
    if (this.initialized) return true;

    try {
      // Get embedding provider from dbClient (which uses @terminals-tech/embeddings)
      const dbClient = require('../utils/dbClient');
      await dbClient.waitForEmbedder();

      if (!dbClient.isEmbedderReady()) {
        logger.warn('Embedder not ready, embedding routing disabled');
        return false;
      }

      // Pre-compute domain embeddings (centroids of seed phrases)
      logger.info('Computing domain embeddings');
      for (const [domain, seeds] of Object.entries(DOMAIN_SEEDS)) {
        const embeddings = await Promise.all(
          seeds.map(s => dbClient.generateEmbedding(s))
        );
        // Compute centroid
        const centroid = this.computeCentroid(embeddings);
        this.domainEmbeddings.set(domain, centroid);
      }

      // Pre-compute complexity embeddings
      logger.info('Computing complexity embeddings');
      for (const [level, seeds] of Object.entries(COMPLEXITY_SEEDS)) {
        const embeddings = await Promise.all(
          seeds.map(s => dbClient.generateEmbedding(s))
        );
        const centroid = this.computeCentroid(embeddings);
        this.complexityEmbeddings.set(level, centroid);
      }

      // Build model profiles from DEFAULT_MODELS
      this.buildModelProfiles();

      this.initialized = true;
      logger.info('EmbeddingRouter initialized', {
        domains: this.domainEmbeddings.size,
        complexityLevels: this.complexityEmbeddings.size,
        modelProfiles: this.modelProfiles.size
      });

      return true;
    } catch (err) {
      logger.error('Failed to initialize EmbeddingRouter', { error: err.message });
      return false;
    }
  }

  /**
   * Compute centroid (mean) of embeddings
   */
  computeCentroid(embeddings) {
    // Filter out null/invalid embeddings
    const validEmbeddings = (embeddings || []).filter(e => e && e.length > 0);
    if (validEmbeddings.length === 0) return null;

    const dim = validEmbeddings[0].length;
    const centroid = new Float32Array(dim);

    for (const emb of validEmbeddings) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += emb[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      centroid[i] /= validEmbeddings.length;
    }

    // L2 normalize
    let norm = 0;
    for (let i = 0; i < dim; i++) {
      norm += centroid[i] * centroid[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dim; i++) {
        centroid[i] /= norm;
      }
    }

    return centroid;
  }

  /**
   * Build model profiles from config
   */
  buildModelProfiles() {
    const allModels = [
      ...DEFAULT_MODELS.HIGH_COST.map(m => ({ ...m, tier: 'high' })),
      ...DEFAULT_MODELS.LOW_COST.map(m => ({ ...m, tier: 'low' })),
      ...(DEFAULT_MODELS.VERY_LOW_COST || []).map(m => ({ ...m, tier: 'veryLow' }))
    ];

    for (const model of allModels) {
      this.modelProfiles.set(model.name, {
        name: model.name,
        domains: model.domains || ['general'],
        tier: model.tier
      });
    }
  }

  /**
   * Cosine similarity between two vectors
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  /**
   * Classify query domain using embeddings
   * @param {string} query - The query text
   * @returns {Promise<{domain: string, confidence: number}>}
   */
  async classifyDomain(query) {
    if (!this.initialized) {
      const ok = await this.initialize();
      if (!ok) return { domain: 'general', confidence: 0, fallback: true };
    }

    try {
      const dbClient = require('../utils/dbClient');
      const queryEmbedding = await dbClient.generateEmbedding(query);

      let bestDomain = 'general';
      let bestScore = -1;

      for (const [domain, centroid] of this.domainEmbeddings) {
        if (!centroid || !queryEmbedding) continue;
        const score = this.cosineSimilarity(queryEmbedding, centroid);
        if (score > bestScore) {
          bestScore = score;
          bestDomain = domain;
        }
      }

      logger.debug('Domain classified via embeddings', {
        query: query.slice(0, 50),
        domain: bestDomain,
        confidence: bestScore.toFixed(3)
      });

      return { domain: bestDomain, confidence: bestScore };
    } catch (err) {
      logger.warn('Embedding classification failed', { error: err.message });
      return { domain: 'general', confidence: 0, fallback: true };
    }
  }

  /**
   * Assess query complexity using embeddings
   * @param {string} query - The query text
   * @returns {Promise<{complexity: string, confidence: number}>}
   */
  async assessComplexity(query) {
    if (!this.initialized) {
      const ok = await this.initialize();
      if (!ok) return { complexity: 'moderate', confidence: 0, fallback: true };
    }

    try {
      const dbClient = require('../utils/dbClient');
      const queryEmbedding = await dbClient.generateEmbedding(query);

      let bestLevel = 'moderate';
      let bestScore = -1;

      for (const [level, centroid] of this.complexityEmbeddings) {
        if (!centroid || !queryEmbedding) continue;
        const score = this.cosineSimilarity(queryEmbedding, centroid);
        if (score > bestScore) {
          bestScore = score;
          bestLevel = level;
        }
      }

      // Heuristic boost: very short queries are likely simple
      if (query.split(' ').length <= 5 && bestLevel !== 'simple') {
        bestLevel = 'simple';
        bestScore = Math.max(bestScore, 0.7);
      }

      // Heuristic boost: very long queries are likely complex
      if (query.split(' ').length > 50 && bestLevel !== 'complex') {
        bestLevel = 'complex';
        bestScore = Math.max(bestScore, 0.7);
      }

      logger.debug('Complexity assessed via embeddings', {
        query: query.slice(0, 50),
        complexity: bestLevel,
        confidence: bestScore.toFixed(3)
      });

      return { complexity: bestLevel, confidence: bestScore };
    } catch (err) {
      logger.warn('Embedding complexity assessment failed', { error: err.message });
      return { complexity: 'moderate', confidence: 0, fallback: true };
    }
  }

  /**
   * Select best model for query using embeddings
   * @param {string} query - The query text
   * @param {string} costPreference - 'high' or 'low'
   * @param {number} agentIndex - For round-robin within tier
   * @returns {Promise<{model: string, domain: string, complexity: string, confidence: number}>}
   */
  async selectModel(query, costPreference = 'low', agentIndex = 0) {
    const [domainResult, complexityResult] = await Promise.all([
      this.classifyDomain(query),
      this.assessComplexity(query)
    ]);

    const { domain, confidence: domainConf } = domainResult;
    const { complexity, confidence: complexityConf } = complexityResult;

    // Filter models by cost tier
    const tierModels = costPreference === 'high'
      ? DEFAULT_MODELS.HIGH_COST
      : DEFAULT_MODELS.LOW_COST;

    // Find models matching the domain
    let candidates = tierModels.filter(m => m.domains.includes(domain));

    // Fallback to all tier models if no domain match
    if (candidates.length === 0) {
      candidates = tierModels;
    }

    // Round-robin selection within candidates
    const selectedIndex = Math.abs(agentIndex) % candidates.length;
    const selectedModel = candidates[selectedIndex].name;

    const avgConfidence = (domainConf + complexityConf) / 2;

    logger.info('Model selected via embeddings', {
      query: query.slice(0, 50),
      model: selectedModel,
      domain,
      complexity,
      confidence: avgConfidence.toFixed(3),
      costPreference
    });

    return {
      model: selectedModel,
      domain,
      complexity,
      confidence: avgConfidence,
      reason: `embedding-based: domain=${domain}, complexity=${complexity}`
    };
  }

  /**
   * Check if embedding routing is enabled and ready
   */
  isReady() {
    return this.initialized && ROUTING.EMBEDDING_ROUTING_ENABLED;
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create the embedding router instance
 */
async function getEmbeddingRouter() {
  if (!instance) {
    instance = new EmbeddingRouter();
  }
  if (!instance.initialized && ROUTING.EMBEDDING_ROUTING_ENABLED) {
    await instance.initialize();
  }
  return instance;
}

module.exports = {
  EmbeddingRouter,
  getEmbeddingRouter,
  DOMAIN_SEEDS,
  COMPLEXITY_SEEDS
};
