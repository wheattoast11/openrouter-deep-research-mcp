/**
 * Shared Handler Utilities Unit Tests
 *
 * Tests for shared utilities: context, capabilities, legacy, fallbacks.
 * Uses native Node.js assert - no test framework required.
 *
 * Run with: node tests/unit/shared.test.js
 */

'use strict';

const assert = require('assert');

// Helper to run tests
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('Running shared utilities tests...\n');

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

// --- Tests for shared/context.js ---

test('validateContext throws ContextError for missing dependency', () => {
  const { validateContext, ContextError } = require('../../src/server/handlers/shared/context');

  assert.throws(() => {
    validateContext({}, ['dbClient']);
  }, ContextError);
});

test('validateContext passes for valid context', () => {
  const { validateContext } = require('../../src/server/handlers/shared/context');

  // Should not throw
  validateContext({ dbClient: {} }, ['dbClient']);
});

test('validators.db throws for missing dbClient', () => {
  const { validators, ContextError } = require('../../src/server/handlers/shared/context');

  assert.throws(() => {
    validators.db({});
  }, ContextError);
});

test('validators.graphOrDb returns available client', () => {
  const { validators } = require('../../src/server/handlers/shared/context');

  const dbOnly = { dbClient: { name: 'db' } };
  assert.strictEqual(validators.graphOrDb(dbOnly).name, 'db');

  const graphOnly = { graphClient: { name: 'graph' } };
  assert.strictEqual(validators.graphOrDb(graphOnly).name, 'graph');

  const both = { graphClient: { name: 'graph' }, dbClient: { name: 'db' } };
  assert.strictEqual(validators.graphOrDb(both).name, 'graph'); // Prefers graph
});

test('hasCapability returns boolean', () => {
  const { hasCapability } = require('../../src/server/handlers/shared/context');

  assert.strictEqual(hasCapability({ dbClient: {} }, 'dbClient'), true);
  assert.strictEqual(hasCapability({}, 'dbClient'), false);
  assert.strictEqual(hasCapability(null, 'dbClient'), false);
});

// --- Tests for shared/capabilities.js ---

test('hasMethod detects callable methods', () => {
  const { hasMethod } = require('../../src/server/handlers/shared/capabilities');

  const client = { query: () => {}, value: 42 };

  assert.strictEqual(hasMethod(client, 'query'), true);
  assert.strictEqual(hasMethod(client, 'value'), false);
  assert.strictEqual(hasMethod(client, 'missing'), false);
  assert.strictEqual(hasMethod(null, 'query'), false);
});

test('hasMethods checks multiple methods', () => {
  const { hasMethods } = require('../../src/server/handlers/shared/capabilities');

  const client = {
    a: () => {},
    b: () => {},
    c: 'not a function'
  };

  assert.strictEqual(hasMethods(client, ['a', 'b']), true);
  assert.strictEqual(hasMethods(client, ['a', 'c']), false);
});

test('withCapability uses method if available', async () => {
  const { withCapability } = require('../../src/server/handlers/shared/capabilities');

  const client = {
    search: async (q) => [{ id: 1, query: q }]
  };

  const result = await withCapability(client, 'search', ['test'], () => []);
  assert.strictEqual(result[0].query, 'test');
});

test('withCapability uses fallback if method missing', async () => {
  const { withCapability } = require('../../src/server/handlers/shared/capabilities');

  const client = {};
  const result = await withCapability(client, 'search', ['test'], () => [{ fallback: true }]);

  assert.strictEqual(result[0].fallback, true);
});

test('withFirstCapability tries methods in order', async () => {
  const { withFirstCapability } = require('../../src/server/handlers/shared/capabilities');

  const client = {
    secondary: async () => 'secondary'
  };

  const result = await withFirstCapability(
    client,
    ['primary', 'secondary', 'tertiary'],
    [],
    () => 'fallback'
  );

  assert.strictEqual(result, 'secondary');
});

// --- Tests for shared/legacy.js ---

test('createLegacyWrapper delegates to handler', async () => {
  const { createLegacyWrapper } = require('../../src/server/handlers/shared/legacy');

  const handler = async (op, params, ctx) => ({ op, params, ctx });
  const wrapper = createLegacyWrapper(handler, 'search');

  const result = await wrapper({ q: 'test' }, { ctx: true });

  assert.strictEqual(result.op, 'search');
  assert.strictEqual(result.params.q, 'test');
  assert.strictEqual(result.ctx.ctx, true);
});

test('createLegacyWrappers creates multiple wrappers', async () => {
  const { createLegacyWrappers } = require('../../src/server/handlers/shared/legacy');

  const handler = async (op, params) => ({ op, ...params });

  const wrappers = createLegacyWrappers(handler, {
    search: 'search',
    query: 'sql'
  });

  assert.ok(wrappers.search);
  assert.ok(wrappers.query);

  const searchResult = await wrappers.search({ k: 5 });
  assert.strictEqual(searchResult.op, 'search');

  const queryResult = await wrappers.query({ sql: 'SELECT 1' });
  assert.strictEqual(queryResult.op, 'sql');
});

test('createUnifiedHandler supports both call patterns', async () => {
  const { createUnifiedHandler } = require('../../src/server/handlers/shared/legacy');

  const operations = {
    search: async (params) => ({ type: 'search', ...params }),
    query: async (params) => ({ type: 'query', ...params })
  };

  const handler = createUnifiedHandler(operations);

  // Pattern 1: (operation, params, ctx)
  const r1 = await handler('search', { q: 'test' }, {});
  assert.strictEqual(r1.type, 'search');

  // Pattern 2: (params with operation, ctx)
  const r2 = await handler({ operation: 'query', sql: 'SELECT 1' }, {});
  assert.strictEqual(r2.type, 'query');
});

// --- Tests for shared/fallbacks.js ---

test('fallbackSearch returns empty array for null client', async () => {
  const { fallbackSearch } = require('../../src/server/handlers/shared/fallbacks');

  const result = await fallbackSearch(null, 'test', 10);
  assert.deepStrictEqual(result, []);
});

test('fallbackStats returns basic stats', async () => {
  const { fallbackStats } = require('../../src/server/handlers/shared/fallbacks');

  const mockDb = {
    query: async (sql) => {
      if (sql.includes('research_reports')) return [{ count: '5' }];
      if (sql.includes('doc_index')) return [{ count: '10' }];
      return [];
    }
  };

  const result = await fallbackStats(mockDb);
  assert.strictEqual(result.reports, 5);
  assert.strictEqual(result.docs, 10);
  assert.strictEqual(result.nodes, 15);
});

test('withFallbacks tries primary then fallback', async () => {
  const { withFallbacks } = require('../../src/server/handlers/shared/fallbacks');

  const primary = {
    working: async () => 'primary',
    broken: async () => { throw new Error('fail'); }
  };

  const fallback = {
    broken: async () => 'fallback',
    onlyFallback: async () => 'only'
  };

  const combined = withFallbacks(primary, fallback);

  assert.strictEqual(await combined.working(), 'primary');
  assert.strictEqual(await combined.broken(), 'fallback');
  assert.strictEqual(await combined.onlyFallback(), 'only');
});

// Run all tests
runTests().catch(console.error);
