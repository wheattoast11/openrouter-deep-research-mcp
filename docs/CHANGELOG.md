# Changelog

## v1.7.0 — 2025-12-03

### Model-Aware Adaptive Tokens
- **Dynamic Token Limits:** Replaced hard-coded `max_tokens: 4000` with model-aware adaptive calculation
- **OpenRouter Catalog Integration:** Queries model capabilities to set appropriate token limits per model
- **Truncation Detection:** Added `detectTruncation()` to warn when API responses appear cut off mid-sentence
- **Configurable Limits:** New env vars `SYNTHESIS_MIN_TOKENS`, `SYNTHESIS_MAX_TOKENS`, `TOKENS_PER_SUBQUERY`, `TOKENS_PER_DOC`

### Recursive Tool Execution
- **Tool Chaining:** New `chain` action in agent tool for multi-step execution in single call
- **Depth Limiting:** `MAX_TOOL_DEPTH=3` (default) prevents infinite loops; set to 0 to disable
- **Route-to-Tool:** Internal `routeToTool()` function for programmatic tool invocation with depth tracking

### Claude Code Integration
- **One-Liner Setup:** `claude mcp add openrouter-agents -- npx @terminals-tech/openrouter-agents --stdio`
- **Interactive Setup:** `npx @terminals-tech/openrouter-agents --setup-claude` copies slash commands and hooks
- **Portable Config:** `.mcp.json` uses `npx` for team-shareable configuration
- **Slash Commands:** `/mcp-status`, `/mcp-research`, `/mcp-async-research`, `/mcp-search`, `/mcp-query`
- **LLM Guide:** `CLAUDE.md` provides comprehensive tool patterns and best practices

### Documentation
- **CLAUDE.md:** Complete LLM integration guide with quick reference, workflows, and troubleshooting
- **TOOL-PATTERNS.md:** Detailed tool patterns, parameter normalization, and error recovery
- **.claude/README.md:** Documentation for slash commands, hooks, and settings
- **README.md:** Added Claude Code Integration section with setup instructions

### Infrastructure
- **postinstall.js:** Minimal script showing setup command after npm install
- **setup-claude-code.js:** Interactive script to configure Claude Code integration
- **--setup-claude flag:** Run setup directly via `npx @terminals-tech/openrouter-agents --setup-claude`

## v1.6.0 — 2025-11-12
- **MCP SDK Update:** Upgraded @modelcontextprotocol/sdk from 1.17.4 to 1.21.1 for full compatibility with MCP Specification 2025-06-18
- **November 2025 MCP Spec Readiness:**
  - Added `/.well-known/mcp-server` endpoint for server discovery (Nov 2025 draft spec)
  - Implemented extension metadata for async-operations, knowledge-base, and multi-agent capabilities
  - Added `/health` endpoint for production monitoring (no auth required)
  - Documented transport types, endpoints, and capabilities for client discovery
- **Production Hardening:**
  - Added rate limiting middleware (100 requests/minute per IP) to prevent abuse
  - Implemented 10MB request size limits for security
  - Enhanced security headers with `RateLimit-*` headers
- **Documentation:**
  - Added comprehensive MCP Compliance Report (100% spec compliance score)
  - Removed stale duplicate files (implementation-plan.md, mece-analysis.md, qa-summary-report.md)
  - Updated all documentation with current dates and versions (2025-11-12)
  - Cleaned up README to reflect current features and remove outdated August references
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
