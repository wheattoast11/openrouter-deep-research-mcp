/**
 * Schema Registry
 *
 * Centralized Zod schemas with composable building blocks.
 * Each schema IS the specification - documentation and validation unified.
 */

const { z } = require('zod');

// =============================================================================
// Base Building Blocks
// =============================================================================

const Base = {
  id: z.string().min(1).describe('Unique identifier'),
  query: z.string().min(1).describe('Search or research query'),
  limit: z.number().int().positive().max(100).default(10).describe('Max results'),
  offset: z.number().int().nonnegative().default(0).describe('Skip first N results'),
  cost: z.enum(['high', 'low']).default('low').describe('Model cost tier'),
  format: z.enum(['report', 'briefing', 'bullet_points']).default('report'),
  scope: z.enum(['both', 'reports', 'docs']).default('both'),
  audience: z.enum(['beginner', 'intermediate', 'expert']).default('intermediate'),
  async: z.boolean().default(true).describe('Run asynchronously')
};

// =============================================================================
// Composed Schemas by Domain
// =============================================================================

/**
 * Research domain
 */
const Research = {
  run: z.object({
    query: Base.query,
    costPreference: Base.cost,
    audienceLevel: Base.audience,
    outputFormat: Base.format,
    includeSources: z.boolean().default(true),
    async: Base.async,
    images: z.array(z.object({
      url: z.string().url(),
      detail: z.enum(['low', 'high', 'auto']).default('auto')
    })).optional(),
    textDocuments: z.array(z.object({
      name: z.string(),
      content: z.string()
    })).optional(),
    structuredData: z.array(z.object({
      name: z.string(),
      type: z.enum(['csv', 'json']),
      content: z.string()
    })).optional()
  }).describe('Run a research query'),

  followUp: z.object({
    originalQuery: z.string().min(1),
    followUpQuestion: z.string().min(1),
    costPreference: Base.cost
  }).describe('Follow up on previous research'),

  batch: z.object({
    queries: z.array(z.union([
      z.string(),
      z.object({
        query: z.string(),
        costPreference: Base.cost.optional(),
        audienceLevel: Base.audience.optional()
      })
    ])).min(1).max(10),
    waitForCompletion: z.boolean().default(false),
    timeoutMs: z.number().positive().max(600000).default(300000),
    costPreference: Base.cost
  }).describe('Batch multiple research queries')
};

/**
 * Knowledge Base domain
 */
const KB = {
  search: z.object({
    query: Base.query,
    k: Base.limit,
    scope: Base.scope,
    rerank: z.boolean().optional()
  }).describe('Hybrid BM25+vector search'),

  retrieve: z.object({
    mode: z.enum(['index', 'sql']).default('index'),
    query: z.string().optional(),
    sql: z.string().optional(),
    k: Base.limit,
    scope: Base.scope,
    explain: z.boolean().default(false),
    params: z.array(z.unknown()).default([])
  }).refine(
    data => data.mode !== 'index' || data.query,
    { message: 'query required when mode=index' }
  ).refine(
    data => data.mode !== 'sql' || data.sql,
    { message: 'sql required when mode=sql' }
  ).describe('Retrieve from index or execute SQL'),

  report: z.object({
    reportId: z.string().min(1),
    mode: z.enum(['full', 'summary', 'truncate', 'smart']).default('full'),
    maxChars: z.number().positive().default(2000),
    query: z.string().optional()
  }).describe('Get report by ID')
};

/**
 * Job domain
 */
const Job = {
  status: z.object({
    job_id: z.string().min(1),
    format: z.enum(['summary', 'full', 'events']).default('summary'),
    max_events: z.number().int().positive().default(50),
    since_event_id: z.number().int().optional()
  }).describe('Get job status'),

  cancel: z.object({
    job_id: z.string().min(1)
  }).describe('Cancel a job'),

  list: z.object({
    limit: z.number().int().positive().default(20),
    cursor: z.string().optional()
  }).describe('List jobs')
};

/**
 * Graph domain
 */
const Graph = {
  traverse: z.object({
    startNode: z.string().min(1),
    depth: z.number().int().positive().max(10).default(3),
    strategy: z.enum(['bfs', 'dfs', 'semantic']).default('semantic')
  }).describe('Traverse knowledge graph'),

  path: z.object({
    from: z.string().min(1),
    to: z.string().min(1)
  }).describe('Find path between nodes'),

  clusters: z.object({}).describe('Find node clusters'),

  pagerank: z.object({
    topK: z.number().int().positive().default(20)
  }).describe('Get importance rankings'),

  patterns: z.object({
    n: z.number().int().positive().default(3)
  }).describe('Extract N-gram patterns'),

  stats: z.object({}).describe('Get graph statistics')
};

/**
 * Session domain
 */
const Session = {
  state: z.object({
    sessionId: z.string().default('default')
  }).describe('Get session state'),

  undo: z.object({
    sessionId: z.string().default('default')
  }).describe('Undo last action'),

  redo: z.object({
    sessionId: z.string().default('default')
  }).describe('Redo undone action'),

  fork: z.object({
    sessionId: z.string().default('default'),
    newSessionId: z.string().optional()
  }).describe('Fork session'),

  timeTravel: z.object({
    sessionId: z.string().default('default'),
    timestamp: z.string()
  }).describe('Navigate to timestamp'),

  checkpoint: z.object({
    sessionId: z.string().default('default'),
    name: z.string().min(1)
  }).describe('Create named checkpoint')
};

/**
 * Utility domain
 */
const Util = {
  ping: z.object({
    info: z.boolean().default(false)
  }).describe('Health check'),

  datetime: z.object({
    format: z.enum(['iso', 'rfc', 'epoch']).default('iso')
  }).describe('Get current time'),

  calc: z.object({
    expr: z.string().min(1),
    precision: z.number().int().min(0).max(12).default(6)
  }).describe('Evaluate math expression'),

  tools: z.object({
    query: z.string().optional(),
    limit: z.number().int().positive().default(50),
    semantic: z.boolean().default(true)
  }).describe('List or search tools')
};

/**
 * Web domain
 */
const Web = {
  search: z.object({
    query: z.string().min(1),
    maxResults: z.number().int().positive().max(10).default(5)
  }).describe('Search the web'),

  fetch: z.object({
    url: z.string().url(),
    maxBytes: z.number().int().positive().default(200000)
  }).describe('Fetch URL content')
};

// =============================================================================
// Schema Registry
// =============================================================================

const Schemas = {
  // Research
  research: Research.run,
  research_follow_up: Research.followUp,
  batch_research: Research.batch,
  conduct_research: Research.run.extend({ async: z.boolean().default(false) }),

  // Knowledge Base
  search: KB.search,
  retrieve: KB.retrieve,
  query: z.object({
    sql: z.string().min(1),
    params: z.array(z.unknown()).default([]),
    explain: z.boolean().default(false)
  }).describe('Execute a read-only SELECT query'),
  get_report: KB.report,

  // Jobs
  job_status: Job.status,
  get_job_status: Job.status,
  cancel_job: Job.cancel,
  task_list: Job.list,
  task_get: z.object({ job_id: z.string().min(1) }).describe('Get task details'),
  task_result: z.object({ job_id: z.string().min(1) }).describe('Get task result'),
  task_cancel: Job.cancel,

  // Graph
  graph_traverse: Graph.traverse,
  graph_path: Graph.path,
  graph_clusters: Graph.clusters,
  graph_pagerank: Graph.pagerank,
  graph_patterns: Graph.patterns,
  graph_stats: Graph.stats,

  // Session
  session_state: Session.state,
  undo: Session.undo,
  redo: Session.redo,
  fork_session: Session.fork,
  time_travel: Session.timeTravel,
  checkpoint: Session.checkpoint,

  // Utility
  ping: Util.ping,
  date_time: Util.datetime,
  calc: Util.calc,
  list_tools: Util.tools,
  search_tools: Util.tools.pick({ query: true, limit: true }),

  // Web
  search_web: Web.search,
  fetch_url: Web.fetch
};

/**
 * Get schema for a tool
 */
function getSchema(tool) {
  return Schemas[tool];
}

/**
 * Validate params against schema
 */
function validate(tool, params) {
  const schema = getSchema(tool);
  if (!schema) {
    throw new Error(`Unknown tool: ${tool}`);
  }
  return schema.parse(params);
}

/**
 * Safe validate (returns result object)
 */
function safeValidate(tool, params) {
  const schema = getSchema(tool);
  if (!schema) {
    return { success: false, error: `Unknown tool: ${tool}` };
  }
  return schema.safeParse(params);
}

module.exports = {
  Base,
  Research,
  KB,
  Job,
  Graph,
  Session,
  Util,
  Web,
  Schemas,
  getSchema,
  validate,
  safeValidate
};
