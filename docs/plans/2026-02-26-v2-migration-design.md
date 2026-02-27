# v2.0.0 Migration Design — MCP SDK v2 + Full Modernization

**Date:** 2026-02-26
**Branch:** `release/v2.0.0` (from `release/v1.15.0`)
**Target:** `@terminals-tech/openrouter-agents@2.0.0` on npm + GitHub release
**Scope:** MCP SDK v2 migration, Zod 4, Express 5, circuit breakers, DB fix, security audit

---

## Problem Statement

The openrouter-deep-research-mcp server (v1.16.0) has:

1. **Outdated SDK**: MCP SDK v1.26.0 (monolith) — v2 splits into 4 packages with new API
2. **Outdated Zod**: v3.22.4 — v4 required by MCP SDK v2
3. **Outdated Express**: v4.18.2 — v5.1.0 available with async error handling
4. **Corrupted CLI database**: `~/.zero/db` causes WASM abort, fallback fails on multi-statement SQL
5. **Security vulnerabilities**: Critical (fast-xml-parser), High (axios, tar, qs, minimatch, hono)
6. **Incomplete circuit breakers**: Error taxonomy classifies but doesn't control API call flow
7. **Legacy dual-path**: `tools.js` fallback alongside new handler system

## Decision Record

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Migration scope | Full v2 + all deps | Ship once, ship right |
| Version | v2.0.0 | Breaking internal changes warrant major bump |
| Corrupted DB | Nuke and recreate | No data worth preserving |
| Circuit breakers | Full state machine | Production-grade resilience |
| Publish target | npm + GitHub release | Full distribution |
| Approach | Layered bottom-up | Validate each layer before building on it |

---

## Architecture: 8-Layer MECE Plan

```
L0  Foundation ──→ L1  Schema ──→ L2  SDK ──→ L3  Tools
                                                    │
L7  Publish ←── L6  Cleanup ←── L5  Resilience ←── L4  Transport
```

Each layer has: entry criteria, file scope, validation checkpoint, rollback point.

---

## L0: Foundation (DB Fix + Security Audit)

### Scope
- `src/utils/dbClient.js` (lines 541-627)
- `~/.zero/db` directory
- `package.json` dependencies (audit fix)

### Changes

#### 0.1: Delete corrupted DB
```bash
rm -rf ~/.zero/db
```

#### 0.2: Fix multi-statement SQL in fallback path
Split bundled SQL statements in `dbClient.js` lines 541-627:

```javascript
// BEFORE (fails on PGlite)
await db.query(`
  CREATE TABLE IF NOT EXISTS job_events (...);
  CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);
`);

// AFTER (each statement separate)
await db.query(`CREATE TABLE IF NOT EXISTS job_events (...)`);
await db.query(`CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id)`);
```

Affected blocks:
- `job_events` table + index (lines 541-552)
- `tool_observations` table + index (lines 573-587)
- `graph_nodes` table + index (lines 599-613)
- `graph_edges` table + 2 indexes (lines 614-627)

#### 0.3: Security audit fix
```bash
npm audit fix
# If needed: npm audit fix --force for tar upgrade
```

### Validation
- `./bin/zero status` → Database: Connected
- `npm audit` → 0 critical, 0 high
- `npm test` → all pass

---

## L1: Schema (Zod 3 → 4)

### Scope
- `package.json` (zod dependency)
- `src/core/schemas/index.js` (primary schema registry)
- Any file importing from `zod` or referencing `ZodIssue` types

### Changes

#### 1.1: Upgrade Zod
```bash
npm install zod@^4.0.0
```

#### 1.2: Audit schema definitions
Most `z.object()`, `z.string()`, `z.number()`, `z.enum()` patterns are API-compatible between v3 and v4. Verify:

- No `invalid_type_error` / `required_error` options (removed in v4)
- No `ZodInvalidTypeIssue` type references (renamed to `z.core.$ZodIssueInvalidType`)
- No `z.coerce` behavior changes

#### 1.3: Update imports if needed
```javascript
// v3 and v4 both support:
import { z } from 'zod';

// v4 explicit (used by MCP SDK v2):
import * as z from 'zod/v4';
```

### Validation
- `npm test` → all schema tests pass
- `node -e "const {z} = require('zod'); console.log(z.string().parse('ok'))"` → works

---

## L2: SDK (MCP v1 → v2 Package Split)

### Scope
- `package.json` (remove 1 package, add 4)
- ALL files importing from `@modelcontextprotocol/sdk`

### Changes

#### 2.1: Package swap
```bash
npm uninstall @modelcontextprotocol/sdk
npm install @modelcontextprotocol/client @modelcontextprotocol/server @modelcontextprotocol/core @modelcontextprotocol/node
```

#### 2.2: Import path rewrite

| v1 Import | v2 Import |
|-----------|-----------|
| `@modelcontextprotocol/sdk/server/mcp.js` → `McpServer` | `@modelcontextprotocol/server` → `McpServer` |
| `@modelcontextprotocol/sdk/server/stdio.js` → `StdioServerTransport` | `@modelcontextprotocol/server` → `StdioServerTransport` |
| `@modelcontextprotocol/sdk/server/streamableHttp.js` → `StreamableHTTPServerTransport` | `@modelcontextprotocol/node` → `NodeStreamableHTTPServerTransport` |
| `@modelcontextprotocol/sdk/types.js` → types/schemas | `@modelcontextprotocol/core` → types/schemas |
| `@modelcontextprotocol/sdk/client/index.js` → `Client` | `@modelcontextprotocol/client` → `Client` |

#### 2.3: Files to update (trace from grep)
- `src/server/mcpServer.js` — primary server, all SDK imports
- `src/core/dualRoleNode.js` — Client import for zero protocol
- `src/core/embeddedClient.js` — Client import
- `src/core/protocolAdapter.js` — transport adapters
- `src/core/roleShift.js` — sampling/elicitation imports
- `src/core/sdk/` — SDK utilities
- `src/adapters/` — OAuth/JWT adapters
- Any test files importing SDK types

### Validation
- `node -e "require('./src/server/mcpServer.js')"` → no import errors
- Server starts without crashes

---

## L3: Tools (42 Registration Rewrites)

### Scope
- `src/server/mcpServer.js` — all `server.tool()` calls
- `src/server/mcpServer.js` — all `server.resource()` calls
- `src/server/mcpServer.js` — all `server.prompt()` calls

### Changes

#### 3.1: Tool registration pattern change
```javascript
// BEFORE (v1 variadic)
server.tool(
  'research',
  'Execute deep research query',
  { query: z.string(), costPreference: z.string().optional() },
  async (params) => { /* handler */ }
);

// AFTER (v2 config object)
server.registerTool(
  'research',
  {
    description: 'Execute deep research query',
    inputSchema: { query: z.string(), costPreference: z.string().optional() }
  },
  async (params) => { /* handler */ }
);
```

#### 3.2: All 42 tools to rewrite
Research: research, conduct_research, batch_research, research_follow_up
Knowledge: search, retrieve, query, get_report, history
Jobs: job_status, get_job_status, cancel_job
Sessions: undo, redo, fork_session, time_travel, session_state, checkpoint
Graph: graph_traverse, graph_path, graph_clusters, graph_pagerank, graph_patterns, graph_stats
Rails: list_rails, explain_rail, list_routes, list_tunnels, list_consensus
Utility: ping, get_server_status, date_time, calc, list_tools, search_tools
Task Protocol: task_get, task_result, task_list, task_cancel
Sampling: sample_message
Elicitation: elicitation_respond
Agent: agent

#### 3.3: Resource registration
```javascript
// BEFORE
server.resource(uri, name, description, handler);

// AFTER
server.registerResource(uri, name, {}, description, handler);
```

#### 3.4: Prompt registration
```javascript
// BEFORE
server.prompt(name, description, argsSchema, handler);

// AFTER
server.registerPrompt(name, { description, argsSchema }, handler);
```

#### 3.5: Headers migration
```javascript
// BEFORE
headers['mcp-session-id']

// AFTER
headers.get('mcp-session-id')
```

### Validation
- `node src/server/mcpServer.js --stdio` → responds to initialize
- `tools/list` returns 42 tools with correct schemas
- Test each tool category: ping, research, search, graph

---

## L4: Transport (Express 4 → 5)

### Scope
- `package.json` (express dependency)
- `src/server/mcpServer.js` (HTTP/SSE transport setup)
- Any file using `req.param()`, `app.del()`, `res.redirect('back')`

### Changes

#### 4.1: Upgrade Express
```bash
npm install express@^5.1.0
```

#### 4.2: API changes
- `req.param('x')` → `req.params.x` or `req.query.x`
- Async route handlers now auto-catch rejections (simplify try/catch where applicable)
- `StreamableHTTPServerTransport` → `NodeStreamableHTTPServerTransport` (already done in L2)

### Validation
- HTTP server starts on configured port
- SSE endpoint streams events
- Rate limiting works

---

## L5: Resilience (Circuit Breakers)

### Scope
- New: `src/core/circuitBreaker.js`
- `src/server/mcpServer.js` (wrap API calls)
- `src/utils/dbClient.js` (wrap DB operations)
- `src/core/errors/` (integrate trip decisions)

### Changes

#### 5.1: CircuitBreaker class

```javascript
class CircuitBreaker {
  // States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing)
  constructor({ name, failureThreshold, resetTimeoutMs, halfOpenMaxAttempts }) {}

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new CircuitOpenError(this.name, this.nextRetryAt);
      }
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  onFailure(error) {
    const decision = classify(error).tripDecision;
    if (decision === 'trip' || decision === 'escalate') {
      this.failures++;
      if (this.failures >= this.failureThreshold) {
        this.state = 'OPEN';
        this.lastFailure = Date.now();
      }
    }
  }
}
```

#### 5.2: Circuit instances
```javascript
const circuits = {
  openrouter: new CircuitBreaker({ name: 'openrouter', failureThreshold: 3, resetTimeoutMs: 60000 }),
  database: new CircuitBreaker({ name: 'database', failureThreshold: 3, resetTimeoutMs: 30000 }),
  embedder: new CircuitBreaker({ name: 'embedder', failureThreshold: 5, resetTimeoutMs: 45000 })
};
```

#### 5.3: Retry with exponential backoff + jitter
```javascript
async function withRetry(fn, { maxRetries = 3, baseDelayMs = 1000, circuit }) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return circuit ? await circuit.execute(fn) : await fn();
    } catch (error) {
      if (attempt === maxRetries || error instanceof CircuitOpenError) throw error;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

#### 5.4: Model fallback
When OpenRouter circuit opens for a specific model tier:
- HIGH_COST fails → fall back to LOW_COST
- LOW_COST fails → fall back to VERY_LOW_COST
- All fail → return error with circuit status

#### 5.5: DB fallback
When PGlite circuit opens:
- Persistent DB fails → graceful degrade to in-memory
- In-memory fails → return error, mark server degraded in `get_server_status`

### Validation
- Simulate API failure → circuit opens → requests fail fast
- Wait reset timeout → circuit half-opens → success closes circuit
- Model fallback triggers on high-cost failure
- `get_server_status` reports circuit states

---

## L6: Cleanup

### Scope
- Remove legacy `src/server/tools.js` dual-path (if handlers cover 100%)
- Remove `.zero/` experimental directory from staging
- Remove duplicate files with ` 2` suffixes
- Update all version references to 2.0.0
- Update CLAUDE.md, README.md, CHANGELOG.md
- Run final lint/format pass

### Validation
- `git status` clean except intentional changes
- `npm test` passes
- No `require('./tools.js')` references remain (unless needed for backward compat)

---

## L7: Publish

### Scope
- `package.json` version → 2.0.0
- npm publish
- Git tag + GitHub release
- Push to main

### Commands
```bash
# Version bump
npm version 2.0.0 --no-git-tag-version

# Publish to npm
npm publish --access public

# Git
git add -A
git commit -m "chore: release v2.0.0 — MCP SDK v2, Zod 4, Express 5, circuit breakers"
git tag v2.0.0
git push origin release/v2.0.0
git push origin v2.0.0

# GitHub release
gh release create v2.0.0 --title "v2.0.0" --notes "..."
```

### Validation
- `npm info @terminals-tech/openrouter-agents` shows 2.0.0
- GitHub release visible
- `npx @terminals-tech/openrouter-agents --version` → 2.0.0

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MCP SDK v2 API mismatch | Medium | High | Verify against context7 docs at each step |
| Zod 4 schema breakage | Low | Medium | Core schemas are simple z.object/z.string patterns |
| Tool registration regression | Medium | High | Test each tool category after L3 |
| Express 5 route breakage | Low | Low | Limited HTTP surface, mostly STDIO |
| Circuit breaker over-tripping | Low | Medium | Conservative thresholds, manual override |
| npm publish failure | Low | Medium | Dry run first: `npm publish --dry-run` |

## Rollback Plan

Each layer is a git commit. If any layer fails validation:
1. `git stash` current work
2. Debug the specific layer
3. If unrecoverable, `git reset --soft` to previous layer's commit
4. Re-attempt with fixes

---

## File Impact Summary

| File | Layers | Change Type |
|------|--------|-------------|
| `package.json` | L0,L1,L2,L4,L7 | Deps, version |
| `src/utils/dbClient.js` | L0,L5 | SQL fix, circuit breaker |
| `src/core/schemas/index.js` | L1 | Zod 4 compat |
| `src/server/mcpServer.js` | L2,L3,L4,L5 | SDK imports, tool registration, transport, circuits |
| `src/core/dualRoleNode.js` | L2 | SDK import |
| `src/core/embeddedClient.js` | L2 | SDK import |
| `src/core/protocolAdapter.js` | L2 | SDK import |
| `src/core/roleShift.js` | L2 | SDK import |
| `src/core/circuitBreaker.js` | L5 | NEW file |
| `CLAUDE.md` | L6 | Version refs |
| `README.md` | L6 | Version refs |
| `docs/CHANGELOG.md` | L7 | Release notes |

---

## Estimated Parallel Execution

```
[L0: Foundation]────────────────→ checkpoint
[L1: Schema]────────────────────→ checkpoint
    ↓ (L1 must complete before L2)
[L2: SDK]───────────────────────→ checkpoint
    ↓ (L2 must complete before L3)
[L3: Tools]─────────────────────→ checkpoint
[L4: Transport]─────┐            checkpoint (can parallel with L3)
[L5: Resilience]────┘            checkpoint (can parallel with L3/L4)
    ↓ (all must complete)
[L6: Cleanup]───────────────────→ checkpoint
[L7: Publish]───────────────────→ done
```

L0 and L1 can run in parallel.
L3, L4, L5 can run in parallel (disjoint file scopes).
L6 and L7 are sequential (depend on all prior).
