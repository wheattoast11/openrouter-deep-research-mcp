/**
 * Configuration Schema Validation
 *
 * Zod schemas for validating environment variables and configuration.
 * Provides type-safe configuration with sensible defaults.
 *
 * @module config/schema
 */

'use strict';

const { z } = require('zod');
const constants = require('./constants');

/**
 * Zod 4 compatibility helper: .default({}) no longer re-parses through the schema.
 * This helper ensures child defaults are resolved when parent defaults fire.
 */
const withDefault = (schema) => z.any().default({}).pipe(schema);

/**
 * Coerce string to boolean, treating 'true', '1', 'yes' as true.
 */
const booleanFromEnv = z.preprocess(
  (val) => {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      return ['true', '1', 'yes'].includes(val.toLowerCase());
    }
    return false;
  },
  z.boolean()
);

/**
 * Coerce string to number with fallback.
 */
const numberFromEnv = (fallback) => z.preprocess(
  (val) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const num = parseInt(val, 10);
      return isNaN(num) ? fallback : num;
    }
    return fallback;
  },
  z.number()
);

/**
 * Coerce string to float with fallback.
 */
const floatFromEnv = (fallback) => z.preprocess(
  (val) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const num = parseFloat(val);
      return isNaN(num) ? fallback : num;
    }
    return fallback;
  },
  z.number()
);

/**
 * Server configuration schema
 */
const ServerSchema = z.object({
  port: numberFromEnv(constants.SERVER.DEFAULT_PORT),
  name: z.string().default(constants.SERVER.DEFAULT_NAME),
  apiKey: z.string().nullable().optional(),
  requireHttps: booleanFromEnv.default(false),
  publicUrl: z.string().optional(),
  allowStartWithoutDb: booleanFromEnv.default(false),
  startupTimeoutMs: numberFromEnv(constants.SERVER.STARTUP_TIMEOUT_MS)
});

/**
 * OpenRouter configuration schema
 */
const OpenRouterSchema = z.object({
  apiKey: z.string().optional(),
  apiKeys: z.array(z.string()).optional(),
  baseUrl: z.string().url().default('https://openrouter.ai/api/v1')
});

/**
 * Database configuration schema
 */
const DatabaseSchema = z.object({
  dataDirectory: z.string().default('./researchAgentDB'),
  vectorDimension: numberFromEnv(constants.DATABASE.VECTOR_DIMENSION),
  cacheTTL: numberFromEnv(constants.DATABASE.CACHE_TTL_SECONDS),
  databaseUrl: z.string().nullable().optional(),
  relaxedDurability: booleanFromEnv.default(true),
  maxRetryAttempts: numberFromEnv(constants.DATABASE.MAX_RETRY_ATTEMPTS),
  retryDelayBaseMs: numberFromEnv(constants.DATABASE.RETRY_DELAY_BASE_MS),
  initTimeoutMs: numberFromEnv(constants.DATABASE.INIT_TIMEOUT_MS),
  retryOnFailure: booleanFromEnv.default(false),
  allowInMemoryFallback: booleanFromEnv.default(true)
});

/**
 * Indexer configuration schema
 */
const IndexerSchema = z.object({
  enabled: booleanFromEnv.default(true),
  autoIndexReports: booleanFromEnv.default(false),
  autoIndexFetchedContent: booleanFromEnv.default(false),
  embedDocs: booleanFromEnv.default(true),
  maxDocLength: numberFromEnv(constants.INDEXER.MAX_DOC_LENGTH),
  bm25: withDefault(z.object({
    k1: floatFromEnv(constants.INDEXER.BM25_K1),
    b: floatFromEnv(constants.INDEXER.BM25_B)
  })),
  weights: withDefault(z.object({
    bm25: floatFromEnv(constants.INDEXER.WEIGHT_BM25),
    vector: floatFromEnv(constants.INDEXER.WEIGHT_VECTOR)
  })),
  rerankEnabled: booleanFromEnv.default(false),
  rerankModel: z.string().nullable().optional()
});

/**
 * Jobs configuration schema
 */
const JobsSchema = z.object({
  concurrency: numberFromEnv(constants.JOBS.DEFAULT_CONCURRENCY),
  heartbeatMs: numberFromEnv(constants.JOBS.HEARTBEAT_MS),
  leaseTimeoutMs: numberFromEnv(constants.JOBS.LEASE_TIMEOUT_MS),
  batchEventLimit: numberFromEnv(constants.JOBS.BATCH_EVENT_LIMIT),
  ssePollingMs: numberFromEnv(constants.JOBS.SSE_POLLING_MS)
});

/**
 * Logging configuration schema
 */
const LoggingSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  output: z.enum(['stderr', 'mcp', 'both']).default('stderr'),
  json: booleanFromEnv.default(false)
});

/**
 * Caching configuration schema
 */
const CachingSchema = z.object({
  results: withDefault(z.object({
    enabled: booleanFromEnv.default(true),
    ttlSeconds: numberFromEnv(constants.CACHING.RESULT_TTL_SECONDS),
    maxEntries: numberFromEnv(constants.CACHING.RESULT_MAX_ENTRIES),
    similarityThreshold: floatFromEnv(constants.CACHING.SIMILARITY_THRESHOLD)
  })),
  models: withDefault(z.object({
    enabled: booleanFromEnv.default(true),
    ttlSeconds: numberFromEnv(constants.CACHING.MODEL_TTL_SECONDS),
    maxEntries: numberFromEnv(constants.CACHING.MODEL_MAX_ENTRIES)
  }))
});

/**
 * Core abstractions configuration schema
 */
const CoreSchema = z.object({
  handlers: withDefault(z.object({
    enabled: booleanFromEnv.default(false),
    domains: z.array(z.string()).default([])
  })),
  signal: withDefault(z.object({
    enabled: booleanFromEnv.default(false),
    maxHistorySize: numberFromEnv(constants.CORE.SIGNAL_MAX_HISTORY)
  })),
  roleShift: withDefault(z.object({
    enabled: booleanFromEnv.default(false),
    timeout: numberFromEnv(constants.CORE.ROLESHIFT_TIMEOUT_MS)
  })),
  schemas: withDefault(z.object({
    strictValidation: booleanFromEnv.default(false)
  }))
});

/**
 * MCP features configuration schema
 */
const MCPSchema = z.object({
  mode: z.enum(['AGENT', 'MANUAL', 'ALL']).default('ALL'),
  features: withDefault(z.object({
    prompts: booleanFromEnv.default(true),
    resources: booleanFromEnv.default(true),
    sampling: withDefault(z.object({
      enabled: booleanFromEnv.default(true),
      withTools: booleanFromEnv.default(true)
    })),
    elicitation: withDefault(z.object({
      form: booleanFromEnv.default(true),
      url: booleanFromEnv.default(true)
    }))
  })),
  transport: withDefault(z.object({
    streamableHttpEnabled: booleanFromEnv.default(true),
    legacySseEnabled: booleanFromEnv.default(true)
  }))
});

/**
 * Routing configuration schema
 */
const RoutingSchema = z.object({
  boltzmannTemperature: floatFromEnv(0.3),
  minConfidenceThreshold: floatFromEnv(0.5),
  maxEnergyThreshold: floatFromEnv(0.8),
  intentDetectionEnabled: booleanFromEnv.default(true)
});

/**
 * Full configuration schema
 */
const ConfigSchema = z.object({
  server: withDefault(ServerSchema),
  openrouter: withDefault(OpenRouterSchema),
  database: withDefault(DatabaseSchema),
  indexer: withDefault(IndexerSchema),
  jobs: withDefault(JobsSchema),
  logging: withDefault(LoggingSchema),
  caching: withDefault(CachingSchema),
  core: withDefault(CoreSchema),
  mcp: withDefault(MCPSchema),
  routing: withDefault(RoutingSchema)
});

/**
 * Validate configuration object against schema.
 *
 * @param {Object} config - Configuration to validate
 * @returns {{ success: boolean, data?: Object, error?: z.ZodError }} Validation result
 *
 * @example
 * const result = validateConfig(config);
 * if (!result.success) {
 *   console.error('Config errors:', result.error.issues);
 * }
 */
function validateConfig(config) {
  return ConfigSchema.safeParse(config);
}

/**
 * Validate and return configuration with defaults applied.
 *
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validated configuration with defaults
 * @throws {z.ZodError} If validation fails
 */
function parseConfig(config) {
  return ConfigSchema.parse(config);
}

/**
 * Validate specific environment variables.
 *
 * @param {Object} env - Environment variables (process.env)
 * @returns {Array<{key: string, message: string}>} Array of warnings
 */
function validateEnv(env = process.env) {
  const warnings = [];

  // Check for required API key
  if (!env.OPENROUTER_API_KEY && !env.OPENROUTER_API_KEYS && !env.ALLOW_NO_API_KEY) {
    warnings.push({
      key: 'OPENROUTER_API_KEY',
      message: 'No API key configured. Set OPENROUTER_API_KEY or OPENROUTER_API_KEYS (or ALLOW_NO_API_KEY=true)'
    });
  }

  // Check for port conflicts
  if (env.PORT && env.SERVER_PORT && env.PORT !== env.SERVER_PORT) {
    warnings.push({
      key: 'PORT/SERVER_PORT',
      message: `Both PORT (${env.PORT}) and SERVER_PORT (${env.SERVER_PORT}) are set. SERVER_PORT takes precedence.`
    });
  }

  // Check logging level
  if (env.LOG_LEVEL && !constants.LOGGING.LEVELS.includes(env.LOG_LEVEL.toLowerCase())) {
    warnings.push({
      key: 'LOG_LEVEL',
      message: `Invalid LOG_LEVEL "${env.LOG_LEVEL}". Valid values: ${constants.LOGGING.LEVELS.join(', ')}`
    });
  }

  return warnings;
}

module.exports = {
  // Schemas
  ServerSchema,
  OpenRouterSchema,
  DatabaseSchema,
  IndexerSchema,
  JobsSchema,
  LoggingSchema,
  CachingSchema,
  CoreSchema,
  MCPSchema,
  ConfigSchema,

  // Utilities
  booleanFromEnv,
  numberFromEnv,
  floatFromEnv,

  // Functions
  validateConfig,
  parseConfig,
  validateEnv
};
