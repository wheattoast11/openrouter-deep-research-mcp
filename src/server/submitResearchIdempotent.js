// src/server/submitResearchIdempotent.js
// Idempotent job submission with duplicate detection and caching

const dbClient = require('../utils/dbClient');
const {
  generateIdempotencyKey,
  sanitizeIdempotencyKey,
  calculateExpiresAt,
  isIdempotencyEnabled,
  canRetryFailedJob,
  buildJobResponse,
  logIdempotencyEvent
} = require('../utils/idempotency');
const config = require('../../config');

/**
 * Submit research job with idempotency support
 * @param {Object} params - Normalized research parameters
 * @param {Object} mcpExchange - MCP exchange object (optional)
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<string>} JSON response with job details
 */
async function submitResearchIdempotent(params, mcpExchange = null, requestId = 'unknown-req') {
  // Check if idempotency is enabled
  if (!isIdempotencyEnabled()) {
    logIdempotencyEvent('disabled', { requestId });
    return submitResearchLegacy(params, mcpExchange, requestId);
  }

  // Allow force_new to bypass idempotency
  if (params.force_new === true) {
    logIdempotencyEvent('forced_new', { requestId, query: params.query?.substring(0, 50) });
    return submitResearchLegacy(params, mcpExchange, requestId);
  }

  // Generate or use client-provided idempotency key
  let idempotencyKey;
  if (params.idempotency_key) {
    idempotencyKey = sanitizeIdempotencyKey(params.idempotency_key);
    if (!idempotencyKey) {
      throw new Error('Invalid idempotency_key format. Must be alphanumeric with dashes, max 64 chars.');
    }
    logIdempotencyEvent('client_key', { requestId, idempotency_key: idempotencyKey });
  } else {
    idempotencyKey = generateIdempotencyKey(params);
    logIdempotencyEvent('generated_key', { requestId, idempotency_key: idempotencyKey });
  }

  const expiresAt = calculateExpiresAt();

  // Clean expired keys before lookup to avoid false positives
  try {
    const cleanup = await dbClient.executeWithRetry(async () => {
      const result = await dbClient.executeStatement(
        `DELETE FROM jobs
         WHERE idempotency_key IS NOT NULL
           AND idempotency_expires_at < NOW()
           AND status IN ('succeeded', 'failed')
         RETURNING id`
      );
      return result.length;
    }, 'cleanupExpiredKeys', 0);

    if (cleanup > 0) {
      logIdempotencyEvent('cleanup', { count: cleanup, requestId });
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Idempotency cleanup error:`, err);
  }

  // Check for existing job with same key
  const existing = await dbClient.executeWithRetry(async () => {
    const result = await dbClient.executeQuery(
      `SELECT id, status, result, created_at, params, canceled
       FROM jobs
       WHERE idempotency_key = $1
         AND (idempotency_expires_at IS NULL OR idempotency_expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT 1`,
      [idempotencyKey]
    );
    return result[0] || null;
  }, 'lookupIdempotencyKey', null);

  if (existing) {
    logIdempotencyEvent('cache_hit', {
      requestId,
      idempotency_key: idempotencyKey,
      existing_job_id: existing.id,
      status: existing.status
    });

    return handleExistingJob(existing, idempotencyKey, params, requestId);
  }

  // No existing job - create new one
  logIdempotencyEvent('cache_miss', { requestId, idempotency_key: idempotencyKey });

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

  try {
    // Atomic insert with race condition handling via UNIQUE constraint
    await dbClient.executeStatement(
      `INSERT INTO jobs (id, type, params, status, idempotency_key, idempotency_expires_at, created_at, updated_at)
       VALUES ($1, 'research', $2, 'queued', $3, $4, NOW(), NOW())`,
      [jobId, JSON.stringify(params), idempotencyKey, expiresAt]
    );

    await dbClient.appendJobEvent(jobId, 'submitted', {
      requestId,
      query: params.query,
      idempotency_key: idempotencyKey
    });

    const { server } = config;
    const base = server.publicUrl || '';
    const sse_url = `${base.replace(/\/$/,'')}/jobs/${jobId}/events`;
    const ui_url = `${base.replace(/\/$/,'')}/ui?job=${encodeURIComponent(jobId)}`;

    await dbClient.appendJobEvent(jobId, 'ui_hint', { sse_url, ui_url });

    logIdempotencyEvent('created', {
      requestId,
      job_id: jobId,
      idempotency_key: idempotencyKey
    });

    return buildJobResponse(jobId, 'queued', false, null, idempotencyKey);
  } catch (err) {
    // Handle UNIQUE constraint violation (race condition)
    if (err.code === '23505' || (err.message && (err.message.includes('unique') || err.message.includes('duplicate key')))) {
      logIdempotencyEvent('race_condition', {
        requestId,
        idempotency_key: idempotencyKey,
        error: err.message
      });

      // Retry lookup to get the winning job
      const retry = await dbClient.executeWithRetry(async () => {
        const result = await dbClient.executeQuery(
          `SELECT id, status, result, created_at, params
           FROM jobs
           WHERE idempotency_key = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [idempotencyKey]
        );
        return result[0] || null;
      }, 'retryLookupAfterRace', null);

      if (retry) {
        return handleExistingJob(retry, idempotencyKey, params, requestId);
      }
    }

    logIdempotencyEvent('error', {
      requestId,
      idempotency_key: idempotencyKey,
      error: err.message
    });

    throw err;
  }
}

/**
 * Handle existing job based on its status
 * @param {Object} job - Existing job record
 * @param {string} idempotencyKey - Idempotency key
 * @param {Object} params - Original request params
 * @param {string} requestId - Request ID
 * @returns {Promise<string>} JSON response
 */
async function handleExistingJob(job, idempotencyKey, params, requestId) {
  const { server } = config;
  const base = server.publicUrl || '';
  const sse_url = `${base.replace(/\/$/,'')}/jobs/${job.id}/events`;
  const ui_url = `${base.replace(/\/$/,'')}/ui?job=${encodeURIComponent(job.id)}`;

  switch (job.status) {
    case 'queued':
    case 'running':
      // Return existing job for monitoring
      return buildJobResponse(job.id, job.status, true, null, idempotencyKey);

    case 'succeeded':
      // Return cached result
      const result = typeof job.result === 'string' ? JSON.parse(job.result) : job.result;
      return JSON.stringify({
        job_id: job.id,
        status: 'succeeded',
        cached: true,
        result,
        idempotency_key: idempotencyKey
      });

    case 'failed':
      // Check retry policy
      const retryPolicy = config.idempotency?.retryPolicy || {};
      const allowRetry = retryPolicy.allowRetryOnFailure !== false;

      if (!allowRetry && !params.force_new) {
        // Return error - retry not allowed
        return JSON.stringify({
          job_id: job.id,
          status: 'failed',
          error: 'Previous job failed. Use force_new=true to retry.',
          idempotency_key: idempotencyKey
        });
      }

      // Check retry count within window
      const retryWindow = retryPolicy.retryWindowSeconds || 300;
      const retryCount = await dbClient.executeWithRetry(async () => {
        const result = await dbClient.executeQuery(
          `SELECT COUNT(*) as count
           FROM jobs
           WHERE idempotency_key = $1
             AND status = 'failed'
             AND created_at > NOW() - INTERVAL '${retryWindow} seconds'`,
          [idempotencyKey]
        );
        return parseInt(result[0]?.count || 0);
      }, 'countFailedRetries', 0);

      if (!canRetryFailedJob(retryCount) && !params.force_new) {
        // Too many retries
        return JSON.stringify({
          job_id: job.id,
          status: 'failed',
          error: `Too many retries (${retryCount}). Wait or use force_new=true.`,
          idempotency_key: idempotencyKey
        });
      }

      // Allow retry - create new job
      logIdempotencyEvent('retry_failed', {
        requestId,
        original_job_id: job.id,
        retry_count: retryCount
      });

      return submitResearchLegacy(params, null, `retry-failed-${requestId}`, job.id);

    case 'canceled':
      // Allow resubmission for canceled jobs
      logIdempotencyEvent('retry_canceled', {
        requestId,
        original_job_id: job.id
      });

      return submitResearchLegacy(params, null, `retry-canceled-${requestId}`, job.id);

    default:
      return JSON.stringify({
        error: 'Unknown job status',
        job_id: job.id,
        status: job.status
      });
  }
}

/**
 * Legacy job submission without idempotency
 * @param {Object} params - Research parameters
 * @param {Object} mcpExchange - MCP exchange object
 * @param {string} requestId - Request ID
 * @param {string} retryOf - Original job ID if retry
 * @returns {Promise<string>} JSON response
 */
async function submitResearchLegacy(params, mcpExchange = null, requestId = 'unknown-req', retryOf = null) {
  const jobId = await dbClient.createJob('research', params);

  await dbClient.appendJobEvent(jobId, 'submitted', {
    requestId,
    query: params.query,
    retry_of: retryOf || undefined
  });

  try {
    const { server } = config;
    const base = server.publicUrl || '';
    const sse_url = `${base.replace(/\/$/,'')}/jobs/${jobId}/events`;
    const ui_url = `${base.replace(/\/$/,'')}/ui?job=${encodeURIComponent(jobId)}`;

    await dbClient.appendJobEvent(jobId, 'ui_hint', { sse_url, ui_url });

    const response = {
      job_id: jobId,
      sse_url,
      ui_url
    };

    if (retryOf) {
      response.retry_of = retryOf;
      response.message = 'Previous job failed/canceled. Retrying with new job.';
    }

    if (params.force_new) {
      response.forced_new = true;
      response.message = 'New job created (idempotency bypassed).';
    }

    return JSON.stringify(response);
  } catch (_) {
    return JSON.stringify({ job_id: jobId });
  }
}

module.exports = {
  submitResearchIdempotent,
  submitResearchLegacy
};
