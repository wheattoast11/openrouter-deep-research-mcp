/**
 * Consensus Loop Control Unit Tests
 *
 * Tests for consensus-driven research loop wiring:
 * - _iterationConsensus aggregation from sub-query consensus data
 * - Early termination when converged
 * - Divergence tiebreaker extending MAX_ITERATIONS
 * - Backward compatibility when consensus is undefined
 *
 * Run with: node tests/unit/consensus-loop.test.js
 */

'use strict';

const assert = require('assert');

const { ConsensusState } = require('../../src/core/rail/consensus');

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('Running consensus loop control tests...\n');

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
      if (err.stack) console.log(`    ${err.stack.split('\n')[1]?.trim()}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

// ---------------------------------------------------------------
// Helper: Simulate the _iterationConsensus computation from
// researchAgent.js conductParallelResearch (~line 807-838)
// ---------------------------------------------------------------
function computeIterationConsensus(subQueryResultArrays) {
  const consensusDetails = [];
  const nonNullResults = subQueryResultArrays.filter(r => r !== null);

  for (const subQueryResults of nonNullResults) {
    if (Array.isArray(subQueryResults) && subQueryResults._consensus) {
      const c = subQueryResults._consensus;
      const detail = { state: c.state, agreement: c.agreement, confidence: c.confidence };
      consensusDetails.push(detail);
      for (const item of subQueryResults) {
        item._subQueryConsensus = detail;
      }
    }
  }

  const flatResults = nonNullResults.flat();

  if (consensusDetails.length > 0) {
    const convergedCount = consensusDetails.filter(d =>
      d.state === ConsensusState.CONVERGED || d.state === ConsensusState.PHASE_LOCKED
    ).length;
    const divergedCount = consensusDetails.filter(d => d.state === ConsensusState.DIVERGED).length;
    flatResults._iterationConsensus = {
      subQueryCount: consensusDetails.length,
      avgAgreement: consensusDetails.reduce((s, d) => s + (d.agreement || 0), 0) / consensusDetails.length,
      avgConfidence: consensusDetails.reduce((s, d) => s + (d.confidence || 0), 0) / consensusDetails.length,
      convergedCount,
      divergedCount,
      states: consensusDetails.map(d => d.state),
      details: consensusDetails
    };
  }

  return flatResults;
}

// ---------------------------------------------------------------
// Helper: Simulate the loop control decision from
// tools.js (~line 987-1020)
// ---------------------------------------------------------------
function evaluateLoopControl(iterConsensus, opts = {}) {
  const minAgreement = opts.minAgreement ?? 0.6;
  let MAX_ITERATIONS = opts.maxIterations ?? 2;
  let tiebreakerUsed = opts.tiebreakerUsed ?? false;
  let earlyTermination = false;
  const maxResearchIterations = opts.maxResearchIterations ?? 2;

  if (iterConsensus) {
    const convergedRatio = iterConsensus.convergedCount / iterConsensus.subQueryCount;
    const divergedRatio = iterConsensus.divergedCount / iterConsensus.subQueryCount;

    if (convergedRatio >= 0.5 && iterConsensus.avgAgreement >= minAgreement) {
      earlyTermination = true;
    }

    if (!earlyTermination && divergedRatio >= 0.5 && !tiebreakerUsed) {
      const cap = maxResearchIterations + 2;
      if (MAX_ITERATIONS < cap) {
        MAX_ITERATIONS++;
        tiebreakerUsed = true;
      }
    }
  }

  return { earlyTermination, MAX_ITERATIONS, tiebreakerUsed };
}

// ---------------------------------------------------------------
// Helper: Build a mock sub-query result array with _consensus
// ---------------------------------------------------------------
function makeSubQueryResults(state, agreement, confidence) {
  const results = [
    { agentId: 1, model: 'model-a', result: 'answer a', error: false },
    { agentId: 1, model: 'model-b', result: 'answer b', error: false }
  ];
  results._consensus = { state, agreement, confidence, signalCount: 2 };
  return results;
}

// === Test 1: _iterationConsensus computes correctly from 3 sub-queries ===

test('_iterationConsensus computes correctly from 3 sub-query consensuses', () => {
  const sq1 = makeSubQueryResults(ConsensusState.CONVERGED, 0.8, 0.9);
  const sq2 = makeSubQueryResults(ConsensusState.DIVERGED, 0.3, 0.5);
  const sq3 = makeSubQueryResults(ConsensusState.PHASE_LOCKED, 0.9, 0.95);

  const flat = computeIterationConsensus([sq1, sq2, sq3]);

  assert.ok(flat._iterationConsensus, '_iterationConsensus should exist');
  const ic = flat._iterationConsensus;

  assert.strictEqual(ic.subQueryCount, 3);
  assert.strictEqual(ic.convergedCount, 2); // CONVERGED + PHASE_LOCKED
  assert.strictEqual(ic.divergedCount, 1);

  // avgAgreement = (0.8 + 0.3 + 0.9) / 3 ≈ 0.6667
  assert.ok(Math.abs(ic.avgAgreement - (0.8 + 0.3 + 0.9) / 3) < 0.001,
    `avgAgreement should be ~0.667, got ${ic.avgAgreement}`);

  // avgConfidence = (0.9 + 0.5 + 0.95) / 3 ≈ 0.7833
  assert.ok(Math.abs(ic.avgConfidence - (0.9 + 0.5 + 0.95) / 3) < 0.001,
    `avgConfidence should be ~0.783, got ${ic.avgConfidence}`);

  assert.deepStrictEqual(ic.states, [
    ConsensusState.CONVERGED,
    ConsensusState.DIVERGED,
    ConsensusState.PHASE_LOCKED
  ]);

  // Individual results should have _subQueryConsensus stamped
  assert.strictEqual(flat.length, 6); // 2 per sub-query × 3
  assert.ok(flat[0]._subQueryConsensus, 'first result should have _subQueryConsensus');
  assert.strictEqual(flat[0]._subQueryConsensus.state, ConsensusState.CONVERGED);
  assert.strictEqual(flat[2]._subQueryConsensus.state, ConsensusState.DIVERGED);
  assert.strictEqual(flat[4]._subQueryConsensus.state, ConsensusState.PHASE_LOCKED);
});

test('_iterationConsensus handles all PARTIAL states', () => {
  const sq1 = makeSubQueryResults(ConsensusState.PARTIAL, 0.4, 0.6);
  const sq2 = makeSubQueryResults(ConsensusState.PARTIAL, 0.35, 0.55);

  const flat = computeIterationConsensus([sq1, sq2]);
  const ic = flat._iterationConsensus;

  assert.strictEqual(ic.convergedCount, 0);
  assert.strictEqual(ic.divergedCount, 0);
  assert.deepStrictEqual(ic.states, [ConsensusState.PARTIAL, ConsensusState.PARTIAL]);
});

// === Test 2: Early termination when converged ===

test('loop breaks early when >=50% converged and avgAgreement meets threshold', () => {
  // 2 of 3 converged (66%), avgAgreement 0.7 >= 0.6
  const iterConsensus = {
    subQueryCount: 3,
    avgAgreement: 0.7,
    avgConfidence: 0.85,
    convergedCount: 2,
    divergedCount: 0,
    states: [ConsensusState.CONVERGED, ConsensusState.CONVERGED, ConsensusState.PARTIAL]
  };

  const result = evaluateLoopControl(iterConsensus);
  assert.strictEqual(result.earlyTermination, true, 'should trigger early termination');
});

test('loop does NOT break early when avgAgreement below threshold', () => {
  // 2 of 3 converged but avgAgreement 0.5 < 0.6
  const iterConsensus = {
    subQueryCount: 3,
    avgAgreement: 0.5,
    avgConfidence: 0.85,
    convergedCount: 2,
    divergedCount: 0,
    states: [ConsensusState.CONVERGED, ConsensusState.CONVERGED, ConsensusState.PARTIAL]
  };

  const result = evaluateLoopControl(iterConsensus);
  assert.strictEqual(result.earlyTermination, false, 'should NOT terminate early');
});

test('loop does NOT break early when <50% converged', () => {
  // 1 of 3 converged (33%), avgAgreement 0.8
  const iterConsensus = {
    subQueryCount: 3,
    avgAgreement: 0.8,
    avgConfidence: 0.9,
    convergedCount: 1,
    divergedCount: 1,
    states: [ConsensusState.CONVERGED, ConsensusState.DIVERGED, ConsensusState.PARTIAL]
  };

  const result = evaluateLoopControl(iterConsensus);
  assert.strictEqual(result.earlyTermination, false, 'should NOT terminate early');
});

test('PHASE_LOCKED counts as converged for early termination', () => {
  // This tests the full pipeline: PHASE_LOCKED increments convergedCount
  const sq1 = makeSubQueryResults(ConsensusState.PHASE_LOCKED, 0.85, 0.9);
  const sq2 = makeSubQueryResults(ConsensusState.CONVERGED, 0.75, 0.8);
  const sq3 = makeSubQueryResults(ConsensusState.PARTIAL, 0.4, 0.6);

  const flat = computeIterationConsensus([sq1, sq2, sq3]);
  const result = evaluateLoopControl(flat._iterationConsensus);

  assert.strictEqual(result.earlyTermination, true, 'PHASE_LOCKED + CONVERGED should trigger early termination');
});

// === Test 3: Divergence tiebreaker extends MAX_ITERATIONS ===

test('tiebreaker extends MAX_ITERATIONS by 1 when >=50% diverged', () => {
  const iterConsensus = {
    subQueryCount: 4,
    avgAgreement: 0.3,
    avgConfidence: 0.5,
    convergedCount: 0,
    divergedCount: 2, // 50%
    states: [ConsensusState.DIVERGED, ConsensusState.DIVERGED, ConsensusState.PARTIAL, ConsensusState.PARTIAL]
  };

  const result = evaluateLoopControl(iterConsensus, { maxIterations: 2, maxResearchIterations: 2 });
  assert.strictEqual(result.MAX_ITERATIONS, 3, 'MAX_ITERATIONS should increase by 1');
  assert.strictEqual(result.tiebreakerUsed, true, 'tiebreakerUsed should be true');
  assert.strictEqual(result.earlyTermination, false, 'should NOT early terminate');
});

test('tiebreaker only fires once', () => {
  const iterConsensus = {
    subQueryCount: 2,
    avgAgreement: 0.2,
    avgConfidence: 0.4,
    convergedCount: 0,
    divergedCount: 2, // 100%
    states: [ConsensusState.DIVERGED, ConsensusState.DIVERGED]
  };

  // First call: tiebreaker fires
  const first = evaluateLoopControl(iterConsensus, { maxIterations: 2, maxResearchIterations: 2, tiebreakerUsed: false });
  assert.strictEqual(first.MAX_ITERATIONS, 3);
  assert.strictEqual(first.tiebreakerUsed, true);

  // Second call with tiebreakerUsed=true: should NOT fire again
  const second = evaluateLoopControl(iterConsensus, { maxIterations: 3, maxResearchIterations: 2, tiebreakerUsed: true });
  assert.strictEqual(second.MAX_ITERATIONS, 3, 'MAX_ITERATIONS should NOT increase again');
  assert.strictEqual(second.tiebreakerUsed, true);
});

test('tiebreaker respects cap of maxResearchIterations + 2', () => {
  const iterConsensus = {
    subQueryCount: 2,
    avgAgreement: 0.2,
    avgConfidence: 0.4,
    convergedCount: 0,
    divergedCount: 2,
    states: [ConsensusState.DIVERGED, ConsensusState.DIVERGED]
  };

  // Already at cap: maxResearchIterations=2, cap=4, MAX_ITERATIONS=4
  const result = evaluateLoopControl(iterConsensus, { maxIterations: 4, maxResearchIterations: 2, tiebreakerUsed: false });
  assert.strictEqual(result.MAX_ITERATIONS, 4, 'should NOT exceed cap');
  assert.strictEqual(result.tiebreakerUsed, false, 'tiebreaker should not activate when at cap');
});

test('tiebreaker does NOT fire when <50% diverged', () => {
  const iterConsensus = {
    subQueryCount: 4,
    avgAgreement: 0.4,
    avgConfidence: 0.5,
    convergedCount: 0,
    divergedCount: 1, // 25%
    states: [ConsensusState.DIVERGED, ConsensusState.PARTIAL, ConsensusState.PARTIAL, ConsensusState.PARTIAL]
  };

  const result = evaluateLoopControl(iterConsensus, { maxIterations: 2, maxResearchIterations: 2 });
  assert.strictEqual(result.MAX_ITERATIONS, 2, 'MAX_ITERATIONS should not change');
  assert.strictEqual(result.tiebreakerUsed, false);
});

// === Test 4: Backward compatibility with undefined consensus ===

test('loop control is a no-op when _iterationConsensus is undefined', () => {
  const result = evaluateLoopControl(undefined, { maxIterations: 2, maxResearchIterations: 2 });
  assert.strictEqual(result.earlyTermination, false);
  assert.strictEqual(result.MAX_ITERATIONS, 2);
  assert.strictEqual(result.tiebreakerUsed, false);
});

test('loop control is a no-op when _iterationConsensus is null', () => {
  const result = evaluateLoopControl(null, { maxIterations: 3, maxResearchIterations: 2 });
  assert.strictEqual(result.earlyTermination, false);
  assert.strictEqual(result.MAX_ITERATIONS, 3);
  assert.strictEqual(result.tiebreakerUsed, false);
});

test('_iterationConsensus is absent when no sub-query has _consensus', () => {
  // Simulate results without _consensus (e.g., consensus disabled)
  const sq1 = [
    { agentId: 1, model: 'model-a', result: 'answer', error: false }
  ];
  const sq2 = [
    { agentId: 2, model: 'model-b', result: 'answer', error: false }
  ];
  // No _consensus property on either array

  const flat = computeIterationConsensus([sq1, sq2]);
  assert.strictEqual(flat._iterationConsensus, undefined, '_iterationConsensus should not exist');
  assert.strictEqual(flat.length, 2, 'results should still be flattened');
});

test('null entries in results array are filtered out', () => {
  const sq1 = makeSubQueryResults(ConsensusState.CONVERGED, 0.9, 0.95);

  const flat = computeIterationConsensus([sq1, null, null]);
  assert.strictEqual(flat.length, 2, 'null entries should be filtered');
  assert.ok(flat._iterationConsensus, 'consensus should still compute from non-null');
  assert.strictEqual(flat._iterationConsensus.subQueryCount, 1);
});

// === Edge cases ===

test('exactly 50% converged triggers early termination', () => {
  const iterConsensus = {
    subQueryCount: 4,
    avgAgreement: 0.65,
    avgConfidence: 0.8,
    convergedCount: 2, // exactly 50%
    divergedCount: 0,
    states: [ConsensusState.CONVERGED, ConsensusState.CONVERGED, ConsensusState.PARTIAL, ConsensusState.PARTIAL]
  };

  const result = evaluateLoopControl(iterConsensus);
  assert.strictEqual(result.earlyTermination, true, '50% converged should trigger termination');
});

test('exactly 50% diverged triggers tiebreaker', () => {
  const iterConsensus = {
    subQueryCount: 4,
    avgAgreement: 0.3,
    avgConfidence: 0.5,
    convergedCount: 0,
    divergedCount: 2, // exactly 50%
    states: [ConsensusState.DIVERGED, ConsensusState.DIVERGED, ConsensusState.PARTIAL, ConsensusState.PARTIAL]
  };

  const result = evaluateLoopControl(iterConsensus, { maxIterations: 2, maxResearchIterations: 2 });
  assert.strictEqual(result.tiebreakerUsed, true, '50% diverged should trigger tiebreaker');
});

test('convergence takes priority over divergence tiebreaker', () => {
  // Edge case: majority converged AND majority diverged (impossible in practice,
  // but tests that early termination short-circuits before tiebreaker)
  const iterConsensus = {
    subQueryCount: 2,
    avgAgreement: 0.8,
    avgConfidence: 0.9,
    convergedCount: 1, // 50%
    divergedCount: 1,  // 50%
    states: [ConsensusState.CONVERGED, ConsensusState.DIVERGED]
  };

  const result = evaluateLoopControl(iterConsensus, { maxIterations: 2, maxResearchIterations: 2 });
  assert.strictEqual(result.earlyTermination, true, 'convergence should take priority');
  assert.strictEqual(result.tiebreakerUsed, false, 'tiebreaker should not fire after early termination');
});

// Run all tests
runTests();
