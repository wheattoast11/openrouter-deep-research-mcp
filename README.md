[![Star on GitHub](https://img.shields.io/github/stars/wheattoast11/openrouter-deep-research-mcp?style=social)](https://github.com/wheattoast11/openrouter-deep-research-mcp)
# OpenRouter Agents MCP Server

A practical MCP server that turns your LLM into a research team. It plans, fans‑out, reads, and synthesizes—then stores results in a searchable local knowledge base.

- Killer features
  - Plan → parallelize → synthesize workflow with bounded parallelism
  - Dynamic model catalog; supports Anthropic Sonnet‑4 and OpenAI GPT‑5 family
  - Built‑in semantic KB (PGlite + pgvector) with backup, export/import, health, and reindex tools
  - Lightweight web helpers: quick search and page fetch for context
  - Robust streaming (SSE), per‑connection auth, clean logs

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
PLANNING_MODEL=anthropic/claude-sonnet-4
HIGH_COST_MODELS=anthropic/claude-sonnet-4,openai/gpt-5,perplexity/sonar-deep-research
LOW_COST_MODELS=openai/gpt-5-mini,google/gemini-2.0-flash-001
VERY_LOW_COST_MODELS=openai/gpt-5-nano

# Storage
PGLITE_DATA_DIR=./researchAgentDB
PGLITE_RELAXED_DURABILITY=true
REPORT_OUTPUT_PATH=./research_outputs/
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

Notes
- Data lives locally under `PGLITE_DATA_DIR` (default `./researchAgentDB`). Backups are tarballs in `./backups`.
- Use `list_models` to discover current provider capabilities and ids.

## Platform tips
- Windows (PowerShell): set env with `$env:SERVER_API_KEY="..."`
- macOS/Linux (bash/zsh): `export SERVER_API_KEY=...`
- VS Code/Cursor MCP: point the server to `node src/server/mcpServer.js --stdio`

If this helped you, please ⭐ the repo—it helps others find it.
