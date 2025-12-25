require('dotenv').config();
const path = require('path');
const pkg = require('./package.json');

const config = {
  server: {
    // Support both SERVER_PORT and PORT, prefer SERVER_PORT if present
    port: process.env.SERVER_PORT || process.env.PORT || 3002,
    name: "openrouter_agents",
    version: pkg.version,
    // Add a key for basic server authentication (optional)
    apiKey: process.env.SERVER_API_KEY || null,
    requireHttps: process.env.REQUIRE_HTTPS === 'true',
    publicUrl: process.env.PUBLIC_URL || `${process.env.REQUIRE_HTTPS === 'true' ? 'https' : 'http'}://localhost:${process.env.SERVER_PORT || process.env.PORT || 3002}`,
    // Server startup behavior
    allowStartWithoutDb: process.env.ALLOW_START_WITHOUT_DB === 'true',
    startupTimeoutMs: parseInt(process.env.STARTUP_TIMEOUT_MS, 10) || 60000
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: "https://openrouter.ai/api/v1",
    timeout: parseInt(process.env.OPENROUTER_TIMEOUT_MS, 10) || 180000,
    retries: parseInt(process.env.OPENROUTER_RETRIES, 10) || 3,
    retryDelayMs: parseInt(process.env.OPENROUTER_RETRY_DELAY_MS, 10) || 1000
  },
  models: {
    // Allow overriding planning model; provide a generally-available safe default
    planning: process.env.PLANNING_MODEL || "google/gemini-3-flash-preview", // Default planning/synthesis model
    planningCandidates: (process.env.PLANNING_CANDIDATES || "openai/gpt-5.2-chat,google/gemini-3-pro-preview,anthropic/claude-opus-4.5,google/gemini-3-flash-preview")
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
        { name: "google/gemini-3-pro-preview", domains: ["reasoning", "technical", "general", "creative"] },
        { name: "openai/gpt-5.2-chat", domains: ["reasoning", "technical", "general"] },
        { name: "anthropic/claude-opus-4.5", domains: ["reasoning", "technical", "general", "creative"] },
        { name: "perplexity/sonar-pro-search", domains: ["reasoning", "technical", "general", "creative"] },
        { name: "google/gemini-3-flash-preview", domains: ["reasoning", "technical", "general", "creative"] }
      ],
    lowCost: process.env.LOW_COST_MODELS ? 
      (function parseLowCost(val){
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed;
        } catch(_) {}
        return String(val).split(',').map(s=>s.trim()).filter(Boolean).map(name=>({ name, domains: ["general"] }));
      })(process.env.LOW_COST_MODELS) : [
        { name: "google/gemini-3-flash-preview", domains: ["general", "reasoning", "technical", "coding"] },
        { name: "z-ai/glm-4.7", domains: ["general", "multimodal", "vision", "reasoning"] },
        { name: "deepcogito/cogito-v2.1-671b", domains: ["coding", "technical", "reasoning"] },
        { name: "openai/gpt-oss-120b", domains: ["general", "reasoning", "search"] },
        { name: "moonshotai/kimi-k2-thinking", domains: ["general", "creative", "technical"] },
        { name: "baidu/ernie-4.5-vl-424b-a47b", domains: ["general", "creative"] },
        { name: "openai/o4-mini-deep-research", domains: ["coding", "editing", "technical"] }
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
     classification: process.env.CLASSIFICATION_MODEL || "openai/gpt-5-nano",
     // Default ensemble size for research agent model ensembles
     ensembleSize: parseInt(process.env.ENSEMBLE_SIZE, 10) || 2,
     // Max research iterations (initial + refinements)
     maxResearchIterations: parseInt(process.env.MAX_RESEARCH_ITERATIONS, 10) || 2, // Default to 1 initial + 1 refinement
     // Parallelism for concurrent sub-queries
     parallelism: parseInt(process.env.PARALLELISM, 10) || 4,
     // Enforce a minimum max_tokens to avoid truncation across all calls
     minMaxTokens: parseInt(process.env.MIN_MAX_TOKENS, 10) || 2048,
     // Model-aware adaptive token limits (dynamically adjusted based on model capabilities)
     tokens: {
       synthesis: {
         min: parseInt(process.env.SYNTHESIS_MIN_TOKENS, 10) || 4000,
         fallbackMax: parseInt(process.env.SYNTHESIS_MAX_TOKENS, 10) || 16000,
         perSubQuery: parseInt(process.env.TOKENS_PER_SUBQUERY, 10) || 800,
         perDocument: parseInt(process.env.TOKENS_PER_DOC, 10) || 500
       },
       research: {
         min: parseInt(process.env.RESEARCH_MIN_TOKENS, 10) || 2000,
         fallbackMax: parseInt(process.env.RESEARCH_MAX_TOKENS, 10) || 8000
       },
       planning: {
         min: parseInt(process.env.PLANNING_MIN_TOKENS, 10) || 1000,
         fallbackMax: parseInt(process.env.PLANNING_MAX_TOKENS, 10) || 4000
       }
     }
  },
  // Database configuration for knowledge base using PGLite
  database: {
    // Smart default paths: XDG_DATA_HOME > TMPDIR (AppImage) > ~/.local/share > ./
    dataDirectory: process.env.PGLITE_DATA_DIR || (() => {
      // XDG Base Directory compliance (Linux/macOS)
      if (process.env.XDG_DATA_HOME) {
        return path.join(process.env.XDG_DATA_HOME, 'openrouter-agents', 'db');
      }
      // AppImage environments set TMPDIR to writable location within sandbox
      if (process.env.APPIMAGE && process.env.TMPDIR) {
        return path.join(process.env.TMPDIR, 'openrouter-agents-db');
      }
      // Standard user data location
      if (process.env.HOME) {
        return path.join(process.env.HOME, '.local', 'share', 'openrouter-agents', 'db');
      }
      // Fallback to current directory (legacy behavior)
      return './researchAgentDB';
    })(),
    vectorDimension: 384, // Dimension for the embeddings from all-MiniLM-L6-v2
    cacheTTL: parseInt(process.env.CACHE_TTL_SECONDS, 10) || 3600, // 1 hour in seconds
    // Enhanced PGLite configuration
    databaseUrl: process.env.PGLITE_DATABASE_URL || null, // Override auto-detected URL
    relaxedDurability: process.env.PGLITE_RELAXED_DURABILITY === 'false' ? false : true,
    maxRetryAttempts: parseInt(process.env.PGLITE_MAX_RETRY_ATTEMPTS, 10) || 3,
    retryDelayBaseMs: parseInt(process.env.PGLITE_RETRY_DELAY_BASE_MS, 10) || 200,
    // Initialization behavior
    initTimeoutMs: parseInt(process.env.PGLITE_INIT_TIMEOUT_MS, 10) || 60000,
    retryOnFailure: process.env.PGLITE_RETRY_ON_FAILURE === 'true',
    allowInMemoryFallback: process.env.PGLITE_ALLOW_IN_MEMORY_FALLBACK !== 'false', // Default true for backwards compat
    // Database extensions configuration
    extensions: {
      bloom: {
        enabled: process.env.DB_BLOOM_ENABLED !== 'false',
        indexFalsePositiveRate: parseFloat(process.env.BLOOM_FALSE_POSITIVE_RATE) || 0.01
      },
      cube: {
        enabled: process.env.DB_CUBE_ENABLED !== 'false',
        maxDimensions: parseInt(process.env.CUBE_MAX_DIMENSIONS, 10) || 10
      },
      seg: {
        enabled: process.env.DB_SEG_ENABLED !== 'false'
      },
      tcn: {
        enabled: process.env.DB_TCN_ENABLED !== 'false',
        channels: ['research_reports_changed', 'jobs_changed']
      },
      tsm_system_time: {
        enabled: process.env.DB_TEMPORAL_ENABLED !== 'false'
      },
      pgtap: {
        enabled: process.env.NODE_ENV === 'test'
      }
    }
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
  reportOutputPath: process.env.REPORT_OUTPUT_PATH || './research_outputs/'
};

// MCP feature toggles (opt-in by default; can be disabled via env)
config.mcp = {
  features: {
    prompts: process.env.MCP_ENABLE_PROMPTS === 'false' ? false : true,
    resources: process.env.MCP_ENABLE_RESOURCES === 'false' ? false : true
  }
};
config.mcp.mode = (process.env.MODE || 'ALL').toUpperCase();

// Experimental modes
config.modes = {
  hyper: process.env.HYPER_MODE === 'true'
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

// Tool recursion/chaining configuration
// Allows agent to execute multiple tools in a single call with depth limiting
config.toolRecursion = {
  enabled: process.env.MAX_TOOL_DEPTH !== '0',
  maxDepth: parseInt(process.env.MAX_TOOL_DEPTH, 10) || 3 // Default: 3 levels, set to 0 to disable
};

// Async job processing - optimized for parallel batch research
config.jobs = {
  concurrency: parseInt(process.env.JOBS_CONCURRENCY, 10) || 4,        // ↑ from 2 for better parallelism
  heartbeatMs: parseInt(process.env.JOB_HEARTBEAT_MS, 10) || 2000,     // ↓ from 5000 for faster stale detection
  leaseTimeoutMs: parseInt(process.env.JOB_LEASE_TIMEOUT_MS, 10) || 30000, // ↓ from 60000 for faster recovery
  batchEventLimit: parseInt(process.env.JOB_BATCH_EVENT_LIMIT, 10) || 500, // SSE event limit per batch poll
  ssePollingMs: parseInt(process.env.JOB_SSE_POLLING_MS, 10) || 500    // ↓ from 1000 for lower latency
};

// Structured logging configuration (MCP-compliant)
config.logging = {
  // Log level filtering: 'debug' | 'info' | 'warn' | 'error' (default: info)
  level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  // Output mode: 'stderr' | 'mcp' | 'both' (default: stderr)
  // - stderr: Traditional stderr logging (compatible with all clients)
  // - mcp: Use MCP SDK sendLoggingMessage notifications (client can filter)
  // - both: Output to both channels
  output: process.env.LOG_OUTPUT || 'stderr',
  // JSON format for machine parsing (default: false for human-readable)
  json: process.env.LOG_JSON === 'true'
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
    preferredLowCostModels: ['google/gemini-3-flash-preview', 'anthropic/claude-haiku-4.5', 'deepcogito/cogito-v2.1-671b'],
    visionModels: ['anthropic/claude-opus-4.5', 'google/gemini-3-flash-preview', 'openai/gpt-5.2'],
    codingModels: ['google/gemini-3-flash-preview', 'anthropic/claude-haiku-4.5', 'deepcogito/cogito-v2.1-671b'],
    complexReasoningModels: ['perplexity/sonar-pro-search', 'google/gemini-3-flash-preview', 'deepcogito/cogito-v2.1-671b'],
    costThresholds: {
      simple: 0.0000005, // Max cost per token for simple queries
      moderate: 0.000002, // Max cost per token for moderate queries  
      complex: 0.000015   // Max cost per token for complex queries
    }
  }
};

// Payload optimization
config.payload = {
  compressionEnabled: process.env.PAYLOAD_COMPRESSION !== 'false',
  compressionFormat: process.env.PAYLOAD_COMPRESSION_FORMAT || 'gzip', // gzip | brotli | none
  compressionThreshold: parseInt(process.env.PAYLOAD_COMPRESSION_THRESHOLD, 10) || 50000, // bytes
  referenceThreshold: parseInt(process.env.PAYLOAD_REFERENCE_THRESHOLD, 10) || 100000 // bytes
};

// Core abstractions (Convergence Plan v2.0)
config.core = {
  // Enable new consolidated handlers (enabled by default since v1.9.0)
  handlers: {
    enabled: process.env.CORE_HANDLERS_ENABLED !== 'false',
    // Which domains use new handlers (others fall back to tools.js)
    domains: (process.env.CORE_HANDLER_DOMAINS || '').split(',').filter(Boolean)
  },
  // Signal protocol configuration (enabled by default since v1.9.0)
  signal: {
    enabled: process.env.SIGNAL_PROTOCOL_ENABLED !== 'false',
    maxHistorySize: parseInt(process.env.SIGNAL_MAX_HISTORY, 10) || 1000
  },
  // RoleShift bidirectional protocol (enabled by default since v1.9.0)
  roleShift: {
    enabled: process.env.ROLESHIFT_ENABLED !== 'false',
    timeout: parseInt(process.env.ROLESHIFT_TIMEOUT_MS, 10) || 60000
  },
  // MCP features (resources, prompts, streamable HTTP)
  mcp: {
    features: {
      resources: process.env.MCP_RESOURCES_ENABLED !== 'false',
      prompts: process.env.MCP_PROMPTS_ENABLED !== 'false'
    }
  },
  // Schema registry options
  schemas: {
    strictValidation: process.env.STRICT_SCHEMA_VALIDATION === 'true'
  },
  // Rail Protocol configuration (v1.9.2)
  rail: {
    enabled: process.env.RAIL_ENABLED !== 'false',
    version: '0.1.0',
    // Token tracking
    tokens: {
      countEnabled: process.env.RAIL_TOKEN_COUNT !== 'false',
      budgetEnabled: process.env.RAIL_TOKEN_BUDGET === 'true',
      budgetLimit: parseInt(process.env.RAIL_TOKEN_BUDGET_LIMIT, 10) || 100000
    },
    // Caching
    cache: {
      enabled: process.env.RAIL_CACHE !== 'false',
      ttlSeconds: parseInt(process.env.RAIL_CACHE_TTL, 10) || 3600,
      semanticThreshold: parseFloat(process.env.RAIL_CACHE_THRESHOLD) || 0.85
    },
    // Rate limiting
    rateLimit: {
      enabled: process.env.RAIL_RATE_LIMIT !== 'false',
      requestsPerMinute: parseInt(process.env.RAIL_RATE_LIMIT_RPM, 10) || 60
    },
    // Circuit breaker
    circuitBreaker: {
      enabled: process.env.RAIL_CIRCUIT_BREAKER !== 'false',
      failureThreshold: parseInt(process.env.RAIL_CIRCUIT_THRESHOLD, 10) || 5,
      resetTimeoutMs: parseInt(process.env.RAIL_CIRCUIT_RESET_MS, 10) || 30000
    },
    // Routing strategy
    routing: {
      strategy: process.env.RAIL_ROUTING_STRATEGY || 'auto',
      costPreference: process.env.RAIL_COST_PREFERENCE || 'balanced'
    },
    // Tunnels (agent-to-agent)
    tunnels: {
      enabled: process.env.RAIL_TUNNELS !== 'false',
      defaultTtlMs: parseInt(process.env.RAIL_TUNNEL_TTL_MS, 10) || 60000,
      requireAck: process.env.RAIL_TUNNEL_REQUIRE_ACK === 'true'
    },
    // Streaming consensus
    consensus: {
      enabled: process.env.RAIL_CONSENSUS !== 'false',
      minAgreement: parseFloat(process.env.RAIL_CONSENSUS_MIN) || 0.6,
      timeoutMs: parseInt(process.env.RAIL_CONSENSUS_TIMEOUT_MS, 10) || 30000,
      updateIntervalMs: parseInt(process.env.RAIL_CONSENSUS_UPDATE_MS, 10) || 500
    },
    // Observability
    debug: process.env.RAIL_DEBUG === 'true',
    debugRails: (process.env.RAIL_DEBUG_RAILS || '').split(',').filter(Boolean)
  }
};

// Version information
config.version = pkg.version;
config.mcpSpec = {
  stable: '2025-06-18',
  draft: '2025-11-25',
  // All 8 SEPs from MCP 2025-11-25 draft + RoleShift
  features: [
    'SEP-1686',  // Task Protocol
    'SEP-1577',  // Sampling with Tools
    'SEP-1036',  // URL Mode Elicitation
    'SEP-1865',  // MCP Apps (UI Resources)
    'SEP-990',   // Enterprise Auth (ID-JAG, Token Exchange)
    'SEP-991',   // Client Metadata (CIMD)
    'SEP-1649'   // Server Discovery (.well-known/mcp-server)
  ]
};

module.exports = config;
