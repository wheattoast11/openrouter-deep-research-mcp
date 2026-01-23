/**
 * Mock Context Factory
 *
 * Creates mock handler contexts for testing.
 * Provides configurable mocks for all context dependencies.
 *
 * @module tests/mocks/mockContext
 */

'use strict';

/**
 * Create a mock database client.
 *
 * @param {Object} [overrides={}] - Method overrides
 * @returns {Object} Mock database client
 */
function createMockDbClient(overrides = {}) {
  const mockResults = [];

  return {
    query: async (sql, params) => {
      if (overrides.query) return overrides.query(sql, params);
      return mockResults;
    },
    execute: async (sql, params) => {
      if (overrides.execute) return overrides.execute(sql, params);
      return { rowCount: 0 };
    },
    getReportById: async (id) => {
      if (overrides.getReportById) return overrides.getReportById(id);
      return {
        id,
        original_query: `Mock report ${id}`,
        final_report: 'Mock report content',
        created_at: new Date().toISOString()
      };
    },
    saveResearchReport: async (report) => {
      if (overrides.saveResearchReport) return overrides.saveResearchReport(report);
      return { id: 1, ...report };
    },
    listResearchReports: async (limit) => {
      if (overrides.listResearchReports) return overrides.listResearchReports(limit);
      return [];
    },
    searchHybrid: async (query, k) => {
      if (overrides.searchHybrid) return overrides.searchHybrid(query, k);
      return [];
    },
    // Job methods
    getJobById: async (id) => {
      if (overrides.getJobById) return overrides.getJobById(id);
      return {
        id,
        type: 'research',
        status: 'completed',
        params: {},
        result: null,
        created_at: new Date().toISOString()
      };
    },
    getJobEvents: async (jobId, sinceEventId) => {
      if (overrides.getJobEvents) return overrides.getJobEvents(jobId, sinceEventId);
      return [];
    },
    listJobs: async (options) => {
      if (overrides.listJobs) return overrides.listJobs(options);
      return [];
    },
    createJob: async (job) => {
      if (overrides.createJob) return overrides.createJob(job);
      return { id: `job_${Date.now()}`, ...job };
    },
    updateJobStatus: async (id, status, result) => {
      if (overrides.updateJobStatus) return overrides.updateJobStatus(id, status, result);
      return { id, status };
    },
    // For setting mock results
    _setMockResults: (results) => {
      mockResults.length = 0;
      mockResults.push(...results);
    },
    ...overrides
  };
}

/**
 * Create a mock session store.
 *
 * @param {Object} [overrides={}] - Method overrides
 * @returns {Object} Mock session store
 */
function createMockSessionStore(overrides = {}) {
  const state = {};
  const undoStack = [];
  const redoStack = [];
  const checkpoints = new Map();

  return {
    getState: async (sessionId = 'default') => {
      if (overrides.getState) return overrides.getState(sessionId);
      return state[sessionId] || {};
    },
    setState: async (sessionId, newState) => {
      if (overrides.setState) return overrides.setState(sessionId, newState);
      state[sessionId] = newState;
      return newState;
    },
    updateState: async (sessionId, updates) => {
      if (overrides.updateState) return overrides.updateState(sessionId, updates);
      state[sessionId] = { ...state[sessionId], ...updates };
      return state[sessionId];
    },
    pushUndo: async (sessionId, entry) => {
      if (overrides.pushUndo) return overrides.pushUndo(sessionId, entry);
      undoStack.push(entry);
    },
    popUndo: async (sessionId) => {
      if (overrides.popUndo) return overrides.popUndo(sessionId);
      return undoStack.pop();
    },
    pushRedo: async (sessionId, entry) => {
      if (overrides.pushRedo) return overrides.pushRedo(sessionId, entry);
      redoStack.push(entry);
    },
    popRedo: async (sessionId) => {
      if (overrides.popRedo) return overrides.popRedo(sessionId);
      return redoStack.pop();
    },
    createCheckpoint: async (sessionId, name) => {
      if (overrides.createCheckpoint) return overrides.createCheckpoint(sessionId, name);
      checkpoints.set(name, { ...state[sessionId] });
      return { name, timestamp: Date.now() };
    },
    restoreCheckpoint: async (sessionId, name) => {
      if (overrides.restoreCheckpoint) return overrides.restoreCheckpoint(sessionId, name);
      const cp = checkpoints.get(name);
      if (cp) state[sessionId] = { ...cp };
      return cp;
    },
    // Test helpers
    _getUndoStack: () => undoStack,
    _getRedoStack: () => redoStack,
    _getCheckpoints: () => checkpoints,
    ...overrides
  };
}

/**
 * Create a mock graph client.
 *
 * @param {Object} [overrides={}] - Method overrides
 * @returns {Object} Mock graph client
 */
function createMockGraphClient(overrides = {}) {
  return {
    traverseGraph: async (startNode, depth, strategy) => {
      if (overrides.traverseGraph) return overrides.traverseGraph(startNode, depth, strategy);
      return [];
    },
    findPath: async (from, to) => {
      if (overrides.findPath) return overrides.findPath(from, to);
      return { path: [], found: false };
    },
    findClusters: async () => {
      if (overrides.findClusters) return overrides.findClusters();
      return [];
    },
    getPageRank: async (topK) => {
      if (overrides.getPageRank) return overrides.getPageRank(topK);
      return [];
    },
    findPatterns: async (n) => {
      if (overrides.findPatterns) return overrides.findPatterns(n);
      return [];
    },
    getStats: async () => {
      if (overrides.getStats) return overrides.getStats();
      return { nodes: 0, edges: 0 };
    },
    ...overrides
  };
}

/**
 * Create a mock tool registry.
 *
 * @param {Array<Object>} [tools=[]] - Tools to include
 * @returns {Map} Mock tool registry
 */
function createMockToolRegistry(tools = []) {
  const registry = new Map();

  for (const tool of tools) {
    registry.set(tool.name, {
      name: tool.name,
      description: tool.description || `Mock tool: ${tool.name}`,
      inputSchema: tool.inputSchema || { type: 'object', properties: {} }
    });
  }

  return registry;
}

/**
 * Create a complete mock handler context.
 *
 * @param {Object} [options={}] - Context options
 * @param {Object} [options.dbOverrides] - Database client overrides
 * @param {Object} [options.sessionOverrides] - Session store overrides
 * @param {Object} [options.graphOverrides] - Graph client overrides
 * @param {Array} [options.tools] - Tools for registry
 * @param {string} [options.requestId] - Request ID
 * @returns {Object} Complete mock context
 *
 * @example
 * const ctx = createMockContext({
 *   dbOverrides: { query: async () => [{ id: 1 }] },
 *   tools: [{ name: 'search', description: 'Search tool' }]
 * });
 */
function createMockContext(options = {}) {
  return {
    requestId: options.requestId || `test-${Date.now()}`,
    dbClient: createMockDbClient(options.dbOverrides),
    sessionStore: createMockSessionStore(options.sessionOverrides),
    graphClient: createMockGraphClient(options.graphOverrides),
    toolRegistry: createMockToolRegistry(options.tools)
  };
}

/**
 * Create a minimal context with only specified dependencies.
 *
 * @param {Array<string>} deps - Dependencies to include
 * @param {Object} [overrides={}] - Per-dependency overrides
 * @returns {Object} Partial context
 */
function createPartialContext(deps, overrides = {}) {
  const ctx = { requestId: `test-${Date.now()}` };

  if (deps.includes('dbClient')) {
    ctx.dbClient = createMockDbClient(overrides.dbClient);
  }
  if (deps.includes('sessionStore')) {
    ctx.sessionStore = createMockSessionStore(overrides.sessionStore);
  }
  if (deps.includes('graphClient')) {
    ctx.graphClient = createMockGraphClient(overrides.graphClient);
  }
  if (deps.includes('toolRegistry')) {
    ctx.toolRegistry = createMockToolRegistry(overrides.tools);
  }

  return ctx;
}

module.exports = {
  createMockDbClient,
  createMockSessionStore,
  createMockGraphClient,
  createMockToolRegistry,
  createMockContext,
  createPartialContext
};
