// src/utils/embeddingsAdapter.js
// Unified embeddings adapter using @terminals-tech/embeddings

const config = require('../../config');
const { performance } = require('perf_hooks');

let embeddingsClient = null;
let isReady = false;
let currentProvider = null;
let currentDimension = null;

const providers = {
  'terminals-tech': {
    async initialize() {
      try {
        const { EmbeddingProviderFactory } = await import('@terminals-tech/embeddings');
        const start = performance.now();

        // Try to create a real provider first (TransformersEmbeddingProvider)
        let provider;
        let dimension = config.embeddings.dimension;

        try {
          // Check if sharp is available for TransformersEmbeddingProvider
          const sharp = require('sharp');
          console.log('Sharp available, using TransformersEmbeddingProvider');

          provider = await EmbeddingProviderFactory.createProvider('transformers', {
            model: 'Xenova/all-MiniLM-L6-v2',
            dimension: 384
          });
          dimension = 384;
        } catch (sharpError) {
          // Sharp unavailable (Windows/etc) — fall back to @xenova/transformers v2 (no sharp dependency)
          console.log('Sharp not available, falling back to @xenova/transformers v2');
          process.stderr.write(`[${new Date().toISOString()}] ⚠️  TransformersEmbeddingProvider requires sharp, falling back to @xenova/transformers\n`);

          const { pipeline: xenovaPipeline } = await import('@xenova/transformers');
          const rawPipeline = await xenovaPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
          dimension = 384;
          
          // Wrap in adapter interface
          provider = {
            embed: async (text) => {
              const output = await rawPipeline(text, { pooling: 'mean', normalize: true });
              return { embedding: Array.isArray(output.data) ? output.data : Array.from(output.data) };
            },
            embedBatch: async (texts) => {
              const results = [];
              for (const t of texts) {
                const output = await rawPipeline(t, { pooling: 'mean', normalize: true });
                results.push({ embedding: Array.isArray(output.data) ? output.data : Array.from(output.data) });
              }
              return results;
            }
          };
        }

        const duration = Math.round(performance.now() - start);

        process.stderr.write(`[${new Date().toISOString()}] ✓ Terminals-tech embeddings initialized (${dimension}D) in ${duration}ms\n`);

        return {
          client: provider,
          dimension: dimension,
          provider: 'terminals-tech'
        };
      } catch (error) {
        process.stderr.write(`[${new Date().toISOString()}] ❌ Terminals-tech embeddings failed: ${error.message}\n`);
        throw error;
      }
    },

    async embed(client, text) {
      const result = await client.embed(text);
      // Handle both MockEmbeddingProvider (returns {values: Float32Array}) and TransformersEmbeddingProvider (returns {embedding: Array})
      return result.values || result.embedding;
    },

    async embedBatch(client, texts) {
      const results = await client.embedBatch(texts);
      return results.map(r => r.values || r.embedding);
    },

    async embedContent(client, text) {
      return this.embed(client, text);
    }
  },

  'huggingface': {
    async initialize() {
      try {
        const transformers = await import('@huggingface/transformers');
        const start = performance.now();

        // Initialize transformers pipeline for feature extraction
        const extractor = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          // Use CPU only to avoid sharp issues
          device: 'cpu'
        });

        const duration = Math.round(performance.now() - start);
        process.stderr.write(`[${new Date().toISOString()}] ✓ HuggingFace embeddings initialized in ${duration}ms\n`);

        return {
          client: extractor,
          dimension: 384, // all-MiniLM-L6-v2 output dimension
          provider: 'huggingface'
        };
      } catch (error) {
        process.stderr.write(`[${new Date().toISOString()}] ❌ HuggingFace embeddings failed: ${error.message}\n`);
        throw error;
      }
    },

    async embed(client, text) {
      const output = await client(text);
      return Array.isArray(output[0]) ? output[0] : output[0][0];
    },

    async embedBatch(client, texts) {
      const results = [];
      for (const text of texts) {
        results.push(await this.embed(client, text));
      }
      return results;
    },

    async embedContent(client, text) {
      return this.embed(client, text);
    }
  }
};

async function initializeEmbeddings() {
  if (isReady && embeddingsClient) {
    return { ready: true };
  }

  // Check feature flag first
  if (!config.features.terminalsTechEmbeddings) {
    process.stderr.write(`[${new Date().toISOString()}] ⚠️  @terminals-tech embeddings disabled by feature flag, using fallback\n`);
    return await fallbackToHuggingFace();
  }

  const providerName = config.fallbacks.embeddings.primary;

  if (!providers[providerName]) {
    throw new Error(`Unknown embeddings provider: ${providerName}`);
  }

  try {
    const result = await providers[providerName].initialize();
    embeddingsClient = result.client;
    currentProvider = result.provider;
    currentDimension = result.dimension;
    isReady = true;

    return {
      ready: true,
      provider: currentProvider,
      dimension: currentDimension
    };
  } catch (error) {
    isReady = false;
    throw error;
  }
}

async function embed(text) {
  if (!isReady || !embeddingsClient) {
    await initializeEmbeddings();
  }

  return await providers[currentProvider].embed(embeddingsClient, text);
}

async function embedBatch(texts) {
  if (!isReady || !embeddingsClient) {
    await initializeEmbeddings();
  }

  return await providers[currentProvider].embedBatch(embeddingsClient, texts);
}

function getDimension() {
  return currentDimension;
}

async function fallbackToHuggingFace() {
  try {
    const { initializeEmbeddings: hfInit } = require('./embeddingsAdapter-huggingface');
    const result = await hfInit();
    currentProvider = 'huggingface';
    currentDimension = 384;
    isReady = true;
    return result;
  } catch (error) {
    process.stderr.write(`[${new Date().toISOString()}] ❌ HuggingFace fallback failed: ${error.message}\n`);
    throw error;
  }
}

function isEmbeddingsReady() {
  return isReady;
}

module.exports = {
  initializeEmbeddings,
  embed,
  embedBatch,
  getDimension,
  isEmbeddingsReady
};
