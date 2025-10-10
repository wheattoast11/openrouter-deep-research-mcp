// src/utils/vectorDimensionMigration.js
// Migration script to handle vector dimension changes

const config = require('../../config');

/**
 * Check if vector dimension migration is needed
 * @param {Object} db - PGlite database instance
 * @returns {Promise<Object>} Migration status and required dimension
 */
async function checkVectorDimensionMigration(db) {
  try {
    // Query current vector column dimensions
    const reportsDim = await db.query(`
      SELECT atttypmod
      FROM pg_attribute
      WHERE attrelid = 'reports'::regclass
      AND attname = 'query_embedding'
      AND atttypid = 'vector'::regtype;
    `);

    const docsDim = await db.query(`
      SELECT atttypmod
      FROM pg_attribute
      WHERE attrelid = 'index_documents'::regclass
      AND attname = 'doc_embedding'
      AND atttypid = 'vector'::regtype;
    `);

    const currentReportsDim = reportsDim.rows[0]?.atttypmod;
    const currentDocsDim = docsDim.rows[0]?.atttypmod;
    const targetDim = config.database.vectorDimension;

    const needsMigration = (currentReportsDim && currentReportsDim !== targetDim) ||
                          (currentDocsDim && currentDocsDim !== targetDim);

    return {
      needsMigration,
      currentReportsDim,
      currentDocsDim,
      targetDim,
      reason: needsMigration ? `Dimension mismatch: reports=${currentReportsDim}, docs=${currentDocsDim}, target=${targetDim}` : null
    };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error checking vector dimension:`, error);
    return { needsMigration: false, error: error.message };
  }
}

/**
 * Migrate vector dimensions
 * @param {Object} db - PGlite database instance
 * @param {Object} status - Migration status from checkVectorDimensionMigration
 */
async function migrateVectorDimension(db, status) {
  if (!status.needsMigration) {
    process.stderr.write(`[${new Date().toISOString()}] No vector dimension migration needed\n`);
    return { success: true, skipped: true };
  }

  const targetDim = status.targetDim;

  try {
    process.stderr.write(`[${new Date().toISOString()}] Starting vector dimension migration to ${targetDim}D...\n`);

    // Begin transaction
    await db.query('BEGIN;');

    // Drop existing indexes
    await db.query('DROP INDEX IF EXISTS idx_reports_query_embedding;');
    await db.query('DROP INDEX IF EXISTS idx_index_documents_embedding;');
    await db.query('DROP INDEX IF EXISTS idx_graph_nodes_embedding;');

    // Alter column dimensions for reports
    await db.query(`
      ALTER TABLE reports
      ALTER COLUMN query_embedding TYPE vector(${targetDim})
      USING NULL;
    `);

    // Alter column dimensions for index_documents
    await db.query(`
      ALTER TABLE index_documents
      ALTER COLUMN doc_embedding TYPE vector(${targetDim})
      USING NULL;
    `);

    // Alter column dimensions for graph_nodes
    await db.query(`
      ALTER TABLE graph_nodes
      ALTER COLUMN embedding TYPE vector(${targetDim})
      USING NULL;
    `);

    // Recreate HNSW indexes
    await db.query(`
      CREATE INDEX idx_reports_query_embedding
      ON reports USING hnsw (query_embedding vector_cosine_ops);
    `);

    await db.query(`
      CREATE INDEX idx_index_documents_embedding
      ON index_documents USING hnsw (doc_embedding vector_cosine_ops);
    `);
    
    await db.query(`
      CREATE INDEX idx_graph_nodes_embedding
      ON graph_nodes USING hnsw (embedding vector_cosine_ops);
    `);

    // Commit transaction
    await db.query('COMMIT;');

    process.stderr.write(`[${new Date().toISOString()}] ✓ Vector dimension migration complete. All embeddings cleared and will be regenerated.\n`);

    return { success: true, dimension: targetDim };
  } catch (error) {
    // Rollback on error
    try {
      await db.query('ROLLBACK;');
    } catch (_) {}

    console.error(`[${new Date().toISOString()}] Failed to migrate vector dimensions:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Auto-run migration on DB init if needed
 * @param {Object} db - PGlite database instance
 */
async function autoMigrateIfNeeded(db) {
  const status = await checkVectorDimensionMigration(db);
  
  if (status.needsMigration) {
    process.stderr.write(`[${new Date().toISOString()}] ⚠️  Vector dimension mismatch detected\n`);
    const result = await migrateVectorDimension(db, status);
    
    if (result.success) {
      process.stderr.write(`[${new Date().toISOString()}] ℹ️  Note: Existing embeddings were cleared. Reports will be re-embedded on next access.\n`);
    } else {
      console.error(`[${new Date().toISOString()}] ❌ Migration failed:`, result.error);
    }
    
    return result;
  }

  return { success: true, skipped: true };
}

module.exports = {
  checkVectorDimensionMigration,
  migrateVectorDimension,
  autoMigrateIfNeeded
};

