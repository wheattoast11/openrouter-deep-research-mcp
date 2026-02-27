/**
 * Circuit Breaker Unit Tests
 *
 * Tests for the circuit breaker state machine: CLOSED -> OPEN -> HALF_OPEN -> CLOSED.
 * Covers threshold-based tripping, fail-fast rejection, probe recovery, withRetry,
 * and stats tracking.
 *
 * Run with: node tests/unit/circuitBreaker.test.js
 */

'use strict';

const assert = require('assert');
const { CircuitBreaker, CircuitOpenError, State, withRetry } = require('../../src/core/circuitBreaker');

// Clear error taxonomy occurrence tracker between tests to prevent
// cross-test pollution (the taxonomy tracks global error frequency).
let clearOccurrences;
try {
  clearOccurrences = require('../../src/core/errors').clearOccurrences;
} catch (_) {
  clearOccurrences = () => {};
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ---------------------------------------------------------------------------
// 1. Circuit starts CLOSED
// ---------------------------------------------------------------------------
test('circuit starts in CLOSED state', () => {
  const cb = new CircuitBreaker({ name: 'test' });
  assert.strictEqual(cb.state, State.CLOSED);
  assert.strictEqual(cb.failures, 0);
  assert.strictEqual(cb.getStatus().state, 'CLOSED');
});

// ---------------------------------------------------------------------------
// 2. Successful calls keep circuit CLOSED and reset failure count
// ---------------------------------------------------------------------------
test('successful calls keep CLOSED and reset failures', async () => {
  const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });

  // Accumulate 2 failures (below threshold)
  for (let i = 0; i < 2; i++) {
    try { await cb.execute(() => { throw new Error('transient'); }); } catch (_) {}
  }
  assert.strictEqual(cb.failures, 2);
  assert.strictEqual(cb.state, State.CLOSED);

  // Successful call resets failure count
  const result = await cb.execute(() => 'ok');
  assert.strictEqual(result, 'ok');
  assert.strictEqual(cb.failures, 0);
  assert.strictEqual(cb.state, State.CLOSED);
});

// ---------------------------------------------------------------------------
// 3. N failures (matching failureThreshold) transition to OPEN
// ---------------------------------------------------------------------------
test('failures at threshold trip circuit to OPEN', async () => {
  const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });

  for (let i = 0; i < 3; i++) {
    try { await cb.execute(() => { throw new Error('fail'); }); } catch (_) {}
  }

  assert.strictEqual(cb.state, State.OPEN);
  assert.strictEqual(cb.stats.trips, 1);
});

// ---------------------------------------------------------------------------
// 4. OPEN circuit rejects immediately with CircuitOpenError (fail-fast)
// ---------------------------------------------------------------------------
test('OPEN circuit rejects with CircuitOpenError', async () => {
  const cb = new CircuitBreaker({ name: 'test-open', failureThreshold: 1, resetTimeoutMs: 60000 });

  // Trip the circuit
  try { await cb.execute(() => { throw new Error('boom'); }); } catch (_) {}
  assert.strictEqual(cb.state, State.OPEN);

  // Subsequent call should fail fast
  let caughtError = null;
  try {
    await cb.execute(() => 'should not run');
  } catch (e) {
    caughtError = e;
  }

  assert.ok(caughtError instanceof CircuitOpenError, 'Should throw CircuitOpenError');
  assert.strictEqual(caughtError.circuitName, 'test-open');
  assert.ok(caughtError.nextRetryAt > Date.now());
  assert.ok(caughtError.message.includes('OPEN'));
});

// ---------------------------------------------------------------------------
// 5. After resetTimeout, circuit transitions to HALF_OPEN
// ---------------------------------------------------------------------------
test('OPEN transitions to HALF_OPEN after resetTimeout', async () => {
  const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 50 });

  // Trip the circuit
  try { await cb.execute(() => { throw new Error('fail'); }); } catch (_) {}
  assert.strictEqual(cb.state, State.OPEN);

  // Wait for reset timeout
  await new Promise(r => setTimeout(r, 60));

  // Next call should transition to HALF_OPEN and succeed
  const result = await cb.execute(() => 'recovered');
  assert.strictEqual(result, 'recovered');
  // After success in HALF_OPEN, should be CLOSED
  assert.strictEqual(cb.state, State.CLOSED);
});

// ---------------------------------------------------------------------------
// 6. Success in HALF_OPEN closes circuit
// ---------------------------------------------------------------------------
test('success in HALF_OPEN transitions to CLOSED', async () => {
  const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 10 });

  // Trip
  try { await cb.execute(() => { throw new Error('fail'); }); } catch (_) {}
  assert.strictEqual(cb.state, State.OPEN);

  await new Promise(r => setTimeout(r, 20));

  // Probe succeeds
  await cb.execute(() => 'ok');
  assert.strictEqual(cb.state, State.CLOSED);
  assert.strictEqual(cb.failures, 0);
  assert.strictEqual(cb.halfOpenAttempts, 0);
});

// ---------------------------------------------------------------------------
// 7. Failure in HALF_OPEN reopens circuit
// ---------------------------------------------------------------------------
test('failure in HALF_OPEN reopens circuit', async () => {
  const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 10 });

  // Trip
  try { await cb.execute(() => { throw new Error('fail'); }); } catch (_) {}
  assert.strictEqual(cb.state, State.OPEN);
  const tripsAfterFirst = cb.stats.trips;

  await new Promise(r => setTimeout(r, 20));

  // Probe fails
  try { await cb.execute(() => { throw new Error('still broken'); }); } catch (_) {}
  assert.strictEqual(cb.state, State.OPEN);
  assert.strictEqual(cb.stats.trips, tripsAfterFirst + 1);
});

// ---------------------------------------------------------------------------
// 8. withRetry retries on failure with backoff
// ---------------------------------------------------------------------------
test('withRetry retries on failure', async () => {
  let attempts = 0;
  const fn = () => {
    attempts++;
    if (attempts < 3) throw new Error('transient');
    return 'success';
  };

  const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
  assert.strictEqual(result, 'success');
  assert.strictEqual(attempts, 3);
});

test('withRetry exhausts retries and throws last error', async () => {
  let attempts = 0;
  const fn = () => { attempts++; throw new Error(`fail-${attempts}`); };

  let caughtError = null;
  try {
    await withRetry(fn, { maxRetries: 2, baseDelayMs: 10 });
  } catch (e) {
    caughtError = e;
  }

  assert.ok(caughtError);
  assert.strictEqual(attempts, 3); // initial + 2 retries
  assert.strictEqual(caughtError.message, 'fail-3');
});

// ---------------------------------------------------------------------------
// 9. withRetry fails fast on CircuitOpenError (no retry)
// ---------------------------------------------------------------------------
test('withRetry does not retry CircuitOpenError', async () => {
  const cb = new CircuitBreaker({ name: 'retry-test', failureThreshold: 1, resetTimeoutMs: 60000 });

  // Trip the circuit
  try { await cb.execute(() => { throw new Error('fail'); }); } catch (_) {}

  let attempts = 0;
  let caughtError = null;
  try {
    await withRetry(() => { attempts++; return 'should not reach'; }, {
      maxRetries: 5,
      baseDelayMs: 10,
      circuit: cb
    });
  } catch (e) {
    caughtError = e;
  }

  assert.ok(caughtError instanceof CircuitOpenError, 'Should throw CircuitOpenError');
  assert.strictEqual(attempts, 0, 'Function should not have been called');
});

// ---------------------------------------------------------------------------
// 10. Stats tracking (totalCalls, totalFailures, totalSuccesses, trips)
// ---------------------------------------------------------------------------
test('stats track totalCalls, totalFailures, totalSuccesses, trips', async () => {
  clearOccurrences(); // Reset global error frequency tracker
  const cb = new CircuitBreaker({ name: 'stats-test', failureThreshold: 2, resetTimeoutMs: 10 });

  // 3 successes
  for (let i = 0; i < 3; i++) await cb.execute(() => 'ok');
  assert.strictEqual(cb.stats.totalCalls, 3);
  assert.strictEqual(cb.stats.totalSuccesses, 3);
  assert.strictEqual(cb.stats.totalFailures, 0);
  assert.strictEqual(cb.stats.trips, 0);

  // 2 failures -> trips
  try { await cb.execute(() => { throw new Error('x'); }); } catch (_) {}
  try { await cb.execute(() => { throw new Error('x'); }); } catch (_) {}
  assert.strictEqual(cb.stats.totalCalls, 5);
  assert.strictEqual(cb.stats.totalFailures, 2);
  assert.strictEqual(cb.stats.trips, 1);
  assert.strictEqual(cb.state, State.OPEN);

  // OPEN rejection still counts as a call
  try { await cb.execute(() => 'nope'); } catch (_) {}
  assert.strictEqual(cb.stats.totalCalls, 6);

  // Recovery: wait, then succeed in HALF_OPEN
  await new Promise(r => setTimeout(r, 20));
  await cb.execute(() => 'recovered');
  assert.strictEqual(cb.stats.totalCalls, 7);
  assert.strictEqual(cb.stats.totalSuccesses, 4);
  assert.strictEqual(cb.state, State.CLOSED);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
test('constructor rejects missing name', () => {
  assert.throws(() => new CircuitBreaker({}), /requires a non-empty string name/);
  assert.throws(() => new CircuitBreaker({ name: '' }), /requires a non-empty string name/);
});

test('execute rejects non-function argument', async () => {
  const cb = new CircuitBreaker({ name: 'test' });
  let err;
  try { await cb.execute('not a function'); } catch (e) { err = e; }
  assert.ok(err instanceof TypeError);
});

test('reset() restores circuit to initial state', async () => {
  const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 60000 });

  // Trip the circuit
  try { await cb.execute(() => { throw new Error('fail'); }); } catch (_) {}
  assert.strictEqual(cb.state, State.OPEN);

  cb.reset();
  assert.strictEqual(cb.state, State.CLOSED);
  assert.strictEqual(cb.failures, 0);
  assert.strictEqual(cb.lastFailureTime, 0);
  assert.strictEqual(cb.halfOpenAttempts, 0);
});

test('getStatus() returns correct snapshot', async () => {
  const cb = new CircuitBreaker({ name: 'snap', failureThreshold: 2, resetTimeoutMs: 5000 });
  await cb.execute(() => 'ok');

  const status = cb.getStatus();
  assert.strictEqual(status.name, 'snap');
  assert.strictEqual(status.state, 'CLOSED');
  assert.strictEqual(status.failures, 0);
  assert.strictEqual(status.nextRetryAt, null);
  assert.strictEqual(status.stats.totalCalls, 1);
  assert.strictEqual(status.stats.totalSuccesses, 1);
});

test('withRetry with circuit breaker routes through circuit', async () => {
  clearOccurrences(); // Reset global error frequency tracker
  const cb = new CircuitBreaker({ name: 'retry-cb', failureThreshold: 5, resetTimeoutMs: 60000 });

  let callCount = 0;
  const result = await withRetry(
    () => { callCount++; if (callCount < 2) throw new Error('once'); return 'done'; },
    { maxRetries: 3, baseDelayMs: 10, circuit: cb }
  );

  assert.strictEqual(result, 'done');
  assert.strictEqual(callCount, 2);
  assert.strictEqual(cb.stats.totalCalls, 2);
  assert.strictEqual(cb.stats.totalFailures, 1);
  assert.strictEqual(cb.stats.totalSuccesses, 1);
});

test('withRetry rejects non-function argument', async () => {
  let err;
  try { await withRetry(42); } catch (e) { err = e; }
  assert.ok(err instanceof TypeError);
});

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
async function runTests() {
  console.log('Running circuit breaker tests...\n');

  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  PASS  ${name}`);
      passed++;
    } catch (error) {
      console.error(`  FAIL  ${name}`);
      console.error(`        ${error.message}`);
      if (error.stack) {
        const firstFrame = error.stack.split('\n').slice(1, 3).map(l => `        ${l.trim()}`).join('\n');
        console.error(firstFrame);
      }
      failed++;
    }
  }

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

  if (failed > 0) process.exit(1);
}

runTests();
