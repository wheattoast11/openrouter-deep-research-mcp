#!/usr/bin/env node
// tests/dual-embedding-eval.spec.js
// Compares primary vs alternate embeddings and records metrics

const assert = require('assert');
const path = require('path');
const dbClient = require('../src/utils/dbClient');
const embeddingsAdapter = require('../src/utils/embeddingsAdapter');
const config = require('../config');

async function ensureDualEnabled() {
  if (!config.embeddings?.dual?.enabled) {
    throw new Error('Dual embedding evaluation requires EMBEDDINGS_DUAL_ENABLED=true');
  }
}

async function evaluateEmbeddingPair(query) {
  const primary = await embeddingsAdapter.generateEmbedding(query, { provider: config.embeddings.provider });
  const alt = await embeddingsAdapter.generateEmbedding(query, { provider: config.embeddings.dual.provider });
  assert(Array.isArray(primary) && primary.length > 0, 'Primary embedding missing');
  assert(Array.isArray(alt) && alt.length > 0, 'Alternate embedding missing');

  const cos = embeddingsAdapter.cosineSimilarity(primary, alt);
  return { primary, alt, cosine: cos };
}

async function recordEval(query, metrics) {
  await ensureDualEnabled();
  const insert = await dbClient.executeWithRetry(async () => {
    const status = embeddingsAdapter.getEmbedderStatus();
    const db = dbClient.getDbInstance();
    if (!db) throw new Error('Database not initialized');
    await db.query(
      `INSERT INTO embedding_eval (query, primary_provider, primary_model, secondary_provider, secondary_model, metric)
       VALUES ($1,$2,$3,$4,$5,$6);`,
      [
        query,
        config.embeddings.provider,
        status.model,
        config.embeddings.dual.provider,
        status.model,
        JSON.stringify(metrics)
      ]
    );
  }, 'embedding_eval_insert', null);
  return insert;
}

async function main() {
  await ensureDualEnabled();
  console.log('Dual embedding evaluation (sample queries)');
  const samples = [
    'quantum computing applications',
    'history of the Model Context Protocol',
    'agentic research patterns'
  ];

  for (const query of samples) {
    const metrics = await evaluateEmbeddingPair(query);
    await recordEval(query, { cosine: metrics.cosine, primaryLength: metrics.primary.length, altLength: metrics.alt.length });
    console.log(`Query: ${query} | Cosine(primary, alt) = ${metrics.cosine.toFixed(4)}`);
  }
}

main().catch(err => {
  console.error('Dual embedding evaluation failed:', err);
  process.exit(1);
});

