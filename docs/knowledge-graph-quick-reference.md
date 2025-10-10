# Knowledge Graph Quick Reference

## Schema Summary

### Core Tables

| Table | Purpose | Key Columns | Indexes |
|-------|---------|-------------|---------|
| **entities** | Main entity storage | id, entity_type, name, canonical_name, embedding (384-dim), degree, pagerank | HNSW (embedding), B-tree (type, canonical_name), GIN (properties) |
| **relationships** | Directed weighted edges | source_id, target_id, relationship_type, weight, confidence | B-tree (source_id, target_id), GIN (properties) |
| **entity_types** | Type ontology | type_name, parent_type_id, properties_schema | B-tree (parent_type_id) |
| **relationship_types** | Relationship ontology | type_name, inverse_type_name, is_symmetric | B-tree (source/target entity types) |

### Materialized Views

| View | Purpose | Refresh Frequency |
|------|---------|-------------------|
| **entity_degree_summary** | Precomputed degree counts | Hourly |
| **relationship_type_stats** | Relationship distribution | Daily |

---

## HNSW Index Parameters

```sql
CREATE INDEX idx_entities_embedding
  ON entities
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 24, ef_construction = 100);
```

| Parameter | Value | Purpose |
|-----------|-------|---------|
| **m** | 24 | Max edges per node (higher = better recall for 384-dim) |
| **ef_construction** | 100 | Build queue size (higher = better quality, slower build) |
| **ef_search** | 40 (runtime) | Query queue size: `SET hnsw.ef_search = 40;` |

**Tuning Guide:**
- **Low recall (<90%):** Increase ef_search to 60-80
- **Slow queries (>500ms):** Decrease ef_search to 20-30
- **Large index (>5GB):** Lower m to 16 or 12
- **Slow inserts (>1s):** Lower ef_construction to 64

---

## Common Queries

### 1. Create Entity
```sql
INSERT INTO entities (entity_type, name, canonical_name, embedding, source_type, source_id)
VALUES (
  'organization',
  'OpenAI',
  'openai',
  '[0.12, -0.34, ...]'::vector,
  'manual',
  'user_input'
)
ON CONFLICT (entity_type, canonical_name) DO UPDATE
SET updated_at = CURRENT_TIMESTAMP
RETURNING id;
```

### 2. Create Relationship
```sql
INSERT INTO relationships (source_id, target_id, relationship_type, weight, confidence)
VALUES (123, 456, 'created_by', 1.0, 0.9)
ON CONFLICT (source_id, target_id, relationship_type) DO UPDATE
SET weight = EXCLUDED.weight;
```

### 3. Semantic Search
```sql
SELECT
  id,
  name,
  entity_type,
  (1 - (embedding <=> $1::vector))::REAL AS similarity
FROM entities
WHERE embedding IS NOT NULL
  AND (1 - (embedding <=> $1::vector)) >= 0.7
ORDER BY embedding <=> $1::vector
LIMIT 20;
```

### 4. Find Descendants (Recursive CTE)
```sql
WITH RECURSIVE descendants AS (
  SELECT r.target_id AS descendant_id, 1 AS depth, ARRAY[123, r.target_id] AS path
  FROM relationships r WHERE r.source_id = 123
  UNION
  SELECT r.target_id, d.depth + 1, d.path || r.target_id
  FROM relationships r
  JOIN descendants d ON r.source_id = d.descendant_id
  WHERE d.depth < 5 AND NOT (r.target_id = ANY(d.path))
)
SELECT d.descendant_id, d.depth, e.name
FROM descendants d
JOIN entities e ON e.id = d.descendant_id
ORDER BY d.depth, e.name;
```

### 5. Shortest Path (BFS)
```sql
WITH RECURSIVE paths AS (
  SELECT ARRAY[123, r.target_id] AS path, 1 AS length
  FROM relationships r WHERE r.source_id = 123
  UNION
  SELECT p.path || r.target_id, p.length + 1
  FROM relationships r
  JOIN paths p ON r.source_id = p.path[array_length(p.path, 1)]
  WHERE p.length < 6 AND NOT (r.target_id = ANY(p.path))
    AND NOT EXISTS (SELECT 1 FROM paths WHERE path[array_length(path, 1)] = 456)
)
SELECT path, length FROM paths WHERE path[array_length(path, 1)] = 456
ORDER BY length LIMIT 1;
```

### 6. Top Entities by PageRank
```sql
SELECT name, entity_type, pagerank, degree
FROM entities
WHERE pagerank > 0
ORDER BY pagerank DESC, degree DESC
LIMIT 10;
```

### 7. Entity Neighborhood (1-hop)
```sql
SELECT
  e2.id,
  e2.name,
  r.relationship_type,
  r.weight,
  'outgoing' AS direction
FROM relationships r
JOIN entities e2 ON r.target_id = e2.id
WHERE r.source_id = 123
UNION ALL
SELECT
  e1.id,
  e1.name,
  r.relationship_type,
  r.weight,
  'incoming' AS direction
FROM relationships r
JOIN entities e1 ON r.source_id = e1.id
WHERE r.target_id = 123;
```

---

## Helper Functions

### get_descendants(entity_id, max_depth)
```sql
SELECT * FROM get_descendants(123, 3);
-- Returns: descendant_id, path_length, path[]
```

### get_ancestors(entity_id, max_depth)
```sql
SELECT * FROM get_ancestors(456, 3);
-- Returns: ancestor_id, path_length, path[]
```

### find_shortest_path(start_id, end_id, max_depth)
```sql
SELECT * FROM find_shortest_path(123, 456, 6);
-- Returns: path[], path_length
```

### search_entities_by_embedding(query_vec, min_similarity, limit)
```sql
SELECT * FROM search_entities_by_embedding('[0.1, 0.2, ...]'::vector, 0.7, 20);
-- Returns: entity_id, entity_name, entity_type, similarity, properties
```

### compute_pagerank(damping, max_iter, threshold)
```sql
SELECT compute_pagerank(0.85, 20, 0.0001);
-- Updates entities.pagerank column
```

### refresh_graph_metrics()
```sql
SELECT refresh_graph_metrics();
-- Refreshes entity_degree_summary and relationship_type_stats
```

### maintain_knowledge_graph()
```sql
SELECT maintain_knowledge_graph();
-- Runs VACUUM, REINDEX, and refreshes views
```

---

## JavaScript Integration (dbClient.js)

### Create Entity
```javascript
const embedding = await dbClient.generateEmbedding("OpenAI is an AI research company");
const entityId = await dbClient.createEntity({
  entityType: 'organization',
  name: 'OpenAI',
  embedding,
  sourceType: 'manual',
  sourceId: 'user_input',
  properties: { founded: '2015', category: 'AI' },
  confidence: 1.0
});
```

### Create Relationship
```javascript
await dbClient.createRelationship({
  sourceId: 123,
  targetId: 456,
  relationshipType: 'created_by',
  weight: 1.0,
  confidence: 0.9,
  evidence: 'Mentioned in article X',
  extractedBy: 'ner_agent'
});
```

### Semantic Search
```javascript
const queryEmbedding = await dbClient.generateEmbedding("AI companies");
const results = await dbClient.searchEntitiesByEmbedding(queryEmbedding, 20, 0.7);
// [{ id: 123, name: "OpenAI", similarity: 0.89, ... }]
```

### Graph Traversal
```javascript
const descendants = await dbClient.getDescendants(123, 3);
const ancestors = await dbClient.getAncestors(456, 3);
const path = await dbClient.findShortestPath(123, 456, 6);
```

---

## Performance Cheat Sheet

### Expected Query Times (100k entities)

| Operation | Time | Optimization |
|-----------|------|--------------|
| Entity by ID | < 1ms | Indexed |
| Canonical name lookup | < 10ms | B-tree index |
| Vector search (top 20) | < 200ms | HNSW, tune ef_search |
| 1-hop traversal | < 20ms | Indexed source_id |
| 3-hop path | < 500ms | Use max_depth limit |
| PageRank compute | 30-60s | Run off-peak |
| Materialized refresh | 10-30s | Concurrent refresh |

### Memory Estimates (100k entities)

| Component | Size |
|-----------|------|
| Entity data | ~100 MB |
| HNSW index | ~500 MB |
| B-tree indexes | ~100 MB |
| Relationships | ~50 MB |
| **Total** | **~750 MB** |

---

## Maintenance Schedule

### Daily
- `SELECT refresh_graph_metrics();` (2 AM)
- `SELECT compute_pagerank();` (3 AM)

### Weekly
- `VACUUM ANALYZE entities, relationships;`

### Monthly
- `REINDEX TABLE entities;`
- `REINDEX TABLE relationships;`

### Quarterly
- Full backup verification
- Index parameter tuning
- Capacity planning review

---

## Built-in Entity Types

- `person` - Human entities
- `organization` - Companies, institutions
- `location` - Places
- `event` - Temporal occurrences
- `concept` - Abstract ideas
- `document` - Artifacts
- `product` - Products
- `technology` - Technical systems

## Built-in Relationship Types

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

---

## Troubleshooting

### No vector search results
1. Check embeddings: `SELECT COUNT(embedding) FROM entities;`
2. Lower threshold: Use 0.5 instead of 0.7
3. Rebuild index: `REINDEX INDEX idx_entities_embedding;`

### Slow PageRank
1. Reduce iterations: `compute_pagerank(0.85, 10, 0.001)`
2. Limit to subgraph
3. Run during off-peak

### Large index size
1. Lower `m` to 16: `CREATE INDEX ... WITH (m = 16)`
2. Partition by entity_type
3. Archive old entities

---

## Migration Commands

### Run Full Migration
```bash
psql -f sql/knowledge-graph-schema.sql
psql -f sql/migrate-to-knowledge-graph.sql
```

### Rollback (if needed)
```sql
SELECT rollback_sql FROM schema_migrations WHERE version = '1.0.0-knowledge-graph';
-- Copy and execute the rollback SQL
```

---

## Scaling Thresholds

| Entity Count | Strategy |
|--------------|----------|
| < 100k | Single table (current) |
| 100k - 1M | Partition by entity_type |
| > 1M | Shard or migrate to specialized DB |

---

**Quick Start:**
1. Run migration: `psql -f sql/migrate-to-knowledge-graph.sql`
2. Test: `SELECT * FROM entities LIMIT 5;`
3. Create entity: Use JavaScript helper or SQL INSERT
4. Search: `SELECT * FROM search_entities_by_embedding(...);`

**Full Documentation:** See `docs/knowledge-graph-design.md`
