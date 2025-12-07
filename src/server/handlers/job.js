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

  // Add summary message
  if (job.status === 'complete') {
    result.message = 'Job completed successfully';
    if (job.result) {
      // Extract report ID if present
      const reportMatch = job.result.match(/Report ID:\s*(\d+)/);
      if (reportMatch) {
        result.reportId = reportMatch[1];
        result.hint = `Use get_report({ reportId: "${reportMatch[1]}" }) to retrieve the full report`;
      }
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

  if (job.status !== 'complete') {
    return {
      job_id: jobId,
      status: job.status,
      message: `Job not complete (status: ${job.status})`,
      progress: job.progress || 0
    };
  }

  return {
    job_id: jobId,
    status: 'complete',
    result: job.result,
    finished_at: job.finished_at
  };
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
