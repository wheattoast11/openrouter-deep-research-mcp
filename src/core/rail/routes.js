/**
 * Rail Routes: User-Definable Routing Predicates
 *
 * Routes allow users to define custom routing logic for research queries,
 * specifying model selection, cost preferences, and failover strategies.
 *
 * Implements MCP resource: rail://routes/*
 *
 * @module core/rail/routes
 */

'use strict';

const crypto = require('crypto');

/**
 * Route operators for predicate matching
 */
const RouteOperator = {
  EQ: 'eq',
  NE: 'ne',
  LT: 'lt',
  LE: 'le',
  GT: 'gt',
  GE: 'ge',
  CONTAINS: 'contains',
  MATCHES: 'matches',
  IN: 'in'
};

/**
 * Route dimensions for predicate matching
 */
const RouteDimension = {
  COST: 'cost',
  LATENCY: 'latency',
  QUALITY: 'quality',
  TOPIC: 'topic',
  COMPLEXITY: 'complexity',
  MODEL: 'model'
};

/**
 * Route - User-defined routing configuration
 */
class Route {
  /**
   * @param {string} name - Route name
   * @param {object} config - Route configuration
   * @param {Array} config.predicates - Matching predicates
   * @param {Array} config.models - Preferred models
   * @param {string} [config.fallback] - Fallback route name
   * @param {number} [config.priority=0] - Route priority
   */
  constructor(name, config) {
    this.id = crypto.randomUUID();
    this.name = name;
    this.predicates = config.predicates || [];
    this.models = config.models || [];
    this.fallback = config.fallback || 'default';
    this.priority = config.priority ?? 0;
    this.metadata = config.metadata || {};
    this.createdAt = Date.now();
  }

  /**
   * Check if query matches this route
   * @param {object} context - Query context
   * @returns {boolean}
   */
  matches(context) {
    if (this.predicates.length === 0) return true;

    for (const pred of this.predicates) {
      if (!this._evaluatePredicate(pred, context)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluate a single predicate
   * @private
   */
  _evaluatePredicate(pred, context) {
    const { dimension, operator, value, weight = 1 } = pred;
    const actual = context[dimension];

    if (actual === undefined) return false;

    switch (operator) {
      case RouteOperator.EQ: return actual === value;
      case RouteOperator.NE: return actual !== value;
      case RouteOperator.LT: return actual < value;
      case RouteOperator.LE: return actual <= value;
      case RouteOperator.GT: return actual > value;
      case RouteOperator.GE: return actual >= value;
      case RouteOperator.CONTAINS:
        return String(actual).toLowerCase().includes(String(value).toLowerCase());
      case RouteOperator.MATCHES:
        return new RegExp(value, 'i').test(String(actual));
      case RouteOperator.IN:
        return Array.isArray(value) && value.includes(actual);
      default:
        return false;
    }
  }

  /**
   * Serialize for MCP resource
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      predicates: this.predicates,
      models: this.models,
      fallback: this.fallback,
      priority: this.priority,
      metadata: this.metadata
    };
  }

  /**
   * Create from JSON
   * @param {object} json
   * @returns {Route}
   */
  static fromJSON(json) {
    const route = new Route(json.name, json);
    route.id = json.id || route.id;
    return route;
  }
}

/**
 * RouteRegistry - Manages user-defined routes
 */
class RouteRegistry {
  constructor() {
    this._routes = new Map();
    this._setupDefaults();
  }

  /**
   * Set up default routes
   * @private
   */
  _setupDefaults() {
    // Cost-optimized route
    this.register(new Route('cost-optimized', {
      predicates: [
        { dimension: 'cost', operator: 'lt', value: 0.01, weight: 0.7 }
      ],
      models: ['deepseek/deepseek-chat-v3.1', 'google/gemini-3-flash-preview'],
      fallback: 'default',
      priority: 10
    }));

    // Quality-focused route
    this.register(new Route('quality-focused', {
      predicates: [
        { dimension: 'quality', operator: 'gt', value: 0.8, weight: 0.8 }
      ],
      models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-5-chat', 'google/gemini-3-pro-preview'],
      fallback: 'default',
      priority: 5
    }));

    // Technical/coding route
    this.register(new Route('technical', {
      predicates: [
        { dimension: 'topic', operator: 'matches', value: 'code|programming|technical|api', weight: 0.9 }
      ],
      models: ['qwen/qwen3-coder', 'deepseek/deepseek-chat-v3.1'],
      fallback: 'default',
      priority: 8
    }));

    // Default catch-all
    this.register(new Route('default', {
      predicates: [],
      models: [],
      fallback: null,
      priority: 0
    }));
  }

  /**
   * Register a route
   * @param {Route} route
   */
  register(route) {
    this._routes.set(route.name, route);
  }

  /**
   * Get route by name
   * @param {string} name
   * @returns {Route|null}
   */
  get(name) {
    return this._routes.get(name) || null;
  }

  /**
   * Find best matching route for context
   * @param {object} context - Query context
   * @returns {Route}
   */
  match(context) {
    const candidates = [];

    for (const route of this._routes.values()) {
      if (route.matches(context)) {
        candidates.push(route);
      }
    }

    // Sort by priority (highest first)
    candidates.sort((a, b) => b.priority - a.priority);

    return candidates[0] || this.get('default');
  }

  /**
   * Remove a route
   * @param {string} name
   */
  unregister(name) {
    if (name !== 'default') {
      this._routes.delete(name);
    }
  }

  /**
   * List all routes
   * @returns {Array<Route>}
   */
  list() {
    return Array.from(this._routes.values())
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get route as MCP resource URI
   * @param {string} name
   * @returns {string}
   */
  getResourceUri(name) {
    return `rail://routes/${name}`;
  }

  /**
   * Parse route name from MCP resource URI
   * @param {string} uri
   * @returns {string|null}
   */
  parseResourceUri(uri) {
    const match = uri.match(/^rail:\/\/routes\/(.+)$/);
    return match ? match[1] : null;
  }
}

// Singleton registry
const registry = new RouteRegistry();

/**
 * Create a Rail from a route name
 *
 * Convenience method that looks up a route and materializes a Rail from it.
 *
 * @param {string} routeName - Name of the route to materialize
 * @param {object} [options] - Additional rail options
 * @returns {object|null} Rail or null if route not found
 */
function createRailFor(routeName, options = {}) {
  const route = registry.get(routeName);
  if (!route) return null;

  // Lazy-load rail module to avoid circular deps
  const { Rail } = require('../rail');
  return Rail.fromRoute(route, options);
}

/**
 * Match context and create a Rail in one step
 *
 * @param {object} context - Query context to match
 * @param {object} [options] - Additional rail options
 * @returns {{ route: Route, rail: object }}
 */
function matchAndCreateRail(context, options = {}) {
  const route = registry.match(context);
  const { Rail } = require('../rail');
  const rail = Rail.fromRoute(route, options);
  return { route, rail };
}

/**
 * Hierarchical route using ltree for path-based routing
 * Example: research.technical.ai.vision -> matches research.technical.*
 */
class HierarchicalRoute extends Route {
  constructor(name, config) {
    super(name, config);
    this.pathPattern = config.pathPattern || null; // ltree query pattern
  }

  async matchesHierarchical(context, dbClient) {
    if (!this.pathPattern || !context.path || !dbClient) return false;

    try {
      const result = await dbClient.executeQuery(`
        SELECT $1::ltree ~ $2::lquery AS matches
      `, [context.path, this.pathPattern]);

      return result.rows?.[0]?.matches || false;
    } catch (err) {
      console.error('[HierarchicalRoute] Match error:', err);
      return false;
    }
  }
}

module.exports = {
  Route,
  HierarchicalRoute,
  RouteRegistry,
  RouteOperator,
  RouteDimension,
  registry,
  // Rail materialization
  createRailFor,
  matchAndCreateRail,
  // MCP resource prefix
  RESOURCE_PREFIX: 'rail://routes/'
};
