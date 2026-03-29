/**
 * Unified Dispatcher
 *
 * Single entry point for both CLI and MCP tool execution.
 * Routes through the consolidated handler system with:
 * - SemanticRouter for intelligent query classification
 * - ZeroCombinator for Signal+Rail+Consensus unification
 * - Backward-compatible tools.js fallback
 *
 * @module server/handlers/dispatcher
 */

'use strict';

const handlers = require('./index');
const config = require('../../../config');

/**
 * Check if new handlers are enabled
 * @returns {boolean}
 */
function isHandlersEnabled() {
  if (config.core?.handlers?.enabled === false) return false;
  return true;
}

/**
 * Unified dispatch function for CLI and MCP
 *
 * @param {string} operation - Operation name (tool name or CLI command)
 * @param {object} params - Parameters for the operation
 * @param {object} [context] - Execution context
 * @returns {Promise<*>} Operation result
 */
async function dispatch(operation, params = {}, context = {}) {
  // Add dispatcher metadata to context
  const enrichedContext = {
    ...context,
    _dispatcher: {
      version: '2.0.0',
      timestamp: Date.now(),
      source: context.source || 'cli'
    }
  };

  // Route through new handler system if enabled
  if (isHandlersEnabled()) {
    try {
      return await handlers.routeToHandler(operation, params, enrichedContext);
    } catch (err) {
      // If handler not found, fall back to legacy
      if (err.message?.includes('Unknown tool')) {
        return await dispatchLegacy(operation, params, enrichedContext);
      }
      throw err;
    }
  }

  // Legacy fallback
  return dispatchLegacy(operation, params, enrichedContext);
}

/**
 * Legacy dispatch through tools.js
 * @private
 */
async function dispatchLegacy(operation, params, context) {
  const tools = require('../tools');

  // Map operations to tool functions
  const toolMap = {
    // Research tools — names must match `tools.js` exports (dispatchLegacy fallback)
    research: tools.researchTool,
    conduct_research: tools.conductResearch,
    batch_research: tools.batchResearchTool,
    research_follow_up: tools.researchFollowUp,

    // Knowledge base tools
    search: tools.searchTool,
    query: tools.queryTool,
    retrieve: tools.retrieveTool,
    get_report: tools.getReportContent,
    history: tools.listResearchHistory,

    // Job tools
    job_status: tools.getJobStatusTool,
    get_job_status: tools.getJobStatusTool,
    cancel_job: tools.cancelJobTool,

    // Session tools
    undo: tools.sessionUndo,
    redo: tools.sessionRedo,
    checkpoint: tools.sessionCheckpoint,
    session_state: tools.sessionState,
    fork_session: tools.sessionFork,
    time_travel: tools.sessionTimeTravel,

    // Graph tools
    graph_traverse: tools.graphTraverse,
    graph_path: tools.graphPath,
    graph_clusters: tools.graphClusters,
    graph_pagerank: tools.graphPageRank,
    graph_patterns: tools.graphPatterns,
    graph_stats: tools.graphStats,

    // Utility tools
    ping: tools.pingTool,
    get_server_status: tools.getServerStatus,
    date_time: tools.dateTimeTool,
    calc: tools.calcTool,
    list_tools: tools.listToolsTool,
    search_tools: tools.searchToolsTool
  };

  const fn = toolMap[operation];
  if (!fn) {
    throw new Error(`Unknown operation: ${operation}. Use list_tools to see available operations.`);
  }

  return fn(params, context);
}

/**
 * Create a CLI-specific dispatcher with session management
 *
 * @param {object} options - Dispatcher options
 * @param {string} [options.sessionId='default'] - Session ID for state management
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {object} CLI dispatcher instance
 */
function createCLIDispatcher(options = {}) {
  const sessionId = options.sessionId || 'default';
  const verbose = options.verbose || process.env.LOG_LEVEL === 'debug';

  return {
    sessionId,

    /**
     * Execute an operation
     * @param {string} operation
     * @param {object} params
     * @returns {Promise<*>}
     */
    async execute(operation, params = {}) {
      const context = {
        sessionId,
        source: 'cli',
        verbose
      };

      if (verbose) {
        console.error(`[dispatcher] ${operation}`, JSON.stringify(params).slice(0, 100));
      }

      const result = await dispatch(operation, params, context);

      if (verbose) {
        console.error(`[dispatcher] ${operation} complete`);
      }

      return result;
    },

    /**
     * Research convenience method
     * @param {string} query
     * @param {object} [options]
     * @returns {Promise<*>}
     */
    async research(query, options = {}) {
      return this.execute('conduct_research', {
        query,
        costPreference: options.cost || 'low',
        async: false,
        outputFormat: options.format || 'report',
        ...options
      });
    },

    /**
     * Search convenience method
     * @param {string} query
     * @param {object} [options]
     * @returns {Promise<*>}
     */
    async search(query, options = {}) {
      return this.execute('search', {
        q: query,
        k: options.limit || 10,
        scope: options.scope || 'both',
        ...options
      });
    },

    /**
     * Get report convenience method
     * @param {string} reportId
     * @param {object} [options]
     * @returns {Promise<*>}
     */
    async getReport(reportId, options = {}) {
      return this.execute('get_report', {
        reportId,
        mode: options.mode || 'full',
        ...options
      });
    },

    /**
     * Graph traversal convenience method
     * @param {string} startNode
     * @param {object} [options]
     * @returns {Promise<*>}
     */
    async graphTraverse(startNode, options = {}) {
      return this.execute('graph_traverse', {
        startNode,
        depth: options.depth || 3,
        strategy: options.strategy || 'semantic',
        ...options
      });
    },

    /**
     * Session undo convenience method
     * @returns {Promise<*>}
     */
    async undo() {
      return this.execute('undo', { sessionId });
    },

    /**
     * Session redo convenience method
     * @returns {Promise<*>}
     */
    async redo() {
      return this.execute('redo', { sessionId });
    },

    /**
     * Server status convenience method
     * @returns {Promise<*>}
     */
    async status() {
      return this.execute('get_server_status', {});
    }
  };
}

/**
 * Get the singleton dispatcher for CLI use
 * @returns {object}
 */
let _cliDispatcher = null;
function getCLIDispatcher(options = {}) {
  if (!_cliDispatcher) {
    _cliDispatcher = createCLIDispatcher(options);
  }
  return _cliDispatcher;
}

module.exports = {
  dispatch,
  dispatchLegacy,
  createCLIDispatcher,
  getCLIDispatcher,
  isHandlersEnabled
};
