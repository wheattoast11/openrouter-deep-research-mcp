/**
 * Core Module Unit Tests
 *
 * Tests for core abstractions: config, context, signal, normalize, roleShift.
 * Uses native Node.js assert - no test framework required.
 *
 * Run with: node tests/unit/core.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

// Helper to run tests
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('Running core module tests...\n');

  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${name}`);
      console.log(`    ${err.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// --- Tests for src/core/config.js ---

test('getConfig returns requestTracker defaults', () => {
  const { getConfig } = require('../../src/core/config');
  const config = getConfig('requestTracker');

  assert.ok(config.timeout > 0, 'timeout should be positive');
  assert.strictEqual(typeof config.timeout, 'number');
});

test('getConfig returns consensus defaults', () => {
  const { getConfig } = require('../../src/core/config');
  const config = getConfig('consensus');

  assert.ok(config.minAgreement >= 0 && config.minAgreement <= 1,
    'minAgreement should be between 0 and 1');
  assert.ok(config.modelWeights, 'should have modelWeights');
});

test('createConfig merges overrides', () => {
  const { createConfig } = require('../../src/core/config');
  const config = createConfig('requestTracker', { timeout: 5000 });

  assert.strictEqual(config.timeout, 5000);
});

// --- Tests for src/core/context.js ---

test('validateContext returns valid for complete context', () => {
  const { validateContext } = require('../../src/core/context');
  const ctx = { dbClient: {} };
  const result = validateContext(ctx, 'kb');

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.missing.length, 0);
});

test('validateContext returns missing for incomplete context', () => {
  const { validateContext } = require('../../src/core/context');
  const ctx = {};
  const result = validateContext(ctx, 'kb');

  assert.strictEqual(result.valid, false);
  assert.ok(result.missing.includes('dbClient'));
});

test('contextFactory creates context with requestId', () => {
  const { contextFactory } = require('../../src/core/context');
  const factory = contextFactory({ dbClient: { query: () => {} } });
  const ctx = factory('test-123');

  assert.strictEqual(ctx.requestId, 'test-123');
  assert.ok(ctx.dbClient);
});

test('mergeContext combines partial and defaults', () => {
  const { mergeContext } = require('../../src/core/context');
  const result = mergeContext(
    { dbClient: {} },
    { sessionStore: {} }
  );

  assert.ok(result.dbClient);
  assert.ok(result.sessionStore);
  assert.ok(result.requestId);
});

// --- Tests for src/core/normalize.js ---

test('normalize applies global aliases', () => {
  const { normalize } = require('../../src/core/normalize');
  const result = normalize('search', { q: 'test' });

  assert.strictEqual(result.query, 'test');
  assert.strictEqual(result.q, undefined);
});

test('normalize applies tool defaults', () => {
  const { normalize } = require('../../src/core/normalize');
  const result = normalize('search', {});

  assert.strictEqual(result.limit, 10);
  assert.strictEqual(result.scope, 'both');
});

test('validateParams throws for missing required', () => {
  const { validateParams } = require('../../src/core/normalize');

  assert.throws(() => {
    validateParams('search', {});
  }, /query is required/);
});

test('validateParams accepts valid params', () => {
  const { validateParams } = require('../../src/core/normalize');
  const result = validateParams('search', { query: 'test' });

  assert.ok(result);
  assert.strictEqual(result.query, 'test');
});

test('validateParams accepts aliased params', () => {
  const { validateParams } = require('../../src/core/normalize');
  const result = validateParams('get_report', { id: '5' });

  assert.ok(result);
});

// --- Tests for src/core/signal.js ---

test('Signal.query creates query signal', () => {
  const { Signal, SignalType } = require('../../src/core/signal');
  const signal = Signal.query('test query', 'test-source');

  assert.strictEqual(signal.type, SignalType.QUERY);
  assert.strictEqual(signal.payload, 'test query');
  assert.strictEqual(signal.source, 'test-source');
});

test('Signal.response creates response with confidence', () => {
  const { Signal, SignalType } = require('../../src/core/signal');
  const signal = Signal.response('answer', 'model', 0.9);

  assert.strictEqual(signal.type, SignalType.RESPONSE);
  assert.strictEqual(signal.confidence, 0.9);
});

test('Signal.error creates error signal with zero confidence', () => {
  const { Signal, SignalType } = require('../../src/core/signal');
  const signal = Signal.error('something failed', 'source');

  assert.strictEqual(signal.type, SignalType.ERROR);
  assert.strictEqual(signal.confidence, 0);
});

test('ConsensusCalculator handles single signal', () => {
  const { Signal, ConsensusCalculator } = require('../../src/core/signal');
  const calc = new ConsensusCalculator();
  const signal = Signal.response('answer', 'test', 0.95);

  const result = calc.calculate([signal]);

  assert.strictEqual(result.method, 'single');
  assert.strictEqual(result.consensus, 'answer');
});

test('ConsensusCalculator handles multiple signals', () => {
  const { Signal, ConsensusCalculator } = require('../../src/core/signal');
  const calc = new ConsensusCalculator();

  const result = calc.calculate([
    Signal.response('a', 'model1', 0.9),
    Signal.response('b', 'model2', 0.7)
  ]);

  assert.strictEqual(result.method, 'weighted');
  assert.ok(result.confidence > 0);
});

test('extractCrystallization detects patterns', () => {
  const { extractCrystallization } = require('../../src/core/signal');
  const result = extractCrystallization('This shows clear understanding and crystallization');

  assert.ok(result.patterns);
  assert.ok(typeof result.score === 'number');
});

// --- Tests for src/core/roleShift.js ---

test('RequestTracker creates request with ID', () => {
  const { RequestTracker } = require('../../src/core/roleShift');
  const tracker = new RequestTracker({ timeout: 1000 });
  const req = tracker.create('synthesis', { prompt: 'test' });

  assert.ok(req.id.startsWith('req_'));
  assert.strictEqual(req.type, 'synthesis');
  assert.strictEqual(req.resolved, false);
});

test('RequestTracker resolves request', () => {
  const { RequestTracker } = require('../../src/core/roleShift');
  const tracker = new RequestTracker({ timeout: 1000 });
  const req = tracker.create('test', {});

  const resolved = tracker.resolve(req.id, { result: 'done' });

  assert.strictEqual(resolved.resolved, true);
  assert.deepStrictEqual(resolved.result, { result: 'done' });
});

test('RequestTracker lists pending requests', () => {
  const { RequestTracker } = require('../../src/core/roleShift');
  const tracker = new RequestTracker({ timeout: 1000 });

  tracker.create('a', {});
  tracker.create('b', {});

  const pending = tracker.list();
  assert.strictEqual(pending.length, 2);
});

test('RoleShiftProtocol tracks canShift property', () => {
  const { RoleShiftProtocol, RoleMode } = require('../../src/core/roleShift');

  const protocol = new RoleShiftProtocol({ mode: RoleMode.SERVER });
  assert.strictEqual(protocol.canShift, false);

  protocol.setCapabilities({ sampling: {} });
  assert.strictEqual(protocol.canShift, true);
});

// --- Tests for src/core/middleware/validation.js ---

test('withValidation normalizes params', async () => {
  const { withValidation } = require('../../src/core/middleware/validation');

  let receivedParams;
  const handler = (params) => {
    receivedParams = params;
    return { success: true };
  };

  const wrapped = withValidation('search', handler);
  await wrapped({ q: 'test' });

  // Should have normalized q -> query
  assert.strictEqual(receivedParams.query, 'test');
});

// Run all tests
runTests().catch(console.error);
