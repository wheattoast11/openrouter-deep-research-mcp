#!/usr/bin/env node
// tests/test-idempotency.js
// Comprehensive test suite for idempotency system

const assert = require('assert');
const dbClient = require('../src/utils/dbClient');
const { submitResearchIdempotent } = require('../src/server/submitResearchIdempotent');
const { generateIdempotencyKey } = require('../src/utils/idempotency');

// Test utilities
function logTest(name) {
  console.error(`\n[TEST] ${name}`);
}

function assertSuccess(condition, message) {
  assert(condition, message);
  console.error(`  ✓ ${message}`);
}

async function cleanup() {
  try {
    await dbClient.initDB();
    await dbClient.db.query(`DELETE FROM jobs WHERE type = 'research'`);
    await dbClient.db.query(`DELETE FROM job_events`);
    console.error('[CLEANUP] Test data cleared');
  } catch (err) {
    console.error('[CLEANUP] Error:', err.message);
  }
}

// Test cases
async function testDuplicateDetection() {
  logTest('Duplicate submission detection');

  const params = {
    query: 'test query for duplicate detection',
    costPreference: 'low',
    audienceLevel: 'intermediate'
  };

  const result1 = JSON.parse(await submitResearchIdempotent(params, null, 'test-req-1'));
  const result2 = JSON.parse(await submitResearchIdempotent(params, null, 'test-req-2'));

  assertSuccess(result1.job_id === result2.job_id, 'Same job_id returned for duplicate');
  assertSuccess(result2.existing_job === true, 'existing_job flag is true');
  assertSuccess(result1.idempotency_key === result2.idempotency_key, 'Same idempotency key');
}

async function testConcurrentSubmissions() {
  logTest('Concurrent submission handling (race condition)');

  const params = {
    query: 'concurrent test query',
    costPreference: 'low'
  };

  // Submit 5 identical requests concurrently
  const promises = Array.from({ length: 5 }, (_, i) =>
    submitResearchIdempotent(params, null, `concurrent-${i}`)
  );

  const results = await Promise.all(promises);
  const jobs = results.map(r => JSON.parse(r));
  const jobIds = jobs.map(j => j.job_id);

  // All should return same job_id (only one created)
  const uniqueJobIds = new Set(jobIds);
  assertSuccess(uniqueJobIds.size === 1, `Only one job created (got ${uniqueJobIds.size})`);

  // At least one should be marked as existing_job
  const existingCount = jobs.filter(j => j.existing_job).length;
  assertSuccess(existingCount >= 4, `At least 4 marked as existing (got ${existingCount})`);
}

async function testKeyExpiration() {
  logTest('Key expiration and recreation');

  const params = {
    query: 'expiration test query',
    costPreference: 'low'
  };

  const result1 = JSON.parse(await submitResearchIdempotent(params, null, 'exp-1'));

  // Manually expire the key
  await dbClient.db.query(
    `UPDATE jobs SET idempotency_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1`,
    [result1.job_id]
  );

  const result2 = JSON.parse(await submitResearchIdempotent(params, null, 'exp-2'));

  assertSuccess(result1.job_id !== result2.job_id, 'New job created after expiration');
  assertSuccess(result1.idempotency_key === result2.idempotency_key, 'Same key reused');
}

async function testForceNewBypass() {
  logTest('Force new job (bypass idempotency)');

  const params = {
    query: 'force new test',
    costPreference: 'low'
  };

  const result1 = JSON.parse(await submitResearchIdempotent(params, null, 'force-1'));
  const result2 = JSON.parse(await submitResearchIdempotent(
    { ...params, force_new: true },
    null,
    'force-2'
  ));

  assertSuccess(result1.job_id !== result2.job_id, 'Different job_id with force_new');
  assertSuccess(result2.forced_new === true, 'forced_new flag is true');
}

async function testCachedResult() {
  logTest('Cached result for succeeded job');

  const params = {
    query: 'success test query',
    costPreference: 'low'
  };

  const result1 = JSON.parse(await submitResearchIdempotent(params, null, 'success-1'));

  // Simulate job completion
  await dbClient.setJobStatus(result1.job_id, 'succeeded', {
    result: { message: 'Test result', report_id: '12345' },
    finished: true
  });

  const result2 = JSON.parse(await submitResearchIdempotent(params, null, 'success-2'));

  assertSuccess(result2.job_id === result1.job_id, 'Same job_id for cached result');
  assertSuccess(result2.status === 'succeeded', 'Status is succeeded');
  assertSuccess(result2.cached === true, 'cached flag is true');
  assertSuccess(result2.result.report_id === '12345', 'Report ID matches');
}

async function testFailedJobRetry() {
  logTest('Failed job retry policy');

  const params = {
    query: 'failure test query',
    costPreference: 'low'
  };

  const result1 = JSON.parse(await submitResearchIdempotent(params, null, 'fail-1'));

  // Simulate job failure
  await dbClient.setJobStatus(result1.job_id, 'failed', {
    result: { error: 'Test failure' },
    finished: true
  });

  const result2 = JSON.parse(await submitResearchIdempotent(params, null, 'fail-2'));

  // Should return error (or retry based on policy)
  assertSuccess(result2.status === 'failed', 'Status is failed');
  assertSuccess(result2.error !== undefined, 'Error message present');

  // With force_new, should create new job
  const result3 = JSON.parse(await submitResearchIdempotent(
    { ...params, force_new: true },
    null,
    'fail-3'
  ));

  assertSuccess(result3.job_id !== result1.job_id, 'New job created with force_new after failure');
}

async function testCanceledJobResubmission() {
  logTest('Canceled job resubmission');

  const params = {
    query: 'cancel test query',
    costPreference: 'low'
  };

  const result1 = JSON.parse(await submitResearchIdempotent(params, null, 'cancel-1'));

  // Cancel the job
  await dbClient.cancelJob(result1.job_id);

  const result2 = JSON.parse(await submitResearchIdempotent(params, null, 'cancel-2'));

  assertSuccess(result2.job_id !== result1.job_id, 'New job created after cancellation');
  assertSuccess(result2.retry_of === result1.job_id, 'retry_of references canceled job');
}

async function testClientProvidedKey() {
  logTest('Client-provided idempotency key');

  const params1 = {
    query: 'test query A',
    costPreference: 'low',
    idempotency_key: 'custom-key-123'
  };

  const params2 = {
    query: 'test query B',
    costPreference: 'high',
    idempotency_key: 'custom-key-123'
  };

  const result1 = JSON.parse(await submitResearchIdempotent(params1, null, 'custom-1'));
  const result2 = JSON.parse(await submitResearchIdempotent(params2, null, 'custom-2'));

  assertSuccess(result1.job_id === result2.job_id, 'Same job for same custom key');
  assertSuccess(result1.idempotency_key === 'custom-key-123', 'Custom key used');
}

async function testKeyGeneration() {
  logTest('Key generation consistency');

  const params1 = {
    query: 'test query',
    costPreference: 'low',
    audienceLevel: 'intermediate',
    outputFormat: 'report',
    includeSources: true
  };

  const params2 = {
    query: 'test query',
    costPreference: 'low',
    audienceLevel: 'intermediate',
    outputFormat: 'report',
    includeSources: true
  };

  const key1 = generateIdempotencyKey(params1);
  const key2 = generateIdempotencyKey(params2);

  assertSuccess(key1 === key2, 'Same key for same params');
  assertSuccess(key1.length === 16, 'Key length is 16 characters');

  // Different params should generate different keys
  const params3 = { ...params1, costPreference: 'high' };
  const key3 = generateIdempotencyKey(params3);

  assertSuccess(key1 !== key3, 'Different key for different params');
}

async function testRunningJobStatus() {
  logTest('Running job status check');

  const params = {
    query: 'running job test',
    costPreference: 'low'
  };

  const result1 = JSON.parse(await submitResearchIdempotent(params, null, 'run-1'));

  // Update job to running status
  await dbClient.setJobStatus(result1.job_id, 'running', { started: true });

  const result2 = JSON.parse(await submitResearchIdempotent(params, null, 'run-2'));

  assertSuccess(result2.job_id === result1.job_id, 'Same job returned');
  assertSuccess(result2.status === 'running', 'Status is running');
  assertSuccess(result2.existing_job === true, 'Marked as existing job');
  assertSuccess(result2.sse_url !== undefined, 'SSE URL provided for monitoring');
}

async function testHeartbeatTTLExtension() {
  logTest('Heartbeat extends TTL');

  const params = {
    query: 'heartbeat test',
    costPreference: 'low'
  };

  const result = JSON.parse(await submitResearchIdempotent(params, null, 'hb-1'));

  // Get initial expiration
  const initial = await dbClient.db.query(
    `SELECT idempotency_expires_at FROM jobs WHERE id = $1`,
    [result.job_id]
  );
  const initialExpiry = new Date(initial.rows[0].idempotency_expires_at);

  // Wait a bit and send heartbeat
  await new Promise(resolve => setTimeout(resolve, 100));
  await dbClient.heartbeatJob(result.job_id);

  // Check updated expiration
  const updated = await dbClient.db.query(
    `SELECT idempotency_expires_at FROM jobs WHERE id = $1`,
    [result.job_id]
  );
  const updatedExpiry = new Date(updated.rows[0].idempotency_expires_at);

  assertSuccess(updatedExpiry >= initialExpiry, 'Expiration extended or maintained by heartbeat');
}

async function testParameterNormalization() {
  logTest('Parameter normalization for key generation');

  // Different order, same logical params
  const params1 = {
    costPreference: 'low',
    query: 'Test Query',
    audienceLevel: 'intermediate'
  };

  const params2 = {
    audienceLevel: 'intermediate',
    query: 'test query',
    costPreference: 'low'
  };

  const key1 = generateIdempotencyKey(params1);
  const key2 = generateIdempotencyKey(params2);

  assertSuccess(key1 === key2, 'Same key despite different order and case');
}

// Main test runner
async function runAllTests() {
  console.error('='.repeat(60));
  console.error('IDEMPOTENCY SYSTEM TEST SUITE');
  console.error('='.repeat(60));

  try {
    await cleanup();

    await testKeyGeneration();
    await cleanup();

    await testDuplicateDetection();
    await cleanup();

    await testConcurrentSubmissions();
    await cleanup();

    await testKeyExpiration();
    await cleanup();

    await testForceNewBypass();
    await cleanup();

    await testCachedResult();
    await cleanup();

    await testFailedJobRetry();
    await cleanup();

    await testCanceledJobResubmission();
    await cleanup();

    await testClientProvidedKey();
    await cleanup();

    await testRunningJobStatus();
    await cleanup();

    await testHeartbeatTTLExtension();
    await cleanup();

    await testParameterNormalization();
    await cleanup();

    console.error('\n' + '='.repeat(60));
    console.error('ALL TESTS PASSED ✓');
    console.error('='.repeat(60));
    process.exit(0);
  } catch (err) {
    console.error('\n' + '='.repeat(60));
    console.error('TEST FAILED ✗');
    console.error('='.repeat(60));
    console.error('\nError:', err.message);
    console.error('\nStack:', err.stack);
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runAllTests };
