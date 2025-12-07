/**
 * Client Capability Detection
 *
 * Unified interface for checking and using client method availability.
 * Replaces scattered `typeof client.method === 'function'` checks.
 *
 * @module server/handlers/shared/capabilities
 */

'use strict';

/**
 * Check if client has a specific method.
 *
 * @param {Object} client - Client object to check
 * @param {string} method - Method name to look for
 * @returns {boolean} True if method exists and is callable
 *
 * @example
 * if (hasMethod(dbClient, 'searchHybrid')) {
 *   return dbClient.searchHybrid(query, k);
 * }
 */
function hasMethod(client, method) {
  return client != null && typeof client[method] === 'function';
}

/**
 * Check if client has all specified methods.
 *
 * @param {Object} client - Client object to check
 * @param {Array<string>} methods - Method names to check
 * @returns {boolean} True if all methods are available
 *
 * @example
 * if (hasMethods(dbClient, ['query', 'execute'])) {
 *   // Client has full SQL support
 * }
 */
function hasMethods(client, methods) {
  return methods.every(method => hasMethod(client, method));
}

/**
 * Call a method if available, otherwise execute fallback.
 *
 * @param {Object} client - Client object
 * @param {string} method - Method name to call
 * @param {Array} args - Arguments to pass to the method
 * @param {Function} [fallback] - Fallback function if method unavailable
 * @returns {Promise<*>} Method result or fallback result
 *
 * @example
 * const results = await withCapability(
 *   dbClient,
 *   'searchHybrid',
 *   [query, k],
 *   () => fallbackSearch(dbClient, query, k)
 * );
 */
async function withCapability(client, method, args, fallback) {
  if (hasMethod(client, method)) {
    return client[method](...args);
  }
  return fallback ? fallback() : null;
}

/**
 * Find first available method from a list and call it.
 *
 * @param {Object} client - Client object
 * @param {Array<string>} methods - Method names to try in order
 * @param {Array} args - Arguments to pass
 * @param {Function} [fallback] - Fallback if no method available
 * @returns {Promise<*>} Result from first available method or fallback
 *
 * @example
 * const results = await withFirstCapability(
 *   dbClient,
 *   ['searchHybrid', 'findReportsBySimilarity', 'query'],
 *   [query, k],
 *   () => fallbackSearch(query, k)
 * );
 */
async function withFirstCapability(client, methods, args, fallback) {
  for (const method of methods) {
    if (hasMethod(client, method)) {
      return client[method](...args);
    }
  }
  return fallback ? fallback() : null;
}

/**
 * Known capabilities grouped by client type.
 * Used for documentation and capability detection.
 */
const CAPABILITIES = {
  dbClient: {
    search: ['searchHybrid', 'findReportsBySimilarity'],
    reports: ['getReportById', 'saveResearchReport', 'listResearchReports'],
    jobs: ['getJobById', 'getJobEvents', 'listJobs', 'createJob', 'updateJobStatus'],
    sql: ['query', 'execute']
  },
  graphClient: {
    traversal: ['traverseGraph', 'findPath'],
    analysis: ['findClusters', 'getPageRank', 'findPatterns'],
    stats: ['getStats']
  },
  sessionStore: {
    state: ['getState', 'setState', 'updateState'],
    history: ['pushUndo', 'popUndo', 'pushRedo', 'popRedo'],
    checkpoints: ['createCheckpoint', 'restoreCheckpoint']
  }
};

/**
 * Get list of missing capabilities for a client.
 *
 * @param {Object} client - Client object
 * @param {string} clientType - Type key from CAPABILITIES
 * @param {string} category - Category within the client type
 * @returns {Array<string>} List of missing method names
 *
 * @example
 * const missing = getMissingCapabilities(dbClient, 'dbClient', 'search');
 * if (missing.length === 0) {
 *   // Full search support available
 * }
 */
function getMissingCapabilities(client, clientType, category) {
  const methods = CAPABILITIES[clientType]?.[category] || [];
  return methods.filter(method => !hasMethod(client, method));
}

/**
 * Create a capability-aware wrapper for a client.
 *
 * @param {Object} client - Client to wrap
 * @param {Object} fallbacks - Map of method names to fallback implementations
 * @returns {Proxy} Proxied client that uses fallbacks when methods missing
 *
 * @example
 * const safeClient = createCapabilityProxy(dbClient, {
 *   searchHybrid: (query, k) => fallbackSearch(dbClient, query, k)
 * });
 * // safeClient.searchHybrid() now works even if original method missing
 */
function createCapabilityProxy(client, fallbacks = {}) {
  return new Proxy(client || {}, {
    get(target, prop) {
      if (hasMethod(target, prop)) {
        return target[prop].bind(target);
      }
      if (fallbacks[prop]) {
        return fallbacks[prop];
      }
      return undefined;
    }
  });
}

module.exports = {
  hasMethod,
  hasMethods,
  withCapability,
  withFirstCapability,
  CAPABILITIES,
  getMissingCapabilities,
  createCapabilityProxy
};
