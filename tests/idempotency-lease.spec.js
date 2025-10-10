#!/usr/bin/env node
// tests/idempotency-lease.spec.js
// Validates lease/heartbeat/reclaim behavior for background jobs

const assert = require('assert');
const dbClient = require('../src/utils/dbClient');
const config = require('../config');

async function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function setup() {
  await dbClient.initDB();
}

async function testLeaseAcquisitionAndHeartbeat() {
  console.log('\n[lease] acquiring job');
  const jobId = await dbClient.createJob('research', { query: 'test' });
  assert(jobId, 'job id should be generated');

  const job = await dbClient.claimNextJob();
  assert(job, 'job should be claimed');
  assert.strictEqual(job.id, jobId, 'claimed job matches created job');
  assert.strictEqual(job.status, 'running', 'job status should be running');

  await dbClient.heartbeatJob(job.id);
  const afterHeartbeat = await dbClient.getJob(job.id);
  assert(afterHeartbeat.heartbeat_at, 'heartbeat timestamp should be set');

  await dbClient.setJobStatus(job.id, 'succeeded', { finished: true });
  const completed = await dbClient.getJob(job.id);
  assert.strictEqual(completed.status, 'succeeded');
}

async function testLeaseTimeoutReclaim() {
  console.log('\n[lease] testing reclaim');
  const originalTimeout = config.jobs.leaseTimeoutMs;
  config.jobs.leaseTimeoutMs = 1000;

  const jobId = await dbClient.createJob('research', { query: 'timeout test' });
  const job = await dbClient.claimNextJob();
  assert(job, 'should claim job');

  // No heartbeat, wait beyond timeout
  await sleep(1500);

  const reclaimed = await dbClient.claimNextJob();
  assert(reclaimed, 'job should be reclaimed');
  assert.strictEqual(reclaimed.id, jobId, 'reclaimed job matches original');
  config.jobs.leaseTimeoutMs = originalTimeout;
}

async function testIdempotencyLookup() {
  console.log('\n[idempotency] testing idempotent job');
  const key = `key_${Date.now()}`;
  const ttlSeconds = config.idempotency?.ttlSeconds || 3600;
  const db = dbClient.getDbInstance();
  assert(db, 'database instance required');

  await db.query(
    `INSERT INTO jobs (id, type, params, status, idempotency_key, idempotency_expires_at, created_at, updated_at)
     VALUES ('${key}', 'research', '{}', 'succeeded', $1, NOW() + INTERVAL '${ttlSeconds} seconds', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING;`,
    [key]
  );

  const row = await db.query(`SELECT id FROM jobs WHERE idempotency_key = $1;`, [key]);
  assert.strictEqual(row.rows.length, 1, 'idempotency lookup should succeed');
}

async function main() {
  await setup();
  await testLeaseAcquisitionAndHeartbeat();
  await testLeaseTimeoutReclaim();
  await testIdempotencyLookup();
  console.log('\nLease/idempotency tests completed.');
}

main().catch(err => {
  console.error('Lease/idempotency tests failed:', err);
  process.exit(1);
});


