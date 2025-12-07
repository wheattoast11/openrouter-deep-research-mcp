/**
 * Legacy Wrapper Generator
 *
 * Creates backwards-compatible function wrappers for consolidated handlers.
 * Reduces boilerplate when migrating from many small exports to unified handlers.
 *
 * @module server/handlers/shared/legacy
 */

'use strict';

/**
 * Create a legacy wrapper that delegates to a unified handler.
 *
 * @param {Function} handler - Unified handler function (operation, params, ctx)
 * @param {string} operation - Operation name to pass to handler
 * @returns {Function} Wrapper function (params, ctx) => handler(operation, params, ctx)
 *
 * @example
 * const unifiedHandler = async (op, params, ctx) => {
 *   switch (op) {
 *     case 'search': return doSearch(params, ctx);
 *     case 'query': return doQuery(params, ctx);
 *   }
 * };
 *
 * const search = createLegacyWrapper(unifiedHandler, 'search');
 * await search({ q: 'test' }, context);  // Calls unifiedHandler('search', ...)
 */
function createLegacyWrapper(handler, operation) {
  const wrapper = (params, ctx) => handler(operation, params, ctx);
  // Preserve function name for debugging
  Object.defineProperty(wrapper, 'name', {
    value: `${operation}Wrapper`,
    configurable: true
  });
  return wrapper;
}

/**
 * Create multiple legacy wrappers from a mapping.
 *
 * @param {Function} handler - Unified handler function
 * @param {Object} mapping - Map of export names to operation names
 * @returns {Object} Object with wrapper functions for each mapping entry
 *
 * @example
 * const wrappers = createLegacyWrappers(kbHandler, {
 *   search: 'search',
 *   query: 'sql',
 *   retrieve: 'retrieve',
 *   getReport: 'report'
 * });
 *
 * // Now use: wrappers.search, wrappers.query, etc.
 */
function createLegacyWrappers(handler, mapping) {
  const wrappers = {};
  for (const [name, operation] of Object.entries(mapping)) {
    wrappers[name] = createLegacyWrapper(handler, operation);
  }
  return wrappers;
}

/**
 * Standard operation mappings for each handler domain.
 * Used with createLegacyWrappers to generate backwards-compatible exports.
 */
const LEGACY_MAPPINGS = {
  kb: {
    search: 'search',
    query: 'sql',
    retrieve: 'retrieve',
    getReport: 'report',
    history: 'history'
  },
  graph: {
    graphTraverse: 'traverse',
    graphPath: 'path',
    graphClusters: 'clusters',
    graphPagerank: 'pagerank',
    graphPatterns: 'patterns',
    graphStats: 'stats'
  },
  job: {
    getJobStatus: 'status',
    cancelJob: 'cancel',
    taskGet: 'status',
    taskResult: 'result',
    taskList: 'list',
    taskCancel: 'cancel'
  },
  session: {
    undo: 'undo',
    redo: 'redo',
    forkSession: 'fork',
    timeTravel: 'travel',
    sessionState: 'state',
    checkpoint: 'checkpoint'
  }
};

/**
 * Generate all legacy exports for a handler domain.
 *
 * @param {Function} handler - Unified handler function
 * @param {string} domain - Domain key from LEGACY_MAPPINGS
 * @returns {Object} All legacy wrapper functions for the domain
 *
 * @example
 * const { search, query, retrieve, getReport, history } =
 *   generateLegacyExports(kbHandler, 'kb');
 *
 * module.exports = { search, query, retrieve, getReport, history };
 */
function generateLegacyExports(handler, domain) {
  const mapping = LEGACY_MAPPINGS[domain];
  if (!mapping) {
    throw new Error(`Unknown legacy mapping domain: ${domain}`);
  }
  return createLegacyWrappers(handler, mapping);
}

/**
 * Create a handler that supports both unified and legacy call patterns.
 *
 * @param {Object} operations - Map of operation names to handler functions
 * @returns {Function} Handler supporting (operation, params, ctx) or (params, ctx) with params.operation
 *
 * @example
 * const handler = createUnifiedHandler({
 *   search: async (params, ctx) => { ... },
 *   query: async (params, ctx) => { ... }
 * });
 *
 * // Both work:
 * await handler('search', { q: 'test' }, ctx);
 * await handler({ operation: 'search', q: 'test' }, ctx);
 */
function createUnifiedHandler(operations) {
  return async function unifiedHandler(operationOrParams, paramsOrCtx, maybeCtx) {
    let operation, params, ctx;

    if (typeof operationOrParams === 'string') {
      // Called as (operation, params, ctx)
      operation = operationOrParams;
      params = paramsOrCtx || {};
      ctx = maybeCtx || {};
    } else {
      // Called as (params, ctx) with params.operation
      params = operationOrParams || {};
      operation = params.operation || params.action;
      ctx = paramsOrCtx || {};
    }

    const handler = operations[operation];
    if (!handler) {
      return {
        error: true,
        message: `Unknown operation: ${operation}`,
        availableOperations: Object.keys(operations)
      };
    }

    return handler(params, ctx);
  };
}

module.exports = {
  createLegacyWrapper,
  createLegacyWrappers,
  LEGACY_MAPPINGS,
  generateLegacyExports,
  createUnifiedHandler
};
