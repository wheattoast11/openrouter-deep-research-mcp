// src/utils/dbClient.js
const { PGlite } = require('@electric-sql/pglite');
const { vector } = require('@electric-sql/pglite/vector');
const config = require('../../config');
const openRouterClient = require('./openRouterClient');
const path = require('path');
const logger = require('./logger').child('DBClient');

// Detect environment
const isNodeEnv = typeof process !== 'undefined' && process.versions && process.versions.node;
const isBrowserEnv = typeof window !== 'undefined';

// Variables for filesystem access
let fs;
if (isNodeEnv) {
  fs = require('fs');
}

let db = null;
let isEmbedderReady = false;
let embeddingProvider = null; // @terminals-tech/embeddings provider
let dbInitialized = false;
let dbInitAttempted = false;
let usingInMemoryFallback = false;
let dbPathInfo = 'Not Initialized';

// Track embedder version for reindex trigger
let embedderVersionKey = '@terminals-tech/embeddings-v0.1.0';

// Database initialization state machine
const InitState = {
  NOT_STARTED: 'NOT_STARTED',
  INITIALIZING: 'INITIALIZING',
  INITIALIZED: 'INITIALIZED',
  FAILED: 'FAILED'
};

let initState = InitState.NOT_STARTED;
let initError = null;
let initPromise = null;

// Get retry configuration from config
const MAX_RETRIES = config.database.maxRetryAttempts;
const BASE_RETRY_DELAY = config.database.retryDelayBaseMs;

// Initialize embedder using @terminals-tech/embeddings
// Exported as awaitable promise for proper initialization sequencing
let embedderInitPromise = null;
let embedderIsMock = false;

async function initializeEmbedder() {
  if (embedderInitPromise) return embedderInitPromise;

  embedderInitPromise = (async () => {
    try {
      const { EmbeddingProviderFactory, MockEmbeddingProvider } = await import('@terminals-tech/embeddings');
      logger.info('Initializing @terminals-tech/embeddings');

      // GPU/optimized acceleration config
      const deviceConfig = {
        cache: true,
        quantizeCache: true,
        device: process.env.EMBEDDINGS_DEVICE || 'auto',
        // dtype options: 'fp32' (default), 'fp16' (GPU), 'q8' (quantized CPU), 'q4' (smallest)
        dtype: process.env.EMBEDDINGS_DTYPE || 'q8'  // q8 is faster than fp32 on CPU
      };

      // Try direct transformers init with optimized settings FIRST
      // This bypasses the factory which doesn't support device/dtype
      let directInitSuccess = false;
      try {
        const { pipeline, env } = await import('@huggingface/transformers');
        const modelId = 'Xenova/all-MiniLM-L6-v2';

        // Detect available backends
        let actualDevice = 'cpu';  // Default to CPU
        let dtypeConfig = deviceConfig.dtype;

        // Check if GPU is explicitly requested
        if (deviceConfig.device === 'cuda' || deviceConfig.device === 'gpu') {
          actualDevice = 'cuda';
        } else if (deviceConfig.device === 'auto') {
          // For 'auto', default to CPU to avoid CUDA loading errors
          // GPU will be used automatically by onnxruntime if available
          actualDevice = 'cpu';
        }

        // For CPU, use quantized model for better performance
        if (actualDevice === 'cpu') {
          // q8 works well for CPU, fp32 is fallback
          if (!['q8', 'q4', 'fp32'].includes(dtypeConfig)) {
            dtypeConfig = 'q8';  // Default to quantized on CPU
          }
        }

        logger.info('Initializing transformers pipeline', { device: actualDevice, dtype: dtypeConfig });

        // Create pipeline with explicit device/dtype
        const extractor = await pipeline('feature-extraction', modelId, {
          device: actualDevice,
          dtype: dtypeConfig
        });

        // Wrap in provider interface compatible with @terminals-tech/embeddings
        embeddingProvider = {
          _ready: true,
          _deviceConfigured: true,
          _directInit: true,
          dimensions: 384,
          embed: async (text) => {
            const output = await extractor(text, { pooling: 'mean', normalize: true });
            return { values: new Float32Array(output.data), dimensions: 384, normalized: true };
          },
          embedBatch: async (texts) => {
            const results = [];
            // Process in batches for memory efficiency
            const batchSize = 16;
            for (let i = 0; i < texts.length; i += batchSize) {
              const batch = texts.slice(i, i + batchSize);
              for (const text of batch) {
                const output = await extractor(text, { pooling: 'mean', normalize: true });
                results.push({ values: new Float32Array(output.data), dimensions: 384, normalized: true });
              }
            }
            return results;
          },
          similarity: (a, b) => {
            const vecA = a.values || a;
            const vecB = b.values || b;
            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < vecA.length; i++) {
              dot += vecA[i] * vecB[i];
              normA += vecA[i] * vecA[i];
              normB += vecB[i] * vecB[i];
            }
            return dot / (Math.sqrt(normA) * Math.sqrt(normB));
          }
        };
        directInitSuccess = true;
        logger.info('Optimized embeddings initialized', { device: actualDevice, dtype: dtypeConfig });
      } catch (directErr) {
        logger.warn('Direct transformers init failed, falling back to factory', { error: directErr.message });
      }

      // Fallback to factory if direct init failed
      if (!directInitSuccess) {
        embeddingProvider = await EmbeddingProviderFactory.createBest(deviceConfig);
      }

      // DETECT MOCK FALLBACK - important for understanding degraded functionality
      embedderIsMock = embeddingProvider.constructor.name === 'MockEmbeddingProvider' ||
                       (MockEmbeddingProvider && embeddingProvider instanceof MockEmbeddingProvider);

      if (embedderIsMock) {
        logger.warn('Using MockEmbeddingProvider - vector search quality will be degraded');
        logger.warn('This may be because @huggingface/transformers is not installed or failed to load');
      }

      isEmbedderReady = true;
      logger.info(`@terminals-tech/embeddings initialized successfully${embedderIsMock ? ' (MOCK MODE)' : ''}`);

      // Trigger reindex if embedder version changed
      const previous = embedderVersionKey;
      embedderVersionKey = '@terminals-tech/embeddings-v0.1.0';
      if (dbInitialized && previous !== embedderVersionKey) {
        try { await reindexVectors(); } catch (_) {}
      }

      return { ready: true, isMock: embedderIsMock };
    } catch (err) {
      logger.error('Failed to initialize @terminals-tech/embeddings', { error: err });
      isEmbedderReady = false;
      return { ready: false, error: err.message };
    }
  })();

  return embedderInitPromise;
}

// Start initialization automatically but allow awaiting
initializeEmbedder();

// Function to calculate cosine similarity using the embedding provider
function calculateCosineSimilarity(vecA, vecB) {
  if (!embeddingProvider) {
    logger.error('Embedding provider not available for similarity calculation');
    return 0;
  }
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  try {
    return embeddingProvider.similarity(vecA, vecB);
  } catch (e) {
    logger.error('Error calculating cosine similarity', { error: e });
    return 0;
  }
}

// Generate embedding using @terminals-tech/embeddings
async function generateEmbedding(text) {
  if (!isEmbedderReady || !embeddingProvider) {
    logger.debug('Embedder not ready, cannot generate embedding', { textPreview: text.substring(0, 50) });
    return null;
  }
  try {
    const embedding = await embeddingProvider.embed(text);
    // Handle different embedding formats:
    // - { values: Float32Array, dimensions, normalized } from @terminals-tech/embeddings
    // - Raw array from legacy providers
    if (embedding && embedding.values) {
      return Array.from(embedding.values);
    }
    return Array.isArray(embedding) ? embedding : Array.from(embedding);
  } catch (error) {
    logger.error('Error generating embedding', { error, textPreview: text.substring(0, 50) });
    return null;
  }
}

// Batch embedding generation for efficiency
async function generateEmbeddingBatch(texts) {
  if (!isEmbedderReady || !embeddingProvider) {
    logger.debug('Embedder not ready for batch embedding');
    return texts.map(() => null);
  }
  try {
    const embeddings = await embeddingProvider.embedBatch(texts);
    // Handle different embedding formats (see generateEmbedding)
    return embeddings.map(e => {
      if (e && e.values) return Array.from(e.values);
      return Array.isArray(e) ? e : Array.from(e);
    });
  } catch (error) {
    logger.error('Error in batch embedding', { error, count: texts.length });
    return texts.map(() => null);
  }
}

// Helper function to format an array as a string for pgvector
function formatVectorForPgLite(vectorArray) {
  if (!vectorArray) return null;
  return `[${vectorArray.join(',')}]`;
}

/**
 * Get the appropriate database URL based on environment and configuration
 * @returns {string} The database URL to use
 */
function getDatabaseUrl() {
  dbPathInfo = 'Determining...'; // Reset path info
  // Check for URL override in config
  if (config.database.databaseUrl) {
    logger.info('Using explicitly configured database URL', { url: config.database.databaseUrl });
    return config.database.databaseUrl;
  }

  // Generate URL based on environment
  if (isBrowserEnv) {
  // Browser environments should use IndexedDB
    dbPathInfo = `IndexedDB (idb://research-agent-db)`;
    return `idb://research-agent-db`;
  } else if (isNodeEnv) {
    // Node.js can use file-based storage
    const dataDir = path.resolve(config.database.dataDirectory);
    
    // Ensure directory exists if we're in Node
    if (fs) {
      try {
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
          logger.info('Created PGLite data directory', { path: dataDir });
        }
      } catch (err) {
        logger.error('Error creating data directory', { error: err });
        if (config.database.allowInMemoryFallback) {
          logger.warn('Falling back to in-memory database as configured');
          return null;
        } else {
          throw new Error(`Could not create data directory and in-memory fallback is disabled: ${err.message}`);
        }
      }
    }
    dbPathInfo = `File (${dataDir})`;
    return `file://${dataDir}`;
  }

  // Fallback to in-memory if environment can't be determined or directory creation failed
  if (config.database.allowInMemoryFallback) {
    logger.warn('Could not determine environment or create directory, using in-memory database');
    dbPathInfo = 'In-Memory (Fallback)';
    return null; // Indicates in-memory
  } else {
    throw new Error("Could not determine environment and in-memory fallback is disabled.");
  }
}

/**
 * Initialize PGLite database - singleton promise pattern
 * Returns the same promise if already initializing
 */
function initDB() {
  // Return existing promise if initialization is in progress or done
  if (initPromise) {
    return initPromise;
  }

  // Create new initialization promise
  initPromise = _doInitDB();
  return initPromise;
}

/**
 * Internal database initialization logic
 * @private
 */
async function _doInitDB() {
  // Already initialized successfully
  if (initState === InitState.INITIALIZED && db) {
    return true;
  }

  // If failed previously and no retry allowed, throw the cached error
  if (initState === InitState.FAILED && initError && !config.database?.retryOnFailure) {
    throw initError;
  }

  initState = InitState.INITIALIZING;
  initError = null;
  usingInMemoryFallback = false;

  try {
    // Get database URL based on environment
    const dbUrl = getDatabaseUrl();

    // Initialize PGLite with the vector extension
    if (dbUrl) {
      logger.info('Initializing PGLite', { storage: dbPathInfo });

      // Use modern async creation pattern
      db = await PGlite.create({
        url: dbUrl,
        extensions: { vector },
        relaxedDurability: config.database.relaxedDurability
      });
    } else {
      // In-memory is only used if explicitly configured or no URL available
      logger.info('Initializing PGLite', { storage: dbPathInfo });
      db = await PGlite.create({
        extensions: { vector }
      });
      usingInMemoryFallback = true;
    }

    // Enable the vector extension
    await db.query("CREATE EXTENSION IF NOT EXISTS vector;");
    logger.info('PGLite vector extension enabled');

    // Create the reports table
    await db.query(`
      CREATE TABLE IF NOT EXISTS research_reports (
        id SERIAL PRIMARY KEY,
        original_query TEXT NOT NULL,
        query_embedding VECTOR(${config.database.vectorDimension}),
        parameters JSONB,
        final_report TEXT NOT NULL,
        research_metadata JSONB,
        images JSONB,
        text_documents JSONB,
        structured_data JSONB,
        based_on_past_report_ids JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        feedback_entries JSONB DEFAULT '[]',
        accuracy_score REAL DEFAULT NULL,
        fact_check_results JSONB DEFAULT NULL
      );
    `);
    logger.info('PGLite reports table created or verified');

    // Add accuracy_score column if it doesn't exist (for existing databases)
    try {
      await db.query(`ALTER TABLE research_reports ADD COLUMN IF NOT EXISTS accuracy_score REAL DEFAULT NULL;`);
      await db.query(`ALTER TABLE research_reports ADD COLUMN IF NOT EXISTS fact_check_results JSONB DEFAULT NULL;`);
    } catch (e) {
      // Column may already exist, ignore
    }

    // Optional: BM25-style inverted index tables
    if (config.indexer?.enabled) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS index_documents (
          id SERIAL PRIMARY KEY,
          source_type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          title TEXT,
          content TEXT NOT NULL,
          doc_len INTEGER,
          doc_embedding VECTOR(${config.database.vectorDimension}),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS index_terms (
          term TEXT PRIMARY KEY,
          df INTEGER DEFAULT 0
        );
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS index_postings (
          term TEXT NOT NULL,
          doc_id INTEGER NOT NULL REFERENCES index_documents(id) ON DELETE CASCADE,
          tf INTEGER NOT NULL,
          PRIMARY KEY (term, doc_id)
        );
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_postings_term ON index_postings(term);`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_postings_doc ON index_postings(doc_id);`);
      try { await db.query(`ALTER TABLE index_documents ADD COLUMN IF NOT EXISTS doc_len INTEGER;`); } catch(_) {}
      try { await db.query(`ALTER TABLE index_documents ADD COLUMN IF NOT EXISTS doc_embedding VECTOR(${config.database.vectorDimension});`); } catch(_) {}
      try { await db.query(`CREATE INDEX IF NOT EXISTS idx_index_documents_embedding ON index_documents USING hnsw (doc_embedding vector_cosine_ops);`); } catch(_) {}
      logger.info('BM25/vector index tables created or verified');
    }

    // Job tables for async processing
    await db.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        params JSONB,
        status TEXT NOT NULL DEFAULT 'queued',
        progress JSONB,
        result JSONB,
        canceled BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        heartbeat_at TIMESTAMPTZ
      );
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS job_events (
        id SERIAL PRIMARY KEY,
        job_id TEXT NOT NULL,
        ts TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        event_type TEXT NOT NULL,
        payload JSONB
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);`);
    logger.info('Job tables created or verified');

    // Usage counters
    await db.query(`
      CREATE TABLE IF NOT EXISTS usage_counters (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        uses INTEGER NOT NULL DEFAULT 0,
        last_used_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (entity_type, entity_id)
      );
    `);
    logger.info('usage_counters table created or verified');

    // Tool observations - Agent Zero observation loop infrastructure
    // Records every tool execution for convergence tracking and self-improvement
    await db.query(`
      CREATE TABLE IF NOT EXISTS tool_observations (
        id SERIAL PRIMARY KEY,
        tool_name TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        output_hash TEXT,
        success BOOLEAN NOT NULL,
        latency_ms INTEGER,
        error_category TEXT,
        error_code TEXT,
        request_id TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_tool_obs_name ON tool_observations (tool_name);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_tool_obs_created ON tool_observations (created_at DESC);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_tool_obs_success ON tool_observations (tool_name, success);`);
    logger.info('tool_observations table created or verified');

    // Create indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_research_reports_original_query ON research_reports (original_query);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_research_reports_created_at ON research_reports (created_at DESC);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_research_reports_query_embedding ON research_reports USING hnsw (query_embedding vector_cosine_ops);`);
    logger.info('PGLite indexes created or verified');

    // Success!
    initState = InitState.INITIALIZED;
    dbInitialized = true;
    logger.info('Database initialization complete', { storage: dbPathInfo, inMemory: usingInMemoryFallback });
    return true;

  } catch (error) {
    logger.error('Failed to initialize PGLite database', { error: error.message });

    // Check if in-memory fallback is allowed
    const allowFallback = config.database?.allowInMemoryFallback ||
                          process.env.PGLITE_ALLOW_IN_MEMORY_FALLBACK === 'true';

    if (!usingInMemoryFallback && allowFallback) {
      logger.warn('FALLBACK: Attempting in-memory database (DATA WILL NOT PERSIST)');
      try {
        dbPathInfo = 'In-Memory (Error Fallback)';
        db = await PGlite.create({ extensions: { vector } });
        await db.query("CREATE EXTENSION IF NOT EXISTS vector;");

        // Create minimal table structure
        await db.query(`
          CREATE TABLE IF NOT EXISTS research_reports (
            id SERIAL PRIMARY KEY,
            original_query TEXT NOT NULL,
            query_embedding VECTOR(${config.database.vectorDimension}),
            parameters JSONB,
            final_report TEXT NOT NULL,
            research_metadata JSONB,
            images JSONB,
            text_documents JSONB,
            structured_data JSONB,
            based_on_past_report_ids JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            feedback_entries JSONB DEFAULT '[]'
          );
        `);
        await db.query(`
          CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            params JSONB,
            status TEXT NOT NULL DEFAULT 'queued',
            progress JSONB,
            result JSONB,
            canceled BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            started_at TIMESTAMPTZ,
            finished_at TIMESTAMPTZ,
            heartbeat_at TIMESTAMPTZ
          );
        `);
        await db.query(`
          CREATE TABLE IF NOT EXISTS job_events (
            id SERIAL PRIMARY KEY,
            job_id TEXT NOT NULL,
            ts TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            event_type TEXT NOT NULL,
            payload JSONB
          );
        `);

        initState = InitState.INITIALIZED;
        dbInitialized = true;
        usingInMemoryFallback = true;
        logger.warn('In-memory database fallback initialized - DATA WILL NOT PERSIST');
        return true;
      } catch (fallbackError) {
        logger.error('In-memory fallback also failed', { error: fallbackError.message });
        const { InitializationError } = require('./errors');
        initError = new InitializationError('Database',
          `Primary initialization failed: ${error.message}. Fallback also failed: ${fallbackError.message}`);
        initState = InitState.FAILED;
        dbInitialized = false;
        db = null;
        throw initError;
      }
    } else {
      // No fallback allowed - fail loudly
      const { InitializationError } = require('./errors');
      initError = new InitializationError('Database',
        `${error.message}. Set PGLITE_ALLOW_IN_MEMORY_FALLBACK=true for degraded operation.`);
      initState = InitState.FAILED;
      dbInitialized = false;
      db = null;
      throw initError;
    }
  }
}

/**
 * Wait for database initialization to complete
 * @param {number} timeoutMs - Maximum time to wait (default 30s)
 * @returns {Promise<boolean>} True if initialized successfully
 * @throws {InitializationError} If initialization fails or times out
 */
async function waitForInit(timeoutMs = 30000) {
  const { InitializationError } = require('./errors');

  // If not started, trigger initialization
  if (initState === InitState.NOT_STARTED) {
    initPromise = _doInitDB();
  }

  // Create timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new InitializationError('Database',
      `Initialization timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    // Race against timeout
    await Promise.race([initPromise || Promise.resolve(), timeoutPromise]);
  } catch (error) {
    if (initState === InitState.FAILED && initError) {
      throw initError;
    }
    throw error;
  }

  // Verify we actually initialized
  if (initState !== InitState.INITIALIZED) {
    throw initError || new InitializationError('Database',
      `Initialization failed with state: ${initState}`);
  }

  return true;
}

// --- Simple tokenizer and BM25 helpers ---
function tokenize(text) {
  const stop = new Set((config.indexer?.stopwords || []).map(s => s.toLowerCase()));
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !stop.has(t));
}

async function indexDocument({ sourceType, sourceId, title, content }) {
  if (!config.indexer?.enabled) return null;
  if (!content) return null;
  const truncated = content.slice(0, config.indexer.maxDocLength || 8000);
  const terms = tokenize(`${title || ''} ${truncated}`);
  const docLen = terms.length;
  // Optional embedding
  let embeddingVec = null;
  if (config.indexer.embedDocs && isEmbedderReady) {
    try {
      const emb = await generateEmbedding(`${title || ''}\n${truncated}`);
      embeddingVec = formatVectorForPgLite(emb);
    } catch(_) {}
  }
  const docId = await executeWithRetry(async () => {
    const ins = await db.query(
      `INSERT INTO index_documents (source_type, source_id, title, content, doc_len, doc_embedding)
       VALUES ($1,$2,$3,$4,$5, CASE WHEN $6 IS NULL THEN NULL ELSE $6::vector END)
       RETURNING id;`,
      [sourceType, sourceId, title || null, truncated, docLen, embeddingVec]
    );
    const id = ins.rows[0].id;
    const tfMap = new Map();
    for (const term of terms) tfMap.set(term, (tfMap.get(term) || 0) + 1);
    for (const [term, tf] of tfMap.entries()) {
      await db.query(`INSERT INTO index_terms (term, df) VALUES ($1, 1) ON CONFLICT (term) DO UPDATE SET df = index_terms.df + 1;`, [term]);
      await db.query(`INSERT INTO index_postings (term, doc_id, tf) VALUES ($1,$2,$3) ON CONFLICT (term, doc_id) DO UPDATE SET tf = EXCLUDED.tf;`, [term, id, tf]);
    }
    return id;
  }, 'indexDocument');
  return docId;
}

async function searchHybrid(queryText, limit = 10) {
  const weights = config.indexer?.weights || { bm25: 0.7, vector: 0.3 };
  const terms = tokenize(queryText);
  if (terms.length === 0) return [];
  const placeholders = terms.map((_, i) => `$${i + 1}`).join(',');

  // Compute BM25 for documents with true k1/b and avgdl
  const bm25Docs = await executeWithRetry(async () => {
    const k1 = config.indexer?.bm25?.k1 || 1.2;
    const b = config.indexer?.bm25?.b || 0.75;
    const res = await db.query(
      `WITH q_terms AS (
         SELECT term, df FROM index_terms WHERE term IN (${placeholders})
       ),
       stats AS (
         SELECT COUNT(*)::float AS N, COALESCE(AVG(doc_len),1)::float AS avgdl FROM index_documents
       ),
       tf AS (
         SELECT p.doc_id, p.term, p.tf FROM index_postings p WHERE p.term IN (${placeholders})
       ),
       joined AS (
         SELECT tf.doc_id, tf.term, tf.tf, q_terms.df, stats.N, stats.avgdl, d.doc_len
         FROM tf
         JOIN q_terms ON q_terms.term = tf.term
         CROSS JOIN stats
         JOIN index_documents d ON d.id = tf.doc_id
       ),
       scoring AS (
         SELECT doc_id,
           SUM( (LN(1 + ((N - df + 0.5)/(df + 0.5)))) * ( (tf * (${k1}+1.0)) / (tf + ${k1} * (1 - ${b} + ${b} * (COALESCE(doc_len,1)::float / NULLIF(avgdl,0))) ) ) ) AS bm25
         FROM joined
         GROUP BY doc_id
       )
       SELECT d.id, d.source_type, d.source_id, d.title, d.content, s.bm25,
              COALESCE(u.uses,0) AS uses
       FROM scoring s JOIN index_documents d ON d.id = s.doc_id
       LEFT JOIN usage_counters u ON u.entity_type = 'doc' AND u.entity_id = d.source_id
       ORDER BY s.bm25 DESC
       LIMIT ${limit}
      `,
      terms
    );
    return res.rows.map(r => ({ ...r, bm25: Number(r.bm25 || 0), uses: Number(r.uses || 0) }));
  }, 'searchBM25Docs', []);

  // Vector similarities
  let qEmb = null; let qVec = null;
  if (isEmbedderReady && (weights.vector || 0) > 0) {
    qEmb = await generateEmbedding(queryText);
    qVec = qEmb ? formatVectorForPgLite(qEmb) : null;
  }

  // Doc vector scores
  let docVecScores = new Map();
  if (qVec && bm25Docs.length > 0) {
    const docIds = bm25Docs.map(r => r.id);
    const ph = docIds.map((_, i) => `$${i + 1}`).join(',');
    const rows = await executeWithRetry(async () => {
      const r = await db.query(
        `SELECT id, 1 - (doc_embedding <=> $${docIds.length + 1}::vector) AS sim
         FROM index_documents WHERE id IN (${ph}) AND doc_embedding IS NOT NULL`,
        [...docIds, qVec]
      );
      return r.rows;
    }, 'vectorDocsLookup', []);
    for (const row of rows) docVecScores.set(Number(row.id), Number(row.sim));
  }

  // Report vector scores (top-k recent for performance)
  let reportVecRows = [];
  if (qVec) {
    reportVecRows = await executeWithRetry(async () => {
      const r = await db.query(
        `SELECT r.id, r.original_query, r.final_report, 1 - (r.query_embedding <=> $1::vector) AS sim,
                COALESCE(u.uses,0) AS uses
         FROM research_reports r
         LEFT JOIN usage_counters u ON u.entity_type = 'report' AND u.entity_id = r.id::text
         WHERE r.query_embedding IS NOT NULL
         ORDER BY sim DESC
         LIMIT $2;`,
        [qVec, Math.max(50, limit)]
      );
      return r.rows.map(row => ({ id: row.id, sim: Number(row.sim), original_query: row.original_query, final_report: row.final_report, uses: Number(row.uses || 0) }));
    }, 'vectorReportsLookup', []);
  }

  // Normalize and combine
  const allDocBm25 = bm25Docs.map(x => x.bm25);
  const bm25Min = Math.min(...allDocBm25, 0);
  const bm25Max = Math.max(...allDocBm25, 1);
  const norm = (v, min, max) => (max - min) > 0 ? (v - min) / (max - min) : 0;

  const docResults = bm25Docs.map(d => {
    const bm25N = norm(d.bm25 || 0, bm25Min, bm25Max);
    const v = docVecScores.get(Number(d.id)) || 0;
    const hybrid = (weights.bm25 || 0) * bm25N + (weights.vector || 0) * v;
    return {
      type: 'doc',
      id: d.id,
      source_type: 'doc',
      source_id: d.source_id,
      title: d.title,
      snippet: (d.content || '').slice(0, 300),
      bm25: d.bm25 || 0,
      vectorScore: v,
      hybridScore: hybrid,
      usageCount: d.uses || 0
    };
  });

  const reportResults = reportVecRows.map(r => ({
    type: 'report',
    id: r.id,
    source_type: 'report',
    source_id: String(r.id),
    title: (r.original_query || `Report ${r.id}`).slice(0, 160),
    snippet: (r.final_report || '').slice(0, 300),
    bm25: 0,
    vectorScore: r.sim,
    hybridScore: (weights.vector || 0) * r.sim,
    usageCount: r.uses || 0
  }));

  const combined = [...docResults, ...reportResults]
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, Math.max(limit, 10));

  // Optional LLM rerank of the top window
  if (config.indexer?.rerankEnabled && (config.indexer?.rerankModel || config.models?.planning)) {
    try {
      const window = combined.slice(0, Math.min(50, combined.length));
      const reranked = await rerankWithLLM(queryText, window);
      return reranked.slice(0, limit);
    } catch (e) {
      console.warn(`[${new Date().toISOString()}] LLM rerank failed, returning hybrid scores.`, e.message);
    }
  }

  return combined.slice(0, limit);
}

async function indexExistingReports(limit = 1000) {
  if (!config.indexer?.enabled) return 0;
  const rows = await executeWithRetry(async () => {
    const r = await db.query(`SELECT id, original_query, final_report, created_at FROM research_reports ORDER BY id DESC LIMIT $1;`, [limit]);
    return r.rows;
  }, 'loadReportsForIndex', []);
  let count = 0;
  for (const row of rows) {
    const title = row.original_query?.slice(0, 120) || `Report ${row.id}`;
    const ok = await indexDocument({ sourceType: 'report', sourceId: String(row.id), title, content: row.final_report || '' });
    if (ok) count++;
  }
  return count;
}

/**
 * Execute a database operation with retry logic
 * THROWS on failure - callers MUST handle errors
 *
 * @param {Function} operation Function that returns a promise for the DB operation
 * @param {string} operationName Name of the operation for logging
 * @returns {Promise<any>} Result of the operation
 * @throws {InitializationError} If database is not initialized
 * @throws {RetryExhaustedError} If all retries fail
 */
async function executeWithRetry(operation, operationName) {
  const { InitializationError, RetryExhaustedError, wrapError } = require('./errors');

  // WAIT for initialization to complete (not just check)
  await waitForInit().catch(err => {
    throw new InitializationError('Database',
      `Cannot perform ${operationName}: ${err.message}`);
  });

  // Verify DB is ready
  if (initState !== InitState.INITIALIZED || !db) {
    throw new InitializationError('Database',
      `Cannot perform ${operationName}: Database not initialized (state: ${initState})`);
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = wrapError(error, `${operationName} failed (attempt ${attempt}/${MAX_RETRIES})`, {
        context: { attempt, maxRetries: MAX_RETRIES, operation: operationName }
      });

      if (attempt >= MAX_RETRIES) {
        logger.error(`${operationName} failed after ${MAX_RETRIES} attempts`, {
          error: lastError.message,
          operation: operationName
        });
        throw new RetryExhaustedError(operationName, MAX_RETRIES, lastError);
      }

      // Exponential backoff with jitter
      const delay = BASE_RETRY_DELAY * Math.pow(2, attempt - 1) * (0.9 + Math.random() * 0.2);
      logger.warn(`Retrying ${operationName} after ${Math.round(delay)}ms`, {
        attempt,
        maxRetries: MAX_RETRIES,
        error: error.message
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function saveResearchReport({ originalQuery, parameters, finalReport, researchMetadata, images, textDocuments, structuredData, basedOnPastReportIds, accuracyScore, factCheckResults }) {
  const { DatabaseError } = require('./errors');

  if (!isEmbedderReady) {
    logger.warn('Embedder not ready, saving report without embedding', {
      queryPreview: originalQuery.substring(0, 50)
    });
  }

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(originalQuery);
  const queryEmbeddingFormatted = queryEmbedding ? formatVectorForPgLite(queryEmbedding) : null;

  // executeWithRetry now THROWS on failure - no fallback
  const result = await executeWithRetry(
    async () => {
      const res = await db.query(
        `INSERT INTO research_reports (
          original_query,
          query_embedding,
          parameters,
          final_report,
          research_metadata,
          images,
          text_documents,
          structured_data,
          based_on_past_report_ids,
          accuracy_score,
          fact_check_results,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id;`,
        [
          originalQuery,
          queryEmbeddingFormatted,
          JSON.stringify(parameters || {}),
          finalReport,
          JSON.stringify(researchMetadata || {}),
          JSON.stringify(images || null),
          JSON.stringify(textDocuments ? textDocuments.map(d => ({ name: d.name, length: (typeof d.length === 'number' ? d.length : (d && d.content ? d.content.length : null)) })) : null),
          JSON.stringify(structuredData ? structuredData.map(d => ({ name: d.name, type: d.type, length: (typeof d.length === 'number' ? d.length : (d && d.content ? d.content.length : null)) })) : null),
          JSON.stringify(basedOnPastReportIds || []),
          accuracyScore ?? null,
          JSON.stringify(factCheckResults || null),
          new Date().toISOString()
        ]
      );

      if (!res.rows || res.rows.length === 0) {
        throw new DatabaseError('INSERT returned no rows', 'saveResearchReport');
      }

      return res;
    },
    'saveResearchReport'
  );

  const reportId = result.rows[0].id;
  logger.info('Successfully saved research report', { reportId, accuracyScore: accuracyScore ?? 'N/A' });
  return reportId.toString();
}

// Lightweight LLM reranker using planning model; expects minimal tokens
async function rerankWithLLM(queryText, items) {
  const model = config.indexer?.rerankModel || config.models.planning;
  const prompt = `Rerank the following search results for the query. Return a JSON array of indices in best order. Only output JSON.\n\nQuery: ${queryText}\n\nResults (index, type, title/snippet):\n` +
    items.map((it, i) => `${i}. [${it.type}] ${it.title || ''} :: ${(it.snippet || '').slice(0, 200)}`).join('\n');
  const messages = [
    { role: 'system', content: 'You are a re-ranker. Output only a JSON array of integers representing the best ranking.' },
    { role: 'user', content: prompt }
  ];
  const res = await openRouterClient.chatCompletion(model, messages, { temperature: 0.0, max_tokens: 200 });
  const text = res.choices?.[0]?.message?.content || '[]';
  let order = [];
  try { order = JSON.parse(text); } catch(_) { order = []; }
  const seen = new Set();
  const ranked = [];
  for (const idx of order) {
    if (Number.isInteger(idx) && idx >= 0 && idx < items.length && !seen.has(idx)) {
      ranked.push(items[idx]);
      seen.add(idx);
    }
  }
  // Append any leftovers in original order
  for (let i = 0; i < items.length; i++) if (!seen.has(i)) ranked.push(items[i]);
  return ranked;
}

async function addFeedbackToReport(reportId, feedback) {
  const { DatabaseError, NotFoundError } = require('./errors');

  // Validate reportId is a number
  const reportIdNum = parseInt(reportId, 10);
  if (isNaN(reportIdNum)) {
    throw new DatabaseError(`Invalid report ID format: ${reportId}`, 'addFeedbackToReport');
  }

  await executeWithRetry(
    async () => {
      // First, get the current feedback entries
      const currentResult = await db.query(
        `SELECT feedback_entries FROM research_reports WHERE id = $1;`,
        [reportIdNum]
      );

      if (currentResult.rows.length === 0) {
        throw new NotFoundError('Report', reportId);
      }

      // Parse current feedback entries
      let feedbackEntries = [];
      const currentFeedbackJson = currentResult.rows[0].feedback_entries;
      try {
        if (currentFeedbackJson && currentFeedbackJson.trim() !== '') {
          feedbackEntries = JSON.parse(currentFeedbackJson);
          if (!Array.isArray(feedbackEntries)) {
            logger.warn('Parsed feedback was not an array, resetting', { reportId });
            feedbackEntries = [];
          }
        }
      } catch (parseError) {
        logger.warn('Error parsing feedback entries, resetting', { reportId, error: parseError.message });
        feedbackEntries = [];
      }

      // Add new feedback
      feedbackEntries.push({
        ...feedback,
        timestamp: new Date().toISOString()
      });

      // Update the report
      await db.query(
        `UPDATE research_reports
         SET feedback_entries = $1,
             updated_at = $2
         WHERE id = $3;`,
        [JSON.stringify(feedbackEntries), new Date().toISOString(), reportIdNum]
      );
    },
    'addFeedbackToReport'
  );

  logger.debug('Added feedback to report', { reportId });
  return true;
}

async function findReportsByQuery(query) {
  const result = await executeWithRetry(
    async () => {
      return await db.query(
        `SELECT * FROM research_reports WHERE original_query = $1 ORDER BY created_at DESC;`,
        [query]
      );
    },
    'findReportsByQuery'
  );

  // Empty results are valid
  return result.rows.map(row => ({
    ...row,
    _id: row.id,
    queryEmbedding: null
  }));
}

async function findReportsBySimilarity(queryText, limit = 5, minSimilarity = 0.80) {
  // If embedder not ready, return empty (not an error)
  if (!isEmbedderReady) {
    logger.debug('Embedder not ready for similarity search');
    return [];
  }

  const queryEmbedding = await generateEmbedding(queryText);
  if (!queryEmbedding) {
    logger.debug('Failed to generate embedding for similarity search', {
      queryPreview: queryText.substring(0, 50)
    });
    return [];
  }

  // Adaptive thresholding with strict floor at 0.80 to prevent false positive cache hits
  // Only allow minor widening (5%) from minSimilarity, never below 0.80
  const floorThreshold = 0.80;
  const thresholds = [minSimilarity];
  if (minSimilarity > floorThreshold + 0.02) {
    thresholds.push(Math.max(floorThreshold, minSimilarity - 0.03));
  }

  for (const thr of thresholds) {
    if (thr < minSimilarity) {
      logger.debug('Similarity search: widening threshold', {
        original: minSimilarity,
        current: thr,
        queryPreview: queryText.substring(0, 50)
      });
    }

    const result = await executeWithRetry(
      async () => {
        const queryEmbeddingFormatted = formatVectorForPgLite(queryEmbedding);
        return await db.query(
          `SELECT
             id,
             original_query,
             parameters,
             final_report,
             research_metadata,
             created_at,
             1 - (query_embedding <=> $1::vector) AS similarity_score
           FROM research_reports
           WHERE query_embedding IS NOT NULL
           AND 1 - (query_embedding <=> $1::vector) >= $2
           ORDER BY similarity_score DESC
           LIMIT $3;`,
          [queryEmbeddingFormatted, thr, limit]
        );
      },
      'findReportsBySimilarity'
    );

    if (result.rows && result.rows.length > 0) {
      const reports = result.rows.map(row => ({
        ...row,
        _id: row.id,
        originalQuery: row.original_query,
        similarityScore: row.similarity_score,
        parameters: typeof row.parameters === 'string' ? JSON.parse(row.parameters) : row.parameters,
        researchMetadata: typeof row.research_metadata === 'string' ? JSON.parse(row.research_metadata) : row.research_metadata
      }));
      logger.info('Found reports via vector search', {
        count: reports.length,
        threshold: thr,
        topSimilarity: reports[0]?.similarityScore?.toFixed(3),
        topQuery: reports[0]?.originalQuery?.substring(0, 40)
      });
      return reports;
    }
  }

  logger.debug('No similar reports found above threshold', {
    minThreshold: floorThreshold,
    queryPreview: queryText.substring(0, 50)
  });

  // No keyword fallback - return empty to force fresh research
  // Keyword fallback was causing contamination: unrelated reports with similarityScore: 0
  // were being injected into planning prompts, causing wrong sub-query generation
  logger.info('Semantic search found no matches above threshold - forcing fresh research', {
    queryPreview: queryText.substring(0, 50),
    minThreshold: floorThreshold
  });
  return [];
}

async function listRecentReports(limit = 10, queryFilter = null) {
  const result = await executeWithRetry(
    async () => {
      let query, params;

      if (queryFilter) {
        query = `
          SELECT
            id,
            original_query,
            parameters,
            created_at,
            research_metadata
          FROM research_reports
          WHERE original_query ILIKE $1
          ORDER BY created_at DESC
          LIMIT $2;
        `;
        params = [`%${queryFilter}%`, limit];
      } else {
        query = `
          SELECT
            id,
            original_query,
            parameters,
            created_at,
            research_metadata
          FROM research_reports
          ORDER BY created_at DESC
          LIMIT $1;
        `;
        params = [limit];
      }

      return await db.query(query, params);
    },
    'listRecentReports'
  );

  // Empty result is valid - not an error
  const reports = result.rows.map(row => ({
    ...row,
    _id: row.id,
    originalQuery: row.original_query,
    parameters: typeof row.parameters === 'string' ? JSON.parse(row.parameters) : row.parameters,
    researchMetadata: typeof row.research_metadata === 'string' ? JSON.parse(row.research_metadata) : row.research_metadata
  }));

  logger.debug('Listed recent reports', {
    count: reports.length,
    filter: queryFilter || 'none',
    limit
  });

  return reports;
}

// ============================================================================
// OBSERVATION INFRASTRUCTURE - Agent Zero Feedback Loop
// Records tool executions for convergence tracking and self-improvement
// ============================================================================

/**
 * Record a tool observation for the feedback loop
 * @param {Object} observation - The observation data
 * @param {string} observation.toolName - Name of the tool executed
 * @param {string} observation.inputHash - Hash of the input (for deduplication)
 * @param {string} [observation.outputHash] - Hash of the output
 * @param {boolean} observation.success - Whether execution succeeded
 * @param {number} [observation.latencyMs] - Execution time in milliseconds
 * @param {string} [observation.errorCategory] - Error category if failed
 * @param {string} [observation.errorCode] - Error code if failed
 * @param {string} [observation.requestId] - Request ID for tracing
 */
async function recordToolObservation(observation) {
  const { toolName, inputHash, outputHash, success, latencyMs, errorCategory, errorCode, requestId } = observation;

  return executeWithRetry(async () => {
    await db.query(
      `INSERT INTO tool_observations (tool_name, input_hash, output_hash, success, latency_ms, error_category, error_code, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [toolName, inputHash, outputHash || null, success, latencyMs || null, errorCategory || null, errorCode || null, requestId || null]
    );
    logger.debug('Recorded tool observation', { toolName, success, latencyMs });
  }, 'recordToolObservation');
}

/**
 * Get metrics for a specific tool
 * @param {string} toolName - Tool name to get metrics for
 * @param {number} [windowHours=24] - Time window in hours
 * @returns {Object} Tool metrics including success rate, avg latency, call count
 */
async function getToolMetrics(toolName, windowHours = 24) {
  return executeWithRetry(async () => {
    const result = await db.query(
      `SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_calls,
        AVG(CASE WHEN success THEN latency_ms ELSE NULL END) as avg_success_latency_ms,
        AVG(latency_ms) as avg_latency_ms,
        MIN(latency_ms) as min_latency_ms,
        MAX(latency_ms) as max_latency_ms
       FROM tool_observations
       WHERE tool_name = $1 AND created_at > NOW() - INTERVAL '${windowHours} hours'`,
      [toolName]
    );

    const row = result.rows[0] || {};
    const totalCalls = parseInt(row.total_calls, 10) || 0;
    const successfulCalls = parseInt(row.successful_calls, 10) || 0;

    return {
      toolName,
      windowHours,
      totalCalls,
      successfulCalls,
      failedCalls: totalCalls - successfulCalls,
      successRate: totalCalls > 0 ? successfulCalls / totalCalls : null,
      avgLatencyMs: row.avg_latency_ms ? Math.round(parseFloat(row.avg_latency_ms)) : null,
      avgSuccessLatencyMs: row.avg_success_latency_ms ? Math.round(parseFloat(row.avg_success_latency_ms)) : null,
      minLatencyMs: row.min_latency_ms ? parseInt(row.min_latency_ms, 10) : null,
      maxLatencyMs: row.max_latency_ms ? parseInt(row.max_latency_ms, 10) : null
    };
  }, 'getToolMetrics');
}

/**
 * Get system-wide convergence metrics
 * Convergence = overall success rate approaching 1.0
 * @param {number} [windowHours=24] - Time window in hours
 * @returns {Object} System-wide convergence metrics
 */
async function getConvergenceMetrics(windowHours = 24) {
  return executeWithRetry(async () => {
    // Overall metrics
    const overallResult = await db.query(
      `SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_calls,
        COUNT(DISTINCT tool_name) as unique_tools,
        AVG(latency_ms) as avg_latency_ms
       FROM tool_observations
       WHERE created_at > NOW() - INTERVAL '${windowHours} hours'`
    );

    // Per-tool breakdown
    const perToolResult = await db.query(
      `SELECT
        tool_name,
        COUNT(*) as calls,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as successes,
        ROUND(AVG(latency_ms)::numeric, 0) as avg_latency
       FROM tool_observations
       WHERE created_at > NOW() - INTERVAL '${windowHours} hours'
       GROUP BY tool_name
       ORDER BY calls DESC`
    );

    // Error breakdown
    const errorResult = await db.query(
      `SELECT
        error_category,
        COUNT(*) as count
       FROM tool_observations
       WHERE created_at > NOW() - INTERVAL '${windowHours} hours' AND NOT success
       GROUP BY error_category
       ORDER BY count DESC
       LIMIT 10`
    );

    const overall = overallResult.rows[0] || {};
    const totalCalls = parseInt(overall.total_calls, 10) || 0;
    const successfulCalls = parseInt(overall.successful_calls, 10) || 0;
    const convergenceRate = totalCalls > 0 ? successfulCalls / totalCalls : null;

    // Convergence interpretation
    let convergenceStatus = 'unknown';
    if (convergenceRate !== null) {
      if (convergenceRate >= 0.99) convergenceStatus = 'converged';
      else if (convergenceRate >= 0.95) convergenceStatus = 'near_convergence';
      else if (convergenceRate >= 0.80) convergenceStatus = 'improving';
      else if (convergenceRate >= 0.50) convergenceStatus = 'learning';
      else convergenceStatus = 'divergent';
    }

    return {
      windowHours,
      timestamp: new Date().toISOString(),
      overall: {
        totalCalls,
        successfulCalls,
        failedCalls: totalCalls - successfulCalls,
        convergenceRate,
        convergenceStatus,
        uniqueTools: parseInt(overall.unique_tools, 10) || 0,
        avgLatencyMs: overall.avg_latency_ms ? Math.round(parseFloat(overall.avg_latency_ms)) : null
      },
      perTool: perToolResult.rows.map(row => ({
        toolName: row.tool_name,
        calls: parseInt(row.calls, 10),
        successes: parseInt(row.successes, 10),
        successRate: parseInt(row.calls, 10) > 0 ? parseInt(row.successes, 10) / parseInt(row.calls, 10) : null,
        avgLatencyMs: row.avg_latency ? parseInt(row.avg_latency, 10) : null
      })),
      errorBreakdown: errorResult.rows.map(row => ({
        category: row.error_category || 'UNKNOWN',
        count: parseInt(row.count, 10)
      }))
    };
  }, 'getConvergenceMetrics');
}

/**
 * Create a hash of input data for observation deduplication
 * @param {*} input - Input data to hash
 * @returns {string} SHA256 hash of the input
 */
function hashInput(input) {
  const crypto = require('crypto');
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

// Initialize DB eagerly but non-blocking
// Consumers MUST await waitForInit() before using database operations
if (process.env.DB_EAGER_INIT !== 'false') {
  initPromise = _doInitDB().then(async () => {
    // Auto-index if configured
    if (config.indexer?.enabled && config.indexer.autoIndexReports) {
      try {
        const n = await indexExistingReports(500);
        logger.info('Indexed existing reports', { count: n });
      } catch (e) {
        logger.warn('Auto-indexing failed', { error: e.message });
      }
    }
  }).catch(err => {
    // Error captured in initState/initError, will be thrown on waitForInit()
    logger.error('Background DB initialization failed', { error: err.message, state: initState });
  });
}

module.exports = {
  // Report operations
  saveResearchReport,
  findReportsByQuery,
  addFeedbackToReport,
  findReportsBySimilarity,
  listRecentReports,
  getReportById,

  // Database initialization - REQUIRED before operations
  initDB,
  waitForInit,
  getInitState: () => initState,
  getInitError: () => initError,
  isInitializing: () => initState === InitState.INITIALIZING,
  isDbInitialized: () => dbInitialized,
  getDbPathInfo: () => dbPathInfo,
  isUsingInMemoryFallback: () => usingInMemoryFallback,

  // Embedder initialization exports
  initializeEmbedder,
  waitForEmbedder: () => embedderInitPromise || Promise.resolve({ ready: false }),
  isEmbedderReady: () => isEmbedderReady,
  isEmbedderMock: () => embedderIsMock,

  // Query execution
  executeQuery,
  reindexVectors,
  generateEmbedding,

  // Indexer API
  indexDocument,
  searchHybrid,
  indexExistingReports,

  // Jobs API
  createJob,
  appendJobEvent,
  setJobStatus,
  getJob,
  getJobEvents,
  getJobStatus,
  cancelJob,
  claimNextJob,
  heartbeatJob,

  // Usage API
  incrementUsage,
  incrementUsageMany,

  // Observation Infrastructure - Agent Zero Feedback Loop
  recordToolObservation,
  getToolMetrics,
  getConvergenceMetrics,
  hashInput,

  // Internal DDL execution (for schema management, not user-facing)
  executeDDL
};

// Function to retrieve a single report by its ID
async function getReportById(reportId) {
  const { DatabaseError, NotFoundError } = require('./errors');

  // Validate reportId is a number
  const reportIdNum = parseInt(reportId, 10);
  if (isNaN(reportIdNum)) {
    throw new DatabaseError(
      `Invalid report ID format: ${reportId}`,
      'getReportById',
      { context: { reportId, expectedType: 'integer' } }
    );
  }

  const result = await executeWithRetry(
    async () => {
      return await db.query(
        `SELECT
           id,
           original_query,
           parameters,
           final_report,
           research_metadata,
           images,
           text_documents,
           structured_data,
           based_on_past_report_ids,
           created_at,
           updated_at,
           feedback_entries
         FROM research_reports
         WHERE id = $1;`,
        [reportIdNum]
      );
    },
    `getReportById(${reportId})`
  );

  // Distinguish "not found" from "error"
  if (result.rows.length === 0) {
    throw new NotFoundError('Report', reportId);
  }

  const report = result.rows[0];
  logger.debug('Successfully retrieved report', { reportId });

  // Convert JSONB strings back to objects for consistency
  return {
    ...report,
    _id: report.id,
    parameters: typeof report.parameters === 'string' ? JSON.parse(report.parameters) : report.parameters,
    researchMetadata: typeof report.research_metadata === 'string' ? JSON.parse(report.research_metadata) : report.research_metadata,
    images: typeof report.images === 'string' ? JSON.parse(report.images) : report.images,
    text_documents: typeof report.text_documents === 'string' ? JSON.parse(report.text_documents) : report.text_documents,
    structured_data: typeof report.structured_data === 'string' ? JSON.parse(report.structured_data) : report.structured_data,
    based_on_past_report_ids: typeof report.based_on_past_report_ids === 'string' ? JSON.parse(report.based_on_past_report_ids) : report.based_on_past_report_ids,
    feedback_entries: typeof report.feedback_entries === 'string' ? JSON.parse(report.feedback_entries) : report.feedback_entries,
    queryEmbedding: null
  };
}

// Function to execute an arbitrary (but validated) SQL query securely
async function executeQuery(sql, params = []) {
  // Basic validation: Ensure it's a SELECT query for safety
  const lowerSql = sql.trim().toLowerCase();
  if (!lowerSql.startsWith('select')) {
    logger.warn('Blocking non-SELECT query', { sql: sql.substring(0, 100) });
    throw new Error("Only SELECT statements are currently allowed via executeQuery.");
  }

  const result = await executeWithRetry(
    async () => {
      return await db.query(sql, params);
    },
    `executeQuery("${sql.substring(0, 50)}...")`
  );

  logger.debug('Query executed successfully', { rowCount: result.rows.length });
  return result.rows;
}

// Function to execute DDL statements (CREATE, ALTER, DROP) for internal schema management
// This is NOT exposed to user-facing tools - only for internal initialization
async function executeDDL(sql, params = []) {
  const lowerSql = sql.trim().toLowerCase();
  const allowedPrefixes = ['create ', 'alter ', 'drop ', 'insert ', 'update ', 'delete '];
  const isAllowed = allowedPrefixes.some(prefix => lowerSql.startsWith(prefix));

  if (!isAllowed) {
    logger.warn('Blocking non-DDL statement in executeDDL', { sql: sql.substring(0, 100) });
    throw new Error("Only DDL statements (CREATE, ALTER, DROP) or DML (INSERT, UPDATE, DELETE) are allowed via executeDDL.");
  }

  const result = await executeWithRetry(
    async () => {
      return await db.query(sql, params);
    },
    `executeDDL("${sql.substring(0, 50)}...")`
  );

  logger.debug('DDL executed successfully');
  return result;
}

// Function to rebuild the vector index safely
async function reindexVectors() {
  await executeWithRetry(
    async () => {
      try { await db.query(`DROP INDEX IF EXISTS idx_research_reports_query_embedding;`); } catch (e) {}
      // Recreate HNSW with conservative params for <50k vectors
      await db.query(`CREATE INDEX IF NOT EXISTS idx_research_reports_query_embedding ON research_reports USING hnsw (query_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);`);
    },
    'reindexVectors'
  );
  logger.debug('Vector index rebuilt');
  return true;
}

// --- Usage counters helpers ---
async function incrementUsage(entityType, entityId, inc = 1) {
  await executeWithRetry(async () => {
    await db.query(
      `INSERT INTO usage_counters (entity_type, entity_id, uses, last_used_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (entity_type, entity_id)
       DO UPDATE SET uses = usage_counters.uses + EXCLUDED.uses, last_used_at = NOW();`,
      [entityType, String(entityId), Number(inc) || 1]
    );
  }, 'incrementUsage');
  return true;
}

async function incrementUsageMany(items = []) {
  for (const it of items) {
    try { await incrementUsage(it.type, it.id); } catch (_) {}
  }
  return true;
}

// --- Async Job Helpers ---
async function createJob(type, params) {
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await executeWithRetry(async () => {
    await db.query(
      `INSERT INTO jobs (id, type, params, status, created_at, updated_at) VALUES ($1,$2,$3,'queued', NOW(), NOW());`,
      [id, type, JSON.stringify(params || {})]
    );
  }, 'createJob');

  // Verify job was created (PGLite race condition mitigation)
  const verify = await executeWithRetry(async () => {
    const r = await db.query(`SELECT id FROM jobs WHERE id = $1;`, [id]);
    return r;
  }, 'createJob-verify');

  if (!verify.rows || verify.rows.length === 0) {
    logger.error('Job creation verification failed', { jobId: id });
    throw new Error(`Job creation failed: ${id} not found after insert`);
  }

  logger.debug('Job created and verified', { jobId: id, type });
  return id;
}

async function appendJobEvent(jobId, eventType, payload) {
  const result = await executeWithRetry(async () => {
    const res = await db.query(
      `INSERT INTO job_events (job_id, event_type, payload, ts) VALUES ($1,$2,$3, NOW()) RETURNING id, ts;`,
      [jobId, eventType, JSON.stringify(payload || {})]
    );
    await db.query(`UPDATE jobs SET updated_at = NOW(), heartbeat_at = NOW() WHERE id = $1;`, [jobId]);
    return res.rows[0];
  }, 'appendJobEvent');
  return result;
}

async function setJobStatus(jobId, status, { progress = null, result = null, started = false, finished = false } = {}) {
  await executeWithRetry(async () => {
    const fields = [];
    const vals = [];
    let idx = 1;
    const push = (frag, v) => { fields.push(frag); vals.push(v); };
    push(`status = $${idx++}`, status);
    if (progress !== null) push(`progress = $${idx++}`, JSON.stringify(progress));
    if (result !== null) push(`result = $${idx++}`, JSON.stringify(result));
    if (started) fields.push(`started_at = NOW()`);
    if (finished) fields.push(`finished_at = NOW()`);
    fields.push(`updated_at = NOW()`);
    vals.push(jobId);
    await db.query(`UPDATE jobs SET ${fields.join(', ')} WHERE id = $${idx};`, vals);
  }, 'setJobStatus');
}

async function getJob(jobId) {
  if (!jobId || typeof jobId !== 'string') {
    logger.warn('getJob called with invalid jobId', { jobId, type: typeof jobId });
    return null;
  }

  const result = await executeWithRetry(async () => {
    const r = await db.query(`SELECT * FROM jobs WHERE id = $1;`, [jobId]);
    return r;
  }, 'getJob');

  // Return null for not found (distinct from error)
  if (!result.rows || result.rows.length === 0) {
    // Debug: check if any jobs exist
    const count = await db.query(`SELECT COUNT(*) as c FROM jobs;`);
    logger.debug('Job not found', { jobId, totalJobs: count.rows?.[0]?.c || 0 });
    return null;
  }
  return result.rows[0];
}

async function getJobEvents(jobId, afterId = 0, limit = 500) {
  const result = await executeWithRetry(async () => {
    const r = await db.query(
      `SELECT id, job_id, ts, event_type, payload FROM job_events WHERE job_id = $1 AND id > $2 ORDER BY id ASC LIMIT $3;`,
      [jobId, Number(afterId) || 0, limit]
    );
    return r;
  }, 'getJobEvents');
  return result.rows;
}

async function getJobStatus(jobId) {
  const job = await getJob(jobId);
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    progress: typeof job.progress === 'string' ? JSON.parse(job.progress) : job.progress,
    result: typeof job.result === 'string' ? JSON.parse(job.result) : job.result,
    canceled: !!job.canceled,
    updated_at: job.updated_at,
    started_at: job.started_at,
    finished_at: job.finished_at
  };
}

async function cancelJob(jobId) {
  await executeWithRetry(async () => {
    await db.query(`UPDATE jobs SET canceled = TRUE, status = 'canceled', updated_at = NOW(), finished_at = COALESCE(finished_at, NOW()) WHERE id = $1;`, [jobId]);
  }, 'cancelJob');
  logger.debug('Job canceled', { jobId });
  return true;
}

// Claim the next queued job with a lease
async function claimNextJob() {
  const leaseTimeoutMs = require('../../config').jobs.leaseTimeoutMs;
  const result = await executeWithRetry(async () => {
    // Mark stale running jobs as queued again if heartbeat expired
    await db.query(`UPDATE jobs SET status='queued', heartbeat_at=NULL, started_at=NULL WHERE status='running' AND (heartbeat_at IS NULL OR heartbeat_at < NOW() - INTERVAL '${Math.max(1, Math.floor(leaseTimeoutMs/1000))} seconds')`);
    const r = await db.query(
      `UPDATE jobs SET status='running', started_at = COALESCE(started_at, NOW()), heartbeat_at = NOW(), updated_at = NOW()
       WHERE id = (
         SELECT id FROM jobs WHERE status='queued' AND canceled = FALSE ORDER BY created_at ASC LIMIT 1
       )
       RETURNING *;`
    );
    return r;
  }, 'claimNextJob');

  // No job available is valid, not an error
  if (!result.rows || result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
}

async function heartbeatJob(jobId) {
  await executeWithRetry(async () => {
    await db.query(`UPDATE jobs SET heartbeat_at = NOW(), updated_at = NOW() WHERE id = $1;`, [jobId]);
  }, 'heartbeatJob');
}

module.exports.claimNextJob = claimNextJob;
module.exports.heartbeatJob = heartbeatJob;
