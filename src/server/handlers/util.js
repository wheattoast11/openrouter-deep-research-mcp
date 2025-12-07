/**
 * Utility Handlers
 *
 * Consolidated handlers for: ping, date_time, calc, list_tools, search_tools
 */

const { normalize } = require('../../core/normalize');
const { Schemas, safeValidate } = require('../../core/schemas');
const config = require('../../../config');

/**
 * Unified utility handler
 *
 * Routes to specific operation based on tool name or op parameter
 */
async function handleUtil(tool, params, context = {}) {
  const normalized = normalize(tool, params);

  switch (tool) {
    case 'ping':
      return handlePing(normalized);
    case 'date_time':
      return handleDateTime(normalized);
    case 'calc':
      return handleCalc(normalized);
    case 'list_tools':
    case 'search_tools':
      return handleTools(tool, normalized, context);
    default:
      return { error: `Unknown utility tool: ${tool}` };
  }
}

/**
 * Health check
 */
function handlePing(params = {}) {
  const result = {
    pong: true,
    timestamp: new Date().toISOString()
  };

  if (params.info) {
    result.version = config.version || '1.8.0';
    result.mode = config.mode || 'ALL';
    result.uptime = process.uptime();
  }

  return result;
}

/**
 * Get current date/time
 */
function handleDateTime(params = {}) {
  const format = params.format || 'iso';
  const now = new Date();

  switch (format) {
    case 'epoch':
      return { timestamp: now.getTime(), format: 'epoch' };
    case 'rfc':
      return { timestamp: now.toUTCString(), format: 'rfc' };
    case 'iso':
    default:
      return { timestamp: now.toISOString(), format: 'iso' };
  }
}

/**
 * Safe math expression evaluator
 */
function handleCalc(params) {
  const { expr, precision = 6 } = params;

  if (!expr || typeof expr !== 'string') {
    throw new Error('expr parameter is required');
  }

  // Validate expression contains only safe characters
  const safePattern = /^[\d\s+\-*/().^%]+$/;
  if (!safePattern.test(expr)) {
    throw new Error('Invalid characters in expression. Allowed: digits, +, -, *, /, (, ), ^, %, .');
  }

  try {
    // Replace ^ with ** for exponentiation
    const jsExpr = expr.replace(/\^/g, '**');

    // Use Function constructor for safe evaluation (no access to global scope)
    const fn = new Function(`return (${jsExpr})`);
    const result = fn();

    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error('Expression did not evaluate to a finite number');
    }

    return {
      expression: expr,
      result: Number(result.toFixed(precision)),
      precision
    };
  } catch (error) {
    throw new Error(`Calculation error: ${error.message}`);
  }
}

/**
 * List or search tools
 */
async function handleTools(tool, params, context = {}) {
  const { query, limit = 50, semantic = true } = params;
  const { toolRegistry } = context;

  // If no registry provided, return basic info
  if (!toolRegistry) {
    return {
      message: 'Tool registry not available in this context',
      hint: 'Use list_tools from MCP client to get full tool list'
    };
  }

  // Filter tools if query provided
  let tools = Array.from(toolRegistry.values());

  if (query) {
    const q = query.toLowerCase();
    tools = tools.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q))
    );
  }

  // Limit results
  tools = tools.slice(0, limit);

  return {
    count: tools.length,
    tools: tools.map(t => ({
      name: t.name,
      description: t.description || ''
    }))
  };
}

module.exports = {
  handleUtil,
  handlePing,
  handleDateTime,
  handleCalc,
  handleTools
};
