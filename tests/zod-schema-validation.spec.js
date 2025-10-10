#!/usr/bin/env node
// tests/zod-schema-validation.spec.js
// Validates that schema normalization accepts compact params

const assert = require('assert');
const tools = require('../src/server/tools');

function testConductResearchSchema() {
  const schema = tools.conductResearchSchema;
  const parsed = schema.parse({ query: 'test', costPreference: 'high' });
  assert.strictEqual(parsed.costPreference, 'high');
}

function main() {
  testConductResearchSchema();
  console.log('Zod schema validation passes.');
}

main();
