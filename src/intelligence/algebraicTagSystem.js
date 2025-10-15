/**
 * Algebraic Tag System - Compositional Tool Abstraction
 * 
 * Single-letter tags with vowel operators form a protein-like encoding
 * of MCP tool sequences, enabling compressive superintelligence at scale.
 * 
 * VOWEL OPERATORS (Transformation Functions):
 * - O: Observe  - Input acquisition, perception
 * - A: Abstract - Pattern extraction, dimensionality reduction
 * - E: Extend   - Expansion, extrapolation
 * - I: Interpret - Semantic decoding, understanding
 * - U: Unify    - Synthesis, convergence
 * 
 * CONSONANT ANCHORS (Semantic Nodes):
 * - R: Research, Retrieve
 * - S: Search, Select
 * - T: Task, Transform
 * - K: Knowledge
 * - M: Modify, Measure
 * - P: Perceive, Plan
 * - C: Compose, Create
 * - D: Decide
 * - V: Verify
 * - Q: Query
 * - B: Benchmark
 * - L: List, Log
 * - N: Net (Interaction Nets)
 * - G: Gate (SOP Gates)
 * - X: Execute
 * - W: Write
 * - F: Fetch
 * 
 * COMPOSITIONAL ALGEBRA:
 * - Juxtaposition: Sequential application (RS = Research then Search)
 * - Parentheses: Grouping (R(OS) = Research(Observe Search))
 * - Brackets: Parallel execution ([RS] = Research || Search)
 * - Exponentiation: Repetition (R^3 = RRR)
 * - Division: Conditional (R/S = Research if Search succeeds)
 * 
 * EXAMPLES:
 * - R(O(K)) → Research(Observe(Knowledge)) = agent(action='research')
 * - I(A(R(O(S)))) → Interpret(Abstract(Research(Observe(Search)))) = Full research flow
 * - [R, S, T] → Parallel: research || search || task
 * - R→A→D→X→V → SOP Gates: Research→Abstract→Decide→Execute→Verify
 */

const { trace } = require('../utils/logger');

// ============================================================================
// Tag Definitions
// ============================================================================

/**
 * Vowel Operators - Transform data between representations
 */
export const VowelOperators = Object.freeze({
  O: 'observe',    // Input acquisition
  A: 'abstract',   // Pattern extraction
  E: 'extend',     // Expansion
  I: 'interpret',  // Semantic decoding
  U: 'unify'       // Synthesis
});

/**
 * Consonant Anchors - Semantic actions
 */
export const ConsonantAnchors = Object.freeze({
  R: 'research',
  S: 'search',
  T: 'task',
  K: 'knowledge',
  M: 'measure',
  P: 'plan',
  C: 'compose',
  D: 'decide',
  V: 'verify',
  Q: 'query',
  B: 'benchmark',
  L: 'list',
  N: 'net',
  G: 'gate',
  X: 'execute',
  W: 'write',
  F: 'fetch'
});

/**
 * MCP Tool Mappings - Map tags to actual tool names
 */
export const TagToToolMap = Object.freeze({
  // Core agent operations
  'R': 'agent',                    // Research
  'RO': 'agent',                   // Research with Observe
  'ROK': 'agent',                  // Research(Observe(Knowledge))
  'IAROK': 'agent',                // Full research flow
  
  // Retrieval operations
  'S': 'search_index',             // Search
  'Q': 'query',                    // SQL Query
  'F': 'fetch_url',                // Fetch URL
  'FS': 'search_web',              // Fetch Search (web)
  
  // Knowledge operations
  'K': 'index_texts',              // Knowledge indexing
  'KS': 'index_status',            // Knowledge Status
  
  // Job operations
  'L': 'get_job_status',           // List job status
  'LJ': 'list_research_history',   // List jobs (research history)
  'V': 'get_job_result',           // Verify (get result)
  'X': 'cancel_job',               // Execute cancel
  
  // Benchmark operations
  'B': 'benchmark.run',            // Benchmark
  'BM': 'benchmark.measure',       // Benchmark Measure
  'BV': 'benchmark.finish',        // Benchmark Verify (finish)
  
  // Model operations
  'M': 'model.catalog',            // Model catalog
  'MS': 'model.set',               // Model Set
  
  // Stack operations
  'C': 'stack.configure',          // Configure stack
  
  // Trace operations
  'T': 'trace.log',                // Trace log
  'TL': 'trace.list',              // Trace List
  
  // Utility operations
  'D': 'datetime',                 // DateTime
  'DC': 'calc',                    // DateTime Calc (arithmetic)
  
  // Server operations
  'P': 'ping',                     // Ping
  'PS': 'get_server_status'        // Ping Server (status)
});

/**
 * Tool Parameter Templates - Default parameters for each tag
 */
export const TagParameterTemplates = Object.freeze({
  'R': { action: 'research' },
  'ROK': { action: 'research', mode: 'full' },
  'S': { limit: 10 },
  'Q': { params: [] },
  'F': { maxBytes: 200000 },
  'FS': { maxResults: 5 },
  'K': { documents: [] },
  'L': { format: 'summary' },
  'LJ': { limit: 10 },
  'B': {},
  'BM': {},
  'BV': {},
  'M': { refresh: false },
  'MS': {},
  'C': { id: 'active' },
  'T': {},
  'TL': {},
  'D': { format: 'iso' },
  'DC': { precision: 6 },
  'P': { info: false },
  'PS': {}
});

// ============================================================================
// Compositional Parser
// ============================================================================

/**
 * Parse a tag expression into an execution plan
 * @param {string} expr - Tag expression (e.g., "R(O(K))" or "[R,S,T]")
 * @returns {Object} Execution plan with sequence, parallel, and conditional nodes
 */
export function parseTagExpression(expr) {
  expr = expr.replace(/\s+/g, ''); // Remove whitespace
  
  const tokens = tokenize(expr);
  const ast = parse(tokens);
  
  return {
    ast,
    executionPlan: compileToExecutionPlan(ast),
    estimatedOps: countOperations(ast),
    tags: extractTags(ast)
  };
}

/**
 * Tokenize tag expression
 */
function tokenize(expr) {
  const tokens = [];
  let i = 0;
  
  while (i < expr.length) {
    const char = expr[i];
    
    if (char === '(' || char === ')' || char === '[' || char === ']' || char === ',' || char === '/' || char === '^') {
      tokens.push({ type: 'operator', value: char });
      i++;
    } else if (char === '→') {
      tokens.push({ type: 'arrow', value: '→' });
      i++;
    } else if (/[A-Z]/.test(char)) {
      // Consume consecutive uppercase letters as a single tag
      let tag = '';
      while (i < expr.length && /[A-Z]/.test(expr[i])) {
        tag += expr[i];
        i++;
      }
      tokens.push({ type: 'tag', value: tag });
    } else if (/\d/.test(char)) {
      // Consume numbers
      let num = '';
      while (i < expr.length && /\d/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push({ type: 'number', value: parseInt(num, 10) });
    } else {
      i++; // Skip unknown characters
    }
  }
  
  return tokens;
}

/**
 * Parse tokens into AST
 */
function parse(tokens) {
  let pos = 0;
  
  function parseExpr() {
    const nodes = [];
    
    while (pos < tokens.length) {
      const token = tokens[pos];
      
      if (token.type === 'tag') {
        const tag = token.value;
        pos++;
        
        // Check for function application: TAG(...)
        if (pos < tokens.length && tokens[pos].value === '(') {
          pos++; // consume '('
          const arg = parseExpr();
          if (pos < tokens.length && tokens[pos].value === ')') {
            pos++; // consume ')'
          }
          nodes.push({ type: 'apply', tag, arg });
        }
        // Check for exponentiation: TAG^N
        else if (pos < tokens.length && tokens[pos].value === '^') {
          pos++; // consume '^'
          if (pos < tokens.length && tokens[pos].type === 'number') {
            const n = tokens[pos].value;
            pos++;
            nodes.push({ type: 'repeat', tag, count: n });
          }
        }
        // Check for conditional: TAG/TAG
        else if (pos < tokens.length && tokens[pos].value === '/') {
          pos++; // consume '/'
          const fallback = parseExpr();
          nodes.push({ type: 'conditional', primary: { type: 'tag', value: tag }, fallback });
        } else {
          nodes.push({ type: 'tag', value: tag });
        }
      }
      // Parallel execution: [TAG, TAG, ...]
      else if (token.value === '[') {
        pos++; // consume '['
        const parallel = [];
        while (pos < tokens.length && tokens[pos].value !== ']') {
          parallel.push(parseExpr());
          if (pos < tokens.length && tokens[pos].value === ',') {
            pos++; // consume ','
          }
        }
        if (pos < tokens.length && tokens[pos].value === ']') {
          pos++; // consume ']'
        }
        nodes.push({ type: 'parallel', nodes: parallel });
      }
      // Arrow (SOP gate flow): TAG→TAG→TAG
      else if (token.type === 'arrow') {
        pos++; // consume '→'
        // Already have previous node, this becomes a sequence
        if (nodes.length > 0) {
          const prev = nodes.pop();
          const next = parseExpr();
          nodes.push({ type: 'sequence', nodes: [prev, next] });
        }
      }
      // End of group
      else if (token.value === ')' || token.value === ']' || token.value === ',') {
        break;
      } else {
        pos++;
      }
    }
    
    return nodes.length === 1 ? nodes[0] : { type: 'sequence', nodes };
  }
  
  return parseExpr();
}

/**
 * Compile AST to execution plan
 */
function compileToExecutionPlan(ast) {
  if (!ast) return [];
  
  switch (ast.type) {
    case 'tag':
      return [{ op: 'call', tool: TagToToolMap[ast.value] || 'unknown', tag: ast.value, params: TagParameterTemplates[ast.value] || {} }];
    
    case 'apply':
      // TAG(ARG) - Apply tag to result of arg
      const argPlan = compileToExecutionPlan(ast.arg);
      const toolName = TagToToolMap[ast.tag] || 'unknown';
      return [...argPlan, { op: 'call', tool: toolName, tag: ast.tag, params: TagParameterTemplates[ast.tag] || {}, inputFrom: argPlan.length - 1 }];
    
    case 'repeat':
      // TAG^N - Repeat tag N times
      const repeated = [];
      for (let i = 0; i < ast.count; i++) {
        repeated.push({ op: 'call', tool: TagToToolMap[ast.tag] || 'unknown', tag: ast.tag, params: TagParameterTemplates[ast.tag] || {} });
      }
      return repeated;
    
    case 'conditional':
      // TAG/FALLBACK - Try tag, fallback if fails
      return [
        { op: 'try', plan: compileToExecutionPlan(ast.primary) },
        { op: 'catch', plan: compileToExecutionPlan(ast.fallback) }
      ];
    
    case 'parallel':
      // [TAG, TAG] - Execute in parallel
      return [{ op: 'parallel', plans: ast.nodes.map(compileToExecutionPlan) }];
    
    case 'sequence':
      // TAG TAG - Execute sequentially
      return ast.nodes.flatMap(compileToExecutionPlan);
    
    default:
      return [];
  }
}

/**
 * Count total operations in AST
 */
function countOperations(ast) {
  if (!ast) return 0;
  
  switch (ast.type) {
    case 'tag':
      return 1;
    case 'apply':
      return 1 + countOperations(ast.arg);
    case 'repeat':
      return ast.count;
    case 'conditional':
      return countOperations(ast.primary) + countOperations(ast.fallback);
    case 'parallel':
      return ast.nodes.reduce((sum, node) => sum + countOperations(node), 0);
    case 'sequence':
      return ast.nodes.reduce((sum, node) => sum + countOperations(node), 0);
    default:
      return 0;
  }
}

/**
 * Extract all tags from AST
 */
function extractTags(ast) {
  if (!ast) return [];
  
  switch (ast.type) {
    case 'tag':
      return [ast.value];
    case 'apply':
      return [ast.tag, ...extractTags(ast.arg)];
    case 'repeat':
      return Array(ast.count).fill(ast.tag);
    case 'conditional':
      return [...extractTags(ast.primary), ...extractTags(ast.fallback)];
    case 'parallel':
      return ast.nodes.flatMap(extractTags);
    case 'sequence':
      return ast.nodes.flatMap(extractTags);
    default:
      return [];
  }
}

// ============================================================================
// Execution Engine
// ============================================================================

/**
 * Execute a parsed tag expression
 * @param {Object} executionPlan - Compiled execution plan
 * @param {Object} toolExecutor - Object with tool execution methods
 * @param {Object} context - Execution context (for passing data between steps)
 * @returns {Promise<Object>} Execution result
 */
export async function executeTagExpression(executionPlan, toolExecutor, context = {}) {
  const results = [];
  
  for (const step of executionPlan) {
    try {
      switch (step.op) {
        case 'call': {
          const params = { ...step.params };
          
          // If inputFrom is specified, use output from previous step
          if (step.inputFrom !== undefined && results[step.inputFrom]) {
            Object.assign(params, { input: results[step.inputFrom] });
          }
          
          trace({ type: 'algebraic:execute', tag: step.tag, tool: step.tool, params });
          
          const result = await toolExecutor.call(step.tool, params);
          results.push(result);
          break;
        }
        
        case 'try': {
          try {
            const result = await executeTagExpression(step.plan, toolExecutor, context);
            results.push(result);
          } catch (e) {
            results.push({ error: e.message });
          }
          break;
        }
        
        case 'catch': {
          // Only execute if previous step failed
          if (results.length > 0 && results[results.length - 1].error) {
            const result = await executeTagExpression(step.plan, toolExecutor, context);
            results[results.length - 1] = result;
          }
          break;
        }
        
        case 'parallel': {
          const parallelResults = await Promise.all(
            step.plans.map(plan => executeTagExpression(plan, toolExecutor, context))
          );
          results.push(parallelResults);
          break;
        }
      }
    } catch (e) {
      trace({ type: 'algebraic:error', step, error: e.message });
      results.push({ error: e.message });
    }
  }
  
  return results.length === 1 ? results[0] : results;
}

// ============================================================================
// Common Tag Sequences (Pre-compiled Macros)
// ============================================================================

export const CommonSequences = Object.freeze({
  // Full research flow
  RESEARCH_FULL: 'I(A(R(O(K))))',
  
  // Quick search
  SEARCH_QUICK: 'S',
  
  // Research with fallback to web
  RESEARCH_FALLBACK: 'R/FS',
  
  // Parallel research + search + knowledge
  PARALLEL_GATHER: '[R,S,K]',
  
  // SOP Gate flow
  SOP_FLOW: 'O→A→D→X→V',
  
  // Benchmark with 3 repetitions
  BENCHMARK_3X: 'B^3',
  
  // Model selection and configuration
  MODEL_SELECT: 'M→MS→C',
  
  // Job status with result verification
  JOB_VERIFY: 'L→V',
  
  // Research history list
  HISTORY: 'LJ'
});

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  VowelOperators,
  ConsonantAnchors,
  TagToToolMap,
  TagParameterTemplates,
  parseTagExpression,
  executeTagExpression,
  CommonSequences
};

