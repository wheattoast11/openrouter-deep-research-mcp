/**
 * Thermodynamic Router for SMB Query Routing
 *
 * Routes natural language queries to appropriate model/agent combinations
 * using energy-based attractor dynamics. Queries "fall" toward the
 * lowest-energy attractor in embedding space.
 *
 * Thermodynamic Metaphor:
 * - Attractors = Energy wells in latent space
 * - Query embedding = Particle position
 * - Distance to attractor = Potential energy
 * - Routing = Finding minimum energy state
 *
 * @module thermodynamicRouter
 */

// Type definitions for embedding integration
interface EmbeddingResult {
  values: Float32Array;
  dimensions: number;
  normalized: boolean;
}

interface EmbeddingProvider {
  embed(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
  similarity(a: EmbeddingResult | Float32Array, b: EmbeddingResult | Float32Array): number;
  dimensions: number;
}

// Attractor definition
interface AttractorDefinition {
  id: string;
  name: string;
  description: string;
  seedPhrases: string[];
  model: string;
  agent?: string;
  temperature?: number;
}

// Computed attractor with centroid embedding
interface Attractor {
  id: string;
  name: string;
  description: string;
  centroid: Float32Array;
  seedPhrases: string[];
  model: string;
  agent?: string;
  temperature: number;
  variance: number; // Spread of seed phrase embeddings
}

// Energy computation result
interface EnergyResult {
  attractorId: string;
  energy: number;
  distance: number;
  boltzmannProbability: number;
}

// Routing decision
interface RoutingDecision {
  selectedAttractor: string;
  model: string;
  agent?: string;
  temperature: number;
  confidence: number;
  energyLandscape: EnergyResult[];
  query: string;
  queryEmbedding: Float32Array;
  timestamp: number;
  metadata: {
    topEnergy: number;
    secondEnergy: number;
    energyGap: number;
    entropyScore: number;
    totalMass: number;
  };
}

// Configuration
interface RouterConfig {
  boltzmannTemperature: number;   // Controls sharpness of probability distribution
  minConfidenceThreshold: number; // Below this, consider query ambiguous
  maxEnergyThreshold: number;     // Above this, no attractor is good fit
  dimensions: number;             // Embedding dimensions
}

// Default SMB attractors for business domains
const DEFAULT_SMB_ATTRACTORS: AttractorDefinition[] = [
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
const DEFAULT_CONFIG: RouterConfig = {
  boltzmannTemperature: 0.5,   // Lower = sharper decisions
  minConfidenceThreshold: 0.6, // Minimum confidence to route
  maxEnergyThreshold: 0.8,     // Maximum acceptable energy
  dimensions: 384              // MiniLM-L6-v2 default
};

/**
 * Placeholder embedding provider for demonstration.
 * Generates deterministic pseudo-embeddings based on text content.
 * Replace with real embedding provider for production use.
 */
class PlaceholderEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 384;

  /**
   * Generate a deterministic pseudo-embedding from text.
   * Uses character-level hashing to create reproducible vectors.
   * NOT suitable for production - use real embeddings.
   */
  async embed(text: string): Promise<EmbeddingResult> {
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
      // Mix character-level and word-level features
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

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  similarity(a: EmbeddingResult | Float32Array, b: EmbeddingResult | Float32Array): number {
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
 * ThermodynamicRouter
 *
 * Routes queries to attractors using energy-based dynamics.
 * Lower energy = better semantic match.
 */
class ThermodynamicRouter {
  private attractors: Map<string, Attractor> = new Map();
  private embeddingProvider: EmbeddingProvider;
  private config: RouterConfig;
  private initialized = false;

  constructor(
    embeddingProvider?: EmbeddingProvider,
    config?: Partial<RouterConfig>
  ) {
    this.embeddingProvider = embeddingProvider || new PlaceholderEmbeddingProvider();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize router with attractor definitions.
   * Computes centroid embeddings for each attractor from seed phrases.
   */
  async initialize(
    attractorDefs: AttractorDefinition[] = DEFAULT_SMB_ATTRACTORS
  ): Promise<void> {
    this.attractors.clear();

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
        const dist = this.computeDistance(emb.values, centroid);
        variance += dist * dist;
      }
      variance = Math.sqrt(variance / embeddings.length);

      const attractor: Attractor = {
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
    }

    this.initialized = true;
  }

  /**
   * Compute Euclidean distance between two vectors.
   * Used as the basis for energy calculation.
   */
  private computeDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Compute energy for a query embedding relative to an attractor.
   * Energy = distance / (1 + attractor_variance)
   * The variance term normalizes for attractors with different spreads.
   */
  computeEnergy(
    queryEmbedding: Float32Array,
    attractor: Attractor
  ): EnergyResult {
    const distance = this.computeDistance(queryEmbedding, attractor.centroid);

    // Normalize by attractor variance to handle different spreads
    const normalizedDistance = distance / (1 + attractor.variance);

    // Energy is the normalized distance (lower = better match)
    const energy = normalizedDistance;

    // Boltzmann probability: P(attractor) ~ exp(-E/T)
    // Computed during routing to ensure normalization across all attractors
    const boltzmannProbability = 0; // Placeholder, computed in route()

    return {
      attractorId: attractor.id,
      energy,
      distance,
      boltzmannProbability
    };
  }

  /**
   * Compute the full energy landscape for a query.
   * Returns energy values for all attractors with Boltzmann probabilities.
   */
  computeEnergyLandscape(queryEmbedding: Float32Array): EnergyResult[] {
    const results: EnergyResult[] = [];
    let partitionFunction = 0;

    // Compute raw energies
    for (const attractor of this.attractors.values()) {
      const result = this.computeEnergy(queryEmbedding, attractor);
      results.push(result);

      // Accumulate partition function for Boltzmann normalization
      partitionFunction += Math.exp(-result.energy / this.config.boltzmannTemperature);
    }

    // Compute normalized Boltzmann probabilities
    for (const result of results) {
      const unnormalizedProb = Math.exp(-result.energy / this.config.boltzmannTemperature);
      result.boltzmannProbability = unnormalizedProb / partitionFunction;
    }

    // Sort by energy (ascending - lowest energy first)
    results.sort((a, b) => a.energy - b.energy);

    return results;
  }

  /**
   * Route a natural language query to the best attractor.
   * Returns routing decision with confidence metrics.
   */
  async route(query: string): Promise<RoutingDecision> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Embed the query
    const queryResult = await this.embeddingProvider.embed(query);
    const queryEmbedding = queryResult.values;

    // Compute energy landscape
    const landscape = this.computeEnergyLandscape(queryEmbedding);

    // Get top two results for confidence calculation
    const best = landscape[0];
    const second = landscape[1];

    // Compute confidence based on energy gap and absolute energy
    const energyGap = second ? second.energy - best.energy : 1;
    const absoluteConfidence = 1 - Math.min(best.energy / this.config.maxEnergyThreshold, 1);
    const relativeConfidence = energyGap / (energyGap + 0.1); // Sigmoid-like normalization

    // Combined confidence: both absolute and relative matter
    const confidence = Math.sqrt(absoluteConfidence * relativeConfidence);

    // Compute entropy of probability distribution (measure of uncertainty)
    let entropy = 0;
    for (const result of landscape) {
      if (result.boltzmannProbability > 0) {
        entropy -= result.boltzmannProbability * Math.log2(result.boltzmannProbability);
      }
    }
    const maxEntropy = Math.log2(landscape.length);
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

    // Get selected attractor details
    const selectedAttractor = this.attractors.get(best.attractorId);
    if (!selectedAttractor) {
      throw new Error(`Attractor ${best.attractorId} not found`);
    }

    // Compute total probability mass
    const totalMass = landscape.reduce((sum, r) => sum + r.boltzmannProbability, 0);

    return {
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
  }

  /**
   * Batch route multiple queries efficiently.
   */
  async routeBatch(queries: string[]): Promise<RoutingDecision[]> {
    return Promise.all(queries.map(q => this.route(q)));
  }

  /**
   * Get attractor by ID.
   */
  getAttractor(id: string): Attractor | undefined {
    return this.attractors.get(id);
  }

  /**
   * Get all attractors.
   */
  getAttractors(): Attractor[] {
    return Array.from(this.attractors.values());
  }

  /**
   * Check if router is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get router configuration.
   */
  getConfig(): RouterConfig {
    return { ...this.config };
  }

  /**
   * Update router configuration.
   */
  updateConfig(updates: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Format routing decision for display.
 */
function formatRoutingDecision(decision: RoutingDecision): string {
  const lines: string[] = [
    '=== Thermodynamic Routing Decision ===',
    '',
    `Query: "${decision.query}"`,
    `Selected: ${decision.selectedAttractor}`,
    `Model: ${decision.model}`,
    decision.agent ? `Agent: ${decision.agent}` : '',
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

  return lines.filter(l => l !== undefined).join('\n');
}

// Example usage and demonstration
async function demonstrateRouter(): Promise<void> {
  console.log('Initializing Thermodynamic Router...\n');

  const router = new ThermodynamicRouter();
  await router.initialize();

  console.log('Attractors initialized:');
  for (const attractor of router.getAttractors()) {
    console.log(`  - ${attractor.id}: ${attractor.name} (variance: ${attractor.variance.toFixed(4)})`);
  }
  console.log('');

  // Test queries
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
    console.log('─'.repeat(60));
    const decision = await router.route(query);
    console.log(formatRoutingDecision(decision));
    console.log('');
  }
}

// Export for module usage
export {
  ThermodynamicRouter,
  PlaceholderEmbeddingProvider,
  formatRoutingDecision,
  demonstrateRouter,
  DEFAULT_SMB_ATTRACTORS,
  DEFAULT_CONFIG
};

export type {
  AttractorDefinition,
  Attractor,
  EnergyResult,
  RoutingDecision,
  RouterConfig,
  EmbeddingProvider,
  EmbeddingResult
};

// Run demonstration if executed directly
if (require.main === module) {
  demonstrateRouter().catch(console.error);
}
