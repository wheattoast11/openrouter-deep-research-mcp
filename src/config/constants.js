/**
 * Configuration Constants
 *
 * Extracted hardcoded values from across the codebase.
 * Provides a single source of truth for magic numbers and defaults.
 *
 * @module config/constants
 */

'use strict';

/**
 * Server configuration defaults
 */
const SERVER = {
  DEFAULT_PORT: 3002,
  DEFAULT_NAME: 'openrouter_agents',
  STARTUP_TIMEOUT_MS: 30000
};

/**
 * Database configuration defaults
 */
const DATABASE = {
  VECTOR_DIMENSION: 384,  // all-MiniLM-L6-v2 embedding dimension
  CACHE_TTL_SECONDS: 3600,  // 1 hour
  INIT_TIMEOUT_MS: 30000,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_BASE_MS: 200
};

/**
 * Job processing defaults
 */
const JOBS = {
  DEFAULT_CONCURRENCY: 4,
  HEARTBEAT_MS: 2000,
  LEASE_TIMEOUT_MS: 30000,
  BATCH_EVENT_LIMIT: 500,
  SSE_POLLING_MS: 500,
  TTL_MS: 3600000  // 1 hour job expiry
};

/**
 * Model configuration defaults
 */
const MODELS = {
  DEFAULT_PLANNING: 'google/gemini-2.5-pro',
  DEFAULT_CLASSIFICATION: 'openai/gpt-5-mini',
  DEFAULT_ENSEMBLE_SIZE: 2,
  MAX_RESEARCH_ITERATIONS: 2,
  DEFAULT_PARALLELISM: 4,
  MIN_MAX_TOKENS: 2048
};

/**
 * Token limit defaults
 */
const TOKENS = {
  SYNTHESIS: {
    MIN: 4000,
    FALLBACK_MAX: 16000,
    PER_SUBQUERY: 800,
    PER_DOCUMENT: 500
  },
  RESEARCH: {
    MIN: 2000,
    FALLBACK_MAX: 8000
  },
  PLANNING: {
    MIN: 1000,
    FALLBACK_MAX: 4000
  }
};

/**
 * Indexer/search configuration defaults
 */
const INDEXER = {
  MAX_DOC_LENGTH: 8000,
  BM25_K1: 1.2,
  BM25_B: 0.75,
  WEIGHT_BM25: 0.7,
  WEIGHT_VECTOR: 0.3
};

/**
 * Caching configuration defaults
 */
const CACHING = {
  RESULT_TTL_SECONDS: 7200,  // 2 hours
  RESULT_MAX_ENTRIES: 1000,
  MODEL_TTL_SECONDS: 3600,   // 1 hour
  MODEL_MAX_ENTRIES: 500,
  SIMILARITY_THRESHOLD: 0.85
};

/**
 * Cost thresholds (per token)
 */
const COST_THRESHOLDS = {
  SIMPLE: 0.0000005,
  MODERATE: 0.000002,
  COMPLEX: 0.000015
};

/**
 * Core abstraction defaults
 */
const CORE = {
  SIGNAL_MAX_HISTORY: 1000,
  ROLESHIFT_TIMEOUT_MS: 60000,
  REQUEST_TRACKER_TIMEOUT_MS: 60000,
  CONSENSUS_MIN_AGREEMENT: 0.6,
  CRYSTALLIZATION_POSITIVE_WEIGHT: 0.2,
  CRYSTALLIZATION_NEGATIVE_WEIGHT: 0.1
};

/**
 * Tool recursion limits
 */
const TOOL_RECURSION = {
  MAX_DEPTH: 3
};

/**
 * Logging configuration
 */
const LOGGING = {
  DEFAULT_LEVEL: 'info',
  DEFAULT_OUTPUT: 'stderr',
  LEVELS: ['debug', 'info', 'warn', 'error']
};

/**
 * MCP protocol versions
 */
const MCP_SPEC = {
  STABLE: '2025-06-18',
  DRAFT: '2025-11-25',
  FEATURES: ['SEP-1686', 'SEP-1577', 'SEP-1036', 'SEP-1865']
};

/**
 * Default model lists by tier
 */
const DEFAULT_MODELS = {
  HIGH_COST: [
    { name: 'x-ai/grok-4', domains: ['reasoning', 'technical', 'general', 'creative'] },
    { name: 'openai/gpt-5-chat', domains: ['reasoning', 'technical', 'general'] },
    { name: 'google/gemini-2.5-pro', domains: ['reasoning', 'technical', 'general'] },
    { name: 'anthropic/claude-sonnet-4', domains: ['reasoning', 'technical', 'general'] },
    { name: 'qwen/qwen3-coder', domains: ['coding', 'editing', 'technical'] },
    { name: 'qwen/qwen3-235b-a22b-2507', domains: ['general', 'reasoning', 'technical', 'coding'] }
  ],
  LOW_COST: [
    { name: 'deepseek/deepseek-chat-v3.1', domains: ['general', 'reasoning', 'technical', 'coding'] },
    { name: 'z-ai/glm-4.5v', domains: ['general', 'multimodal', 'vision', 'reasoning'] },
    { name: 'z-ai/glm-4.5-air', domains: ['coding', 'technical', 'reasoning'] },
    { name: 'openai/gpt-oss-120b', domains: ['general', 'reasoning', 'search'] },
    { name: 'inception/mercury', domains: ['general', 'creative', 'technical'] },
    { name: 'baidu/ernie-4.5-vl-424b-a47b', domains: ['general', 'creative'] },
    { name: 'google/gemini-2.5-flash', domains: ['coding', 'editing', 'technical'] }
  ],
  VERY_LOW_COST: [
    { name: 'openai/gpt-5-nano', domains: ['general', 'reasoning', 'creative'] }
  ]
};

/**
 * Model weights for consensus calculation
 */
const MODEL_WEIGHTS = {
  'anthropic/claude-sonnet-4': 1.0,
  'anthropic/claude-opus-4': 1.0,
  'openai/gpt-5-chat': 0.95,
  'google/gemini-2.5-pro': 0.90,
  'x-ai/grok-4': 0.85,
  'deepseek/deepseek-chat-v3.1': 0.75,
  'default': 0.5
};

/**
 * Preferred models by use case
 */
const PREFERRED_MODELS = {
  VISION: ['z-ai/glm-4.5v', 'google/gemini-2.5-flash', 'openai/gpt-5-nano'],
  CODING: ['qwen/qwen3-coder', 'z-ai/glm-4.5-air', 'deepseek/deepseek-chat-v3.1'],
  COMPLEX_REASONING: ['deepseek/deepseek-chat-v3.1', 'qwen/qwen3-235b-a22b-2507', 'nousresearch/deephermes-3-mistral-24b-preview']
};

module.exports = {
  SERVER,
  DATABASE,
  JOBS,
  MODELS,
  TOKENS,
  INDEXER,
  CACHING,
  COST_THRESHOLDS,
  CORE,
  TOOL_RECURSION,
  LOGGING,
  MCP_SPEC,
  DEFAULT_MODELS,
  MODEL_WEIGHTS,
  PREFERRED_MODELS
};
