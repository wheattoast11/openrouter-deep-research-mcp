// src/utils/dbClient.js
const { PGlite } = require('@electric-sql/pglite');
const { vector } = require('@electric-sql/pglite/vector');
const config = require('../../config');
const openRouterClient = require('./openRouterClient');
const path = require('path');

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

// Get retry configuration from config
const MAX_RETRIES = config.database.maxRetryAttempts;
const BASE_RETRY_DELAY = config.database.retryDelayBaseMs;

// Initialize embedder using @terminals-tech/embeddings
(async () => {
  try {
    const { EmbeddingProviderFactory } = await import('@terminals-tech/embeddings');
    process.stderr.write(`[${new Date().toISOString()}] Initializing @terminals-tech/embeddings...\n`);

    // Create provider with quantized cache for 75% memory savings
    embeddingProvider = await EmbeddingProviderFactory.createBest({
      cache: true,
      quantizeCache: true
    });

    isEmbedderReady = true;
    process.stderr.write(`[${new Date().toISOString()}] @terminals-tech/embeddings initialized successfully.\n`);

    // Trigger reindex if embedder version changed
    const previous = embedderVersionKey;
    embedderVersionKey = '@terminals-tech/embeddings-v0.1.0';
    if (dbInitialized && previous !== embedderVersionKey) {
      try { await reindexVectors(); } catch (_) {}
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to initialize @terminals-tech/embeddings:`, err);
    isEmbedderReady = false;
  }
})();

// Function to calculate cosine similarity using the embedding provider
function calculateCosineSimilarity(vecA, vecB) {
  if (!embeddingProvider) {
    console.error(`[${new Date().toISOString()}] Embedding provider not available for similarity calculation.`);
    return 0;
  }
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  try {
    return embeddingProvider.similarity(vecA, vecB);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Error calculating cosine similarity:`, e);
    return 0;
  }
}

// Generate embedding using @terminals-tech/embeddings
async function generateEmbedding(text) {
  if (!isEmbedderReady || !embeddingProvider) {
    console.error(`[${new Date().toISOString()}] Embedder not ready, cannot generate embedding for text: "${text.substring(0, 50)}..."`);
    return null;
  }
  try {
    const embedding = await embeddingProvider.embed(text);
    // Convert to regular array for PGLite storage
    return Array.isArray(embedding) ? embedding : Array.from(embedding);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error generating embedding for text "${text.substring(0, 50)}...":`, error);
    return null;
  }
}

// Batch embedding generation for efficiency
async function generateEmbeddingBatch(texts) {
  if (!isEmbedderReady || !embeddingProvider) {
    console.error(`[${new Date().toISOString()}] Embedder not ready for batch embedding.`);
    return texts.map(() => null);
  }
  try {
    const embeddings = await embeddingProvider.embedBatch(texts);
    return embeddings.map(e => Array.isArray(e) ? e : Array.from(e));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in batch embedding:`, error);
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
    process.stderr.write(`[${new Date().toISOString()}] Using explicitly configured database URL: ${config.database.databaseUrl}\n`); // Use stderr
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
          process.stderr.write(`[${new Date().toISOString()}] Created PGLite data directory at: ${dataDir}\n`); // Use stderr
        }
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error creating data directory: ${err.message}`);
        if (config.database.allowInMemoryFallback) {
          console.error(`[${new Date().toISOString()}] Falling back to in-memory database as configured.`);
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
    process.stderr.write(`[${new Date().toISOString()}] Could not determine environment or create directory, using in-memory database.\n`); // Use stderr
    dbPathInfo = 'In-Memory (Fallback)';
    return null; // Indicates in-memory
  } else {
    throw new Error("Could not determine environment and in-memory fallback is disabled.");
  }
}

/**
 * Initialize PGLite database with modern async pattern and proper fallback
 */
async function initDB() {
  // Skip if already initialized successfully
  if (dbInitialized && db) {
    return true;
  }
  
  // If we've already attempted initialization but failed, don't retry too frequently
  if (dbInitAttempted) {
    const timeSinceLastAttempt = Date.now() - dbInitAttempted;
    // If a recent attempt was made, wait briefly instead of outright skipping
    if (timeSinceLastAttempt < 500) {
      const waitMs = 500 - timeSinceLastAttempt;
      console.error(`[${new Date().toISOString()}] Waiting ${waitMs}ms before retrying DB initialization (last attempt ${Math.round(timeSinceLastAttempt)}ms ago)`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  dbInitAttempted = Date.now();
  usingInMemoryFallback = false;

  try {
    // Get database URL based on environment
    const dbUrl = getDatabaseUrl();
    
    // Initialize PGLite with the vector extension
    if (dbUrl) {
      process.stderr.write(`[${new Date().toISOString()}] Initializing PGLite with Storage: ${dbPathInfo}\n`); // Use stderr

      // Use modern async creation pattern
      db = await PGlite.create({
        url: dbUrl,
        extensions: { vector },
        // Use configured relaxedDurability setting
        relaxedDurability: config.database.relaxedDurability
      });
    } else {
      // Fallback to in-memory DB if no URL is available (dbPathInfo already set)
      process.stderr.write(`[${new Date().toISOString()}] Initializing PGLite with Storage: ${dbPathInfo}\n`); // Use stderr
      db = await PGlite.create({
        extensions: { vector } // No URL needed for in-memory
      });
      usingInMemoryFallback = true;
    }

    // Enable the vector extension
    await db.query("CREATE EXTENSION IF NOT EXISTS vector;");
    process.stderr.write(`[${new Date().toISOString()}] PGLite vector extension enabled\n`); // Use stderr

    // Create the reports table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS reports (
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
    process.stderr.write(`[${new Date().toISOString()}] PGLite reports table created or verified\n`); // Use stderr

    // Optional: BM25-style inverted index tables (enabled via config.indexer.enabled)
    if (config.indexer?.enabled) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS index_documents (
          id SERIAL PRIMARY KEY,
          source_type TEXT NOT NULL, -- 'report' | 'url' | 'doc'
          source_id TEXT NOT NULL,   -- report id or URL or custom id
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
      // Ensure missing columns for legacy installs
      try { await db.query(`ALTER TABLE index_documents ADD COLUMN IF NOT EXISTS doc_len INTEGER;`); } catch(_) {}
      try { await db.query(`ALTER TABLE index_documents ADD COLUMN IF NOT EXISTS doc_embedding VECTOR(${config.database.vectorDimension});`); } catch(_) {}
      try { await db.query(`CREATE INDEX IF NOT EXISTS idx_index_documents_embedding ON index_documents USING hnsw (doc_embedding vector_cosine_ops);`); } catch(_) {}
      process.stderr.write(`[${new Date().toISOString()}] BM25/vector index tables created or verified\n`);
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
    process.stderr.write(`[${new Date().toISOString()}] Job tables created or verified\n`);

    // Usage counters to track interactions with docs/reports
    await db.query(`
      CREATE TABLE IF NOT EXISTS usage_counters (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        uses INTEGER NOT NULL DEFAULT 0,
        last_used_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (entity_type, entity_id)
      );
    `);
    process.stderr.write(`[${new Date().toISOString()}] usage_counters table created or verified\n`);

    // Create indexes for better performance
    await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_original_query ON reports (original_query);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);`);
    
    // Create vector index for similarity search
    await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_query_embedding ON reports USING hnsw (query_embedding vector_cosine_ops);`);
    process.stderr.write(`[${new Date().toISOString()}] PGLite indexes created or verified\n`); // Use stderr

    dbInitialized = true;
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to initialize PGLite database:`, error);
    // Try in-memory fallback if not already using it
    if (!usingInMemoryFallback) {
      process.stderr.write(`[${new Date().toISOString()}] Attempting fallback to in-memory database\n`); // Use stderr
      try {
        dbPathInfo = 'In-Memory (Error Fallback)'; // Update path info for error fallback
        process.stderr.write(`[${new Date().toISOString()}] Initializing PGLite with Storage: ${dbPathInfo}\n`); // Use stderr
        db = await PGlite.create({
          extensions: { vector } // No URL needed for in-memory
        });
        await db.query("CREATE EXTENSION IF NOT EXISTS vector;");

        // Create minimal table structure needed for operation
        await db.query(`
          CREATE TABLE IF NOT EXISTS reports (
            id SERIAL PRIMARY KEY,
            original_query TEXT NOT NULL,
            parameters JSONB,
            final_report TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        
        dbInitialized = true;
        usingInMemoryFallback = true;
        process.stderr.write(`[${new Date().toISOString()}] Successfully initialized in-memory database fallback\n`); // Use stderr
        return true;
      } catch (fallbackError) {
        console.error(`[${new Date().toISOString()}] Failed to initialize in-memory database fallback:`, fallbackError);
        db = null;
        dbInitialized = false;
        return false;
      }
    } else {
      db = null;
      dbInitialized = false;
      return false;
    }
  }
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
  return executeWithRetry(async () => {
    const ins = await db.query(
      `INSERT INTO index_documents (source_type, source_id, title, content, doc_len, doc_embedding)
       VALUES ($1,$2,$3,$4,$5, CASE WHEN $6 IS NULL THEN NULL ELSE $6::vector END)
       RETURNING id;`,
      [sourceType, sourceId, title || null, truncated, docLen, embeddingVec]
    );
    const docId = ins.rows[0].id;
    const tfMap = new Map();
    for (const term of terms) tfMap.set(term, (tfMap.get(term) || 0) + 1);
    for (const [term, tf] of tfMap.entries()) {
      await db.query(`INSERT INTO index_terms (term, df) VALUES ($1, 1) ON CONFLICT (term) DO UPDATE SET df = index_terms.df + 1;`, [term]);
      await db.query(`INSERT INTO index_postings (term, doc_id, tf) VALUES ($1,$2,$3) ON CONFLICT (term, doc_id) DO UPDATE SET tf = EXCLUDED.tf;`, [term, docId, tf]);
    }
    return docId;
  }, 'indexDocument', null);
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
         FROM reports r
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
    const r = await db.query(`SELECT id, original_query, final_report, created_at FROM reports ORDER BY id DESC LIMIT $1;`, [limit]);
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
 * @param {Function} operation Function that returns a promise for the DB operation
 * @param {string} operationName Name of the operation for logging
 * @param {any} fallbackValue Value to return if all retries fail
 * @returns {Promise<any>} Result of the operation or fallback value
 */
async function executeWithRetry(operation, operationName, fallbackValue) {
  // Try to initialize DB if not already initialized
  if (!dbInitialized) {
    await initDB();
  }
  
  // If we still don't have an initialized DB, return fallback
  if (!dbInitialized || !db) {
    console.error(`[${new Date().toISOString()}] Cannot perform ${operationName}: Database not initialized`);
    return fallbackValue;
  }
  
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      return await operation();
    } catch (error) {
      retries++;
      if (retries >= MAX_RETRIES) {
        console.error(`[${new Date().toISOString()}] Failed ${operationName} after ${MAX_RETRIES} attempts. Error:`, error);
        return fallbackValue;
      }
      
      // Exponential backoff with jitter
      const delay = BASE_RETRY_DELAY * Math.pow(2, retries - 1) * (0.9 + Math.random() * 0.2);
      console.warn(`[${new Date().toISOString()}] Retrying ${operationName} after ${Math.round(delay)}ms (attempt ${retries}/${MAX_RETRIES}). Error:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function saveResearchReport({ originalQuery, parameters, finalReport, researchMetadata, images, textDocuments, structuredData, basedOnPastReportIds }) {
  if (!isEmbedderReady) {
    console.warn(`[${new Date().toISOString()}] Embedder not ready, saving report without embedding for query: "${originalQuery.substring(0, 50)}..."`);
  }

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(originalQuery);
  const queryEmbeddingFormatted = queryEmbedding ? formatVectorForPgLite(queryEmbedding) : null;

  return executeWithRetry(
    async () => {
      const result = await db.query(
        `INSERT INTO reports (
          original_query,
          query_embedding,
          parameters,
          final_report,
          research_metadata,
          images,
          text_documents,
          structured_data,
          based_on_past_report_ids,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id;`,
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
          new Date().toISOString()
        ]
      );
      
      const reportId = result.rows[0].id;
      console.error(`[${new Date().toISOString()}] Successfully saved research report to PGLite with ID: ${reportId}`);
      return reportId.toString();
    },
    'saveResearchReport',
    null // fallback value if operation fails
  );
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
  // Validate reportId is a number
  const reportIdNum = parseInt(reportId, 10);
  if (isNaN(reportIdNum)) {
    console.error(`[${new Date().toISOString()}] Invalid report ID format: ${reportId}`);
    return false;
  }

  return executeWithRetry(
    async () => {
      // First, get the current feedback entries
      const currentResult = await db.query(
        `SELECT feedback_entries FROM reports WHERE id = $1;`,
        [reportIdNum]
      );
      
      if (currentResult.rows.length === 0) {
        console.error(`[${new Date().toISOString()}] Feedback failed: Report ID ${reportId} not found.`);
        return false;
      }

      // Parse current feedback entries (will be a string in JSON format)
      let feedbackEntries = [];
      const currentFeedbackJson = currentResult.rows[0].feedback_entries;
      try {
        // Handle null, undefined, or empty string explicitly before parsing
        if (currentFeedbackJson && currentFeedbackJson.trim() !== '') {
          feedbackEntries = JSON.parse(currentFeedbackJson);
          if (!Array.isArray(feedbackEntries)) {
             console.warn(`[${new Date().toISOString()}] Parsed feedback for report ${reportId} was not an array, resetting.`);
             feedbackEntries = [];
          }
        } else {
          // If null, undefined, or empty string, initialize as empty array
          feedbackEntries = [];
        }
      } catch (parseError) {
        console.error(`[${new Date().toISOString()}] Error parsing feedback entries for report ID ${reportId}, resetting to empty array. Error:`, parseError);
        feedbackEntries = []; // Reset to empty array on any parsing error
      }

      // Add new feedback
      feedbackEntries.push({
        ...feedback,
        timestamp: new Date().toISOString()
      });

      // Update the report with the new feedback entries
      await db.query(
        `UPDATE reports 
         SET feedback_entries = $1, 
             updated_at = $2 
         WHERE id = $3;`,
        [JSON.stringify(feedbackEntries), new Date().toISOString(), reportIdNum]
      );

      console.error(`[${new Date().toISOString()}] Successfully added feedback to report ID: ${reportId}`);
      return true;
    },
    'addFeedbackToReport',
    false // fallback value if operation fails
  );
}

async function findReportsByQuery(query) {
  return executeWithRetry(
    async () => {
      const result = await db.query(
        `SELECT * FROM reports WHERE original_query = $1 ORDER BY created_at DESC;`,
        [query]
      );
      return result.rows.map(row => ({
        ...row,
        _id: row.id, // Add _id field for backward compatibility
        queryEmbedding: null // Omit the embedding for cleaner output
      }));
    },
    'findReportsByQuery',
    [] // fallback value if operation fails
  );
}

async function findReportsBySimilarity(queryText, limit = 5, minSimilarity = 0.75) {
  if (!isEmbedderReady) {
    console.error(`[${new Date().toISOString()}] Cannot perform similarity search: Embedder not ready.`);
    return [];
  }

  const queryEmbedding = await generateEmbedding(queryText);
  if (!queryEmbedding) {
    console.error(`[${new Date().toISOString()}] Failed to generate embedding for similarity search query: "${queryText.substring(0, 50)}..."`);
    return [];
  }

  // Adaptive thresholding: widen if no hits, tighten if many
  const thresholds = [minSimilarity, 0.70, 0.65, 0.60];
  for (const thr of thresholds) {
    const results = await executeWithRetry(
      async () => {
        const queryEmbeddingFormatted = formatVectorForPgLite(queryEmbedding);
        const result = await db.query(
          `SELECT 
             id, 
             original_query, 
             parameters, 
             final_report, 
             research_metadata,
             created_at,
             1 - (query_embedding <=> $1::vector) AS similarity_score
           FROM reports 
           WHERE query_embedding IS NOT NULL
           AND 1 - (query_embedding <=> $1::vector) >= $2
           ORDER BY similarity_score DESC
           LIMIT $3;`,
          [queryEmbeddingFormatted, thr, limit]
        );
        return result.rows;
      },
      'findReportsBySimilarity',
      []
    );

    if (results && results.length > 0) {
      const reports = results.map(row => ({
        ...row,
        _id: row.id,
        originalQuery: row.original_query,
        similarityScore: row.similarity_score,
        parameters: typeof row.parameters === 'string' ? JSON.parse(row.parameters) : row.parameters,
        researchMetadata: typeof row.research_metadata === 'string' ? JSON.parse(row.research_metadata) : row.research_metadata
      }));
      console.error(`[${new Date().toISOString()}] Found ${reports.length} reports via vector search (minSimilarity: ${thr}).`);
      return reports;
    }
  }

  // Keyword fallback when vector search yields nothing
  console.warn(`[${new Date().toISOString()}] Vector search returned no results. Falling back to keyword search.`);
  const likeTerm = `%${queryText.split(/\s+/).slice(0, 4).join('%')}%`;
  const keywordRows = await executeWithRetry(
    async () => {
      const result = await db.query(
        `SELECT id, original_query, parameters, final_report, research_metadata, created_at
         FROM reports
         WHERE original_query ILIKE $1
         ORDER BY created_at DESC
         LIMIT $2;`,
        [likeTerm, limit]
      );
      return result.rows;
    },
    'keywordFallbackSearch',
    []
  );
  const keywordReports = keywordRows.map(row => ({
    ...row,
    _id: row.id,
    originalQuery: row.original_query,
    similarityScore: 0
  }));
  return keywordReports;
}

async function listRecentReports(limit = 10, queryFilter = null) {
  return executeWithRetry(
    async () => {
      let query, params;
      
      if (queryFilter) {
        // Use LIKE for case-insensitive substring search
        query = `
          SELECT 
            id, 
            original_query, 
            parameters, 
            created_at,
            research_metadata
          FROM reports
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
          FROM reports
          ORDER BY created_at DESC
          LIMIT $1;
        `;
        params = [limit];
      }

      const result = await db.query(query, params);
      
      const reports = result.rows.map(row => ({
        ...row,
        _id: row.id, // Add _id field for backward compatibility
        originalQuery: row.original_query,
        // Convert JSONB strings back to objects
        parameters: typeof row.parameters === 'string' ? JSON.parse(row.parameters) : row.parameters,
        researchMetadata: typeof row.research_metadata === 'string' ? JSON.parse(row.research_metadata) : row.research_metadata
      }));

      console.error(`[${new Date().toISOString()}] Found ${reports.length} reports matching filter "${queryFilter || 'None'}" (limit: ${limit}).`);
      return reports;
    },
    'listRecentReports',
    [] // fallback value if operation fails
  );
}

// Initialize DB on startup (async)
(async () => {
  try {
    await initDB();
    if (config.indexer?.enabled && config.indexer.autoIndexReports) {
      try { const n = await indexExistingReports(500); process.stderr.write(`[${new Date().toISOString()}] Indexed existing reports: ${n}\n`); } catch (e) {}
    }
  } catch (dbInitError) {
    console.error(`[${new Date().toISOString()}] Critical error during initial DB connection:`, dbInitError);
    // Don't exit - allow operation without database if necessary
  }
})();

module.exports = {
  saveResearchReport,
  findReportsByQuery,
  addFeedbackToReport,
  findReportsBySimilarity,
  listRecentReports,
  getReportById, // Export the new function
  // Export status variables for the status tool
  isEmbedderReady: () => isEmbedderReady,
  isDbInitialized: () => dbInitialized,
  getDbPathInfo: () => dbPathInfo,
  executeQuery, // Export the new function
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
  // Usage API
  incrementUsage,
  incrementUsageMany
};

// Function to retrieve a single report by its ID
async function getReportById(reportId) {
  // Validate reportId is a number
  const reportIdNum = parseInt(reportId, 10);
  if (isNaN(reportIdNum)) {
    console.error(`[${new Date().toISOString()}] Invalid report ID format for retrieval: ${reportId}`);
    return null; // Return null for invalid ID format
  }

  return executeWithRetry(
    async () => {
      const result = await db.query(
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
         FROM reports 
         WHERE id = $1;`,
        [reportIdNum]
      );
      
      if (result.rows.length === 0) {
        console.error(`[${new Date().toISOString()}] Report with ID ${reportId} not found.`);
        return null; // Return null if report not found
      }

      const report = result.rows[0];
      console.error(`[${new Date().toISOString()}] Successfully retrieved report ID: ${reportId}`);
      
      // Convert JSONB strings back to objects for consistency
      return {
        ...report,
        _id: report.id, // Add _id field
        parameters: typeof report.parameters === 'string' ? JSON.parse(report.parameters) : report.parameters,
        researchMetadata: typeof report.research_metadata === 'string' ? JSON.parse(report.research_metadata) : report.research_metadata,
        images: typeof report.images === 'string' ? JSON.parse(report.images) : report.images,
        text_documents: typeof report.text_documents === 'string' ? JSON.parse(report.text_documents) : report.text_documents,
        structured_data: typeof report.structured_data === 'string' ? JSON.parse(report.structured_data) : report.structured_data,
        based_on_past_report_ids: typeof report.based_on_past_report_ids === 'string' ? JSON.parse(report.based_on_past_report_ids) : report.based_on_past_report_ids,
        feedback_entries: typeof report.feedback_entries === 'string' ? JSON.parse(report.feedback_entries) : report.feedback_entries,
        queryEmbedding: null // Explicitly exclude embedding
      };
    },
    `getReportById(${reportId})`,
    null // fallback value if operation fails
  );
}

// Function to execute an arbitrary (but validated) SQL query securely
async function executeQuery(sql, params = []) {
  // Basic validation: Ensure it's a SELECT query for safety (can be configured later)
  const lowerSql = sql.trim().toLowerCase();
  if (!lowerSql.startsWith('select')) {
    console.error(`[${new Date().toISOString()}] executeQuery: Blocking non-SELECT query: "${sql.substring(0, 100)}..."`);
    throw new Error("Only SELECT statements are currently allowed via executeQuery.");
  }

  return executeWithRetry(
    async () => {
      // Use parameterized query execution
      const result = await db.query(sql, params);
      console.error(`[${new Date().toISOString()}] executeQuery: Successfully executed query. Rows returned: ${result.rows.length}`);
      return result.rows; // Return the array of row objects
    },
    `executeQuery("${sql.substring(0, 50)}...")`,
    [] // fallback value (empty array) if operation fails
  );
}

// Function to rebuild the vector index safely
async function reindexVectors() {
  return executeWithRetry(
    async () => {
      try { await db.query(`DROP INDEX IF EXISTS idx_reports_query_embedding;`); } catch (e) {}
      // Recreate HNSW with conservative params for <50k vectors
      await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_query_embedding ON reports USING hnsw (query_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);`);
      return true;
    },
    'reindexVectors',
    false
  );
}

// --- Usage counters helpers ---
async function incrementUsage(entityType, entityId, inc = 1) {
  return executeWithRetry(async () => {
    await db.query(
      `INSERT INTO usage_counters (entity_type, entity_id, uses, last_used_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (entity_type, entity_id)
       DO UPDATE SET uses = usage_counters.uses + EXCLUDED.uses, last_used_at = NOW();`,
      [entityType, String(entityId), Number(inc) || 1]
    );
    return true;
  }, 'incrementUsage', false);
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
  }, 'createJob', null);
  return id;
}

async function appendJobEvent(jobId, eventType, payload) {
  return executeWithRetry(async () => {
    const res = await db.query(
      `INSERT INTO job_events (job_id, event_type, payload, ts) VALUES ($1,$2,$3, NOW()) RETURNING id, ts;`,
      [jobId, eventType, JSON.stringify(payload || {})]
    );
    await db.query(`UPDATE jobs SET updated_at = NOW(), heartbeat_at = NOW() WHERE id = $1;`, [jobId]);
    return res.rows[0];
  }, 'appendJobEvent', null);
}

async function setJobStatus(jobId, status, { progress = null, result = null, started = false, finished = false } = {}) {
  return executeWithRetry(async () => {
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
  }, 'setJobStatus', null);
}

async function getJob(jobId) {
  const row = await executeWithRetry(async () => {
    const r = await db.query(`SELECT * FROM jobs WHERE id = $1;`, [jobId]);
    return r.rows[0] || null;
  }, 'getJob', null);
  return row;
}

async function getJobEvents(jobId, afterId = 0, limit = 500) {
  return executeWithRetry(async () => {
    const r = await db.query(
      `SELECT id, job_id, ts, event_type, payload FROM job_events WHERE job_id = $1 AND id > $2 ORDER BY id ASC LIMIT $3;`,
      [jobId, Number(afterId) || 0, limit]
    );
    return r.rows;
  }, 'getJobEvents', []);
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
  }, 'cancelJob', null);
  return true;
}

// Claim the next queued job with a lease
async function claimNextJob() {
  const now = new Date().toISOString();
  const leaseTimeoutMs = require('../../config').jobs.leaseTimeoutMs;
  return executeWithRetry(async () => {
    // Mark stale running jobs as queued again if heartbeat expired
    await db.query(`UPDATE jobs SET status='queued', heartbeat_at=NULL, started_at=NULL WHERE status='running' AND (heartbeat_at IS NULL OR heartbeat_at < NOW() - INTERVAL '${Math.max(1, Math.floor(leaseTimeoutMs/1000))} seconds')`);
    const r = await db.query(
      `UPDATE jobs SET status='running', started_at = COALESCE(started_at, NOW()), heartbeat_at = NOW(), updated_at = NOW()
       WHERE id = (
         SELECT id FROM jobs WHERE status='queued' AND canceled = FALSE ORDER BY created_at ASC LIMIT 1
       )
       RETURNING *;`
    );
    return r.rows[0] || null;
  }, 'claimNextJob', null);
}

async function heartbeatJob(jobId) {
  return executeWithRetry(async () => {
    await db.query(`UPDATE jobs SET heartbeat_at = NOW(), updated_at = NOW() WHERE id = $1;`, [jobId]);
  }, 'heartbeatJob', null);
}

module.exports.claimNextJob = claimNextJob;
module.exports.heartbeatJob = heartbeatJob;
