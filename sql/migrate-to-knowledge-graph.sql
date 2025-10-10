-- =====================================================================
-- MIGRATION SCRIPT: Current Schema → Knowledge Graph Schema
-- =====================================================================
-- Version: 1.0.0
-- Migration Strategy: Additive (preserves existing data)
-- Rollback: Provided at end of script
-- Estimated Time: 5-30 minutes depending on data volume
-- =====================================================================

-- =====================================================================
-- PRE-MIGRATION CHECKS
-- =====================================================================

-- Verify pgvector extension is available
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'pgvector extension not installed. Run: CREATE EXTENSION vector;';
  END IF;
END $$;

-- Check current schema version
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reports') THEN
    RAISE EXCEPTION 'reports table not found. This migration requires the base schema to exist.';
  END IF;
END $$;

-- Create migration metadata table
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  description TEXT,
  applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  rollback_sql TEXT
);

-- Record migration start
INSERT INTO schema_migrations (version, description, rollback_sql)
VALUES (
  '1.0.0-knowledge-graph',
  'Add knowledge graph schema (entities, relationships, ontology)',
  $ROLLBACK$
    -- Rollback commands provided at end of script
    DROP TRIGGER IF EXISTS trg_relationship_timestamp ON relationships;
    DROP TRIGGER IF EXISTS trg_entity_timestamp ON entities;
    DROP TRIGGER IF EXISTS trg_update_entity_degrees ON relationships;
    DROP FUNCTION IF EXISTS update_relationship_timestamp();
    DROP FUNCTION IF EXISTS update_entity_timestamp();
    DROP FUNCTION IF EXISTS update_entity_degrees();
    DROP FUNCTION IF EXISTS maintain_knowledge_graph();
    DROP FUNCTION IF EXISTS compute_pagerank(REAL, INTEGER, REAL);
    DROP FUNCTION IF EXISTS refresh_graph_metrics();
    DROP FUNCTION IF EXISTS search_entities_by_embedding(VECTOR(384), REAL, INTEGER);
    DROP FUNCTION IF EXISTS find_shortest_path(BIGINT, BIGINT, INTEGER);
    DROP FUNCTION IF EXISTS get_ancestors(BIGINT, INTEGER);
    DROP FUNCTION IF EXISTS get_descendants(BIGINT, INTEGER);
    DROP MATERIALIZED VIEW IF EXISTS relationship_type_stats;
    DROP MATERIALIZED VIEW IF EXISTS entity_degree_summary;
    DROP TABLE IF EXISTS relationships CASCADE;
    DROP TABLE IF EXISTS entities CASCADE;
    DROP TABLE IF EXISTS relationship_types CASCADE;
    DROP TABLE IF EXISTS entity_types CASCADE;
  $ROLLBACK$
)
ON CONFLICT (version) DO NOTHING;

-- =====================================================================
-- STEP 1: CREATE NEW KNOWLEDGE GRAPH TABLES
-- =====================================================================

-- Import the full schema
\i knowledge-graph-schema.sql

-- =====================================================================
-- STEP 2: MIGRATE EXISTING DATA
-- =====================================================================

-- 2.1: Extract entities from existing reports
-- Strategy: Create entities from research_metadata if structured data exists
-- Otherwise, create basic document entities for each report

DO $$
DECLARE
  report_record RECORD;
  metadata JSONB;
  entity_id BIGINT;
  report_entity_id BIGINT;
  canonical TEXT;
BEGIN
  FOR report_record IN
    SELECT id, original_query, query_embedding, research_metadata, final_report, created_at
    FROM reports
    WHERE query_embedding IS NOT NULL
  LOOP
    -- Create entity for the report itself
    canonical := LOWER(TRIM(report_record.original_query));

    INSERT INTO entities (
      entity_type,
      name,
      canonical_name,
      embedding,
      source_type,
      source_id,
      extraction_confidence,
      properties,
      usage_count,
      created_at
    )
    VALUES (
      'document',
      report_record.original_query,
      canonical,
      report_record.query_embedding,
      'report',
      report_record.id::TEXT,
      1.0, -- High confidence for existing reports
      JSONB_BUILD_OBJECT(
        'report_id', report_record.id,
        'summary', LEFT(report_record.final_report, 500),
        'migrated_from', 'reports_table'
      ),
      0,
      report_record.created_at
    )
    ON CONFLICT (entity_type, canonical_name) DO UPDATE
    SET usage_count = entities.usage_count + 1
    RETURNING id INTO report_entity_id;

    -- Extract entities from research_metadata if available
    -- This is a basic example - customize based on your metadata structure
    IF report_record.research_metadata IS NOT NULL THEN
      BEGIN
        metadata := report_record.research_metadata::JSONB;

        -- Example: Extract sources as entities
        IF metadata ? 'sources' AND JSONB_TYPEOF(metadata->'sources') = 'array' THEN
          FOR entity_record IN
            SELECT DISTINCT value->>'url' AS url, value->>'title' AS title
            FROM JSONB_ARRAY_ELEMENTS(metadata->'sources')
            WHERE value->>'url' IS NOT NULL
          LOOP
            INSERT INTO entities (
              entity_type,
              name,
              canonical_name,
              source_type,
              source_id,
              extraction_confidence,
              properties
            )
            VALUES (
              'document',
              COALESCE(entity_record.title, entity_record.url),
              LOWER(TRIM(COALESCE(entity_record.title, entity_record.url))),
              'url',
              entity_record.url,
              0.8,
              JSONB_BUILD_OBJECT('url', entity_record.url)
            )
            ON CONFLICT (entity_type, canonical_name) DO UPDATE
            SET usage_count = entities.usage_count + 1
            RETURNING id INTO entity_id;

            -- Create relationship: report mentions source
            INSERT INTO relationships (
              source_id,
              target_id,
              relationship_type,
              weight,
              confidence,
              source_evidence,
              extracted_by
            )
            VALUES (
              report_entity_id,
              entity_id,
              'mentions',
              1.0,
              0.8,
              'Extracted from research_metadata.sources',
              'migration_script'
            )
            ON CONFLICT (source_id, target_id, relationship_type) DO NOTHING;
          END LOOP;
        END IF;

      EXCEPTION
        WHEN OTHERS THEN
          RAISE NOTICE 'Failed to parse metadata for report %: %', report_record.id, SQLERRM;
      END;
    END IF;
  END LOOP;

  RAISE NOTICE 'Completed migration of % reports to entities', (SELECT COUNT(*) FROM reports);
END $$;

-- 2.2: Extract entities from index_documents (if indexer is enabled)
DO $$
DECLARE
  doc_record RECORD;
  entity_id BIGINT;
  canonical TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'index_documents') THEN
    FOR doc_record IN
      SELECT id, source_type, source_id, title, content, doc_embedding, created_at
      FROM index_documents
      WHERE doc_embedding IS NOT NULL
      LIMIT 10000 -- Limit for initial migration
    LOOP
      canonical := LOWER(TRIM(COALESCE(doc_record.title, doc_record.source_id)));

      INSERT INTO entities (
        entity_type,
        name,
        canonical_name,
        embedding,
        source_type,
        source_id,
        extraction_confidence,
        properties,
        created_at
      )
      VALUES (
        CASE
          WHEN doc_record.source_type = 'url' THEN 'document'
          WHEN doc_record.source_type = 'report' THEN 'document'
          ELSE 'document'
        END,
        COALESCE(doc_record.title, doc_record.source_id),
        canonical,
        doc_record.doc_embedding,
        doc_record.source_type,
        doc_record.source_id,
        0.7,
        JSONB_BUILD_OBJECT(
          'snippet', LEFT(doc_record.content, 300),
          'migrated_from', 'index_documents'
        ),
        doc_record.created_at
      )
      ON CONFLICT (entity_type, canonical_name) DO NOTHING;
    END LOOP;

    RAISE NOTICE 'Migrated % documents from index_documents to entities',
      (SELECT COUNT(*) FROM index_documents LIMIT 10000);
  END IF;
END $$;

-- 2.3: Create relationships from based_on_past_report_ids
DO $$
DECLARE
  report_record RECORD;
  past_report_id INTEGER;
  source_entity_id BIGINT;
  target_entity_id BIGINT;
BEGIN
  FOR report_record IN
    SELECT id, based_on_past_report_ids
    FROM reports
    WHERE based_on_past_report_ids IS NOT NULL
      AND based_on_past_report_ids != '[]'::JSONB
  LOOP
    -- Get source entity ID
    SELECT e.id INTO source_entity_id
    FROM entities e
    WHERE e.source_type = 'report'
      AND e.source_id = report_record.id::TEXT
    LIMIT 1;

    IF source_entity_id IS NOT NULL THEN
      -- Create relationships for each past report
      FOR past_report_id IN
        SELECT JSONB_ARRAY_ELEMENTS_TEXT(report_record.based_on_past_report_ids)::INTEGER
      LOOP
        SELECT e.id INTO target_entity_id
        FROM entities e
        WHERE e.source_type = 'report'
          AND e.source_id = past_report_id::TEXT
        LIMIT 1;

        IF target_entity_id IS NOT NULL THEN
          INSERT INTO relationships (
            source_id,
            target_id,
            relationship_type,
            weight,
            confidence,
            source_evidence,
            extracted_by
          )
          VALUES (
            source_entity_id,
            target_entity_id,
            'related_to',
            1.0,
            0.9,
            'Based on past report reference',
            'migration_script'
          )
          ON CONFLICT (source_id, target_id, relationship_type) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RAISE NOTICE 'Created relationships from based_on_past_report_ids';
END $$;

-- =====================================================================
-- STEP 3: UPDATE GRAPH METRICS
-- =====================================================================

-- Refresh materialized views
SELECT refresh_graph_metrics();

-- Compute initial PageRank (this may take a few minutes for large graphs)
SELECT compute_pagerank(0.85, 20, 0.0001);

-- Update entity last_accessed from usage_counters if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usage_counters') THEN
    UPDATE entities e
    SET
      usage_count = COALESCE(u.uses, 0),
      last_accessed = u.last_used_at
    FROM usage_counters u
    WHERE u.entity_type IN ('doc', 'report')
      AND u.entity_id = e.source_id;

    RAISE NOTICE 'Updated usage statistics from usage_counters';
  END IF;
END $$;

-- =====================================================================
-- STEP 4: CREATE INTEGRATION VIEWS (Bridge old and new schemas)
-- =====================================================================

-- View to access reports through entity interface
CREATE OR REPLACE VIEW report_entities AS
SELECT
  e.id AS entity_id,
  e.name AS report_title,
  e.canonical_name,
  e.embedding,
  r.id AS report_id,
  r.original_query,
  r.final_report,
  r.research_metadata,
  r.images,
  r.text_documents,
  r.structured_data,
  r.created_at,
  e.usage_count,
  e.degree,
  e.pagerank
FROM entities e
JOIN reports r ON e.source_id = r.id::TEXT
WHERE e.source_type = 'report'
  AND e.entity_type = 'document';

-- View to find related reports via knowledge graph
CREATE OR REPLACE VIEW related_reports AS
SELECT
  e1.source_id::INTEGER AS report_id,
  e1.name AS report_title,
  e2.source_id::INTEGER AS related_report_id,
  e2.name AS related_report_title,
  r.relationship_type,
  r.weight,
  r.confidence
FROM relationships r
JOIN entities e1 ON r.source_id = e1.id
JOIN entities e2 ON r.target_id = e2.id
WHERE e1.source_type = 'report'
  AND e2.source_type = 'report';

-- =====================================================================
-- STEP 5: VERIFY MIGRATION
-- =====================================================================

DO $$
DECLARE
  entity_count INTEGER;
  relationship_count INTEGER;
  report_count INTEGER;
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO entity_count FROM entities;
  SELECT COUNT(*) INTO relationship_count FROM relationships;
  SELECT COUNT(*) INTO report_count FROM reports;
  SELECT COUNT(*) INTO orphan_count FROM entities WHERE degree = 0;

  RAISE NOTICE '=== MIGRATION SUMMARY ===';
  RAISE NOTICE 'Total entities created: %', entity_count;
  RAISE NOTICE 'Total relationships created: %', relationship_count;
  RAISE NOTICE 'Original reports: %', report_count;
  RAISE NOTICE 'Orphan entities (degree = 0): %', orphan_count;
  RAISE NOTICE '========================';

  -- Sanity checks
  IF entity_count < report_count THEN
    RAISE WARNING 'Entity count (%) is less than report count (%). Some data may not have migrated.', entity_count, report_count;
  END IF;

  IF orphan_count > entity_count * 0.5 THEN
    RAISE WARNING 'High number of orphan entities (%). Consider running relationship extraction.', orphan_count;
  END IF;
END $$;

-- =====================================================================
-- POST-MIGRATION RECOMMENDATIONS
-- =====================================================================

COMMENT ON VIEW report_entities IS 'Bridge view: Access reports through entity interface';
COMMENT ON VIEW related_reports IS 'Bridge view: Find related reports via knowledge graph relationships';

-- Create scheduled job for periodic maintenance (adjust based on your scheduler)
-- Example for pg_cron (if available):
-- SELECT cron.schedule('refresh-kg-metrics', '0 2 * * *', 'SELECT refresh_graph_metrics()');
-- SELECT cron.schedule('compute-pagerank', '0 3 * * 0', 'SELECT compute_pagerank()');
-- SELECT cron.schedule('vacuum-kg', '0 4 1 * *', 'SELECT maintain_knowledge_graph()');

-- =====================================================================
-- ROLLBACK PROCEDURE (If needed)
-- =====================================================================

-- To rollback this migration:
-- 1. DROP new views:
--    DROP VIEW IF EXISTS related_reports;
--    DROP VIEW IF EXISTS report_entities;
--
-- 2. Execute rollback SQL from schema_migrations:
--    SELECT rollback_sql FROM schema_migrations WHERE version = '1.0.0-knowledge-graph';
--
-- 3. Remove migration record:
--    DELETE FROM schema_migrations WHERE version = '1.0.0-knowledge-graph';

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

SELECT
  version,
  description,
  applied_at,
  (SELECT COUNT(*) FROM entities) AS entity_count,
  (SELECT COUNT(*) FROM relationships) AS relationship_count
FROM schema_migrations
WHERE version = '1.0.0-knowledge-graph';

RAISE NOTICE 'Migration to knowledge graph schema completed successfully!';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Run entity extraction on existing reports: SELECT extract_entities_from_reports();';
RAISE NOTICE '2. Set up periodic maintenance jobs (refresh_graph_metrics, compute_pagerank)';
RAISE NOTICE '3. Monitor query performance and adjust HNSW parameters if needed';
RAISE NOTICE '4. Consider partitioning when entity count exceeds 100k';
