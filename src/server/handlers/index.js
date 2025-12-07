/**
 * Consolidated Handlers
 *
 * Unified exports for all tool handlers.
 * Provides backwards-compatible exports and the new consolidated API.
 */

const util = require('./util');
const job = require('./job');
const session = require('./session');
const graph = require('./graph');
const kb = require('./kb');

/**
 * Master router for consolidated tools
 *
 * Routes tool calls to appropriate handler based on tool name.
 */
async function routeToHandler(toolName, params, context = {}) {
  // Utility tools
  if (['ping', 'date_time', 'calc', 'list_tools', 'search_tools'].includes(toolName)) {
    return util.handleUtil(toolName, params, context);
  }

  // Job tools
  if (['job_status', 'get_job_status', 'cancel_job', 'task_get', 'task_result', 'task_list', 'task_cancel'].includes(toolName)) {
    const op = getJobOp(toolName);
    return job.handleJob(op, params, context);
  }

  // Session tools
  if (['undo', 'redo', 'fork_session', 'time_travel', 'session_state', 'checkpoint'].includes(toolName)) {
    const op = getSessionOp(toolName);
    return session.handleSession(op, params, context);
  }

  // Graph tools
  if (toolName.startsWith('graph_')) {
    const op = toolName.replace('graph_', '');
    return graph.handleGraph(op, params, context);
  }

  // KB tools
  if (['search', 'query', 'retrieve', 'get_report', 'history', 'list_research_history'].includes(toolName)) {
    const op = getKBOp(toolName);
    return kb.handleKB(op, params, context);
  }

  throw new Error(`Unknown tool: ${toolName}. Use list_tools to see available tools.`);
}

/**
 * Get job operation from tool name
 */
function getJobOp(toolName) {
  const map = {
    job_status: 'status',
    get_job_status: 'status',
    cancel_job: 'cancel',
    task_get: 'status',
    task_result: 'result',
    task_list: 'list',
    task_cancel: 'cancel'
  };
  return map[toolName] || 'status';
}

/**
 * Get session operation from tool name
 */
function getSessionOp(toolName) {
  const map = {
    undo: 'undo',
    redo: 'redo',
    fork_session: 'fork',
    time_travel: 'travel',
    session_state: 'state',
    checkpoint: 'checkpoint'
  };
  return map[toolName] || 'state';
}

/**
 * Get KB operation from tool name
 */
function getKBOp(toolName) {
  const map = {
    search: 'search',
    query: 'sql',
    retrieve: 'retrieve',
    get_report: 'report',
    history: 'history',
    list_research_history: 'history'
  };
  return map[toolName] || 'search';
}

module.exports = {
  // Master router
  routeToHandler,

  // Domain handlers
  handleUtil: util.handleUtil,
  handleJob: job.handleJob,
  handleSession: session.handleSession,
  handleGraph: graph.handleGraph,
  handleKB: kb.handleKB,

  // Utility exports
  handlePing: util.handlePing,
  handleDateTime: util.handleDateTime,
  handleCalc: util.handleCalc,
  handleTools: util.handleTools,

  // Job exports
  getJobStatus: job.getJobStatus,
  cancelJob: job.cancelJob,
  listJobs: job.listJobs,
  getJobResult: job.getJobResult,

  // Session exports
  getSessionState: session.getSessionState,
  undoAction: session.undoAction,
  redoAction: session.redoAction,
  forkSession: session.forkSession,
  timeTravel: session.timeTravel,
  createCheckpoint: session.createCheckpoint,

  // Graph exports
  traverseGraph: graph.traverseGraph,
  findPath: graph.findPath,
  findClusters: graph.findClusters,
  getPageRank: graph.getPageRank,
  findPatterns: graph.findPatterns,
  getGraphStats: graph.getGraphStats,

  // KB exports
  searchKB: kb.searchKB,
  executeQuery: kb.executeQuery,
  retrieve: kb.retrieve,
  getReport: kb.getReport,
  listHistory: kb.listHistory
};
