# Idempotency Key System Design

**Version:** 1.0
**Date:** October 2, 2025
**Status:** Implementation Ready

## Executive Summary

This document specifies a comprehensive idempotency system for job submissions in the OpenRouter Agents platform. The system prevents duplicate job execution while maintaining high performance and supporting multiple edge cases.

## 1. Key Generation Strategy

### 1.1 Canonical Parameters

**Parameters included in idempotency key:**
- `query` (required) - The research query
- `costPreference` (optional, default: 'low')
- `audienceLevel` (optional, default: 'intermediate')
- `outputFormat` (optional, default: 'report')
- `includeSources` (optional, default: true)
- `maxLength` (optional)
- `images` - Array hashed by count + first URL prefix (if present)
- `textDocuments` - Array hashed by count + first content hash (if present)
- `structuredData` - Array hashed by count + first data hash (if present)

**Parameters excluded from idempotency key:**
- `requestId` - Internal tracking ID, varies per request
- `notify` - Webhook URL, user may change but want same result
- `async` - Execution mode, doesn't affect result
- `mode` - Execution mode (standard/advanced), internal optimization
- `clientContext` - Context for execution, not part of result identity
- Timestamps (created_at, submitted_at, etc.)

### 1.2 Hash Algorithm

**Choice: SHA-256 (16-character prefix)**

**Rationale:**
- SHA-256 provides cryptographic strength (collision probability: ~1 in 2^64 for 16 chars)
- Widely supported in Node.js crypto module
- Faster than bcrypt/scrypt (no need for slow hashing)
- Deterministic output for same inputs
- 16-character prefix balances uniqueness (2^64) vs storage efficiency

**Alternative considered:**
- MD5: Deprecated due to collision vulnerabilities
- SHA-512: Overkill, larger output without benefit
- Custom: Reinventing the wheel, higher collision risk

### 1.3 Key Normalization

```javascript
function generateIdempotencyKey(params) {
  // Normalize and extract canonical parameters
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
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}
```

## 2. Storage Design

### 2.1 Database Schema Changes

**Option A: JSONB field in jobs table (RECOMMENDED)**

```sql
-- Migration: Add idempotency_key column to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_expires_at TIMESTAMPTZ;

-- Create unique index for fast lookup and duplicate prevention
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency_key
  ON jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Create index for efficient expiration cleanup
CREATE INDEX IF NOT EXISTS idx_jobs_idempotency_expires
  ON jobs(idempotency_expires_at)
  WHERE idempotency_expires_at IS NOT NULL;
```

**Advantages:**
- Minimal schema changes
- Single table lookup (no JOIN required)
- Atomic duplicate prevention via UNIQUE constraint
- Efficient storage (16 chars + timestamp)

**Option B: Separate idempotency_keys table**

```sql
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_idempotency_keys_expires ON idempotency_keys(expires_at);
CREATE INDEX idx_idempotency_keys_job_id ON idempotency_keys(job_id);
```

**Advantages:**
- Cleaner separation of concerns
- Easier to add metadata (request IPs, user agents, etc.)
- Can track key usage history

**Disadvantages:**
- Additional JOIN for lookups
- More complex foreign key management
- Higher storage overhead

**Decision: Use Option A (JSONB field)** - Simpler implementation, better performance for this use case.

### 2.2 TTL Strategy

**Configurable TTL with sensible defaults:**

```javascript
// config.js
config.idempotency = {
  enabled: process.env.IDEMPOTENCY_ENABLED !== 'false', // Default: true
  ttlSeconds: parseInt(process.env.IDEMPOTENCY_TTL_SECONDS, 10) || 3600, // 1 hour
  cleanupIntervalMs: parseInt(process.env.IDEMPOTENCY_CLEANUP_INTERVAL_MS, 10) || 600000 // 10 min
};
```

**Cleanup strategies:**

1. **On-demand cleanup** (during lookup):
```javascript
// Clean expired keys before lookup to avoid false positives
await db.query(
  `DELETE FROM jobs WHERE idempotency_key IS NOT NULL
   AND idempotency_expires_at < NOW()`
);
```

2. **Background cleanup worker** (periodic):
```javascript
// Run every 10 minutes
setInterval(async () => {
  const result = await db.query(
    `DELETE FROM jobs WHERE idempotency_key IS NOT NULL
     AND idempotency_expires_at < NOW()
     AND status IN ('succeeded', 'failed')
     RETURNING id`
  );
  if (result.rows.length > 0) {
    console.error(`[${new Date().toISOString()}] Cleaned ${result.rows.length} expired idempotency keys`);
  }
}, config.idempotency.cleanupIntervalMs);
```

**TTL considerations:**
- Too short (< 5 min): Duplicate submissions during long-running jobs
- Too long (> 24 hr): Unnecessary storage bloat, stale results
- **Recommended: 1-3 hours** - Balances cache hit rate with freshness

## 3. Behavior Definition

### 3.1 State Machine

```
Status: queued
  → Return existing job_id (409 Conflict or 200 with existing_job=true)

Status: running
  → Return existing job_id + SSE URL for live progress (200 with existing_job=true)

Status: succeeded
  → Return cached result + report_id (200 with cached=true, no new job)

Status: failed
  → Policy-based retry:
    - Default: Allow retry (create new job, new key with retry_of metadata)
    - If force_new=true param: Always create new job
    - If within retry_window (5 min): Return error 429 "Too many retries"

Status: canceled
  → Allow resubmission (create new job with same key, link via retry_of)
```

### 3.2 API Response Formats

**Case 1: Exact duplicate (queued/running)**
```json
{
  "job_id": "job_1696262400_abc123",
  "status": "queued",
  "existing_job": true,
  "message": "Job already submitted. Use get_job_status to monitor.",
  "sse_url": "http://localhost:3002/jobs/job_1696262400_abc123/events",
  "ui_url": "http://localhost:3002/ui?job=job_1696262400_abc123"
}
```

**Case 2: Cached result (succeeded)**
```json
{
  "job_id": "job_1696262400_abc123",
  "status": "succeeded",
  "cached": true,
  "result": {
    "message": "Research complete. Results streamed. Report ID: 67890...",
    "report_id": "67890abcdef123456"
  },
  "idempotency_key": "a1b2c3d4e5f6g7h8"
}
```

**Case 3: Failed job retry**
```json
{
  "job_id": "job_1696262500_def456",
  "status": "queued",
  "retry_of": "job_1696262400_abc123",
  "message": "Previous job failed. Retrying with new job.",
  "sse_url": "...",
  "ui_url": "..."
}
```

**Case 4: Force new job (bypass idempotency)**
```json
// Request: { ...params, force_new: true }
{
  "job_id": "job_1696262600_ghi789",
  "status": "queued",
  "forced_new": true,
  "message": "New job created (idempotency bypassed).",
  "sse_url": "...",
  "ui_url": "..."
}
```

## 4. Edge Cases

### 4.1 Concurrent Submissions (Race Condition)

**Problem:** Two clients submit identical requests within milliseconds.

**Solution: Database-level atomic check using UNIQUE constraint**

```javascript
async function submitResearchIdempotent(params, mcpExchange = null, requestId = 'unknown-req') {
  const normalized = normalizeResearchParams(params);
  const idempotencyKey = generateIdempotencyKey(normalized);
  const ttlSeconds = config.idempotency?.ttlSeconds || 3600;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  // Check for existing job with same key
  const existing = await db.query(
    `SELECT id, status, result, created_at, idempotency_expires_at
     FROM jobs
     WHERE idempotency_key = $1
       AND (idempotency_expires_at IS NULL OR idempotency_expires_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [idempotencyKey]
  );

  if (existing.rows.length > 0) {
    const job = existing.rows[0];
    return handleExistingJob(job, idempotencyKey, params);
  }

  // Atomic insert with race condition handling
  try {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    await db.query(
      `INSERT INTO jobs (id, type, params, status, idempotency_key, idempotency_expires_at, created_at, updated_at)
       VALUES ($1, 'research', $2, 'queued', $3, $4, NOW(), NOW())`,
      [jobId, JSON.stringify(normalized), idempotencyKey, expiresAt]
    );

    await dbClient.appendJobEvent(jobId, 'submitted', {
      requestId,
      query: normalized.query,
      idempotency_key: idempotencyKey
    });

    return buildJobResponse(jobId, 'queued', false, null, idempotencyKey);
  } catch (err) {
    // UNIQUE constraint violation = concurrent duplicate
    if (err.code === '23505' || err.message.includes('unique')) {
      // Retry lookup to get the winning job
      const retry = await db.query(
        `SELECT id, status, result, created_at
         FROM jobs
         WHERE idempotency_key = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [idempotencyKey]
      );
      if (retry.rows.length > 0) {
        return handleExistingJob(retry.rows[0], idempotencyKey, params);
      }
    }
    throw err;
  }
}
```

### 4.2 Partial Parameter Changes

**Problem:** User submits same query but changes `ensembleSize` or `maxLength`.

**Decision: These ARE different requests, generate different keys.**

**Implementation:** Include all result-affecting parameters in canonical form.

**User override:** Provide `idempotency_key` parameter to force deduplication:

```javascript
// Client-provided key takes precedence
if (params.idempotency_key) {
  idempotencyKey = String(params.idempotency_key).substring(0, 64); // Sanitize
}
```

### 4.3 Failed Job Retry Policy

**Configurable retry behavior:**

```javascript
config.idempotency.retryPolicy = {
  allowRetryOnFailure: process.env.IDEMPOTENCY_RETRY_ON_FAILURE !== 'false',
  retryWindowSeconds: parseInt(process.env.IDEMPOTENCY_RETRY_WINDOW_SECONDS, 10) || 300, // 5 min
  maxRetriesPerKey: parseInt(process.env.IDEMPOTENCY_MAX_RETRIES, 10) || 3
};

// Check retry eligibility
async function canRetryFailedJob(idempotencyKey) {
  const window = config.idempotency.retryPolicy.retryWindowSeconds;
  const maxRetries = config.idempotency.retryPolicy.maxRetriesPerKey;

  const result = await db.query(
    `SELECT COUNT(*) as retry_count
     FROM jobs
     WHERE idempotency_key = $1
       AND status = 'failed'
       AND created_at > NOW() - INTERVAL '${window} seconds'`,
    [idempotencyKey]
  );

  const retryCount = parseInt(result.rows[0]?.retry_count || 0);
  return retryCount < maxRetries;
}
```

### 4.4 Canceled Job Resubmission

**Policy: Allow resubmission, link to original via metadata**

```javascript
if (existingJob.status === 'canceled') {
  // Create new job but link to canceled one
  const newJobId = await createJob('research', {
    ...normalized,
    _retry_of: existingJob.id,
    _retry_reason: 'canceled'
  });

  // Reuse same idempotency key but update expiration
  await db.query(
    `UPDATE jobs SET idempotency_key = $1, idempotency_expires_at = $2 WHERE id = $3`,
    [idempotencyKey, newExpiresAt, newJobId]
  );

  return buildJobResponse(newJobId, 'queued', false, existingJob.id, idempotencyKey);
}
```

### 4.5 Key Expiration During Job Execution

**Problem:** Long-running job exceeds TTL, key expires, duplicate submitted.

**Solution: Extend TTL on heartbeat**

```javascript
async function heartbeatJob(jobId) {
  const ttlSeconds = config.idempotency?.ttlSeconds || 3600;
  const newExpiry = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  await db.query(
    `UPDATE jobs
     SET heartbeat_at = NOW(),
         updated_at = NOW(),
         idempotency_expires_at = GREATEST(idempotency_expires_at, $2)
     WHERE id = $1`,
    [jobId, newExpiry]
  );
}
```

## 5. Integration Points

### 5.1 Modified submitResearch Function

```javascript
// src/server/tools.js

async function submitResearch(params, mcpExchange = null, requestId = 'unknown-req') {
  const config = require('../../config');

  // Check if idempotency is enabled
  if (!config.idempotency?.enabled) {
    return submitResearchLegacy(params, mcpExchange, requestId);
  }

  return submitResearchIdempotent(params, mcpExchange, requestId);
}

async function submitResearchIdempotent(params, mcpExchange = null, requestId = 'unknown-req') {
  const normalized = normalizeResearchParams(params);

  // Allow force_new to bypass idempotency
  if (params.force_new === true) {
    return submitResearchLegacy(normalized, mcpExchange, requestId);
  }

  const idempotencyKey = params.idempotency_key || generateIdempotencyKey(normalized);
  const ttlSeconds = config.idempotency?.ttlSeconds || 3600;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  // Clean expired keys
  try {
    await db.query(
      `DELETE FROM jobs
       WHERE idempotency_key IS NOT NULL
         AND idempotency_expires_at < NOW()
         AND status IN ('succeeded', 'failed')`
    );
  } catch (_) {}

  // Check for existing job
  const existing = await db.query(
    `SELECT id, status, result, created_at, params
     FROM jobs
     WHERE idempotency_key = $1
       AND (idempotency_expires_at IS NULL OR idempotency_expires_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [idempotencyKey]
  );

  if (existing.rows.length > 0) {
    const job = existing.rows[0];
    return handleExistingJob(job, idempotencyKey, params);
  }

  // Create new job with idempotency key
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

  try {
    await db.query(
      `INSERT INTO jobs (id, type, params, status, idempotency_key, idempotency_expires_at, created_at, updated_at)
       VALUES ($1, 'research', $2, 'queued', $3, $4, NOW(), NOW())`,
      [jobId, JSON.stringify(normalized), idempotencyKey, expiresAt]
    );
  } catch (err) {
    if (err.code === '23505' || err.message.includes('unique')) {
      const retry = await db.query(
        `SELECT id, status, result FROM jobs WHERE idempotency_key = $1 ORDER BY created_at DESC LIMIT 1`,
        [idempotencyKey]
      );
      if (retry.rows.length > 0) return handleExistingJob(retry.rows[0], idempotencyKey, params);
    }
    throw err;
  }

  await dbClient.appendJobEvent(jobId, 'submitted', {
    requestId,
    query: normalized.query,
    idempotency_key: idempotencyKey
  });

  const { server } = require('../../config');
  const base = server.publicUrl || '';
  const sse_url = `${base.replace(/\/$/,'')}/jobs/${jobId}/events`;
  const ui_url = `${base.replace(/\/$/,'')}/ui?job=${encodeURIComponent(jobId)}`;

  await dbClient.appendJobEvent(jobId, 'ui_hint', { sse_url, ui_url });

  return JSON.stringify({
    job_id: jobId,
    status: 'queued',
    sse_url,
    ui_url,
    idempotency_key: idempotencyKey
  });
}

function handleExistingJob(job, idempotencyKey, params) {
  const { server } = require('../../config');
  const base = server.publicUrl || '';
  const sse_url = `${base.replace(/\/$/,'')}/jobs/${job.id}/events`;
  const ui_url = `${base.replace(/\/$/,'')}/ui?job=${encodeURIComponent(job.id)}`;

  switch (job.status) {
    case 'queued':
    case 'running':
      return JSON.stringify({
        job_id: job.id,
        status: job.status,
        existing_job: true,
        message: `Job already ${job.status}. Use get_job_status to monitor.`,
        sse_url,
        ui_url,
        idempotency_key: idempotencyKey
      });

    case 'succeeded':
      const result = typeof job.result === 'string' ? JSON.parse(job.result) : job.result;
      return JSON.stringify({
        job_id: job.id,
        status: 'succeeded',
        cached: true,
        result,
        idempotency_key: idempotencyKey
      });

    case 'failed':
      const canRetry = config.idempotency?.retryPolicy?.allowRetryOnFailure !== false;
      if (!canRetry || params.force_new === true) {
        // Fall through to create new job
        return submitResearchLegacy(params, null, `retry-${Date.now()}`);
      }

      return JSON.stringify({
        job_id: job.id,
        status: 'failed',
        error: 'Previous job failed. Use force_new=true to retry.',
        idempotency_key: idempotencyKey
      });

    case 'canceled':
      // Allow resubmission for canceled jobs
      return submitResearchLegacy(params, null, `retry-canceled-${Date.now()}`);

    default:
      return JSON.stringify({ error: 'Unknown job status', job_id: job.id });
  }
}
```

### 5.2 Database Migration

**File: `src/utils/dbClient.js` (add to initDB function)**

```javascript
// Idempotency key support
await db.query(`
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
`);
await db.query(`
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_expires_at TIMESTAMPTZ;
`);
await db.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency_key
    ON jobs(idempotency_key)
    WHERE idempotency_key IS NOT NULL;
`);
await db.query(`
  CREATE INDEX IF NOT EXISTS idx_jobs_idempotency_expires
    ON jobs(idempotency_expires_at)
    WHERE idempotency_expires_at IS NOT NULL;
`);
```

### 5.3 Updated Schema Definitions

```javascript
// src/server/tools.js

const submitResearchSchema = conductResearchSchema.extend({
  notify: z.string().url().optional().describe("Optional webhook to notify on completion"),
  force_new: z.boolean().optional().describe("Bypass idempotency check and create new job"),
  idempotency_key: z.string().max(64).optional().describe("Client-provided idempotency key (overrides auto-generation)")
}).describe("Submit a long-running research job asynchronously. Returns a job_id immediately. Idempotent by default - duplicate submissions return existing job. Use force_new=true to bypass.");
```

### 5.4 HTTP Endpoint Support

**Optional: Add GET endpoint for idempotency key lookup**

```javascript
// src/server/httpServer.js

app.get('/api/jobs/by-key/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const result = await db.query(
      `SELECT id, status, result, created_at, updated_at
       FROM jobs
       WHERE idempotency_key = $1
         AND (idempotency_expires_at IS NULL OR idempotency_expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT 1`,
      [key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No job found for this idempotency key' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

## 6. Performance Analysis

### 6.1 Index Strategy

**Primary lookup index:**
```sql
CREATE UNIQUE INDEX idx_jobs_idempotency_key ON jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

**Performance characteristics:**
- **Index type:** B-tree (default for UNIQUE)
- **Selectivity:** High (unique constraint)
- **Scan cost:** O(log N) for lookup
- **Insert cost:** O(log N) for duplicate check + insert
- **Partial index:** Only rows with non-null keys (reduces index size ~50%)

**Expiration index:**
```sql
CREATE INDEX idx_jobs_idempotency_expires ON jobs(idempotency_expires_at)
  WHERE idempotency_expires_at IS NOT NULL;
```

**Cleanup query plan:**
```sql
EXPLAIN DELETE FROM jobs
WHERE idempotency_expires_at < NOW() AND status IN ('succeeded', 'failed');

-- Expected plan:
-- Index Scan using idx_jobs_idempotency_expires
--   Filter: (idempotency_expires_at < now() AND status IN ('succeeded', 'failed'))
```

### 6.2 Benchmark Estimates

**Assumptions:**
- 10,000 jobs in database
- 50% have idempotency keys
- PGLite in-memory mode

**Lookup performance:**
- Cold lookup: ~5-10ms (includes expiration cleanup)
- Warm lookup: ~1-2ms (index in memory)
- Concurrent inserts: ~10-20ms (UNIQUE constraint check + write)

**Cleanup performance:**
- 1000 expired keys: ~50-100ms (batch delete)
- Background cleanup (every 10 min): Negligible impact on throughput

**Storage overhead:**
- 16 char key + timestamp: ~50 bytes per job
- For 10K jobs: ~500KB additional storage
- Index overhead: ~200KB additional

**Total cost: Minimal (<1MB for 10K jobs)**

## 7. Test Cases

### Test Suite: `tests/test-idempotency.js`

```javascript
const assert = require('assert');
const dbClient = require('../src/utils/dbClient');
const { submitResearch } = require('../src/server/tools');

describe('Idempotency System', () => {
  beforeEach(async () => {
    await dbClient.initDB();
    await dbClient.query('DELETE FROM jobs WHERE type = \'research\'');
  });

  it('should return same job_id for duplicate submission', async () => {
    const params = { query: 'test query', costPreference: 'low' };

    const result1 = JSON.parse(await submitResearch(params));
    const result2 = JSON.parse(await submitResearch(params));

    assert.strictEqual(result1.job_id, result2.job_id);
    assert.strictEqual(result2.existing_job, true);
  });

  it('should handle concurrent submissions atomically', async () => {
    const params = { query: 'concurrent test', costPreference: 'low' };

    const [result1, result2, result3] = await Promise.all([
      submitResearch(params),
      submitResearch(params),
      submitResearch(params)
    ]);

    const jobs = [result1, result2, result3].map(r => JSON.parse(r));
    const jobIds = jobs.map(j => j.job_id);

    // All should return same job_id
    assert.strictEqual(new Set(jobIds).size, 1);
  });

  it('should create new job after TTL expiration', async () => {
    const params = { query: 'ttl test', costPreference: 'low' };

    const result1 = JSON.parse(await submitResearch(params));

    // Manually expire the key
    await dbClient.query(
      `UPDATE jobs SET idempotency_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1`,
      [result1.job_id]
    );

    const result2 = JSON.parse(await submitResearch(params));

    assert.notStrictEqual(result1.job_id, result2.job_id);
  });

  it('should allow retry with force_new flag', async () => {
    const params = { query: 'force new test', costPreference: 'low' };

    const result1 = JSON.parse(await submitResearch(params));
    const result2 = JSON.parse(await submitResearch({ ...params, force_new: true }));

    assert.notStrictEqual(result1.job_id, result2.job_id);
    assert.strictEqual(result2.forced_new, true);
  });

  it('should return cached result for succeeded job', async () => {
    const params = { query: 'success test', costPreference: 'low' };

    const result1 = JSON.parse(await submitResearch(params));

    // Simulate job completion
    await dbClient.setJobStatus(result1.job_id, 'succeeded', {
      result: { message: 'Test result', report_id: '12345' }
    });

    const result2 = JSON.parse(await submitResearch(params));

    assert.strictEqual(result2.job_id, result1.job_id);
    assert.strictEqual(result2.status, 'succeeded');
    assert.strictEqual(result2.cached, true);
    assert.strictEqual(result2.result.report_id, '12345');
  });

  it('should handle failed job retry policy', async () => {
    const params = { query: 'failure test', costPreference: 'low' };

    const result1 = JSON.parse(await submitResearch(params));

    // Simulate job failure
    await dbClient.setJobStatus(result1.job_id, 'failed', {
      result: { error: 'Test failure' }
    });

    const result2 = JSON.parse(await submitResearch(params));

    // Should return error unless force_new is used
    assert.strictEqual(result2.status, 'failed');

    const result3 = JSON.parse(await submitResearch({ ...params, force_new: true }));
    assert.notStrictEqual(result3.job_id, result1.job_id);
  });

  it('should allow resubmission of canceled jobs', async () => {
    const params = { query: 'cancel test', costPreference: 'low' };

    const result1 = JSON.parse(await submitResearch(params));

    // Cancel the job
    await dbClient.cancelJob(result1.job_id);

    const result2 = JSON.parse(await submitResearch(params));

    // Should create new job
    assert.notStrictEqual(result2.job_id, result1.job_id);
  });

  it('should respect client-provided idempotency key', async () => {
    const params1 = { query: 'test A', idempotency_key: 'custom-key-123' };
    const params2 = { query: 'test B', idempotency_key: 'custom-key-123' };

    const result1 = JSON.parse(await submitResearch(params1));
    const result2 = JSON.parse(await submitResearch(params2));

    // Different queries but same key = same job
    assert.strictEqual(result1.job_id, result2.job_id);
  });
});
```

### Integration Test: End-to-End Flow

```javascript
describe('Idempotency Integration', () => {
  it('should prevent duplicate research execution', async () => {
    const params = {
      query: 'What is quantum computing?',
      costPreference: 'low',
      audienceLevel: 'intermediate',
      outputFormat: 'report'
    };

    // Submit first job
    const submission1 = JSON.parse(await submitResearch(params));
    assert.strictEqual(submission1.status, 'queued');

    // Submit duplicate while first is running
    const submission2 = JSON.parse(await submitResearch(params));
    assert.strictEqual(submission2.job_id, submission1.job_id);
    assert.strictEqual(submission2.existing_job, true);

    // Wait for job to complete (mock)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Simulate successful completion
    const mockResult = { message: 'Research complete', report_id: '67890' };
    await dbClient.setJobStatus(submission1.job_id, 'succeeded', { result: mockResult });

    // Submit again after completion
    const submission3 = JSON.parse(await submitResearch(params));
    assert.strictEqual(submission3.job_id, submission1.job_id);
    assert.strictEqual(submission3.cached, true);
    assert.deepStrictEqual(submission3.result, mockResult);

    // Verify only one job was created
    const jobs = await dbClient.query(
      `SELECT COUNT(*) as count FROM jobs WHERE params->>'query' = $1`,
      [params.query]
    );
    assert.strictEqual(parseInt(jobs.rows[0].count), 1);
  });
});
```

## 8. Migration Plan

### Phase 1: Database Migration (Non-breaking)
1. Add `idempotency_key` and `idempotency_expires_at` columns to `jobs` table
2. Create indexes (`idx_jobs_idempotency_key`, `idx_jobs_idempotency_expires`)
3. Deploy schema changes to production
4. **No downtime required** - columns are nullable

### Phase 2: Code Deployment (Feature Flag)
1. Deploy idempotency code with feature flag **disabled** (`IDEMPOTENCY_ENABLED=false`)
2. Monitor logs for any schema errors
3. Run integration tests in staging environment
4. Verify backward compatibility with existing job submissions

### Phase 3: Gradual Rollout
1. Enable idempotency for 10% of traffic (A/B test)
2. Monitor metrics: duplicate rate, cache hit rate, error rate
3. Increase to 50%, then 100% over 1 week
4. Collect performance data and tune TTL settings

### Phase 4: Optimization
1. Analyze cache hit rate and adjust TTL (target: 1-3 hours)
2. Monitor cleanup job performance
3. Tune retry policies based on failure patterns
4. Add metrics/observability (Prometheus, Grafana)

### Rollback Plan
If issues arise:
1. Set `IDEMPOTENCY_ENABLED=false` to disable feature
2. System falls back to legacy `submitResearchLegacy` behavior
3. No data loss - idempotency columns simply remain unused
4. Can re-enable after fix without schema changes

## 9. Observability & Metrics

### Recommended Metrics

```javascript
// Prometheus-style metrics
const idempotencyMetrics = {
  cache_hits: new Counter('idempotency_cache_hits_total', 'Total cache hits'),
  cache_misses: new Counter('idempotency_cache_misses_total', 'Total cache misses'),
  duplicate_requests: new Counter('idempotency_duplicate_requests_total', 'Total duplicate requests blocked'),
  key_expirations: new Counter('idempotency_key_expirations_total', 'Total expired keys cleaned'),
  forced_new: new Counter('idempotency_forced_new_total', 'Total forced new jobs'),
  race_conditions: new Counter('idempotency_race_conditions_total', 'Total race condition retries'),
  lookup_duration: new Histogram('idempotency_lookup_duration_seconds', 'Idempotency key lookup duration')
};

// Example instrumentation
async function submitResearchIdempotent(params, mcpExchange, requestId) {
  const startTime = Date.now();

  try {
    const existing = await db.query(/* ... */);

    if (existing.rows.length > 0) {
      idempotencyMetrics.cache_hits.inc();
      idempotencyMetrics.duplicate_requests.inc();
      return handleExistingJob(existing.rows[0], /* ... */);
    }

    idempotencyMetrics.cache_misses.inc();
    // ... create new job
  } finally {
    const duration = (Date.now() - startTime) / 1000;
    idempotencyMetrics.lookup_duration.observe(duration);
  }
}
```

### Logging Strategy

```javascript
// Structured logging for debugging
console.error(JSON.stringify({
  timestamp: new Date().toISOString(),
  event: 'idempotency_check',
  idempotency_key: idempotencyKey,
  request_id: requestId,
  result: 'cache_hit' | 'cache_miss' | 'duplicate',
  job_id: jobId,
  status: jobStatus,
  ttl_remaining_seconds: ttlRemaining
}));
```

## 10. Security Considerations

### 10.1 Key Tampering
- **Risk:** Malicious client provides custom idempotency_key to access other users' results
- **Mitigation:**
  - Scope keys to user/tenant ID (multi-tenant systems)
  - Validate key format (max 64 chars, alphanumeric + dashes)
  - Rate limit key lookups per IP

### 10.2 Cache Poisoning
- **Risk:** Attacker submits malicious query to poison cache for legitimate users
- **Mitigation:**
  - Include user context in key generation (if multi-user)
  - Sanitize all inputs before hashing
  - Implement query allowlist for high-security deployments

### 10.3 Timing Attacks
- **Risk:** Key existence revealed via response time differences
- **Mitigation:**
  - Constant-time comparison for key lookups (not critical for this use case)
  - Rate limiting prevents brute-force key guessing

## 11. Future Enhancements

### 11.1 Distributed Idempotency (Multi-Node)
- Use Redis or distributed lock for cluster deployments
- Implement two-phase commit for cross-node key creation
- Add node affinity to route duplicate requests to same worker

### 11.2 Smart TTL Adjustment
- Track cache hit rates per key
- Extend TTL for frequently accessed keys (LRU-like behavior)
- Reduce TTL for one-off queries

### 11.3 Client SDK Improvements
```javascript
// Auto-generate idempotency key client-side
const client = new OpenRouterAgentsClient({
  autoIdempotency: true,
  idempotencyTTL: 3600
});

// Client handles retry logic
const result = await client.submitResearch({
  query: 'quantum computing',
  retryOnFailure: true,
  maxRetries: 3
});
```

### 11.4 Metrics Dashboard
- Grafana dashboard showing:
  - Cache hit/miss rates over time
  - Duplicate request trends
  - Key expiration patterns
  - Cost savings from deduplication

---

## Appendix A: Configuration Reference

```bash
# .env configuration for idempotency system

# Enable/disable idempotency (default: true)
IDEMPOTENCY_ENABLED=true

# TTL for idempotency keys in seconds (default: 3600 = 1 hour)
IDEMPOTENCY_TTL_SECONDS=3600

# Background cleanup interval in milliseconds (default: 600000 = 10 min)
IDEMPOTENCY_CLEANUP_INTERVAL_MS=600000

# Retry policy for failed jobs
IDEMPOTENCY_RETRY_ON_FAILURE=true
IDEMPOTENCY_RETRY_WINDOW_SECONDS=300  # 5 minutes
IDEMPOTENCY_MAX_RETRIES=3

# Advanced options
IDEMPOTENCY_HASH_ALGORITHM=sha256  # Options: sha256, sha512, md5 (not recommended)
IDEMPOTENCY_KEY_LENGTH=16  # Hash prefix length (8-64 chars)
```

## Appendix B: API Examples

### Submit Research with Idempotency

```bash
# First submission
curl -X POST http://localhost:3002/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is quantum computing?",
    "costPreference": "low",
    "audienceLevel": "intermediate"
  }'

# Response:
{
  "job_id": "job_1696262400_abc123",
  "status": "queued",
  "sse_url": "http://localhost:3002/jobs/job_1696262400_abc123/events",
  "ui_url": "http://localhost:3002/ui?job=job_1696262400_abc123",
  "idempotency_key": "a1b2c3d4e5f6g7h8"
}

# Duplicate submission (returns existing job)
curl -X POST http://localhost:3002/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is quantum computing?",
    "costPreference": "low",
    "audienceLevel": "intermediate"
  }'

# Response:
{
  "job_id": "job_1696262400_abc123",
  "status": "running",
  "existing_job": true,
  "message": "Job already running. Use get_job_status to monitor.",
  "sse_url": "http://localhost:3002/jobs/job_1696262400_abc123/events",
  "ui_url": "http://localhost:3002/ui?job=job_1696262400_abc123",
  "idempotency_key": "a1b2c3d4e5f6g7h8"
}

# Force new job (bypass idempotency)
curl -X POST http://localhost:3002/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is quantum computing?",
    "costPreference": "low",
    "audienceLevel": "intermediate",
    "force_new": true
  }'

# Response:
{
  "job_id": "job_1696262500_def456",
  "status": "queued",
  "forced_new": true,
  "message": "New job created (idempotency bypassed).",
  "sse_url": "http://localhost:3002/jobs/job_1696262500_def456/events",
  "ui_url": "http://localhost:3002/ui?job=job_1696262500_def456"
}
```

### Lookup Job by Idempotency Key

```bash
curl http://localhost:3002/api/jobs/by-key/a1b2c3d4e5f6g7h8

# Response:
{
  "id": "job_1696262400_abc123",
  "status": "succeeded",
  "result": {
    "message": "Research complete. Results streamed. Report ID: 67890...",
    "report_id": "67890abcdef123456"
  },
  "created_at": "2025-10-02T14:30:00.000Z",
  "updated_at": "2025-10-02T14:35:00.000Z"
}
```

---

**End of Idempotency System Design Document**
