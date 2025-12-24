/**
 * Rail Protocol Schemas
 *
 * Zod schemas for Rail discovery tools and resource operations.
 *
 * @module core/schemas/rail
 */

'use strict';

const { z } = require('zod');

// =============================================================================
// Discovery Tool Schemas
// =============================================================================

/**
 * list_rails - List active rails, tunnels, routes, and consensus sessions
 */
const listRailsSchema = z.object({
  includeStats: z.boolean()
    .optional()
    .default(true)
    .describe('Include statistics (sent, received, dropped, buffered)'),
  filter: z.enum(['active', 'idle', 'all'])
    .optional()
    .default('all')
    .describe('Filter by rail state')
}).describe('List active rails with statistics');

/**
 * explain_rail - Show detailed configuration for a specific rail/tunnel
 */
const explainRailSchema = z.object({
  railId: z.string()
    .min(1)
    .describe('Rail or tunnel UUID to explain'),
  verbose: z.boolean()
    .optional()
    .default(false)
    .describe('Include full trace history and buffer contents')
}).describe('Show rail configuration, capacity, and history');

/**
 * list_routes - List all user-defined routes
 */
const listRoutesSchema = z.object({
  includePredicates: z.boolean()
    .optional()
    .default(false)
    .describe('Include predicate function details')
}).describe('List all user-defined routes');

/**
 * get_route - Get a specific route by name
 */
const getRouteSchema = z.object({
  name: z.string()
    .min(1)
    .describe('Route name')
}).describe('Get route configuration by name');

/**
 * list_tunnels - List active agent-to-agent tunnels
 */
const listTunnelsSchema = z.object({
  includeMessages: z.boolean()
    .optional()
    .default(false)
    .describe('Include recent message history')
}).describe('List active agent-to-agent tunnels');

/**
 * list_consensus - List streaming consensus sessions
 */
const listConsensusSchema = z.object({
  includeSignals: z.boolean()
    .optional()
    .default(false)
    .describe('Include individual model signals')
}).describe('List streaming consensus sessions');

/**
 * agentic_research - Execute knowledge pipeline for agentic research
 */
const agenticResearchSchema = z.object({
  query: z.string()
    .min(1)
    .describe('Research query'),
  stream: z.boolean()
    .optional()
    .default(false)
    .describe('Enable streaming consensus updates via notifications/rail.consensus')
}).describe('Execute first-principles knowledge pipeline for agentic research');

// =============================================================================
// Route Management Schemas
// =============================================================================

/**
 * Route predicate definition
 */
const predicateSchema = z.object({
  dimension: z.enum(['cost', 'quality', 'latency', 'capability', 'model'])
    .describe('Dimension to match on'),
  operator: z.enum(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in', 'contains'])
    .describe('Comparison operator'),
  value: z.union([z.string(), z.number(), z.array(z.string())])
    .describe('Value to compare against'),
  weight: z.number()
    .min(0)
    .max(1)
    .optional()
    .default(1.0)
    .describe('Predicate weight for scoring')
});

/**
 * define_route - Create a new routing rule
 */
const defineRouteSchema = z.object({
  name: z.string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .describe('Route name (lowercase alphanumeric with hyphens)'),
  predicates: z.array(predicateSchema)
    .min(1)
    .describe('Matching predicates'),
  models: z.array(z.string())
    .optional()
    .describe('Target models for this route'),
  fallback: z.string()
    .optional()
    .default('default')
    .describe('Fallback route if no match'),
  priority: z.number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .default(50)
    .describe('Route priority (higher = evaluated first)')
}).describe('Define a new routing rule');

/**
 * test_route - Dry-run route matching
 */
const testRouteSchema = z.object({
  query: z.string()
    .min(1)
    .describe('Query to test routing for'),
  costPreference: z.enum(['high', 'low'])
    .optional()
    .default('low'),
  verbose: z.boolean()
    .optional()
    .default(false)
    .describe('Show all evaluated routes with scores')
}).describe('Test route matching without executing');

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  // Discovery
  listRailsSchema,
  explainRailSchema,
  listRoutesSchema,
  getRouteSchema,
  listTunnelsSchema,
  listConsensusSchema,
  agenticResearchSchema,

  // Route management
  predicateSchema,
  defineRouteSchema,
  testRouteSchema
};
