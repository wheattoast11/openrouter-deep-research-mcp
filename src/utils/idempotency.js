// src/utils/idempotency.js
// Idempotency key generation and management utilities

const crypto = require('crypto');
const config = require('../../config');

/**
 * Generate a deterministic idempotency key from research parameters
 * @param {Object} params - Normalized research parameters
 * @returns {string} 16-character idempotency key (SHA-256 prefix)
 */
function generateIdempotencyKey(params) {
  // Extract canonical parameters that affect research results
  const canonical = {
    query: String(params.query || '').toLowerCase().trim(),
    costPreference: params.costPreference || 'low',
    audienceLevel: params.audienceLevel || 'intermediate',
    outputFormat: params.outputFormat || 'report',
    includeSources: params.includeSources !== undefined ? params.includeSources : true,
    maxLength: params.maxLength || null
  };

  // Hash array inputs for stability
  if (params.images && params.images.length > 0) {
    canonical.images = {
      count: params.images.length,
      firstUrlPrefix: params.images[0].url.substring(0, 50)
    };
  }

  if (params.textDocuments && params.textDocuments.length > 0) {
    const firstHash = crypto.createHash('sha256')
      .update(params.textDocuments[0].content.substring(0, 1000))
      .digest('hex').substring(0, 16);
    canonical.textDocuments = {
      count: params.textDocuments.length,
      firstHash
    };
  }

  if (params.structuredData && params.structuredData.length > 0) {
    const firstHash = crypto.createHash('sha256')
      .update(JSON.stringify(params.structuredData[0].content))
      .digest('hex').substring(0, 16);
    canonical.structuredData = {
      count: params.structuredData.length,
      firstHash
    };
  }

  // Sort keys for deterministic serialization
  const sortedKeys = Object.keys(canonical).sort();
  const normalized = {};
  sortedKeys.forEach(key => { normalized[key] = canonical[key]; });

  // Generate SHA-256 hash
  const content = JSON.stringify(normalized);
  const hashAlgorithm = config.idempotency?.hashAlgorithm || 'sha256';
  const keyLength = config.idempotency?.keyLength || 16;

  return crypto.createHash(hashAlgorithm)
    .update(content)
    .digest('hex')
    .substring(0, Math.min(Math.max(keyLength, 8), 64));
}

/**
 * Sanitize client-provided idempotency key
 * @param {string} key - Client-provided key
 * @returns {string} Sanitized key (max 64 chars, alphanumeric + dashes)
 */
function sanitizeIdempotencyKey(key) {
  if (!key || typeof key !== 'string') return null;

  // Remove invalid characters, keep alphanumeric and dashes
  const sanitized = key.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 64);

  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Calculate TTL expiration timestamp
 * @param {number} ttlSeconds - TTL in seconds (default from config)
 * @returns {string} ISO timestamp for expiration
 */
function calculateExpiresAt(ttlSeconds = null) {
  const ttl = ttlSeconds || config.idempotency?.ttlSeconds || 3600;
  return new Date(Date.now() + ttl * 1000).toISOString();
}

/**
 * Check if idempotency is enabled
 * @returns {boolean}
 */
function isIdempotencyEnabled() {
  return config.idempotency?.enabled !== false;
}

/**
 * Check if retry is allowed for failed job
 * @param {number} retryCount - Number of retries for this key
 * @returns {boolean}
 */
function canRetryFailedJob(retryCount = 0) {
  const policy = config.idempotency?.retryPolicy || {};
  const allowRetry = policy.allowRetryOnFailure !== false;
  const maxRetries = policy.maxRetriesPerKey || 3;

  return allowRetry && retryCount < maxRetries;
}

/**
 * Build standard job response format
 * @param {string} jobId - Job ID
 * @param {string} status - Job status
 * @param {boolean} isExisting - Whether this is an existing job
 * @param {string} retryOf - Original job ID if retry
 * @param {string} idempotencyKey - Idempotency key
 * @param {Object} additionalData - Additional response data
 * @returns {string} JSON response
 */
function buildJobResponse(jobId, status, isExisting, retryOf, idempotencyKey, additionalData = {}) {
  const { server } = require('../../config');
  const base = server.publicUrl || '';
  const sse_url = `${base.replace(/\/$/,'')}/jobs/${jobId}/events`;
  const ui_url = `${base.replace(/\/$/,'')}/ui?job=${encodeURIComponent(jobId)}`;

  const response = {
    job_id: jobId,
    status,
    sse_url,
    ui_url,
    idempotency_key: idempotencyKey,
    ...additionalData
  };

  if (isExisting) {
    response.existing_job = true;
    response.message = `Job already ${status}. Use get_job_status to monitor.`;
  }

  if (retryOf) {
    response.retry_of = retryOf;
  }

  return JSON.stringify(response);
}

/**
 * Log idempotency event for observability
 * @param {string} event - Event type
 * @param {Object} data - Event data
 */
function logIdempotencyEvent(event, data) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: `idempotency_${event}`,
    ...data
  }));
}

module.exports = {
  generateIdempotencyKey,
  sanitizeIdempotencyKey,
  calculateExpiresAt,
  isIdempotencyEnabled,
  canRetryFailedJob,
  buildJobResponse,
  logIdempotencyEvent
};
