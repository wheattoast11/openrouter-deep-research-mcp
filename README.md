# OpenRouter Agents MCP Server

[![npm](https://img.shields.io/npm/v/%40terminals-tech%2Fopenrouter-agents?color=2ea043)](https://www.npmjs.com/package/@terminals-tech/openrouter-agents)
[![MCP Stable](https://img.shields.io/badge/MCP-2025--11--25%20Stable-blue)](https://spec.modelcontextprotocol.io/specification/2025-11-25/)
[![GitHub](https://img.shields.io/github/stars/terminals-tech/openrouter-agents?style=social)](https://github.com/terminals-tech/openrouter-agents)

Production MCP server for multi-agent AI research. Plan, parallelize, synthesize.

## Install

```bash
npx @terminals-tech/openrouter-agents --stdio
```

**Claude Code one-liner:**
```bash
claude mcp add openrouter-agents -- npx @terminals-tech/openrouter-agents --stdio
```

## What's New (v3.0.0)

- **`ask` + presets** — Default **`MCP_PRESET=conversational`** exposes only `ask`, `status`, `job_get`, and `cancel_job`. Use `developer` or `enterprise` for the full tool surface.
- **Stable `ask` JSON** — Primary user-facing responses use a single envelope (see `src/server/schemas/askResult.js`).
- **Deprecated `MODE`** — Prefer `MCP_PRESET`; legacy `MODE` is mapped when `MCP_PRESET` is unset (warning logged).

**Also from v2:** MCP SDK 1.27.1, Zod 4, Express 5, Streamable HTTP, circuit breaker, embedding-based routing, persistent PGlite storage.

> **macOS/Node 25 Note**: A cosmetic `libc++abi: mutex lock failed` message may appear on shutdown. This is harmless — data is checkpointed before shutdown. Set `DB_AUTO_HEAL=true` for in-memory mode (no persistence, no message).

[Full Changelog](docs/CHANGELOG.md) | [Extensions Guide](docs/EXTENSIONS.md) | [MCP Compliance Report](docs/MCP-COMPLIANCE-REPORT.md)

## Configuration

Set `OPENROUTER_API_KEY` in your environment, then configure via `.env` or `.mcp.json`:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | *required* | OpenRouter API key |
| `OPENROUTER_API_KEYS` | *(optional)* | Comma-separated OpenRouter keys for rotation |
| `OPENROUTER_KEY_COOLDOWN_MS` | `5000` | Base cooldown per key after failures |
| `SERVER_PORT` | `3002` | HTTP server port |
| `MCP_PRESET` | `conversational` | `conversational` (minimal), `developer`, or `enterprise` (full tool list) |
| `MODE` | *(deprecated)* | If set without `MCP_PRESET`, maps to a preset and logs a warning |
| `EMBEDDING_ROUTING_ENABLED` | `true` | Enable embedding-based model routing |
| `INDEXER_ENABLED` | `true` | Enable knowledge indexing |

[Full ENV Reference](docs/ENV-REFERENCE.md)

<details>
<summary><strong>.mcp.json example (team-shareable)</strong></summary>

```json
{
  "mcpServers": {
    "openrouter-agents": {
      "command": "npx",
      "args": ["@terminals-tech/openrouter-agents", "--stdio"],
      "env": {
        "OPENROUTER_API_KEY": "${OPENROUTER_API_KEY}",
        "INDEXER_ENABLED": "true"
      }
    }
  }
}
```
</details>

## Multi-Client Setup

### Transport Modes

| Transport | Flag | Use Case |
|-----------|------|----------|
| STDIO | (default) | MCP clients (Claude, Jan AI, Continue) |
| HTTP | `--http` | Web apps, shared server |

STDIO is the default transport per [MCP spec](https://spec.modelcontextprotocol.io/specification/2025-11-25/basic/transports). Use `--http` explicitly for HTTP mode.

### Client-Specific Setup

<details>
<summary><strong>Jan AI</strong></summary>

1. Enable MCP Servers in Settings → Advanced → Experimental
2. Click + to add server
3. Configure:
   - **Name:** `openrouter-agents`
   - **Command:** `npx`
   - **Arguments:** `@terminals-tech/openrouter-agents` (optional final arg: `--stdio` — same transport as the [Install](#install) one-liner; use whichever your client documents)
   - **Environment:** `OPENROUTER_API_KEY=sk-or-...`

The server defaults to STDIO when launched without flags; Jan and Claude configs above match the top-of-doc `npx @terminals-tech/openrouter-agents` pattern.
</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "openrouter-agents": {
      "command": "npx",
      "args": ["@terminals-tech/openrouter-agents"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-..."
      }
    }
  }
}
```
</details>

<details>
<summary><strong>Continue / Zed / Other MCP Clients</strong></summary>

Standard MCP config - STDIO is default, no flags needed:
```json
{
  "command": "npx",
  "args": ["@terminals-tech/openrouter-agents"],
  "env": { "OPENROUTER_API_KEY": "..." }
}
```
</details>

### Feature Matrix

| Feature | All MCP Clients | Claude Code Only |
|---------|-----------------|------------------|
| Core Research Tools | ✓ | ✓ |
| Knowledge Base | ✓ | ✓ |
| Session/Graph Tools | ✓ | ✓ |
| Rail Protocol Tools | ✓ | ✓ |
| Slash Commands | - | ✓ |

## Models (v2.0.0)

### High-Cost Tier
| Model | Domains |
|-------|---------|
| `anthropic/claude-sonnet-4.5` | reasoning, technical, general, creative |
| `anthropic/claude-opus-4.6` | reasoning, technical, general, creative |
| `openai/gpt-5.2-chat` | reasoning, technical, general |
| `openai/gpt-5.3-codex` | coding, technical, reasoning |
| `google/gemini-3-pro-preview` | reasoning, technical, general |
| `qwen/qwen3-coder` | coding, editing, technical |

### Low-Cost Tier
| Model | Domains |
|-------|---------|
| `google/gemini-3-flash-preview` | coding, editing, technical |
| `anthropic/claude-haiku-4.5` | general, technical, reasoning |
| `deepseek/deepseek-chat-v3.1` | general, reasoning, technical, coding |
| `deepseek/deepseek-v3.2` | general, reasoning, technical, coding |
| `openai/gpt-oss-120b` | general, reasoning, search |

Models are selected via embedding-based routing — query embeddings are matched to model domain profiles without an LLM call.

## Tools

<details>
<summary><strong>Research</strong></summary>

| Tool | Description |
|------|-------------|
| `research` | Async research (returns job_id) |
| `conduct_research` | Sync research with streaming |
| `batch_research` | Parallel batch queries |
| `research_follow_up` | Context-aware follow-up |
| `agent` | Unified entrypoint (auto-routes) |
</details>

<details>
<summary><strong>Knowledge Base</strong></summary>

| Tool | Description |
|------|-------------|
| `search` | Hybrid BM25+vector search |
| `retrieve` | Index or SQL query |
| `query` | SQL SELECT with params |
| `get_report` | Get report by ID |
| `history` | List recent reports |
</details>

<details>
<summary><strong>Session & Graph</strong></summary>

| Tool | Description |
|------|-------------|
| `undo` / `redo` | Session time-travel |
| `checkpoint` | Named save points |
| `fork_session` | Create alternate timeline |
| `graph_traverse` | Explore knowledge graph |
| `graph_clusters` | Find node clusters |
| `graph_pagerank` | Importance rankings |
</details>

<details>
<summary><strong>Rail Protocol</strong></summary>

| Tool | Description |
|------|-------------|
| `list_rails` | List rails, tunnels, routes, consensus |
| `explain_rail` | Detailed rail/tunnel config |
| `list_routes` | All defined routes |
| `list_tunnels` | Active agent-to-agent tunnels |
| `list_consensus` | Streaming consensus sessions |
</details>

<details>
<summary><strong>Utility</strong></summary>

| Tool | Description |
|------|-------------|
| `ping` | Health check |
| `get_server_status` | Full diagnostics |
| `job_status` | Check async job |
| `date_time` | Current timestamp |
| `calc` | Math evaluation |
| `list_tools` | Available tools |
</details>

## MCP Compliance

Compliant with [MCP Specification 2025-11-25](https://spec.modelcontextprotocol.io/specification/2025-11-25/) (stable, AAIF/Linux Foundation governance).

| Feature | SEP | Status |
|---------|-----|--------|
| JSON-RPC 2.0 | Core | Compliant |
| Tools/Resources/Prompts | Core | Compliant |
| Task Protocol | SEP-1686 | Compliant |
| Sampling with Tools | SEP-1577 | Compliant |
| Elicitation | SEP-1036 | Compliant |
| MCP Apps | SEP-1865 | Compliant |
| Enterprise Auth | SEP-990 | Compliant |
| Client Metadata | SEP-991 | Compliant |

[Full Compliance Report](docs/MCP-COMPLIANCE-REPORT.md)

## Architecture

```
User Query
    │
    ▼
┌─────────────────┐
│  Planning Agent  │ ─── Decomposes into sub-queries
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│Agent 1│ │Agent N│ ─── Parallel research (embedding-routed models)
└───┬───┘ └───┬───┘
    │         │
    ▼         ▼
┌─────────────────┐
│   Synthesizer   │ ─── Consensus + citations (Signal protocol)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Knowledge Base  │ ─── PGlite + pgvector (persistent)
└─────────────────┘
```

## Core Abstractions

| Module | Purpose |
|--------|---------|
| **Signal Protocol** | Inter-agent communication with confidence scoring and consensus |
| **Rail Protocol** | Bidirectional channels with backpressure, provenance, tunnels |
| **Error Taxonomy** | Deterministic classification with auto-learning and circuit breakers |
| **Circuit Breaker** | Model API fault tolerance with configurable thresholds and auto-recovery |
| **Parameter Normalization** | Declarative alias system (`q`→`query`, `cost`→`costPreference`) |
| **RoleShift Protocol** | Bidirectional server↔client via MCP sampling/elicitation |
| **Embedding Router** | Local vector-based model selection via `@terminals-tech/embeddings` |

### Circuit Breaker

Protects against cascading model API failures. Configurable via environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `RAIL_CIRCUIT_BREAKER` | `true` | Enable circuit breaker |
| `RAIL_CIRCUIT_THRESHOLD` | `5` | Failures before tripping |
| `RAIL_CIRCUIT_RESET_MS` | `120000` | Recovery timeout (ms) |

States: **closed** (normal) -> **open** (failing, requests rejected) -> **half-open** (testing recovery).

### Transport (v2.0.0)

| Transport | Status | Use Case |
|-----------|--------|----------|
| Streamable HTTP | **Primary** | All new integrations |
| SSE | Deprecated | Legacy compatibility only |
| STDIO | Default | MCP clients (Claude, Jan AI, Continue) |

## Links

- **Homepage:** [terminals.tech](https://terminals.tech)
- **npm:** [@terminals-tech/openrouter-agents](https://www.npmjs.com/package/@terminals-tech/openrouter-agents)
- **GitHub:** [terminals-tech/openrouter-agents](https://github.com/terminals-tech/openrouter-agents)
- **Docs:** [CLAUDE.md](CLAUDE.md) | [Tool Patterns](docs/TOOL-PATTERNS.md) | [Getting Started](docs/GETTING-STARTED.md)

## Releasing

Releases are automated via [release-please](https://github.com/googleapis/release-please):

1. Push conventional commits to `main` (e.g. `feat:`, `fix:`, `chore:`)
2. release-please opens a version-bump PR
3. Merge the PR → GitHub Release created automatically
4. npm publish triggers on release via CI

Manual publish:
```bash
npm test && npm publish --access public
```

---

**Version:** 2.0.0 | **MCP SDK:** 1.27.1 | **MCP Spec:** 2025-11-25 | **Author:** [Tej Desai](https://terminals.tech) | **License:** MIT
