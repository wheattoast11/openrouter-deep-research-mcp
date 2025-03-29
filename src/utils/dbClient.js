// src/utils/dbClient.js
const { PGlite } = require('@electric-sql/pglite');
const { vector } = require('@electric-sql/pglite/vector');
const config = require('../../config');
const path = require('path');

// Detect environment
const isNodeEnv = typeof process !== 'undefined' && process.versions && process.versions.node;
const isBrowserEnv = typeof window !== 'undefined';

// Variables to hold dynamically imported functions
let pipeline;
let cos_sim;
let fs;

// If we're in Node.js, require fs module
if (isNodeEnv) {
  fs = require('fs');
}

let db = null;
let isEmbedderReady = false;
let embedder = null; // Variable to hold the embedding pipeline
let dbInitialized = false; // Track DB initialization status
let dbInitAttempted = false; // Track if we've already attempted to initialize
let usingInMemoryFallback = false; // Track if we're using in-memory fallback

// Get retry configuration from config
const MAX_RETRIES = config.database.maxRetryAttempts;
// Base delay for exponential backoff (in ms)
const BASE_RETRY_DELAY = config.database.retryDelayBaseMs;

// Async IIFE to load the ES Module and initialize embedder
(async () => {
  try {
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
    cos_sim = transformers.cos_sim;
    console.log(`[${new Date().toISOString()}] Successfully imported @xenova/transformers.`);
    // Now initialize the embedder since the pipeline function is available
    await initializeEmbedder();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to dynamically import @xenova/transformers:`, err);
    // pipeline and cos_sim will remain undefined
  }
})();

// Function to calculate cosine similarity (using library function)
function calculateCosineSimilarity(vecA, vecB) {
  if (!cos_sim) { // Check if import succeeded
    console.error(`[${new Date().toISOString()}] cos_sim function not available due to import error.`);
    return 0;
  }
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  try {
    return cos_sim(vecA, vecB);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Error calculating cosine similarity:`, e);
    return 0;
  }
}

// Initialize the embedding pipeline asynchronously
async function initializeEmbedder() {
  if (!pipeline) { // Check if import succeeded
    console.error(`[${new Date().toISOString()}] Pipeline function not available due to import error. Cannot initialize embedder.`);
    isEmbedderReady = false;
    return;
  }
  try {
    console.log(`[${new Date().toISOString()}] Initializing embedding model Xenova/all-MiniLM-L6-v2...`);
    // Use a small, efficient model suitable for running locally
    // This model generates 384-dimensional embeddings
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    isEmbedderReady = true;
    console.log(`[${new Date().toISOString()}] Embedding model initialized successfully.`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to initialize embedding model:`, error);
    embedder = null; // Ensure embedder is null on failure
    isEmbedderReady = false;
  }
}

async function generateEmbedding(text) {
  if (!isEmbedderReady || !embedder) {
    console.error(`[${new Date().toISOString()}] Embedder not ready, cannot generate embedding for text: "${text.substring(0, 50)}..."`);
    return null;
  }
  try {
    // Generate embedding, pooling strategy might matter (e.g., mean pooling)
    // The library handles pooling by default for sentence-transformer models
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    // Output data is Float32Array, convert to regular array for storage
    return Array.from(output.data);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error generating embedding for text "${text.substring(0, 50)}...":`, error);
    return null;
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
  // Check for URL override in config
  if (config.database.databaseUrl) {
    console.log(`[${new Date().toISOString()}] Using explicitly configured database URL: ${config.database.databaseUrl}`);
    return config.database.databaseUrl;
  }

  // Generate URL based on environment
  if (isBrowserEnv) {
    // Browser environments should use IndexedDB
    return `idb://research-agent-db`;
  } else if (isNodeEnv) {
    // Node.js can use file-based storage
    const dataDir = path.resolve(config.database.dataDirectory);
    
    // Ensure directory exists if we're in Node
    if (fs) {
      try {
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
          console.log(`[${new Date().toISOString()}] Created PGLite data directory at: ${dataDir}`);
        }
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error creating data directory: ${err.message}`);
        if (config.database.allowInMemoryFallback) {
          console.log(`[${new Date().toISOString()}] Falling back to in-memory database as configured.`);
          return null;
        } else {
          throw new Error(`Could not create data directory and in-memory fallback is disabled: ${err.message}`);
        }
      }
    }
    
    return `file://${dataDir}`;
  }
  
  // Fallback to in-memory if environment can't be determined
  if (config.database.allowInMemoryFallback) {
    console.log(`[${new Date().toISOString()}] Could not determine environment, using in-memory database.`);
    return null;
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
    if (timeSinceLastAttempt < 60000) { // Don't retry more than once per minute
      console.log(`[${new Date().toISOString()}] Skipping DB initialization, last attempt was ${Math.round(timeSinceLastAttempt/1000)}s ago`);
      return false;
    }
  }

  dbInitAttempted = Date.now();
  usingInMemoryFallback = false;

  try {
    // Get database URL based on environment
    const dbUrl = getDatabaseUrl();
    
    // Initialize PGLite with the vector extension
    if (dbUrl) {
      console.log(`[${new Date().toISOString()}] Initializing PGLite with URL: ${dbUrl}`);
      
      // Use modern async creation pattern
      db = await PGlite.create({
        url: dbUrl,
        extensions: { vector },
        // Use configured relaxedDurability setting
        relaxedDurability: config.database.relaxedDurability
      });
    } else {
      // Fallback to in-memory DB if no URL is available
      console.log(`[${new Date().toISOString()}] Initializing PGLite with in-memory database (no persistent storage)`);
      db = await PGlite.create({
        extensions: { vector }
      });
      usingInMemoryFallback = true;
    }

    // Enable the vector extension
    await db.query("CREATE EXTENSION IF NOT EXISTS vector;");
    console.log(`[${new Date().toISOString()}] PGLite vector extension enabled`);

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
    console.log(`[${new Date().toISOString()}] PGLite reports table created or verified`);

    // Create indexes for better performance
    await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_original_query ON reports (original_query);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);`);
    
    // Create vector index for similarity search
    await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_query_embedding ON reports USING hnsw (query_embedding vector_cosine_ops);`);
    console.log(`[${new Date().toISOString()}] PGLite indexes created or verified`);

    dbInitialized = true;
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to initialize PGLite database:`, error);
    // Try in-memory fallback if not already using it
    if (!usingInMemoryFallback) {
      console.log(`[${new Date().toISOString()}] Attempting fallback to in-memory database`);
      try {
        db = await PGlite.create({
          extensions: { vector }
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
        console.log(`[${new Date().toISOString()}] Successfully initialized in-memory database fallback`);
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
          JSON.stringify(textDocuments ? textDocuments.map(d => ({ name: d.name, length: d.content.length })) : null),
          JSON.stringify(structuredData ? structuredData.map(d => ({ name: d.name, type: d.type, length: d.content.length })) : null),
          JSON.stringify(basedOnPastReportIds || []),
          new Date().toISOString()
        ]
      );
      
      const reportId = result.rows[0].id;
      console.log(`[${new Date().toISOString()}] Successfully saved research report to PGLite with ID: ${reportId}`);
      return reportId.toString();
    },
    'saveResearchReport',
    null // fallback value if operation fails
  );
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
      try {
        feedbackEntries = JSON.parse(currentResult.rows[0].feedback_entries || '[]');
        if (!Array.isArray(feedbackEntries)) {
          feedbackEntries = [];
        }
      } catch (parseError) {
        console.error(`[${new Date().toISOString()}] Error parsing feedback entries for report ID ${reportId}:`, parseError);
        feedbackEntries = [];
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

      console.log(`[${new Date().toISOString()}] Successfully added feedback to report ID: ${reportId}`);
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

  return executeWithRetry(
    async () => {
      // Format the query embedding for pgvector
      const queryEmbeddingFormatted = formatVectorForPgLite(queryEmbedding);
      
      // Use pgvector's cosine distance operator (<=> means cosine distance)
      // 1 - cosine_distance = cosine_similarity
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
        [queryEmbeddingFormatted, minSimilarity, limit]
      );

      const reports = result.rows.map(row => ({
        ...row,
        _id: row.id, // Add _id field for backward compatibility
        originalQuery: row.original_query,
        similarityScore: row.similarity_score,
        // Convert JSONB strings back to objects
        parameters: typeof row.parameters === 'string' ? JSON.parse(row.parameters) : row.parameters,
        researchMetadata: typeof row.research_metadata === 'string' ? JSON.parse(row.research_metadata) : row.research_metadata
      }));

      console.log(`[${new Date().toISOString()}] Found ${reports.length} reports via vector search (minSimilarity: ${minSimilarity}).`);
      return reports;
    },
    'findReportsBySimilarity',
    [] // fallback value if operation fails
  );
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

      console.log(`[${new Date().toISOString()}] Found ${reports.length} reports matching filter "${queryFilter || 'None'}" (limit: ${limit}).`);
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
  listRecentReports
};
