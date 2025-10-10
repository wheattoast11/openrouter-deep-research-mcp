#!/usr/bin/env node
// tests/model-routing.spec.js
// Ensures model routing selects correct tiers and fallbacks

const assert = require('assert');
const planningAgent = require('../src/agents/planningAgent');
const researchAgent = require('../src/agents/researchAgent');
const config = require('../config');

async function testRouting(costPreference, domain) {
  const routes = await researchAgent.selectModelsForQuery({
    costPreference,
    domain,
    complexity: 'moderate'
  });
  assert(routes.primary, 'primary model should be selected');
  const tier = config.models[`${costPreference}Cost`] || [];
  if (tier.length > 0) {
    const names = tier.map(t => typeof t === 'string' ? t : t.name);
    assert(names.includes(routes.primary.name), `primary should be in ${costPreference} tier`);
  }
  return routes;
}

async function main() {
  const standard = await testRouting('low', 'general');
  console.log('Low-cost routing:', standard.primary);

  const high = await testRouting('high', 'technical');
  console.log('High-cost routing:', high.primary);

  const fallback = await researchAgent.selectModelsForQuery({
    costPreference: 'low',
    domain: 'medical-rare'
  });
  assert(fallback.fallbacks && fallback.fallbacks.length >= 1, 'fallback models should be provided');
}

main().catch(err => {
  console.error('Model routing tests failed:', err);
  process.exit(1);
});


