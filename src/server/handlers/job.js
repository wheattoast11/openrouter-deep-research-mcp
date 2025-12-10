/**
 * Job Handlers
 *
 * Consolidated handlers for: job_status, cancel_job, task_get, task_result, task_list, task_cancel
 */

const { normalize } = require('../../core/normalize');

/**
 * Unified job handler
 *
 * Operations: status, cancel, list
 */
async function handleJob(op, params, context = {}) {
  const normalized = normalize('job', params);
  const { dbClient } = context;

  if (!dbClient) {
    throw new Error('Database client not available');
  }

  switch (op) {
    case 'status':
      return getJobStatus(normalized, dbClient);
    case 'cancel':
      return cancelJob(normalized, dbClient);
    case 'list':
      return listJobs(normalized, dbClient);
    case 'result':
      return getJobResult(normalized, dbClient);
    default:
      throw new Error(`Unknown job operation: ${op}`);
  }
}

/**
 * Get job status with optional event streaming
 */
async function getJobStatus(params, dbClient) {
  const { id, format = 'summary', max_events = 50, since_event_id } = params;
  const jobId = params.job_id || id;

  if (!jobId) {
    throw new Error('job_id is required');
  }

  const job = await dbClient.getJob(jobId);

  if (!job) {
    return {
      job_id: jobId,
      status: 'unknown',
      message: 'Not found (expired or invalid ID)',
      hint: 'Jobs expire after 1 hour. Check task_list for active jobs.'
    };
  }

  const result = {
    job_id: jobId,
    type: job.type,
    status: job.status,
    progress: job.progress || 0,
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at
  };

  // Add summary message and extract reportId for completed jobs
  if (job.status === 'complete' || job.status === 'succeeded') {
    result.message = 'Job completed successfully';

    // Extract reportId as first-class field using multiple strategies
    let reportId = null;

    if (job.result) {
      // Strategy 1: Try parsing as JSON and look for reportId/report_id fields
      try {
        const parsed = typeof job.result === 'string' ? JSON.parse(job.result) : job.result;
        reportId = parsed?.reportId || parsed?.report_id || parsed?.id;
      } catch (_) {}

      // Strategy 2: Regex extraction from message format
      if (!reportId) {
        const reportMatch = String(job.result).match(/Report ID:\s*(\d+)/i);
        if (reportMatch) reportId = reportMatch[1];
      }

      // Strategy 3: Check for numeric-only result (direct ID)
      if (!reportId && /^\d+$/.test(String(job.result).trim())) {
        reportId = String(job.result).trim();
      }
    }

    if (reportId) {
      result.reportId = reportId;
      result.nextStep = `get_report({ reportId: "${reportId}" })`;
      result.hint = `Use get_report({ reportId: "${reportId}" }) to retrieve the full report`;
    }
  } else if (job.status === 'failed') {
    result.message = 'Job failed';
    result.error = job.error || 'Unknown error';
  } else if (job.status === 'running') {
    result.message = `Job running (${job.progress}% complete)`;
  } else if (job.status === 'queued') {
    result.message = 'Job queued, waiting to start';
  }

  // Include full result for 'full' format
  if (format === 'full' || format === 'events') {
    if (job.result && format === 'full') {
      result.result = job.result;
    }

    // Get events if requested
    if (typeof dbClient.getJobEvents === 'function') {
      try {
        const events = await dbClient.getJobEvents(jobId, since_event_id, max_events);
        result.events = events;
        result.event_count = events.length;
      } catch (e) {
        result.events = [];
        result.event_error = e.message;
      }
    }
  }

  return result;
}

/**
 * Cancel a running or queued job
 */
async function cancelJob(params, dbClient) {
  const jobId = params.job_id || params.id;

  if (!jobId) {
    throw new Error('job_id is required');
  }

  const job = await dbClient.getJob(jobId);

  if (!job) {
    return {
      job_id: jobId,
      cancelled: false,
      message: 'Job not found'
    };
  }

  if (job.status === 'complete' || job.status === 'failed' || job.status === 'cancelled') {
    return {
      job_id: jobId,
      cancelled: false,
      message: `Job already ${job.status}`
    };
  }

  // Update job status
  await dbClient.updateJobStatus(jobId, 'cancelled');

  return {
    job_id: jobId,
    cancelled: true,
    previous_status: job.status,
    message: 'Job cancellation requested'
  };
}

/**
 * List jobs with pagination
 */
async function listJobs(params, dbClient) {
  const { limit = 20, cursor } = params;

  if (typeof dbClient.listJobs !== 'function') {
    // Fallback: get recent jobs from research reports
    const sql = 'SELECT id, type, status, created_at FROM jobs ORDER BY created_at DESC LIMIT $1';
    const rows = await dbClient.query(sql, [limit]);

    return {
      jobs: rows || [],
      count: rows?.length || 0,
      has_more: false
    };
  }

  const result = await dbClient.listJobs(limit, cursor);

  return {
    jobs: result.jobs || [],
    count: result.jobs?.length || 0,
    cursor: result.nextCursor,
    has_more: !!result.nextCursor
  };
}

/**
 * Get job result (for completed jobs)
 */
async function getJobResult(params, dbClient) {
  const jobId = params.job_id || params.id;

  if (!jobId) {
    throw new Error('job_id is required');
  }

  const job = await dbClient.getJob(jobId);

  if (!job) {
    return { job_id: jobId, error: 'Job not found' };
  }

  // Check for terminal states (succeeded, failed, canceled, complete)
  const terminalStates = ['succeeded', 'failed', 'canceled', 'complete'];
  if (!terminalStates.includes(job.status)) {
    return {
      job_id: jobId,
      status: job.status,
      message: `Job not complete (status: ${job.status})`,
      progress: job.progress || 0
    };
  }

  // Extract reportId from result
  let reportId = null;
  let result = job.result;

  // Try to parse result if it's a JSON string
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      reportId = parsed?.reportId || parsed?.report_id || parsed?.id;
      result = parsed;
    } catch (_) {
      // Try regex extraction from string result
      const match = result.match(/Report ID:\s*(\d+)/i);
      if (match) reportId = match[1];
    }
  } else if (result) {
    reportId = result?.reportId || result?.report_id || result?.id;
  }

  const response = {
    job_id: jobId,
    status: job.status === 'succeeded' ? 'completed' : job.status,
    result: result,
    finished_at: job.finished_at
  };

  // Add first-class reportId and nextStep guidance
  if (reportId) {
    response.reportId = reportId;
    response.nextStep = `get_report({ reportId: "${reportId}" })`;
  }

  return response;
}

/**
 * Legacy compatibility wrappers
 */
const getJobStatusLegacy = (params, ctx) => handleJob('status', params, ctx);
const cancelJobLegacy = (params, ctx) => handleJob('cancel', params, ctx);
const taskGet = (params, ctx) => handleJob('status', params, ctx);
const taskResult = (params, ctx) => handleJob('result', params, ctx);
const taskList = (params, ctx) => handleJob('list', params, ctx);
const taskCancel = (params, ctx) => handleJob('cancel', params, ctx);

module.exports = {
  handleJob,
  getJobStatus,
  cancelJob,
  listJobs,
  getJobResult,
  // Legacy exports
  getJobStatusLegacy,
  cancelJobLegacy,
  taskGet,
  taskResult,
  taskList,
  taskCancel
};
