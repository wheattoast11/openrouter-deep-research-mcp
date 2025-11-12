# Changelog

## v1.6.0 — 2025-11-12
- **MCP SDK Update:** Upgraded @modelcontextprotocol/sdk from 1.17.4 to 1.21.1 for full compatibility with MCP Specification 2025-06-18
- **Production Hardening:**
  - Added rate limiting middleware (100 requests/minute per IP) to prevent abuse
  - Implemented 10MB request size limits for security
  - Enhanced security headers with `RateLimit-*` headers
- **Documentation:** Removed stale duplicate files; updated all documentation with current dates and versions
- **Compliance:** Full compliance with MCP Specification 2025-06-18 (OAuth, enhanced security, interactive workflows)

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
