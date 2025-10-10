# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2025-10-08

### ✅ Local-First Architecture - Production Ready
- **Embeddings Pipeline**: @xenova/transformers v2.17.2 (384D, works on all platforms including Windows)
- **PGlite + pgvector**: Validated persistent vector storage with semantic similarity search
- **Mock Layer Removed**: Simplified architecture—no fake LLM responses, requires real OpenRouter API key
- **MCP Protocol Compliance**: Full WebSocket transport, tool registry, streaming, and cancellation validated
- **Security Hardened**: OAuth/JWKS, rate limiting, Zod validation, and fault injection testing completed

### 🚀 Key Improvements
- **Stateless Architecture**: Fully asynchronous with PGlite persistence for scalability
- **Unified Agent Tool**: Single `agent` entry point for all research operations
- **Local Embeddings**: No external API calls for vector generation (384D sentence transformers)
- **Idempotency & Reliability**: Race condition handling and duplicate prevention implemented
- **Windows Compatibility**: Resolved sharp binary issues by using @xenova/transformers v2

### 📋 Research & Documentation
- `docs/research/pglite-patterns.md` - PGlite + pgvector best practices and architecture validation
- `docs/research/agent-mode-fix-summary.md` - Root cause analysis and fixes for agent mode
- `docs/qa/openrouter-agents-v21-qa-report.md` - Comprehensive QA analysis
- `docs/qa/openrouter-agents-v21-fixes-required.md` - Actionable fixes for identified issues

### 🎯 Production Requirements
- **OpenRouter API Key**: Required in `.env` for planning/research/synthesis LLM calls
- **Embeddings**: Work locally with no external dependencies
- **Testing**: Use `tests/test-embeddings-pglite.js` to validate local stack; agent tests require API key

## [2.0.0] - 2025-10-07

### 🚀 Added - Major New Features

#### Bidirectional Communication
- WebSocket transport at `/mcp/ws` for real-time, two-way communication
- New module: `src/server/wsTransport.js`
- Client can send steering commands: `agent.steer`, `agent.provide_context`
- Agent sends proactive events: `agent.thinking`, `agent.status_update`, `agent.proactive_suggestion`

#### Temporal Awareness
- Cron-based scheduling system for proactive agent actions
- New module: `src/utils/temporalAgent.js`
- New tools: `schedule_action`, `list_schedules`, `cancel_schedule`
- Supports research, briefing, and monitoring action types
- Proactive notifications via WebSocket when schedules trigger

#### Universal Knowledge Graph
- Persistent graph-based memory system
- New module: `src/utils/graphManager.js`
- Database tables: `graph_nodes` (entities), `graph_edges` (relationships)
- Automatic entity extraction from all research reports
- New tool: `query_graph` for entity-relationship exploration
- 768D vector embeddings for semantic node similarity

#### Unified Retrieval
- Enhanced `retrieve` tool now queries: Knowledge graph + Vector store + BM25
- Returns synthesized response with both graph context and search results
- Multi-source fusion for comprehensive answers

#### "Magic" Workflow Prompts
- `summarize_and_learn`: Fetch → Research → Extract to graph (automated pipeline)
- `daily_briefing`: KB summary + scheduled actions overview
- `continuous_query`: Monitor topic with cron, proactive notifications

#### MCP Resource Subscriptions
- Full implementation of `subscribe` and `unsubscribe` handlers
- New resources: `mcp://agent/status`, `mcp://knowledge_base/updates`, `mcp://temporal/schedule`
- Event-driven architecture for reactive client UIs

#### Client Add-On
- Optional minimalist UI in `client/` directory
- React + Vite + Tailwind with Terminals.tech aesthetic
- Real-time event stream, knowledge graph visualization, agent steering
- Collapsible overlay design for embedding in other apps

### 🔧 Changed

- **Default Mode**: `MODE=AGENT` (was `ALL`) - unified agent interface by default
- **Always-On Tools**: Added `schedule_action`, `list_schedules`, `cancel_schedule`, `query_graph`, `list_models`
- **Tool Exposure**: Temporal and graph tools available in AGENT mode
- **Auto-extraction**: Research reports automatically populate knowledge graph (configurable)
- **Version**: Bumped to 2.0.0 reflecting major architectural evolution

### 🐛 Fixed

- Job status returning "not found" for valid job IDs
- `async: false` parameter being ignored (jobs always queued)
- Idempotency keys being identical across distinct requests
- Embedder status showing `provider`/`model` as `null`
- `executeQuery` not exported causing `/metrics` endpoint errors
- `isEmbedderReady` returning function instead of boolean

### 📚 Documentation

#### Added
- `docs/MIGRATION-v2.0.md` - Comprehensive migration guide
- `docs/v2.0-ARCHITECTURE.md` - System design and patterns
- `docs/v2.0-USER-JOURNEYS.md` - Progressive usage examples
- `docs/CHANGELOG-v2.0.md` - Detailed technical changelog
- `docs/QUICKSTART-v2.0.md` - 5-minute quick start guide
- `docs/RELEASE-v2.0.0.md` - Release notes
- `client/README.md` - UI add-on documentation

#### Updated
- `README.md` - Complete rewrite highlighting agentic capabilities
- `CLAUDE.md` - Added v2.0 section, new file locations, updated commands
- `package.json` - Version, description, new dependencies

### 🏗️ Infrastructure

- Added `ws` (8.18.3) for WebSocket support
- Added `node-cron` (4.2.1) for temporal scheduling
- Database schema extended with graph tables and indexes
- WebSocket server integrated with Express HTTP server
- Temporal agent integrated with job worker pool

## [1.6.0] - 2025-10-01

### Added
- Idempotent job submission with duplicate detection
- Dual embeddings support (primary + alternative provider)
- Enhanced security: SSRF protection, secret redaction, SQL injection guards
- @terminals-tech package integrations (embeddings, graph, core)
- Streamable HTTP transport (MCP spec 2025-06-18)
- 13 comprehensive test suites

### Changed
- Default embeddings: gemini-embedding-001 (768D) with HuggingFace fallback
- Enhanced observability: rich metrics, AIMD visibility, cache stats

### Fixed
- Embeddings adapter graceful fallback
- Vector dimension migration handling
- Job lease expiration logic

## [1.5.1] - 2025-09-20

### Added
- Research follow-up tool for iterative refinement
- Model catalog with dynamic OpenRouter model discovery
- Advanced caching with semantic similarity

### Changed
- Improved ensemble model selection
- Enhanced error handling and retry logic

## [1.5.0] - 2025-09-10

### Added
- Multimodal research support (images, documents, structured data)
- Domain-specific model routing
- Complexity-based iteration control

## Earlier Versions

See `docs/CHANGELOG.md` for complete history.

---

## Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes to public API
- **MINOR** (x.X.0): New features, backward compatible
- **PATCH** (x.x.X): Bug fixes, backward compatible

v2.0.0 is a MAJOR version due to significant new capabilities, but maintains **full backward compatibility** with v1.6.

## Upgrade Recommendations

- **From v1.6**: ✅ Direct upgrade, no code changes required
- **From v1.5**: ✅ Upgrade to v1.6 first, then to v2.0
- **From v1.4 or earlier**: Review migration guides for intermediate versions

## Support Policy

- **Latest major version** (v2.x): Full support, active development
- **Previous major version** (v1.x): Security fixes only, 6 months
- **Older versions**: Community support only

---

For detailed technical changes, see individual release documentation in `docs/`.

