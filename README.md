[![Star on GitHub](https://img.shields.io/github/stars/wheattoast11/openrouter-deep-research-mcp?style=social)](https://github.com/wheattoast11/openrouter-deep-research-mcp)
# OpenRouter Agents MCP Server

A practical MCP server that turns your LLM into a research team. It plans, fans‑out, reads, and synthesizes—then stores results in a searchable local knowledge base.

- Killer features
  - Plan → parallelize → synthesize workflow with bounded parallelism
  - Dynamic model catalog; supports Anthropic Sonnet‑4 and OpenAI GPT‑5 family
  - Built‑in semantic KB (PGlite + pgvector) with backup, export/import, health, and reindex tools
  - Lightweight web helpers: quick search and page fetch for context
  - Robust streaming (SSE), per‑connection auth, clean logs

## What’s new (v1.2)
- Local hybrid indexer (BM25 + optional vector rerank) with MCP tools: `index_texts`, `index_url`, `search_index`.
- Auto‑indexing during research: every saved report and fetched page can be indexed on the fly.
- Prompt/resource registration (MCP): `planning_prompt`, `synthesis_prompt`, and `mcp_spec_links`.
- Compact prompts option: minimize tokens while enforcing explicit URL citations and confidence scoring.
- Planning model fallbacks and simplified routing per strategy.

[Changelog →](docs/CHANGELOG.md)

## Quick start
1) Prereqs
- Node 18+ (20 LTS recommended), npm, Git, OpenRouter API key

2) Install
```bash
npm install
```

3) Configure (.env)
```dotenv
OPENROUTER_API_KEY=your_openrouter_key
SERVER_API_KEY=your_http_transport_key
SERVER_PORT=3002

# Orchestration
ENSEMBLE_SIZE=2
PARALLELISM=4

# Models (override as needed)
PLANNING_MODEL=openai/gpt-5-chat
PLANNING_CANDIDATES=openai/gpt-5-chat,google/gemini-2.5-pro,anthropic/claude-sonnet-4
HIGH_COST_MODELS=openai/gpt-5-chat,google/gemini-2.5-pro,anthropic/claude-sonnet-4
LOW_COST_MODELS=openai/gpt-5-mini,google/gemini-2.5-flash,google/gemini-2.5-flash-lite
VERY_LOW_COST_MODELS=openai/gpt-5-nano

# Storage
PGLITE_DATA_DIR=./researchAgentDB
PGLITE_RELAXED_DURABILITY=true
REPORT_OUTPUT_PATH=./research_outputs/

# Indexer
INDEXER_ENABLED=true
INDEXER_AUTO_INDEX_REPORTS=true
INDEXER_AUTO_INDEX_FETCHED=true

# MCP features
MCP_ENABLE_PROMPTS=true
MCP_ENABLE_RESOURCES=true

# Prompt strategy
PROMPTS_COMPACT=true
PROMPTS_REQUIRE_URLS=true
PROMPTS_CONFIDENCE=true

```

4) Run
- STDIO (for Cursor/VS Code MCP):
```bash
node src/server/mcpServer.js --stdio
```
- HTTP/SSE (local daemon):
```bash
SERVER_API_KEY=$SERVER_API_KEY node src/server/mcpServer.js
```

## Tools (high‑value)
- Research: `conduct_research`, `research_follow_up`
- Knowledge base: `get_past_research`, `list_research_history`, `get_report_content`
- DB ops: `backup_db` (tar.gz), `export_reports`, `import_reports`, `db_health`, `reindex_vectors`
- Models: `list_models`
- Web: `search_web`, `fetch_url`
- Indexer (new): `index_texts`, `index_url`, `search_index`, `index_status`

Notes
- Data lives locally under `PGLITE_DATA_DIR` (default `./researchAgentDB`). Backups are tarballs in `./backups`.
- Use `list_models` to discover current provider capabilities and ids.

## Architecture at a glance
See `docs/diagram-architecture.mmd` (Mermaid). Render to SVG with Mermaid CLI if installed:
```bash
npx @mermaid-js/mermaid-cli -i docs/diagram-architecture.mmd -o docs/diagram-architecture.svg
```

How it differs from typical “agent chains”:
- Not just hardcoded handoffs; the plan is computed, then parallel agents search, then a synthesis step reasons over consensus, contradictions, and gaps.
- The system indexes what it reads during research, so subsequent queries get faster/smarter.
- Guardrails shape attention: explicit URL citations, [Unverified] labelling, and confidence scoring.

## Minimal‑token prompt strategy
- Compact mode strips preambles to essential constraints; everything else is inferred.
- Enforced rules: explicit URL citations, no guessing IDs/URLs, confidence labels.
- Short tool specs: use concise param names and rely on server defaults.

## Common user journeys
- “Give me an executive briefing on MCP status as of July 2025.”
  - Server plans sub‑queries, fetches authoritative sources, synthesizes with citations.
  - Indexed outputs make related follow‑ups faster.

- “Find vision‑capable models and route images gracefully.”
  - `/models` discovered and filtered, router template generated, fallback to text models.

- “Compare orchestration patterns for bounded parallelism.”
  - Pulls OTel/Airflow/Temporal docs, produces a MECE synthesis and code pointers.

## Cursor IDE usage
- Add this server in Cursor MCP settings pointing to `node src/server/mcpServer.js --stdio`.
- Use the new prompts (`planning_prompt`, `synthesis_prompt`) directly in Cursor to scaffold tasks.

## FAQ (quick glance)
- How does it avoid hallucinations?
  - Strict citation rules, [Unverified] labels, retrieval of past work, on‑the‑fly indexing.
- Can I disable features?
  - Yes, via env flags listed above.
- Does it support streaming?
  - Yes, SSE for HTTP; stdio for MCP.

## Command Map (quick reference)
- Start (stdio): `npm run stdio`
- Start (HTTP/SSE): `npm start`
- Generate examples: `npm run gen:examples`
- List models: MCP `list_models { refresh:false }`
- Research (compact): `conduct_research { q:"<query>", cost:"low", aud:"intermediate", fmt:"report", src:true }`
- Get past research: `get_past_research { query:"<query>", limit:5 }`
- Index URL (if enabled): `index_url { url:"https://..." }`
- Search index (if enabled): `search_index { query:"<q>", limit:10 }`
