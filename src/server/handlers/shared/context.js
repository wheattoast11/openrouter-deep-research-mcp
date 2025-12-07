/**
 * Context Validators
 *
 * Centralized dependency checks for handler contexts.
 * Replaces scattered inline validation across handlers.
 *
 * @module server/handlers/shared/context
 */

'use strict';

/**
 * Error thrown when required context dependency is missing.
 *
 * @class
 * @extends Error
 */
class ContextError extends Error {
  /**
   * Create a ContextError.
   *
   * @param {string} message - Error message
   * @param {string} dependency - Name of the missing dependency
   */
  constructor(message, dependency) {
    super(message);
    this.name = 'ContextError';
    this.dependency = dependency;
  }
}

/**
 * Default error messages for missing dependencies.
 */
const MESSAGES = {
  dbClient: 'Database client not available',
  sessionStore: 'Session store not available',
  graphClient: 'Graph client not available',
  toolRegistry: 'Tool registry not available'
};

/**
 * Validate that context contains all required dependencies.
 *
 * @param {Object} context - Handler context
 * @param {Array<string>} required - List of required dependency names
 * @throws {ContextError} If any required dependency is missing
 *
 * @example
 * validateContext(ctx, ['dbClient', 'sessionStore']);
 */
function validateContext(context, required) {
  for (const dep of required) {
    if (!context?.[dep]) {
      throw new ContextError(MESSAGES[dep] || `${dep} not available`, dep);
    }
  }
}

/**
 * Pre-built validators for common handler patterns.
 *
 * @example
 * // In a handler:
 * validators.db(context);  // throws if dbClient missing
 * const client = validators.graphOrDb(context);  // returns available client
 */
const validators = {
  /**
   * Validate database client is available.
   *
   * @param {Object} ctx - Handler context
   * @throws {ContextError} If dbClient is missing
   */
  db: (ctx) => validateContext(ctx, ['dbClient']),

  /**
   * Validate session store is available.
   *
   * @param {Object} ctx - Handler context
   * @throws {ContextError} If sessionStore is missing
   */
  session: (ctx) => validateContext(ctx, ['sessionStore']),

  /**
   * Validate tool registry is available.
   *
   * @param {Object} ctx - Handler context
   * @throws {ContextError} If toolRegistry is missing
   */
  tools: (ctx) => validateContext(ctx, ['toolRegistry']),

  /**
   * Get graph client or fallback to database client.
   *
   * @param {Object} ctx - Handler context
   * @returns {Object} graphClient or dbClient
   * @throws {ContextError} If neither is available
   */
  graphOrDb: (ctx) => {
    if (!ctx?.graphClient && !ctx?.dbClient) {
      throw new ContextError(
        'Graph or database client not available',
        'graphClient'
      );
    }
    return ctx.graphClient || ctx.dbClient;
  },

  /**
   * Validate multiple dependencies at once.
   *
   * @param {Object} ctx - Handler context
   * @param  {...string} deps - Dependencies to validate
   * @throws {ContextError} If any dependency is missing
   */
  require: (ctx, ...deps) => validateContext(ctx, deps)
};

/**
 * Check if context has a specific capability without throwing.
 *
 * @param {Object} context - Handler context
 * @param {string} key - Capability key to check
 * @returns {boolean} True if capability is present
 *
 * @example
 * if (hasCapability(ctx, 'graphClient')) {
 *   // Use graph features
 * }
 */
function hasCapability(context, key) {
  return context?.[key] != null;
}

/**
 * Get missing capabilities from context.
 *
 * @param {Object} context - Handler context
 * @param {Array<string>} required - Required capability names
 * @returns {Array<string>} List of missing capability names
 */
function getMissing(context, required) {
  return required.filter(key => !context?.[key]);
}

module.exports = {
  ContextError,
  MESSAGES,
  validateContext,
  validators,
  hasCapability,
  getMissing
};
