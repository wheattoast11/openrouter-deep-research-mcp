# Changelog

## v1.2.0 — 2025-08-12

- Compact prompt strategy with strict URL citations and confidence labels; reduced token overhead
- MCP prompts/resources: `planning_prompt`, `synthesis_prompt`, and `mcp_spec_links`
- Local hybrid indexer (BM25 + optional vector rerank) and MCP tools: `index_texts`, `index_url`, `search_index`, `index_status`
- Auto-index saved reports and fetched content during research (opt-in)
- Planning model fallbacks and simplified model strategy; optional dynamic catalog
- Compact tool params for `conduct_research` (`q,cost,aud,fmt,src,imgs,docs,data`)
- README/Docs: branded architecture SVG with hyperlink, MSeeP validation + feedback loop, star badges

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
