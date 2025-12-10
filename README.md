# OpenRouter Agents MCP Server

[![npm](https://img.shields.io/npm/v/%40terminals-tech%2Fopenrouter-agents?color=2ea043)](https://www.npmjs.com/package/@terminals-tech/openrouter-agents)
[![MCP Stable](https://img.shields.io/badge/MCP-2025--06--18-blue)](https://spec.modelcontextprotocol.io/specification/2025-06-18/)
[![MCP Draft](https://img.shields.io/badge/MCP-2025--11--25%20Draft-brightgreen)](docs/MCP-COMPLIANCE-REPORT.md)
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

## What's New (v1.9.1)

- **Parameter normalization** - Unified alias system (taskId → job_id, q → query)
- **Semantic error messages** - Rust-style diagnostics with actionable suggestions
- **Progress notifications** - Real-time job updates via MCP notifications/progress
- **Token-efficient slash commands** - Streamlined Claude Code integrations

[Full Changelog](docs/CHANGELOG.md) | [MCP Compliance Report](docs/MCP-COMPLIANCE-REPORT.md)

## Configuration

Set `OPENROUTER_API_KEY` in your environment, then configure via `.env` or `.mcp.json`:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | *required* | OpenRouter API key |
| `SERVER_PORT` | `3002` | HTTP server port |
| `MODE` | `ALL` | `AGENT`, `MANUAL`, or `ALL` |
| `PGLITE_DATA_DIR` | `./researchAgentDB` | Database location |
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

STDIO is the default transport per [MCP spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports). Use `--http` explicitly for HTTP mode.

### Client-Specific Setup

<details>
<summary><strong>Jan AI</strong></summary>

1. Enable MCP Servers in Settings → Advanced → Experimental
2. Click + to add server
3. Configure:
   - **Name:** `openrouter-agents`
   - **Command:** `npx`
   - **Arguments:** `@terminals-tech/openrouter-agents`
   - **Environment:** `OPENROUTER_API_KEY=sk-or-...`

Note: STDIO is now default - no `--stdio` flag needed.
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
| Slash Commands | - | ✓ |
| Zero CLI | - | standalone |

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

| Feature | Spec | Status |
|---------|------|--------|
| JSON-RPC 2.0 | Core | Compliant |
| Tools/Resources/Prompts | 2025-06-18 | Compliant |
| Task Protocol (SEP-1686) | Draft | Implemented |
| Sampling (SEP-1577) | Draft | Implemented |
| Elicitation (SEP-1036) | Draft | Implemented |
| MCP Apps (SEP-1865) | Draft | Implemented |
| Enterprise Auth (SEP-990) | Draft | Implemented |
| Client Metadata (SEP-991) | Draft | Implemented |

## Architecture

```
User Query
    │
    ▼
┌─────────────────┐
│  Planning Agent │ ─── Decomposes into sub-queries
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│Agent 1│ │Agent N│ ─── Parallel research
└───┬───┘ └───┬───┘
    │         │
    ▼         ▼
┌─────────────────┐
│   Synthesizer   │ ─── Consensus + citations
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Knowledge Base │ ─── PGlite + pgvector
└─────────────────┘
```

![Architecture](docs/diagram-architecture-branded.svg)

## Links

- **Homepage:** [terminals.tech](https://terminals.tech)
- **npm:** [@terminals-tech/openrouter-agents](https://www.npmjs.com/package/@terminals-tech/openrouter-agents)
- **GitHub:** [terminals-tech/openrouter-agents](https://github.com/terminals-tech/openrouter-agents)
- **Docs:** [CLAUDE.md](CLAUDE.md) | [Tool Patterns](docs/TOOL-PATTERNS.md)

## Publishing

```bash
npm test                           # Run unit tests
npm version minor                  # Bump version
git push --follow-tags             # Push with tags
npm publish --access public        # Publish to npm
```

---

**Version:** 1.9.1 | **Author:** [Tej Desai](https://terminals.tech) | **License:** MIT
