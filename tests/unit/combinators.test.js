// Combinator export unit tests.

'use strict';

const assert = require('assert');

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('Running combinator export tests...\n');

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

test('root combinators wrapper resolves to the core module', () => {
  const packageCombinators = require('../../combinators.js');
  const coreCombinators = require('../../src/core/combinators.js');

  assert.strictEqual(packageCombinators, coreCombinators);
});

test('combinator conveniences construct, duplicate, and complete a small net', () => {
  const {
    construct,
    duplicate,
    annihilate,
    isComplete,
  } = require('../../combinators.js');

  const constructed = construct({ input: 'left' }, { input: 'right' });
  const duplicated = duplicate(constructed, 2);
  const completed = annihilate(duplicated, { net: 'smoke' });

  assert.strictEqual(duplicated.length, 2);
  assert.deepStrictEqual(duplicated[0].value, constructed);
  assert.deepStrictEqual(duplicated[1].value, constructed);
  assert.strictEqual(isComplete(completed), true);
});

runTests();
