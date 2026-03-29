# Migrating from v2.x to v3.0.0

## Summary

v3 reduces the **default MCP tool list** so chat clients route correctly. Configure **`MCP_PRESET`** instead of **`MODE`**.

## Environment

| v2 | v3 |
|----|-----|
| `MODE=AGENT` | `MCP_PRESET=conversational` (default) |
| `MODE=MANUAL` | `MCP_PRESET=developer` |
| `MODE=ALL` | `MCP_PRESET=enterprise` |

If you only set `MODE` and not `MCP_PRESET`, the server maps the old value and prints a deprecation warning.

## Tools

### Conversational preset (default)

Use **`ask`** for almost everything:

- **Research (blocking)** — `{ "message": "your question", "sync": true }` (default).
- **Async research** — `{ "message": "...", "sync": false }` then poll **`job_get`** with `job_id`.
- **KB-only** — `{ "intent": "kb_search", "message": "..." }` or prefix message with `kb:`.
- **Follow-up** — `originalQuery`, `followUpQuestion`, optional `costPreference`.

Health: **`status`** (replaces calling `ping` + `get_server_status` separately for new integrations).

### Developer / enterprise

- **`developer`** — Adds `kb_search`, `kb_query`, `research_start`, `batch_research`, `get_report`, `history`, `agent`, `zero_chat`, `research`, `retrieve`, etc.
- **`enterprise`** — All registered tools (graph, session time-travel, Zero protocol, tasks, web fetch, …).

## Handler flag

**`CORE_HANDLERS_ENABLED`** (and any “disable handlers” env knob) is **ignored** in v3 — the consolidated handler layer in `src/server/handlers/` is always used for MCP.

## JSON: `ask` output

Parse the `ask` tool text as JSON matching `AskResultSchema` in `src/server/schemas/askResult.js` (`answer`, `citations`, `reportId`, `jobId`, `sessionId`, `warnings`, …).
