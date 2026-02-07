/**
 * Response Envelope
 *
 * Structured wrapper for all tool responses optimized for LLM consumption.
 * Provides consistent structure with:
 * - Clear next action guidance
 * - Confidence metadata
 * - Terminal state indicators
 */

/**
 * ResponseEnvelope wraps tool results with metadata and action guidance
 */
class ResponseEnvelope {
  /**
   * @param {*} result - The primary result payload
   * @param {Object} options - Envelope configuration
   * @param {Array} options.nextActions - Suggested follow-up actions
   * @param {number} options.confidence - Overall confidence score (0-1)
   * @param {string} options.consensusSource - Model that provided consensus
   * @param {number} options.signalCount - Number of contributing signals
   * @param {Array} options.warnings - Warning messages
   * @param {number} options.processingTime - Processing duration in ms
   * @param {string} options.phase - Current phase (planning|researching|synthesizing|complete|error)
   * @param {boolean} options.isTerminal - Whether this is a terminal state
   * @param {boolean} options.requiresAction - Whether LLM needs to take action
   */
  constructor(result, options = {}) {
    this.result = result;
    this.nextActions = options.nextActions || [];
    this.meta = {
      confidence: options.confidence ?? null,
      consensusSource: options.consensusSource ?? null,
      signalCount: options.signalCount ?? null,
      warnings: options.warnings || [],
      processingTime: options.processingTime ?? null
    };
    this.status = {
      phase: options.phase || 'complete',
      isTerminal: options.isTerminal ?? true,
      requiresAction: options.requiresAction ?? false
    };
  }

  /**
   * Add an action to the suggestions list
   * @param {string} action - Tool name to call
   * @param {Object} params - Parameters for the tool
   * @param {string} reason - Why this action is suggested
   * @param {string} priority - 'primary' | 'secondary' | 'optional'
   * @returns {ResponseEnvelope} this (for chaining)
   */
  addAction(action, params, reason, priority = 'secondary') {
    this.nextActions.push({ action, params, reason, priority });
    return this;
  }

  /**
   * Set the primary (first) action, replacing any existing primary
   * @param {string} action - Tool name
   * @param {Object} params - Parameters
   * @param {string} reason - Explanation
   * @returns {ResponseEnvelope} this
   */
  setPrimaryAction(action, params, reason) {
    this.nextActions = this.nextActions.filter(a => a.priority !== 'primary');
    this.nextActions.unshift({ action, params, reason, priority: 'primary' });
    return this;
  }

  /**
   * Add a warning message
   * @param {string} warning - Warning text
   * @returns {ResponseEnvelope} this
   */
  addWarning(warning) {
    this.meta.warnings.push(warning);
    return this;
  }

  /**
   * Set confidence metadata
   * @param {number} confidence - Confidence score (0-1)
   * @param {string} source - Model source
   * @param {number} signalCount - Number of signals
   * @returns {ResponseEnvelope} this
   */
  setConfidence(confidence, source = null, signalCount = null) {
    this.meta.confidence = confidence;
    this.meta.consensusSource = source;
    this.meta.signalCount = signalCount;
    return this;
  }

  /**
   * Set processing time
   * @param {number} ms - Milliseconds
   * @returns {ResponseEnvelope} this
   */
  setProcessingTime(ms) {
    this.meta.processingTime = ms;
    return this;
  }

  /**
   * Convert to JSON, removing null/empty fields for cleaner output
   * @returns {Object} Clean JSON representation
   */
  toJSON() {
    // Clean meta: remove null values and empty arrays
    const cleanMeta = {};
    for (const [key, value] of Object.entries(this.meta)) {
      if (value != null && (!Array.isArray(value) || value.length > 0)) {
        cleanMeta[key] = value;
      }
    }

    const output = {
      result: this.result,
      status: this.status
    };

    if (this.nextActions.length > 0) {
      output.nextActions = this.nextActions;
    }

    if (Object.keys(cleanMeta).length > 0) {
      output.meta = cleanMeta;
    }

    return output;
  }
}

/**
 * Factory functions for common response patterns
 */
const Responses = {
  /**
   * Job completed successfully
   */
  jobComplete(jobId, reportId, processingTime = null) {
    const envelope = new ResponseEnvelope(
      { job_id: jobId, status: 'completed', reportId },
      { phase: 'complete', isTerminal: true, requiresAction: false, processingTime }
    );
    if (reportId) {
      envelope.setPrimaryAction('get_report', { reportId }, 'Retrieve completed research report');
    }
    return envelope;
  },

  /**
   * Job still running
   */
  jobRunning(jobId, progress, estimatedMs = null) {
    const envelope = new ResponseEnvelope(
      { job_id: jobId, status: 'running', progress },
      { phase: 'researching', isTerminal: false, requiresAction: true }
    );
    if (estimatedMs) {
      envelope.meta.estimatedCompletionMs = estimatedMs;
    }
    envelope.setPrimaryAction(
      'job_status',
      { job_id: jobId, format: 'compact' },
      `Poll for completion (${progress}% done)`
    );
    envelope.addAction('cancel_job', { job_id: jobId }, 'Cancel if no longer needed', 'optional');
    return envelope;
  },

  /**
   * Job queued
   */
  jobQueued(jobId, position = null) {
    const envelope = new ResponseEnvelope(
      { job_id: jobId, status: 'queued', queue_position: position },
      { phase: 'queued', isTerminal: false, requiresAction: true }
    );
    envelope.setPrimaryAction(
      'job_status',
      { job_id: jobId, format: 'compact' },
      'Poll for job start'
    );
    return envelope;
  },

  /**
   * Job failed
   */
  jobFailed(jobId, error, isRetryable = false) {
    const envelope = new ResponseEnvelope(
      { job_id: jobId, status: 'failed', error },
      { phase: 'error', isTerminal: true, requiresAction: isRetryable }
    );
    if (isRetryable) {
      envelope.addAction('research', { query: '...', costPreference: 'low' }, 'Retry with lower cost models', 'primary');
    }
    return envelope;
  },

  /**
   * Search results
   */
  searchResults(results, query, topScore = null) {
    const envelope = new ResponseEnvelope(
      { results, resultCount: results.length, query },
      { phase: 'complete', isTerminal: true }
    );

    if (results.length > 0 && results[0].id) {
      envelope.setPrimaryAction(
        'get_report',
        { reportId: String(results[0].id) },
        `Top result${topScore ? ` (score: ${topScore.toFixed(2)})` : ''}`
      );
    } else {
      envelope.setPrimaryAction(
        'research',
        { query, costPreference: 'low' },
        'No relevant results - generate new research'
      );
    }

    if (topScore) {
      envelope.meta.topScore = topScore;
    }

    return envelope;
  },

  /**
   * Report retrieved
   */
  report(reportId, content, meta = {}) {
    const envelope = new ResponseEnvelope(
      { reportId, content, contentLength: content?.length || 0 },
      { phase: 'complete', isTerminal: true }
    );

    if (meta.confidence) {
      envelope.setConfidence(meta.confidence, meta.topModel, meta.signalCount);
    }

    if (meta.truncated) {
      envelope.addWarning(meta.truncationHint || 'Content truncated');
      envelope.addAction('get_report', { reportId, mode: 'full' }, 'Retrieve full content', 'secondary');
    }

    envelope.addAction(
      'research_follow_up',
      { originalQuery: meta.query || '', followUpQuestion: '' },
      'Ask clarifying questions',
      'optional'
    );

    return envelope;
  },

  /**
   * Error response with recovery guidance
   */
  error(message, code, category, recoveryActions = []) {
    const isRetryable = ['TIMEOUT', 'RATE_LIMIT', 'NETWORK'].includes(category);
    const envelope = new ResponseEnvelope(
      { error: true, message, code, category },
      {
        phase: 'error',
        isTerminal: !isRetryable,
        requiresAction: recoveryActions.length > 0
      }
    );

    for (const action of recoveryActions) {
      envelope.addAction(action.action, action.params, action.reason, action.priority || 'secondary');
    }

    return envelope;
  }
};

module.exports = {
  ResponseEnvelope,
  Responses
};
