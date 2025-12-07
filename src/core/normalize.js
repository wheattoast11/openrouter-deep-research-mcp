/**
 * Parameter Normalization
 *
 * Single declarative alias system for all tool parameters.
 * Replaces 10+ scattered normalizer functions with one unified approach.
 */

/**
 * Global aliases applied to all tools
 */
const GLOBAL_ALIASES = {
  q: 'query',
  k: 'limit',
  cost: 'costPreference',
  aud: 'audienceLevel',
  fmt: 'outputFormat',
  src: 'includeSources',
  imgs: 'images',
  docs: 'textDocuments',
  data: 'structuredData'
};

/**
 * Tool-specific aliases
 */
const TOOL_ALIASES = {
  job: { job_id: 'id', jobId: 'id' },
  report: { reportId: 'id', report_id: 'id' },
  graph: { startNode: 'node', start_node: 'node' },
  session: { sessionId: 'id', session_id: 'id' },
  task: { taskId: 'id', task_id: 'id' }
};

/**
 * Default values by tool
 */
const DEFAULTS = {
  research: { costPreference: 'low', async: true },
  search: { limit: 10, scope: 'both' },
  retrieve: { mode: 'index', limit: 10 },
  query: { explain: false },
  graph: { depth: 3, strategy: 'semantic' },
  batch: { waitForCompletion: false, timeoutMs: 300000 }
};

/**
 * Apply alias mappings to parameters
 */
function applyAliases(params, aliases) {
  if (!params || typeof params !== 'object') return params;

  const result = { ...params };

  for (const [alias, canonical] of Object.entries(aliases)) {
    if (alias in result && !(canonical in result)) {
      result[canonical] = result[alias];
      delete result[alias];
    }
  }

  return result;
}

/**
 * Normalize parameters for a tool
 *
 * @param {string} tool - Tool name (or category)
 * @param {object} params - Raw parameters
 * @returns {object} Normalized parameters
 */
function normalize(tool, params) {
  if (!params) return {};

  // Handle string input (treat as query)
  if (typeof params === 'string') {
    params = { query: params };
  }

  // Apply global aliases
  let result = applyAliases(params, GLOBAL_ALIASES);

  // Apply tool-specific aliases
  const toolCategory = getToolCategory(tool);
  if (TOOL_ALIASES[toolCategory]) {
    result = applyAliases(result, TOOL_ALIASES[toolCategory]);
  }

  // Apply defaults
  if (DEFAULTS[toolCategory]) {
    result = { ...DEFAULTS[toolCategory], ...result };
  }

  return result;
}

/**
 * Get tool category for alias/default lookup
 */
function getToolCategory(tool) {
  const categories = {
    job_status: 'job',
    get_job_status: 'job',
    cancel_job: 'job',
    task_get: 'task',
    task_result: 'task',
    task_cancel: 'task',
    task_list: 'task',
    get_report: 'report',
    graph_traverse: 'graph',
    graph_path: 'graph',
    graph_clusters: 'graph',
    graph_pagerank: 'graph',
    graph_patterns: 'graph',
    graph_stats: 'graph',
    session_state: 'session',
    fork_session: 'session',
    time_travel: 'session',
    checkpoint: 'session',
    batch_research: 'batch',
    conduct_research: 'research',
    research_follow_up: 'research'
  };

  return categories[tool] ?? tool;
}

/**
 * Validate required parameters exist
 */
function validateRequired(params, required) {
  const missing = required.filter(key => !(key in params) || params[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing required parameters: ${missing.join(', ')}`);
  }
}

/**
 * Coerce types based on schema expectations
 */
function coerceTypes(params, schema) {
  if (!schema) return params;

  const result = { ...params };

  for (const [key, spec] of Object.entries(schema)) {
    if (!(key in result)) continue;

    const value = result[key];
    const type = spec.type ?? spec;

    if (type === 'number' && typeof value === 'string') {
      const num = Number(value);
      if (!isNaN(num)) result[key] = num;
    } else if (type === 'boolean' && typeof value === 'string') {
      result[key] = value === 'true' || value === '1';
    } else if (type === 'string' && typeof value === 'number') {
      result[key] = String(value);
    }
  }

  return result;
}

module.exports = {
  normalize,
  applyAliases,
  validateRequired,
  coerceTypes,
  getToolCategory,
  GLOBAL_ALIASES,
  TOOL_ALIASES,
  DEFAULTS
};
