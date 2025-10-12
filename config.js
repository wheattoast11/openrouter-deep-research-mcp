require('dotenv').config();
const pkg = require('./package.json');

const config = {
  server: {
    // Support both SERVER_PORT and PORT, prefer SERVER_PORT if present
    port: process.env.SERVER_PORT || process.env.PORT || 3009, // Changed port to 3009
    name: "openrouter_agents",
    version: pkg.version,
    // Add a key for basic server authentication (optional)
    apiKey: process.env.SERVER_API_KEY || null,
    requireHttps: process.env.REQUIRE_HTTPS === 'true',
    publicUrl: process.env.PUBLIC_URL || `${process.env.REQUIRE_HTTPS === 'true' ? 'https' : 'http'}://localhost:${process.env.SERVER_PORT || process.env.PORT || 3002}`,
    // Bind address for security (localhost only in local dev)
    bindAddress: process.env.BIND_ADDRESS || '0.0.0.0'
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: "https://openrouter.ai/api/v1"
  },
  models: {
    // Allow overriding planning model; provide a generally-available safe default
    planning: process.env.PLANNING_MODEL || "google/gemini-2.5-pro", // Default planning/synthesis model
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
        { name: "qwen/qwen3-coder", domains: ["coding", "editing", "technical"] },
        { name: "qwen/qwen3-235b-a22b-2507", domains: ["general", "reasoning", "technical", "coding"] }
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
        { name: "z-ai/glm-4.5-air", domains: ["coding", "technical", "reasoning"] },
        { name: "openai/gpt-oss-120b", domains: ["general", "reasoning", "search"] },
        { name: "inception/mercury", domains: ["general", "creative", "technical"] },
        { name: "baidu/ernie-4.5-vl-424b-a47b", domains: ["general", "creative"] },
        { name: "google/gemini-2.5-flash", domains: ["coding", "editing", "technical"] }
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
     parallelism: parseInt(process.env.PARALLELISM, 10) || 4,
     // Enforce a minimum max_tokens to avoid truncation across all calls
     minMaxTokens: parseInt(process.env.MIN_MAX_TOKENS, 10) || 2048
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
    enabled: process.env.INDEXER_ENABLED === 'false' ? false : true,
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
  reportOutputPath: process.env.REPORT_OUTPUT_PATH || './research_outputs/',

  // Local models configuration
  localModels: {
    enabled: process.env.LOCAL_MODELS_ENABLED === 'true',
    modelIds: process.env.LOCAL_MODEL_IDS ? process.env.LOCAL_MODEL_IDS.split(',').map(s => s.trim()) : [],
    downloadPath: process.env.LOCAL_MODELS_DOWNLOAD_PATH || './models'
  },

  // Feature flags for v2.1 (safe defaults)
  features: {
    // Core v2.1 features (enabled by default)
    zeroOrchestrator: process.env.ZERO_ORCHESTRATOR !== 'false', // Single-agent architecture
    asyncJobs: process.env.ASYNC_JOBS !== 'false', // Async job processing
    websocketStreaming: process.env.WS_STREAMING_ENABLED !== 'false', // WebSocket streaming

    // @terminals-tech integrations (enabled by default, fallback if packages fail)
    terminalsTechEmbeddings: process.env.TERMINALS_TECH_EMBEDDINGS !== 'false', // @terminals-tech/embeddings
    terminalsTechGraph: process.env.TERMINALS_TECH_GRAPH !== 'false', // @terminals-tech/graph
    graphEnrichment: process.env.GRAPH_ENRICHMENT_ENABLED !== 'false', // Query expansion via graph

    // Security features (enabled by default)
    oauthEnabled: process.env.OAUTH_ENABLED !== 'false', // JWT validation
    rateLimiting: process.env.RATE_LIMITING !== 'false', // Express rate limiting
    securityHeaders: process.env.SECURITY_HEADERS !== 'false', // Security headers middleware

    // Advanced features (disabled by default for stability)
    toolCallStreaming: process.env.TOOL_CALL_STREAMING !== 'false', // Tool output streaming
    resourceSubscriptions: process.env.RESOURCE_SUBSCRIPTIONS !== 'false', // MCP resource subscriptions
    promptSubscriptions: process.env.PROMPT_SUBSCRIPTIONS !== 'false', // MCP prompt subscriptions

    // Development features (disabled by default)
    debugMode: process.env.DEBUG_MODE === 'true', // Enhanced logging
    experimentalFeatures: process.env.EXPERIMENTAL_FEATURES === 'true', // Unstable features
  },

  // Beta features master switch (v2.1.1-beta)
  betaFeatures: process.env.BETA_FEATURES === 'true',

  // Streaming + orchestration policies
  // When BETA_FEATURES=true: PLL and compression default to enabled (opt-out)
  // When BETA_FEATURES=false: All beta features disabled (stable v2.1 behavior)
  policies: {
    pll: {
      enable: process.env.BETA_FEATURES === 'true'
        ? (process.env.PLL_ENABLE !== 'false')
        : (process.env.PLL_ENABLE === 'true'),
      targetTokenRate: Number(process.env.PLL_TARGET_TOKEN_RATE) || 32,
      smoothingHalfLifeMs: Number(process.env.PLL_SMOOTHING_HALFLIFE_MS) || 320,
      maxFanout: Number(process.env.PLL_MAX_FANOUT) || 6,
      maxConcurrency: Number(process.env.PLL_MAX_CONCURRENCY) || 6,
      jitterToleranceMs: Number(process.env.PLL_JITTER_TOLERANCE_MS) || 180,
      circuitBreakerThreshold: Number(process.env.PLL_CIRCUIT_BREAKER_THRESHOLD) || 6,
      fallbackCooldownMs: Number(process.env.PLL_FALLBACK_COOLDOWN_MS) || 10000,
      gain: Number(process.env.PLL_GAIN) || 0.5,
      policyStabilizer: Number(process.env.PLL_POLICY_STABILIZER) || 1.0
    },
    compression: {
      enable: process.env.BETA_FEATURES === 'true'
        ? (process.env.COMPRESSION_ENABLE !== 'false')
        : (process.env.COMPRESSION_ENABLE === 'true'),
      targetTokenBudget: Number(process.env.COMPRESSION_TARGET_TOKENS) || 3200,
      minRetentionRatio: Number(process.env.COMPRESSION_MIN_RETENTION_RATIO) || 0.35,
      entropyFloor: Number(process.env.COMPRESSION_ENTROPY_FLOOR) || 0.2
    },
    retrieval: {
      dynamicTopK: process.env.RETRIEVAL_DYNAMIC_TOPK === 'true',
      minTopK: Number(process.env.RETRIEVAL_MIN_TOPK) || 6,
      maxTopK: Number(process.env.RETRIEVAL_MAX_TOPK) || 18,
      instabilityJitterMs: Number(process.env.RETRIEVAL_INSTABILITY_JITTER_MS) || 250
    },
    websocket: {
      pacing: {
        enable: process.env.WS_PACING_ENABLE === 'true',
        minFlushIntervalMs: Number(process.env.WS_PACING_MIN_FLUSH_MS) || 15,
        maxFlushIntervalMs: Number(process.env.WS_PACING_MAX_FLUSH_MS) || 120,
        maxBufferSize: Number(process.env.WS_PACING_MAX_BUFFER) || 4096
      }
    }
  },

  // Provider fallbacks for robustness
  fallbacks: {
    embeddings: {
      primary: 'terminals-tech',
      secondary: 'huggingface',
      tertiary: 'mock'
    },
    graph: {
      primary: 'terminals-tech',
      secondary: 'none' // Disable if @terminals-tech fails
    }
  },
  // Embeddings provider configuration
  embeddings: {
    provider: 'terminals-tech', // 'terminals-tech' | 'gemini' | 'huggingface' | 'openai'
    model: 'Xenova/all-MiniLM-L6-v2',
    dimension: 384, // all-MiniLM-L6-v2 = 384
    apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || null,
    // Fallback and local model options are deprecated in favor of a single provider
    fallbackToLocal: false,
    localModel: null,
    dual: {
      enabled: false,
      provider: null,
      fusion: {
        primaryWeight: 1.0,
        altWeight: 0.0
      }
    }
  }
};

// MCP feature toggles (opt-in by default; can be disabled via env)
config.mcp = {
  features: {
    prompts: process.env.MCP_ENABLE_PROMPTS !== 'false' && config.features.promptSubscriptions,
    resources: process.env.MCP_ENABLE_RESOURCES !== 'false' && config.features.resourceSubscriptions
  },
  // MCP protocol version (2025-03-26 or 2025-06-18)
  protocolVersion: process.env.MCP_PROTOCOL_VERSION || '2025-03-26',
  // Supported protocol versions
  supportedVersions: ['2024-11-05', '2025-03-26', '2025-06-18'],
  // A2A connector flags
  connectors: {
    x402: process.env.MCP_CONNECTOR_X402_ENABLED === 'true',
    ap2: process.env.MCP_CONNECTOR_AP2_ENABLED === 'true'
  },
  sessionTimeoutSeconds: parseInt(process.env.MCP_SESSION_TIMEOUT_SECONDS, 10) || 3600
};
config.mcp.mode = (process.env.MODE || (config.features.zeroOrchestrator ? 'AGENT' : 'ALL')).toUpperCase(); // v2.1: Default to AGENT mode if zero orchestrator enabled

// Experimental modes
config.modes = {
  hyper: process.env.HYPER_MODE === 'true'
};

// MCP transport preferences
config.mcp.transport = {
  streamableHttpEnabled: true, // Re-enable streamableHttp for testing
  stdio: process.env.MCP_STDIO_ENABLED !== 'false',
  websocket: process.env.MCP_WEBSOCKET_ENABLED !== 'false'
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
    visionModels: ['z-ai/glm-4.5v', 'google/gemini-2.5-flash', 'openai/gpt-5-nano'],
    codingModels: ['qwen/qwen3-coder', 'z-ai/glm-4.5-air', 'deepseek/deepseek-chat-v3.1'],
    complexReasoningModels: ['deepseek/deepseek-chat-v3.1', 'qwen/qwen3-235b-a22b-2507', 'nousresearch/deephermes-3-mistral-24b-preview'],
    costThresholds: {
      simple: 0.0000005, // Max cost per token for simple queries
      moderate: 0.000002, // Max cost per token for moderate queries  
      complex: 0.000015   // Max cost per token for complex queries
    }
  }
};

// OAuth 2.1 Resource Server configuration
config.auth = {
  // JWKS URL for JWT token validation (RFC 8414)
  jwksUrl: process.env.AUTH_JWKS_URL || null,
  // Expected audience claim in JWTs
  expectedAudience: process.env.AUTH_EXPECTED_AUD || 'mcp-server',
  // Issuer URL (optional, for discovery metadata)
  issuer: process.env.AUTH_ISSUER_URL || null,
  // OAuth 2.0 Protected Resource Metadata discovery
  discovery: {
    enabled: process.env.AUTH_DISCOVERY_ENABLED !== 'false',
    authorizationServers: (process.env.AUTH_SERVERS || '').split(',').map(s => s.trim()).filter(Boolean)
  },
  // Scope definitions and mappings
  scopes: {
    // Minimal baseline scopes for read-only discovery
    minimal: (process.env.AUTH_SCOPES_MINIMAL || 'mcp:read,mcp:tools:list,mcp:resources:list,mcp:prompts:list')
      .split(',').map(s => s.trim()).filter(Boolean),
    // Map operations to required scopes
    scopeMap: {
      'tools/list': ['mcp:tools:list'],
      'tools/call': ['mcp:tools:call'],
      'resources/list': ['mcp:resources:list'],
      'resources/read': ['mcp:resources:read'],
      'resources/templates/list': ['mcp:resources:list'],
      'prompts/list': ['mcp:prompts:list'],
      'prompts/get': ['mcp:prompts:read'],
      'sampling/createMessage': ['mcp:sampling'],
      'elicitation/create': ['mcp:elicitation'],
      // Write operations
      'logging/setLevel': ['mcp:logging:write'],
      'completion/complete': ['mcp:completions'],
      'resources/subscribe': ['mcp:resources:subscribe'],
      'resources/unsubscribe': ['mcp:resources:subscribe'],
      'notifications/message': ['mcp:notifications:write']
    }
  }
};

// Security configuration
config.security = {
  // Allowed origins for CORS (comma-separated in env)
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:*,https://localhost:*')
    .split(',').map(s => s.trim()).filter(Boolean),
  // Rate limiting per IP
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000, // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100, // 100 requests per minute
    message: 'Too many requests, please try again later.'
  },
  // Per-tool rate limits (stricter for expensive operations)
  toolRateLimits: {
    'research': { windowMs: 60000, max: 10 },
    'agent': { windowMs: 60000, max: 20 },
    'sampling/createMessage': { windowMs: 60000, max: 30 }
  }
};

module.exports = config;
