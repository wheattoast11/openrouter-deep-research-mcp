// src/utils/embeddingsAdapter-huggingface.js
// Fallback HuggingFace embeddings adapter

const config = require('../../config');

let embedder = null;
let isReady = false;

async function initializeEmbeddings() {
  if (isReady && embedder) {
    return { ready: true, provider: 'huggingface', dimension: 384 };
  }

  try {
    const transformers = await import('@huggingface/transformers');
    process.stderr.write(`[${new Date().toISOString()}] Initializing HuggingFace embeddings...\n`);

    embedder = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      device: 'cpu'
    });

    isReady = true;
    process.stderr.write(`[${new Date().toISOString()}] ✓ HuggingFace embeddings ready\n`);

    return {
      ready: true,
      provider: 'huggingface',
      dimension: 384
    };
  } catch (error) {
    process.stderr.write(`[${new Date().toISOString()}] ❌ HuggingFace embeddings failed: ${error.message}\n`);
    throw error;
  }
}

async function embed(text) {
  if (!isReady) {
    await initializeEmbeddings();
  }

  const output = await embedder(text);
  return Array.isArray(output[0]) ? output[0] : output[0][0];
}

async function embedBatch(texts) {
  const results = [];
  for (const text of texts) {
    results.push(await embed(text));
  }
  return results;
}

module.exports = {
  initializeEmbeddings,
  embed,
  embedBatch
};
