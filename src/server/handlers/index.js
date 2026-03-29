/**
 * Consolidated Handlers
 *
 * Unified exports for all tool handlers.
 * Provides backwards-compatible exports and the new consolidated API.
 *
 * Architecture (v1.14.0):
 * - SemanticRouter for intelligent query classification and model selection
 * - Unified tool layer: 'zero' (research), 'kb' (knowledge base)
 * - Backward-compatible aliases for legacy tool names
 */

const util = require('./util');
const job = require('./job');
const session = require('./session');
const graph = require('./graph');
const kb = require('./kb');
const rail = require('./rail');
const swarm = require('./swarm');
const dispatcher = require('./dispatcher');
const { SemanticRouter, createRouter } = require('../../core/router');
const signalRouter = require('../../core/routing/signalRouter');
const config = require('../../../config');
const { ROUTING } = require('../../config/constants');
const logger = require('../../utils/logger').child('Handlers');

// Singleton semantic router for query classification (model selection)
const semanticRouter = createRouter({
  costPreference: config.core?.rail?.routing?.costPreference || 'balanced'
});

/**
 * Master router for consolidated tools
 *
 * Routes tool calls to appropriate handler based on tool name.
 * Uses SemanticRouter for intelligent research query classification.
 */
async function routeToHandler(toolName, params, context = {}) {
  // =========================================================================
  // UNIFIED TOOL LAYER (v1.14.0)
  // =========================================================================

  // v3 conversational / KB shortcuts (delegate to tools.js)
  if (['ask', 'status', 'job_get', 'kb_search', 'kb_query'].includes(toolName)) {
    const tools = require('../tools');
    const rid = context.requestId || `h-${Date.now()}`;
    if (toolName === 'ask') return tools.askTool(params, context.mcpExchange, rid);
    if (toolName === 'status') return tools.statusTool(params, context.mcpExchange, rid);
    if (toolName === 'job_get') return tools.jobGetTool(params);
    if (toolName === 'kb_search') return tools.kbSearchTool(params, context.mcpExchange, rid);
    if (toolName === 'kb_query') return tools.queryTool(params, context.mcpExchange, rid);
  }

  if (toolName === 'get_provider_health') {
    const tools = require('../tools');
    return tools.getProviderHealth(params);
  }

  // 'zero' - Unified research tool (replaces research, conduct_research, batch_research, research_follow_up)
  if (toolName === 'zero' || toolName === 'zero_chat') {
    return handleZeroTool(params, context);
  }

  // 'kb' - Unified knowledge base tool (alias for handleKB with explicit op routing)
  if (toolName === 'kb') {
    const op = params.op || 'search';
    return kb.handleKB(op, params, context);
  }

  // =========================================================================
  // LEGACY TOOL ROUTING (backward-compatible)
  // =========================================================================

  // Research tools - route through SemanticRouter for model selection
  if (['research', 'conduct_research', 'batch_research', 'research_follow_up'].includes(toolName)) {
    return handleResearchTool(toolName, params, context);
  }

  // Utility tools
  if (['ping', 'date_time', 'calc', 'list_tools', 'search_tools'].includes(toolName)) {
    return util.handleUtil(toolName, params, context);
  }

  // Job tools (job_get is handled in v3 block above)
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
  if (['search', 'query', 'retrieve', 'get_report', 'get_report_content', 'history', 'list_research_history'].includes(toolName)) {
    const op = getKBOp(toolName);
    return kb.handleKB(op, params, context);
  }

  // Rail Protocol tools
  if (rail.isRailTool(toolName)) {
    const op = rail.getRailOp(toolName);
    return rail.handleRail(op, params, context);
  }

  // Swarm orchestration tools
  if (swarm.isSwarmTool(toolName)) {
    const op = swarm.getSwarmOp(toolName);
    return swarm.handleSwarm(op, params, context);
  }

  throw new Error(`Unknown tool: ${toolName}. Use list_tools to see available tools.`);
}

/**
 * Handle unified 'zero' tool
 *
 * Accepts intent-based routing:
 * - intent: 'research' (default) | 'follow_up' | 'batch'
 * - fork: boolean - Enable fork/rejoin execution
 * - forkStrategy: 'parallel' | 'sequential' | 'amb'
 * - forkCount: number - Number of parallel forks (default 3)
 */
async function handleZeroTool(params, context = {}) {
  let intent = params.intent;
  const query = params.query || params.q;

  if (!query && intent !== 'batch') {
    throw new Error('Query required for zero tool (use "query" or "q" parameter)');
  }

  // Use SignalRouter for intent classification if enabled and intent not explicit
  if (!intent && query && ROUTING.EMBEDDING_ROUTING_ENABLED) {
    try {
      const intentDecision = await signalRouter.route(query);
      if (intentDecision.confidence >= ROUTING.MIN_CONFIDENCE_THRESHOLD) {
        intent = intentDecision.selectedAttractor; // 'chat', 'research', or 'action'
        logger.debug('SignalRouter intent classification', {
          query: query.slice(0, 50),
          intent,
          confidence: intentDecision.confidence.toFixed(3)
        });
      }
    } catch (err) {
      logger.debug('SignalRouter fallback', { error: err.message });
    }
  }

  // Default to research if no intent determined
  intent = intent || 'research';

  // Route semantic classification through router (for model selection)
  const routeDecision = await semanticRouter.route({
    query: query || (params.queries?.[0] || ''),
    costPreference: params.costPreference || params.cost || 'low',
    maxModels: params.fork ? 3 : 1,
    context
  });

  // Attach routing metadata to context
  const enrichedContext = {
    ...context,
    routeDecision,
    classification: routeDecision.classification,
    selectedModels: routeDecision.models
  };

  // Fork/Rejoin execution mode
  if (params.fork) {
    const { executeForkRejoin, ForkStrategy } = require('../../core/execution');

    // Map strategy param to ForkStrategy constant
    const strategyMap = {
      parallel: ForkStrategy.PARALLEL,
      sequential: ForkStrategy.SEQUENTIAL,
      amb: ForkStrategy.AMB
    };

    const result = await executeForkRejoin({
      query,
      sessionId: context.sessionId || 'default',
      forkCount: params.forkCount || 3,
      strategy: strategyMap[params.forkStrategy] || ForkStrategy.PARALLEL,
      context: {
        ...enrichedContext,
        costPreference: params.costPreference || params.cost || 'low',
        audienceLevel: params.audienceLevel || params.aud || 'intermediate'
      },
      onEvent: context.onEvent
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.sealed,
          result: result.result,
          consensus: result.context?.consensus,
          forkCount: result.context?.forkCount,
          successCount: result.context?.successCount,
          strategy: params.forkStrategy || 'parallel'
        }, null, 2)
      }],
      _meta: {
        executionId: result.context?.executionId,
        strategy: params.forkStrategy || 'parallel',
        consensus: result.context?.consensus
      }
    };
  }

  // Standard (non-fork) execution
  switch (intent) {
    case 'chat':
      const zeroHandler = require('./zero');
      return zeroHandler.handleZero('zero_chat', params, enrichedContext);

    case 'action':
      // Action intent routes to chat handler (handles tool execution, coding tasks)
      const actionHandler = require('./zero');
      return actionHandler.handleZero('zero_chat', { ...params, _isAction: true }, enrichedContext);

    case 'research':
      return handleResearchTool('conduct_research', params, enrichedContext);

    case 'follow_up':
      return handleResearchTool('research_follow_up', params, enrichedContext);

    case 'batch':
      return handleResearchTool('batch_research', params, enrichedContext);

    default:
      return handleResearchTool('conduct_research', params, enrichedContext);
  }
}

/**
 * Handle research tools with SemanticRouter integration
 *
 * Enriches research calls with:
 * - Intelligent model selection based on query classification
 * - Cost preference optimization
 * - Routing metadata for observability
 */
async function handleResearchTool(toolName, params, context = {}) {
  const query = params.query || params.q;

  // Only route if we don't already have a route decision
  if (!context.routeDecision && query) {
    const routeDecision = await semanticRouter.route({
      query,
      costPreference: params.costPreference || params.cost || 'low',
      maxModels: 1,
      context
    });

    context = {
      ...context,
      routeDecision,
      classification: routeDecision.classification
    };
  }

  // Delegate to tools.js for actual execution (preserves existing logic)
  // The tools module will use context.routeDecision if available
  const tools = require('../tools');

  switch (toolName) {
    case 'research':
      return tools.research({ ...params, _routingContext: context });

    case 'conduct_research':
      return tools.conductResearch({ ...params, _routingContext: context });

    case 'batch_research':
      return tools.batchResearch({ ...params, _routingContext: context });

    case 'research_follow_up':
      return tools.researchFollowUp({ ...params, _routingContext: context });

    default:
      throw new Error(`Unknown research tool: ${toolName}`);
  }
}

/**
 * Get job operation from tool name
 */
function getJobOp(toolName) {
  const map = {
    job_status: 'status',
    get_job_status: 'status',
    job_get: 'status',
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
    get_report_content: 'report',
    history: 'history',
    list_research_history: 'history'
  };
  return map[toolName] || 'search';
}

module.exports = {
  // Master router
  routeToHandler,

  // Unified tool layer (v1.14.0)
  handleZeroTool,
  handleResearchTool,

  // Semantic router access
  semanticRouter,
  SemanticRouter,
  signalRouter,

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
  listHistory: kb.listHistory,

  // Rail Protocol exports
  handleRail: rail.handleRail,
  isRailTool: rail.isRailTool,
  getRailOp: rail.getRailOp,
  listRails: rail.listRails,
  explainRail: rail.explainRail,
  listRoutes: rail.listRoutes,
  getRoute: rail.getRoute,
  listTunnels: rail.listTunnels,
  listConsensus: rail.listConsensus,

  // Dispatcher exports (CLI unification)
  dispatch: dispatcher.dispatch,
  dispatchLegacy: dispatcher.dispatchLegacy,
  createCLIDispatcher: dispatcher.createCLIDispatcher,
  getCLIDispatcher: dispatcher.getCLIDispatcher,
  isHandlersEnabled: dispatcher.isHandlersEnabled,

  // Swarm orchestration exports
  handleSwarm: swarm.handleSwarm,
  swarmPlan: swarm.swarmPlan,
  swarmExecute: swarm.swarmExecute,
  swarmValidate: swarm.swarmValidate,
  swarmStatus: swarm.swarmStatus,
  isSwarmTool: swarm.isSwarmTool,
  getSwarmOp: swarm.getSwarmOp
};
