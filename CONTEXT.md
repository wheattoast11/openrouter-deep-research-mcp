# Project Context

## Current State
- Enterprise-grade MCP server for multi-agent research is fully operational.
- Implements latest MCP prompts/resources handlers with capabilities declared in `src/server/mcpServer.js`.
- Supports STDIO (for IDE MCP clients) and HTTP/SSE transports with auth (`SERVER_API_KEY` or JWT scaffolding).
- Orchestrates planning → parallel research → synthesis with bounded concurrency and streaming progress.
- Knowledge base powered by PGLite + pgvector; optional hybrid indexer (BM25 + vectors) with tools for indexing and search.
- Dynamic model catalog integration and cost-aware routing; ensembles per sub-query.
- Multi-tier caching in place (semantic result + model response) for cost and latency reduction.
- Robust web helpers for quick search and URL fetch; optional multi-provider web search in `src/utils/robustWebScraper.js`.
- QA/utility scripts present under `tests/` for tool coverage and regression checks.

## Important Decisions
- MCP protocol adoption (2025-03-26 spec):
  - Capabilities: `prompts.listChanged`, `resources.subscribe`, `resources.listChanged`.
  - Handlers via `server.setPromptRequestHandlers` and `server.setResourceRequestHandlers`.
- Transport strategy:
  - STDIO for IDE-grade JSON-RPC; HTTP/SSE for daemonized streaming with per-connection routing (`/sse`, `/messages`).
  - Auth middleware prefers JWT (JWKS) when configured; falls back to `SERVER_API_KEY`.
- Persistence and retrieval:
  - PGLite with vector extension; adaptive retries and optional in-memory fallback for resilience (`src/utils/dbClient.js`).
  - Vector similarity + keyword fallback, and an opt-in hybrid indexer (BM25 + vectors) with rerank hooks.
- Research orchestration:
  - Planning agent generates XML-tagged sub-queries with verification-first bias and citations policy.
  - Research agent executes bounded-parallel ensemble calls with model routing and multimodal awareness.
  - Context agent synthesizes with strict URL citations and confidence annotations; streams output.
- Cost and performance:
  - Multi-tier caching (`src/utils/advancedCache.js`) + input normalization (`simpleTools`) reduce tokens and calls.
  - Ensemble size and parallelism configurable; AIMD controller in planning for graceful degradation.
- Security & logging:
  - Avoid logging secrets; robust stderr diagnostics; progress tokens used for fine-grained feedback.

## Ongoing Challenges
- External provider rate limits and transient API errors; continue improving backoff and retry heuristics.
- Web data variance: HTML structure differences and anti-bot defenses can degrade extraction reliability.
- Embedder cold-start time (Xenova all-MiniLM) may delay initial similarity search after fresh boots.
- Dynamic model catalog availability (network, provider schema variance) requires defensive parsing.
- Tuning vector thresholds and BM25 weights for diverse corpora; reranker costs vs. gains.

## Progress Tracking
- Completed
  - MCP prompts/resources per spec with working `planning_prompt`, `synthesis_prompt`, `research_workflow_prompt`.
  - Async jobs: `submit_research`, `get_job_status`, `cancel_job` with SSE job event streams.
  - Knowledge base: report persistence, vector similarity, list/retrieve/report tools.
  - Hybrid indexer (opt-in): `index_texts`, `index_url`, `search_index`, `index_status`.
  - Cost-aware routing and ensembles; multimodal fallbacks; compact prompts with strict citations.
  - Advanced caching and DB maintenance (`export_reports`, `import_reports`, `backup_db`, `reindex_vectors`).
- In verification/monitoring
  - Long-horizon stability under sustained load; rate-limit adaptation and backoff fine-tuning.
  - Additional coverage for edge inputs (very large docs/data, unusual MIME types, vision-heavy prompts).

## Team Insights
- Use `mcpExchange.progressToken` to stream granular progress/events; job worker mirrors these via `/jobs/:jobId/events`.
- Keep prompts compact; enforce explicit URL citations and mark unknowns as `[Unverified]` to curb hallucinations.
- Prefer official sources (specs, docs, release notes) in planning templates; reflect recency in synthesis.
- Use config to toggle features (indexer, compact prompts, transports) and to route by cost/complexity.

## Recent Developments
- MCP server enhancements and job pipeline:
  - 70e66a2: async job processing (submit/status/cancel), HTTPS/CORS/oauth scaffolding; README MCP client JSON.
  - 0e81d33: compact prompts/resources, hybrid index tools, strict citation prompts, planning fallbacks.
  - a8a18aa: 2025 upgrades—dynamic model catalog, ensembles + multimodal fallbacks, adaptive PGLite thresholds, HNSW tuning, AIMD planning, OpenRouter batching.
- Documentation & diagrams:
  - 3db0df1, 4ec7c65, 52960fc, 2177f77: Branded architecture + answer-crystallization diagrams; README updates.
- Reliability/UX fixes:
  - d469cea: classifier `max_tokens` raise to satisfy provider minimums.
- Notable bug fix (current code): ensured `onEvent` is threaded to `_executeSingleResearch` to prevent undefined reference.
- SDKs & deps: MCP SDK 1.4+ supported; installed runtime observed at 1.7.x; Xenova transformers v2.17.x.
- Timestamp: Updated on 2025-08-21.

