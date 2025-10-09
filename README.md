[![Star on GitHub](https://img.shields.io/github/stars/wheattoast11/openrouter-deep-research?style=social)](https://github.com/wheattoast11/openrouter-deep-research)
# OpenRouter Agents MCP Server

[![npm version](https://img.shields.io/npm/v/%40terminals-tech%2Fopenrouter-agents?color=2ea043)](https://www.npmjs.com/package/@terminals-tech/openrouter-agents) [![GitHub Packages](https://img.shields.io/badge/GitHub%20Packages-available-24292e?logo=github)](../../packages)

[UPDATE – v2.1.1-beta] PLL-governed streaming + Dockerized release:
- Phase-locked streaming loop with adaptive concurrency (configurable via `PLL_*` envs)
- Compression policies for context/KV budget enforcement (`COMPRESSION_*` envs)
- Improved idempotency env defaults for easier ops tuning
- Official Node 20 Docker image with production defaults

[UPDATE – v2.1] Single-agent architecture (set MODE env):
- AGENT (default): one unified `agent` tool that routes all operations + always-on ops tools
- MANUAL: individual tools for each action + always-on ops tools
- ALL: both AGENT and MANUAL tools exposed

Diagram (simple)
```
[Always-On Ops]  ping • get_server_status • job_status • cancel_job

AGENT MODE
client → agent → (research | follow_up | retrieve | query)

MANUAL MODE
client → (submit_research | conduct_research | retrieve | query | research_follow_up | get_report_content | list_research_history)
```

- Killer features
  - Plan → parallelize → synthesize workflow with bounded parallelism
  - Dynamic model catalog; supports Anthropic Sonnet‑4 and OpenAI GPT‑5 family
  - Built‑in semantic KB (PGlite + pgvector) with backup, export/import, health, and reindex tools
  - Lightweight web helpers: quick search and page fetch for context
  - Robust streaming (SSE), per‑connection auth, clean logs

## Install / Run
- Install (project dependency)
```bash
npm install @terminals-tech/openrouter-agents
```

- Global install (optional)
```bash
npm install -g @terminals-tech/openrouter-agents
```

- Run with npx (no install)
```bash
npx @terminals-tech/openrouter-agents --stdio
# or daemon
SERVER_API_KEY=devkey npx @terminals-tech/openrouter-agents
```

## What's new (v2.1) - MCP v2.1 Compliance + OAuth 2.1 ✅
- **MCP v2.1 Streamable HTTP**: Unified `/mcp` endpoint (POST/GET/DELETE) with session management, resumability, and protocol version negotiation
- **OAuth 2.1 Resource Server**: Strict JWT validation (JWKS), audience binding, Protected Resource Metadata discovery (RFC 9728), WWW-Authenticate challenges, and scope-based authorization
- **No Token Passthrough**: Audience-validated JWTs only; no raw token forwarding to downstream services
- **Single-agent architecture**: MODE defaults to AGENT (6 tools total)
- **Unified agent tool**: Single entry point that routes to research/follow_up/retrieve/query
- **Local embeddings**: @xenova/transformers v2 (384D, no external API needed)
- **PGlite + pgvector**: Persistent vector storage with semantic similarity search
- **A2A Connector Scaffolding**: Feature-flagged x402 (Coinbase) and AP2 (Google) connectors (awaiting specs)
- **Backward compatible**: Set MODE=ALL to restore full v1.5 behavior

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

# Modes (pick one; default AGENT in v2.1)
# AGENT  = agent-only + always-on ops (6 tools total) [DEFAULT]
# MANUAL = individual tools + always-on ops
# ALL    = agent + individual tools + always-on ops (21 tools)
MODE=AGENT

# Orchestration
ENSEMBLE_SIZE=2
PARALLELISM=4

# Models (override as needed) - Updated with state-of-the-art cost-effective models
PLANNING_MODEL=openai/gpt-5-chat
PLANNING_CANDIDATES=openai/gpt-5-chat,google/gemini-2.5-pro,anthropic/claude-sonnet-4
HIGH_COST_MODELS=x-ai/grok-4,openai/gpt-5-chat,google/gemini-2.5-pro,anthropic/claude-sonnet-4,morph/morph-v3-large
LOW_COST_MODELS=deepseek/deepseek-chat-v3.1,z-ai/glm-4.5v,qwen/qwen3-coder,openai/gpt-5-mini,google/gemini-2.5-flash
VERY_LOW_COST_MODELS=openai/gpt-5-nano,deepseek/deepseek-chat-v3.1

# Storage
PGLITE_DATA_DIR=./researchAgentDB
PGLITE_RELAXED_DURABILITY=true
REPORT_OUTPUT_PATH=./research_outputs/

# Indexer
INDEXER_ENABLED=true
INDEXER_AUTO_INDEX_REPORTS=true
INDEXER_AUTO_INDEX_FETCHED=true

# MCP v2.1 features
MCP_STREAMABLE_HTTP_ENABLED=true
MCP_PROTOCOL_VERSION=2025-03-26
MCP_ENABLE_PROMPTS=true
MCP_ENABLE_RESOURCES=true

# OAuth 2.1 Resource Server (optional but recommended)
AUTH_JWKS_URL=https://your-auth-provider.com/.well-known/jwks.json
AUTH_EXPECTED_AUD=mcp-server
AUTH_ISSUER_URL=https://your-auth-provider.com
AUTH_DISCOVERY_ENABLED=true
AUTH_SCOPES_MINIMAL=mcp:read,mcp:tools:list,mcp:resources:list,mcp:prompts:list

# Security
ALLOWED_ORIGINS=http://localhost:*,https://localhost:*
REQUIRE_HTTPS=false
RATE_LIMIT_MAX_REQUESTS=100

# Phase-locked streaming (optional overrides)
PLL_ENABLE=true
PLL_TARGET_TOKEN_RATE=32
PLL_MAX_FANOUT=6
PLL_MAX_CONCURRENCY=6
PLL_JITTER_TOLERANCE_MS=180
PLL_GAIN=0.5

# Compression policies
COMPRESSION_ENABLE=true
COMPRESSION_TARGET_TOKENS=3200
COMPRESSION_MIN_RETENTION_RATIO=0.35
COMPRESSION_ENTROPY_FLOOR=0.2

# Idempotency (intuitive defaults)
IDEMPOTENCY_ENABLED=true
IDEMPOTENCY_TTL_SECONDS=3600
IDEMPOTENCY_RETRY_ON_FAILURE=true

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

### Windows PowerShell examples
- STDIO
```powershell
$env:OPENROUTER_API_KEY='your_key'
$env:INDEXER_ENABLED='true'
node src/server/mcpServer.js --stdio
```
- HTTP/SSE
```powershell
$env:OPENROUTER_API_KEY='your_key'
$env:SERVER_API_KEY='devkey'
$env:SERVER_PORT='3002'
node src/server/mcpServer.js
```

### One-liner demo scripts
Dev (HTTP/SSE):
```bash
SERVER_API_KEY=devkey INDEXER_ENABLED=true node src/server/mcpServer.js
```

STDIO (Cursor/VS Code):
```bash
OPENROUTER_API_KEY=your_key INDEXER_ENABLED=true node src/server/mcpServer.js --stdio
```

## MCP v2.1 Usage

### Global CLI Installation
```bash
npm install -g @terminals-tech/openrouter-agents

# Start MCP server
openrouter-agents-mcp

# Or use the standard entry point
openrouter-agents --stdio
```

### Streamable HTTP Endpoint
The server now exposes a unified `/mcp` endpoint compliant with MCP spec 2025-03-26:

- **POST /mcp**: Send JSON-RPC requests (initialize, tools/list, tools/call, etc.). Include `MCP-Protocol-Version` and `Authorization` headers as needed. When authentication fails, the server returns `WWW-Authenticate`:
  - `401` → `Bearer realm="openrouter-agents", error="invalid_token", error_description="token missing or invalid"`
  - `403` → `Bearer error="insufficient_scope", scope="mcp:tools:call"`
- **GET /mcp**: Open SSE stream for server-initiated messages. Requires `Mcp-Session-Id` header from the initialize response. The stream emits `notifications/message`, `notifications/progress`, and `notifications/cancelled` events filtered by the session log level (`logging/setLevel`).
- **DELETE /mcp**: Terminate session (requires `Mcp-Session-Id`).

#### Example: Initialize session
```bash
curl -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-03-26" \
  -H "Authorization: Bearer your-token-here" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "my-client", "version": "1.0.0" }
    }
  }'
```

The response will include an `Mcp-Session-Id` header. Include this header in all subsequent requests.

### OAuth 2.1 Resource Server

#### Discovery Endpoints
- `/.well-known/oauth-protected-resource` - Protected Resource Metadata (RFC 9728)
- `/.well-known/mcp.json` - Legacy MCP server discovery with transport URLs and capabilities

#### Authentication Flow
1. Configure `AUTH_JWKS_URL`, `AUTH_EXPECTED_AUD`, and optional `AUTH_ISSUER_URL` in `.env` (see `env.example`).
2. Obtain a JWT from your authorization server with the correct audience + scopes.
3. Include the JWT in the `Authorization: Bearer <token>` header.
4. Server validates issuer (if provided), audience, expiration, signature, and scopes.

#### Scope-Based Authorization
The server enforces scopes for MCP methods:

| Method | Required scopes |
| --- | --- |
| `tools/list` | `mcp:tools:list` |
| `tools/call` | `mcp:tools:call` |
| `resources/list`, `resources/templates/list` | `mcp:resources:list` |
| `resources/read` | `mcp:resources:read` |
| `prompts/list` | `mcp:prompts:list` |
| `prompts/get` | `mcp:prompts:read` |
| `logging/setLevel` | `mcp:logging:write` |
| `completion/complete` | `mcp:completions` |
| `resources/subscribe`, `resources/unsubscribe` | `mcp:resources:subscribe` |
| `notifications/message` | `mcp:notifications:write` |

If scopes are missing, the response is `403` with `WWW-Authenticate: Bearer error="insufficient_scope", scope="mcp:completions"` listing what is required. For missing/invalid tokens, the response is `401` with `WWW-Authenticate: Bearer realm="openrouter-agents", error="invalid_token"`.

#### List + Pagination + Completion
- Every list endpoint supports opaque cursors. `cursor` accepts a Base64URL token returned in `nextCursor`. Treat it as opaque and pass it back untouched. `limit` defaults to 50 (max 100).
- Tools: `tools/list`, `resources/list`, `resources/templates/list`, `prompts/list` share the same format:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/list",
  "params": { "limit": 20, "cursor": "MA==" }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "resources": [...],
    "nextCursor": "MjA="
  }
}
```

- Completion utility: `completion/complete` surfaces context-aware suggestions for prompt/resource arguments and general helper values. Example:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "completion/complete",
  "params": {
    "kind": "promptArgument",
    "dataset": "default",
    "attribute": "outputFormat",
    "input": "re",
    "limit": 5
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "completion": {
      "values": ["report", "briefing"],
      "total": 3,
      "hasMore": true,
      "nextCursor": "Mg=="
    }
  }
}
```

Use `logging/setLevel` to control which `notifications/message` events are emitted: levels `error`, `warn`, `info`, `debug`, `trace`.

### A2A Connectors (Feature-Flagged)
Enable experimental agent-to-agent connectors:
```bash
# Enable x402 (Coinbase) connector
MCP_CONNECTOR_X402_ENABLED=true

# Enable AP2 (Google) connector
MCP_CONNECTOR_AP2_ENABLED=true
```

**Note**: These are scaffolds awaiting specification. They will throw "not yet implemented" errors when invoked.

### MCP client JSON configuration (no manual start required)
You can register this server directly in MCP clients that support JSON server manifests.

Minimal examples:

1) STDIO transport (recommended for IDEs)
```json
{
  "servers": {
    "openrouter-agents": {
      "command": "npx",
      "args": ["@terminals-tech/openrouter-agents", "--stdio"],
      "env": {
        "OPENROUTER_API_KEY": "${OPENROUTER_API_KEY}",
        "SERVER_API_KEY": "${SERVER_API_KEY}",
        "PGLITE_DATA_DIR": "./researchAgentDB",
        "INDEXER_ENABLED": "true"
      }
    }
  }
}
```

2) HTTP/SSE transport (daemon mode)
```json
{
  "servers": {
    "openrouter-agents": {
      "url": "http://127.0.0.1:3002",
      "sse": "/sse",
      "messages": "/messages",
      "headers": {
        "Authorization": "Bearer ${SERVER_API_KEY}"
      }
    }
  }
}
```

With the package installed globally (or via npx), MCP clients can spawn the server automatically. See your client’s docs for where to place this JSON (e.g., `~/.config/client/mcp.json`).

## Tools (high‑value)
- Always‑on (all modes): `ping`, `get_server_status`, `job_status`, `get_job_status`, `cancel_job`
- AGENT: `agent` (single entrypoint for research / follow_up / retrieve / query)
- MANUAL/ALL toolset: `submit_research` (async), `conduct_research` (sync/stream), `research_follow_up`, `search` (hybrid), `retrieve` (index/sql), `query` (SELECT), `get_report_content`, `list_research_history`
- Jobs: `get_job_status`, `cancel_job`
- Retrieval: `search` (hybrid BM25+vector with optional LLM rerank), `retrieve` (index/sql wrapper)
- SQL: `query` (SELECT‑only, optional `explain`)
- Knowledge base: `get_past_research`, `list_research_history`, `get_report_content`
- DB ops: `backup_db` (tar.gz), `export_reports`, `import_reports`, `db_health`, `reindex_vectors`
- Models: `list_models`
- Web: `search_web`, `fetch_url`
- Indexer: `index_texts`, `index_url`, `search_index`, `index_status`

### Tool usage patterns (for LLMs)
Use `tool_patterns` resource to view JSON recipes describing effective chaining, e.g.:
- Search → Fetch → Research
- Async research: submit, stream via SSE `/jobs/:id/events`, then get report content

Notes
- Data lives locally under `PGLITE_DATA_DIR` (default `./researchAgentDB`). Backups are tarballs in `./backups`.
- Use `list_models` to discover current provider capabilities and ids.

## Architecture at a glance
See `docs/diagram-architecture.mmd` (Mermaid). Render to SVG with Mermaid CLI if installed:
```bash
npx @mermaid-js/mermaid-cli -i docs/diagram-architecture.mmd -o docs/diagram-architecture.svg
```
Or use the script:
```bash
npm run gen:diagram
```

![Architecture Diagram (branded)](docs/diagram-architecture-branded.svg)

If the image doesn’t render in your viewer, open `docs/diagram-architecture-branded.svg` directly.

### Answer crystallization view
![Answer Crystallization Diagram](docs/answer-crystallization-architecture.svg)

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
- Run via npx (scoped): `npx @terminals-tech/openrouter-agents --stdio`
- Generate examples: `npm run gen:examples`
- List models: MCP `list_models { refresh:false }`
- Submit research (async): `submit_research { q:"<query>", cost:"low", aud:"intermediate", fmt:"report", src:true }`
- Track job: `get_job_status { job_id:"..." }`, cancel: `cancel_job { job_id:"..." }`
- Unified search: `search { q:"<query>", k:10, scope:"both" }`
- SQL (read‑only): `query { sql:"SELECT ... WHERE id = $1", params:[1], explain:true }`
- Get past research: `get_past_research { query:"<query>", limit:5 }`
- Index URL (if enabled): `index_url { url:"https://..." }`
- Micro UI (ghost): visit `http://localhost:3002/ui` to stream job events (SSE).

## Package publishing
- Name: `@terminals-tech/openrouter-agents`
- Version: 1.3.2
- Bin: `openrouter-agents`
- Author: Tej Desai <admin@terminals.tech>
- Homepage: https://terminals.tech

Install and run without cloning:
```bash
npx @terminals-tech/openrouter-agents --stdio
# or daemon
SERVER_API_KEY=your_key npx @terminals-tech/openrouter-agents
```

### Publish (scoped)
```bash
npm login
npm version 1.3.2 -m "chore(release): %s"
git push --follow-tags
npm publish --access public --provenance
```

## Validation – MSeeP (Multi‑Source Evidence & Evaluation Protocol)
- **Citations enforced**: explicit URLs, confidence tags; unknowns marked `[Unverified]`.
- **Cross‑model triangulation**: plan fans out to multiple models; synthesis scores consensus vs contradictions.
- **KB grounding**: local hybrid index (BM25+vector) retrieves past work for cross‑checking.
- **Human feedback**: `rate_research_report { rating, comment }` stored to DB; drives follow‑ups.
- **Reproducibility**: `export_reports` + `backup_db` capture artifacts for audit.

## Quality feedback loop
- Run examples: `npm run gen:examples`
- Review: `list_research_history`, `get_report_content {reportId}`
- Rate: `rate_research_report { reportId, rating:1..5, comment }`
- Improve retrieval: `reindex_vectors`, `index_status`, `search_index { query }`

## Architecture diagram (branded)
- See `docs/diagram-architecture-branded.svg` (logo links to `https://terminals.tech`).

## Stargazers
[![Star on GitHub](https://img.shields.io/github/stars/wheattoast11/openrouter-deep-research?style=social)](https://github.com/wheattoast11/openrouter-deep-research)

[![Star History Chart](https://api.star-history.com/svg?repos=wheattoast11/openrouter-deep-research&type=Date)](https://star-history.com/#wheattoast11/openrouter-deep-research)
