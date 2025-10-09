# Changelog

## v2.1.1-beta — 2025-10-09

- PLL-governed streaming loop with EMA loop filter, `PLL_ENABLE` defaults, and final metrics fan-out on WebSocket transport
- Compression and idempotency defaults surfaced through `.env` and `config.js` with intuitive names
- Dockerfile targets Node 20 Alpine, uses `npm ci --omit=dev`, sets production defaults, and powers the published `terminals/openrouter-agents:2.1.1-beta` image
- Version bumped to `2.1.1-beta` for coordinated beta release cadence
- Streaming contract tests now consume MCP SDK CJS bundles directly for Node 20 compatibility
- README highlights PLL/compression guidance, Docker image usage, and env variable defaults

## v1.6.0 — 2025-10-07

**Production Hardening Release**

### Testing & Quality Assurance
- **Comprehensive test matrix**: STDIO + Streamable HTTP transports, OAuth2 resource server flows (JWT positive/negative), MODE-based tool exposure validation.
- **Streaming contract tests**: Validates progress event ordering, backpressure handling, and error propagation.
- **Performance benchmarking**: p50/p95/p99 latency measurements for `list_tools`, `ping`, and `agent` across transports.
- **Idempotency & lease tests**: Lease acquisition/heartbeat/timeout reclaim, crash recovery, and idempotent job submission.
- **Cache invariants**: Exact-match, semantic similarity, and invalidation correctness.
- **Model routing validation**: Cost-tier selection, domain matching, and fallback chains.
- **Fault injection**: DB transient failures, provider timeouts, 429 rate limits.
- **Resource/prompt subscriptions**: `listChanged` and subscribe/unsubscribe flows.
- **Webcontainer integration**: Minimal-env startup tests simulating terminals.tech `/zero`.
- **Security hardening tests**: SSRF blocking, secret/PII redaction, SQL injection guards.

### Embeddings & Evaluation
- **Dual-embedding mode** (`EMBEDDINGS_DUAL_ENABLED=true`): Generate primary + alternate vectors for A/B comparison.
- **Fusion scoring**: Weighted combination of primary/alt vectors in hybrid search.
- **Schema migrations**: Added `query_embedding_alt`, `embedding_alt_provider`, `embedding_alt_model`, `embedding_alt_dimension` to `reports` and `index_documents`.
- **Evaluation table**: `embedding_eval` stores cosine similarity and ranking deltas.
- **Embeddings adapter refactor**: Pluggable provider pattern with performance instrumentation.

### Security
- **SSRF protection**: `validateUrlForFetch()` blocks localhost, private IPs (10.x, 192.168.x, 169.254.x), cloud metadata endpoints.
- **Secret redaction**: `redactSecrets()` sanitizes API keys, bearer tokens, and auth headers in logs.
- **PII redaction**: `redactPII()` masks email, SSN, and credit card patterns.
- **SQL validation**: `validateSqlQuery()` restricts to SELECT and blocks `pg_sleep`, `pg_read_file`, etc.
- Integrated into `robustWebScraper.fetchUrl()` and `openRouterClient` error logging.

### Observability
- **Enhanced `get_server_status`**: Returns embedder provider/model, advanced cache stats, AIMD concurrency, transport config, and MODE.
- **Cache metrics tracking**: Exact hits, semantic hits, misses, store count, and auto-pruning with 5-min throttle.
- **Planning agent AIMD visibility**: `currentConcurrency` and `maxConcurrency` exposed via status tool.

### CI/CD
- **GitHub Actions workflow** (`.github/workflows/ci-matrix.yml`): Tests across Ubuntu/Windows/macOS × Node 18/20.
- **Automated QA report**: `npm run qa:report` generates `docs/qa-automated-report.md` from all test suites.
- **Test suite runner**: `npm run test:suite` executes critical tests (matrix, streaming, OAuth, lease, cache, security).

### Scripts & Tooling
- **QA automation**: `scripts/generate-qa-report.js` aggregates results and flags critical failures.
- **New npm scripts**: `test:matrix`, `test:streaming`, `test:oauth`, `test:dual-embed`, `test:perf`, `test:lease`, `test:cache`, `test:routing`, `test:zod`, `test:resources`, `test:fault`, `test:security`, `test:webcontainer`.

### Migrations
- **SQL migrations**: Auto-discovery and application from `sql/migrations/` directory via `dbMigrations.applySqlMigrations()`.
- **Alternate embeddings schema**: `20241007_add_alt_embeddings.sql` adds nullable alt-embedding columns with HNSW indexes.

### Module Exports
- **dbClient**: Added `getDbInstance()` and `executeWithRetry()` exports for advanced testing.
- **embeddingsAdapter**: Now accepts `{ provider }` option in `generateEmbedding()` and `generateEmbeddingsBatch()`.

### Bug Fixes
- Fixed embedder status reporting to reflect actual provider and model.
- Cache pruning now throttled to prevent excessive overhead.
- SSRF validation integrated before all external URL fetches.

## v1.5.0 — 2025-08-26
- Version parity: package.json, GitHub Releases, GitHub Packages, and npm aligned to 1.5.0
- Dual publish workflow: npmjs.org (public) and GitHub Packages (Packages tab visible)
- MODE clarified in README and install instructions to be added
- Going forward: patch bumps only (+0.0.1) to keep versions in lockstep across registries

## v1.3.2 — 2025-08-26
- New MODE env: `AGENT` | `MANUAL` | `ALL` (default). Always-on tools: `ping`, `get_server_status`, `job_status`, `get_job_status`, `cancel_job`.
  - AGENT: exposes always-on + `agent`
  - MANUAL: exposes always-on + individual tools (`research`, `retrieve`, `query`, etc.)
  - ALL: exposes everything
- New `agent` tool: single entrypoint that routes to research, follow_up, retrieve, and query.
- New `ping` tool: lightweight liveness and optional info.
- Async submit response now includes `ui_url` and `sse_url`; emits `ui_hint` job event for clients to auto-open micro-UI.
- Capability flags updated: prompts `listChanged`, resources `subscribe`/`listChanged`.
- Tool catalog and list/search filtered by MODE.
- Package version bump to 1.3.2; README updated with MODE quick-start.
- General cleanup: ensured docs align with current code; removed stale references.

## v1.2.0 — 2025-08-19

- Async jobs: `submit_research` (returns job_id), `get_job_status`, `cancel_job`; in‑process worker with leasing and SSE events
- Minimal micro UI at `/ui`: agent lanes, token streaming, usage chips; `/jobs` HTTP submission for testing
- Unified `search`: true BM25 + vectors across docs/reports, optional LLM rerank; document embeddings on index
- Token usage capture and aggregation across planning/agents/synthesis → persisted in `research_metadata.usage`; `/metrics` exposes usage totals
- New resources: `tool_patterns` (recipes) and `multimodal_examples`; tightened tool descriptions for LLM interpretability
- Packaging: bin `openrouter-agents` for `npx`/global use; README JSON configs for STDIO and HTTP/SSE; UPGRADE-NOTES updated
- Idempotent migrations: `jobs`, `job_events`, `index_documents.doc_len`, `index_documents.doc_embedding`, HNSW indexes where relevant

## v1.1.0 — 2025-08-09

- Per-connection HTTP/SSE routing with API‑key auth (multi‑client safe)
- Robust streaming via `eventsource-parser`
- Dynamic model catalog + `list_models` tool
- PGlite tarball backups (`backup_db`) and DB QoL tools (`export_reports`, `import_reports`, `db_health`, `reindex_vectors`)
- Lightweight web tools: `search_web`, `fetch_url`
- Orchestration: bounded parallelism (`PARALLELISM`), dynamic vision detection from catalog
- Model defaults: `anthropic/claude-sonnet-4`, `openai/gpt-5` family
- Repo cleanup: moved docs/ and tests/

For older changes, see repository history or Releases.
