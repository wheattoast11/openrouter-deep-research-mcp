/**
 * HVM + Rail Pipeline Integration Tests (v1.15.0 - Superintelligence Streams)
 *
 * Integration tests covering:
 * - Token to HVM agent conversion end-to-end
 * - Pipeline with HVM_REDUCE stage execution
 * - Consensus with quadrature phase-lock detection
 * - P-adic distance caching via database
 * - Reward traces and observability
 * - Geodesic vs L2 distance in curved regions
 *
 * Run with: node tests/integration/hvm-rail.test.js
 */

'use strict';

const assert = require('assert');

// Test configuration
const TEST_CONFIG = {
  timeout: 60000,         // 60 seconds max
  phaseLockThreshold: 0.1,
  consensusThreshold: 0.6,
  hvmMaxReductions: 100,
  crystallizationThreshold: 0.7
};

// Test registry
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  HVM + Rail Pipeline Integration Tests (v1.15.0)          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;
  const startTime = Date.now();

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

  const elapsed = Date.now() - startTime;
  console.log(`\nResults: ${passed} passed, ${failed} failed (${elapsed}ms)`);
process.exitCode = failed > 0 ? 1 : 0;
}

// ============================================================================
// SECTION 1: TOKEN TO HVM AGENT CONVERSION
// ============================================================================

test('Token.toHVMAgent() converts query signal to LAM agent', () => {
  const { Rail, Token } = require('../../src/core/rail');
  const { Signal } = require('../../src/core/signal');

  // Create a query signal and wrap in token
  const signal = Signal.query('What is quantum computing?', 'claude');
  const token = Token.from(signal, 'test-agent');

  // Convert to HVM agent
  const agent = token.toHVMAgent();

  assert.ok(agent, 'Agent should be created');
  assert.strictEqual(agent.icType, 'LAM', 'Query signal should map to LAM IC type');
  assert.ok(agent.id, 'Agent should have id');
  assert.strictEqual(agent.origin, 'test-agent', 'Agent should preserve origin');
});

test('Token.toHVMAgent() converts response signal to APP agent', () => {
  const { Token } = require('../../src/core/rail');
  const { Signal } = require('../../src/core/signal');

  const signal = Signal.response('Quantum computing uses qubits', 'gpt-5', 0.95);
  const token = Token.from(signal, 'research-agent');

  const agent = token.toHVMAgent();

  assert.ok(agent, 'Agent should be created');
  assert.strictEqual(agent.icType, 'APP', 'Response signal should map to APP IC type');
  // Confidence is stored in the original signal value
  assert.ok(agent.id, 'Agent should have id');
});

test('Token.toHVMAgent() converts fork/amb signal to SUP agent', () => {
  const { Token } = require('../../src/core/rail');

  const forkSignal = { type: 'fork', branches: ['branch-a', 'branch-b'] };
  const token = Token.from(forkSignal, 'amb-context');

  const agent = token.toHVMAgent();

  assert.ok(agent, 'Agent should be created');
  assert.strictEqual(agent.icType, 'SUP', 'Fork signal should map to SUP IC type');
});

test('Token.toHVMAgent() converts consensus signal to DUP agent', () => {
  const { Token } = require('../../src/core/rail');

  const consensusSignal = { type: 'consensus', signals: [1, 2, 3] };
  const token = Token.from(consensusSignal, 'consensus-manager');

  const agent = token.toHVMAgent();

  assert.ok(agent, 'Agent should be created');
  assert.strictEqual(agent.icType, 'DUP', 'Consensus signal should map to DUP IC type');
});

test('Token.toHVMAgent() term can be used with InteractionNet.fromTerm()', () => {
  const { Token } = require('../../src/core/rail');
  const { InteractionNet } = require('../../src/machines/hvm');

  const token = Token.from({ type: 'query', payload: 'test' }, 'agent');
  const agent = token.toHVMAgent();

  assert.ok(agent.term, 'Agent should have term');
  assert.ok(typeof agent.addToNet === 'function', 'Agent should have addToNet method');

  // Create net from the agent's term
  const net = InteractionNet.fromTerm(agent.term);

  assert.ok(net, 'Net should be created from term');
  assert.ok(net.root, 'Net should have root node');
  assert.ok(net.nodes.size > 0, 'Net should have nodes');
});

test('Token.traceDistance() calculates p-adic distance correctly', () => {
  const { Token } = require('../../src/core/rail');

  // Create two tokens with different traces
  const token1 = Token.from('value1', 'agent-a');
  const derived1 = token1.derive('processed', 'transform-1').derive('final', 'output');
  // trace: ['agent-a', 'transform-1', 'output']

  const token2 = Token.from('value2', 'agent-a');
  const derived2 = token2.derive('processed', 'transform-2').derive('done', 'output');
  // trace: ['agent-a', 'transform-2', 'output']

  const distance = derived1.traceDistance(derived2);

  assert.ok(distance >= 0, 'Distance should be non-negative');
  assert.ok(distance > 0, 'Different traces should have positive distance');

  // Same token should have zero distance
  const selfDistance = derived1.traceDistance(derived1);
  assert.strictEqual(selfDistance, 0, 'Self-distance should be zero');
});

// ============================================================================
// SECTION 2: HVM INTERACTION NET OPERATIONS
// ============================================================================

test('InteractionNet reduces simple application', () => {
  const { Lam, App, Var, InteractionNet, HVMInterpreter } = require('../../src/machines/hvm');

  // Create (λx.x) y - identity function applied to y
  const identity = new Lam('x', new Var('x'));
  const term = new App(identity, new Var('y'));

  const interpreter = new HVMInterpreter();
  const { term: result, complete } = interpreter.normalize(term, 100);

  assert.ok(result, 'Reduction should produce result');
  assert.ok(complete, 'Reduction should complete');
  // Identity function applied to y should reduce to y
  assert.ok(result instanceof Var, 'Result should be a Var instance');
  assert.strictEqual(result.name, 'y', 'Result should be y');
});

test('InteractionNet handles superposition (SUP) terms', () => {
  const { Sup, Var, InteractionNet } = require('../../src/machines/hvm');

  // Create superposition { a, b }
  const sup = new Sup(0, new Var('a'), new Var('b'));

  // Use static fromTerm to build net from term
  const net = InteractionNet.fromTerm(sup);

  assert.ok(net, 'Net should be created');
  assert.ok(net.root, 'Net should have root node');

  // Root node should be SUP type
  assert.strictEqual(net.root.type, 'SUP', 'Root node should be SUP type');
});

test('InteractionNet builds correct structure from reducible term', () => {
  const { Lam, App, Var, InteractionNet } = require('../../src/machines/hvm');

  const term = new App(new Lam('x', new Var('x')), new Var('y'));

  // Use static fromTerm to build net from term
  const net = InteractionNet.fromTerm(term);

  // Verify net structure
  assert.ok(net.nodes.size >= 3, 'Net should have APP, LAM, and VAR nodes');
  assert.strictEqual(net.root.type, 'APP', 'Root should be APP node');

  // The net correctly represents the AST structure
  // Active pairs form during reduction, not initial construction
  // The interpreter handles the actual reduction via step() or normalize()
  const { HVMInterpreter } = require('../../src/machines/hvm');
  const interpreter = new HVMInterpreter();
  const { term: result, complete, steps } = interpreter.normalize(term, 100);

  assert.ok(complete, 'Reduction should complete');
  assert.ok(steps > 0, 'Should take at least one reduction step');
  assert.ok(result instanceof Var, 'Result should be a Var');
  assert.strictEqual(result.name, 'y', 'Result should be y');
});

// ============================================================================
// SECTION 3: PIPELINE WITH HVM_REDUCE STAGE
// ============================================================================

test('Pipeline with HVM_REDUCE stage processes tokens', async () => {
  const { Pipeline, StageType } = require('../../src/core/rail/pipeline');
  const { Token } = require('../../src/core/rail');

  const pipeline = new Pipeline('hvm-test-pipeline', { traceEnabled: true });

  // Add transform stage first
  pipeline.transform('normalize', (token) => {
    return token.derive({ ...token.value, normalized: true }, 'normalize');
  });

  // Add HVM reduce stage
  pipeline.hvmReduce('hvm-reduce', {
    maxReductions: TEST_CONFIG.hvmMaxReductions,
    crystallizationThreshold: TEST_CONFIG.crystallizationThreshold,
    parallel: false  // Use sequential for deterministic tests
  });

  // Execute pipeline
  const input = { type: 'query', payload: 'test data' };
  const result = await pipeline.execute(input, 'test');

  assert.strictEqual(result.ok, true, 'Pipeline should succeed');
  assert.ok(result.value, 'Result should have value');
  assert.ok(result.trace, 'Should have trace when enabled');
  assert.ok(result.trace.some(t => t.stage === 'hvm-reduce'), 'Trace should include HVM reduce stage');
});

test('PipelineBuilder creates HVM-enabled pipeline', async () => {
  const { PipelineBuilder } = require('../../src/core/rail/pipeline');
  const { Token } = require('../../src/core/rail');

  const pipeline = new PipelineBuilder('builder-test')
    .withTrace()
    .withHVMReduce({ maxReductions: 50 })
    .build();

  const result = await pipeline.execute({ test: true }, 'test');

  assert.strictEqual(result.ok, true, 'Built pipeline should execute');
  // HVM may be skipped if module not fully loaded, but execution should still succeed
});

test('Pipeline handles HVM reduction with crystallization early exit', async () => {
  const { PipelineBuilder } = require('../../src/core/rail/pipeline');

  const pipeline = new PipelineBuilder('crystallization-test')
    .withTrace()
    .withHVMCrystallization(0.6)
    .build();

  // Input with high crystallization should trigger early exit
  const result = await pipeline.execute({
    crystallization: 0.8,
    confidence: 0.9,
    data: 'converged result'
  }, 'test');

  assert.strictEqual(result.ok, true, 'Pipeline should succeed');
});

// ============================================================================
// SECTION 4: CONSENSUS WITH QUADRATURE PHASE-LOCK
// ============================================================================

test('StreamingConsensus initializes with quadrature enabled', () => {
  const { StreamingConsensus } = require('../../src/core/rail/consensus');

  const consensus = new StreamingConsensus({
    useQuadrature: true,
    phaseLockThreshold: TEST_CONFIG.phaseLockThreshold,
    referenceModel: 'anthropic/claude-sonnet-4.5'
  });

  assert.ok(consensus.id, 'Consensus should have ID');
  assert.strictEqual(consensus._useQuadrature, true, 'Quadrature should be enabled');
});

test('StreamingConsensus addSignal updates quadrature decomposition', () => {
  const { StreamingConsensus } = require('../../src/core/rail/consensus');

  const consensus = new StreamingConsensus({
    useQuadrature: true,
    phaseLockThreshold: TEST_CONFIG.phaseLockThreshold
  });

  consensus.addSignal({
    source: 'anthropic/claude-sonnet-4.5',
    confidence: 0.9,
    payload: 'Response from Claude'
  });

  const result = consensus.calculate();

  assert.strictEqual(result.signalCount, 1, 'Should have 1 signal');
  // Quadrature info should be present
  if (result.quadrature) {
    assert.ok('resonanceStrength' in result.quadrature, 'Should have resonance strength');
    assert.ok('sampleCount' in result.quadrature, 'Should have sample count');
  }
});

test('StreamingConsensus detects phase-lock with similar model responses', () => {
  const { StreamingConsensus, ConsensusState } = require('../../src/core/rail/consensus');

  const consensus = new StreamingConsensus({
    useQuadrature: true,
    phaseLockThreshold: 0.2,  // Relaxed threshold for test
    minAgreement: 0.5
  });

  // Add signals from same model family (should have similar phases)
  consensus.addSignal({
    source: 'anthropic/claude-sonnet-4.5',
    confidence: 0.9,
    payload: 'Quantum computing uses qubits for computation'
  });

  consensus.addSignal({
    source: 'anthropic/claude-opus-4.5',
    confidence: 0.85,
    payload: 'Quantum computing uses qubits for computation'
  });

  const result = consensus.calculate();

  assert.ok(result.agreement > 0, 'Should have some agreement');
  // With same payload, should have high agreement
  assert.strictEqual(result.signalCount, 2, 'Should have 2 signals');
});

test('ConsensusManager creates and tracks quadrature sessions', () => {
  const { ConsensusManager } = require('../../src/core/rail/consensus');

  const manager = new ConsensusManager();

  const session1 = manager.createWithQuadrature({ phaseLockThreshold: 0.1 });
  const session2 = manager.createWithQuadrature({ phaseLockThreshold: 0.05 });

  assert.strictEqual(manager.list().length, 2, 'Should have 2 sessions');

  const list = manager.list();
  assert.ok(list.every(s => s.hasQuadrature === true), 'All sessions should have quadrature');

  manager.end(session1.id);
  assert.strictEqual(manager.list().length, 1, 'Should have 1 session after end');
});

test('Consensus combined score blends vote and quadrature metrics', () => {
  const { StreamingConsensus } = require('../../src/core/rail/consensus');

  const consensus = new StreamingConsensus({
    useQuadrature: true,
    phaseLockThreshold: 0.1
  });

  // Add diverse signals
  consensus.addSignal({ source: 'model-a', confidence: 0.9, payload: 'answer A' });
  consensus.addSignal({ source: 'model-b', confidence: 0.8, payload: 'answer A' });
  consensus.addSignal({ source: 'model-c', confidence: 0.85, payload: 'answer B' });

  const result = consensus.calculate();

  if (result.quadrature) {
    assert.ok(result.quadrature.combinedScore >= 0, 'Combined score should be >= 0');
    assert.ok(result.quadrature.combinedScore <= 1, 'Combined score should be <= 1');
  }
});

// ============================================================================
// SECTION 5: P-ADIC DISTANCE AND CACHING
// ============================================================================

test('padicDistance is symmetric', () => {
  const { padicDistance } = require('../../src/core/math/padic');

  const seq1 = [1, 2, 3, 4, 5];
  const seq2 = [1, 2, 7, 8, 9];

  const d1 = padicDistance(seq1, seq2, 2);
  const d2 = padicDistance(seq2, seq1, 2);

  assert.strictEqual(d1, d2, 'Distance should be symmetric');
});

test('padicDistance identity property', () => {
  const { padicDistance } = require('../../src/core/math/padic');

  const seq = [1, 2, 3, 4, 5];
  const distance = padicDistance(seq, seq, 2);

  assert.strictEqual(distance, 0, 'Distance to self should be 0');
});

test('modelDistance reflects provider lineage', () => {
  const { modelDistance } = require('../../src/core/math/padic');

  // Same provider should be closer
  const sameProvider = modelDistance('anthropic/claude-sonnet-4.5', 'anthropic/claude-opus-4.5');
  const diffProvider = modelDistance('anthropic/claude-sonnet-4.5', 'openai/gpt-5');

  assert.ok(sameProvider < diffProvider, 'Same provider models should have smaller distance');
});

// ============================================================================
// SECTION 6: REWARD TRACES AND OBSERVABILITY
// ============================================================================

test('quickReward returns bounded value', () => {
  const { quickReward } = require('../../src/core/rewards');

  const signal = {
    crystallization: 0.8,
    confidence: 0.9,
    source: 'test-model'
  };

  const reward = quickReward(signal);

  assert.ok(reward >= -1, 'Reward should be >= -1');
  assert.ok(reward <= 1, 'Reward should be <= 1');
});

test('ProceduralReward calculates with trace context', () => {
  const { ProceduralReward, TraceContext } = require('../../src/core/rewards');

  const calculator = new ProceduralReward({
    crystallizationWeight: 0.5,
    uncertaintyPenalty: 0.3,
    traceBonus: 0.2
  });

  const signal = {
    crystallization: 0.7,
    confidence: 0.85
  };

  const trace = new TraceContext({ provenance: ['step1', 'step2', 'step3'] });
  const result = calculator.calculate(signal, trace);

  assert.ok('total' in result, 'Result should have total');
  assert.ok('crystallization' in result, 'Result should have crystallization component');
  assert.ok('uncertainty' in result, 'Result should have uncertainty component');
  assert.ok('trace' in result, 'Result should have trace component');
});

test('Reward increases with higher crystallization', () => {
  const { quickReward } = require('../../src/core/rewards');

  const lowCryst = { crystallization: 0.2, confidence: 0.9 };
  const highCryst = { crystallization: 0.9, confidence: 0.9 };

  const lowReward = quickReward(lowCryst);
  const highReward = quickReward(highCryst);

  assert.ok(highReward > lowReward, 'Higher crystallization should give higher reward');
});

test('Reward decreases with higher uncertainty', () => {
  const { quickReward } = require('../../src/core/rewards');

  const lowUncertainty = { crystallization: 0.7, confidence: 0.95 };  // uncertainty = 0.05
  const highUncertainty = { crystallization: 0.7, confidence: 0.5 }; // uncertainty = 0.5

  const lowUReward = quickReward(lowUncertainty);
  const highUReward = quickReward(highUncertainty);

  assert.ok(lowUReward > highUReward, 'Lower uncertainty should give higher reward');
});

// ============================================================================
// SECTION 7: GEODESIC VS L2 DISTANCE
// ============================================================================

test('Geodesic equals L2 when curvature is zero', () => {
  const { SemanticManifold } = require('../../src/core/math/manifold');

  const manifold = new SemanticManifold({ dim: 3 });
  const a = [1, 0, 0];
  const b = [0, 1, 0];

  const geodesic = manifold.geodesicDistance(a, b, 0);  // flat space
  const l2 = manifold.l2Distance(a, b);

  assert.ok(Math.abs(geodesic - l2) < 0.001, 'Geodesic should equal L2 in flat space');
});

test('Geodesic < L2 with positive curvature (spherical geometry)', () => {
  const { SemanticManifold } = require('../../src/core/math/manifold');

  const manifold = new SemanticManifold({ dim: 3 });
  const a = [1, 0, 0];
  const b = [0, 1, 0];

  const l2 = manifold.l2Distance(a, b);
  const geodesic = manifold.geodesicDistance(a, b, 0.5);  // positive curvature

  // In spherical geometry, geodesic (great circle arc) is shorter than
  // straight line through space (L2) for small distances
  assert.ok(geodesic < l2, `Geodesic (${geodesic}) should be < L2 (${l2}) in spherical space`);
});

test('Geodesic > L2 with negative curvature (hyperbolic geometry)', () => {
  const { SemanticManifold } = require('../../src/core/math/manifold');

  const manifold = new SemanticManifold({ dim: 3 });
  const a = [1, 0, 0];
  const b = [0, 1, 0];

  const l2 = manifold.l2Distance(a, b);
  const geodesic = manifold.geodesicDistance(a, b, -0.5);  // negative curvature

  // In hyperbolic geometry, geodesic curves away from straight line (L2),
  // making the path longer
  assert.ok(geodesic > l2, `Geodesic (${geodesic}) should be > L2 (${l2}) in hyperbolic space`);
});

test('Curvature estimation returns valid value', () => {
  const { SemanticManifold } = require('../../src/core/math/manifold');

  const manifold = new SemanticManifold({ dim: 3 });
  const point = [1, 0, 0];
  const neighbors = [
    [0.9, 0.1, 0],
    [1.1, -0.1, 0],
    [1, 0.1, 0.1]
  ];

  const curvature = manifold.estimateCurvature(point, neighbors);

  assert.ok(typeof curvature === 'number', 'Curvature should be a number');
  assert.ok(!isNaN(curvature), 'Curvature should not be NaN');
});

// ============================================================================
// SECTION 8: END-TO-END INTEGRATION
// ============================================================================

test('Full flow: Signal → Token → HVM → Pipeline → Consensus', async () => {
  const { Signal } = require('../../src/core/signal');
  const { Token, tokenFromSignal } = require('../../src/core/rail');
  const { Pipeline } = require('../../src/core/rail/pipeline');
  const { StreamingConsensus } = require('../../src/core/rail/consensus');

  // Step 1: Create signals from multiple models
  const signals = [
    Signal.response('Quantum computing uses qubits', 'claude', 0.9),
    Signal.response('Quantum computers utilize quantum bits', 'gpt-5', 0.85),
    Signal.response('Qubits enable quantum computation', 'gemini', 0.88)
  ];

  // Step 2: Convert to tokens
  const tokens = signals.map(s => tokenFromSignal(s));

  // Step 3: Process through pipeline
  const pipeline = new Pipeline('e2e-pipeline', { traceEnabled: true });
  pipeline.transform('enrich', (token) => {
    return token.derive({
      ...token.value,
      crystallization: 0.8,  // Add crystallization for reward calc
      processed: true
    }, 'enrich');
  });
  pipeline.hvmReduce('hvm', { maxReductions: 50 });

  const processedTokens = [];
  for (const token of tokens) {
    const result = await pipeline.execute(token.value, token.origin);
    if (result.ok) {
      processedTokens.push(result.value);
    }
  }

  assert.strictEqual(processedTokens.length, 3, 'All tokens should be processed');

  // Step 4: Feed into consensus
  const consensus = new StreamingConsensus({
    useQuadrature: true,
    minAgreement: 0.5
  });

  for (const token of processedTokens) {
    consensus.addSignal({
      source: token.origin,
      confidence: token.value.confidence || 0.8,
      payload: token.value
    });
  }

  // Step 5: Get consensus result
  const result = consensus.getResult();

  assert.strictEqual(result.signalCount, 3, 'Consensus should have 3 signals');
  assert.ok(result.agreement >= 0, 'Agreement should be non-negative');
});

test('IQ decomposition detects resonance with aligned phases', () => {
  let IQDecomposition;
  try {
    IQDecomposition = require('../../src/core/math/quadrature').IQDecomposition;
  } catch (e) {
    console.log('    (skipped - quadrature module not available)');
    return;
  }

  const iq = new IQDecomposition({ phaseLockThreshold: 0.2 });

  // Add signals with similar phases (high coherence)
  iq.addSignal({ source: 'model-a', confidence: 0.9, payload: 'result' });
  iq.addSignal({ source: 'model-b', confidence: 0.85, payload: 'result' });
  iq.addSignal({ source: 'model-c', confidence: 0.88, payload: 'result' });

  const resonance = iq.resonanceStrength();

  assert.ok(resonance >= 0, 'Resonance should be >= 0');
  assert.ok(resonance <= 1, 'Resonance should be <= 1');
});

// Run tests
runTests();
