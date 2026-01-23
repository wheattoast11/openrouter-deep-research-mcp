/**
 * Progress Notifier - Server-to-Client Push Notifications
 *
 * Implements MCP 2025-11-25 notifications/progress for real-time updates.
 * Supports both STDIO and SSE transports with graceful degradation.
 */

const taskAdapter = require('./taskAdapter');
const logger = require('../utils/logger');

/**
 * Research phases for structured progress reporting
 */
const PHASES = {
  PLANNING: 'planning',
  RESEARCHING: 'researching',
  SYNTHESIZING: 'synthesizing',
  COMPLETE: 'complete',
  ERROR: 'error'
};

/**
 * ProgressNotifier - Unified progress notification dispatch
 *
 * Usage:
 *   const notifier = new ProgressNotifier(exchange, jobId);
 *   await notifier.phaseStarted('planning', { query: '...' });
 *   await notifier.progress(25, 'Researching...', { current: 1, total: 4 });
 *   await notifier.complete(reportId, durationMs);
 */
class ProgressNotifier {
  /**
   * @param {Object} exchange - MCP exchange context with sendNotification capability
   * @param {string} jobId - Job identifier for this research task
   * @param {Object} options - Configuration options
   * @param {Object} options.dbClient - Database client for event persistence
   * @param {boolean} options.persistEvents - Whether to store events in job_events table
   */
  constructor(exchange, jobId, options = {}) {
    this.exchange = exchange;
    this.jobId = jobId;
    this.progressToken = exchange?._meta?.progressToken || jobId;
    this.enabled = !!(exchange?.sendNotification || exchange?.server?.notification);
    this.dbClient = options.dbClient || null;
    this.persistEvents = options.persistEvents !== false;
    this.startTime = Date.now();
    this.currentPhase = null;
    this.phaseProgress = 0;
  }

  /**
   * Send a progress notification
   * @param {string} eventType - Event type (e.g., 'phase_started:planning')
   * @param {Object} payload - Event payload
   */
  async notify(eventType, payload = {}) {
    const notification = taskAdapter.createTaskNotification(
      this.progressToken,
      eventType,
      {
        jobId: this.jobId,
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - this.startTime,
        phase: this.currentPhase,
        ...payload
      }
    );

    // Try MCP notification (STDIO or SSE transport)
    if (this.enabled) {
      try {
        if (this.exchange?.sendNotification) {
          await this.exchange.sendNotification(notification);
        } else if (this.exchange?.server?.notification) {
          await this.exchange.server.notification(notification);
        }
      } catch (err) {
        logger.warn('Failed to send MCP notification', {
          jobId: this.jobId,
          eventType,
          error: err.message
        });
      }
    }

    // Persist to job_events for SSE polling fallback
    if (this.persistEvents && this.dbClient?.appendJobEvent) {
      try {
        await this.dbClient.appendJobEvent(this.jobId, eventType, payload);
      } catch (_) {
        // Silently ignore persistence failures
      }
    }
  }

  /**
   * Notify phase started
   * @param {string} phase - Phase name from PHASES
   * @param {Object} data - Additional phase data
   */
  async phaseStarted(phase, data = {}) {
    this.currentPhase = phase;
    this.phaseProgress = 0;
    return this.notify(`phase_started:${phase}`, {
      phase,
      message: `Starting ${phase} phase`,
      ...data
    });
  }

  /**
   * Notify phase completed
   * @param {string} phase - Phase name from PHASES
   * @param {Object} data - Completion data (e.g., { agentCount })
   */
  async phaseComplete(phase, data = {}) {
    this.phaseProgress = 100;
    return this.notify(`phase_complete:${phase}`, {
      phase,
      message: `Completed ${phase} phase`,
      ...data
    });
  }

  /**
   * Notify progress within current phase
   * @param {number} percent - Progress percentage (0-100)
   * @param {string} message - Human-readable status message
   * @param {Object} data - Additional progress data
   */
  async progress(percent, message, data = {}) {
    this.phaseProgress = percent;
    return this.notify('progress', {
      progress: percent,
      message,
      ...data
    });
  }

  /**
   * Notify agent progress during research phase
   * @param {number} current - Current agent number
   * @param {number} total - Total agents
   * @param {Object} data - Additional agent data
   */
  async agentProgress(current, total, data = {}) {
    const percent = Math.round((current / total) * 100);
    return this.notify('agent_progress', {
      phase: PHASES.RESEARCHING,
      current,
      total,
      progress: percent,
      message: `Agent ${current}/${total} completed`,
      ...data
    });
  }

  /**
   * Notify synthesis chunk (for streaming synthesis)
   * @param {string} content - Chunk content
   * @param {number} tokensGenerated - Tokens generated so far
   */
  async synthesisChunk(content, tokensGenerated = 0) {
    return this.notify('synthesis_chunk', {
      phase: PHASES.SYNTHESIZING,
      content: content.length > 200 ? content.slice(-200) : content,
      tokensGenerated,
      message: `Synthesizing... (${tokensGenerated} tokens)`
    });
  }

  /**
   * Notify job completion
   * @param {string} reportId - Generated report ID
   * @param {number} durationMs - Total duration in milliseconds
   */
  async complete(reportId, durationMs = null) {
    this.currentPhase = PHASES.COMPLETE;
    const duration = durationMs || (Date.now() - this.startTime);
    return this.notify('job_complete', {
      phase: PHASES.COMPLETE,
      reportId,
      durationMs: duration,
      durationSec: Math.round(duration / 1000),
      message: `Research complete. Report ID: ${reportId}`,
      nextStep: `get_report({ reportId: "${reportId}" })`
    });
  }

  /**
   * Notify job error
   * @param {string} errorCode - Error code
   * @param {string} errorMessage - Error message
   * @param {Object} data - Additional error context
   */
  async error(errorCode, errorMessage, data = {}) {
    this.currentPhase = PHASES.ERROR;
    return this.notify('job_error', {
      phase: PHASES.ERROR,
      errorCode,
      errorMessage,
      message: `Error: ${errorMessage}`,
      isRetryable: data.isRetryable ?? false,
      ...data
    });
  }

  /**
   * Create a child notifier for a sub-task
   * @param {string} subTaskId - Sub-task identifier
   */
  createChildNotifier(subTaskId) {
    return new ProgressNotifier(this.exchange, `${this.jobId}:${subTaskId}`, {
      dbClient: this.dbClient,
      persistEvents: this.persistEvents
    });
  }
}

/**
 * Create a ProgressNotifier from MCP exchange context
 * @param {Object} exchange - MCP request handler exchange
 * @param {string} jobId - Job identifier
 * @param {Object} dbClient - Optional database client
 */
function createNotifier(exchange, jobId, dbClient = null) {
  return new ProgressNotifier(exchange, jobId, { dbClient });
}

/**
 * Create a no-op notifier for cases where notifications are disabled
 */
function createNoOpNotifier() {
  return {
    notify: async () => {},
    phaseStarted: async () => {},
    phaseComplete: async () => {},
    progress: async () => {},
    agentProgress: async () => {},
    synthesisChunk: async () => {},
    complete: async () => {},
    error: async () => {}
  };
}

module.exports = {
  ProgressNotifier,
  createNotifier,
  createNoOpNotifier,
  PHASES
};
