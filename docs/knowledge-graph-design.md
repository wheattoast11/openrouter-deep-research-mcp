# Knowledge Graph Schema Design Documentation

**Version:** 1.0.0
**Last Updated:** October 2, 2025
**Target Platform:** PGlite with pgvector extension
**Embedding Model:** Xenova/all-MiniLM-L6-v2 (384 dimensions)
**Scale Target:** 10k-100k entities initially, 1M+ eventually

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Schema Design](#schema-design)
3. [Index Strategy](#index-strategy)
4. [Performance Benchmarks](#performance-benchmarks)
5. [Scaling Plan](#scaling-plan)
6. [Backup & Restore](#backup--restore)
7. [Usage Examples](#usage-examples)
8. [Maintenance Procedures](#maintenance-procedures)

---

## Architecture Overview

### Core Principles

1. **Hybrid Storage**: Combines relational graph structure with vector embeddings
2. **Semantic Deduplication**: Uses canonical_name normalization to prevent duplicates
3. **Provenance Tracking**: Every entity/relationship tracks its source and extraction method
4. **Flexible Metadata**: JSONB properties allow schema-free extension
5. **Graph Metrics**: Automatic degree counting, PageRank computation
6. **Recursive Traversal**: No Apache AGE dependency—uses PostgreSQL recursive CTEs

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE GRAPH LAYER                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Entities   │  │Relationships │  │ Ontology (Types) │   │
│  │             │  │              │  │                  │   │
│  │ • 384-dim   │  │ • Weighted   │  │ • entity_types   │   │
│  │   vectors   │  │   edges      │  │ • rel_types      │   │
│  │ • Metadata  │  │ • Provenance │  │ • Validation     │   │
│  │ • Metrics   │  │ • Properties │  │   schemas        │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                    INDEXING LAYER                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  HNSW (vector)  │  B-tree (IDs)  │  GIN (JSONB)             │
│  m=24           │  canonical_name │  properties              │
│  ef_const=100   │  entity_type    │  graph metrics           │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                INTEGRATION WITH EXISTING SCHEMA              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  reports table  │  index_documents  │  usage_counters        │
│  (via views)    │  (migrated)       │  (aggregated)          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Schema Design

### 1. Ontology Tables

#### entity_types
Hierarchical type system with parent-child relationships.

```sql
CREATE TABLE entity_types (
  id SERIAL PRIMARY KEY,
  type_name TEXT UNIQUE NOT NULL,
  parent_type_id INTEGER REFERENCES entity_types(id),
  description TEXT,
  properties_schema JSONB,  -- JSON Schema for validation
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

**Built-in Types:**
- `person` - Individual human entities
- `organization` - Companies, institutions
- `location` - Physical/virtual places
- `event` - Temporal occurrences
- `concept` - Abstract ideas
- `document` - Text/multimedia artifacts
- `product` - Physical/digital products
- `technology` - Tools, frameworks, systems

#### relationship_types
Relationship ontology with inverse mappings.

```sql
CREATE TABLE relationship_types (
  id SERIAL PRIMARY KEY,
  type_name TEXT UNIQUE NOT NULL,
  inverse_type_name TEXT,
  source_entity_type TEXT REFERENCES entity_types(type_name),
  target_entity_type TEXT REFERENCES entity_types(type_name),
  description TEXT,
  properties_schema JSONB,
  is_symmetric BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

**Built-in Relationships:**
- `related_to` ↔ `related_to` (symmetric)
- `part_of` ↔ `has_part`
- `located_in` ↔ `contains`
- `works_for` ↔ `employs`
- `created_by` ↔ `created`
- `knows` ↔ `knows` (symmetric)
- `similar_to` ↔ `similar_to` (symmetric)
- `causes` ↔ `caused_by`
- `precedes` ↔ `follows`
- `mentions` ↔ `mentioned_in`

### 2. Core Entity Table

#### entities
Central entity storage with embeddings and graph metrics.

```sql
CREATE TABLE entities (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL REFERENCES entity_types(type_name),
  name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  embedding VECTOR(384),

  -- Graph metrics (auto-updated by triggers)
  degree INTEGER DEFAULT 0,
  in_degree INTEGER DEFAULT 0,
  out_degree INTEGER DEFAULT 0,
  pagerank REAL DEFAULT 0.0,
  community_id INTEGER,

  -- Provenance
  source_type TEXT NOT NULL,  -- 'report' | 'url' | 'manual' | 'extracted'
  source_id TEXT NOT NULL,
  extraction_confidence REAL CHECK (extraction_confidence BETWEEN 0 AND 1),

  -- Flexible metadata
  properties JSONB DEFAULT '{}',

  -- Usage analytics
  usage_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_entity_per_type UNIQUE(entity_type, canonical_name)
);
```

**Deduplication Strategy:**
- `canonical_name` = normalized lowercase version of `name`
- Unique constraint on `(entity_type, canonical_name)`
- Example: "OpenAI", "openai", "OpenAI Inc" → all map to canonical "openai"

### 3. Relationships (Edges) Table

#### relationships
Weighted, directed edges with provenance tracking.

```sql
CREATE TABLE relationships (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_id BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL REFERENCES relationship_types(type_name),

  weight REAL DEFAULT 1.0 CHECK (weight >= 0),
  confidence REAL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),

  source_evidence TEXT,
  extracted_by TEXT,
  extraction_confidence REAL CHECK (extraction_confidence BETWEEN 0 AND 1),

  properties JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_relationship UNIQUE(source_id, target_id, relationship_type)
);
```

**Edge Weight Semantics:**
- `weight`: Relationship strength (e.g., frequency of co-occurrence)
- `confidence`: Extraction quality score
- Combined: `effective_weight = weight * confidence`

### 4. Materialized Views

#### entity_degree_summary
Precomputed degree statistics.

```sql
CREATE MATERIALIZED VIEW entity_degree_summary AS
SELECT
  e.id AS entity_id,
  e.entity_type,
  e.name,
  COALESCE(out_counts.cnt, 0) AS out_degree,
  COALESCE(in_counts.cnt, 0) AS in_degree,
  COALESCE(out_counts.cnt, 0) + COALESCE(in_counts.cnt, 0) AS total_degree
FROM entities e
LEFT JOIN (SELECT source_id, COUNT(*) AS cnt FROM relationships GROUP BY source_id) out_counts
  ON e.id = out_counts.source_id
LEFT JOIN (SELECT target_id, COUNT(*) AS cnt FROM relationships GROUP BY target_id) in_counts
  ON e.id = in_counts.target_id;
```

**Refresh Schedule:** Hourly or after bulk relationship changes

#### relationship_type_stats
Relationship distribution and quality metrics.

```sql
CREATE MATERIALIZED VIEW relationship_type_stats AS
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
```

---

## Index Strategy

### Vector Index: HNSW

**Configuration:**
```sql
CREATE INDEX idx_entities_embedding
  ON entities
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 24, ef_construction = 100);
```

**Parameter Rationale:**

| Parameter | Value | Reasoning |
|-----------|-------|-----------|
| `m` | 24 | Higher than default (16) for 384-dim vectors. Provides better recall for high-dimensional data at cost of ~50% more memory. |
| `ef_construction` | 100 | Balanced build time vs. search quality. Higher than default (64) for improved recall. |
| `ef_search` | 40 (runtime) | Set via `SET hnsw.ef_search = 40` before queries. Higher values = better recall, slower search. |

**Expected Performance:**
- 10k entities: < 50ms for top-20 similarity search
- 100k entities: < 200ms for top-20 similarity search
- 1M entities: < 500ms for top-20 similarity search (with tuned ef_search)

### B-tree Indexes

```sql
-- Critical for lookups
CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_canonical ON entities(canonical_name);
CREATE INDEX idx_entities_source ON entities(source_type, source_id);

-- Graph traversal
CREATE INDEX idx_relationships_source ON relationships(source_id, relationship_type);
CREATE INDEX idx_relationships_target ON relationships(target_id, relationship_type);

-- Weighted graph queries
CREATE INDEX idx_relationships_weighted ON relationships(source_id, weight DESC, confidence DESC);

-- Usage analytics
CREATE INDEX idx_entities_usage ON entities(usage_count DESC, last_accessed DESC);
```

### GIN Indexes (JSONB)

```sql
-- Entity properties search
CREATE INDEX idx_entities_properties ON entities USING gin(properties jsonb_path_ops);

-- Relationship properties
CREATE INDEX idx_relationships_properties ON relationships USING gin(properties jsonb_path_ops);
```

**Use Case:** Fast containment queries like `properties @> '{"category": "AI"}'`

### Composite Indexes

```sql
-- Top entities by PageRank
CREATE INDEX idx_entities_metrics ON entities(pagerank DESC, degree DESC) WHERE embedding IS NOT NULL;
```

**Use Case:** Leaderboard queries, influence analysis

---

## Performance Benchmarks

### Test Environment
- **Hardware:** PGlite on Node.js v20 (typical developer machine)
- **Data:** Synthetic graph with realistic distribution
- **Embeddings:** All entities have 384-dim vectors

### Query Performance (Expected)

| Query Type | 10k Entities | 100k Entities | 1M Entities |
|------------|-------------|---------------|-------------|
| **Entity lookup by ID** | < 1ms | < 1ms | < 2ms |
| **Canonical name search** | < 5ms | < 10ms | < 20ms |
| **Vector similarity (top 20)** | < 50ms | < 200ms | < 500ms |
| **1-hop traversal** | < 10ms | < 20ms | < 50ms |
| **3-hop path finding** | < 100ms | < 500ms | < 2s |
| **PageRank computation** | 1-5s | 30-60s | 5-10min |
| **Materialized view refresh** | < 1s | 10-30s | 2-5min |

### Storage Estimates

| Component | 10k Entities | 100k Entities | 1M Entities |
|-----------|-------------|---------------|-------------|
| **Entity data** | ~10 MB | ~100 MB | ~1 GB |
| **HNSW index** | ~50 MB | ~500 MB | ~5 GB |
| **B-tree indexes** | ~10 MB | ~100 MB | ~1 GB |
| **Relationships** | ~5 MB | ~50 MB | ~500 MB |
| **Total (est.)** | **~75 MB** | **~750 MB** | **~7.5 GB** |

**Note:** Actual size depends on average degree, JSONB properties size, and relationship density.

### HNSW Parameter Tuning

| Recall Target | ef_search | Query Time (100k) | Memory Overhead |
|---------------|-----------|-------------------|-----------------|
| 90% | 20 | ~100ms | Baseline |
| 95% | 40 | ~200ms | +10% |
| 98% | 80 | ~400ms | +20% |
| 99.5% | 160 | ~800ms | +40% |

**Recommendation:** Start with `ef_search=40` (95% recall), adjust based on precision requirements.

---

## Scaling Plan

### Phase 1: < 100k Entities (Current Implementation)

**Strategy:** Single-table architecture with optimized indexes

**Indexes:**
- HNSW with `m=24, ef_construction=100`
- Standard B-tree on all lookup columns
- GIN for JSONB properties

**Maintenance:**
- Vacuum: Weekly
- Reindex: Monthly
- PageRank: Daily (off-peak hours)
- Materialized view refresh: Hourly

### Phase 2: 100k - 1M Entities

**Strategy:** Introduce partitioning by entity_type

```sql
-- Convert to partitioned table
ALTER TABLE entities RENAME TO entities_unpartitioned;
CREATE TABLE entities (LIKE entities_unpartitioned INCLUDING ALL)
  PARTITION BY LIST (entity_type);

-- Create partitions for common types
CREATE TABLE entities_person PARTITION OF entities
  FOR VALUES IN ('person', 'user', 'author');
CREATE TABLE entities_organization PARTITION OF entities
  FOR VALUES IN ('organization', 'company');
CREATE TABLE entities_location PARTITION OF entities
  FOR VALUES IN ('location', 'place', 'address');
CREATE TABLE entities_document PARTITION OF entities
  FOR VALUES IN ('document', 'report', 'article');
CREATE TABLE entities_default PARTITION OF entities DEFAULT;
```

**Benefits:**
- Reduced index size per partition
- Faster queries filtering by entity_type
- Easier maintenance (partition-level vacuum/reindex)

**Considerations:**
- PGlite may have limited partitioning support—test before deployment
- Plan migration path to full PostgreSQL if needed

### Phase 3: > 1M Entities (Future)

**Strategy:** Sharding + Specialized indexes

**Horizontal Sharding:**
- Shard by `entity_type` or hash of `canonical_name`
- Use FDW (Foreign Data Wrappers) or application-level routing
- Consider TimescaleDB for time-series entity data

**Index Optimization:**
- Switch to IVFFlat for > 1M vectors (faster build, acceptable recall)
- Implement approximate nearest neighbor (ANN) filters
- Use partial indexes for hot partitions

**Alternative Databases:**
- **Neo4j:** For complex graph traversals (>5 hops)
- **Weaviate/Qdrant:** For pure vector search (>10M entities)
- **DGraph:** For distributed graph queries

---

## Backup & Restore

### Backup Strategy

#### 1. Full Database Backup (Weekly)

```bash
# PGlite file-based backup (if using file storage)
cp -r ./researchAgentDB ./backups/kg-backup-$(date +%Y%m%d).db

# Or export to SQL
pg_dump -h localhost -U postgres openrouter_agents > kg-backup-$(date +%Y%m%d).sql
```

#### 2. Incremental Backup (Daily)

Use write-ahead log (WAL) archiving if available:

```sql
-- Enable WAL archiving (PostgreSQL)
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET archive_mode = on;
ALTER SYSTEM SET archive_command = 'cp %p /backups/wal/%f';
SELECT pg_reload_conf();
```

**Note:** PGlite may not support WAL archiving—use file-based snapshots instead.

#### 3. Selective Entity Export (On-Demand)

```sql
-- Export specific entity types to JSON
COPY (
  SELECT
    id,
    entity_type,
    name,
    canonical_name,
    properties,
    embedding,
    created_at
  FROM entities
  WHERE entity_type = 'person'
) TO '/backups/entities_person.json' WITH (FORMAT csv, HEADER);
```

### Restore Procedures

#### Full Restore from SQL Dump

```bash
# Drop existing schema (DANGER: Data loss!)
psql -h localhost -U postgres -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Restore from backup
psql -h localhost -U postgres openrouter_agents < kg-backup-20251002.sql
```

#### Selective Entity Import

```sql
-- Import entities from JSON (use COPY or custom loader)
CREATE TEMP TABLE temp_entities (
  id BIGINT,
  entity_type TEXT,
  name TEXT,
  canonical_name TEXT,
  properties JSONB,
  embedding VECTOR(384),
  created_at TIMESTAMPTZ
);

COPY temp_entities FROM '/backups/entities_person.json' WITH (FORMAT csv, HEADER);

INSERT INTO entities (id, entity_type, name, canonical_name, properties, embedding, created_at)
SELECT * FROM temp_entities
ON CONFLICT (entity_type, canonical_name) DO UPDATE
SET properties = EXCLUDED.properties, embedding = EXCLUDED.embedding;
```

### Disaster Recovery

**RPO (Recovery Point Objective):** 24 hours (daily backups)
**RTO (Recovery Time Objective):** 1-4 hours (depending on data size)

**Recovery Steps:**
1. Identify last valid backup
2. Restore base schema from `knowledge-graph-schema.sql`
3. Import entity/relationship data from backup
4. Rebuild indexes: `REINDEX TABLE entities; REINDEX TABLE relationships;`
5. Refresh materialized views: `SELECT refresh_graph_metrics();`
6. Verify data integrity: Check entity counts, run sample queries

---

## Usage Examples

### 1. Create Entity with Embedding

```javascript
const dbClient = require('./src/utils/dbClient');

async function createEntity(name, entityType, embedding) {
  const canonical = name.toLowerCase().trim();

  await db.query(`
    INSERT INTO entities (entity_type, name, canonical_name, embedding, source_type, source_id, extraction_confidence)
    VALUES ($1, $2, $3, $4, 'manual', 'user_input', 1.0)
    ON CONFLICT (entity_type, canonical_name) DO UPDATE
    SET embedding = EXCLUDED.embedding, updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `, [entityType, name, canonical, `[${embedding.join(',')}]`]);
}

// Generate embedding and create entity
const text = "OpenAI develops GPT models for natural language processing";
const embedding = await dbClient.generateEmbedding(text);
await createEntity("OpenAI", "organization", embedding);
```

### 2. Create Relationship

```javascript
async function createRelationship(sourceName, targetName, relType, weight = 1.0) {
  await db.query(`
    INSERT INTO relationships (source_id, target_id, relationship_type, weight, confidence, extracted_by)
    SELECT
      (SELECT id FROM entities WHERE canonical_name = $1 LIMIT 1),
      (SELECT id FROM entities WHERE canonical_name = $2 LIMIT 1),
      $3,
      $4,
      0.9,
      'manual'
    ON CONFLICT (source_id, target_id, relationship_type) DO UPDATE
    SET weight = EXCLUDED.weight, updated_at = CURRENT_TIMESTAMP
  `, [sourceName.toLowerCase(), targetName.toLowerCase(), relType, weight]);
}

await createRelationship("OpenAI", "GPT", "created", 1.0);
await createRelationship("OpenAI", "Sam Altman", "employs", 1.0);
```

### 3. Semantic Search

```javascript
async function findSimilarEntities(queryText, limit = 20, minSimilarity = 0.7) {
  const queryEmbedding = await dbClient.generateEmbedding(queryText);

  const result = await db.query(`
    SELECT
      id,
      name,
      entity_type,
      (1 - (embedding <=> $1::vector))::REAL AS similarity,
      properties
    FROM entities
    WHERE embedding IS NOT NULL
      AND (1 - (embedding <=> $1::vector)) >= $2
    ORDER BY embedding <=> $1::vector
    LIMIT $3
  `, [`[${queryEmbedding.join(',')}]`, minSimilarity, limit]);

  return result.rows;
}

const similar = await findSimilarEntities("artificial intelligence companies");
console.log(similar);
// [{ name: "OpenAI", similarity: 0.89, ... }, { name: "Anthropic", similarity: 0.85, ... }]
```

### 4. Graph Traversal: Find Descendants

```javascript
async function getEntityDescendants(entityName, maxDepth = 3) {
  const result = await db.query(`
    SELECT d.descendant_id, d.path_length, d.path, e.name, e.entity_type
    FROM get_descendants(
      (SELECT id FROM entities WHERE canonical_name = $1 LIMIT 1),
      $2
    ) d
    JOIN entities e ON e.id = d.descendant_id
    ORDER BY d.path_length, e.name
  `, [entityName.toLowerCase(), maxDepth]);

  return result.rows;
}

const descendants = await getEntityDescendants("OpenAI", 2);
// [{ name: "GPT-4", path_length: 1, ... }, { name: "ChatGPT", path_length: 2, ... }]
```

### 5. Shortest Path Between Entities

```javascript
async function findPath(startName, endName, maxDepth = 6) {
  const result = await db.query(`
    SELECT
      p.path,
      p.path_length,
      ARRAY(
        SELECT e.name FROM entities e WHERE e.id = ANY(p.path) ORDER BY array_position(p.path, e.id)
      ) AS entity_names
    FROM find_shortest_path(
      (SELECT id FROM entities WHERE canonical_name = $1 LIMIT 1),
      (SELECT id FROM entities WHERE canonical_name = $2 LIMIT 1),
      $3
    ) p
  `, [startName.toLowerCase(), endName.toLowerCase(), maxDepth]);

  return result.rows[0];
}

const path = await findPath("OpenAI", "Elon Musk", 4);
console.log(path.entity_names);
// ["OpenAI", "Sam Altman", "Y Combinator", "Elon Musk"]
```

### 6. Top Influential Entities (PageRank)

```javascript
async function getTopEntities(limit = 10, entityType = null) {
  const typeFilter = entityType ? 'WHERE entity_type = $2' : '';

  const result = await db.query(`
    SELECT
      name,
      entity_type,
      pagerank,
      degree,
      usage_count
    FROM entities
    ${typeFilter}
    ORDER BY pagerank DESC, degree DESC
    LIMIT $1
  `, entityType ? [limit, entityType] : [limit]);

  return result.rows;
}

const topOrgs = await getTopEntities(5, 'organization');
// [{ name: "OpenAI", pagerank: 0.042, degree: 87, ... }, ...]
```

---

## Maintenance Procedures

### Daily Tasks

#### 1. Refresh Materialized Views

```sql
-- Run during off-peak hours (e.g., 2 AM)
SELECT refresh_graph_metrics();
```

**Estimated Time:** 10-30 seconds (100k entities)

#### 2. Update PageRank

```sql
-- Compute with default parameters
SELECT compute_pagerank(0.85, 20, 0.0001);
```

**Estimated Time:** 30-60 seconds (100k entities)

### Weekly Tasks

#### 1. Vacuum Analyze

```sql
VACUUM ANALYZE entities;
VACUUM ANALYZE relationships;
VACUUM ANALYZE entity_types;
VACUUM ANALYZE relationship_types;
```

**Purpose:** Reclaim space, update query planner statistics

#### 2. Check Index Health

```sql
-- Identify bloated indexes (PostgreSQL only)
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan AS index_scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Monthly Tasks

#### 1. Full Reindex

```sql
-- Rebuild all indexes
REINDEX TABLE entities;
REINDEX TABLE relationships;
REINDEX MATERIALIZED VIEW entity_degree_summary;
REINDEX MATERIALIZED VIEW relationship_type_stats;
```

**Estimated Time:** 5-15 minutes (100k entities)

#### 2. Analyze Query Performance

```sql
-- Find slow queries (enable pg_stat_statements extension)
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time,
  rows
FROM pg_stat_statements
WHERE query LIKE '%entities%' OR query LIKE '%relationships%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

#### 3. Prune Old Data

```sql
-- Archive entities not accessed in 6 months
INSERT INTO entities_archive
SELECT * FROM entities
WHERE last_accessed < CURRENT_TIMESTAMP - INTERVAL '6 months'
  AND usage_count = 0;

DELETE FROM entities
WHERE last_accessed < CURRENT_TIMESTAMP - INTERVAL '6 months'
  AND usage_count = 0;
```

### Quarterly Tasks

#### 1. Full Backup Verification

- Restore backup to test environment
- Verify entity count matches production
- Run smoke tests on critical queries

#### 2. Index Parameter Tuning

```sql
-- Drop and recreate HNSW with adjusted parameters
DROP INDEX idx_entities_embedding;
CREATE INDEX idx_entities_embedding
  ON entities
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 32, ef_construction = 150); -- Adjusted for growth

-- Test recall and adjust ef_search
SET hnsw.ef_search = 60;
-- Run sample queries and measure recall
```

#### 3. Capacity Planning Review

- Track growth rate: `SELECT COUNT(*), AVG(pg_column_size(embedding)) FROM entities;`
- Estimate time to scaling threshold (100k, 1M entities)
- Plan partitioning or migration if needed

---

## Integration with Existing Codebase

### 1. Add to dbClient.js

```javascript
// Add to src/utils/dbClient.js

// Entity operations
async function createEntity({ entityType, name, embedding, sourceType, sourceId, properties = {}, confidence = 1.0 }) {
  const canonical = name.toLowerCase().trim();
  const embeddingFormatted = embedding ? formatVectorForPgLite(embedding) : null;

  return executeWithRetry(async () => {
    const result = await db.query(`
      INSERT INTO entities (entity_type, name, canonical_name, embedding, source_type, source_id, extraction_confidence, properties)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (entity_type, canonical_name) DO UPDATE
      SET embedding = EXCLUDED.embedding, properties = entities.properties || EXCLUDED.properties, updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `, [entityType, name, canonical, embeddingFormatted, sourceType, sourceId, confidence, JSON.stringify(properties)]);

    return result.rows[0].id;
  }, 'createEntity', null);
}

async function createRelationship({ sourceId, targetId, relationshipType, weight = 1.0, confidence = 1.0, evidence = null, extractedBy = 'system' }) {
  return executeWithRetry(async () => {
    await db.query(`
      INSERT INTO relationships (source_id, target_id, relationship_type, weight, confidence, source_evidence, extracted_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (source_id, target_id, relationship_type) DO UPDATE
      SET weight = EXCLUDED.weight, confidence = EXCLUDED.confidence, updated_at = CURRENT_TIMESTAMP
    `, [sourceId, targetId, relationshipType, weight, confidence, evidence, extractedBy]);
  }, 'createRelationship', null);
}

async function searchEntitiesByEmbedding(queryEmbedding, limit = 20, minSimilarity = 0.7) {
  const queryVec = formatVectorForPgLite(queryEmbedding);

  return executeWithRetry(async () => {
    const result = await db.query(`
      SELECT id, name, entity_type, (1 - (embedding <=> $1::vector))::REAL AS similarity, properties
      FROM entities
      WHERE embedding IS NOT NULL AND (1 - (embedding <=> $1::vector)) >= $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `, [queryVec, minSimilarity, limit]);

    return result.rows;
  }, 'searchEntitiesByEmbedding', []);
}

module.exports = {
  // ... existing exports
  createEntity,
  createRelationship,
  searchEntitiesByEmbedding,
  getDescendants: (entityId, maxDepth) => db.query('SELECT * FROM get_descendants($1, $2)', [entityId, maxDepth]),
  getAncestors: (entityId, maxDepth) => db.query('SELECT * FROM get_ancestors($1, $2)', [entityId, maxDepth]),
  findShortestPath: (startId, endId, maxDepth) => db.query('SELECT * FROM find_shortest_path($1, $2, $3)', [startId, endId, maxDepth])
};
```

### 2. Add MCP Tools

```javascript
// Add to src/server/tools.js

const createEntitySchema = z.object({
  entityType: z.string().describe('Entity type (e.g., person, organization, location)'),
  name: z.string().describe('Entity name'),
  description: z.string().optional().describe('Entity description for embedding generation'),
  sourceType: z.string().default('manual'),
  sourceId: z.string().default('mcp_tool'),
  properties: z.record(z.any()).optional().default({})
});

async function handleCreateEntity(args) {
  const { entityType, name, description, sourceType, sourceId, properties } = args;

  // Generate embedding from name + description
  const text = description ? `${name}. ${description}` : name;
  const embedding = await dbClient.generateEmbedding(text);

  const entityId = await dbClient.createEntity({
    entityType,
    name,
    embedding,
    sourceType,
    sourceId,
    properties,
    confidence: 0.9
  });

  return {
    success: true,
    entityId,
    message: `Created entity '${name}' (type: ${entityType}) with ID ${entityId}`
  };
}

const searchEntitiesSchema = z.object({
  query: z.string().describe('Search query for semantic entity search'),
  entityType: z.string().optional().describe('Filter by entity type'),
  limit: z.number().default(20).describe('Maximum number of results'),
  minSimilarity: z.number().default(0.7).describe('Minimum similarity threshold (0-1)')
});

async function handleSearchEntities(args) {
  const { query, entityType, limit, minSimilarity } = args;

  const embedding = await dbClient.generateEmbedding(query);
  const results = await dbClient.searchEntitiesByEmbedding(embedding, limit, minSimilarity);

  // Filter by type if specified
  const filtered = entityType
    ? results.filter(e => e.entity_type === entityType)
    : results;

  return {
    query,
    count: filtered.length,
    entities: filtered.map(e => ({
      id: e.id,
      name: e.name,
      type: e.entity_type,
      similarity: e.similarity,
      properties: e.properties
    }))
  };
}

// Export new tools
module.exports = {
  // ... existing tools
  create_entity: { schema: createEntitySchema, handler: handleCreateEntity },
  search_entities: { schema: searchEntitiesSchema, handler: handleSearchEntities }
};
```

---

## Troubleshooting

### Issue: Vector search returns no results

**Symptoms:**
- `search_entities_by_embedding()` returns empty array
- Expected similar entities exist

**Diagnosis:**
```sql
-- Check if embeddings are NULL
SELECT COUNT(*), COUNT(embedding) FROM entities;

-- Check index health
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'entities' AND indexdef LIKE '%hnsw%';

-- Test without index
SET enable_indexscan = off;
SELECT name, (1 - (embedding <=> '[0.1, 0.2, ...]'::vector)) AS sim
FROM entities
WHERE embedding IS NOT NULL
ORDER BY sim DESC LIMIT 5;
```

**Solutions:**
1. Regenerate embeddings: `UPDATE entities SET embedding = generate_embedding_from_name(name) WHERE embedding IS NULL;`
2. Rebuild index: `REINDEX INDEX idx_entities_embedding;`
3. Lower similarity threshold: Use 0.5 instead of 0.7

### Issue: PageRank computation is slow

**Symptoms:**
- `compute_pagerank()` takes > 5 minutes for 100k entities
- High CPU usage during computation

**Solutions:**
1. Reduce iterations: `SELECT compute_pagerank(0.85, 10, 0.001);` (looser convergence)
2. Limit to subgraph: Modify function to only process high-degree nodes
3. Schedule during off-peak hours
4. Consider using external graph library (NetworkX, igraph)

### Issue: Index size grows too large

**Symptoms:**
- HNSW index > 10x entity data size
- Slow inserts (> 1 second per entity)

**Solutions:**
1. Lower `m` parameter: Rebuild with `m=16` (default) or `m=12`
2. Reduce `ef_construction`: Use 64 instead of 100
3. Remove embeddings from low-value entities
4. Partition by entity_type to reduce index scope

---

## Next Steps

1. **Run Migration:** `psql -f sql/migrate-to-knowledge-graph.sql`
2. **Test Integration:** Add MCP tools for entity/relationship management
3. **Extract Entities:** Implement NER (Named Entity Recognition) on existing reports
4. **Build Dashboard:** Visualize knowledge graph with D3.js or Cytoscape
5. **Enable Real-Time Updates:** Trigger entity extraction on new reports via hooks

---

**Questions?** Refer to the inline SQL comments in `knowledge-graph-schema.sql` or consult the PostgreSQL/pgvector documentation.
