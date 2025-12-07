/**
 * Schema Validation Middleware
 *
 * Opt-in validation layer for handlers.
 * Enabled via STRICT_SCHEMA_VALIDATION=true
 *
 * @module core/middleware/validation
 */

'use strict';

// Lazy-load dependencies to avoid circular imports
let _config = null;
let _schemas = null;
let _normalize = null;

function getConfig() {
  if (!_config) {
    try {
      _config = require('../../../config');
    } catch (e) {
      _config = { core: {} };
    }
  }
  return _config;
}

function getSchemas() {
  if (!_schemas) {
    try {
      _schemas = require('../schemas');
    } catch (e) {
      _schemas = { safeValidate: () => ({ success: true }) };
    }
  }
  return _schemas;
}

function getNormalize() {
  if (!_normalize) {
    _normalize = require('../normalize');
  }
  return _normalize;
}

/**
 * Check if strict validation is enabled
 *
 * @returns {boolean} True if STRICT_SCHEMA_VALIDATION is enabled
 */
function isValidationEnabled() {
  const config = getConfig();
  return config.core?.schemas?.strictValidation === true ||
         process.env.STRICT_SCHEMA_VALIDATION === 'true';
}

/**
 * Create validation middleware wrapper
 *
 * @param {string} toolName - Tool name for schema lookup
 * @param {Function} handler - Handler function to wrap
 * @returns {Function} Wrapped handler with optional validation
 *
 * @example
 * const wrappedHandler = withValidation('search', searchHandler);
 * const result = await wrappedHandler(params, context);
 */
function withValidation(toolName, handler) {
  return async (params, context = {}) => {
    const { normalize } = getNormalize();

    // Always normalize
    const normalized = normalize(toolName, params);

    // Validate only if enabled
    if (isValidationEnabled()) {
      const { safeValidate } = getSchemas();
      const result = safeValidate(toolName, normalized);

      if (!result.success) {
        // Return structured error, don't throw
        return {
          error: true,
          code: 'VALIDATION_ERROR',
          tool: toolName,
          issues: result.error?.issues || [{ message: String(result.error) }]
        };
      }

      // Use validated/transformed params
      return handler(result.data, context);
    }

    // Without validation, just pass normalized params
    return handler(normalized, context);
  };
}

/**
 * Validate params and return result object
 *
 * @param {string} toolName - Tool name
 * @param {Object} params - Parameters to validate
 * @returns {{ valid: boolean, params: Object, error?: Object }}
 */
function validateParams(toolName, params) {
  const { normalize } = getNormalize();
  const normalized = normalize(toolName, params);

  if (!isValidationEnabled()) {
    return { valid: true, params: normalized };
  }

  const { safeValidate } = getSchemas();
  const result = safeValidate(toolName, normalized);

  if (result.success) {
    return { valid: true, params: result.data };
  }

  return {
    valid: false,
    params: normalized,
    error: {
      code: 'VALIDATION_ERROR',
      issues: result.error?.issues || [{ message: String(result.error) }]
    }
  };
}

/**
 * Reset cached modules (useful for testing)
 */
function resetCache() {
  _config = null;
  _schemas = null;
  _normalize = null;
}

module.exports = {
  isValidationEnabled,
  withValidation,
  validateParams,
  resetCache
};
