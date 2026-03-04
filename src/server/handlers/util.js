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
 * Safe math expression evaluator using recursive descent parser
 * Supports: +, -, *, /, %, ^/**, parentheses, decimals
 * Operator precedence: ** (right-associative) > *, /, % > +, -
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
    const result = evaluateExpression(expr);

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
 * Tokenize expression into numbers and operators
 */
function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const normalized = expr.replace(/\^/g, '**').replace(/\s+/g, '');

  while (i < normalized.length) {
    const char = normalized[i];

    // Numbers (including decimals)
    if (/\d/.test(char) || (char === '.' && /\d/.test(normalized[i + 1]))) {
      let num = '';
      while (i < normalized.length && /[\d.]/.test(normalized[i])) {
        num += normalized[i++];
      }
      const parsed = parseFloat(num);
      if (isNaN(parsed)) {
        throw new Error(`Invalid number: ${num}`);
      }
      tokens.push({ type: 'number', value: parsed });
      continue;
    }

    // Handle ** for exponentiation (check BEFORE single * to avoid dead code)
    if (char === '*' && normalized[i + 1] === '*') {
      tokens.push({ type: 'operator', value: '**' });
      i += 2;
      continue;
    }

    // Operators and parentheses
    if ('+-*/%()'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: ${char}`);
  }

  return tokens;
}

/**
 * Recursive descent parser with proper operator precedence
 */
function evaluateExpression(expr) {
  const tokens = tokenize(expr);
  let pos = 0;

  function peek() {
    return tokens[pos];
  }

  function consume() {
    return tokens[pos++];
  }

  function parseNumber() {
    const token = peek();
    if (!token) {
      throw new Error('Unexpected end of expression');
    }

    // Handle unary minus/plus
    if (token.type === 'operator' && (token.value === '-' || token.value === '+')) {
      consume();
      const sign = token.value === '-' ? -1 : 1;
      return sign * parseNumber();
    }

    // Number literal
    if (token.type === 'number') {
      consume();
      return token.value;
    }

    // Parenthesized expression
    if (token.type === 'operator' && token.value === '(') {
      consume();
      const result = parseAddSub();
      const closing = consume();
      if (!closing || closing.value !== ')') {
        throw new Error('Missing closing parenthesis');
      }
      return result;
    }

    throw new Error(`Expected number or '(', got ${token.value}`);
  }

  // Exponentiation (right-associative, highest precedence)
  function parsePower() {
    let left = parseNumber();

    while (peek() && peek().type === 'operator' && peek().value === '**') {
      consume();
      const right = parsePower(); // Right-associative recursion
      left = Math.pow(left, right);
    }

    return left;
  }

  // Multiplication, division, modulo
  function parseMulDivMod() {
    let left = parsePower();

    while (peek() && peek().type === 'operator' && ['*', '/', '%'].includes(peek().value)) {
      const op = consume().value;
      const right = parsePower();

      if (op === '*') {
        left = left * right;
      } else if (op === '/') {
        if (right === 0) {
          throw new Error('Division by zero');
        }
        left = left / right;
      } else if (op === '%') {
        if (right === 0) {
          throw new Error('Modulo by zero');
        }
        left = left % right;
      }
    }

    return left;
  }

  // Addition and subtraction (lowest precedence)
  function parseAddSub() {
    let left = parseMulDivMod();

    while (peek() && peek().type === 'operator' && ['+', '-'].includes(peek().value)) {
      const op = consume().value;
      const right = parseMulDivMod();

      if (op === '+') {
        left = left + right;
      } else {
        left = left - right;
      }
    }

    return left;
  }

  const result = parseAddSub();

  // Ensure all tokens consumed
  if (pos < tokens.length) {
    throw new Error(`Unexpected token: ${tokens[pos].value}`);
  }

  return result;
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
