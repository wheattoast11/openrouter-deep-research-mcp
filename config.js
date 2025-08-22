require('dotenv').config();
const pkg = require('./package.json');

const config = {
  server: {
    // Support both SERVER_PORT and PORT, prefer SERVER_PORT if present
    port: process.env.SERVER_PORT || process.env.PORT || 3002,
    name: "openrouter_agents",
    version: pkg.version,
    // Add a key for basic server authentication (optional)
    apiKey: process.env.SERVER_API_KEY || null,
    requireHttps: process.env.REQUIRE_HTTPS === 'true'
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: "https://openrouter.ai/api/v1"
  },
  models: {
    // Allow overriding planning model; provide a generally-available safe default
    planning: process.env.PLANNING_MODEL || "openai/gpt-5-chat", // Default planning/synthesis model
    planningCandidates: (process.env.PLANNING_CANDIDATES || "openai/gpt-5-chat,google/gemini-2.5-pro,anthropic/claude-sonnet-4")
      .split(',').map(s=>s.trim()).filter(Boolean),
    useDynamicCatalog: process.env.USE_DYNAMIC_CATALOG === 'true',
    // Define models with domain strengths
    // Accept either JSON array of objects or CSV of model ids in env vars
    highCost: process.env.HIGH_COST_MODELS ? 
      (function parseHighCost(val){
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed;
        } catch(_) {}
        // CSV fallback -> wrap ids as objects without explicit domains
        return String(val).split(',').map(s=>s.trim()).filter(Boolean).map(name=>({ name, domains: ["general"] }));
      })(process.env.HIGH_COST_MODELS) : [
        { name: "x-ai/grok-4", domains: ["reasoning", "technical", "general", "creative"] },
        { name: "openai/gpt-5-chat", domains: ["reasoning", "technical", "general"] },
        { name: "google/gemini-2.5-pro", domains: ["reasoning", "technical", "general"] },
        { name: "anthropic/claude-sonnet-4", domains: ["reasoning", "technical", "general"] },
        { name: "morph/morph-v3-large", domains: ["coding", "editing", "technical"] }
      ],
    lowCost: process.env.LOW_COST_MODELS ? 
      (function parseLowCost(val){
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed;
        } catch(_) {}
        return String(val).split(',').map(s=>s.trim()).filter(Boolean).map(name=>({ name, domains: ["general"] }));
      })(process.env.LOW_COST_MODELS) : [
        { name: "deepseek/deepseek-chat-v3.1", domains: ["general", "reasoning", "technical", "coding"] },
        { name: "z-ai/glm-4.5v", domains: ["general", "multimodal", "vision", "reasoning"] },
        { name: "qwen/qwen3-coder", domains: ["coding", "technical", "reasoning"] },
        { name: "openai/gpt-5-mini", domains: ["general", "reasoning", "search"] },
        { name: "google/gemini-2.5-flash", domains: ["general", "creative", "technical"] },
        { name: "google/gemini-2.5-flash-lite", domains: ["general", "creative"] }
      ],
    // Define a tier for potentially simpler tasks (adjust models as needed)
    veryLowCost: process.env.VERY_LOW_COST_MODELS ?
       (function parseVeryLow(val){
         try {
           const parsed = JSON.parse(val);
           if (Array.isArray(parsed)) return parsed;
         } catch(_) {}
         return String(val).split(',').map(s=>s.trim()).filter(Boolean).map(name=>({ name, domains: ["general"] }));
       })(process.env.VERY_LOW_COST_MODELS) : [
         { name: "openai/gpt-5-nano", domains: ["general", "reasoning", "creative"] }
       ],
     // Add a model specifically for classification tasks if needed, or reuse planning model
     classification: process.env.CLASSIFICATION_MODEL || "openai/gpt-5-mini",
     // Default ensemble size for research agent model ensembles
     ensembleSize: parseInt(process.env.ENSEMBLE_SIZE, 10) || 2,
     // Max research iterations (initial + refinements)
     maxResearchIterations: parseInt(process.env.MAX_RESEARCH_ITERATIONS, 10) || 2, // Default to 1 initial + 1 refinement
     // Parallelism for concurrent sub-queries
     parallelism: parseInt(process.env.PARALLELISM, 10) || 4
  },
  // Database configuration for knowledge base using PGLite
  database: {
    dataDirectory: process.env.PGLITE_DATA_DIR || "./researchAgentDB",
    vectorDimension: 384, // Dimension for the embeddings from all-MiniLM-L6-v2
    cacheTTL: parseInt(process.env.CACHE_TTL_SECONDS, 10) || 3600, // 1 hour in seconds
    // Enhanced PGLite configuration
    databaseUrl: process.env.PGLITE_DATABASE_URL || null, // Override auto-detected URL
    relaxedDurability: process.env.PGLITE_RELAXED_DURABILITY === 'false' ? false : true, // Default to true; allow explicit disable
    maxRetryAttempts: parseInt(process.env.PGLITE_MAX_RETRY_ATTEMPTS, 10) || 3, // Default to 3 retry attempts
    retryDelayBaseMs: parseInt(process.env.PGLITE_RETRY_DELAY_BASE_MS, 10) || 200, // Base delay in milliseconds
    allowInMemoryFallback: process.env.PGLITE_ALLOW_IN_MEMORY_FALLBACK === 'false' ? false : true // Default to true
  },
  // Local indexing/search configuration (opt-in by default)
  indexer: {
    enabled: process.env.INDEXER_ENABLED === 'true',
    autoIndexReports: process.env.INDEXER_AUTO_INDEX_REPORTS === 'true',
    autoIndexFetchedContent: process.env.INDEXER_AUTO_INDEX_FETCHED === 'true',
    embedDocs: process.env.INDEXER_EMBED_DOCS !== 'false',
    maxDocLength: parseInt(process.env.INDEXER_MAX_DOC_LENGTH, 10) || 8000,
    bm25: {
      k1: Number(process.env.INDEXER_BM25_K1) || 1.2,
      b: Number(process.env.INDEXER_BM25_B) || 0.75
    },
    weights: {
      bm25: Number(process.env.INDEXER_WEIGHT_BM25) || 0.7,
      vector: Number(process.env.INDEXER_WEIGHT_VECTOR) || 0.3
    },
    stopwords: (process.env.INDEXER_STOPWORDS || '').split(',').map(s => s.trim()).filter(Boolean),
    rerankEnabled: process.env.INDEXER_RERANK_ENABLED === 'true',
    rerankModel: process.env.INDEXER_RERANK_MODEL || null
  },
  // Configuration for where to save full research reports
  reportOutputPath: process.env.REPORT_OUTPUT_PATH || './research_outputs/'
};

// MCP feature toggles (opt-in by default; can be disabled via env)
config.mcp = {
  features: {
    prompts: process.env.MCP_ENABLE_PROMPTS === 'false' ? false : true,
    resources: process.env.MCP_ENABLE_RESOURCES === 'false' ? false : true
  }
};

// MCP transport preferences
config.mcp.transport = {
  streamableHttpEnabled: process.env.MCP_STREAMABLE_HTTP_ENABLED === 'false' ? false : true
};

// Prompt strategy configuration
config.prompts = {
  compact: process.env.PROMPTS_COMPACT === 'false' ? false : true, // default compact prompts on
  requireUrls: process.env.PROMPTS_REQUIRE_URLS === 'false' ? false : true,
  confidenceScoring: process.env.PROMPTS_CONFIDENCE === 'false' ? false : true
};

// Simple tool aliasing (short params) for minimal token overhead
config.simpleTools = {
  enabled: process.env.SIMPLE_TOOLS === 'false' ? false : true
};

// Async job processing
config.jobs = {
  concurrency: parseInt(process.env.JOBS_CONCURRENCY, 10) || 2,
  heartbeatMs: parseInt(process.env.JOB_HEARTBEAT_MS, 10) || 5000,
  leaseTimeoutMs: parseInt(process.env.JOB_LEASE_TIMEOUT_MS, 10) || 60000
};

// Advanced caching and cost optimization
config.caching = {
  // Semantic result caching
  results: {
    enabled: process.env.RESULT_CACHING_ENABLED !== 'false',
    ttlSeconds: parseInt(process.env.RESULT_CACHE_TTL, 10) || 7200, // 2 hours
    maxEntries: parseInt(process.env.RESULT_CACHE_MAX_ENTRIES, 10) || 1000,
    similarityThreshold: parseFloat(process.env.CACHE_SIMILARITY_THRESHOLD) || 0.85
  },
  // Model response caching
  models: {
    enabled: process.env.MODEL_CACHING_ENABLED !== 'false',
    ttlSeconds: parseInt(process.env.MODEL_CACHE_TTL, 10) || 3600, // 1 hour
    maxEntries: parseInt(process.env.MODEL_CACHE_MAX_ENTRIES, 10) || 500
  },
  // Cost optimization strategies
  optimization: {
    preferredLowCostModels: ['deepseek/deepseek-chat-v3.1', 'qwen/qwen3-coder', 'z-ai/glm-4.5v'],
    visionModels: ['z-ai/glm-4.5v', 'google/gemini-2.5-flash', 'qwen/qwen2.5-vl-72b-instruct'],
    codingModels: ['qwen/qwen3-coder', 'morph/morph-v3-large', 'deepseek/deepseek-chat-v3.1'],
    complexReasoningModels: ['x-ai/grok-4', 'deepseek/deepseek-r1', 'anthropic/claude-sonnet-4'],
    costThresholds: {
      simple: 0.0000005, // Max cost per token for simple queries
      moderate: 0.000002, // Max cost per token for moderate queries  
      complex: 0.000015   // Max cost per token for complex queries
    }
  }
};

module.exports = config;
