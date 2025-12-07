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
 *
 * @param {Object} params - Parameters to validate
 * @param {Array<string>} required - List of required parameter names
 * @throws {Error} If any required parameter is missing
 */
function validateRequired(params, required) {
  const missing = required.filter(key => !(key in params) || params[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing required parameters: ${missing.join(', ')}`);
  }
}

/**
 * Validation rules for required parameters by operation.
 *
 * Each rule can specify:
 * - required: Array of required field names
 * - aliases: Alternative names to check for the field
 * - message: Custom error message
 */
const PARAM_RULES = {
  search: {
    required: ['query'],
    message: 'query is required for search'
  },
  sql: {
    required: ['sql'],
    message: 'sql is required'
  },
  query: {
    required: ['sql'],
    message: 'sql parameter is required'
  },
  report: {
    required: ['reportId'],
    aliases: { reportId: ['id', 'report_id'] },
    message: 'reportId is required'
  },
  get_report: {
    required: ['reportId'],
    aliases: { reportId: ['id', 'report_id'] },
    message: 'reportId is required'
  },
  traverse: {
    required: ['startNode'],
    aliases: { startNode: ['node', 'start_node'] },
    message: 'startNode is required for traversal'
  },
  graph_traverse: {
    required: ['startNode'],
    aliases: { startNode: ['node', 'start_node'] },
    message: 'startNode is required for traversal'
  },
  path: {
    required: ['from', 'to'],
    message: 'Both from and to parameters are required'
  },
  graph_path: {
    required: ['from', 'to'],
    message: 'Both from and to parameters are required'
  },
  time_travel: {
    required: ['timestamp'],
    message: 'timestamp is required for time travel'
  },
  checkpoint: {
    required: ['name'],
    message: 'name is required for checkpoint'
  },
  job_status: {
    required: ['job_id'],
    aliases: { job_id: ['id', 'jobId'] },
    message: 'job_id is required'
  },
  task_get: {
    required: ['taskId'],
    aliases: { taskId: ['id', 'task_id'] },
    message: 'taskId is required'
  },
  task_result: {
    required: ['taskId'],
    aliases: { taskId: ['id', 'task_id'] },
    message: 'taskId is required'
  },
  task_cancel: {
    required: ['taskId'],
    aliases: { taskId: ['id', 'task_id'] },
    message: 'taskId is required'
  },
  calc: {
    required: ['expr'],
    message: 'expr parameter is required'
  },
  research_follow_up: {
    required: ['originalQuery', 'followUpQuestion'],
    message: 'originalQuery and followUpQuestion are required'
  }
};

/**
 * Validate parameters against operation-specific rules.
 *
 * Checks if required parameters are present, accounting for aliases.
 *
 * @param {string} operation - Operation name to validate for
 * @param {Object} params - Parameters to validate
 * @returns {Object} Validated parameters (unchanged)
 * @throws {Error} If required parameters are missing
 *
 * @example
 * validateParams('search', { query: 'test' }); // OK
 * validateParams('search', {}); // throws "query is required for search"
 */
function validateParams(operation, params) {
  const rule = PARAM_RULES[operation];
  if (!rule) return params;

  for (const field of rule.required) {
    // Build list of names to check (canonical + aliases)
    const namesToCheck = [field];
    if (rule.aliases?.[field]) {
      namesToCheck.push(...rule.aliases[field]);
    }

    // Check if any name has a value
    const hasValue = namesToCheck.some(name =>
      params[name] != null && params[name] !== ''
    );

    if (!hasValue) {
      throw new Error(rule.message || `${field} is required`);
    }
  }

  return params;
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
  validateParams,
  coerceTypes,
  getToolCategory,
  GLOBAL_ALIASES,
  TOOL_ALIASES,
  DEFAULTS,
  PARAM_RULES
};
