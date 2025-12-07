/**
 * Configuration Unit Tests
 *
 * Tests for config validation and constants.
 * Uses native Node.js assert - no test framework required.
 *
 * Run with: node tests/unit/config.test.js
 */

'use strict';

const assert = require('assert');

// Helper to run tests
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('Running configuration tests...\n');

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

// --- Tests for src/config/constants.js ---

test('constants exports SERVER defaults', () => {
  const { SERVER } = require('../../src/config/constants');

  assert.strictEqual(typeof SERVER.DEFAULT_PORT, 'number');
  assert.strictEqual(typeof SERVER.STARTUP_TIMEOUT_MS, 'number');
});

test('constants exports DATABASE defaults', () => {
  const { DATABASE } = require('../../src/config/constants');

  assert.strictEqual(DATABASE.VECTOR_DIMENSION, 384);
  assert.ok(DATABASE.CACHE_TTL_SECONDS > 0);
});

test('constants exports CORE defaults', () => {
  const { CORE } = require('../../src/config/constants');

  assert.strictEqual(CORE.CONSENSUS_MIN_AGREEMENT, 0.6);
  assert.ok(CORE.ROLESHIFT_TIMEOUT_MS > 0);
});

test('constants exports MODEL_WEIGHTS', () => {
  const { MODEL_WEIGHTS } = require('../../src/config/constants');

  assert.ok(MODEL_WEIGHTS['anthropic/claude-sonnet-4']);
  assert.ok(MODEL_WEIGHTS.default);
  assert.strictEqual(typeof MODEL_WEIGHTS.default, 'number');
});

test('constants exports DEFAULT_MODELS tiers', () => {
  const { DEFAULT_MODELS } = require('../../src/config/constants');

  assert.ok(Array.isArray(DEFAULT_MODELS.HIGH_COST));
  assert.ok(Array.isArray(DEFAULT_MODELS.LOW_COST));
  assert.ok(Array.isArray(DEFAULT_MODELS.VERY_LOW_COST));

  // Each model should have name and domains
  for (const model of DEFAULT_MODELS.HIGH_COST) {
    assert.ok(model.name);
    assert.ok(Array.isArray(model.domains));
  }
});

// --- Tests for src/config/schema.js ---

test('validateConfig accepts valid config', () => {
  const { validateConfig } = require('../../src/config/schema');

  const result = validateConfig({
    server: { port: 3000 },
    logging: { level: 'debug' }
  });

  assert.strictEqual(result.success, true);
});

test('validateConfig applies defaults', () => {
  const { parseConfig } = require('../../src/config/schema');

  const config = parseConfig({});

  assert.ok(config.server.port);
  assert.ok(config.logging.level);
  assert.ok(config.database.vectorDimension);
});

test('validateEnv warns for missing API key', () => {
  const { validateEnv } = require('../../src/config/schema');

  const warnings = validateEnv({});

  assert.ok(warnings.some(w => w.key === 'OPENROUTER_API_KEY'));
});

test('validateEnv no warning when API key present', () => {
  const { validateEnv } = require('../../src/config/schema');

  const warnings = validateEnv({ OPENROUTER_API_KEY: 'test-key' });

  assert.ok(!warnings.some(w => w.key === 'OPENROUTER_API_KEY'));
});

test('validateEnv no warning when ALLOW_NO_API_KEY set', () => {
  const { validateEnv } = require('../../src/config/schema');

  const warnings = validateEnv({ ALLOW_NO_API_KEY: 'true' });

  assert.ok(!warnings.some(w => w.key === 'OPENROUTER_API_KEY'));
});

test('validateEnv warns for invalid LOG_LEVEL', () => {
  const { validateEnv } = require('../../src/config/schema');

  const warnings = validateEnv({
    OPENROUTER_API_KEY: 'test',
    LOG_LEVEL: 'invalid'
  });

  assert.ok(warnings.some(w => w.key === 'LOG_LEVEL'));
});

test('booleanFromEnv coerces strings correctly', () => {
  const { booleanFromEnv } = require('../../src/config/schema');

  assert.strictEqual(booleanFromEnv.parse('true'), true);
  assert.strictEqual(booleanFromEnv.parse('1'), true);
  assert.strictEqual(booleanFromEnv.parse('yes'), true);
  assert.strictEqual(booleanFromEnv.parse('false'), false);
  assert.strictEqual(booleanFromEnv.parse('0'), false);
  assert.strictEqual(booleanFromEnv.parse('no'), false);
});

test('numberFromEnv coerces with fallback', () => {
  const { numberFromEnv } = require('../../src/config/schema');

  const schema = numberFromEnv(42);

  assert.strictEqual(schema.parse('100'), 100);
  assert.strictEqual(schema.parse('invalid'), 42);
  assert.strictEqual(schema.parse(undefined), 42);
});

// --- Tests for index.js combined exports ---

test('config index exports all constants', () => {
  const config = require('../../src/config');

  assert.ok(config.SERVER);
  assert.ok(config.DATABASE);
  assert.ok(config.MODELS);
  assert.ok(config.validateConfig);
  assert.ok(config.schemas);
});

// Run all tests
runTests().catch(console.error);
