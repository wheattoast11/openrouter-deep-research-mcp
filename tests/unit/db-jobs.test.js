// tests/unit/db-jobs.test.js
const assert = require('assert');
const dbClient = require('../../src/utils/dbClient');
const { randomUUID } = require('crypto');

(async () => {
  await dbClient.initDB();

  // Test createJob
  const jobId = await dbClient.createJob('research', { query: 'test' });
  assert.ok(jobId, 'Job ID created');
  assert.strictEqual(typeof jobId, 'string');

  // Test getJobStatus
  const status = await dbClient.getJobStatus(jobId);
  assert.strictEqual(status.status, 'queued');
  assert.deepStrictEqual(status.type, 'research');

  // Test appendJobEvent
  await dbClient.appendJobEvent(jobId, 'enqueued', { step: 'planning' });
  const updated = await dbClient.getJobStatus(jobId, { format: 'full' });
  assert.ok(updated.events.length >= 1);
  assert.strictEqual(updated.events[0].type, 'enqueued');

  // Test updateJobProgress / Result
  await dbClient.updateJobProgress(jobId, { percent: 50 });
  await dbClient.updateJobResult(jobId, 'succeeded', { reportId: 123 });
  const final = await dbClient.getJobStatus(jobId);
  assert.strictEqual(final.status, 'succeeded');
  assert.deepStrictEqual(final.progress.percent, 50);

  // Test cancelJob (idempotent)
  await dbClient.cancelJob(jobId + '-fake'); // noop
  await dbClient.cancelJob(jobId); // already terminal

  console.log('✅ All db-jobs tests passed');
  process.exit(0);
})().catch(e => {
  console.error('❌ db-jobs test failed:', e);
  process.exit(1);
});
