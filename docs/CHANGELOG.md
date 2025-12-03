# Changelog

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
