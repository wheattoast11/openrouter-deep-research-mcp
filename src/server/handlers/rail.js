/**
 * Rail Protocol Handlers
 *
 * Consolidated handlers for Rail discovery, route management, and inspection.
 *
 * Operations:
 * - list: List all rails, tunnels, routes, and consensus sessions
 * - explain: Show detailed configuration for a specific rail/tunnel
 * - routes: List all routes
 * - route: Get specific route by name
 * - tunnels: List active tunnels
 * - consensus: List consensus sessions
 * - research: Execute knowledge pipeline for agentic research
 *
 * @module server/handlers/rail
 */

'use strict';

const { hasMethod } = require('./shared/capabilities');

// Lazy-load rail modules to avoid circular dependencies
// Note: Must use rail/index explicitly since rail.js exists alongside rail/ directory
let railModules = null;
function getRailModules() {
  if (!railModules) {
    railModules = require('../../core/rail/index');
  }
  return railModules;
}

let KnowledgePipeline = null;
function getKnowledgePipeline() {
  if (!KnowledgePipeline) {
    KnowledgePipeline = require('../../core/rail/knowledge');
  }
  return new KnowledgePipeline();
}

// =============================================================================
// List Operations
// =============================================================================

/**
 * List all rails, tunnels, routes, and consensus sessions
 * @param {object} params
 * @param {boolean} [params.includeStats=true]
 * @param {string} [params.filter='all']
 */
async function listRails(params = {}) {
  const { tunnelRegistry, routeRegistry, consensusManager } = getRailModules();
  const includeStats = params.includeStats !== false;
  const filter = params.filter || 'all';

  const tunnels = tunnelRegistry.list().map(t => ({
    id: t.id,
    source: t.source,
    target: t.target,
    active: !t._closed,
    ...(includeStats ? { stats: t._rail?.stats || {} } : {})
  }));

  const routes = routeRegistry.list().map(r => ({
    name: r.name,
    predicateCount: r.predicates?.length || 0,
    models: r.models || [],
    priority: r.priority || 50
  }));

  const consensus = consensusManager.list().map(c => ({
    id: c.id,
    state: c.state,
    signalCount: c.signals?.length || 0,
    agreement: c.agreement || 0
  }));

  // Apply filter
  const filteredTunnels = filter === 'all'
    ? tunnels
    : tunnels.filter(t => filter === 'active' ? t.active : !t.active);

  return {
    tunnels: filteredTunnels,
    routes,
    consensus,
    summary: {
      tunnelCount: filteredTunnels.length,
      routeCount: routes.length,
      consensusCount: consensus.length
    }
  };
}

/**
 * Explain a specific rail/tunnel in detail
 * @param {object} params
 * @param {string} params.railId
 * @param {boolean} [params.verbose=false]
 */
async function explainRail(params) {
  const { railId, verbose = false } = params;
  if (!railId) throw new Error('railId is required');

  const { tunnelRegistry, consensusManager } = getRailModules();

  // Try to find as tunnel first
  const tunnel = tunnelRegistry.get(railId);
  if (tunnel) {
    const result = {
      type: 'tunnel',
      id: tunnel.id,
      source: tunnel.source,
      target: tunnel.target,
      ttl: tunnel.ttl,
      priority: tunnel.priority,
      requireAck: tunnel.requireAck,
      closed: tunnel._closed,
      stats: tunnel._rail?.stats || { sent: 0, received: 0, dropped: 0, buffered: 0 },
      pressure: tunnel._rail?.pressure || 0
    };

    if (verbose && tunnel._rail) {
      result.bufferSize = tunnel._rail._buffer?.length || 0;
      result.maxBuffer = tunnel._rail._maxBuffer || 100;
      result.observers = tunnel._rail._observers?.length || 0;
    }

    return result;
  }

  // Try to find as consensus session
  const session = consensusManager.get(railId);
  if (session) {
    const result = {
      type: 'consensus',
      id: session.id,
      state: session.state,
      agreement: session.agreement || 0,
      signalCount: session.signals?.length || 0,
      minAgreement: session.minAgreement || 0.6,
      timeoutMs: session.timeoutMs || 30000
    };

    if (verbose && session.signals) {
      result.signals = session.signals.map(s => ({
        source: s.source,
        confidence: s.confidence,
        vote: s.vote
      }));
    }

    return result;
  }

  throw new Error(`Rail not found: ${railId}`);
}

/**
 * List all routes
 * @param {object} params
 * @param {boolean} [params.includePredicates=false]
 */
async function listRoutes(params = {}) {
  const { routeRegistry } = getRailModules();
  const includePredicates = params.includePredicates || false;

  return routeRegistry.list().map(route => {
    const result = {
      name: route.name,
      priority: route.priority || 50,
      models: route.models || [],
      fallback: route.fallback || 'default'
    };

    if (includePredicates && route.predicates) {
      result.predicates = route.predicates.map(p => ({
        dimension: p.dimension,
        operator: p.operator,
        value: p.value,
        weight: p.weight || 1.0
      }));
    }

    return result;
  });
}

/**
 * Get a specific route by name
 * @param {object} params
 * @param {string} params.name
 */
async function getRoute(params) {
  const { name } = params;
  if (!name) throw new Error('Route name is required');

  const { routeRegistry } = getRailModules();
  const route = routeRegistry.get(name);

  if (!route) {
    throw new Error(`Route not found: ${name}`);
  }

  return route.toJSON ? route.toJSON() : {
    name: route.name,
    predicates: route.predicates || [],
    models: route.models || [],
    fallback: route.fallback || 'default',
    priority: route.priority || 50
  };
}

/**
 * List active tunnels
 * @param {object} params
 * @param {boolean} [params.includeMessages=false]
 */
async function listTunnels(params = {}) {
  const { tunnelRegistry } = getRailModules();

  return tunnelRegistry.list().map(tunnel => ({
    id: tunnel.id,
    source: tunnel.source,
    target: tunnel.target,
    active: !tunnel._closed,
    ttl: tunnel.ttl,
    priority: tunnel.priority,
    stats: tunnel._rail?.stats || {}
  }));
}

/**
 * List consensus sessions
 * @param {object} params
 * @param {boolean} [params.includeSignals=false]
 */
async function listConsensus(params = {}) {
  const { consensusManager } = getRailModules();
  const includeSignals = params.includeSignals || false;

  return consensusManager.list().map(session => {
    const result = {
      id: session.id,
      state: session.state,
      agreement: session.agreement || 0,
      signalCount: session.signals?.length || 0
    };

    if (includeSignals && session.signals) {
      result.signals = session.signals.map(s => ({
        source: s.source,
        confidence: s.confidence
      }));
    }

    return result;
  });
}

/**
 * Execute knowledge pipeline for agentic research
 * @param {object} params
 * @param {string} params.query
 * @param {boolean} [params.stream=false]
 */
async function executeResearch(params = {}, context = {}) {
  const { query, stream = false } = params;
  if (!query) throw new Error('Query is required');

  const pipeline = getKnowledgePipeline();

  if (stream) {
    const progressToken = context.requestId || `research-${Date.now()}`;
    const consensus = await pipeline.streamResearch(query, progressToken);
    return {
      sessionId: consensus.id,
      progressToken,
      status: 'started'
    };
  }

  const result = await pipeline.research(query);
  return result.toJSON ? result.toJSON() : result;
}

// =============================================================================
// Unified Handler
// =============================================================================

/**
 * Route rail operations to appropriate handler
 * @param {string} op - Operation name (list, explain, routes, route, tunnels, consensus, research)
 * @param {object} params - Operation parameters
 * @param {object} [context] - Handler context (dbClient, sessionStore, etc.)
 */
async function handleRail(op, params = {}, context = {}) {
  switch (op) {
    case 'list':
      return listRails(params);
    case 'explain':
      return explainRail(params);
    case 'routes':
      return listRoutes(params);
    case 'route':
      return getRoute(params);
    case 'tunnels':
      return listTunnels(params);
    case 'consensus':
      return listConsensus(params);
    case 'research':
      return executeResearch(params, context);
    default:
      throw new Error(`Unknown rail operation: ${op}`);
  }
}

/**
 * Map tool name to operation
 * @param {string} toolName
 * @returns {string|null}
 */
function getRailOp(toolName) {
  const mapping = {
    'list_rails': 'list',
    'explain_rail': 'explain',
    'list_routes': 'routes',
    'get_route': 'route',
    'list_tunnels': 'tunnels',
    'list_consensus': 'consensus',
    'agentic_research': 'research'
  };
  return mapping[toolName] || null;
}

/**
 * Check if a tool name is a rail tool
 * @param {string} toolName
 * @returns {boolean}
 */
function isRailTool(toolName) {
  return getRailOp(toolName) !== null;
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  handleRail,
  getRailOp,
  isRailTool,

  // Individual handlers for direct use
  listRails,
  explainRail,
  listRoutes,
  getRoute,
  listTunnels,
  listConsensus
};
