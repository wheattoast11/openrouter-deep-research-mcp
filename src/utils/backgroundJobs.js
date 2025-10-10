// src/utils/backgroundJobs.js
// Background maintenance jobs for database health, embeddings, and monitoring

const config = require('../../config');
const dbClient = require('./dbClient');
const embeddingsAdapter = require('./embeddingsAdapter');
const graphAdapter = require('./graphAdapter');

let jobsRunning = false;
let intervals = [];

/**
 * Embedder health check - verifies embeddings provider is responsive
 */
async function embedderHealthCheck() {
  try {
    const status = embeddingsAdapter.getEmbedderStatus();
    
    if (!status.ready) {
      process.stderr.write(`[${new Date().toISOString()}] ⚠️  Embedder health: NOT READY\n`);
      // Attempt reinitialization
      await embeddingsAdapter.initializeEmbeddings();
      return { healthy: false, reinitAttempted: true };
    }

    // Test embedding generation
    const testEmb = await embeddingsAdapter.generateEmbedding('health check');
    if (!testEmb || testEmb.length === 0) {
      process.stderr.write(`[${new Date().toISOString()}] ⚠️  Embedder health: DEGRADED (empty embeddings)\n`);
      return { healthy: false, reason: 'empty_embeddings' };
    }

    return { healthy: true, provider: status.provider, dimension: status.dimension };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Embedder health check failed:`, error.message);
    return { healthy: false, error: error.message };
  }
}

/**
 * Database vacuum and analyze for performance
 */
async function databaseMaintenance() {
  try {
    // Check if db is available
    const db = dbClient.getDb ? dbClient.getDb() : null;
    if (!db) {
      return { skipped: true, reason: 'db_not_available' };
    }

    const startTime = Date.now();
    
    // Vacuum main tables
    await db.query('VACUUM ANALYZE reports;');
    await db.query('VACUUM ANALYZE index_documents;');
    await db.query('VACUUM ANALYZE index_postings;');
    
    const duration = Date.now() - startTime;
    process.stderr.write(`[${new Date().toISOString()}] ✓ Database maintenance complete (${duration}ms)\n`);
    
    return { success: true, duration };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Database maintenance failed:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Reindex vectors if embedder version changed
 */
async function checkAndReindexVectors() {
  try {
    const status = embeddingsAdapter.getEmbedderStatus();
    
    if (!status.ready) {
      return { skipped: true, reason: 'embedder_not_ready' };
    }

    // Check if dimension matches config
    if (status.dimension !== config.database.vectorDimension) {
      process.stderr.write(`[${new Date().toISOString()}] ⚠️  Vector dimension mismatch: ${status.dimension} vs ${config.database.vectorDimension}\n`);
      
      // Trigger auto-migration
      const db = dbClient.getDb ? dbClient.getDb() : null;
      if (!db) {
        return { skipped: true, reason: 'db_not_available' };
      }
      
      const vectorMigration = require('./vectorDimensionMigration');
      const migStatus = await vectorMigration.autoMigrateIfNeeded(db);
      
      return { reindexed: true, migration: migStatus };
    }

    return { skipped: true, reason: 'no_change_needed' };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Vector reindex check failed:`, error.message);
    return { error: error.message };
  }
}

/**
 * Clean up stale job leases
 */
async function cleanupStaleJobs() {
  try {
    const db = dbClient.getDb ? dbClient.getDb() : null;
    if (!db) {
      return { skipped: true, reason: 'db_not_available' };
    }

    const leaseTimeout = config.jobs?.leaseTimeoutMs || 60000;
    const staleThreshold = new Date(Date.now() - leaseTimeout);

    const result = await db.query(`
      UPDATE jobs
      SET status = 'failed',
          heartbeat_at = NOW(),
          error = 'Job lease expired'
      WHERE status = 'processing'
        AND heartbeat_at < $1
      RETURNING id;
    `, [staleThreshold]);

    if (result.rows.length > 0) {
      process.stderr.write(`[${new Date().toISOString()}] ✓ Cleaned up ${result.rows.length} stale jobs\n`);
    }

    return { cleaned: result.rows.length };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Stale job cleanup failed:`, error.message);
    return { error: error.message };
  }
}

/**
 * Clean up expired idempotency keys
 */
async function cleanupExpiredIdempotencyKeys() {
  try {
    if (!config.idempotency?.enabled) {
      return { skipped: true, reason: 'idempotency_disabled' };
    }

    const db = dbClient.getDb ? dbClient.getDb() : null;
    if (!db) {
      return { skipped: true, reason: 'db_not_available' };
    }

    const result = await db.query(`
      DELETE FROM idempotency_keys
      WHERE expires_at < NOW()
      RETURNING idempotency_key;
    `);

    if (result.rows.length > 0) {
      process.stderr.write(`[${new Date().toISOString()}] ✓ Cleaned up ${result.rows.length} expired idempotency keys\n`);
    }

    return { cleaned: result.rows.length };
  } catch (error) {
    // Table might not exist if idempotency is not fully initialized
    return { error: error.message, skipped: true };
  }
}

/**
 * Update model catalog from OpenRouter
 */
async function refreshModelCatalog() {
  try {
    if (!config.models?.useDynamicCatalog) {
      return { skipped: true, reason: 'dynamic_catalog_disabled' };
    }

    const modelCatalog = require('./modelCatalog');
    const result = await modelCatalog.refreshCatalog();

    return { success: true, modelCount: result?.models?.length || 0 };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Model catalog refresh failed:`, error.message);
    return { error: error.message };
  }
}

/**
 * Collect and log minimal telemetry (privacy-safe)
 */
async function collectTelemetry() {
  try {
    const db = dbClient.getDb ? dbClient.getDb() : null;
    if (!db) {
      return { skipped: true };
    }

    const stats = {
      timestamp: new Date().toISOString(),
      reports: { total: 0 },
      jobs: { pending: 0, processing: 0, completed: 0, failed: 0 },
      embedder: embeddingsAdapter.getEmbedderStatus(),
      graph: graphAdapter.getGraphStatus()
    };

    // Count reports
    const reportsCount = await db.query('SELECT COUNT(*) as count FROM reports;');
    stats.reports.total = parseInt(reportsCount.rows[0]?.count || 0);

    // Count jobs by status
    try {
      const jobsCount = await db.query(`
        SELECT status, COUNT(*) as count
        FROM jobs
        GROUP BY status;
      `);
      
      for (const row of jobsCount.rows) {
        stats.jobs[row.status] = parseInt(row.count);
      }
    } catch (_) {
      // Jobs table might not exist
    }

    // Only log if there's activity
    const totalActivity = stats.reports.total + stats.jobs.completed;
    if (totalActivity > 0) {
      process.stderr.write(`[${new Date().toISOString()}] 📊 Telemetry: ${stats.reports.total} reports, ${stats.jobs.completed} jobs completed\n`);
    }

    return stats;
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Start all background jobs
 */
function startBackgroundJobs() {
  if (jobsRunning) {
    process.stderr.write(`[${new Date().toISOString()}] Background jobs already running\n`);
    return;
  }

  jobsRunning = true;
  process.stderr.write(`[${new Date().toISOString()}] ✓ Starting background maintenance jobs\n`);

  // Embedder health check - every 5 minutes
  intervals.push(setInterval(async () => {
    await embedderHealthCheck();
  }, 5 * 60 * 1000));

  // Database maintenance - every 30 minutes
  intervals.push(setInterval(async () => {
    await databaseMaintenance();
  }, 30 * 60 * 1000));

  // Stale job cleanup - every 2 minutes
  intervals.push(setInterval(async () => {
    await cleanupStaleJobs();
  }, 2 * 60 * 1000));

  // Idempotency key cleanup - every 10 minutes
  intervals.push(setInterval(async () => {
    await cleanupExpiredIdempotencyKeys();
  }, 10 * 60 * 1000));

  // Model catalog refresh - every 6 hours
  intervals.push(setInterval(async () => {
    await refreshModelCatalog();
  }, 6 * 60 * 60 * 1000));

  // Telemetry collection - every 15 minutes
  intervals.push(setInterval(async () => {
    await collectTelemetry();
  }, 15 * 60 * 1000));

  // Run initial checks after 30 seconds
  setTimeout(async () => {
    await embedderHealthCheck();
    await checkAndReindexVectors();
    await collectTelemetry();
  }, 30 * 1000);
}

/**
 * Stop all background jobs
 */
function stopBackgroundJobs() {
  if (!jobsRunning) {
    return;
  }

  process.stderr.write(`[${new Date().toISOString()}] Stopping background jobs\n`);
  
  for (const interval of intervals) {
    clearInterval(interval);
  }
  
  intervals = [];
  jobsRunning = false;
}

/**
 * Get status of background jobs
 */
function getBackgroundJobsStatus() {
  return {
    running: jobsRunning,
    activeJobs: intervals.length
  };
}

module.exports = {
  startBackgroundJobs,
  stopBackgroundJobs,
  getBackgroundJobsStatus,
  // Export individual functions for manual execution
  embedderHealthCheck,
  databaseMaintenance,
  checkAndReindexVectors,
  cleanupStaleJobs,
  cleanupExpiredIdempotencyKeys,
  refreshModelCatalog,
  collectTelemetry
};

