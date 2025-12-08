// src/server/taskAdapter.js
// MCP 2025-11-25 Task Protocol Adapter (SEP-1686)
// Maps existing job system to official MCP Task protocol

const dbClient = require('../utils/dbClient');
const config = require('../../config');

// Map internal job status to MCP Task state
const JOB_STATUS_TO_TASK_STATE = {
  'queued': 'working',
  'running': 'working',
  'succeeded': 'completed',
  'failed': 'failed',
  'canceled': 'cancelled',
  'input_required': 'input_required'
};

// Map MCP Task state back to job status for queries
const TASK_STATE_TO_JOB_STATUS = {
  'working': ['queued', 'running'],
  'completed': ['succeeded'],
  'failed': ['failed'],
  'cancelled': ['canceled'],
  'input_required': ['input_required']
};

class TaskAdapter {
  constructor() {
    this.defaultTtlMs = config.mcp?.tasks?.defaultTtlMs || 3600000; // 1 hour
    this.maxTtlMs = config.mcp?.tasks?.maxTtlMs || 86400000; // 24 hours
  }

  /**
   * Convert internal job object to MCP Task format
   * @param {Object} job - Internal job object from database
   * @returns {Object} MCP Task object
   */
  jobToTask(job) {
    if (!job) return null;

    const state = JOB_STATUS_TO_TASK_STATE[job.status] || 'working';

    // Parse task metadata if stored as JSON string
    let taskMetadata = {};
    if (job.task_metadata) {
      try {
        taskMetadata = typeof job.task_metadata === 'string'
          ? JSON.parse(job.task_metadata)
          : job.task_metadata;
      } catch (_) {}
    }

    const task = {
      taskId: job.id,
      status: state,
      createdAt: job.created_at ? new Date(job.created_at).toISOString() : new Date().toISOString(),
      updatedAt: job.updated_at ? new Date(job.updated_at).toISOString() : undefined,
      ttl: job.ttl_ms || this.defaultTtlMs,
      ...taskMetadata
    };

    // Add progress if available and task is working
    if (state === 'working' && job.progress) {
      try {
        const progress = typeof job.progress === 'string' ? JSON.parse(job.progress) : job.progress;
        if (progress) {
          task.progress = progress;
          // Add poll interval hint for clients
          task.pollInterval = 1000; // 1 second recommended polling
        }
      } catch (_) {}
    }

    // Add result reference if completed
    if (state === 'completed' || state === 'failed') {
      task.hasResult = true;
    }

    // Add input request info if input_required
    if (state === 'input_required' && job.progress) {
      try {
        const elicitationData = typeof job.progress === 'string' ? JSON.parse(job.progress) : job.progress;
        if (elicitationData?.elicitation) {
          task.inputRequired = elicitationData.elicitation;
        }
      } catch (_) {}
    }

    return task;
  }

  /**
   * Create a new task from an MCP request
   * @param {Object} request - MCP request object
   * @param {number} ttl - Time to live in milliseconds
   * @returns {Object} Task creation response
   */
  async createTask(request, ttl = null) {
    const effectiveTtl = Math.min(ttl || this.defaultTtlMs, this.maxTtlMs);

    const jobId = await dbClient.createJob(request.method || 'task', {
      params: request.params,
      ttl: effectiveTtl,
      taskMetadata: {
        method: request.method,
        requestedAt: new Date().toISOString()
      }
    });

    process.stderr.write(`[${new Date().toISOString()}] TaskAdapter: Created task ${jobId} for method ${request.method}\n`);

    return {
      taskId: jobId,
      status: 'working',
      createdAt: new Date().toISOString(),
      pollInterval: 1000, // Recommend 1 second polling
      ttl: effectiveTtl
    };
  }

  /**
   * Get task by ID
   * @param {string} taskId - Task ID
   * @returns {Object|null} Task object or null if not found
   */
  async getTask(taskId) {
    const job = await dbClient.getJobStatus(taskId);
    if (!job) return null;
    return this.jobToTask(job);
  }

  /**
   * Get task result (only available for completed/failed tasks)
   * @param {string} taskId - Task ID
   * @returns {Object|null} Task result or null if not available
   */
  async getTaskResult(taskId) {
    const job = await dbClient.getJobStatus(taskId);
    if (!job) return null;

    // Only return result for terminal states
    if (!['succeeded', 'failed', 'canceled'].includes(job.status)) {
      return null;
    }

    // Parse result if stored as JSON string
    let result = job.result;
    if (typeof result === 'string') {
      try {
        result = JSON.parse(result);
      } catch (_) {}
    }

    // Wrap result in MCP tool result format with content array
    const isError = job.status === 'failed';
    const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

    return {
      taskId,
      status: JOB_STATUS_TO_TASK_STATE[job.status],
      result: {
        content: [{ type: 'text', text: resultText }],
        isError
      },
      completedAt: job.finished_at ? new Date(job.finished_at).toISOString() : new Date().toISOString()
    };
  }

  /**
   * Cancel a task
   * @param {string} taskId - Task ID
   * @returns {Object} Cancellation result
   */
  async cancelTask(taskId) {
    const job = await dbClient.getJobStatus(taskId);
    if (!job) {
      return { cancelled: false, error: 'Task not found' };
    }

    // Can only cancel non-terminal tasks
    if (['succeeded', 'failed', 'canceled'].includes(job.status)) {
      return { cancelled: false, error: 'Task already in terminal state' };
    }

    await dbClient.cancelJob(taskId);
    process.stderr.write(`[${new Date().toISOString()}] TaskAdapter: Cancelled task ${taskId}\n`);

    return { cancelled: true };
  }

  /**
   * List tasks with pagination
   * @param {string|number} cursor - Pagination cursor (offset)
   * @param {number} limit - Max tasks to return
   * @param {string} status - Filter by MCP task status
   * @returns {Object} List result with tasks and nextCursor
   */
  async listTasks(cursor, limit = 50, status = null) {
    const offset = parseInt(cursor) || 0;
    const safeLimit = Math.min(Math.max(1, limit), 100); // Clamp to 1-100

    let statusFilter = '';
    let params = [safeLimit, offset];

    if (status && TASK_STATE_TO_JOB_STATUS[status]) {
      const jobStatuses = TASK_STATE_TO_JOB_STATUS[status];
      const placeholders = jobStatuses.map((_, i) => `$${i + 3}`).join(', ');
      statusFilter = `WHERE status IN (${placeholders})`;
      params = [...params, ...jobStatuses];
    }

    const rows = await dbClient.executeQuery(
      `SELECT * FROM jobs ${statusFilter} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      params
    );

    const tasks = rows.map(job => this.jobToTask(job));
    const hasMore = rows.length === safeLimit;

    return {
      tasks,
      nextCursor: hasMore ? String(offset + safeLimit) : null
    };
  }

  /**
   * Request input from user for a task (transitions to input_required)
   * @param {string} taskId - Task ID
   * @param {Object} elicitationData - Elicitation request data
   * @returns {Object} Update result
   */
  async requestTaskInput(taskId, elicitationData) {
    const job = await dbClient.getJobStatus(taskId);
    if (!job) {
      return { success: false, error: 'Task not found' };
    }

    if (job.status !== 'running') {
      return { success: false, error: 'Task must be running to request input' };
    }

    await dbClient.executeQuery(
      `UPDATE jobs SET status = 'input_required', progress = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify({ elicitation: elicitationData }), taskId]
    );

    process.stderr.write(`[${new Date().toISOString()}] TaskAdapter: Task ${taskId} now requires input\n`);

    return { success: true, status: 'input_required' };
  }

  /**
   * Resume task with user input
   * @param {string} taskId - Task ID
   * @param {Object} inputData - User-provided input
   * @returns {Object} Resume result
   */
  async resumeTaskWithInput(taskId, inputData) {
    const job = await dbClient.getJobStatus(taskId);
    if (!job) {
      return { success: false, error: 'Task not found' };
    }

    if (job.status !== 'input_required') {
      return { success: false, error: 'Task is not waiting for input' };
    }

    // Merge input data into params
    let params = job.params;
    if (typeof params === 'string') {
      try { params = JSON.parse(params); } catch (_) { params = {}; }
    }
    params = { ...params, userInput: inputData };

    await dbClient.executeQuery(
      `UPDATE jobs SET status = 'running', params = $1, progress = NULL, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(params), taskId]
    );

    process.stderr.write(`[${new Date().toISOString()}] TaskAdapter: Task ${taskId} resumed with input\n`);

    return { success: true, status: 'working' };
  }

  /**
   * Get task events for streaming updates
   * @param {string} taskId - Task ID
   * @param {number} afterId - Return events after this ID
   * @param {number} limit - Max events to return
   * @returns {Array} Array of task events
   */
  async getTaskEvents(taskId, afterId = 0, limit = 50) {
    const events = await dbClient.getJobEvents(taskId, afterId, limit);
    return events.map(ev => ({
      eventId: ev.id,
      taskId: ev.job_id,
      type: ev.event_type,
      timestamp: ev.created_at,
      payload: ev.payload
    }));
  }

  /**
   * Emit a task notification (for server to send to client)
   * Uses MCP standard notifications/progress method with taskId as progressToken
   * @param {string} taskId - Task ID
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   * @returns {Object} Notification object
   */
  createTaskNotification(taskId, eventType, payload = {}) {
    return {
      method: 'notifications/progress',
      params: {
        progressToken: taskId,
        progress: {
          eventType,
          timestamp: new Date().toISOString(),
          ...payload
        }
      }
    };
  }
}

module.exports = new TaskAdapter();
