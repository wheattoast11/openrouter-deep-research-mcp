-- Add idempotency columns to jobs table for duplicate detection and caching
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_expires_at TIMESTAMPTZ;

-- Create index for fast idempotency key lookups
CREATE INDEX IF NOT EXISTS idx_jobs_idempotency_key ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Create index for cleanup of expired idempotency keys
CREATE INDEX IF NOT EXISTS idx_jobs_idempotency_expires ON jobs(idempotency_expires_at) WHERE idempotency_expires_at IS NOT NULL;
