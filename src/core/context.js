/**
 * Handler Context Factory
 *
 * Provides consistent context shape across all handlers.
 * Does NOT change handler signatures - context remains optional { } parameter.
 *
 * @module core/context
 */

'use strict';

/**
 * @typedef {Object} HandlerContext
 * @property {Object} [dbClient] - Database client for queries
 * @property {Object} [sessionStore] - Session state management
 * @property {Object} [graphClient] - Knowledge graph client
 * @property {Map} [toolRegistry] - Available tools registry
 * @property {Object} [config] - Runtime configuration
 * @property {string} [requestId] - Request correlation ID
 */

/**
 * Context keys by handler domain
 * Defines which context fields each domain requires
 */
const DOMAIN_REQUIREMENTS = {
  util: ['toolRegistry'],
  kb: ['dbClient'],
  job: ['dbClient'],
  session: ['sessionStore'],
  graph: ['graphClient', 'dbClient'],  // graphClient preferred, dbClient fallback
  research: ['dbClient', 'sessionStore']
};

/**
 * Validate context has required keys for domain
 *
 * @param {Object} context - Context object
 * @param {string} domain - Handler domain
 * @returns {{ valid: boolean, missing: string[] }}
 *
 * @example
 * const result = validateContext(ctx, 'kb');
 * if (!result.valid) {
 *   console.error('Missing:', result.missing);
 * }
 */
function validateContext(context, domain) {
  const required = DOMAIN_REQUIREMENTS[domain] || [];
  const missing = [];

  for (const key of required) {
    // Special case: graph domain accepts either graphClient OR dbClient
    if (domain === 'graph' && key === 'graphClient') {
      if (!context?.graphClient && !context?.dbClient) {
        missing.push('graphClient or dbClient');
      }
      continue;
    }

    if (!context?.[key]) {
      missing.push(key);
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Create context factory bound to providers
 *
 * @param {Object} providers - Context providers
 * @param {Object} [providers.dbClient] - Database client
 * @param {Object} [providers.sessionStore] - Session store
 * @param {Object} [providers.graphClient] - Graph client
 * @param {Map|Function} [providers.toolRegistry] - Tool registry or getter
 * @returns {Function} Factory function: (requestId?) => HandlerContext
 *
 * @example
 * // In server initialization:
 * const createContext = contextFactory({
 *   dbClient,
 *   sessionStore: sessionManager,
 *   graphClient: knowledgeGraph,
 *   toolRegistry: () => server.getTools?.() || new Map()
 * });
 *
 * // In request handler:
 * const ctx = createContext(requestId);
 * await handlers.routeToHandler(tool, params, ctx);
 */
function contextFactory(providers) {
  return (requestId = null) => {
    const context = {
      requestId: requestId || `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    };

    // Copy static providers
    if (providers.dbClient) context.dbClient = providers.dbClient;
    if (providers.sessionStore) context.sessionStore = providers.sessionStore;
    if (providers.graphClient) context.graphClient = providers.graphClient;

    // Evaluate dynamic providers
    if (providers.toolRegistry) {
      context.toolRegistry = typeof providers.toolRegistry === 'function'
        ? providers.toolRegistry()
        : providers.toolRegistry;
    }

    return context;
  };
}

/**
 * Merge partial context with defaults
 * Useful for testing or when only some context is available
 *
 * @param {Object} partial - Partial context
 * @param {Object} [defaults={}] - Default values
 * @returns {HandlerContext} Merged context
 */
function mergeContext(partial, defaults = {}) {
  return {
    ...defaults,
    ...partial,
    requestId: partial?.requestId || defaults?.requestId || `ctx-${Date.now()}`
  };
}

/**
 * Get effective client for graph operations
 * Returns graphClient if available, otherwise dbClient
 *
 * @param {Object} context - Handler context
 * @returns {Object|null} Client to use for graph operations
 */
function getGraphClient(context) {
  return context?.graphClient || context?.dbClient || null;
}

module.exports = {
  DOMAIN_REQUIREMENTS,
  validateContext,
  contextFactory,
  mergeContext,
  getGraphClient
};
