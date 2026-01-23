# PGlite Extensions & Architectural Enhancements

This document outlines the database extensions and architectural improvements implemented to enhance the performance, scalability, and multi-agent capabilities of the OpenRouter Deep Research MCP.

## Requirements

- **PGlite Version:** `^0.3.14` (upgraded from 0.2.x for full extension support)

## Database Extensions (16 Total)

### First-Class Extensions

These extensions have dedicated module exports in PGlite 0.3.x:

#### 1. `vector` (Vector Similarity Search)
- **Use Case:** Semantic search across research reports.
- **Capabilities:** Provides `vector` type with cosine/L2 distance operators and HNSW indexing.
- **Import:** `@electric-sql/pglite/vector`

#### 2. `live` (Reactive Queries)
- **Use Case:** Real-time UI updates and agent notifications.
- **Capabilities:** Enables reactive query subscriptions that push updates on data changes.
- **Import:** `@electric-sql/pglite/live`

#### 3. `pgtap` (Database Testing)
- **Use Case:** Unit testing database logic and extension availability.
- **Capabilities:** Comprehensive TAP-compliant testing framework for PostgreSQL.
- **Import:** `@electric-sql/pglite/pgtap`

#### 4. `pg_uuidv7` (Modern UUID Generation)
- **Use Case:** Time-ordered unique identifiers.
- **Capabilities:** Generates UUIDs that are naturally sortable by creation time, improving index performance.
- **Import:** `@electric-sql/pglite/pg_uuidv7`

#### 5. `pg_ivm` (Incremental Materialized Views)
- **Use Case:** Pre-computed aggregations and analytics.
- **Capabilities:** Maintains materialized views incrementally without full refresh.
- **Import:** `@electric-sql/pglite/pg_ivm`

### Contrib Extensions

These extensions are imported from the contrib directory:

#### 6. `bloom` (Probabilistic Filters)
- **Use Case:** Optimizing knowledge base search.
- **Capabilities:** Provides space-efficient set membership tests, reducing false positives during index lookups.
- **Import:** `@electric-sql/pglite/contrib/bloom`

#### 7. `cube` (Multi-dimensional Indexing)
- **Use Case:** Multi-dimensional research report analysis and agent affinity.
- **Capabilities:** Enables OLAP-style operations and multi-dimensional distance calculations.
- **Import:** `@electric-sql/pglite/contrib/cube`

#### 8. `seg` (Geometric Parallelism Tracking)
- **Use Case:** Measuring agent execution overlap and identifying divergence.
- **Capabilities:** Tracks temporal segments of agent activity to detect parallelism anomalies.
- **Import:** `@electric-sql/pglite/contrib/seg`

#### 9. `tcn` (Triggered Change Notifications)
- **Use Case:** Universal event emission system.
- **Capabilities:** Automatically triggers notifications on table changes (INSERT/UPDATE/DELETE).
- **Import:** `@electric-sql/pglite/contrib/tcn`

#### 10. `tsm_system_time` (Temporal Queries)
- **Use Case:** Efficient session time-travel and temporal sampling.
- **Capabilities:** Allows sampling table data at specific points in time.
- **Import:** `@electric-sql/pglite/contrib/tsm_system_time`

#### 11. `ltree` (Hierarchical Data)
- **Use Case:** Path-based hierarchical routing and topic taxonomy.
- **Capabilities:** Provides `ltree` type for tree-like hierarchies with powerful matching operators.
- **Import:** `@electric-sql/pglite/contrib/ltree`

#### 12. `lo` (Large Objects)
- **Use Case:** Storing binary data like images and multimodal inputs.
- **Capabilities:** Server-side large object management for BLOBs.
- **Import:** `@electric-sql/pglite/contrib/lo`

#### 13. `tablefunc` (Pivot Tables and Crosstabs)
- **Use Case:** Tabular data transformation and reporting.
- **Capabilities:** Provides `crosstab()`, `normal_rand()`, and other table-returning functions.
- **Import:** `@electric-sql/pglite/contrib/tablefunc`

#### 14. `uuid-ossp` (UUID Generation)
- **Use Case:** Generating unique identifiers.
- **Capabilities:** Provides `uuid_generate_v1()`, `uuid_generate_v4()`, and other UUID functions.
- **Import:** `@electric-sql/pglite/contrib/uuid_ossp`

#### 15. `fuzzystrmatch` (Fuzzy String Matching)
- **Use Case:** Typo-tolerant search and entity resolution.
- **Capabilities:** Provides `soundex()`, `levenshtein()`, `metaphone()`, and `dmetaphone()` functions.
- **Import:** `@electric-sql/pglite/contrib/fuzzystrmatch`

#### 16. `citext` (Case-Insensitive Text)
- **Use Case:** Case-insensitive searching and indexing.
- **Capabilities:** Provides `citext` type that behaves like `text` but with case-insensitive comparisons.
- **Import:** `@electric-sql/pglite/contrib/citext`

#### 17. `hstore` (Key-Value Store)
- **Use Case:** Flexible metadata storage.
- **Capabilities:** Provides `hstore` type for storing key-value pairs within a single column.
- **Import:** `@electric-sql/pglite/contrib/hstore`

---

## Architectural Enhancements

### 1. Payload Optimization System
- **Compression:** Implemented gzip/brotli compression for large report payloads (>50KB) to reduce network overhead.
- **Reference Strategy:** Support for `outputFormat: 'reference'`, returning only the report ID and a preview for extremely large results.
- **Chunked Streaming:** Large payloads are broken into 4KB chunks for real-time progress notifications, preventing SSE buffer overflows.

### 2. Event-Driven Agent Awareness
- **Universal Fan-in:** TCN triggers on `research_reports` and `jobs` tables feed into a central notification bus.
- **Notification Routing:** Change notifications are automatically routed to relevant subsystems.

### 3. Hierarchical Topic Taxonomy
- **`ltree` Integration:** Uses the `ltree` extension for path-based hierarchical routing.
- **Hierarchical Routing:** Agents can subscribe to specific topic paths (e.g., `research.technical.*`) for more targeted coordination.

### 4. Multimodal Storage Layer
- **`lo` Extension:** Now available in PGlite 0.3.14+ for native large object support.
- **BYTEA Fallback:** Custom storage layer using `BYTEA` handles binary data when `lo` is not preferred.
- **Metadata Tracking:** Full support for MIME types, file names, and report associations.

### 5. Sticky Clustering
- **Natural Memory:** Agents naturally cluster based on communication patterns recorded in the `agent_communication_graph`.
- **Cube-based Affinity:** Multi-dimensional distance calculations identify tightly connected agent groups for intelligent task allocation.

### 6. Temporal Replay System
- **Convergence Analysis:** Replays emergence paths using temporal sampling.
- **Stability Metrics:** Analyzes early vs. late convergence indicators to improve ensemble research quality.

---

## Configuration

New configuration options are available in `config.js`:

```javascript
config.payload = {
  compressionEnabled: true,
  compressionFormat: 'gzip', // 'gzip' | 'brotli' | 'none'
  compressionThreshold: 50000,
  referenceThreshold: 100000
};

config.database.extensions = {
  bloom: { enabled: true },
  cube: { enabled: true },
  pgtap: { enabled: true },
  pg_uuidv7: { enabled: true },
  pg_ivm: { enabled: true },
  // ... other extensions
};
```

## Migration Guide

If you are upgrading from a version prior to 1.9.2:

1. **Update Dependency:** Run `npm install @electric-sql/pglite@latest` to get version 0.3.14+.
2. **Automatic Migration:** PGlite will automatically create the missing extensions on startup.
3. **Storage Upgrade:** If using file-based storage, the first boot may take longer due to migrations.
4. **Verify Extensions:** Run `node tests/database/extensions.test.js` to verify all 16 extensions are working.

## Extension Test Results

All 28 extension verification tests pass with PGlite 0.3.14:

```
✓ vector: vector type works
✓ vector: cosine distance operator
✓ pgtap: plan() function
✓ pg_uuidv7: generates v7 UUIDs
✓ pg_ivm: create_immv function available
✓ cube: cube type works
✓ seg: seg type works
✓ ltree: ltree type works
✓ tcn: notification function exists
✓ lo: lo_create function
✓ tablefunc: normal_rand function
✓ uuid-ossp: uuid_generate_v4 function
✓ fuzzystrmatch: soundex function
✓ citext: case-insensitive comparison
✓ hstore: hstore type works
...and 13 more
```
