#!/usr/bin/env node
// tests/cache-invalidation.spec.js
// Audits caching invariants and invalidation behavior

const assert = require('assert');
const cache = require('../src/utils/advancedCache');
const dbClient = require('../src/utils/dbClient');

async function run() {
  // Database initialization happens automatically
  cache.clear('all');

  const query = 'What is the Model Context Protocol?';
  const params = { costPreference: 'low' };
  const fakeResult = 'Model Context Protocol (MCP) defines a contract...';

  await cache.storeResult(query, params, fakeResult, 'report-1');
  const firstHit = await cache.findSimilarResult(query, params);
  assert(firstHit, 'expected immediate exact cache hit');
  assert.strictEqual(firstHit.cacheType, 'exact');

  // Ensure semantic miss after clearing
  cache.clear('results');
  const miss = await cache.findSimilarResult(query, params);
  assert.strictEqual(miss, null, 'cache should miss after clear');

  // Verify metrics are available
  const stats = cache.getStats();
  assert(stats.results, 'stats results should be available');
  assert(stats.results.keys >= 0, 'result keys count tracked');
  console.log('Cache stats:', JSON.stringify(stats, null, 2));
}

run().catch(err => {
  console.error('Cache invalidation test failed:', err);
  process.exit(1);
});


