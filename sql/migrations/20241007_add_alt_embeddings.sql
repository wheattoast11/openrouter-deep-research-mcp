-- Adds alternate embedding storage for dual-run comparisons and fusion

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS query_embedding_alt VECTOR(768);

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS embedding_alt_provider TEXT;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS embedding_alt_model TEXT;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS embedding_alt_dimension INTEGER;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS dual_embedding_metrics JSONB;

CREATE INDEX IF NOT EXISTS idx_reports_query_embedding_alt
  ON reports USING hnsw (query_embedding_alt vector_cosine_ops);

ALTER TABLE index_documents
  ADD COLUMN IF NOT EXISTS doc_embedding_alt VECTOR(768);

ALTER TABLE index_documents
  ADD COLUMN IF NOT EXISTS embedding_alt_provider TEXT;

ALTER TABLE index_documents
  ADD COLUMN IF NOT EXISTS embedding_alt_model TEXT;

ALTER TABLE index_documents
  ADD COLUMN IF NOT EXISTS embedding_alt_dimension INTEGER;

ALTER TABLE index_documents
  ADD COLUMN IF NOT EXISTS dual_embedding_metrics JSONB;

CREATE INDEX IF NOT EXISTS idx_index_documents_embedding_alt
  ON index_documents USING hnsw (doc_embedding_alt vector_cosine_ops);

-- Evaluation table to store per-query comparisons
CREATE TABLE IF NOT EXISTS embedding_eval (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  query TEXT NOT NULL,
  primary_provider TEXT,
  primary_model TEXT,
  secondary_provider TEXT,
  secondary_model TEXT,
  metric JSONB
);

