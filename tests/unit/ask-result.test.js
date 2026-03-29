'use strict';

const assert = require('assert');
const { safeParseAskResult, AskResultSchema } = require('../../src/server/schemas/askResult');

const sample = {
  answer: 'Hello',
  citations: [{ title: 'T', url: 'https://example.com' }],
  reportId: '42',
  jobId: null,
  sessionId: 'default',
  sync: true,
  warnings: [],
  trace: ['intent:research']
};

const parsed = AskResultSchema.parse(sample);
assert.strictEqual(parsed.answer, 'Hello');
assert.strictEqual(parsed.reportId, '42');

const bad = safeParseAskResult({ answer: 1 });
assert.strictEqual(bad.ok, false);

console.log('ask-result.test: ok');
