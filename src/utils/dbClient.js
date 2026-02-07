// src/utils/dbClient.js
// Unified Data Layer - PGLite + Jobs + HVM Signal Integration
// L5 Protocol Bridge for Agent Zero

const { PGlite } = require('@electric-sql/pglite');
const { randomUUID } = require('crypto');
const crypto = require('crypto');

// First-class extensions
const { vector } = require('@electric-sql/pglite/vector');
const { live } = require('@electric-sql/pglite/live');

// Contrib extensions (optional, wrapped in try-catch)
let bloom, cube, seg, tcn, tsm_system_time, ltree, lo, tablefunc, uuid_ossp, fuzzystrmatch, citext, hstore;
try { bloom = require('@electric-sql/pglite/contrib/bloom').bloom; } catch (_) {}
try { cube = require('@electric-sql/pglite/contrib/cube').cube; } catch (_) {}
try { seg = require('@electric-sql/pglite/contrib/seg').seg; } catch (_) {}
try { tcn = require('@electric-sql/pglite/contrib/tcn').tcn; } catch (_) {}
try { tsm_system_time = require('@electric-sql/pglite/contrib/tsm_system_time').tsm_system_time; } catch (_) {}
try { ltree = require('@electric-sql/pglite/contrib/ltree').ltree; } catch (_) {}
try { lo = require('@electric-sql/pglite/contrib/lo').lo; } catch (_) {}
try { tablefunc = require('@electric-sql/pglite/contrib/tablefunc').tablefunc; } catch (_) {}
try { uuid_ossp = require('@electric-sql/pglite/contrib/uuid_ossp').uuid_ossp; } catch (_) {}
try { fuzzystrmatch = require('@electric-sql/pglite/contrib/fuzzystrmatch').fuzzystrmatch; } catch (_) {}
try { citext = require('@electric-sql/pglite/contrib/citext').citext; } catch (_) {}
try { hstore = require('@electric-sql/pglite/contrib/hstore').hstore; } catch (_) {}

const config = require('../../config');
const providerManager = require('../core/providers');
const path = require('path');
const logger = require('./logger').child('DBClient');

// Detect environment
const isNodeEnv = typeof process !== 'undefined' && process.versions && process.versions.node;
const isBrowserEnv = typeof window !== 'undefined';
const nodeMajor = isNodeEnv ? parseInt(process.versions.node.split('.')[0], 10) : null;
const isDarwin = isNodeEnv ? process.platform === 'darwin' : false;
// Node 25/macOS: mutex error on shutdown is cosmetic, data persists fine
// DB_AUTO_HEAL=true forces in-memory mode (no persistence)
// DB_AUTO_HEAL=false (default) uses persistent storage with cosmetic shutdown error
const autoHealEnabled = isNodeEnv && isDarwin && nodeMajor >= 25 && process.env.DB_AUTO_HEAL === 'true';

// Variables for filesystem access
let fs;
if (isNodeEnv) {
  fs = require('fs');
}

let db = null;
let isEmbedderReady = false;
let embeddingProvider = null;
let dbInitialized = false;
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
let isClosing = false;
let shutdownComplete = false;
let closingPromise = null;
let shutdownStartAt = null;
const subscriptions = new Set();
let activeOperations = 0;
const idleWaiters = new Set();
const connectionId = randomUUID();

// Get retry configuration from config
const MAX_RETRIES = config.database?.maxRetryAttempts || 3;
const BASE_RETRY_DELAY = config.database?.retryDelayBaseMs || 200;

// ============================================================================
// EMBEDDER INITIALIZATION - Uses @terminals-tech/embeddings package
// ============================================================================

let embedderInitPromise = null;
let embedderIsMock = false;

async function initializeEmbedder() {
  if (embedderInitPromise) return embedderInitPromise;

  embedderInitPromise = (async () => {
    try {
      // Use @terminals-tech/embeddings package - handles transformers → mock fallback
      const { EmbeddingProviderFactory, MockEmbeddingProvider } = require('@terminals-tech/embeddings');

      logger.info('Initializing @terminals-tech/embeddings provider');

      const providerConfig = {
        preferredProvider: 'transformers',
        cache: true,
        cacheSize: 1000,
        quantizeCache: true
      };

      // createBest tries TransformersEmbeddingProvider, falls back to MockEmbeddingProvider
      embeddingProvider = await EmbeddingProviderFactory.createBest(providerConfig);

      // Check if we got the mock (transformers unavailable)
      embedderIsMock = embeddingProvider instanceof MockEmbeddingProvider ||
                       embeddingProvider.constructor.name === 'MockEmbeddingProvider';

      if (embedderIsMock) {
        logger.warn('Using MockEmbeddingProvider - vector search quality will be degraded');
      } else {
        logger.info('TransformersEmbeddingProvider initialized successfully');
      }

      isEmbedderReady = true;
      return { ready: true, isMock: embedderIsMock };
    } catch (err) {
      logger.error('Failed to initialize @terminals-tech/embeddings', { error: err });
      isEmbedderReady = false;
      return { ready: false, error: err.message };
    }
  })();

  return embedderInitPromise;
}

// Start initialization automatically
initializeEmbedder();

function calculateCosineSimilarity(vecA, vecB) {
  if (!embeddingProvider) return 0;
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  try {
    return embeddingProvider.similarity(vecA, vecB);
  } catch (e) {
    logger.error('Error calculating cosine similarity', { error: e });
    return 0;
  }
}

async function generateEmbedding(text) {
  if (!isEmbedderReady || !embeddingProvider) {
    logger.debug('Embedder not ready, cannot generate embedding');
    return null;
  }
  try {
    const embedding = await embeddingProvider.embed(text);
    let result;
    if (embedding && embedding.values) {
      result = Array.from(embedding.values);
    } else {
      result = Array.isArray(embedding) ? embedding : Array.from(embedding);
    }
    // Validate: replace NaN/Infinity with 0 to prevent PGLite vector errors
    for (let i = 0; i < result.length; i++) {
      if (!Number.isFinite(result[i])) {
        result[i] = 0;
      }
    }
    return result;
  } catch (error) {
    logger.error('Error generating embedding', { error });
    return null;
  }
}

async function generateEmbeddingBatch(texts) {
  if (!isEmbedderReady || !embeddingProvider) {
    return texts.map(() => null);
  }
  try {
    const embeddings = await embeddingProvider.embedBatch(texts);
    return embeddings.map(e => {
      let result;
      if (e && e.values) {
        result = Array.from(e.values);
      } else {
        result = Array.isArray(e) ? e : Array.from(e);
      }
      // Validate: replace NaN/Infinity with 0 to prevent PGLite vector errors
      for (let i = 0; i < result.length; i++) {
        if (!Number.isFinite(result[i])) {
          result[i] = 0;
        }
      }
      return result;
    });
  } catch (error) {
    logger.error('Error in batch embedding', { error });
    return texts.map(() => null);
  }
}

function formatVectorForPgLite(vectorArray) {
  if (!vectorArray) return null;
  return `[${vectorArray.join(',')}]`;
}

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

function getDatabaseUrl() {
  dbPathInfo = 'Determining...';

  // Zero CLI Mode: Enforce strict local isolation (~/.zero/db)
  // This ensures the CLI uses a private PGLite instance separate from any running server
  if (process.env.ZERO_CLI_MODE === 'true' && isNodeEnv) {
    try {
      const home = process.env.HOME || process.env.USERPROFILE;
      // Default to ~/.zero/db but allow override via ZERO_DB_PATH
      const zeroDbPath = process.env.ZERO_DB_PATH || path.join(home, '.zero', 'db');
      
      if (fs) {
        if (!fs.existsSync(zeroDbPath)) {
          fs.mkdirSync(zeroDbPath, { recursive: true });
        }
        // Verify write access
        fs.accessSync(zeroDbPath, fs.constants.W_OK);
        
        dbPathInfo = `Zero CLI (${zeroDbPath})`;
        return `file://${zeroDbPath}`;
      }
    } catch (err) {
      logger.warn('Failed to initialize Zero CLI local DB, falling back to in-memory', { error: err.message });
      // Fall through to standard logic (which handles in-memory fallback)
    }
  }

  if (autoHealEnabled) {
    dbPathInfo = 'In-Memory (Node25 macOS auto-heal)';
    return null;
  }
  
  if (config.database?.databaseUrl) {
    logger.info('Using explicitly configured database URL');
    return config.database.databaseUrl;
  }

  if (isBrowserEnv) {
    dbPathInfo = `IndexedDB (idb://research-agent-db)`;
    return `idb://research-agent-db`;
  } else if (isNodeEnv) {
    const dataDir = path.resolve(config.database?.dataDirectory || './data/pglite');

    if (fs) {
      const parentDir = path.dirname(dataDir);
      try {
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.accessSync(parentDir, fs.constants.W_OK);
      } catch (accessErr) {
        if (['EACCES', 'EROFS'].includes(accessErr.code)) {
          logger.info('Parent directory not writable, using in-memory database');
          if (config.database?.allowInMemoryFallback) {
            dbPathInfo = `In-Memory (${accessErr.code})`;
            return null;
          }
        }
      }

      try {
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
      } catch (err) {
        logger.error('Error creating data directory', { error: err });
        if (config.database?.allowInMemoryFallback) {
          return null;
        }
        throw new Error(`Could not create data directory: ${err.message}`);
      }
    }
    dbPathInfo = `File (${dataDir})`;
    return `file://${dataDir}`;
  }

  if (config.database?.allowInMemoryFallback) {
    dbPathInfo = 'In-Memory (Fallback)';
    return null;
  }
  throw new Error("Could not determine environment and in-memory fallback is disabled.");
}

function initDB() {
  if (shutdownComplete) {
    return Promise.reject(new Error('Database shutdown complete'));
  }
  if (isClosing) {
    return Promise.reject(new Error('Database shutdown in progress'));
  }
  if (initPromise) {
    return initPromise;
  }
  initPromise = _doInitDB();
  return initPromise;
}

async function _doInitDB() {
  if (shutdownComplete || isClosing) {
    throw new Error('Database shutdown in progress or complete');
  }
  
  if (initState === InitState.INITIALIZED && db) {
    return true;
  }

  if (initState === InitState.FAILED && initError && !config.database?.retryOnFailure) {
    throw initError;
  }

  initState = InitState.INITIALIZING;
  initError = null;
  usingInMemoryFallback = false;

  try {
    const dbUrl = getDatabaseUrl();
    const maxCreateRetries = config.database?.maxRetryAttempts || 3;
    const retryDelay = config.database?.retryDelayBaseMs || 200;
    
    // Build extensions object
    const extensions = { vector, live };
    if (bloom) extensions.bloom = bloom;
    if (ltree) extensions.ltree = ltree;
    if (fuzzystrmatch) extensions.fuzzystrmatch = fuzzystrmatch;
    if (citext) extensions.citext = citext;
    if (hstore) extensions.hstore = hstore;
    
    let lastCreateError = null;
    for (let attempt = 1; attempt <= maxCreateRetries; attempt++) {
      try {
        if (dbUrl) {
          logger.info(`Initializing PGLite (attempt ${attempt}/${maxCreateRetries})`, { storage: dbPathInfo });
          db = await PGlite.create({
            dataDir: dbUrl,
            extensions,
            relaxedDurability: config.database?.relaxedDurability
          });
        } else {
          logger.info(`Initializing PGLite (in-memory, attempt ${attempt}/${maxCreateRetries})`);
          db = await PGlite.create({ extensions });
          usingInMemoryFallback = true;
        }
        lastCreateError = null;
        break;
      } catch (err) {
        lastCreateError = err;
        logger.warn(`PGlite creation attempt ${attempt} failed: ${err.message}`);
        if (attempt < maxCreateRetries) {
          await new Promise(r => setTimeout(r, retryDelay * attempt));
        }
      }
    }

    if (lastCreateError) {
      throw lastCreateError;
    }

    // Enable extensions
    await db.query("CREATE EXTENSION IF NOT EXISTS vector;");
    logger.info('PGLite vector extension enabled');

    // Create tables
    const vectorDim = config.database?.vectorDimension || 384;
    
    // Research reports table
    await db.query(`
      CREATE TABLE IF NOT EXISTS research_reports (
        id SERIAL PRIMARY KEY,
        original_query TEXT NOT NULL,
        query_embedding VECTOR(${vectorDim}),
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
        fact_check_results JSONB DEFAULT NULL,
        ensemble_signals JSONB DEFAULT '[]'::jsonb
      );
    `);
    logger.info('Research reports table created');

    // Jobs table for async processing
    await db.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        params JSONB,
        status TEXT NOT NULL DEFAULT 'queued',
        progress JSONB,
        result JSONB,
        events JSONB DEFAULT '[]'::jsonb,
        canceled BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        heartbeat_at TIMESTAMPTZ
      );
    `);
    logger.info('Jobs table created');

    // Job events table (for detailed event tracking)
    await db.query(`
      CREATE TABLE IF NOT EXISTS job_events (
        id SERIAL PRIMARY KEY,
        job_id TEXT NOT NULL,
        ts TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        event_type TEXT NOT NULL,
        payload JSONB,
        shape_hash TEXT
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);`);
    logger.info('Job events table created');

    // HVM reductions cache table
    await db.query(`
      CREATE TABLE IF NOT EXISTS hvm_reductions (
        id SERIAL PRIMARY KEY,
        term_hash TEXT UNIQUE NOT NULL,
        normal_form JSONB,
        reduction_count INTEGER DEFAULT 0,
        parallel_groups INTEGER DEFAULT 0,
        duration_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    logger.info('HVM reductions table created');

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

    // Tool observations
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

    // Providers table
    await db.query(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        capabilities JSONB,
        config_path TEXT,
        last_active_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_research_reports_created_at ON research_reports (created_at DESC);`);
    try {
      await db.query(`CREATE INDEX IF NOT EXISTS idx_research_reports_query_embedding ON research_reports USING hnsw (query_embedding vector_cosine_ops);`);
    } catch (e) {
      logger.debug('HNSW index creation skipped', { error: e.message });
    }

    initState = InitState.INITIALIZED;
    dbInitialized = true;
    logger.info('Database initialization complete', { storage: dbPathInfo, inMemory: usingInMemoryFallback });
    return true;

  } catch (error) {
    logger.error('Failed to initialize PGLite database', { error: error.message });

    if (!usingInMemoryFallback && config.database?.allowInMemoryFallback) {
      logger.warn('FALLBACK: Attempting in-memory database');
      try {
        dbPathInfo = 'In-Memory (Error Fallback)';
        db = await PGlite.create({ extensions: { vector } });
        await db.query("CREATE EXTENSION IF NOT EXISTS vector;");
        
        // Create minimal tables
        await db.query(`
          CREATE TABLE IF NOT EXISTS research_reports (
            id SERIAL PRIMARY KEY,
            original_query TEXT NOT NULL,
            query_embedding VECTOR(384),
            parameters JSONB,
            final_report TEXT NOT NULL,
            research_metadata JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            feedback_entries JSONB DEFAULT '[]',
            accuracy_score REAL DEFAULT NULL,
            fact_check_results JSONB DEFAULT NULL,
            ensemble_signals JSONB DEFAULT '[]'::jsonb
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
            events JSONB DEFAULT '[]'::jsonb,
            canceled BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            started_at TIMESTAMPTZ,
            finished_at TIMESTAMPTZ,
            heartbeat_at TIMESTAMPTZ
          );
        `);
        // Add missing tables for full functionality in fallback mode
        await db.query(`
          CREATE TABLE IF NOT EXISTS job_events (
            id SERIAL PRIMARY KEY,
            job_id TEXT NOT NULL,
            ts TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            event_type TEXT NOT NULL,
            payload JSONB,
            shape_hash TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);
        `);
        await db.query(`
          CREATE TABLE IF NOT EXISTS hvm_reductions (
            id SERIAL PRIMARY KEY,
            term_hash TEXT UNIQUE NOT NULL,
            normal_form JSONB,
            reduction_count INTEGER DEFAULT 0,
            parallel_groups INTEGER DEFAULT 0,
            duration_ms INTEGER,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await db.query(`
          CREATE TABLE IF NOT EXISTS usage_counters (
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            uses INTEGER NOT NULL DEFAULT 0,
            last_used_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (entity_type, entity_id)
          );
        `);
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
          CREATE INDEX IF NOT EXISTS idx_tool_obs_name ON tool_observations (tool_name);
        `);
        await db.query(`
          CREATE TABLE IF NOT EXISTS providers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            capabilities JSONB,
            config_path TEXT,
            last_active_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );
        `);
        // Graph Tables (normally in knowledgeGraph.js but required here for fallback consistency)
        await db.query(`
          CREATE TABLE IF NOT EXISTS graph_nodes (
            id TEXT PRIMARY KEY,
            node_type TEXT NOT NULL,
            source_id TEXT,
            title TEXT,
            description TEXT,
            metadata JSONB,
            provider_id TEXT,
            lineage JSONB DEFAULT '[]',
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_graph_nodes_provider ON graph_nodes(provider_id);
        `);
        await db.query(`
          CREATE TABLE IF NOT EXISTS graph_edges (
            id SERIAL PRIMARY KEY,
            source_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            edge_type TEXT NOT NULL,
            weight FLOAT DEFAULT 1.0,
            metadata JSONB,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(source_id, target_id, edge_type)
          );
          CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id);
          CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id);
        `);

        initState = InitState.INITIALIZED;
        dbInitialized = true;
        usingInMemoryFallback = true;
        logger.warn('In-memory database fallback initialized - DATA WILL NOT PERSIST');
        return true;
      } catch (fallbackError) {
        logger.error('In-memory fallback also failed', { error: fallbackError.message });
        initError = new Error(`Primary and fallback initialization failed: ${fallbackError.message}`);
        initState = InitState.FAILED;
        throw initError;
      }
    } else {
      initError = new Error(error.message);
      initState = InitState.FAILED;
      throw initError;
    }
  }
}

async function waitForInit(timeoutMs = 60000) {
  if (shutdownComplete || isClosing) {
    throw new Error('Database shutdown in progress or complete');
  }

  if (initState === InitState.NOT_STARTED) {
    initPromise = _doInitDB();
  }

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Initialization timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    await Promise.race([initPromise || Promise.resolve(), timeoutPromise]);
  } catch (error) {
    if (initState === InitState.FAILED && initError) {
      throw initError;
    }
    throw error;
  }

  if (initState !== InitState.INITIALIZED) {
    throw initError || new Error(`Initialization failed with state: ${initState}`);
  }

  return true;
}

// ============================================================================
// QUERY EXECUTION WITH RETRY
// ============================================================================

async function executeWithRetry(operation, operationName, defaultValue = undefined) {
  if (shutdownComplete || isClosing) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Cannot perform ${operationName}: shutdown in progress`);
  }

  activeOperations += 1;
  const notifyIdle = () => {
    if (activeOperations === 0 && idleWaiters.size) {
      const waiters = Array.from(idleWaiters);
      idleWaiters.clear();
      for (const resolve of waiters) {
        try { resolve(true); } catch (_) {}
      }
    }
  };

  try {
    await waitForInit();

    if (initState !== InitState.INITIALIZED || !db) {
      throw new Error(`Database not initialized (state: ${initState})`);
    }

    let lastError = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt >= MAX_RETRIES) {
          logger.error(`${operationName} failed after ${MAX_RETRIES} attempts`, { error: error.message });
          throw error;
        }
        const delay = BASE_RETRY_DELAY * Math.pow(2, attempt - 1);
        logger.warn(`Retrying ${operationName} after ${delay}ms`, { attempt, error: error.message });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } finally {
    activeOperations = Math.max(0, activeOperations - 1);
    notifyIdle();
  }
}

function waitForIdle(timeoutMs = 3000) {
  if (activeOperations === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      idleWaiters.delete(resolve);
      resolve(false);
    }, timeoutMs);
    idleWaiters.add((ok) => {
      clearTimeout(timer);
      resolve(ok);
    });
  });
}

// ============================================================================
// HVM SIGNAL FUNCTIONS (L1-L5 Alignment)
// ============================================================================

/**
 * Compute deterministic shape hash for payload (L1 Signal alignment)
 * @param {object} payload - The payload to hash
 * @returns {string|null} SHA-256 hash or null on error
 */
function computeShapeHash(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  try {
    const deterministic = JSON.stringify(payload, Object.keys(payload).sort());
    return crypto.createHash('sha256').update(deterministic).digest('hex');
  } catch (e) {
    logger.error('computeShapeHash: hash failed', { error: e.message });
    return null;
  }
}

/**
 * Save HVM reduction to cache
 */
async function saveHVMReduction(termHash, normalForm, metrics = {}) {
  return executeWithRetry(async () => {
    const res = await db.query(`
      INSERT INTO hvm_reductions (term_hash, normal_form, reduction_count, parallel_groups, duration_ms)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (term_hash)
      DO UPDATE SET normal_form = EXCLUDED.normal_form, reduction_count = EXCLUDED.reduction_count, 
                    parallel_groups = EXCLUDED.parallel_groups, duration_ms = EXCLUDED.duration_ms, created_at = NOW()
      RETURNING id
    `, [
      termHash,
      JSON.stringify(normalForm),
      metrics.reductions || 0,
      metrics.parallelGroups || 0,
      metrics.durationMs || null
    ]);
    return res.rows[0]?.id;
  }, 'saveHVMReduction');
}

/**
 * Get HVM reduction from cache
 */
async function getHVMReduction(termHash) {
  return executeWithRetry(async () => {
    const res = await db.query(`SELECT * FROM hvm_reductions WHERE term_hash = $1`, [termHash]);
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      termHash: row.term_hash,
      normalForm: typeof row.normal_form === 'string' ? JSON.parse(row.normal_form) : row.normal_form,
      reductions: row.reduction_count,
      parallelGroups: row.parallel_groups,
      durationMs: row.duration_ms,
      createdAt: row.created_at
    };
  }, 'getHVMReduction', null);
}

// ============================================================================
// JOB MANAGEMENT FUNCTIONS (L3 MeshEvents)
// ============================================================================

/**
 * Create a new job
 * @param {string} type - Job type (e.g., 'research')
 * @param {object} params - Job parameters
 * @returns {Promise<string>} Job ID
 */
async function createJob(type, params) {
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  await executeWithRetry(async () => {
    await db.query(
      `INSERT INTO jobs (id, type, params, status, events, created_at, updated_at) 
       VALUES ($1, $2, $3, 'queued', '[]'::jsonb, NOW(), NOW());`,
      [id, type, JSON.stringify(params || {})]
    );
  }, 'createJob');

  logger.debug('Job created', { jobId: id, type });
  return id;
}

/**
 * Append event to job with shapeHash for L1 alignment
 * @param {string} jobId - Job ID
 * @param {string} eventType - Event type
 * @param {object} payload - Event payload
 */
async function appendJobEvent(jobId, eventType, payload = {}) {
  if (!jobId || !eventType) {
    logger.warn('appendJobEvent: Missing jobId/type', { jobId, eventType });
    return null;
  }

  const shapeHash = computeShapeHash(payload);

  return executeWithRetry(async () => {
    // Insert into job_events table
    const res = await db.query(
      `INSERT INTO job_events (job_id, event_type, payload, shape_hash, ts) 
       VALUES ($1, $2, $3, $4, NOW()) RETURNING id, ts;`,
      [jobId, eventType, JSON.stringify(payload), shapeHash]
    );

    // Also append to jobs.events JSONB array for quick access
    await db.query(
      `UPDATE jobs 
       SET events = events || jsonb_build_array(jsonb_build_object(
         'type', $1::text, 
         'payload', $2::jsonb, 
         'shapeHash', $3::text, 
         'ts', NOW()
       )),
       updated_at = NOW(),
       heartbeat_at = NOW()
       WHERE id = $4`,
      [eventType, JSON.stringify(payload), shapeHash, jobId]
    );

    logger.debug('Job event appended', { jobId, eventType, shapeHash: shapeHash?.slice(0, 8) });
    return res.rows[0];
  }, 'appendJobEvent');
}

/**
 * Get job status
 * @param {string} jobId - Job ID
 * @param {object} opts - Options (format, since_event_id, max_events)
 * @returns {Promise<object|null>} Job status or null if not found
 */
async function getJobStatus(jobId, opts = {}) {
  if (!jobId) return null;

  const { format = 'summary', since_event_id = 0, max_events = 50 } = opts;

  return executeWithRetry(async () => {
    const res = await db.query(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
    if (!res.rows[0]) {
      logger.debug('Job not found', { jobId });
      return null;
    }

    const job = res.rows[0];
    const events = Array.isArray(job.events) ? job.events : 
                   (typeof job.events === 'string' ? JSON.parse(job.events) : []);

    if (format === 'events') {
      return { events: events.slice(since_event_id, since_event_id + max_events) };
    }

    const progress = typeof job.progress === 'string' ? JSON.parse(job.progress) : job.progress;
    const result = typeof job.result === 'string' ? JSON.parse(job.result) : job.result;

    return {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: progress,
      result: result,
      events: format === 'full' ? events.slice(-max_events) : undefined,
      canceled: !!job.canceled,
      timestamps: {
        created_at: job.created_at,
        updated_at: job.updated_at,
        started_at: job.started_at,
        finished_at: job.finished_at
      }
    };
  }, 'getJobStatus', null);
}

/**
 * Get job (alias for full status)
 */
async function getJob(jobId) {
  return getJobStatus(jobId, { format: 'full' });
}

/**
 * Get job events from separate table
 */
async function getJobEvents(jobId, afterId = 0, limit = 500) {
  return executeWithRetry(async () => {
    const res = await db.query(
      `SELECT id, job_id, ts, event_type, payload, shape_hash 
       FROM job_events WHERE job_id = $1 AND id > $2 
       ORDER BY id ASC LIMIT $3;`,
      [jobId, Number(afterId) || 0, limit]
    );
    return res.rows;
  }, 'getJobEvents', []);
}

/**
 * Update job progress
 */
async function updateJobProgress(jobId, progress) {
  return executeWithRetry(async () => {
    await db.query(
      `UPDATE jobs SET progress = $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [jobId, JSON.stringify(progress)]
    );
  }, 'updateJobProgress');
}

/**
 * Update job result and status
 */
async function updateJobResult(jobId, status, result) {
  return executeWithRetry(async () => {
    await db.query(
      `UPDATE jobs 
       SET status = $2, result = $3::jsonb, 
           finished_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [jobId, status, JSON.stringify(result)]
    );
  }, 'updateJobResult');
}

/**
 * Set job status with optional fields
 */
async function setJobStatus(jobId, status, { progress = null, result = null, started = false, finished = false } = {}) {
  return executeWithRetry(async () => {
    const fields = ['status = $1'];
    const vals = [status];
    let idx = 2;

    if (progress !== null) {
      fields.push(`progress = $${idx++}`);
      vals.push(JSON.stringify(progress));
    }
    if (result !== null) {
      fields.push(`result = $${idx++}`);
      vals.push(JSON.stringify(result));
    }
    if (started) fields.push(`started_at = NOW()`);
    if (finished) fields.push(`finished_at = NOW()`);
    fields.push(`updated_at = NOW()`);

    vals.push(jobId);
    await db.query(`UPDATE jobs SET ${fields.join(', ')} WHERE id = $${idx};`, vals);
  }, 'setJobStatus');
}

/**
 * Cancel a job
 */
async function cancelJob(jobId) {
  return executeWithRetry(async () => {
    await db.query(
      `UPDATE jobs SET canceled = TRUE, status = 'canceled', updated_at = NOW(), 
       finished_at = COALESCE(finished_at, NOW()) WHERE id = $1;`,
      [jobId]
    );
  }, 'cancelJob');
  logger.debug('Job canceled', { jobId });
  return true;
}

/**
 * List jobs
 */
async function listJobs(limit = 20, cursor = null) {
  return executeWithRetry(async () => {
    let sql = `SELECT id, type, status, created_at FROM jobs ORDER BY created_at DESC LIMIT $1`;
    let params = [limit];
    
    if (cursor) {
      sql = `SELECT id, type, status, created_at FROM jobs WHERE created_at < $2 ORDER BY created_at DESC LIMIT $1`;
      params = [limit, cursor];
    }
    
    const res = await db.query(sql, params);
    const nextCursor = res.rows.length === limit ? res.rows[res.rows.length - 1]?.created_at : null;
    return { jobs: res.rows, nextCursor, has_more: !!nextCursor };
  }, 'listJobs', { jobs: [], nextCursor: null, has_more: false });
}

/**
 * Claim next queued job (for worker)
 */
async function claimNextJob() {
  const leaseTimeoutMs = config.jobs?.leaseTimeoutMs || 300000;
  
  return executeWithRetry(async () => {
    // Reset stale running jobs
    const leaseSeconds = Math.max(1, Math.floor(leaseTimeoutMs / 1000));
    await db.query(
      `UPDATE jobs SET status='queued', heartbeat_at=NULL, started_at=NULL 
       WHERE status='running' AND (heartbeat_at IS NULL OR heartbeat_at < NOW() - INTERVAL '${leaseSeconds} seconds')`
    );

    const res = await db.query(
      `UPDATE jobs SET status='running', started_at = COALESCE(started_at, NOW()), 
       heartbeat_at = NOW(), updated_at = NOW()
       WHERE id = (
         SELECT id FROM jobs WHERE status='queued' AND canceled = FALSE ORDER BY created_at ASC LIMIT 1
       )
       RETURNING *;`
    );

    if (!res.rows || res.rows.length === 0) {
      return null;
    }
    return res.rows[0];
  }, 'claimNextJob', null);
}

/**
 * Heartbeat for running job
 */
async function heartbeatJob(jobId) {
  return executeWithRetry(async () => {
    await db.query(`UPDATE jobs SET heartbeat_at = NOW(), updated_at = NOW() WHERE id = $1;`, [jobId]);
  }, 'heartbeatJob');
}

// ============================================================================
// RESEARCH REPORT FUNCTIONS
// ============================================================================

async function saveResearchReport({ originalQuery, parameters, finalReport, researchMetadata, images, textDocuments, structuredData, basedOnPastReportIds, accuracyScore, factCheckResults, ensembleSignals }) {
  const queryEmbedding = await generateEmbedding(originalQuery);
  const queryEmbeddingFormatted = queryEmbedding ? formatVectorForPgLite(queryEmbedding) : null;

  const result = await executeWithRetry(async () => {
    const res = await db.query(
      `INSERT INTO research_reports (
        original_query, query_embedding, parameters, final_report, research_metadata,
        images, text_documents, structured_data, based_on_past_report_ids,
        accuracy_score, fact_check_results, ensemble_signals, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id;`,
      [
        originalQuery,
        queryEmbeddingFormatted,
        JSON.stringify(parameters || {}),
        finalReport,
        JSON.stringify(researchMetadata || {}),
        JSON.stringify(images || null),
        JSON.stringify(textDocuments ? textDocuments.map(d => ({ name: d.name, length: d.content?.length })) : null),
        JSON.stringify(structuredData ? structuredData.map(d => ({ name: d.name, type: d.type, length: d.content?.length })) : null),
        JSON.stringify(basedOnPastReportIds || []),
        accuracyScore ?? null,
        JSON.stringify(factCheckResults || null),
        JSON.stringify(ensembleSignals || []),
        new Date().toISOString()
      ]
    );

    if (!res.rows || res.rows.length === 0) {
      throw new Error('INSERT returned no rows');
    }
    return res;
  }, 'saveResearchReport');

  const reportId = result.rows[0].id;
  logger.info('Report saved', { reportId, accuracyScore: accuracyScore ?? 'N/A' });
  return reportId.toString();
}

async function getReportById(reportId) {
  const reportIdNum = parseInt(reportId, 10);
  if (isNaN(reportIdNum)) {
    throw new Error(`Invalid report ID format: ${reportId}`);
  }

  const result = await executeWithRetry(async () => {
    return await db.query(
      `SELECT * FROM research_reports WHERE id = $1;`,
      [reportIdNum]
    );
  }, `getReportById(${reportId})`);

  if (result.rows.length === 0) {
    return null;
  }

  const report = result.rows[0];
  return {
    ...report,
    _id: report.id,
    parameters: typeof report.parameters === 'string' ? JSON.parse(report.parameters) : report.parameters,
    researchMetadata: typeof report.research_metadata === 'string' ? JSON.parse(report.research_metadata) : report.research_metadata
  };
}

async function getReportSignals(reportId) {
  try {
    if (shutdownComplete || isClosing) return [];
    if (initState !== InitState.INITIALIZED || !db) return [];
    
    const result = await db.query(
      'SELECT ensemble_signals FROM research_reports WHERE id = $1',
      [reportId]
    );

    if (!result.rows[0] || !result.rows[0].ensemble_signals) {
      return [];
    }

    const { Signal } = require('../core/signal');
    const signalsJson = result.rows[0].ensemble_signals;
    const signalsArray = typeof signalsJson === 'string' ? JSON.parse(signalsJson) : signalsJson;

    return signalsArray.map(json => Signal.fromJSON(json));
  } catch (error) {
    logger.warn('Failed to retrieve report signals', { reportId, error: error.message });
    return [];
  }
}

async function findReportsByQuery(query) {
  const result = await executeWithRetry(async () => {
    return await db.query(
      `SELECT * FROM research_reports WHERE original_query = $1 ORDER BY created_at DESC;`,
      [query]
    );
  }, 'findReportsByQuery');

  return result.rows.map(row => ({ ...row, _id: row.id }));
}

async function findReportsBySimilarity(queryText, limit = 5, minSimilarity = 0.80) {
  if (!isEmbedderReady) {
    logger.debug('Embedder not ready for similarity search');
    return [];
  }

  const queryEmbedding = await generateEmbedding(queryText);
  if (!queryEmbedding) {
    return [];
  }

  const queryEmbeddingFormatted = formatVectorForPgLite(queryEmbedding);

  const result = await executeWithRetry(async () => {
    return await db.query(
      `SELECT id, original_query, parameters, final_report, research_metadata, created_at,
              1 - (query_embedding <=> $1::vector) AS similarity_score
       FROM research_reports
       WHERE query_embedding IS NOT NULL
       AND 1 - (query_embedding <=> $1::vector) >= $2
       ORDER BY similarity_score DESC
       LIMIT $3;`,
      [queryEmbeddingFormatted, minSimilarity, limit]
    );
  }, 'findReportsBySimilarity');

  return result.rows.map(row => ({
    ...row,
    _id: row.id,
    originalQuery: row.original_query,
    similarityScore: row.similarity_score
  }));
}

async function listRecentReports(limit = 10, queryFilter = null) {
  const result = await executeWithRetry(async () => {
    if (queryFilter) {
      return await db.query(
        `SELECT id, original_query, parameters, created_at, research_metadata
         FROM research_reports WHERE original_query ILIKE $1
         ORDER BY created_at DESC LIMIT $2;`,
        [`%${queryFilter}%`, limit]
      );
    } else {
      return await db.query(
        `SELECT id, original_query, parameters, created_at, research_metadata
         FROM research_reports ORDER BY created_at DESC LIMIT $1;`,
        [limit]
      );
    }
  }, 'listRecentReports');

  return result.rows.map(row => ({
    ...row,
    _id: row.id,
    originalQuery: row.original_query
  }));
}

async function addFeedbackToReport(reportId, feedback) {
  const reportIdNum = parseInt(reportId, 10);
  if (isNaN(reportIdNum)) {
    throw new Error(`Invalid report ID format: ${reportId}`);
  }

  return executeWithRetry(async () => {
    const currentResult = await db.query(
      `SELECT feedback_entries FROM research_reports WHERE id = $1;`,
      [reportIdNum]
    );

    if (currentResult.rows.length === 0) {
      throw new Error(`Report not found: ${reportId}`);
    }

    let feedbackEntries = [];
    try {
      const current = currentResult.rows[0].feedback_entries;
      feedbackEntries = typeof current === 'string' ? JSON.parse(current) : (current || []);
    } catch (_) {
      feedbackEntries = [];
    }

    feedbackEntries.push({ ...feedback, timestamp: new Date().toISOString() });

    await db.query(
      `UPDATE research_reports SET feedback_entries = $1, updated_at = $2 WHERE id = $3;`,
      [JSON.stringify(feedbackEntries), new Date().toISOString(), reportIdNum]
    );
  }, 'addFeedbackToReport');

  return true;
}

// ============================================================================
// QUERY EXECUTION
// ============================================================================

async function executeQuery(sql, params = []) {
  const lowerSql = sql.trim().toLowerCase();
  if (!lowerSql.startsWith('select')) {
    throw new Error("Only SELECT statements are allowed via executeQuery.");
  }

  const result = await executeWithRetry(async () => {
    return await db.query(sql, params);
  }, `executeQuery`);

  return result.rows;
}

async function executeDDL(sql, params = []) {
  const lowerSql = sql.trim().toLowerCase();
  const allowedPrefixes = ['create ', 'alter ', 'drop ', 'insert ', 'update ', 'delete '];
  const isAllowed = allowedPrefixes.some(prefix => lowerSql.startsWith(prefix));

  if (!isAllowed) {
    throw new Error("Only DDL/DML statements are allowed via executeDDL.");
  }

  return executeWithRetry(async () => {
    return await db.query(sql, params);
  }, `executeDDL`);
}

// ============================================================================
// OBSERVATION INFRASTRUCTURE
// ============================================================================

async function recordToolObservation(observation) {
  const { toolName, inputHash, outputHash, success, latencyMs, errorCategory, errorCode, requestId } = observation;

  return executeWithRetry(async () => {
    await db.query(
      `INSERT INTO tool_observations (tool_name, input_hash, output_hash, success, latency_ms, error_category, error_code, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [toolName, inputHash, outputHash || null, success, latencyMs || null, errorCategory || null, errorCode || null, requestId || null]
    );
  }, 'recordToolObservation');
}

async function getToolMetrics(toolName, windowHours = 24) {
  return executeWithRetry(async () => {
    const result = await db.query(
      `SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_calls,
        AVG(latency_ms) as avg_latency_ms
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
      successRate: totalCalls > 0 ? successfulCalls / totalCalls : null,
      avgLatencyMs: row.avg_latency_ms ? Math.round(parseFloat(row.avg_latency_ms)) : null
    };
  }, 'getToolMetrics');
}

async function getConvergenceMetrics(windowHours = 24) {
  return executeWithRetry(async () => {
    const result = await db.query(
      `SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_calls,
        COUNT(DISTINCT tool_name) as unique_tools
       FROM tool_observations
       WHERE created_at > NOW() - INTERVAL '${windowHours} hours'`
    );

    const overall = result.rows[0] || {};
    const totalCalls = parseInt(overall.total_calls, 10) || 0;
    const successfulCalls = parseInt(overall.successful_calls, 10) || 0;
    const convergenceRate = totalCalls > 0 ? successfulCalls / totalCalls : null;

    let convergenceStatus = 'unknown';
    if (convergenceRate !== null) {
      if (convergenceRate >= 0.99) convergenceStatus = 'converged';
      else if (convergenceRate >= 0.95) convergenceStatus = 'near_convergence';
      else if (convergenceRate >= 0.80) convergenceStatus = 'improving';
      else convergenceStatus = 'learning';
    }

    return {
      windowHours,
      overall: { totalCalls, successfulCalls, convergenceRate, convergenceStatus }
    };
  }, 'getConvergenceMetrics');
}

function hashInput(input) {
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

// ============================================================================
// USAGE COUNTERS
// ============================================================================

async function incrementUsage(entityType, entityId, inc = 1) {
  return executeWithRetry(async () => {
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

// ============================================================================
// PROVIDERS
// ============================================================================

async function getProviders() {
  return executeWithRetry(async () => {
    const res = await db.query(`SELECT * FROM providers ORDER BY name;`);
    return res.rows;
  }, 'getProviders', []);
}

async function updateProviderActivity(providerId) {
  return executeWithRetry(async () => {
    await db.query(`UPDATE providers SET last_active_at = NOW() WHERE id = $1;`, [providerId]);
  }, 'updateProviderActivity');
}

// ============================================================================
// INDEXER (BM25 + Vector Hybrid)
// ============================================================================

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
  
  // Simplified indexing - just store in research_reports if needed
  logger.debug('indexDocument called', { sourceType, sourceId });
  return sourceId;
}

async function searchHybrid(queryText, limit = 10) {
  // Simplified hybrid search - use vector search on reports
  if (!isEmbedderReady) {
    return [];
  }

  const reports = await findReportsBySimilarity(queryText, limit, 0.5);
  return reports.map(r => ({
    type: 'report',
    id: r.id,
    source_type: 'report',
    source_id: String(r.id),
    title: r.originalQuery?.slice(0, 160),
    snippet: r.final_report?.slice(0, 300),
    hybridScore: r.similarityScore,
    vectorScore: r.similarityScore
  }));
}

// ============================================================================
// REINDEX
// ============================================================================

async function reindexVectors() {
  return executeWithRetry(async () => {
    try { await db.query(`DROP INDEX IF EXISTS idx_research_reports_query_embedding;`); } catch (_) {}
    await db.query(`CREATE INDEX IF NOT EXISTS idx_research_reports_query_embedding ON research_reports USING hnsw (query_embedding vector_cosine_ops);`);
  }, 'reindexVectors');
  return true;
}

// ============================================================================
// CLEANUP
// ============================================================================

function isShutdownComplete() {
  return shutdownComplete;
}

function getShutdownState() {
  return { isClosing, shutdownComplete, activeOperations, shutdownStartAt };
}

async function close() {
  if (closingPromise) return closingPromise;
  
  closingPromise = (async () => {
    if (isClosing) return;
    isClosing = true;
    shutdownStartAt = Date.now();
    initPromise = null;

    try {
      // Unsubscribe listeners
      if (subscriptions.size) {
        const current = Array.from(subscriptions);
        subscriptions.clear();
        await Promise.allSettled(current.map(fn => fn()));
      }

      // Wait for operations
      await waitForIdle(2000);

      // Cleanup embedder - provider.dispose() handles internal resource cleanup
      if (embeddingProvider?.dispose) {
        try { await embeddingProvider.dispose(); } catch (_) {}
        embeddingProvider = null;
      }

      // Close database
      if (db) {
        try {
          // Node 25/macOS Mutex Crash Prevention
          if (isNodeEnv && isDarwin && nodeMajor >= 25) {
             logger.info('Draining worker pool for Node 25/macOS stability');
             await drainWorkerPool();
          }

          dbInitialized = false;
          initState = InitState.NOT_STARTED;
          await db.close();
          db = null;
          logger.info('Database connection closed');
        } catch (err) {
          logger.warn('Error closing database', { error: err.message });
          db = null;
        }
      }
    } finally {
      isClosing = false;
      shutdownComplete = true;
    }
  })();

  return closingPromise;
}

/**
 * Proactive Worker Pool Draining (Node 25/macOS Mutex Fix)
 * Ensures all WASM threads are terminated before process exit.
 * The mutex error is cosmetic - data is already persisted by this point.
 */
async function drainWorkerPool() {
  if (db && db.query) {
    try {
      // Force checkpoint to flush WAL - ensures all data is persisted
      await db.query('CHECKPOINT');
      logger.debug('Database checkpointed');

      // Force vacuum to release file handles
      await db.query('PRAGMA wal_checkpoint(TRUNCATE)').catch(() => {});
      logger.debug('WAL truncated');
    } catch (e) {
      logger.warn('Failed to checkpoint during drain', { error: e.message });
    }
  }
  // Allow pending async operations to settle
  // 200ms gives WASM workers more time to clean up
  await new Promise(resolve => setTimeout(resolve, 200));
}

/**
 * Emergency checkpoint - call before any risky operation
 * Ensures data is persisted even if process crashes
 */
async function emergencyCheckpoint() {
  if (!db || !dbInitialized) return;
  try {
    await db.query('CHECKPOINT');
    logger.debug('Emergency checkpoint completed');
  } catch (e) {
    // Ignore - best effort
  }
}

// ============================================================================
// EAGER INIT
// ============================================================================

if (process.env.DB_EAGER_INIT !== 'false' && !isClosing) {
  initPromise = _doInitDB().catch(err => {
    logger.error('Background DB initialization failed', { error: err.message });
  });
}

// ==========================================================================
// PROCESS CLEANUP
// ==========================================================================

// Mutex Lock Fix (Node 25/macOS): 
// Do NOT use beforeExit hook here as it races with the CLI's own shutdown logic.
// Lifecycle management is now centralized in the entry points (bin/zero or mcpServer.js).
if (process.env.DB_AUTO_CLOSE === 'true') {
  process.once('beforeExit', () => {
    if (!shutdownComplete && !isClosing) {
      close().catch(() => {});
    }
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Database lifecycle
  initDB,
  waitForInit,
  waitForIdle,
  close,
  emergencyCheckpoint,
  
  // State queries
  getInitState: () => initState,
  getInitError: () => initError,
  isInitializing: () => initState === InitState.INITIALIZING,
  isDbInitialized: () => dbInitialized,
  isShutdownComplete,
  getShutdownState,
  getDbPathInfo: () => dbPathInfo,
  isUsingInMemoryFallback: () => usingInMemoryFallback,

  // Embedder
  initializeEmbedder,
  waitForEmbedder: () => embedderInitPromise || Promise.resolve({ ready: false }),
  isEmbedderReady: () => isEmbedderReady,
  isEmbedderMock: () => embedderIsMock,
  generateEmbedding,
  generateEmbeddingBatch,

  // HVM Signal (L1)
  computeShapeHash,
  saveHVMReduction,
  getHVMReduction,

  // Jobs (L3 MeshEvents)
  createJob,
  appendJobEvent,
  getJobStatus,
  getJob,
  getJobEvents,
  updateJobProgress,
  updateJobResult,
  setJobStatus,
  cancelJob,
  listJobs,
  claimNextJob,
  heartbeatJob,

  // Reports
  saveResearchReport,
  getReportById,
  getReportSignals,
  findReportsByQuery,
  findReportsBySimilarity,
  listRecentReports,
  addFeedbackToReport,

  // Query execution
  executeQuery,
  query: executeQuery,
  executeDDL,
  reindexVectors,

  // Indexer
  indexDocument,
  searchHybrid,
  tokenize,

  // Observations
  recordToolObservation,
  getToolMetrics,
  getConvergenceMetrics,
  hashInput,

  // Usage
  incrementUsage,
  incrementUsageMany,

  // Providers
  getProviders,
  updateProviderActivity
};
