/**
 * Semantic Borrow Checker - Rust-inspired error diagnostics
 *
 * Provides actionable error messages that guide users to correct tool usage.
 * Detects common mistakes like ID type confusion and suggests fixes.
 */

/**
 * ID format patterns for recognition
 */
const ID_PATTERNS = {
  JOB_ID: {
    pattern: /^job_\d+_[a-z0-9]{6,}$/i,
    description: 'Job ID (format: job_<timestamp>_<random>)',
    example: 'job_1733765432123_a1b2c3',
    domain: 'job'
  },
  REPORT_ID: {
    pattern: /^\d+$/,
    description: 'Numeric report ID',
    example: '5',
    domain: 'report'
  },
  SESSION_ID: {
    pattern: /^[a-zA-Z0-9_-]+$/,
    description: 'Session identifier',
    example: 'default',
    domain: 'session'
  },
  GRAPH_NODE: {
    pattern: /^(report|doc):\d+$/,
    description: 'Graph node reference',
    example: 'report:5',
    domain: 'graph'
  }
};

/**
 * Detect what type of ID the user provided
 * @param {string} value - The value to analyze
 * @returns {string} The detected ID type: 'job_id', 'report_id', 'session_id', 'graph_node', or 'unknown'
 */
function detectIdType(value) {
  if (!value || typeof value !== 'string') return 'unknown';

  if (ID_PATTERNS.JOB_ID.pattern.test(value)) return 'job_id';
  if (ID_PATTERNS.GRAPH_NODE.pattern.test(value)) return 'graph_node';
  if (ID_PATTERNS.REPORT_ID.pattern.test(value)) return 'report_id';
  // Session ID is a broad pattern, only use as fallback
  if (value.length < 50 && ID_PATTERNS.SESSION_ID.pattern.test(value)) return 'session_id';

  return 'unknown';
}

/**
 * Diagnostic context for rich error formatting
 */
class DiagnosticContext {
  constructor(toolName, params = {}) {
    this.toolName = toolName;
    this.providedParams = params;
    this.timestamp = new Date().toISOString();
    this.hints = [];
    this.fixes = [];
    this.relatedTools = [];
    this.detectedTypes = {};
  }

  /**
   * Add a contextual hint
   */
  addHint(hint) {
    this.hints.push(hint);
    return this;
  }

  /**
   * Add a fix suggestion with optional example
   */
  addFix(description, example = null) {
    this.fixes.push({ description, example });
    return this;
  }

  /**
   * Suggest a related tool
   */
  addRelatedTool(toolName, reason) {
    this.relatedTools.push({ toolName, reason });
    return this;
  }

  /**
   * Detect and record the type of a parameter value
   */
  detectParamType(paramName, value) {
    const detected = detectIdType(value);
    this.detectedTypes[paramName] = detected;
    return detected;
  }
}

/**
 * Infer error category from error message or type
 */
function inferErrorCategory(error, ctx) {
  const msg = (error.message || '').toLowerCase();

  if (msg.includes('required')) return 'Missing Parameter';
  if (msg.includes('invalid') && msg.includes('format')) return 'Invalid Format';
  if (msg.includes('not found')) return 'Not Found';
  if (msg.includes('type') || msg.includes('mismatch')) return 'Type Mismatch';
  if (msg.includes('timeout')) return 'Timeout';

  return 'Error';
}

/**
 * Get expected format description for a tool's parameter
 */
function getExpectedFormat(toolName, paramName) {
  const expectations = {
    get_report: {
      reportId: ID_PATTERNS.REPORT_ID.description,
      id: ID_PATTERNS.REPORT_ID.description
    },
    job_status: {
      job_id: ID_PATTERNS.JOB_ID.description,
      id: ID_PATTERNS.JOB_ID.description
    },
    task_result: {
      job_id: ID_PATTERNS.JOB_ID.description,
      taskId: ID_PATTERNS.JOB_ID.description
    },
    task_get: {
      job_id: ID_PATTERNS.JOB_ID.description,
      taskId: ID_PATTERNS.JOB_ID.description
    },
    graph_traverse: {
      startNode: ID_PATTERNS.GRAPH_NODE.description
    }
  };

  return expectations[toolName]?.[paramName] || null;
}

/**
 * Generate ID mismatch guidance when wrong ID type is used
 */
function generateIdMismatchGuidance(providedId, expectedType, ctx) {
  const detected = detectIdType(providedId);

  // Job ID provided where Report ID expected
  if (detected === 'job_id' && expectedType === 'report') {
    ctx.addHint('You provided a Job ID, but this tool expects a Report ID');
    ctx.addHint('Report IDs are integers returned when a job completes');
    ctx.addFix(
      'First check job status to get the report ID',
      `job_status({ job_id: "${providedId}" }) -> extract reportId from response`
    );
    ctx.addRelatedTool('job_status', 'Get reportId from completed job');
    return true;
  }

  // Report ID provided where Job ID expected
  if (detected === 'report_id' && expectedType === 'job') {
    ctx.addHint('You provided a Report ID, but this tool expects a Job ID');
    ctx.addFix(
      'Use the job_id returned from research() or batch_research()',
      `get_report({ reportId: "${providedId}" }) // For report access`
    );
    ctx.addRelatedTool('get_report', 'Use this tool for report IDs');
    return true;
  }

  return false;
}

/**
 * Format provided parameters for display
 */
function formatProvidedParams(params) {
  if (!params || Object.keys(params).length === 0) return '(none)';

  return Object.entries(params)
    .filter(([_, v]) => v !== undefined)
    .map(([k, v]) => {
      const truncated = String(v).length > 50 ? String(v).slice(0, 47) + '...' : String(v);
      return `${k} = "${truncated}"`;
    })
    .join(', ');
}

/**
 * Format error with Rust-style diagnostics
 *
 * @param {string} toolName - The tool that errored
 * @param {Error} error - The underlying error
 * @param {DiagnosticContext} ctx - Diagnostic context
 * @returns {string} Formatted error message
 */
function formatSemanticError(toolName, error, ctx) {
  const lines = [];
  const category = inferErrorCategory(error, ctx);

  // Header
  lines.push(`Error ${toolName}: ${category}`);

  // What was provided
  if (ctx.providedParams && Object.keys(ctx.providedParams).length > 0) {
    lines.push(`  |-- Provided: ${formatProvidedParams(ctx.providedParams)}`);
  }

  // Detected ID types (if any mismatch detected)
  for (const [param, detectedType] of Object.entries(ctx.detectedTypes)) {
    if (detectedType !== 'unknown') {
      lines.push(`  |-- Detected: ${param} appears to be a ${detectedType}`);
    }
  }

  // Reason for failure
  lines.push(`  |-- Reason: ${error.message}`);

  // Hints
  for (const hint of ctx.hints) {
    lines.push(`  |-- Hint: ${hint}`);
  }

  // Related tools
  for (const { toolName: relTool, reason } of ctx.relatedTools) {
    lines.push(`  |-- Related: ${relTool} - ${reason}`);
  }

  // Fix suggestions
  for (const fix of ctx.fixes) {
    lines.push(`  +-- Fix: ${fix.description}`);
    if (fix.example) {
      lines.push(`      ${fix.example}`);
    }
  }

  return lines.join('\n');
}

/**
 * Create diagnostic context and run tool-specific validation
 */
function createDiagnosticContext(toolName, params) {
  const ctx = new DiagnosticContext(toolName, params);

  // Detect ID types in common parameters
  const idParams = ['reportId', 'report_id', 'id', 'job_id', 'jobId', 'taskId', 'task_id'];
  for (const param of idParams) {
    if (params[param]) {
      ctx.detectParamType(param, params[param]);
    }
  }

  return ctx;
}

/**
 * Tool-specific validators with rich diagnostic context
 */
const TOOL_VALIDATORS = {
  get_report: {
    validate(params, ctx) {
      const reportId = params.reportId || params.id || params.report_id;

      if (!reportId) {
        ctx.addHint('reportId parameter is required');
        ctx.addFix('Provide the numeric report ID from a completed job', 'get_report({ reportId: "5" })');
        ctx.addRelatedTool('history', 'List available report IDs');
        return { error: 'reportId is required' };
      }

      // Check if user passed a job_id instead of report_id
      const detected = detectIdType(reportId);
      if (detected === 'job_id') {
        generateIdMismatchGuidance(reportId, 'report', ctx);
        return { error: `Invalid report ID format: "${reportId}" appears to be a Job ID` };
      }

      // Validate numeric format
      if (!/^\d+$/.test(String(reportId))) {
        ctx.addHint('Report IDs are numeric (e.g., "5", "42")');
        ctx.addRelatedTool('history', 'List available reports with their IDs');
        return { error: `Invalid report ID format: ${reportId}` };
      }

      return { valid: true, normalized: { reportId: String(reportId) } };
    }
  },

  job_status: {
    validate(params, ctx) {
      const jobId = params.job_id || params.id || params.jobId || params.taskId;

      if (!jobId) {
        ctx.addHint('job_id parameter is required');
        ctx.addFix('Provide the job_id returned from research()', 'job_status({ job_id: "job_1733765432123_a1b2c3" })');
        return { error: 'job_id is required' };
      }

      // Check if user passed a report_id instead of job_id
      const detected = detectIdType(jobId);
      if (detected === 'report_id') {
        generateIdMismatchGuidance(jobId, 'job', ctx);
        return { error: `"${jobId}" appears to be a Report ID, not a Job ID` };
      }

      return { valid: true };
    }
  },

  task_result: {
    validate(params, ctx) {
      const jobId = params.job_id || params.taskId || params.id;

      if (!jobId) {
        ctx.addHint('job_id or taskId parameter is required');
        ctx.addHint('Note: taskId is accepted for MCP Task Protocol compatibility');
        ctx.addFix('Provide the job ID from an async research operation', 'task_result({ job_id: "job_xxx" })');
        return { error: 'job_id is required (taskId also accepted)' };
      }

      return { valid: true };
    }
  }
};

/**
 * Validate parameters for a tool and return diagnostic result
 */
function validateWithDiagnostics(toolName, params) {
  const ctx = createDiagnosticContext(toolName, params);
  const validator = TOOL_VALIDATORS[toolName];

  if (!validator) {
    return { valid: true, ctx };
  }

  const result = validator.validate(params, ctx);

  if (result.error) {
    return { valid: false, error: result.error, ctx };
  }

  return { valid: true, normalized: result.normalized, ctx };
}

module.exports = {
  DiagnosticContext,
  detectIdType,
  formatSemanticError,
  createDiagnosticContext,
  validateWithDiagnostics,
  generateIdMismatchGuidance,
  getExpectedFormat,
  ID_PATTERNS,
  TOOL_VALIDATORS
};
