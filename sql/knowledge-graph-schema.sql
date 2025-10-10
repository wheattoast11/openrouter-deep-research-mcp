-- =====================================================================
-- KNOWLEDGE GRAPH SCHEMA FOR PGLITE + PGVECTOR
-- =====================================================================
-- Version: 1.0.0
-- Target: PGlite with pgvector extension
-- Embedding Model: Xenova/all-MiniLM-L6-v2 (384 dimensions)
-- Scale: 10k-100k entities initially, 1M+ eventually
-- Graph Traversal: Recursive CTEs (no Apache AGE dependency)
-- =====================================================================

-- Prerequisites: Ensure pgvector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================================
-- 1. ONTOLOGY TABLES (Type System & Validation)
-- =====================================================================

-- Entity type hierarchy with parent-child relationships
CREATE TABLE IF NOT EXISTS entity_types (
  id SERIAL PRIMARY KEY,
  type_name TEXT NOT NULL UNIQUE,
  parent_type_id INTEGER REFERENCES entity_types(id) ON DELETE CASCADE,
  description TEXT,
  properties_schema JSONB, -- JSON Schema for validation
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create index for hierarchical queries
CREATE INDEX IF NOT EXISTS idx_entity_types_parent
  ON entity_types(parent_type_id)
  WHERE parent_type_id IS NOT NULL;

-- Relationship type ontology with inverse relationships
CREATE TABLE IF NOT EXISTS relationship_types (
  id SERIAL PRIMARY KEY,
  type_name TEXT NOT NULL UNIQUE,
  inverse_type_name TEXT, -- e.g., "hasChild" <-> "hasParent"
  source_entity_type TEXT REFERENCES entity_types(type_name) ON DELETE CASCADE,
  target_entity_type TEXT REFERENCES entity_types(type_name) ON DELETE CASCADE,
  description TEXT,
  properties_schema JSONB, -- JSON Schema for edge properties
  is_symmetric BOOLEAN DEFAULT FALSE, -- e.g., "isSiblingOf"
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_relationship_types_source
  ON relationship_types(source_entity_type);
CREATE INDEX IF NOT EXISTS idx_relationship_types_target
  ON relationship_types(target_entity_type);

-- =====================================================================
-- 2. CORE ENTITY TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS entities (
  id BIGSERIAL PRIMARY KEY,

  -- Core identification
  entity_type TEXT NOT NULL REFERENCES entity_types(type_name) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  canonical_name TEXT NOT NULL, -- Normalized lowercase for deduplication

  -- Vector embedding for semantic search
  embedding VECTOR(384),

  -- Graph metrics (computed periodically)
  degree INTEGER DEFAULT 0, -- Total edge count (in + out)
  in_degree INTEGER DEFAULT 0,
  out_degree INTEGER DEFAULT 0,
  pagerank REAL DEFAULT 0.0,
  community_id INTEGER, -- Community detection result

  -- Provenance tracking
  source_type TEXT NOT NULL, -- 'report' | 'url' | 'manual' | 'extracted'
  source_id TEXT NOT NULL, -- Report ID, URL, or custom identifier
  extraction_confidence REAL CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),

  -- Flexible metadata storage
  properties JSONB DEFAULT '{}',

  -- Usage analytics
  usage_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  -- Deduplication constraint
  CONSTRAINT unique_entity_per_type UNIQUE(entity_type, canonical_name)
);

-- Indexes for entity table
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities(canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_source ON entities(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_entities_usage ON entities(usage_count DESC, last_accessed DESC);

-- HNSW vector index with optimal parameters for 384-dim embeddings
-- Parameters chosen based on research:
-- m=24: Higher for 384-dim data (default 16 insufficient for high-dim)
-- ef_construction=100: Better recall than default 64, balanced build time
CREATE INDEX IF NOT EXISTS idx_entities_embedding
  ON entities
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 24, ef_construction = 100);

-- Composite index for graph metrics queries
CREATE INDEX IF NOT EXISTS idx_entities_metrics
  ON entities(pagerank DESC, degree DESC)
  WHERE embedding IS NOT NULL;

-- GIN index for JSONB properties search
CREATE INDEX IF NOT EXISTS idx_entities_properties
  ON entities
  USING gin(properties jsonb_path_ops);

-- =====================================================================
-- 3. RELATIONSHIPS (EDGES) TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS relationships (
  id BIGSERIAL PRIMARY KEY,

  -- Core relationship
  source_id BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_id BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL REFERENCES relationship_types(type_name) ON DELETE RESTRICT,

  -- Edge weights and confidence
  weight REAL DEFAULT 1.0 CHECK (weight >= 0),
  confidence REAL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),

  -- Provenance
  source_evidence TEXT, -- Text snippet supporting this relationship
  extracted_by TEXT, -- Tool/agent that extracted this relationship
  extraction_confidence REAL CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),

  -- Flexible metadata
  properties JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  -- Prevent duplicate relationships
  CONSTRAINT unique_relationship UNIQUE(source_id, target_id, relationship_type)
);

-- Critical indexes for graph traversal
CREATE INDEX IF NOT EXISTS idx_relationships_source
  ON relationships(source_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_target
  ON relationships(target_id, relationship_type);

-- Composite index for weighted graph queries
CREATE INDEX IF NOT EXISTS idx_relationships_weighted
  ON relationships(source_id, weight DESC, confidence DESC);

-- GIN index for relationship properties
CREATE INDEX IF NOT EXISTS idx_relationships_properties
  ON relationships
  USING gin(properties jsonb_path_ops);

-- Index for provenance queries
CREATE INDEX IF NOT EXISTS idx_relationships_extraction
  ON relationships(extracted_by, extraction_confidence DESC);

-- =====================================================================
-- 4. MATERIALIZED VIEWS FOR GRAPH METRICS
-- =====================================================================

-- Entity degree summary (refreshed periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS entity_degree_summary AS
SELECT
  e.id AS entity_id,
  e.entity_type,
  e.name,
  COALESCE(out_counts.cnt, 0) AS out_degree,
  COALESCE(in_counts.cnt, 0) AS in_degree,
  COALESCE(out_counts.cnt, 0) + COALESCE(in_counts.cnt, 0) AS total_degree
FROM entities e
LEFT JOIN (
  SELECT source_id, COUNT(*) AS cnt
  FROM relationships
  GROUP BY source_id
) out_counts ON e.id = out_counts.source_id
LEFT JOIN (
  SELECT target_id, COUNT(*) AS cnt
  FROM relationships
  GROUP BY target_id
) in_counts ON e.id = in_counts.target_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_degree_summary_entity
  ON entity_degree_summary(entity_id);
CREATE INDEX IF NOT EXISTS idx_degree_summary_total
  ON entity_degree_summary(total_degree DESC);

-- Relationship type distribution
CREATE MATERIALIZED VIEW IF NOT EXISTS relationship_type_stats AS
SELECT
  relationship_type,
  COUNT(*) AS count,
  AVG(weight) AS avg_weight,
  AVG(confidence) AS avg_confidence,
  MIN(created_at) AS first_seen,
  MAX(created_at) AS last_seen
FROM relationships
GROUP BY relationship_type
ORDER BY count DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_type_stats
  ON relationship_type_stats(relationship_type);

-- =====================================================================
-- 5. TRIGGERS FOR AUTOMATIC UPDATES
-- =====================================================================

-- Update entity degree counts when relationships change
CREATE OR REPLACE FUNCTION update_entity_degrees()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment source out_degree and target in_degree
    UPDATE entities SET out_degree = out_degree + 1, degree = degree + 1
    WHERE id = NEW.source_id;
    UPDATE entities SET in_degree = in_degree + 1, degree = degree + 1
    WHERE id = NEW.target_id;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement degrees
    UPDATE entities SET out_degree = GREATEST(0, out_degree - 1), degree = GREATEST(0, degree - 1)
    WHERE id = OLD.source_id;
    UPDATE entities SET in_degree = GREATEST(0, in_degree - 1), degree = GREATEST(0, degree - 1)
    WHERE id = OLD.target_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_entity_degrees
AFTER INSERT OR DELETE ON relationships
FOR EACH ROW EXECUTE FUNCTION update_entity_degrees();

-- Update timestamps on entity modification
CREATE OR REPLACE FUNCTION update_entity_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entity_timestamp
BEFORE UPDATE ON entities
FOR EACH ROW EXECUTE FUNCTION update_entity_timestamp();

-- Update timestamps on relationship modification
CREATE OR REPLACE FUNCTION update_relationship_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_relationship_timestamp
BEFORE UPDATE ON relationships
FOR EACH ROW EXECUTE FUNCTION update_relationship_timestamp();

-- =====================================================================
-- 6. HELPER FUNCTIONS FOR GRAPH QUERIES
-- =====================================================================

-- Recursive CTE for finding all descendants
CREATE OR REPLACE FUNCTION get_descendants(entity_id BIGINT, max_depth INTEGER DEFAULT 10)
RETURNS TABLE(
  descendant_id BIGINT,
  path_length INTEGER,
  path BIGINT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE descendants AS (
    -- Base case
    SELECT
      r.target_id AS descendant_id,
      1 AS path_length,
      ARRAY[entity_id, r.target_id] AS path
    FROM relationships r
    WHERE r.source_id = entity_id

    UNION

    -- Recursive case
    SELECT
      r.target_id,
      d.path_length + 1,
      d.path || r.target_id
    FROM relationships r
    JOIN descendants d ON r.source_id = d.descendant_id
    WHERE d.path_length < max_depth
      AND NOT (r.target_id = ANY(d.path)) -- Prevent cycles
  )
  SELECT * FROM descendants;
END;
$$ LANGUAGE plpgsql;

-- Recursive CTE for finding all ancestors
CREATE OR REPLACE FUNCTION get_ancestors(entity_id BIGINT, max_depth INTEGER DEFAULT 10)
RETURNS TABLE(
  ancestor_id BIGINT,
  path_length INTEGER,
  path BIGINT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE ancestors AS (
    -- Base case
    SELECT
      r.source_id AS ancestor_id,
      1 AS path_length,
      ARRAY[entity_id, r.source_id] AS path
    FROM relationships r
    WHERE r.target_id = entity_id

    UNION

    -- Recursive case
    SELECT
      r.source_id,
      a.path_length + 1,
      a.path || r.source_id
    FROM relationships r
    JOIN ancestors a ON r.target_id = a.ancestor_id
    WHERE a.path_length < max_depth
      AND NOT (r.source_id = ANY(a.path)) -- Prevent cycles
  )
  SELECT * FROM ancestors;
END;
$$ LANGUAGE plpgsql;

-- Find shortest path between two entities (BFS via recursive CTE)
CREATE OR REPLACE FUNCTION find_shortest_path(start_id BIGINT, end_id BIGINT, max_depth INTEGER DEFAULT 6)
RETURNS TABLE(
  path BIGINT[],
  path_length INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE paths AS (
    -- Base case
    SELECT
      ARRAY[start_id, r.target_id] AS path,
      1 AS path_length
    FROM relationships r
    WHERE r.source_id = start_id

    UNION

    -- Recursive case
    SELECT
      p.path || r.target_id,
      p.path_length + 1
    FROM relationships r
    JOIN paths p ON r.source_id = p.path[array_length(p.path, 1)]
    WHERE p.path_length < max_depth
      AND NOT (r.target_id = ANY(p.path)) -- Prevent cycles
      AND NOT EXISTS ( -- Stop once we find end_id
        SELECT 1 FROM paths
        WHERE path[array_length(path, 1)] = end_id
      )
  )
  SELECT path, path_length
  FROM paths
  WHERE path[array_length(path, 1)] = end_id
  ORDER BY path_length ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Semantic search for entities by embedding similarity
CREATE OR REPLACE FUNCTION search_entities_by_embedding(
  query_embedding VECTOR(384),
  min_similarity REAL DEFAULT 0.7,
  result_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
  entity_id BIGINT,
  entity_name TEXT,
  entity_type TEXT,
  similarity REAL,
  properties JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.entity_type,
    (1 - (e.embedding <=> query_embedding))::REAL AS similarity,
    e.properties
  FROM entities e
  WHERE e.embedding IS NOT NULL
    AND (1 - (e.embedding <=> query_embedding)) >= min_similarity
  ORDER BY e.embedding <=> query_embedding
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 7. PARTITIONING STRATEGY (For scaling beyond 1M entities)
-- =====================================================================
-- Note: PGlite may have limited partitioning support. This is for future PostgreSQL migration.

-- Partition entities by entity_type (when table grows beyond 1M rows)
-- ALTER TABLE entities RENAME TO entities_unpartitioned;
-- CREATE TABLE entities (LIKE entities_unpartitioned INCLUDING ALL)
--   PARTITION BY LIST (entity_type);
--
-- -- Create partitions for common types
-- CREATE TABLE entities_person PARTITION OF entities FOR VALUES IN ('person', 'user', 'author');
-- CREATE TABLE entities_organization PARTITION OF entities FOR VALUES IN ('organization', 'company');
-- CREATE TABLE entities_location PARTITION OF entities FOR VALUES IN ('location', 'place', 'address');
-- CREATE TABLE entities_default PARTITION OF entities DEFAULT;

-- =====================================================================
-- 8. MAINTENANCE PROCEDURES
-- =====================================================================

-- Refresh materialized views (run periodically via cron/scheduler)
CREATE OR REPLACE FUNCTION refresh_graph_metrics()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY entity_degree_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY relationship_type_stats;
END;
$$ LANGUAGE plpgsql;

-- Recompute PageRank (simplified version, run weekly)
CREATE OR REPLACE FUNCTION compute_pagerank(
  damping_factor REAL DEFAULT 0.85,
  max_iterations INTEGER DEFAULT 20,
  convergence_threshold REAL DEFAULT 0.0001
)
RETURNS VOID AS $$
DECLARE
  num_entities INTEGER;
  delta REAL := 1.0;
  iteration INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO num_entities FROM entities;

  -- Initialize PageRank
  UPDATE entities SET pagerank = 1.0 / num_entities;

  -- Iterative computation
  WHILE delta > convergence_threshold AND iteration < max_iterations LOOP
    WITH new_ranks AS (
      SELECT
        e.id,
        (1 - damping_factor) / num_entities +
        damping_factor * COALESCE(SUM(src.pagerank / NULLIF(src.out_degree, 0)), 0) AS new_rank
      FROM entities e
      LEFT JOIN relationships r ON e.id = r.target_id
      LEFT JOIN entities src ON r.source_id = src.id
      GROUP BY e.id
    )
    UPDATE entities e
    SET pagerank = new_ranks.new_rank
    FROM new_ranks
    WHERE e.id = new_ranks.id;

    -- Calculate delta (max change)
    SELECT MAX(ABS(pagerank - new_rank)) INTO delta
    FROM entities e
    JOIN new_ranks ON e.id = new_ranks.id;

    iteration := iteration + 1;
  END LOOP;

  RAISE NOTICE 'PageRank converged in % iterations (delta: %)', iteration, delta;
END;
$$ LANGUAGE plpgsql;

-- Vacuum and reindex (run monthly)
CREATE OR REPLACE FUNCTION maintain_knowledge_graph()
RETURNS VOID AS $$
BEGIN
  VACUUM ANALYZE entities;
  VACUUM ANALYZE relationships;
  REINDEX TABLE entities;
  REINDEX TABLE relationships;
  REFRESH MATERIALIZED VIEW CONCURRENTLY entity_degree_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY relationship_type_stats;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 9. SEED DATA (Common Entity/Relationship Types)
-- =====================================================================

-- Seed common entity types
INSERT INTO entity_types (type_name, description) VALUES
  ('person', 'Individual human entity'),
  ('organization', 'Company, institution, or group'),
  ('location', 'Physical or virtual place'),
  ('event', 'Temporal occurrence or happening'),
  ('concept', 'Abstract idea or notion'),
  ('document', 'Text or multimedia artifact'),
  ('product', 'Physical or digital product'),
  ('technology', 'Tool, framework, or technical system')
ON CONFLICT (type_name) DO NOTHING;

-- Seed common relationship types
INSERT INTO relationship_types (type_name, inverse_type_name, description, is_symmetric) VALUES
  ('related_to', 'related_to', 'Generic bidirectional relationship', TRUE),
  ('part_of', 'has_part', 'Component or member relationship', FALSE),
  ('located_in', 'contains', 'Spatial containment', FALSE),
  ('works_for', 'employs', 'Employment relationship', FALSE),
  ('created_by', 'created', 'Authorship or creation', FALSE),
  ('knows', 'knows', 'Social connection', TRUE),
  ('similar_to', 'similar_to', 'Semantic similarity', TRUE),
  ('causes', 'caused_by', 'Causal relationship', FALSE),
  ('precedes', 'follows', 'Temporal ordering', FALSE),
  ('mentions', 'mentioned_in', 'Reference or citation', FALSE)
ON CONFLICT (type_name) DO NOTHING;

-- =====================================================================
-- PERFORMANCE EXPECTATIONS & BENCHMARKS
-- =====================================================================
--
-- Expected Query Performance (on modest hardware):
--
-- 1. Entity lookup by ID: < 1ms
-- 2. Entity search by canonical_name: < 5ms
-- 3. Vector similarity search (top 20): < 50ms (10k entities), < 200ms (100k entities)
-- 4. 1-hop relationship traversal: < 10ms
-- 5. 3-hop path finding: < 100ms (sparse graphs), < 500ms (dense graphs)
-- 6. PageRank computation: ~1-5 seconds (10k entities), ~30-60 seconds (100k entities)
--
-- Index Size Estimates:
-- - HNSW vector index: ~50MB (10k entities), ~500MB (100k entities), ~5GB (1M entities)
-- - B-tree indexes: ~10MB (10k), ~100MB (100k), ~1GB (1M)
-- - Total storage: 2-3x raw data size
--
-- Scaling Thresholds:
-- - < 100k entities: Single table, no partitioning needed
-- - 100k - 1M entities: Consider partitioning by entity_type
-- - > 1M entities: Partition entities and relationships, consider sharding
--
-- =====================================================================

COMMENT ON TABLE entities IS 'Core entity table with 384-dim embeddings, graph metrics, and flexible JSONB properties';
COMMENT ON TABLE relationships IS 'Edge table with weights, confidence scores, and provenance tracking';
COMMENT ON TABLE entity_types IS 'Ontology of entity types with hierarchical parent-child relationships';
COMMENT ON TABLE relationship_types IS 'Ontology of relationship types with inverse mappings and validation schemas';
COMMENT ON INDEX idx_entities_embedding IS 'HNSW index optimized for 384-dim vectors (m=24, ef_construction=100)';
COMMENT ON FUNCTION get_descendants IS 'Recursive CTE to find all descendants of an entity (DAG traversal)';
COMMENT ON FUNCTION find_shortest_path IS 'BFS shortest path between two entities using recursive CTE';
COMMENT ON FUNCTION compute_pagerank IS 'Iterative PageRank computation with configurable damping factor';
