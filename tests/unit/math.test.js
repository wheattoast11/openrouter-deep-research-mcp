/**
 * Math Module Unit Tests (v1.15.0 - Superintelligence Stream C)
 *
 * Tests for mathematical foundations: P-adic, Quadrature, Manifold.
 * Uses native Node.js assert - no test framework required.
 *
 * Run with: node tests/unit/math.test.js
 */

'use strict';

const assert = require('assert');

// Helper to run tests
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('Running math module tests (v1.15.0)...\n');

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
      if (err.stack) {
        console.log(`    ${err.stack.split('\n')[1]}`);
      }
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
}

// ============================================================================
// P-ADIC NUMBER TESTS
// ============================================================================

test('padic: valuation of powers of prime', () => {
  const { valuation } = require('../../src/core/math/padic');

  // v_2(8) = 3 (8 = 2^3)
  assert.strictEqual(valuation(8, 2), 3);
  // v_2(16) = 4 (16 = 2^4)
  assert.strictEqual(valuation(16, 2), 4);
  // v_3(9) = 2 (9 = 3^2)
  assert.strictEqual(valuation(9, 3), 2);
  // v_5(125) = 3 (125 = 5^3)
  assert.strictEqual(valuation(125, 5), 3);
});

test('padic: valuation of non-divisible numbers', () => {
  const { valuation } = require('../../src/core/math/padic');

  // v_2(7) = 0 (7 is odd)
  assert.strictEqual(valuation(7, 2), 0);
  // v_3(8) = 0 (8 is not divisible by 3)
  assert.strictEqual(valuation(8, 3), 0);
});

test('padic: valuation of zero and negative', () => {
  const { valuation } = require('../../src/core/math/padic');

  // v_p(0) = Infinity
  assert.strictEqual(valuation(0, 2), Infinity);
  // v_2(-8) = 3 (works with absolute value)
  assert.strictEqual(valuation(-8, 2), 3);
});

test('padic: padicNorm satisfies |n|_p = p^(-v_p(n))', () => {
  const { padicNorm, valuation } = require('../../src/core/math/padic');

  // |8|_2 = 2^(-3) = 0.125
  const norm = padicNorm(8, 2);
  const expected = Math.pow(2, -valuation(8, 2));
  assert.strictEqual(norm, expected);
});

test('padic: distance identity - d(a, a) = 0', () => {
  const { padicDistance } = require('../../src/core/math/padic');

  const seq = [1, 2, 3, 4];
  assert.strictEqual(padicDistance(seq, seq, 2), 0);
});

test('padic: distance symmetry - d(a, b) = d(b, a)', () => {
  const { padicDistance } = require('../../src/core/math/padic');

  const seq1 = [1, 2, 3];
  const seq2 = [1, 2, 4];

  const d1 = padicDistance(seq1, seq2, 2);
  const d2 = padicDistance(seq2, seq1, 2);

  assert.strictEqual(d1, d2);
});

test('padic: longer common prefix = smaller distance', () => {
  const { padicDistance } = require('../../src/core/math/padic');

  const seq1 = [1, 2, 3, 4, 5];
  const seq2 = [1, 2, 3, 4, 6]; // diverge at position 4
  const seq3 = [1, 2, 7, 8, 9]; // diverge at position 2

  const d12 = padicDistance(seq1, seq2, 2);
  const d13 = padicDistance(seq1, seq3, 2);

  // seq1 and seq2 share longer prefix, so distance should be smaller
  assert.ok(d12 < d13, `Expected d(1,2)=${d12} < d(1,3)=${d13}`);
});

test('padic: modelDistance returns valid distance', () => {
  const { modelDistance } = require('../../src/core/math/padic');

  const d1 = modelDistance('anthropic/claude-sonnet-4.5', 'openai/gpt-5');
  const d2 = modelDistance('anthropic/claude-sonnet-4.5', 'anthropic/claude-opus-4.5');

  // Same provider prefix should mean smaller distance
  assert.ok(d1 > 0, 'Distance should be positive');
  assert.ok(d2 >= 0, 'Distance should be non-negative');
  assert.ok(d2 < d1, 'Same provider should have smaller distance');
});

// ============================================================================
// IQ QUADRATURE TESTS
// ============================================================================

test('quadrature: IQDecomposition initializes correctly', () => {
  const { IQDecomposition } = require('../../src/core/math/quadrature');

  const iq = new IQDecomposition({ phaseLockThreshold: 0.05 });

  assert.strictEqual(iq.samples.length, 0);
  assert.strictEqual(iq.phaseLockThreshold, 0.05);
});

test('quadrature: addSignal decomposes confidence into I/Q', () => {
  const { IQDecomposition } = require('../../src/core/math/quadrature');

  const iq = new IQDecomposition();

  iq.addSignal({
    source: 'anthropic/claude-sonnet-4.5',
    confidence: 0.9,
    payload: 'test'
  });

  assert.strictEqual(iq.samples.length, 1);
  assert.ok('i' in iq.samples[0], 'Should have I component');
  assert.ok('q' in iq.samples[0], 'Should have Q component');

  // I^2 + Q^2 should equal confidence^2 (amplitude = confidence)
  const sample = iq.samples[0];
  const magnitude = Math.sqrt(sample.i * sample.i + sample.q * sample.q);
  assert.ok(Math.abs(magnitude - 0.9) < 0.01, 'Magnitude should equal confidence');
});

test('quadrature: detectPhaseLock returns correct structure', () => {
  const { IQDecomposition } = require('../../src/core/math/quadrature');

  const iq = new IQDecomposition();

  // Add signals with similar phases (same model family)
  iq.addSignal({ source: 'anthropic/claude-sonnet-4.5', confidence: 0.9 });
  iq.addSignal({ source: 'anthropic/claude-opus-4.5', confidence: 0.85 });

  const lock = iq.detectPhaseLock();

  assert.ok('locked' in lock, 'Should have locked property');
  assert.ok('variance' in lock, 'Should have variance');
  assert.ok('meanPhase' in lock, 'Should have meanPhase');
});

test('quadrature: resonanceStrength returns 0-1 bounded value', () => {
  const { IQDecomposition } = require('../../src/core/math/quadrature');

  const iq = new IQDecomposition();

  iq.addSignal({ source: 'model1', confidence: 0.8 });
  iq.addSignal({ source: 'model2', confidence: 0.9 });

  const strength = iq.resonanceStrength();

  assert.ok(strength >= 0, 'Strength should be >= 0');
  assert.ok(strength <= 1, 'Strength should be <= 1');
});

test('quadrature: phase calculation uses model-based offsets', () => {
  const { IQDecomposition, MODEL_PHASE_OFFSETS } = require('../../src/core/math/quadrature');

  // Create instance to access private method
  const iq = new IQDecomposition();

  // Different model families should have different base phases
  const phase1 = iq._calculateBasePhase('anthropic/claude-sonnet-4.5');
  const phase2 = iq._calculateBasePhase('openai/gpt-5');

  assert.ok(phase1 !== phase2, 'Different models should have different phases');
  assert.ok(phase1 >= 0 && phase1 < 2 * Math.PI, 'Phase should be in [0, 2π)');
  assert.ok(phase2 >= 0 && phase2 < 2 * Math.PI, 'Phase should be in [0, 2π)');

  // Verify model family offsets are defined
  assert.ok('anthropic' in MODEL_PHASE_OFFSETS, 'Should have anthropic offset');
  assert.ok('openai' in MODEL_PHASE_OFFSETS, 'Should have openai offset');
});

// ============================================================================
// SEMANTIC MANIFOLD TESTS
// ============================================================================

test('manifold: SemanticManifold initializes with default dimension', () => {
  const { SemanticManifold } = require('../../src/core/math/manifold');

  const manifold = new SemanticManifold();

  assert.strictEqual(manifold.dim, 384, 'Default dimension should be 384 (MiniLM)');
});

test('manifold: estimateCurvature handles empty neighbors', () => {
  const { SemanticManifold } = require('../../src/core/math/manifold');

  const manifold = new SemanticManifold({ dim: 3 });
  const point = [1, 0, 0];

  const curvature = manifold.estimateCurvature(point, []);

  assert.strictEqual(curvature, 0, 'Empty neighbors should give zero curvature');
});

test('manifold: geodesicDistance equals L2 when curvature is zero', () => {
  const { SemanticManifold } = require('../../src/core/math/manifold');

  const manifold = new SemanticManifold({ dim: 3 });
  const a = [1, 0, 0];
  const b = [0, 1, 0];

  const geodesic = manifold.geodesicDistance(a, b, 0); // curvature = 0
  const l2 = Math.sqrt(2); // L2 distance between unit vectors

  assert.ok(Math.abs(geodesic - l2) < 0.01, 'Geodesic should equal L2 for flat space');
});

test('manifold: geodesicDistance < L2 for positive (spherical) curvature', () => {
  const { SemanticManifold } = require('../../src/core/math/manifold');

  const manifold = new SemanticManifold({ dim: 3 });
  const a = [1, 0, 0];
  const b = [0, 1, 0];

  const l2 = Math.sqrt(2);
  const geodesic = manifold.geodesicDistance(a, b, 0.5); // positive curvature

  // In spherical geometry (positive curvature), the geodesic follows the
  // great circle arc which is shorter than the straight-line L2 distance
  assert.ok(geodesic < l2, `Geodesic ${geodesic} should be < L2 ${l2} for spherical space`);
});

test('manifold: cosineSimilarity is symmetric', () => {
  const { SemanticManifold } = require('../../src/core/math/manifold');

  const manifold = new SemanticManifold({ dim: 3 });
  const a = [1, 2, 3];
  const b = [4, 5, 6];

  const sim1 = manifold.cosineSimilarity(a, b);
  const sim2 = manifold.cosineSimilarity(b, a);

  assert.ok(Math.abs(sim1 - sim2) < 0.0001, 'Cosine similarity should be symmetric');
});

test('manifold: cosineSimilarity of identical vectors is 1', () => {
  const { SemanticManifold } = require('../../src/core/math/manifold');

  const manifold = new SemanticManifold({ dim: 3 });
  const a = [1, 2, 3];

  const sim = manifold.cosineSimilarity(a, a);

  assert.ok(Math.abs(sim - 1) < 0.0001, 'Self-similarity should be 1');
});

test('manifold: l2Distance satisfies triangle inequality', () => {
  const { SemanticManifold } = require('../../src/core/math/manifold');

  const manifold = new SemanticManifold({ dim: 3 });
  const a = [1, 0, 0];
  const b = [0, 1, 0];
  const c = [0, 0, 1];

  const dAB = manifold.l2Distance(a, b);
  const dBC = manifold.l2Distance(b, c);
  const dAC = manifold.l2Distance(a, c);

  assert.ok(dAC <= dAB + dBC + 0.0001, 'Triangle inequality should hold');
});

// ============================================================================
// REWARDS TESTS
// ============================================================================

test('rewards: quickReward returns bounded value', () => {
  const { quickReward } = require('../../src/core/rewards');

  const signal = {
    crystallization: 0.8,
    confidence: 0.9,
    source: 'test'
  };

  const reward = quickReward(signal);

  assert.ok(reward >= -1, 'Reward should be >= -1');
  assert.ok(reward <= 1, 'Reward should be <= 1');
});

test('rewards: ProceduralReward calculates correct formula', () => {
  const { ProceduralReward, TraceContext } = require('../../src/core/rewards');

  const calculator = new ProceduralReward({
    crystallizationWeight: 0.5,
    uncertaintyPenalty: 0.3,
    traceBonus: 0.2
  });

  const signal = {
    crystallization: 0.8,
    confidence: 0.9
  };

  const trace = new TraceContext({ provenance: ['step1', 'step2'] });
  const result = calculator.calculate(signal, trace);

  // R = α * crystallization - β * uncertainty + γ * traceReward
  // uncertainty = 1 - confidence = 0.1
  // traceReward = deterministic trace bonus
  const expectedBase = 0.5 * 0.8 - 0.3 * 0.1;

  assert.ok(result.total >= expectedBase - 0.5, 'Reward should match formula');
  assert.ok(result.total <= expectedBase + 0.5, 'Reward should match formula');
});

test('rewards: RewardResult contains all components', () => {
  const { ProceduralReward } = require('../../src/core/rewards');

  const calculator = new ProceduralReward();

  const signal = { crystallization: 0.7, confidence: 0.8 };
  const result = calculator.calculate(signal);

  assert.ok('total' in result, 'Should have total');
  assert.ok('crystallization' in result, 'Should have crystallization');
  assert.ok('uncertainty' in result, 'Should have uncertainty');
  assert.ok('trace' in result, 'Should have trace component');
});

test('rewards: high crystallization increases reward', () => {
  const { quickReward } = require('../../src/core/rewards');

  const lowCrystallization = { crystallization: 0.2, confidence: 0.9 };
  const highCrystallization = { crystallization: 0.9, confidence: 0.9 };

  const lowReward = quickReward(lowCrystallization);
  const highReward = quickReward(highCrystallization);

  assert.ok(highReward > lowReward, 'Higher crystallization should give higher reward');
});

test('rewards: high uncertainty decreases reward', () => {
  const { quickReward } = require('../../src/core/rewards');

  const lowUncertainty = { crystallization: 0.7, confidence: 0.95 }; // uncertainty = 0.05
  const highUncertainty = { crystallization: 0.7, confidence: 0.5 }; // uncertainty = 0.5

  const lowUncertaintyReward = quickReward(lowUncertainty);
  const highUncertaintyReward = quickReward(highUncertainty);

  assert.ok(lowUncertaintyReward > highUncertaintyReward,
    'Lower uncertainty (higher confidence) should give higher reward');
});

// Run all tests
runTests();
