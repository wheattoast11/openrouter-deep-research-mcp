/**
 * Thermodynamic Router - JavaScript Integration Layer
 *
 * Provides integration with the existing @terminals-tech/embeddings
 * infrastructure while exposing the thermodynamic routing API.
 *
 * @module routing
 */

const logger = require('../utils/logger').child('ThermodynamicRouter');

// Default SMB attractors for business domains
const DEFAULT_SMB_ATTRACTORS = [
  {
    id: 'sales',
    name: 'Sales & Revenue',
    description: 'Customer acquisition, pipeline management, revenue tracking',
    seedPhrases: [
      'sales pipeline and deals',
      'lead generation and conversion',
      'revenue and earnings',
      'customer acquisition',
      'top customers this quarter',
      'sales forecast and projections',
      'close rate and win rate',
      'deal size and value'
    ],
    model: 'anthropic/claude-sonnet-4',
    agent: 'sales_analyst',
    temperature: 0.3
  },
  {
    id: 'operations',
    name: 'Operations & Logistics',
    description: 'Inventory management, scheduling, order fulfillment',
    seedPhrases: [
      'inventory levels and stock',
      'reorder point and supply',
      'scheduling and capacity',
      'logistics and shipping',
      'order fulfillment status',
      'warehouse operations',
      'delivery tracking',
      'production planning'
    ],
    model: 'anthropic/claude-sonnet-4',
    agent: 'operations_manager',
    temperature: 0.2
  },
  {
    id: 'finance',
    name: 'Finance & Accounting',
    description: 'Invoices, payments, cash flow, expenses',
    seedPhrases: [
      'invoice and billing',
      'payment processing',
      'cash flow statement',
      'expense tracking',
      'accounts receivable',
      'budget and spending',
      'profit margins',
      'financial reporting'
    ],
    model: 'anthropic/claude-sonnet-4',
    agent: 'finance_analyst',
    temperature: 0.1
  },
  {
    id: 'research',
    name: 'Market Research',
    description: 'Competitor analysis, market trends, opportunities',
    seedPhrases: [
      'competitor analysis',
      'market trends',
      'industry research',
      'growth opportunities',
      'market positioning',
      'competitive landscape',
      'emerging trends',
      'market share analysis'
    ],
    model: 'google/gemini-2.5-pro',
    agent: 'research_analyst',
    temperature: 0.5
  },
  {
    id: 'support',
    name: 'Customer Support',
    description: 'Issue resolution, tickets, customer satisfaction',
    seedPhrases: [
      'customer complaint',
      'support ticket',
      'issue resolution',
      'customer satisfaction',
      'service request',
      'help desk inquiry',
      'feedback and reviews',
      'escalation handling'
    ],
    model: 'anthropic/claude-sonnet-4',
    agent: 'support_specialist',
    temperature: 0.2
  }
];

// Default configuration
const DEFAULT_CONFIG = {
  boltzmannTemperature: 0.5,   // Controls sharpness of probability distribution
  minConfidenceThreshold: 0.6, // Below this, consider query ambiguous
  maxEnergyThreshold: 0.8,     // Above this, no attractor is good fit
  dimensions: 384              // MiniLM-L6-v2 default
};

/**
 * Placeholder embedding provider for demonstration.
 * Generates deterministic pseudo-embeddings based on text content.
 */
class PlaceholderEmbeddingProvider {
  constructor() {
    this.dimensions = 384;
  }

  async embed(text) {
    const normalized = text.toLowerCase().trim();
    const values = new Float32Array(this.dimensions);

    // Seed-based deterministic generation
    let seed = 0;
    for (let i = 0; i < normalized.length; i++) {
      seed = ((seed << 5) - seed + normalized.charCodeAt(i)) | 0;
    }

    // Generate pseudo-random values with semantic influence
    const words = normalized.split(/\s+/);
    for (let i = 0; i < this.dimensions; i++) {
      const charInfluence = Math.sin(seed * (i + 1) * 0.001);
      const wordInfluence = words.reduce((acc, word, wi) => {
        return acc + Math.cos((word.charCodeAt(0) || 0) * (i + wi + 1) * 0.01);
      }, 0) / Math.max(words.length, 1);

      values[i] = (charInfluence + wordInfluence * 0.5) / 1.5;
    }

    // L2 normalize
    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      norm += values[i] * values[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        values[i] /= norm;
      }
    }

    return { values, dimensions: this.dimensions, normalized: true };
  }

  async embedBatch(texts) {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  similarity(a, b) {
    const vecA = a instanceof Float32Array ? a : a.values;
    const vecB = b instanceof Float32Array ? b : b.values;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dot / denominator : 0;
  }
}

/**
 * Real embedding provider adapter for @terminals-tech/embeddings
 */
class RealEmbeddingProviderAdapter {
  constructor(provider) {
    this._provider = provider;
    this.dimensions = provider.dimensions || 384;
  }

  async embed(text) {
    const result = await this._provider.embed(text);
    return {
      values: result.values instanceof Float32Array ? result.values : new Float32Array(result.values || result),
      dimensions: result.dimensions || this.dimensions,
      normalized: result.normalized ?? true
    };
  }

  async embedBatch(texts) {
    if (typeof this._provider.embedBatch === 'function') {
      const results = await this._provider.embedBatch(texts);
      return results.map(r => ({
        values: r.values instanceof Float32Array ? r.values : new Float32Array(r.values || r),
        dimensions: r.dimensions || this.dimensions,
        normalized: r.normalized ?? true
      }));
    }
    return Promise.all(texts.map(t => this.embed(t)));
  }

  similarity(a, b) {
    if (typeof this._provider.similarity === 'function') {
      return this._provider.similarity(a, b);
    }
    const vecA = a instanceof Float32Array ? a : (a.values || a);
    const vecB = b instanceof Float32Array ? b : (b.values || b);

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dot / denominator : 0;
  }
}

/**
 * ThermodynamicRouter
 *
 * Routes queries to attractors using energy-based dynamics.
 * Lower energy = better semantic match.
 */
class ThermodynamicRouter {
  constructor(embeddingProvider, config = {}) {
    this.attractors = new Map();
    this.embeddingProvider = embeddingProvider || new PlaceholderEmbeddingProvider();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialized = false;
  }

  /**
   * Initialize router with attractor definitions.
   * Computes centroid embeddings for each attractor from seed phrases.
   */
  async initialize(attractorDefs = DEFAULT_SMB_ATTRACTORS) {
    this.attractors.clear();
    logger.info('Initializing thermodynamic router', { attractorCount: attractorDefs.length });

    for (const def of attractorDefs) {
      // Embed all seed phrases
      const embeddings = await this.embeddingProvider.embedBatch(def.seedPhrases);

      // Compute centroid (mean of all seed embeddings)
      const centroid = new Float32Array(this.config.dimensions);
      for (const emb of embeddings) {
        for (let i = 0; i < this.config.dimensions; i++) {
          centroid[i] += emb.values[i];
        }
      }
      for (let i = 0; i < this.config.dimensions; i++) {
        centroid[i] /= embeddings.length;
      }

      // L2 normalize centroid
      let norm = 0;
      for (let i = 0; i < this.config.dimensions; i++) {
        norm += centroid[i] * centroid[i];
      }
      norm = Math.sqrt(norm);
      if (norm > 0) {
        for (let i = 0; i < this.config.dimensions; i++) {
          centroid[i] /= norm;
        }
      }

      // Compute variance (spread of seed phrases around centroid)
      let variance = 0;
      for (const emb of embeddings) {
        const dist = this._computeDistance(emb.values, centroid);
        variance += dist * dist;
      }
      variance = Math.sqrt(variance / embeddings.length);

      const attractor = {
        id: def.id,
        name: def.name,
        description: def.description,
        centroid,
        seedPhrases: def.seedPhrases,
        model: def.model,
        agent: def.agent,
        temperature: def.temperature ?? 0.3,
        variance
      };

      this.attractors.set(def.id, attractor);
      logger.debug('Attractor initialized', { id: def.id, variance: variance.toFixed(4) });
    }

    this.initialized = true;
    logger.info('Thermodynamic router initialized', { attractorCount: this.attractors.size });
  }

  /**
   * Compute Euclidean distance between two vectors.
   */
  _computeDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Compute energy for a query embedding relative to an attractor.
   */
  computeEnergy(queryEmbedding, attractor) {
    const distance = this._computeDistance(queryEmbedding, attractor.centroid);
    const normalizedDistance = distance / (1 + attractor.variance);
    const energy = normalizedDistance;

    return {
      attractorId: attractor.id,
      energy,
      distance,
      boltzmannProbability: 0 // Computed in route()
    };
  }

  /**
   * Compute the full energy landscape for a query.
   */
  computeEnergyLandscape(queryEmbedding) {
    const results = [];
    let partitionFunction = 0;

    for (const attractor of this.attractors.values()) {
      const result = this.computeEnergy(queryEmbedding, attractor);
      results.push(result);
      partitionFunction += Math.exp(-result.energy / this.config.boltzmannTemperature);
    }

    for (const result of results) {
      const unnormalizedProb = Math.exp(-result.energy / this.config.boltzmannTemperature);
      result.boltzmannProbability = unnormalizedProb / partitionFunction;
    }

    results.sort((a, b) => a.energy - b.energy);
    return results;
  }

  /**
   * Route a natural language query to the best attractor.
   */
  async route(query) {
    if (!this.initialized) {
      await this.initialize();
    }

    const queryResult = await this.embeddingProvider.embed(query);
    const queryEmbedding = queryResult.values;
    const landscape = this.computeEnergyLandscape(queryEmbedding);

    const best = landscape[0];
    const second = landscape[1];

    const energyGap = second ? second.energy - best.energy : 1;
    const absoluteConfidence = 1 - Math.min(best.energy / this.config.maxEnergyThreshold, 1);
    const relativeConfidence = energyGap / (energyGap + 0.1);
    const confidence = Math.sqrt(absoluteConfidence * relativeConfidence);

    let entropy = 0;
    for (const result of landscape) {
      if (result.boltzmannProbability > 0) {
        entropy -= result.boltzmannProbability * Math.log2(result.boltzmannProbability);
      }
    }
    const maxEntropy = Math.log2(landscape.length);
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

    const selectedAttractor = this.attractors.get(best.attractorId);
    if (!selectedAttractor) {
      throw new Error(`Attractor ${best.attractorId} not found`);
    }

    const totalMass = landscape.reduce((sum, r) => sum + r.boltzmannProbability, 0);

    const decision = {
      selectedAttractor: best.attractorId,
      model: selectedAttractor.model,
      agent: selectedAttractor.agent,
      temperature: selectedAttractor.temperature,
      confidence,
      energyLandscape: landscape,
      query,
      queryEmbedding,
      timestamp: Date.now(),
      metadata: {
        topEnergy: best.energy,
        secondEnergy: second?.energy ?? Infinity,
        energyGap,
        entropyScore: normalizedEntropy,
        totalMass
      }
    };

    logger.debug('Routing decision', {
      query: query.substring(0, 50),
      selected: best.attractorId,
      confidence: confidence.toFixed(3),
      topEnergy: best.energy.toFixed(4)
    });

    return decision;
  }

  /**
   * Batch route multiple queries efficiently.
   */
  async routeBatch(queries) {
    return Promise.all(queries.map(q => this.route(q)));
  }

  getAttractor(id) {
    return this.attractors.get(id);
  }

  getAttractors() {
    return Array.from(this.attractors.values());
  }

  isInitialized() {
    return this.initialized;
  }

  getConfig() {
    return { ...this.config };
  }

  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Format routing decision for display.
 */
function formatRoutingDecision(decision) {
  const lines = [
    '=== Thermodynamic Routing Decision ===',
    '',
    `Query: "${decision.query}"`,
    `Selected: ${decision.selectedAttractor}`,
    `Model: ${decision.model}`,
    decision.agent ? `Agent: ${decision.agent}` : null,
    `Temperature: ${decision.temperature}`,
    `Confidence: ${(decision.confidence * 100).toFixed(1)}%`,
    '',
    '--- Energy Landscape ---'
  ];

  for (const result of decision.energyLandscape) {
    const bar = '|'.repeat(Math.round(result.boltzmannProbability * 20));
    lines.push(
      `${result.attractorId.padEnd(12)} E=${result.energy.toFixed(4)} ` +
      `P=${(result.boltzmannProbability * 100).toFixed(1).padStart(5)}% ${bar}`
    );
  }

  lines.push('');
  lines.push(`Energy Gap: ${decision.metadata.energyGap.toFixed(4)}`);
  lines.push(`Entropy: ${decision.metadata.entropyScore.toFixed(4)}`);

  return lines.filter(l => l !== null).join('\n');
}

/**
 * Create a router with real embeddings from dbClient.
 * Falls back to placeholder if embeddings not available.
 */
async function createRouter(config = {}) {
  let embeddingProvider;

  try {
    const dbClient = require('../utils/dbClient');
    await dbClient.waitForEmbedder();

    if (dbClient.isEmbedderReady()) {
      // Create adapter for real embeddings
      embeddingProvider = {
        dimensions: 384,
        async embed(text) {
          const embedding = await dbClient.generateEmbedding(text);
          if (!embedding) {
            throw new Error('Failed to generate embedding');
          }
          return {
            values: new Float32Array(embedding),
            dimensions: 384,
            normalized: true
          };
        },
        async embedBatch(texts) {
          const results = [];
          for (const text of texts) {
            const embedding = await dbClient.generateEmbedding(text);
            results.push({
              values: new Float32Array(embedding || new Array(384).fill(0)),
              dimensions: 384,
              normalized: true
            });
          }
          return results;
        },
        similarity(a, b) {
          const vecA = a instanceof Float32Array ? a : (a.values || a);
          const vecB = b instanceof Float32Array ? b : (b.values || b);
          let dot = 0, normA = 0, normB = 0;
          for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
          }
          const denom = Math.sqrt(normA) * Math.sqrt(normB);
          return denom > 0 ? dot / denom : 0;
        }
      };
      logger.info('Using real embeddings for thermodynamic router');
    } else {
      logger.warn('Embedder not ready, using placeholder embeddings');
      embeddingProvider = new PlaceholderEmbeddingProvider();
    }
  } catch (err) {
    logger.warn('Failed to load real embeddings, using placeholder', { error: err.message });
    embeddingProvider = new PlaceholderEmbeddingProvider();
  }

  const router = new ThermodynamicRouter(embeddingProvider, config);
  await router.initialize();
  return router;
}

/**
 * Demonstration function showing router in action.
 */
async function demonstrateRouter() {
  console.log('Initializing Thermodynamic Router...\n');

  const router = new ThermodynamicRouter();
  await router.initialize();

  console.log('Attractors initialized:');
  for (const attractor of router.getAttractors()) {
    console.log(`  - ${attractor.id}: ${attractor.name} (variance: ${attractor.variance.toFixed(4)})`);
  }
  console.log('');

  const testQueries = [
    'Who are our top customers this quarter?',
    'When should we reorder inventory?',
    'Research our competitor\'s new product',
    'Show me unpaid invoices over 30 days',
    'What are the most common customer complaints?',
    'Forecast revenue for next quarter',
    'Track shipment status for order #12345',
    'Analyze market trends in our industry'
  ];

  for (const query of testQueries) {
    console.log('-'.repeat(60));
    const decision = await router.route(query);
    console.log(formatRoutingDecision(decision));
    console.log('');
  }
}

module.exports = {
  ThermodynamicRouter,
  PlaceholderEmbeddingProvider,
  RealEmbeddingProviderAdapter,
  formatRoutingDecision,
  createRouter,
  demonstrateRouter,
  DEFAULT_SMB_ATTRACTORS,
  DEFAULT_CONFIG
};

// Run demonstration if executed directly
if (require.main === module) {
  demonstrateRouter().catch(console.error);
}
