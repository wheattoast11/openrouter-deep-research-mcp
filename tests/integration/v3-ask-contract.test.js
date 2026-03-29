/**
 * v3 contract smoke: handler → ask (validation + async enqueue) → job_get
 * No OpenRouter calls: async ask uses submitResearch (DB job only).
 *
 * Env (defaults safe for CI sandboxes):
 *   DB_AUTO_HEAL=true — prefer in-memory PGlite if file init fails
 *   ALLOW_NO_API_KEY=true — config validation does not require a key
 */
'use strict';

process.env.DB_AUTO_HEAL = process.env.DB_AUTO_HEAL || 'true';
process.env.ALLOW_NO_API_KEY = 'true';
process.env.MCP_PRESET = process.env.MCP_PRESET || 'conversational';

const assert = require('assert');
const { routeToHandler } = require('../../src/server/handlers');
const { safeParseAskResult } = require('../../src/server/schemas/askResult');

async function run() {
  const ctx = { requestId: `v3-contract-${Date.now()}`, mcpExchange: null };

  const t1 = await routeToHandler(
    'ask',
    {
      message: 'n/a',
      sessionId: 'default',
      intent: 'follow_up',
      originalQuery: '',
      followUpQuestion: ''
    },
    ctx
  );
  assert.strictEqual(typeof t1, 'string');
  const p1 = safeParseAskResult(JSON.parse(t1));
  assert.strictEqual(p1.ok, true, p1.ok ? '' : p1.error);
  assert.ok(p1.data.warnings.length > 0, 'expected warnings for incomplete follow_up');

  const t2 = await routeToHandler(
    'ask',
    {
      message: `v3 contract async ${Date.now()}`,
      sessionId: 'default',
      sync: false,
      costPreference: 'low'
    },
    ctx
  );
  const p2 = safeParseAskResult(JSON.parse(t2));
  assert.strictEqual(p2.ok, true, p2.ok ? '' : p2.error);
  assert.strictEqual(p2.data.sync, false);
  assert.ok(p2.data.jobId && String(p2.data.jobId).length > 0, 'expected jobId');
  assert.ok(typeof p2.data.next === 'string' && p2.data.next.includes('job_get'), 'expected job_get hint');

  const t3 = await routeToHandler('job_get', { job_id: p2.data.jobId }, ctx);
  const j3 = typeof t3 === 'string' ? JSON.parse(t3) : t3;
  assert.strictEqual(String(j3.job_id), String(p2.data.jobId));
  assert.ok(j3.status != null && j3.status !== '', 'expected job status');

  console.log('v3-ask-contract.test: ok', { jobId: p2.data.jobId, status: j3.status });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
