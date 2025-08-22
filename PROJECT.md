# Project Overview

## Goals and Objectives
- Deliver a production-grade MCP server that orchestrates planning → parallel research → synthesis with strict citations, cost-aware routing, and streaming.
- Maintain compliance with the 2025-03-26 MCP specification for prompts, resources, and transport options.
- Provide a local knowledge base (PGLite + pgvector) with hybrid retrieval and optional LLM reranking.
- Optimize cost and performance through semantic and model-response caching plus bounded concurrency.
- Offer robust developer ergonomics: clear tools, prompts, resources, tests, and documentation.

## Milestones
- MCP Compliance and Transports
  - STDIO transport operational for IDE clients.
  - HTTP/SSE transport with auth and per-connection message routing.
- Research Orchestration
  - Planning Agent with XML sub-queries; AIMD concurrency controller; compact prompts.
  - Research Agent ensembles with dynamic model catalog and multimodal fallbacks.
  - Context Agent synthesis with citations and confidence; streaming via OpenRouter SSE.
- Knowledge Base & Indexer
  - PGLite schema (reports, jobs, index tables) and vector indexes (HNSW).
  - Hybrid indexer (BM25 + vectors), `index_*` tools, optional rerank via planning model.
- Async Jobs and Observability
  - `submit_research`, `get_job_status`, `cancel_job`, `/jobs/:id/events` SSE.
  - `/metrics` and `/ui` micro-UI for quick inspection.
- Documentation and Examples
  - README quick start, MCP client JSON, diagrams; `docs/` use cases and change logs.

## Project Guidelines
- Code
  - Use early returns, clear naming, and guardrails on external calls.
  - Avoid logging secrets; prefer concise, high-signal stderr logs.
  - Keep prompts compact; enforce explicit URL citations; mark unknowns `[Unverified]`.
- Protocol
  - Declare MCP capabilities explicitly; implement prompt/resource handlers per spec.
  - Prefer STDIO in IDE contexts; enable HTTP/SSE with auth for daemon mode.
- Data
  - Use parameterized SQL; default to SELECT-only in executable queries.
  - Enable vector and BM25 indexes conservatively; tune weights via config.
- Reliability
  - Use retry with exponential backoff and jitter for DB and network operations.
  - Implement resilience: in-memory DB fallback; adaptive thresholds; timeouts.

## Critical Callouts
- Security
  - HTTP mode requires bearer auth (JWT via JWKS preferred; `SERVER_API_KEY` fallback).
  - CORS restricted for MCP routes; DNS rebinding protection on streamable transport.
- Cost
  - Cache aggressively where safe (semantic + model response).
  - Route simple queries to very low/low-cost models; escalate for complex/vision.
- Compliance
  - MCP capabilities and handlers kept in `src/server/mcpServer.js`.
  - Prompts/resources must return stable shapes for client compatibility.
- Performance
  - Embedder warm-up may delay first vector operations; consider preheating.
  - Monitor job lease/heartbeat to avoid orphaned work; tune `jobs.*` settings.

## Progress Updates
- 2025-08-21
  - MCP prompts/resources verified; HTTP/SSE routing solid; job pipeline operational.
  - Hybrid indexer and DB maintenance tools usable in production workflows.
  - Research orchestration stabilized with ensembles and compact prompts.
- 2025-08-12
  - Branded diagrams, README upgrades, test scaffolds; MCP client JSON examples.
- 2025-08-09
  - v1.1→v1.2 changes: compact prompts, index tools, citations, planning fallbacks.

## Resources
- Code
  - Server: `src/server/mcpServer.js`, `src/server/tools.js`
  - Agents: `src/agents/planningAgent.js`, `src/agents/researchAgent.js`, `src/agents/contextAgent.js`
  - Utils: `src/utils/dbClient.js`, `src/utils/openRouterClient.js`, `src/utils/modelCatalog.js`, `src/utils/advancedCache.js`
- Docs
  - `README.md`, `docs/CHANGELOG.md`, `docs/USE_CASES.md`, diagrams under `docs/`
  - `PRODUCTION_UPDATES.md`, `FINAL_ANALYSIS.md`, `COMPREHENSIVE_SUMMARY.md`
- Tests
  - `tests/test-all-mcp-tools.js`, `tests/test-mcp-tools.js`, `tests/qa-test-suite.js`
- MCP Spec
  - `https://spec.modelcontextprotocol.io/specification/2025-03-26/`

