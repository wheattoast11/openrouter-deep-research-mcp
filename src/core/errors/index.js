/**
 * Semantic Error Taxonomy (v1.14.1)
 *
 * Deterministic error classification with auto-semanticization
 * for runtime error learning and circuit breaker integration.
 *
 * Features:
 * - Auto-classification of errors into semantic categories
 * - Runtime pattern learning from new errors
 * - Circuit breaker integration with deterministic trip decisions
 * - DB persistence for error patterns and occurrences
 * - Trace export for debugging and self-improvement
 * - Intent-aware recovery suggestions (v1.14.1)
 * - Model fallback mapping based on user intent
 *
 * Usage (v1.14.1):
 *   const error = wrapError(e, { model: 'anthropic/claude-3-opus' });
 *   const resolution = error.suggestResolution(intentContext);
 *   // → { action: 'retry_with_model', model: 'google/gemini-3-flash-preview', ... }
 *
 * @module core/errors
 */

'use strict';

const logger = require('../../utils/logger').child('ErrorTaxonomy');

/**
 * Error severity levels
 */
const Severity = {
  FATAL: 'fatal',       // Unrecoverable - must stop
  ERROR: 'error',       // Operation failed - should retry or escalate
  WARNING: 'warning',   // Degraded but continuing
  INFO: 'info'          // Informational only
};

/**
 * Error categories for circuit breaker decisions
 */
const Category = {
  // Infrastructure errors - trip circuit breaker
  NETWORK: 'network',           // Connection failures, timeouts
  RATE_LIMIT: 'rate_limit',     // API rate limiting
  SERVICE_UNAVAILABLE: 'service_unavailable', // 503, provider down

  // Configuration errors - don't trip, alert operator
  AUTH: 'auth',                 // Invalid API keys, permissions
  CONFIG: 'config',             // Misconfiguration

  // Input errors - don't trip, return to caller
  VALIDATION: 'validation',     // Bad input parameters
  SCHEMA: 'schema',             // Schema validation failure

  // Runtime errors - may trip based on frequency
  TIMEOUT: 'timeout',           // Operation timeout
  RESOURCE: 'resource',         // Memory, disk, etc.
  EXECUTION: 'execution',       // Model execution failures

  // Business logic - don't trip
  LOGIC: 'logic',               // Application logic errors
  NOT_FOUND: 'not_found',       // Resource not found

  // Unknown - auto-classify
  UNKNOWN: 'unknown'
};

/**
 * Circuit breaker trip decisions
 */
const TripDecision = {
  TRIP: 'trip',           // Close the circuit
  WARN: 'warn',           // Log but don't trip
  IGNORE: 'ignore',       // Transient, ignore
  ESCALATE: 'escalate'    // Alert operator
};

/**
 * Recovery actions (v1.14.1)
 */
const RecoveryAction = {
  RETRY: 'retry',                     // Retry same operation
  RETRY_WITH_MODEL: 'retry_with_model', // Retry with fallback model
  RETRY_WITH_BACKOFF: 'retry_with_backoff', // Retry with exponential backoff
  SIMPLIFY_QUERY: 'simplify_query',   // Reduce query complexity
  SPLIT_QUERY: 'split_query',         // Break into smaller queries
  CACHE_ONLY: 'cache_only',           // Use cached results only
  ABORT: 'abort',                     // Cannot recover
  ESCALATE: 'escalate',               // Needs human intervention
  CHANGE_PROVIDER: 'change_provider'  // Switch provider entirely
};

/**
 * Intent-to-model fallback mapping (v1.14.1)
 * Maps intent categories to recommended fallback models
 */
const IntentFallbackModels = {
  research: [
    'google/gemini-3-flash-preview',
    'deepseek/deepseek-chat-v3.1',
    'anthropic/claude-haiku-4.5'
  ],
  factual: [
    'google/gemini-3-flash-preview',
    'openai/gpt-5-mini',
    'anthropic/claude-haiku-4.5'
  ],
  analytical: [
    'anthropic/claude-sonnet-4.5',
    'openai/gpt-5.2-chat',
    'google/gemini-3-flash-preview'
  ],
  creative: [
    'anthropic/claude-sonnet-4.5',
    'openai/gpt-5.2-chat',
    'google/gemini-3-flash-preview'
  ],
  code: [
    'anthropic/claude-sonnet-4.5',
    'deepseek/deepseek-coder',
    'openai/gpt-5.2-chat'
  ],
  system: [
    'openai/gpt-5-mini',
    'google/gemini-3-flash-preview',
    'anthropic/claude-haiku-4.5'
  ],
  conversational: [
    'openai/gpt-5-mini',
    'anthropic/claude-haiku-4.5',
    'google/gemini-3-flash-preview'
  ],
  default: [
    'google/gemini-3-flash-preview',
    'openai/gpt-5-mini',
    'anthropic/claude-haiku-4.5'
  ]
};

/**
 * Error patterns for auto-classification
 * Maps regex patterns to categories
 */
const ErrorPatterns = [
  // Network errors
  { pattern: /ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT/i, category: Category.NETWORK, severity: Severity.ERROR },
  { pattern: /socket hang up|network.*error/i, category: Category.NETWORK, severity: Severity.ERROR },
  { pattern: /fetch failed|connection.*refused/i, category: Category.NETWORK, severity: Severity.ERROR },

  // Rate limiting
  { pattern: /rate.?limit|too many requests|429/i, category: Category.RATE_LIMIT, severity: Severity.WARNING },
  { pattern: /quota.*exceeded|throttl/i, category: Category.RATE_LIMIT, severity: Severity.WARNING },

  // Service unavailable
  { pattern: /503|service.*unavailable|temporarily.*unavailable/i, category: Category.SERVICE_UNAVAILABLE, severity: Severity.ERROR },
  { pattern: /502|bad gateway|gateway.*timeout/i, category: Category.SERVICE_UNAVAILABLE, severity: Severity.ERROR },
  { pattern: /500|internal.*server.*error/i, category: Category.SERVICE_UNAVAILABLE, severity: Severity.ERROR },

  // Auth errors
  { pattern: /401|unauthorized|invalid.*api.*key|authentication/i, category: Category.AUTH, severity: Severity.FATAL },
  { pattern: /403|forbidden|permission.*denied/i, category: Category.AUTH, severity: Severity.FATAL },
  { pattern: /invalid.*token|expired.*token/i, category: Category.AUTH, severity: Severity.FATAL },

  // Config errors
  { pattern: /missing.*config|invalid.*config|configuration/i, category: Category.CONFIG, severity: Severity.FATAL },
  { pattern: /environment.*variable|env.*not.*set/i, category: Category.CONFIG, severity: Severity.FATAL },

  // Validation errors
  { pattern: /validation.*failed|invalid.*parameter|required.*field/i, category: Category.VALIDATION, severity: Severity.WARNING },
  { pattern: /must be|expected.*but.*got|type.*error/i, category: Category.VALIDATION, severity: Severity.WARNING },

  // Schema errors
  { pattern: /schema.*validation|zod.*error|json.*schema/i, category: Category.SCHEMA, severity: Severity.WARNING },

  // Timeout errors
  { pattern: /timeout|timed.*out|deadline.*exceeded/i, category: Category.TIMEOUT, severity: Severity.ERROR },
  { pattern: /operation.*aborted|abortcontroller/i, category: Category.TIMEOUT, severity: Severity.WARNING },

  // Resource errors
  { pattern: /out of memory|heap.*limit|memory.*allocation/i, category: Category.RESOURCE, severity: Severity.FATAL },
  { pattern: /ENOSPC|disk.*full|no.*space/i, category: Category.RESOURCE, severity: Severity.FATAL },

  // Execution errors
  { pattern: /model.*execution|inference.*failed|generation.*error/i, category: Category.EXECUTION, severity: Severity.ERROR },
  { pattern: /context.*length|token.*limit|content.*filter/i, category: Category.EXECUTION, severity: Severity.WARNING },

  // Not found
  { pattern: /404|not.*found|does.*not.*exist/i, category: Category.NOT_FOUND, severity: Severity.WARNING },

  // Logic errors
  { pattern: /assertion|invariant|unexpected.*state/i, category: Category.LOGIC, severity: Severity.ERROR }
];

/**
 * Runtime-learned error patterns
 * Stored in memory, persisted to DB if available
 */
const learnedPatterns = new Map();

/**
 * Error occurrence tracking for frequency-based decisions
 */
const errorOccurrences = new Map();
const OCCURRENCE_WINDOW_MS = 60000; // 1 minute window

/**
 * Error trace history for debugging and self-improvement
 * Keeps recent errors with full context for analysis
 */
const errorTraceHistory = [];
const MAX_TRACE_HISTORY = 100;

/**
 * DB persistence layer (lazy loaded to avoid circular deps)
 */
let dbClient = null;
let dbInitialized = false;

/**
 * Initialize DB persistence for error patterns
 * Called lazily on first persist/load operation
 */
async function initDB() {
  if (dbInitialized) return true;
  try {
    dbClient = require('../../utils/dbClient');
    // Create error_patterns table if not exists
    await dbClient.executeQuery(`
      CREATE TABLE IF NOT EXISTS error_patterns (
        id SERIAL PRIMARY KEY,
        pattern TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        hit_count INTEGER DEFAULT 1,
        last_hit_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        learned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        source TEXT DEFAULT 'runtime',
        context JSONB DEFAULT '{}'
      );
    `);
    await dbClient.executeQuery(`
      CREATE TABLE IF NOT EXISTS error_trace (
        id SERIAL PRIMARY KEY,
        session_id TEXT,
        error_hash TEXT NOT NULL,
        message TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        trip_decision TEXT,
        stack TEXT,
        context JSONB DEFAULT '{}',
        suggested_fix TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await dbClient.executeQuery(`CREATE INDEX IF NOT EXISTS idx_error_patterns_category ON error_patterns(category);`);
    await dbClient.executeQuery(`CREATE INDEX IF NOT EXISTS idx_error_trace_category ON error_trace(category);`);
    await dbClient.executeQuery(`CREATE INDEX IF NOT EXISTS idx_error_trace_hash ON error_trace(error_hash);`);
    dbInitialized = true;
    logger.debug('Error taxonomy DB tables initialized');
    return true;
  } catch (err) {
    logger.debug('DB persistence not available for error taxonomy', { error: err.message });
    return false;
  }
}

/**
 * Classify an error into semantic categories
 *
 * @param {Error|string} error - Error to classify
 * @returns {object} Classification result
 */
function classify(error) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : null;
  const code = error instanceof Error ? error.code : null;

  // Try static patterns first
  for (const { pattern, category, severity } of ErrorPatterns) {
    if (pattern.test(message) || (code && pattern.test(code))) {
      return {
        category,
        severity,
        message,
        code,
        pattern: pattern.source,
        learned: false
      };
    }
  }

  // Try learned patterns
  for (const [patternStr, info] of learnedPatterns) {
    const pattern = new RegExp(patternStr, 'i');
    if (pattern.test(message)) {
      return {
        category: info.category,
        severity: info.severity,
        message,
        code,
        pattern: patternStr,
        learned: true
      };
    }
  }

  // Auto-semanticize unknown error
  return autoSemanticize(message, code, stack);
}

/**
 * Auto-semanticize an unknown error
 *
 * @param {string} message - Error message
 * @param {string} code - Error code if available
 * @param {string} stack - Stack trace if available
 * @returns {object} Classification result
 */
function autoSemanticize(message, code, stack) {
  // Extract potential keywords for pattern learning
  const keywords = extractKeywords(message);

  // Determine likely category based on heuristics
  let category = Category.UNKNOWN;
  let severity = Severity.ERROR;

  // HTTP status code heuristics
  const statusMatch = message.match(/\b([45]\d{2})\b/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10);
    if (status >= 500) {
      category = Category.SERVICE_UNAVAILABLE;
    } else if (status === 429) {
      category = Category.RATE_LIMIT;
    } else if (status === 401 || status === 403) {
      category = Category.AUTH;
      severity = Severity.FATAL;
    } else if (status === 404) {
      category = Category.NOT_FOUND;
      severity = Severity.WARNING;
    } else if (status >= 400) {
      category = Category.VALIDATION;
      severity = Severity.WARNING;
    }
  }

  // Common error code patterns
  if (code) {
    if (code.startsWith('E')) {
      // Node.js system error codes
      if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'].includes(code)) {
        category = Category.NETWORK;
      } else if (['ENOENT', 'EACCES', 'EPERM'].includes(code)) {
        category = Category.RESOURCE;
      }
    }
  }

  // Log for analysis
  logger.debug('Auto-semanticized unknown error', {
    message: message.substring(0, 200),
    category,
    severity,
    keywords
  });

  return {
    category,
    severity,
    message,
    code,
    pattern: null,
    learned: false,
    autoClassified: true,
    suggestedPattern: keywords.length > 0 ? keywords.join('|') : null
  };
}

/**
 * Extract keywords from error message for pattern learning
 */
function extractKeywords(message) {
  // Remove common noise words and extract meaningful terms
  const noise = /\b(the|a|an|is|was|are|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|can|need|dare|ought|used|to|of|in|for|on|with|at|by|from|as|into|through|during|before|after|above|below|between|under|over|out|up|down|off|then|once|here|there|when|where|why|how|all|each|every|both|few|more|most|other|some|such|no|nor|not|only|own|same|so|than|too|very|just|also)\b/gi;

  const cleaned = message
    .toLowerCase()
    .replace(noise, '')
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);

  // Get unique meaningful words
  return [...new Set(cleaned)].slice(0, 5);
}

/**
 * Learn a new error pattern at runtime
 *
 * @param {string} pattern - Regex pattern string
 * @param {string} category - Error category
 * @param {string} severity - Error severity
 * @param {object} [context] - Additional context for the pattern
 */
async function learnPattern(pattern, category, severity, context = {}) {
  if (!Object.values(Category).includes(category)) {
    logger.warn('Invalid category for learned pattern', { category, pattern });
    return false;
  }

  learnedPatterns.set(pattern, {
    category,
    severity,
    learnedAt: Date.now(),
    context
  });

  logger.info('Learned new error pattern', { pattern, category, severity });

  // Persist to DB if available
  try {
    if (await initDB()) {
      await dbClient.executeQuery(`
        INSERT INTO error_patterns (pattern, category, severity, source, context)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (pattern) DO UPDATE SET
          hit_count = error_patterns.hit_count + 1,
          last_hit_at = CURRENT_TIMESTAMP
      `, [pattern, category, severity, context.source || 'runtime', JSON.stringify(context)]);
    }
  } catch (err) {
    logger.debug('Failed to persist error pattern', { error: err.message });
  }

  return true;
}

/**
 * Load learned patterns from DB
 */
async function loadLearnedPatterns() {
  try {
    if (await initDB()) {
      const result = await dbClient.executeQuery(`
        SELECT pattern, category, severity, context FROM error_patterns
      `);
      for (const row of result.rows) {
        learnedPatterns.set(row.pattern, {
          category: row.category,
          severity: row.severity,
          learnedAt: Date.now(),
          context: row.context || {}
        });
      }
      logger.debug('Loaded learned error patterns from DB', { count: result.rows.length });
    }
  } catch (err) {
    logger.debug('Failed to load learned patterns', { error: err.message });
  }
}

/**
 * Track error occurrence for frequency-based decisions
 *
 * @param {string} category - Error category
 * @returns {number} Occurrence count in current window
 */
function trackOccurrence(category) {
  const now = Date.now();
  const key = `${category}`;

  if (!errorOccurrences.has(key)) {
    errorOccurrences.set(key, []);
  }

  const occurrences = errorOccurrences.get(key);

  // Remove old occurrences outside window
  const windowStart = now - OCCURRENCE_WINDOW_MS;
  const filtered = occurrences.filter(ts => ts > windowStart);
  filtered.push(now);

  errorOccurrences.set(key, filtered);

  return filtered.length;
}

/**
 * Determine circuit breaker trip decision
 *
 * @param {object} classification - Classification from classify()
 * @returns {object} Trip decision with rationale
 */
function shouldTripCircuit(classification) {
  const { category, severity } = classification;
  const occurrences = trackOccurrence(category);

  // Fatal errors always escalate
  if (severity === Severity.FATAL) {
    return {
      decision: TripDecision.ESCALATE,
      reason: `Fatal ${category} error requires operator attention`,
      occurrences
    };
  }

  // Category-based decisions
  switch (category) {
    case Category.NETWORK:
    case Category.SERVICE_UNAVAILABLE:
      // Trip if frequent (>3 in 1 minute)
      if (occurrences >= 3) {
        return {
          decision: TripDecision.TRIP,
          reason: `Repeated ${category} errors (${occurrences} in last minute)`,
          occurrences
        };
      }
      return {
        decision: TripDecision.WARN,
        reason: `${category} error (${occurrences} occurrences)`,
        occurrences
      };

    case Category.RATE_LIMIT:
      // Always trip on rate limit
      return {
        decision: TripDecision.TRIP,
        reason: 'Rate limit hit - backing off',
        occurrences
      };

    case Category.TIMEOUT:
      // Trip if very frequent
      if (occurrences >= 5) {
        return {
          decision: TripDecision.TRIP,
          reason: `Repeated timeouts (${occurrences} in last minute)`,
          occurrences
        };
      }
      return {
        decision: TripDecision.WARN,
        reason: `Timeout (${occurrences} occurrences)`,
        occurrences
      };

    case Category.AUTH:
    case Category.CONFIG:
      // Escalate config/auth issues
      return {
        decision: TripDecision.ESCALATE,
        reason: `${category} issue requires configuration fix`,
        occurrences
      };

    case Category.VALIDATION:
    case Category.SCHEMA:
    case Category.NOT_FOUND:
    case Category.LOGIC:
      // Don't trip for client/logic errors
      return {
        decision: TripDecision.IGNORE,
        reason: `${category} error - client responsibility`,
        occurrences
      };

    case Category.RESOURCE:
      // Escalate resource issues
      return {
        decision: TripDecision.ESCALATE,
        reason: 'Resource exhaustion detected',
        occurrences
      };

    case Category.EXECUTION:
      // Trip if frequent
      if (occurrences >= 3) {
        return {
          decision: TripDecision.TRIP,
          reason: `Repeated execution errors (${occurrences} in last minute)`,
          occurrences
        };
      }
      return {
        decision: TripDecision.WARN,
        reason: `Execution error (${occurrences} occurrences)`,
        occurrences
      };

    default:
      // Unknown errors - warn but don't trip unless very frequent
      if (occurrences >= 10) {
        return {
          decision: TripDecision.TRIP,
          reason: `Too many unknown errors (${occurrences} in last minute)`,
          occurrences
        };
      }
      return {
        decision: TripDecision.WARN,
        reason: `Unknown error category (${occurrences} occurrences)`,
        occurrences
      };
  }
}

/**
 * Semantic Error class with intent-aware recovery (v1.14.1)
 */
class SemanticError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'SemanticError';

    // Classify on construction
    const classification = classify(options.cause || message);

    this.category = options.category || classification.category;
    this.severity = options.severity || classification.severity;
    this.code = options.code || classification.code;
    this.tripDecision = shouldTripCircuit(classification);
    this.classification = classification;

    // Track failed model for resolution
    this.failedModel = options.model || null;
    this.failedProvider = options.provider || this._extractProvider(options.model);

    // Preserve cause chain
    if (options.cause) {
      this.cause = options.cause;
    }

    Error.captureStackTrace(this, SemanticError);
  }

  /**
   * Extract provider from model string
   * @private
   */
  _extractProvider(model) {
    if (!model) return null;
    const parts = model.split('/');
    return parts.length > 1 ? parts[0] : null;
  }

  /**
   * Suggest resolution based on error category and intent context (v1.14.1)
   *
   * @param {object} [intentContext] - Intent classification context
   * @param {string} [intentContext.classification] - Intent category
   * @param {number} [intentContext.confidence] - Classification confidence
   * @param {string} [intentContext.query] - Original query
   * @param {Array<string>} [excludeModels] - Models to exclude from fallback suggestions
   * @returns {object} Resolution suggestion
   */
  suggestResolution(intentContext = null, excludeModels = []) {
    const { category, severity } = this;
    const intent = intentContext?.classification?.toLowerCase() || 'default';
    const excludeSet = new Set(excludeModels.concat(this.failedModel ? [this.failedModel] : []));

    // Get intent-appropriate fallback models
    const fallbackCandidates = IntentFallbackModels[intent] || IntentFallbackModels.default;
    const availableFallbacks = fallbackCandidates.filter(m => !excludeSet.has(m));

    // Base resolution
    const resolution = {
      action: RecoveryAction.RETRY,
      reason: '',
      model: null,
      backoffMs: 0,
      confidence: 0.5,
      intentAligned: !!intentContext,
      alternatives: []
    };

    // Category-specific recovery strategies
    switch (category) {
      case Category.RATE_LIMIT:
        if (availableFallbacks.length > 0) {
          resolution.action = RecoveryAction.RETRY_WITH_MODEL;
          resolution.model = availableFallbacks[0];
          resolution.reason = `Rate limit hit on ${this.failedModel || 'primary model'}. Switching to ${resolution.model} for ${intent} intent.`;
          resolution.confidence = 0.8;
          resolution.backoffMs = 1000;
          resolution.alternatives = availableFallbacks.slice(1, 3);
        } else {
          resolution.action = RecoveryAction.RETRY_WITH_BACKOFF;
          resolution.reason = 'Rate limit hit. No alternative models available. Using exponential backoff.';
          resolution.backoffMs = 5000;
          resolution.confidence = 0.4;
        }
        break;

      case Category.SERVICE_UNAVAILABLE:
        if (availableFallbacks.length > 0) {
          resolution.action = RecoveryAction.CHANGE_PROVIDER;
          // Pick a model from a different provider
          const differentProvider = availableFallbacks.find(m =>
            this._extractProvider(m) !== this.failedProvider
          );
          resolution.model = differentProvider || availableFallbacks[0];
          resolution.reason = `Service unavailable. Switching provider to ${resolution.model}.`;
          resolution.confidence = 0.7;
          resolution.alternatives = availableFallbacks.filter(m => m !== resolution.model).slice(0, 2);
        } else {
          resolution.action = RecoveryAction.CACHE_ONLY;
          resolution.reason = 'Service unavailable. Falling back to cached results if available.';
          resolution.confidence = 0.3;
        }
        break;

      case Category.TIMEOUT:
        // For timeouts, suggest simpler query or different model based on intent
        if (intent === 'research' || intent === 'analytical') {
          resolution.action = RecoveryAction.SPLIT_QUERY;
          resolution.reason = 'Query timed out. Consider breaking into smaller sub-queries for complex analysis.';
          resolution.confidence = 0.6;
        } else {
          resolution.action = RecoveryAction.RETRY_WITH_MODEL;
          // Use a faster model for non-complex intents
          const fastModels = ['openai/gpt-5-mini', 'google/gemini-3-flash-preview', 'anthropic/claude-haiku-4.5'];
          resolution.model = fastModels.find(m => !excludeSet.has(m)) || availableFallbacks[0];
          resolution.reason = `Timeout for ${intent} query. Using faster model ${resolution.model}.`;
          resolution.confidence = 0.65;
        }
        resolution.backoffMs = 500;
        break;

      case Category.EXECUTION:
        // Model execution failed - try different model optimized for intent
        if (availableFallbacks.length > 0) {
          resolution.action = RecoveryAction.RETRY_WITH_MODEL;
          resolution.model = availableFallbacks[0];
          resolution.reason = `Execution error. Using ${resolution.model} optimized for ${intent} intent.`;
          resolution.confidence = 0.7;
          resolution.alternatives = availableFallbacks.slice(1, 3);

          // For code intent, prefer code-specific models
          if (intent === 'code') {
            const codeModel = availableFallbacks.find(m => m.includes('coder') || m.includes('deepseek'));
            if (codeModel) {
              resolution.model = codeModel;
              resolution.reason = `Execution error. Using code-specialized model ${codeModel}.`;
              resolution.confidence = 0.75;
            }
          }
        } else {
          resolution.action = RecoveryAction.SIMPLIFY_QUERY;
          resolution.reason = 'Execution failed. Consider simplifying the query or reducing context length.';
          resolution.confidence = 0.5;
        }
        break;

      case Category.NETWORK:
        resolution.action = RecoveryAction.RETRY_WITH_BACKOFF;
        resolution.reason = 'Network error. Retrying with exponential backoff.';
        resolution.backoffMs = 2000;
        resolution.confidence = 0.6;
        // Also suggest alternative if multiple network failures
        if (availableFallbacks.length > 0) {
          resolution.alternatives = availableFallbacks.slice(0, 2);
        }
        break;

      case Category.AUTH:
      case Category.CONFIG:
        resolution.action = RecoveryAction.ESCALATE;
        resolution.reason = `Configuration issue: ${this.message}. Requires operator intervention.`;
        resolution.confidence = 0.9;
        break;

      case Category.RESOURCE:
        resolution.action = RecoveryAction.ABORT;
        resolution.reason = 'Resource exhaustion. Cannot recover automatically.';
        resolution.confidence = 0.95;
        break;

      case Category.VALIDATION:
      case Category.SCHEMA:
        resolution.action = RecoveryAction.SIMPLIFY_QUERY;
        resolution.reason = 'Input validation failed. Review and simplify the query parameters.';
        resolution.confidence = 0.7;
        break;

      case Category.NOT_FOUND:
        resolution.action = RecoveryAction.CACHE_ONLY;
        resolution.reason = 'Resource not found. Check if cached version exists.';
        resolution.confidence = 0.4;
        break;

      default:
        // Unknown category - generic retry with fallback
        if (availableFallbacks.length > 0) {
          resolution.action = RecoveryAction.RETRY_WITH_MODEL;
          resolution.model = availableFallbacks[0];
          resolution.reason = `Unknown error. Attempting recovery with ${resolution.model}.`;
          resolution.confidence = 0.4;
          resolution.alternatives = availableFallbacks.slice(1, 2);
        } else {
          resolution.action = RecoveryAction.RETRY_WITH_BACKOFF;
          resolution.reason = 'Unknown error. Retrying with backoff.';
          resolution.backoffMs = 3000;
          resolution.confidence = 0.3;
        }
    }

    // Adjust confidence based on intent context availability
    if (intentContext && intentContext.confidence) {
      resolution.confidence *= (0.5 + 0.5 * intentContext.confidence);
    }

    return resolution;
  }

  /**
   * Check if the error is recoverable
   *
   * @param {object} [intentContext] - Intent context for context-aware check
   * @returns {boolean}
   */
  isRecoverable(intentContext = null) {
    const resolution = this.suggestResolution(intentContext);
    return resolution.action !== RecoveryAction.ABORT &&
           resolution.action !== RecoveryAction.ESCALATE;
  }

  /**
   * Get recommended wait time before retry
   *
   * @param {number} [attemptNumber=1] - Current attempt number for exponential backoff
   * @returns {number} Wait time in milliseconds
   */
  getRetryDelay(attemptNumber = 1) {
    const baseDelays = {
      [Category.RATE_LIMIT]: 5000,
      [Category.SERVICE_UNAVAILABLE]: 3000,
      [Category.NETWORK]: 2000,
      [Category.TIMEOUT]: 1000,
      [Category.EXECUTION]: 500
    };

    const baseDelay = baseDelays[this.category] || 1000;
    // Exponential backoff with jitter
    const exponential = baseDelay * Math.pow(2, attemptNumber - 1);
    const jitter = Math.random() * 0.3 * exponential;

    return Math.min(exponential + jitter, 60000); // Cap at 60 seconds
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      code: this.code,
      tripDecision: this.tripDecision,
      classification: this.classification,
      failedModel: this.failedModel,
      failedProvider: this.failedProvider,
      isRecoverable: this.isRecoverable()
    };
  }
}

/**
 * Wrap an error with semantic classification
 *
 * @param {Error} error - Original error
 * @param {object} [options] - Additional options (v1.14.1)
 * @param {string} [options.model] - Model that produced the error
 * @param {string} [options.provider] - Provider that produced the error
 * @returns {SemanticError}
 */
function wrapError(error, options = {}) {
  if (error instanceof SemanticError) {
    // Update model info if not set
    if (options.model && !error.failedModel) {
      error.failedModel = options.model;
      error.failedProvider = error._extractProvider(options.model);
    }
    return error;
  }
  return new SemanticError(error.message, {
    cause: error,
    model: options.model,
    provider: options.provider
  });
}

/**
 * Quick resolution suggestion without creating SemanticError (v1.14.1)
 *
 * @param {Error|string} error - Error to analyze
 * @param {object} [intentContext] - Intent context
 * @param {object} [options] - Additional options
 * @param {string} [options.model] - Failed model
 * @param {Array<string>} [options.excludeModels] - Models to exclude
 * @returns {object} Resolution suggestion
 */
function suggestRecovery(error, intentContext = null, options = {}) {
  const semantic = wrapError(
    error instanceof Error ? error : new Error(error),
    { model: options.model }
  );
  return semantic.suggestResolution(intentContext, options.excludeModels || []);
}

/**
 * Check if an error is recoverable based on intent (v1.14.1)
 *
 * @param {Error|string} error - Error to check
 * @param {object} [intentContext] - Intent context
 * @returns {boolean}
 */
function isRecoverable(error, intentContext = null) {
  const semantic = wrapError(error instanceof Error ? error : new Error(error));
  return semantic.isRecoverable(intentContext);
}

/**
 * Get statistics about error patterns
 */
function getStats() {
  const stats = {
    staticPatterns: ErrorPatterns.length,
    learnedPatterns: learnedPatterns.size,
    recentOccurrences: {},
    totalTracked: 0,
    traceHistory: errorTraceHistory.length
  };

  for (const [key, occurrences] of errorOccurrences) {
    stats.recentOccurrences[key] = occurrences.length;
    stats.totalTracked += occurrences.length;
  }

  return stats;
}

/**
 * Clear occurrence tracking (useful for testing)
 */
function clearOccurrences() {
  errorOccurrences.clear();
}

/**
 * Record an error to trace history for debugging
 *
 * @param {Error|SemanticError} error - Error to record
 * @param {object} [context] - Additional context
 * @param {string} [sessionId] - Session identifier
 * @returns {object} The recorded trace entry
 */
async function recordTrace(error, context = {}, sessionId = 'default') {
  const crypto = require('crypto');
  const classification = error.classification || classify(error);
  const tripDecision = error.tripDecision || shouldTripCircuit(classification);

  // Create error hash for deduplication
  const errorHash = crypto.createHash('sha256')
    .update(`${classification.category}:${classification.message?.substring(0, 100) || ''}`)
    .digest('hex')
    .substring(0, 16);

  // Generate suggested fix based on category
  const suggestedFix = generateSuggestedFix(classification);

  const traceEntry = {
    id: crypto.randomUUID(),
    sessionId,
    errorHash,
    timestamp: Date.now(),
    message: classification.message,
    category: classification.category,
    severity: classification.severity,
    tripDecision: tripDecision.decision,
    tripReason: tripDecision.reason,
    stack: error.stack || null,
    context,
    suggestedFix,
    suggestedPattern: classification.suggestedPattern,
    learned: classification.learned,
    autoClassified: classification.autoClassified || false
  };

  // Add to in-memory history
  errorTraceHistory.unshift(traceEntry);
  if (errorTraceHistory.length > MAX_TRACE_HISTORY) {
    errorTraceHistory.pop();
  }

  // Persist to DB if available
  try {
    if (await initDB()) {
      await dbClient.executeQuery(`
        INSERT INTO error_trace (session_id, error_hash, message, category, severity, trip_decision, stack, context, suggested_fix)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        sessionId,
        errorHash,
        classification.message?.substring(0, 1000) || '',
        classification.category,
        classification.severity,
        tripDecision.decision,
        error.stack?.substring(0, 2000) || null,
        JSON.stringify(context),
        suggestedFix
      ]);
    }
  } catch (err) {
    logger.debug('Failed to persist error trace', { error: err.message });
  }

  // Auto-learn if this is an unknown error with a suggested pattern
  if (classification.autoClassified && classification.suggestedPattern && classification.category !== Category.UNKNOWN) {
    await learnPattern(classification.suggestedPattern, classification.category, classification.severity, {
      source: 'auto-semanticize',
      firstSeen: Date.now(),
      sessionId
    });
  }

  return traceEntry;
}

/**
 * Generate a suggested fix based on error category
 */
function generateSuggestedFix(classification) {
  const { category, message, code } = classification;

  const fixes = {
    [Category.NETWORK]: `Check network connectivity. Verify the endpoint URL is correct and accessible. Consider adding retry logic with exponential backoff.`,
    [Category.RATE_LIMIT]: `Implement rate limiting on the client side. Add exponential backoff. Consider caching responses to reduce API calls.`,
    [Category.SERVICE_UNAVAILABLE]: `The service is temporarily unavailable. Implement circuit breaker pattern. Add fallback behavior or graceful degradation.`,
    [Category.AUTH]: `Check API key configuration. Verify environment variables are set correctly. Ensure credentials haven't expired.`,
    [Category.CONFIG]: `Review configuration files. Check environment variables. Verify all required config values are present.`,
    [Category.VALIDATION]: `Check input parameters. Ensure required fields are provided. Verify data types match expected schema.`,
    [Category.SCHEMA]: `Input does not match expected schema. Review Zod/JSON schema definitions. Validate input before processing.`,
    [Category.TIMEOUT]: `Operation timed out. Consider increasing timeout values. Optimize the operation or add progress indicators.`,
    [Category.RESOURCE]: `Resource exhaustion detected. Check memory usage, disk space, or connection pools. Consider scaling or cleanup.`,
    [Category.EXECUTION]: `Model execution failed. Check token limits, content filters, or model availability. Consider fallback models.`,
    [Category.NOT_FOUND]: `Resource not found. Verify the ID/path is correct. Check if the resource was deleted.`,
    [Category.LOGIC]: `Application logic error. Review the code flow. Add assertions and invariant checks.`,
    [Category.UNKNOWN]: `Unknown error. Review the error message and stack trace. Consider adding a pattern to the error taxonomy.`
  };

  let fix = fixes[category] || fixes[Category.UNKNOWN];

  // Add specific suggestions based on error code
  if (code) {
    if (code === 'ECONNREFUSED') fix += ' Ensure the target service is running.';
    if (code === 'ETIMEDOUT') fix += ' Check firewall rules and network latency.';
    if (code === 'ENOENT') fix += ' Verify the file path exists.';
  }

  return fix;
}

/**
 * Get recent error traces for debugging
 *
 * @param {object} [options] - Filter options
 * @param {string} [options.category] - Filter by category
 * @param {string} [options.sessionId] - Filter by session
 * @param {number} [options.limit=20] - Max results
 * @returns {Array} Recent error traces
 */
function getTraces(options = {}) {
  let traces = [...errorTraceHistory];

  if (options.category) {
    traces = traces.filter(t => t.category === options.category);
  }
  if (options.sessionId) {
    traces = traces.filter(t => t.sessionId === options.sessionId);
  }

  return traces.slice(0, options.limit || 20);
}

/**
 * Get error traces from DB with full history
 *
 * @param {object} [options] - Query options
 * @returns {Promise<Array>} Error traces from DB
 */
async function getTracesFromDB(options = {}) {
  try {
    if (!(await initDB())) return [];

    const { category, sessionId, limit = 50, since } = options;
    let sql = 'SELECT * FROM error_trace WHERE 1=1';
    const params = [];

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    if (sessionId) {
      params.push(sessionId);
      sql += ` AND session_id = $${params.length}`;
    }
    if (since) {
      params.push(new Date(since).toISOString());
      sql += ` AND created_at >= $${params.length}`;
    }

    params.push(limit);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const result = await dbClient.executeQuery(sql, params);
    return result.rows;
  } catch (err) {
    logger.debug('Failed to get traces from DB', { error: err.message });
    return [];
  }
}

/**
 * Get learned patterns for inspection
 */
function getLearnedPatterns() {
  const patterns = [];
  for (const [pattern, info] of learnedPatterns) {
    patterns.push({
      pattern,
      category: info.category,
      severity: info.severity,
      learnedAt: info.learnedAt,
      context: info.context
    });
  }
  return patterns;
}

/**
 * Export full error taxonomy state for debugging/self-improvement
 * This is the main function for AI to learn from errors
 */
function exportTaxonomyState() {
  return {
    stats: getStats(),
    learnedPatterns: getLearnedPatterns(),
    recentTraces: getTraces({ limit: 50 }),
    staticPatternCount: ErrorPatterns.length,
    categories: Object.values(Category),
    severities: Object.values(Severity),
    tripDecisions: Object.values(TripDecision),
    // For self-referential learning
    meta: {
      exportedAt: Date.now(),
      description: 'Semantic Error Taxonomy state export for debugging and AI-assisted improvement',
      usage: {
        learnPattern: 'Call learnPattern(pattern, category, severity) to add new patterns',
        recordTrace: 'Call recordTrace(error, context, sessionId) to record errors',
        getTraces: 'Call getTraces({category, sessionId, limit}) to retrieve recent errors',
        exportTaxonomyState: 'Call this function to get full state for analysis'
      }
    }
  };
}

module.exports = {
  // Constants
  Severity,
  Category,
  TripDecision,
  RecoveryAction,
  IntentFallbackModels,

  // Classification
  classify,
  shouldTripCircuit,
  autoSemanticize,

  // Learning & Persistence
  learnPattern,
  loadLearnedPatterns,
  trackOccurrence,

  // Error class
  SemanticError,
  wrapError,

  // Intent-aware recovery (v1.14.1)
  suggestRecovery,
  isRecoverable,

  // Trace & Debug
  recordTrace,
  getTraces,
  getTracesFromDB,
  getLearnedPatterns,
  exportTaxonomyState,

  // Utils
  getStats,
  clearOccurrences,
  initDB,

  // For testing
  ErrorPatterns,
  extractKeywords
};
