/**
 * Error Infrastructure for OpenRouter Agents MCP Server
 * Provides structured error handling with cause chains, categorization, and logging utilities.
 */

/**
 * Error categories for classification
 */
const ErrorCategory = {
  // Transient - can be retried
  NETWORK: 'NETWORK',
  RATE_LIMIT: 'RATE_LIMIT',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',

  // Fatal - cannot be retried without user intervention
  AUTHENTICATION: 'AUTHENTICATION',
  AUTHORIZATION: 'AUTHORIZATION',
  CONFIGURATION: 'CONFIGURATION',
  VALIDATION: 'VALIDATION',

  // Operational - may indicate bugs
  INTERNAL: 'INTERNAL',
  DATABASE: 'DATABASE',
  EMBEDDER: 'EMBEDDER',

  // Unknown
  UNKNOWN: 'UNKNOWN'
};

/**
 * Base error class with structured metadata and cause chain support
 */
class MCPError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MCPError';
    this.category = options.category || ErrorCategory.UNKNOWN;
    this.code = options.code || 'MCP_ERROR';
    this.isRetryable = options.isRetryable ?? this._inferRetryable();
    this.cause = options.cause || null;
    this.context = options.context || {};
    this.timestamp = new Date().toISOString();
    this.requestId = options.requestId || null;

    // Capture original stack if cause provided
    if (this.cause?.stack) {
      this.stack = `${this.stack}\nCaused by: ${this.cause.stack}`;
    }
  }

  _inferRetryable() {
    const retryable = [
      ErrorCategory.NETWORK,
      ErrorCategory.RATE_LIMIT,
      ErrorCategory.SERVICE_UNAVAILABLE,
      ErrorCategory.TIMEOUT
    ];
    return retryable.includes(this.category);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      code: this.code,
      isRetryable: this.isRetryable,
      context: this.context,
      timestamp: this.timestamp,
      requestId: this.requestId,
      stack: this.stack
    };
  }
}

/**
 * API-specific error (OpenRouter, etc.)
 */
class APIError extends MCPError {
  constructor(message, statusCode, responseBody, options = {}) {
    super(message, {
      ...options,
      category: classifyAPIError(statusCode, responseBody),
      code: `API_${statusCode || 'UNKNOWN'}`
    });
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

/**
 * Configuration error (missing API keys, invalid config)
 */
class ConfigurationError extends MCPError {
  constructor(message, missingKey, options = {}) {
    super(message, {
      ...options,
      category: ErrorCategory.CONFIGURATION,
      code: 'CONFIG_MISSING',
      isRetryable: false
    });
    this.name = 'ConfigurationError';
    this.missingKey = missingKey;
  }
}

/**
 * Database error (connection, query failures)
 */
class DatabaseError extends MCPError {
  constructor(message, operation, options = {}) {
    super(message, {
      ...options,
      category: ErrorCategory.DATABASE,
      code: 'DB_ERROR'
    });
    this.name = 'DatabaseError';
    this.operation = operation;
  }
}

/**
 * Stream error (OpenRouter streaming failures)
 */
class StreamError extends MCPError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      category: options.category || ErrorCategory.NETWORK,
      code: options.code || 'STREAM_ERROR'
    });
    this.name = 'StreamError';
  }
}

/**
 * Resource not found error - distinct from operational failures
 * Use this when a lookup succeeds but the resource doesn't exist
 */
class NotFoundError extends MCPError {
  constructor(resourceType, resourceId, options = {}) {
    super(`${resourceType} not found: ${resourceId}`, {
      ...options,
      category: ErrorCategory.VALIDATION, // Valid query, just no result
      code: 'NOT_FOUND',
      isRetryable: false
    });
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Initialization error - component failed to initialize
 * Use for database, embedder, or other service initialization failures
 */
class InitializationError extends MCPError {
  constructor(component, message, options = {}) {
    super(`${component} initialization failed: ${message}`, {
      ...options,
      category: ErrorCategory.DATABASE,
      code: 'INIT_FAILED',
      isRetryable: false
    });
    this.name = 'InitializationError';
    this.component = component;
  }
}

/**
 * Retry exhausted error - operation failed after all retry attempts
 */
class RetryExhaustedError extends MCPError {
  constructor(operation, attempts, lastError, options = {}) {
    super(`Operation "${operation}" failed after ${attempts} attempts: ${lastError?.message || 'unknown error'}`, {
      ...options,
      category: lastError?.category || ErrorCategory.DATABASE,
      code: 'RETRY_EXHAUSTED',
      isRetryable: false,
      cause: lastError
    });
    this.name = 'RetryExhaustedError';
    this.operation = operation;
    this.attempts = attempts;
  }
}

/**
 * Embedder not ready error - vector operations require initialized embedder
 */
class EmbedderNotReadyError extends MCPError {
  constructor(operation, options = {}) {
    super(`Embedder not ready for operation: ${operation}. Vector search unavailable.`, {
      ...options,
      category: ErrorCategory.EMBEDDER,
      code: 'EMBEDDER_NOT_READY',
      isRetryable: true // May become ready later
    });
    this.name = 'EmbedderNotReadyError';
    this.operation = operation;
  }
}

/**
 * Validation error with diagnostic context
 * Used for parameter validation failures with rich error guidance
 */
class ValidationError extends MCPError {
  constructor(message, diagnostic = {}) {
    super(message, {
      category: ErrorCategory.VALIDATION,
      code: 'VALIDATION_ERROR',
      isRetryable: false,
      context: diagnostic
    });
    this.name = 'ValidationError';
    this.expected = diagnostic.expected || null;
    this.provided = diagnostic.provided || null;
    this.suggestions = diagnostic.suggestions || [];
  }
}

/**
 * Parameter mismatch error - wrong type of ID or format provided
 * Captures what was provided vs expected with fix suggestions
 */
class ParameterMismatchError extends ValidationError {
  constructor(paramName, provided, expected, suggestions = []) {
    super(`Parameter ${paramName}: expected ${expected}, got "${provided}"`, {
      expected,
      provided,
      suggestions
    });
    this.name = 'ParameterMismatchError';
    this.paramName = paramName;
  }
}

/**
 * Classify API errors based on status code and response
 */
function classifyAPIError(statusCode, responseBody) {
  if (statusCode === 401) return ErrorCategory.AUTHENTICATION;
  if (statusCode === 403) return ErrorCategory.AUTHORIZATION;
  if (statusCode === 429) return ErrorCategory.RATE_LIMIT;
  if (statusCode === 400 || statusCode === 422) return ErrorCategory.VALIDATION;
  if (statusCode === 408 || statusCode === 504) return ErrorCategory.TIMEOUT;
  if (statusCode >= 500 && statusCode < 600) return ErrorCategory.SERVICE_UNAVAILABLE;
  if (statusCode === 0 || !statusCode) return ErrorCategory.NETWORK;
  return ErrorCategory.UNKNOWN;
}

/**
 * Infer error category from plain Error
 */
function inferCategory(error) {
  const msg = (error.message || '').toLowerCase();

  if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('enetunreach')) {
    return ErrorCategory.NETWORK;
  }
  if (msg.includes('etimedout') || msg.includes('timeout') || msg.includes('econnreset')) {
    return ErrorCategory.TIMEOUT;
  }
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
    return ErrorCategory.RATE_LIMIT;
  }
  if (msg.includes('api key') || msg.includes('unauthorized') || msg.includes('401')) {
    return ErrorCategory.AUTHENTICATION;
  }
  if (msg.includes('permission') || msg.includes('forbidden') || msg.includes('403')) {
    return ErrorCategory.AUTHORIZATION;
  }
  if (msg.includes('database') || msg.includes('pglite') || msg.includes('sql')) {
    return ErrorCategory.DATABASE;
  }
  if (msg.includes('embed') || msg.includes('vector')) {
    return ErrorCategory.EMBEDDER;
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Wrap any error with MCPError, preserving cause chain
 */
function wrapError(error, message, options = {}) {
  if (error instanceof MCPError) {
    // Already wrapped, add context if provided
    if (options.context) {
      error.context = { ...error.context, ...options.context };
    }
    if (options.requestId && !error.requestId) {
      error.requestId = options.requestId;
    }
    return error;
  }

  return new MCPError(message || error.message, {
    ...options,
    cause: error,
    category: options.category || inferCategory(error)
  });
}

/**
 * Format error for logging with full context
 */
function formatErrorForLog(error, requestId = null) {
  const base = {
    timestamp: new Date().toISOString(),
    requestId: requestId || error.requestId || 'unknown',
    message: error.message,
    name: error.name || 'Error'
  };

  if (error instanceof MCPError) {
    return {
      ...base,
      category: error.category,
      code: error.code,
      isRetryable: error.isRetryable,
      context: error.context,
      cause: error.cause ? formatErrorForLog(error.cause) : null,
      stack: error.stack?.split('\n').slice(0, 10).join('\n')
    };
  }

  return {
    ...base,
    category: inferCategory(error),
    isRetryable: false,
    stack: error.stack?.split('\n').slice(0, 10).join('\n')
  };
}

/**
 * Format error for user-facing response (sanitized)
 */
function formatErrorForResponse(error, includeDetails = false) {
  const base = {
    error: true,
    message: error.message,
    code: error.code || 'ERROR',
    isRetryable: error.isRetryable ?? false
  };

  if (includeDetails && error instanceof MCPError) {
    base.category = error.category;
    base.requestId = error.requestId;
    base.context = sanitizeContext(error.context);
  }

  return base;
}

/**
 * Remove sensitive data from context before exposing
 */
function sanitizeContext(context) {
  if (!context) return {};
  const sanitized = { ...context };
  const sensitive = ['apiKey', 'key', 'token', 'password', 'secret', 'authorization', 'bearer'];

  for (const key of Object.keys(sanitized)) {
    if (sensitive.some(s => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    }
    // Recursively sanitize nested objects
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeContext(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Check if an error is retryable
 */
function isRetryable(error) {
  if (error instanceof MCPError) {
    return error.isRetryable;
  }
  const category = inferCategory(error);
  return [
    ErrorCategory.NETWORK,
    ErrorCategory.RATE_LIMIT,
    ErrorCategory.SERVICE_UNAVAILABLE,
    ErrorCategory.TIMEOUT
  ].includes(category);
}

module.exports = {
  ErrorCategory,
  MCPError,
  APIError,
  ConfigurationError,
  DatabaseError,
  StreamError,
  NotFoundError,
  InitializationError,
  RetryExhaustedError,
  EmbedderNotReadyError,
  ValidationError,
  ParameterMismatchError,
  classifyAPIError,
  inferCategory,
  wrapError,
  formatErrorForLog,
  formatErrorForResponse,
  sanitizeContext,
  isRetryable
};
