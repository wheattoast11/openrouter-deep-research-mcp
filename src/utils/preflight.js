/**
 * Pre-flight Checks for OpenRouter Agents MCP Server
 * Validates system readiness before expensive operations.
 */

const config = require('../../config');
const { MCPError, ErrorCategory, ConfigurationError } = require('./errors');

/**
 * Pre-flight check results aggregator
 */
class PreflightResult {
  constructor() {
    this.passed = true;
    this.checks = [];
    this.errors = [];
    this.warnings = [];
  }

  addCheck(name, result, isFatal = true) {
    const check = {
      name,
      passed: result.passed,
      message: result.message || (result.passed ? 'OK' : 'Failed')
    };
    this.checks.push(check);

    if (!result.passed) {
      if (isFatal) {
        this.passed = false;
        this.errors.push({ name, message: check.message });
      } else {
        this.warnings.push({ name, message: check.message });
      }
    }
    return this;
  }

  toError() {
    if (this.passed) return null;
    const messages = this.errors.map(e => `${e.name}: ${e.message}`).join('; ');
    return new MCPError(`Pre-flight checks failed: ${messages}`, {
      category: ErrorCategory.CONFIGURATION,
      code: 'PREFLIGHT_FAILED',
      isRetryable: false,
      context: { checks: this.checks, errors: this.errors, warnings: this.warnings }
    });
  }

  toJSON() {
    return {
      passed: this.passed,
      checks: this.checks,
      errors: this.errors,
      warnings: this.warnings
    };
  }
}

/**
 * Readiness states for system components
 */
const ReadinessState = {
  NOT_STARTED: 'not_started',
  INITIALIZING: 'initializing',
  READY: 'ready',
  DEGRADED: 'degraded',
  FAILED: 'failed'
};

// ============================================================================
// AGENT ZERO TYPE SYSTEM - Interface Domain Taxonomy
// MECE: Mutually Exclusive, Collectively Exhaustive
// Enables composition validation: A @ B valid iff A.output ∈ B.inputs
// ============================================================================

/**
 * Data domains that cross tool interfaces
 * Every piece of data is exactly ONE of these (MECE)
 */
const Domain = {
  TEXT: 'TEXT',           // Natural language text
  STRUCTURED: 'STRUCTURED', // JSON, SQL results, structured objects
  VECTOR: 'VECTOR',       // Embeddings, similarity scores
  IMAGE: 'IMAGE',         // Visual data
  AUDIO: 'AUDIO',         // Sound data
  VOID: 'VOID'            // No meaningful output (side effects only)
};

/**
 * Tool roles in the processing pipeline
 * Every tool is exactly ONE of these (MECE)
 */
const Role = {
  PERCEPTION: 'PERCEPTION',   // Non-text → text (OCR, ASR, image analysis)
  REASONING: 'REASONING',     // Text → text (analysis, synthesis, planning)
  EXECUTION: 'EXECUTION',     // Text → action (API calls, mutations)
  EMBEDDING: 'EMBEDDING',     // Any → vector (semantic encoding)
  GENERATION: 'GENERATION',   // Text → non-text (TTS, image gen)
  RETRIEVAL: 'RETRIEVAL',     // Query → data (search, fetch)
  UTILITY: 'UTILITY'          // System operations (health, config)
};

/**
 * Tool categories for MECE organization
 */
const ToolCategory = {
  RESEARCH: 'RESEARCH',
  KNOWLEDGE: 'KNOWLEDGE',
  GRAPH: 'GRAPH',
  SESSION: 'SESSION',
  JOB: 'JOB',
  UTILITY: 'UTILITY',
  SAMPLING: 'SAMPLING'
};

/**
 * Tool requirements map - defines what each tool needs and its interface contract
 * Extended with Agent Zero type system:
 * - inputs: Array of Domain types accepted
 * - output: Single Domain type produced
 * - role: The tool's role in processing
 * - category: MECE categorization
 */
const ToolRequirements = {
  // ========== RESEARCH TOOLS ==========
  research: {
    db: true, embedder: false, apiKey: true,
    inputs: [Domain.TEXT], output: Domain.STRUCTURED,
    role: Role.REASONING, category: ToolCategory.RESEARCH
  },
  research_follow_up: {
    db: true, embedder: false, apiKey: true,
    inputs: [Domain.TEXT, Domain.STRUCTURED], output: Domain.STRUCTURED,
    role: Role.REASONING, category: ToolCategory.RESEARCH
  },
  agent: {
    db: true, embedder: false, apiKey: true,
    inputs: [Domain.TEXT, Domain.STRUCTURED], output: Domain.STRUCTURED,
    role: Role.REASONING, category: ToolCategory.RESEARCH
  },

  // ========== KNOWLEDGE BASE TOOLS ==========
  query: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.TEXT], output: Domain.STRUCTURED,
    role: Role.RETRIEVAL, category: ToolCategory.KNOWLEDGE
  },
  retrieve: {
    db: true, embedder: 'optional', apiKey: false,
    inputs: [Domain.TEXT], output: Domain.STRUCTURED,
    role: Role.RETRIEVAL, category: ToolCategory.KNOWLEDGE
  },
  search: {
    db: true, embedder: 'optional', apiKey: false,
    inputs: [Domain.TEXT], output: Domain.STRUCTURED,
    role: Role.RETRIEVAL, category: ToolCategory.KNOWLEDGE
  },
  get_report: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.TEXT], output: Domain.TEXT,
    role: Role.RETRIEVAL, category: ToolCategory.KNOWLEDGE
  },
  history: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.VOID], output: Domain.STRUCTURED,
    role: Role.RETRIEVAL, category: ToolCategory.KNOWLEDGE
  },

  // ========== GRAPH TOOLS ==========
  graph_traverse: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.TEXT], output: Domain.STRUCTURED,
    role: Role.RETRIEVAL, category: ToolCategory.GRAPH
  },
  graph_path: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.TEXT], output: Domain.STRUCTURED,
    role: Role.RETRIEVAL, category: ToolCategory.GRAPH
  },
  graph_clusters: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.VOID], output: Domain.STRUCTURED,
    role: Role.RETRIEVAL, category: ToolCategory.GRAPH
  },
  graph_pagerank: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.VOID], output: Domain.STRUCTURED,
    role: Role.RETRIEVAL, category: ToolCategory.GRAPH
  },
  graph_patterns: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.VOID], output: Domain.STRUCTURED,
    role: Role.RETRIEVAL, category: ToolCategory.GRAPH
  },
  graph_stats: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.VOID], output: Domain.STRUCTURED,
    role: Role.RETRIEVAL, category: ToolCategory.GRAPH
  },

  // ========== SESSION/TIME-TRAVEL TOOLS ==========
  undo: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.VOID], output: Domain.STRUCTURED,
    role: Role.EXECUTION, category: ToolCategory.SESSION
  },
  redo: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.VOID], output: Domain.STRUCTURED,
    role: Role.EXECUTION, category: ToolCategory.SESSION
  },
  fork_session: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.TEXT], output: Domain.STRUCTURED,
    role: Role.EXECUTION, category: ToolCategory.SESSION
  },
  time_travel: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.TEXT], output: Domain.STRUCTURED,
    role: Role.EXECUTION, category: ToolCategory.SESSION
  },
  session_state: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.VOID], output: Domain.STRUCTURED,
    role: Role.RETRIEVAL, category: ToolCategory.SESSION
  },
  checkpoint: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.TEXT], output: Domain.STRUCTURED,
    role: Role.EXECUTION, category: ToolCategory.SESSION
  },

  // ========== JOB TOOLS ==========
  job_status: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.TEXT], output: Domain.STRUCTURED,
    role: Role.RETRIEVAL, category: ToolCategory.JOB
  },
  cancel_job: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.TEXT], output: Domain.STRUCTURED,
    role: Role.EXECUTION, category: ToolCategory.JOB
  },
  // task_* tools (SEP-1686) share requirements with job_* tools
  task_get: { db: true, embedder: false, apiKey: false, inputs: [Domain.TEXT], output: Domain.STRUCTURED, role: Role.RETRIEVAL, category: ToolCategory.JOB },
  task_result: { db: true, embedder: false, apiKey: false, inputs: [Domain.TEXT], output: Domain.STRUCTURED, role: Role.RETRIEVAL, category: ToolCategory.JOB },
  task_list: { db: true, embedder: false, apiKey: false, inputs: [Domain.VOID], output: Domain.STRUCTURED, role: Role.RETRIEVAL, category: ToolCategory.JOB },
  task_cancel: { db: true, embedder: false, apiKey: false, inputs: [Domain.TEXT], output: Domain.STRUCTURED, role: Role.EXECUTION, category: ToolCategory.JOB },

  // ========== UTILITY TOOLS ==========
  ping: {
    db: false, embedder: false, apiKey: false,
    inputs: [Domain.VOID], output: Domain.STRUCTURED,
    role: Role.UTILITY, category: ToolCategory.UTILITY
  },
  get_server_status: {
    db: false, embedder: false, apiKey: false,
    inputs: [Domain.VOID], output: Domain.STRUCTURED,
    role: Role.UTILITY, category: ToolCategory.UTILITY
  },
  date_time: {
    db: false, embedder: false, apiKey: false,
    inputs: [Domain.VOID], output: Domain.STRUCTURED,
    role: Role.UTILITY, category: ToolCategory.UTILITY
  },
  calc: {
    db: false, embedder: false, apiKey: false,
    inputs: [Domain.TEXT], output: Domain.STRUCTURED,
    role: Role.UTILITY, category: ToolCategory.UTILITY
  },
  list_tools: {
    db: false, embedder: false, apiKey: false,
    inputs: [Domain.VOID], output: Domain.STRUCTURED,
    role: Role.UTILITY, category: ToolCategory.UTILITY
  },
  search_tools: {
    db: false, embedder: false, apiKey: false,
    inputs: [Domain.TEXT], output: Domain.STRUCTURED,
    role: Role.UTILITY, category: ToolCategory.UTILITY
  },

  // ========== SAMPLING/ELICITATION ==========
  sample_message: {
    db: false, embedder: false, apiKey: true,
    inputs: [Domain.STRUCTURED], output: Domain.TEXT,
    role: Role.REASONING, category: ToolCategory.SAMPLING
  },
  elicitation_respond: {
    db: true, embedder: false, apiKey: false,
    inputs: [Domain.STRUCTURED], output: Domain.STRUCTURED,
    role: Role.EXECUTION, category: ToolCategory.SAMPLING
  }
};

/**
 * Validate if two tools can be composed: A → B
 * Returns true iff A.output ∈ B.inputs (Agent Zero composition rule)
 * @param {string} toolA - First tool name
 * @param {string} toolB - Second tool name
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateComposition(toolA, toolB) {
  const specA = ToolRequirements[toolA];
  const specB = ToolRequirements[toolB];

  if (!specA) return { valid: false, reason: `Unknown tool: ${toolA}` };
  if (!specB) return { valid: false, reason: `Unknown tool: ${toolB}` };

  if (!specA.output || !specB.inputs) {
    return { valid: true, reason: 'Legacy tool without domain spec' };
  }

  const outputDomain = specA.output;
  const inputDomains = specB.inputs;

  if (inputDomains.includes(Domain.VOID)) {
    return { valid: true, reason: 'Target accepts VOID (no input required)' };
  }

  if (inputDomains.includes(outputDomain)) {
    return { valid: true, reason: `${outputDomain} → ${inputDomains.join('|')}` };
  }

  return {
    valid: false,
    reason: `Domain mismatch: ${toolA} outputs ${outputDomain}, but ${toolB} accepts ${inputDomains.join('|')}`
  };
}

/**
 * Get all tools by category
 * @param {string} category - Category from ToolCategory enum
 * @returns {string[]} Array of tool names
 */
function getToolsByCategory(category) {
  return Object.entries(ToolRequirements)
    .filter(([_, spec]) => spec.category === category)
    .map(([name]) => name);
}

/**
 * Get all tools by role
 * @param {string} role - Role from Role enum
 * @returns {string[]} Array of tool names
 */
function getToolsByRole(role) {
  return Object.entries(ToolRequirements)
    .filter(([_, spec]) => spec.role === role)
    .map(([name]) => name);
}

/**
 * System state singleton - tracks component readiness
 */
class SystemState {
  constructor() {
    this.components = {
      db: { state: ReadinessState.NOT_STARTED, error: null, lastCheck: null },
      embedder: { state: ReadinessState.NOT_STARTED, error: null, lastCheck: null },
      apiKey: { state: ReadinessState.NOT_STARTED, error: null, lastCheck: null }
    };
    this.lastSync = null;
  }

  /**
   * Update component state
   */
  setComponentState(component, state, error = null) {
    if (this.components[component]) {
      this.components[component] = {
        state,
        error,
        lastCheck: new Date().toISOString()
      };
    }
  }

  /**
   * Check if component is usable (ready or degraded)
   */
  isUsable(component) {
    const comp = this.components[component];
    return comp && (comp.state === ReadinessState.READY || comp.state === ReadinessState.DEGRADED);
  }

  /**
   * Check if component is fully ready
   */
  isReady(component) {
    const comp = this.components[component];
    return comp && comp.state === ReadinessState.READY;
  }

  /**
   * Check requirements for a specific tool
   * @returns {{ met: boolean, missing: string[], degraded: string[] }}
   */
  checkRequirements(toolName) {
    const reqs = ToolRequirements[toolName];
    if (!reqs) {
      // Unknown tool - assume no requirements
      return { met: true, missing: [], degraded: [] };
    }

    const missing = [];
    const degraded = [];

    // Check database requirement
    if (reqs.db === true && !this.isUsable('db')) {
      missing.push('database');
    }

    // Check embedder requirement
    if (reqs.embedder === true && !this.isReady('embedder')) {
      missing.push('embedder');
    } else if (reqs.embedder === 'optional' && !this.isReady('embedder')) {
      degraded.push('embedder');
    }

    // Check API key requirement
    if (reqs.apiKey === true && !this.isReady('apiKey')) {
      missing.push('apiKey');
    }

    return {
      met: missing.length === 0,
      missing,
      degraded
    };
  }

  /**
   * Export state as JSON for API responses
   */
  toJSON() {
    return {
      components: this.components,
      lastSync: this.lastSync,
      overall: this.isUsable('db') ?
        (this.isReady('embedder') ? 'ready' : 'degraded') :
        'not_ready'
    };
  }
}

// Singleton instance
const systemState = new SystemState();

/**
 * Sync system state from dbClient
 */
function syncSystemState(dbClient) {
  // Check API key
  const apiCheck = checkAPIKey();
  systemState.setComponentState(
    'apiKey',
    apiCheck.passed ? ReadinessState.READY : ReadinessState.FAILED,
    apiCheck.passed ? null : apiCheck.message
  );

  // Check database
  if (dbClient) {
    // Use getInitState if available (new state machine)
    if (typeof dbClient.getInitState === 'function') {
      const initState = dbClient.getInitState();
      const stateMap = {
        'NOT_STARTED': ReadinessState.NOT_STARTED,
        'INITIALIZING': ReadinessState.INITIALIZING,
        'INITIALIZED': ReadinessState.READY,
        'FAILED': ReadinessState.FAILED
      };
      const dbState = stateMap[initState] || ReadinessState.NOT_STARTED;
      const dbError = typeof dbClient.getInitError === 'function' ? dbClient.getInitError() : null;
      systemState.setComponentState('db', dbState, dbError?.message || null);
    } else {
      // Fallback to legacy check
      const dbCheck = checkDatabase(dbClient);
      systemState.setComponentState(
        'db',
        dbCheck.passed ? ReadinessState.READY : ReadinessState.FAILED,
        dbCheck.passed ? null : dbCheck.message
      );
    }

    // Check embedder
    const embedCheck = checkEmbedder(dbClient);
    systemState.setComponentState(
      'embedder',
      embedCheck.passed ? ReadinessState.READY : ReadinessState.NOT_STARTED,
      embedCheck.passed ? null : embedCheck.message
    );
  } else {
    systemState.setComponentState('db', ReadinessState.NOT_STARTED, 'No dbClient provided');
    systemState.setComponentState('embedder', ReadinessState.NOT_STARTED, 'No dbClient provided');
  }

  systemState.lastSync = new Date().toISOString();
  return systemState;
}

/**
 * Run preflight check for a specific tool
 * @returns {{ passed: boolean, error?: Error, warnings?: string[] }}
 */
function preflightForTool(toolName, dbClient) {
  // Sync state first
  syncSystemState(dbClient);

  // Check requirements
  const reqCheck = systemState.checkRequirements(toolName);

  if (!reqCheck.met) {
    const missingStr = reqCheck.missing.join(', ');
    return {
      passed: false,
      error: new MCPError(`Tool "${toolName}" requires: ${missingStr}`, {
        category: ErrorCategory.CONFIGURATION,
        code: 'PREFLIGHT_FAILED',
        isRetryable: reqCheck.missing.includes('embedder'), // Embedder may become ready
        context: {
          tool: toolName,
          missing: reqCheck.missing,
          systemState: systemState.toJSON()
        }
      }),
      warnings: reqCheck.degraded.length > 0 ?
        [`Degraded functionality: ${reqCheck.degraded.join(', ')} not available`] : []
    };
  }

  return {
    passed: true,
    warnings: reqCheck.degraded.length > 0 ?
      [`Degraded functionality: ${reqCheck.degraded.join(', ')} not available`] : []
  };
}

/**
 * Check if OpenRouter API key is configured
 */
function checkAPIKey() {
  const apiKey = config.openrouter?.apiKey;

  if (!apiKey) {
    return {
      passed: false,
      message: 'OPENROUTER_API_KEY environment variable is not set'
    };
  }

  // Basic format validation (OpenRouter keys start with sk-or-)
  if (!apiKey.startsWith('sk-or-')) {
    return {
      passed: false,
      message: 'OPENROUTER_API_KEY does not appear to be a valid OpenRouter key (should start with sk-or-)'
    };
  }

  // Check minimum length
  if (apiKey.length < 20) {
    return {
      passed: false,
      message: 'OPENROUTER_API_KEY appears to be too short'
    };
  }

  return { passed: true, message: 'API key configured' };
}

/**
 * Check database initialization
 */
function checkDatabase(dbClient) {
  if (!dbClient) {
    return {
      passed: false,
      message: 'Database client not available'
    };
  }

  const initialized = typeof dbClient.isDbInitialized === 'function'
    ? dbClient.isDbInitialized()
    : false;

  if (!initialized) {
    return {
      passed: false,
      message: 'Database is not initialized. Check PGLITE_DATA_DIR permissions or wait for initialization.'
    };
  }

  return { passed: true, message: 'Database initialized' };
}

/**
 * Check embedder readiness (non-fatal by default)
 */
function checkEmbedder(dbClient) {
  if (!dbClient) {
    return {
      passed: false,
      message: 'Database client not available for embedder check'
    };
  }

  const ready = typeof dbClient.isEmbedderReady === 'function'
    ? dbClient.isEmbedderReady()
    : false;

  return {
    passed: ready,
    message: ready ? 'Embedder ready' : 'Embedder not yet initialized (semantic search may be limited)'
  };
}

/**
 * Check model configuration
 */
function checkModels() {
  const { highCost, lowCost, planning } = config.models || {};

  if (!planning) {
    return {
      passed: false,
      message: 'No planning model configured in config.models.planning'
    };
  }

  const totalModels = (highCost?.length || 0) + (lowCost?.length || 0);
  if (totalModels === 0) {
    return {
      passed: false,
      message: 'No research models configured (highCost and lowCost are both empty)'
    };
  }

  return { passed: true, message: `${totalModels} research models configured` };
}

/**
 * Run all pre-flight checks for research operations
 */
async function runResearchPreflight(dbClient, options = {}) {
  const result = new PreflightResult();

  // API Key check (fatal)
  const apiCheck = checkAPIKey();
  result.addCheck('API Key', apiCheck, true);

  // Database check (fatal)
  const dbCheck = checkDatabase(dbClient);
  result.addCheck('Database', dbCheck, true);

  // Embedder check (warning only - research can proceed without)
  const embedCheck = checkEmbedder(dbClient);
  result.addCheck('Embedder', embedCheck, false);

  // Model check (fatal)
  const modelCheck = checkModels();
  result.addCheck('Models', modelCheck, true);

  // Optional: Test API connectivity (if requested)
  if (options.testConnectivity) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${config.openrouter?.apiKey}`,
          'HTTP-Referer': 'http://localhost:3002'
        },
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        result.addCheck('API Connectivity', { passed: true, message: 'OpenRouter API reachable' }, true);
      } else if (response.status === 401 || response.status === 403) {
        result.addCheck('API Connectivity', { passed: false, message: `API key rejected: HTTP ${response.status}` }, true);
      } else {
        result.addCheck('API Connectivity', { passed: false, message: `OpenRouter returned HTTP ${response.status}` }, false);
      }
    } catch (e) {
      result.addCheck('API Connectivity', { passed: false, message: `Cannot reach OpenRouter: ${e.message}` }, false);
    }
  }

  return result;
}

/**
 * Quick synchronous check for common issues (for job worker loop)
 */
function quickCheck(dbClient) {
  const issues = [];

  // Check API key
  if (!config.openrouter?.apiKey) {
    issues.push('Missing OPENROUTER_API_KEY');
  }

  // Check database
  if (dbClient && typeof dbClient.isDbInitialized === 'function' && !dbClient.isDbInitialized()) {
    issues.push('Database not initialized');
  }

  return {
    ready: issues.length === 0,
    issues
  };
}

/**
 * Get full system status (for health endpoints)
 */
function getSystemStatus(dbClient) {
  const apiCheck = checkAPIKey();
  const dbCheck = checkDatabase(dbClient);
  const embedCheck = checkEmbedder(dbClient);
  const modelCheck = checkModels();

  const allPassed = apiCheck.passed && dbCheck.passed && modelCheck.passed;

  return {
    healthy: allPassed,
    checks: {
      apiKey: apiCheck,
      database: dbCheck,
      embedder: embedCheck,
      models: modelCheck
    },
    warnings: !embedCheck.passed ? [embedCheck.message] : []
  };
}

module.exports = {
  // Classes
  PreflightResult,
  SystemState,

  // Enums/Constants
  ReadinessState,
  ToolRequirements,

  // Agent Zero Type System
  Domain,
  Role,
  ToolCategory,

  // Singleton
  systemState,

  // Individual checks
  checkAPIKey,
  checkDatabase,
  checkEmbedder,
  checkModels,

  // Composite checks
  runResearchPreflight,
  quickCheck,
  getSystemStatus,

  // New preflight system
  syncSystemState,
  preflightForTool,

  // Composition validation
  validateComposition,
  getToolsByCategory,
  getToolsByRole
};
