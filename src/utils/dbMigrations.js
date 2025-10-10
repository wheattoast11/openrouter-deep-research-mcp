// src/utils/dbMigrations.js
// Database migration utilities

const fs = require('fs');
const path = require('path');

/**
 * Apply SQL migrations from the sql/migrations directory
 * PGLite requires one statement per query call
 * @param {Object} db - PGLite database instance
 */
async function applySqlMigrations(db) {
  try {
    const migrationsDir = path.resolve(__dirname, '../../sql/migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.error(`[${new Date().toISOString()}] Migrations directory not found, skipping SQL migrations`);
      return;
    }
    
    const files = fs.readdirSync(migrationsDir)
      .filter(name => name.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sqlPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      
      // Split by semicolon and execute each statement separately
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      for (const stmt of statements) {
        try {
          await db.query(stmt);
        } catch (stmtErr) {
          // Ignore "already exists" errors for idempotent migrations
          if (stmtErr.message && (
            stmtErr.message.includes('already exists') ||
            stmtErr.message.includes('duplicate')
          )) {
            continue;
          }
          console.warn(`[${new Date().toISOString()}] Migration statement warning in ${file}:`, stmtErr.message);
        }
      }
    }
    console.error(`[${new Date().toISOString()}] SQL migrations applied successfully (${files.length} file(s))`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error applying SQL migrations:`, err);
    // Non-fatal - allow server to continue
  }
}

/**
 * Apply idempotency schema migrations to jobs table
 * @param {Object} db - PGLite database instance
 */
async function applyIdempotencyMigrations(db) {
  console.error(`[${new Date().toISOString()}] Applying idempotency migrations...`);

  try {
    // Add idempotency_key column (nullable for backward compatibility)
    await db.query(`
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
    `);
    console.error(`[${new Date().toISOString()}] ✓ Added idempotency_key column to jobs table`);

    // Add idempotency_expires_at column
    await db.query(`
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_expires_at TIMESTAMPTZ;
    `);
    console.error(`[${new Date().toISOString()}] ✓ Added idempotency_expires_at column to jobs table`);

    // Create unique index for idempotency key lookup
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency_key
        ON jobs(idempotency_key)
        WHERE idempotency_key IS NOT NULL;
    `);
    console.error(`[${new Date().toISOString()}] ✓ Created unique index on idempotency_key`);

    // Create index for expiration cleanup
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_idempotency_expires
        ON jobs(idempotency_expires_at)
        WHERE idempotency_expires_at IS NOT NULL;
    `);
    console.error(`[${new Date().toISOString()}] ✓ Created index on idempotency_expires_at`);

    // Create composite index for efficient status + expiration queries
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_status_expires
        ON jobs(status, idempotency_expires_at)
        WHERE idempotency_key IS NOT NULL;
    `);
    console.error(`[${new Date().toISOString()}] ✓ Created composite index on status + expiration`);

    console.error(`[${new Date().toISOString()}] Idempotency migrations completed successfully`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error applying idempotency migrations:`, err);
    throw err;
  }
}

/**
 * Rollback idempotency migrations (for testing/debugging)
 * @param {Object} db - PGLite database instance
 */
async function rollbackIdempotencyMigrations(db) {
  console.error(`[${new Date().toISOString()}] Rolling back idempotency migrations...`);

  try {
    await db.query(`DROP INDEX IF EXISTS idx_jobs_status_expires;`);
    await db.query(`DROP INDEX IF EXISTS idx_jobs_idempotency_expires;`);
    await db.query(`DROP INDEX IF EXISTS idx_jobs_idempotency_key;`);
    await db.query(`ALTER TABLE jobs DROP COLUMN IF EXISTS idempotency_expires_at;`);
    await db.query(`ALTER TABLE jobs DROP COLUMN IF EXISTS idempotency_key;`);

    console.error(`[${new Date().toISOString()}] Idempotency migrations rolled back successfully`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error rolling back idempotency migrations:`, err);
    throw err;
  }
}

/**
 * Verify idempotency schema is correctly applied
 * @param {Object} db - PGLite database instance
 * @returns {Promise<boolean>}
 */
async function verifyIdempotencySchema(db) {
  try {
    // Check if columns exist
    const columnCheck = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'jobs'
        AND column_name IN ('idempotency_key', 'idempotency_expires_at')
      ORDER BY column_name;
    `);

    if (columnCheck.rows.length !== 2) {
      console.error(`[${new Date().toISOString()}] Missing idempotency columns. Found: ${columnCheck.rows.map(r => r.column_name).join(', ')}`);
      return false;
    }

    // Check if indexes exist
    const indexCheck = await db.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'jobs'
        AND indexname IN ('idx_jobs_idempotency_key', 'idx_jobs_idempotency_expires', 'idx_jobs_status_expires')
      ORDER BY indexname;
    `);

    if (indexCheck.rows.length !== 3) {
      console.error(`[${new Date().toISOString()}] Missing idempotency indexes. Found: ${indexCheck.rows.map(r => r.indexname).join(', ')}`);
      return false;
    }

    console.error(`[${new Date().toISOString()}] Idempotency schema verified successfully`);
    return true;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error verifying idempotency schema:`, err);
    return false;
  }
}

module.exports = {
  applySqlMigrations,
  applyIdempotencyMigrations,
  rollbackIdempotencyMigrations,
  verifyIdempotencySchema
};
