# v2.0.0 Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate openrouter-deep-research-mcp from MCP SDK v1.26.0 to v2, Zod 3→4, Express 4→5, add circuit breakers, fix DB issues, and publish as v2.0.0.

**Architecture:** Bottom-up layered migration. Each layer validates before the next begins. L0+L1 parallel, L2 sequential, L3+L4+L5 parallel, L6→L7 sequential.

**Tech Stack:** MCP SDK v2 (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`, `@modelcontextprotocol/core`, `@modelcontextprotocol/node`), Zod 4, Express 5, PGlite 0.3.14, Node >=18.

---

## Critical Discoveries from Exploration

1. **`register()` wrapper at line 507-514 already calls `server.registerTool()`** — tool registration API is already v2-compatible
2. **`SSEServerTransport` is removed in SDK v2** — must migrate SSE endpoints to `NodeStreamableHTTPServerTransport`
3. **Prompts use `server.setPromptRequestHandlers()`** — must migrate to `server.registerPrompt()` per prompt
4. **Resources use `server.setResourceRequestHandlers()`** — must migrate to `server.registerResource()` per resource
5. **`inputSchema` in v2 requires `z.object()` wrapping** — raw shapes `{ name: z.string() }` must become `z.object({ name: z.string() })`
6. **Corrupted `~/.zero/db`** — PGlite WASM aborts; multi-statement SQL in fallback path
7. **4 files import from SDK** — `mcpServer.js` (4 imports), `test-mcp-server.js` (1), `setup-claude-code.js` (1)

---

## Task 1: Fix Corrupted Database + Multi-Statement SQL

**Files:**
- Delete: `~/.zero/db` (corrupted PGlite data directory)
- Modify: `src/utils/dbClient.js:541-627` (split multi-statement SQL)

**Step 1: Delete corrupted database directory**

Run: `rm -rf ~/.zero/db`
Expected: Directory removed, PGlite will create fresh on next start

**Step 2: Read the fallback SQL blocks**

Run: Read `src/utils/dbClient.js` lines 530-640

**Step 3: Split multi-statement SQL — job_events (lines 541-552)**

Find:
```javascript
await db.query(`
  CREATE TABLE IF NOT EXISTS job_events (
    id SERIAL PRIMARY KEY,
    job_id TEXT NOT NULL,
    ts TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT NOT NULL,
    payload JSONB,
    shape_hash TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);
`);
```

Replace with:
```javascript
await db.query(`
  CREATE TABLE IF NOT EXISTS job_events (
    id SERIAL PRIMARY KEY,
    job_id TEXT NOT NULL,
    ts TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT NOT NULL,
    payload JSONB,
    shape_hash TEXT
  )
`);
await db.query(`CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id)`);
```

**Step 4: Split multi-statement SQL — tool_observations (lines 573-587)**

Find:
```javascript
await db.query(`
  CREATE TABLE IF NOT EXISTS tool_observations (
    id SERIAL PRIMARY KEY,
    tool_name TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    output_hash TEXT,
    success BOOLEAN NOT NULL,
    latency_ms INTEGER,
    error_category TEXT,
    error_code TEXT,
    request_id TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_tool_obs_name ON tool_observations (tool_name);
`);
```

Replace with:
```javascript
await db.query(`
  CREATE TABLE IF NOT EXISTS tool_observations (
    id SERIAL PRIMARY KEY,
    tool_name TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    output_hash TEXT,
    success BOOLEAN NOT NULL,
    latency_ms INTEGER,
    error_category TEXT,
    error_code TEXT,
    request_id TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )
`);
await db.query(`CREATE INDEX IF NOT EXISTS idx_tool_obs_name ON tool_observations (tool_name)`);
```

**Step 5: Split multi-statement SQL — graph_nodes (lines 600-613)**

Find:
```javascript
await db.query(`
  CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    node_type TEXT NOT NULL,
    source_id TEXT,
    title TEXT,
    description TEXT,
    metadata JSONB,
    provider_id TEXT,
    lineage JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_graph_nodes_provider ON graph_nodes(provider_id);
`);
```

Replace with:
```javascript
await db.query(`
  CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    node_type TEXT NOT NULL,
    source_id TEXT,
    title TEXT,
    description TEXT,
    metadata JSONB,
    provider_id TEXT,
    lineage JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )
`);
await db.query(`CREATE INDEX IF NOT EXISTS idx_graph_nodes_provider ON graph_nodes(provider_id)`);
```

**Step 6: Split multi-statement SQL — graph_edges (lines 614-627)**

Find:
```javascript
await db.query(`
  CREATE TABLE IF NOT EXISTS graph_edges (
    id SERIAL PRIMARY KEY,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    edge_type TEXT NOT NULL,
    weight FLOAT DEFAULT 1.0,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_id, target_id, edge_type)
  );
  CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id);
  CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id);
`);
```

Replace with:
```javascript
await db.query(`
  CREATE TABLE IF NOT EXISTS graph_edges (
    id SERIAL PRIMARY KEY,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    edge_type TEXT NOT NULL,
    weight FLOAT DEFAULT 1.0,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_id, target_id, edge_type)
  )
`);
await db.query(`CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id)`);
await db.query(`CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id)`);
```

**Step 7: Verify DB fix**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && ./bin/zero status`
Expected: `Database: Connected` (not Disconnected)

**Step 8: Commit**

```bash
git add src/utils/dbClient.js
git commit -m "fix(db): split multi-statement SQL for PGlite compatibility

PGlite rejects multiple statements in a single query() call.
Split CREATE TABLE + CREATE INDEX into separate calls in the
fallback initialization path (job_events, tool_observations,
graph_nodes, graph_edges)."
```

---

## Task 2: Security Audit Fix

**Files:**
- Modify: `package.json` (dependency versions)

**Step 1: Run audit**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npm audit 2>&1 | head -50`
Expected: List of vulnerabilities

**Step 2: Fix vulnerabilities**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npm audit fix`
Expected: Vulnerabilities resolved

**Step 3: Force-fix remaining (if any)**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npm audit fix --force`
Expected: Remaining high/critical vulnerabilities resolved
Note: Review what changed — `--force` may do major version bumps on transitive deps

**Step 4: Verify**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npm audit`
Expected: 0 critical, 0 high vulnerabilities

**Step 5: Verify nothing broke**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "security: fix critical and high npm audit vulnerabilities

Resolves: fast-xml-parser RangeError DoS, axios prototype pollution,
tar hardlink traversal, minimatch ReDoS, qs prototype injection."
```

---

## Task 3: Upgrade Zod 3 → 4

**Files:**
- Modify: `package.json` (zod version)
- Audit: `src/core/schemas/index.js` (main schema registry)
- Audit: ALL files using `z.` from zod

**Step 1: Install Zod 4**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npm install zod@^4.0.0`
Expected: zod@4.x.x installed

**Step 2: Check for breaking patterns**

Search for these Zod 3 patterns that break in v4:
- `invalid_type_error` option (removed)
- `required_error` option (removed)
- `ZodInvalidTypeIssue` type references (renamed)
- `z.coerce` usage (behavior changed)

Run: Grep for `invalid_type_error|required_error|ZodInvalidTypeIssue|ZodIssue` in `src/`

**Step 3: Fix any breaking patterns found**

If `invalid_type_error`/`required_error` found, replace with `.refine()` or custom error maps.
If `ZodIssue` subtypes referenced, update to `z.core.$ZodIssue*` equivalents.

**Step 4: Verify schemas still work**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npm test`
Expected: All 37 tests pass

**Step 5: Verify server starts**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | timeout 5 node src/server/mcpServer.js --stdio 2>/dev/null | head -5`
Expected: Server responds with initialize result

**Step 6: Commit**

```bash
git add package.json package-lock.json src/
git commit -m "feat: upgrade Zod 3 → 4

Zod 4 required by MCP SDK v2. Schema definitions are largely
API-compatible. Fixed any breaking pattern changes."
```

---

## Task 4: MCP SDK v2 Package Migration

**Files:**
- Modify: `package.json` (remove 1 package, add 4)
- Modify: `src/server/mcpServer.js:20-22,1760` (import paths)
- Modify: `tests/test-mcp-server.js:3` (import path)
- Modify: `scripts/setup-claude-code.js:231` (import path)

**Step 1: Swap packages**

Run:
```bash
cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp
npm uninstall @modelcontextprotocol/sdk
npm install @modelcontextprotocol/server @modelcontextprotocol/client @modelcontextprotocol/core @modelcontextprotocol/node
```
Expected: Old package removed, 4 new packages installed

**Step 2: Update imports in mcpServer.js (lines 20-22)**

Find:
```javascript
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
```

Replace with:
```javascript
const { McpServer, StdioServerTransport } = require('@modelcontextprotocol/server');
const { NodeStreamableHTTPServerTransport } = require('@modelcontextprotocol/node');
```

Note: `SSEServerTransport` is **removed** in v2. All SSE endpoints must migrate to `NodeStreamableHTTPServerTransport`. This is handled in Task 6 (Transport Migration).

**Step 3: Update StreamableHTTP import (line 1760)**

Find:
```javascript
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
```

Replace with:
```javascript
const { NodeStreamableHTTPServerTransport } = require('@modelcontextprotocol/node');
```

Note: This import is inside a conditional block. Since we already import `NodeStreamableHTTPServerTransport` at the top (Step 2), we can reference it directly here and remove this require.

**Step 4: Update test import (tests/test-mcp-server.js:3)**

Find:
```javascript
const { Server } = require('@modelcontextprotocol/sdk/server');
```

Replace with:
```javascript
const { McpServer: Server } = require('@modelcontextprotocol/server');
```

**Step 5: Update setup script import (scripts/setup-claude-code.js:231)**

Find:
```javascript
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
```

Replace with:
```javascript
const { McpServer } = require('@modelcontextprotocol/server');
```

**Step 6: Search for any remaining SDK imports**

Run: Grep for `@modelcontextprotocol/sdk` across entire project
Expected: 0 matches

**Step 7: Verify server loads**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && node -e "require('./src/server/mcpServer.js')" 2>&1 | head -5`
Expected: No import errors

**Step 8: Commit**

```bash
git add package.json package-lock.json src/server/mcpServer.js tests/test-mcp-server.js scripts/setup-claude-code.js
git commit -m "feat: migrate to MCP SDK v2 package split

Replace monolithic @modelcontextprotocol/sdk with:
- @modelcontextprotocol/server (McpServer, StdioServerTransport)
- @modelcontextprotocol/client (Client)
- @modelcontextprotocol/core (types, schemas)
- @modelcontextprotocol/node (NodeStreamableHTTPServerTransport)

SSEServerTransport removed in v2 — SSE migration in next commit."
```

---

## Task 5: Ensure registerTool inputSchema uses z.object()

**Files:**
- Modify: `src/server/mcpServer.js:507-514` (register wrapper)
- Audit: `src/core/schemas/index.js` (schema definitions)
- Audit: All schemas passed to `register()` calls

**Step 1: Read current register() wrapper**

Read `src/server/mcpServer.js` lines 507-514:
```javascript
function register(name, schema, handler) {
  if (shouldExpose(name)) {
    const description = schema?.description || schema?._def?.description || '';
    server.registerTool(name, { inputSchema: schema, description }, handler);
  }
}
```

**Step 2: Check if schemas are already z.object() wrapped**

Read `src/core/schemas/index.js` to check if exported schemas are `z.object({...})` instances or raw shape objects `{key: z.string()}`.

MCP SDK v2 requires `inputSchema` to be a `z.object()` instance, not a raw shape.

**Step 3: Update register() wrapper to auto-wrap if needed**

If schemas are raw shapes, update the wrapper:

```javascript
function register(name, schema, handler) {
  if (shouldExpose(name)) {
    const description = schema?.description || schema?._def?.description || '';
    // v2: inputSchema must be a ZodObject, not a raw shape
    const inputSchema = schema instanceof z.ZodObject ? schema
      : (schema && typeof schema === 'object' && !schema._def) ? z.object(schema)
      : schema;
    server.registerTool(name, { inputSchema, description }, handler);
  }
}
```

If schemas are already `z.object()` instances, no change needed.

**Step 4: Check inline schemas in tool registrations**

Search for `register(` calls with inline `{ key: z.string() }` patterns (lines 1373-1620).
These inline schemas are raw shapes and need `z.object()` wrapping.

Example fix for session tools (line 1373):
```javascript
// BEFORE
register("undo", { sessionId: z.string().optional().describe("Session ID") }, ...)

// AFTER
register("undo", z.object({ sessionId: z.string().optional().describe("Session ID") }), ...)
```

**Step 5: Verify all tools register**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | timeout 5 node src/server/mcpServer.js --stdio 2>/dev/null | head -5`
Expected: Server initializes, reports correct tool count

**Step 6: Commit**

```bash
git add src/server/mcpServer.js src/core/schemas/
git commit -m "fix: ensure all tool schemas are z.object() for MCP SDK v2

MCP SDK v2 requires inputSchema to be a ZodObject instance.
Auto-wrap raw shape objects in the register() helper."
```

---

## Task 6: SSE Transport Migration to Streamable HTTP

**Files:**
- Modify: `src/server/mcpServer.js:1776-1815` (SSE endpoint)
- Modify: `src/server/mcpServer.js:20-22` (already done in Task 4)

**Step 1: Read current SSE implementation**

Read `src/server/mcpServer.js` lines 1776-1860 to understand SSE connection management.

**Step 2: Replace SSE endpoint with Streamable HTTP**

The SSE endpoint (`GET /sse` + `POST /messages`) must be replaced with Streamable HTTP (`ALL /mcp`).

Find the SSE endpoint block (approximately lines 1776-1815):
```javascript
app.get('/sse', authenticate, async (req, res) => {
  // ... SSE connection setup
  const transport = new SSEServerTransport('/messages', res);
  // ... connection management
});
```

Replace with a unified Streamable HTTP endpoint:
```javascript
// Streamable HTTP transport (replaces deprecated SSE transport in MCP SDK v2)
app.all('/mcp', authenticate, async (req, res) => {
  try {
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: () => uuidv4(),
      enableDnsRebindingProtection: true,
    });
    res.on('close', () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    logger.error('Streamable HTTP transport error', { error: e.message });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Transport error' });
    }
  }
});
```

**Step 3: Remove SSEServerTransport references**

- Remove `sseConnections` Map (if defined)
- Remove `lastSseTransport` variable (if defined)
- Remove `POST /messages` endpoint (SSE message handler)
- Remove any `SSEServerTransport` cleanup code

**Step 4: Remove the old conditional StreamableHTTP block (lines 1757-1774)**

Since we now have a unified `/mcp` endpoint and the import is at the top of the file, remove the old conditional `StreamableHTTPServerTransport` block that was feature-flagged.

**Step 5: Update SSE job events endpoint**

The `GET /jobs/:jobId/events` endpoint (line 1818) is a custom SSE stream for job progress, NOT an MCP transport. This endpoint should **remain** as-is — it's application-level SSE, not protocol-level SSE.

**Step 6: Verify HTTP transport**

Run: Start server with `node src/server/mcpServer.js` and verify it starts without errors.
Expected: No SSE transport warnings, Streamable HTTP endpoint active.

**Step 7: Commit**

```bash
git add src/server/mcpServer.js
git commit -m "feat: replace SSE transport with Streamable HTTP (MCP SDK v2)

SSEServerTransport removed in MCP SDK v2. Migrate protocol transport
to NodeStreamableHTTPServerTransport from @modelcontextprotocol/node.
Application-level SSE (job events) preserved."
```

---

## Task 7: Migrate Prompt Registration to registerPrompt()

**Files:**
- Modify: `src/server/mcpServer.js:779-898` (prompt registration)

**Step 1: Read current prompt implementation**

Read `src/server/mcpServer.js` lines 779-898.

Current pattern uses `server.setPromptRequestHandlers()` with a Map of prompts and manual list/get handlers.

**Step 2: Migrate to server.registerPrompt()**

Replace the entire `setPromptRequestHandlers` block with individual `registerPrompt` calls:

```javascript
if (config.mcp?.features?.prompts) {
  server.registerPrompt(
    'planning_prompt',
    {
      description: 'Generate sophisticated multi-agent research plan using advanced XML tagging and domain-aware query decomposition',
      argsSchema: z.object({
        query: z.string().describe('Research query to decompose into specialized sub-queries'),
        domain: z.string().optional().describe('Primary domain: general, technical, reasoning, search, creative'),
        complexity: z.string().optional().describe('Query complexity: simple, moderate, complex'),
        maxAgents: z.string().optional().describe('Maximum number of research agents (1-10)')
      })
    },
    async ({ query, domain, complexity, maxAgents }) => {
      if (!query) {
        return {
          messages: [{ role: 'assistant', content: { type: 'text', text: 'Please provide a query parameter to generate a research plan.' } }]
        };
      }
      const p = require('../agents/planningAgent');
      const planResult = await p.planResearch(query, { domain, complexity, maxAgents }, null, 'prompt');
      return {
        messages: [{ role: 'assistant', content: { type: 'text', text: planResult } }]
      };
    }
  );

  server.registerPrompt(
    'synthesis_prompt',
    {
      description: 'Synthesize ensemble research results with rigorous citation framework and confidence scoring',
      argsSchema: z.object({
        query: z.string().describe('Original research query for synthesis context'),
        results: z.string().describe('JSON string of research results to synthesize'),
        outputFormat: z.string().optional().describe('Output format: report, briefing, bullet_points'),
        audienceLevel: z.string().optional().describe('Target audience: beginner, intermediate, expert')
      })
    },
    async ({ query, results, outputFormat, audienceLevel }) => {
      const c = require('../agents/contextAgent');
      let parsedResults = [];
      try { parsedResults = results ? JSON.parse(results) : []; } catch (e) { parsedResults = []; }
      let synthesisResult = '';
      for await (const ch of c.contextualizeResultsStream(query, parsedResults, [], {
        includeSources: true,
        outputFormat: outputFormat || 'report',
        audienceLevel: audienceLevel || 'intermediate'
      }, 'prompt')) {
        if (ch.content) synthesisResult += ch.content;
      }
      return {
        messages: [{ role: 'assistant', content: { type: 'text', text: synthesisResult } }]
      };
    }
  );

  server.registerPrompt(
    'research_workflow_prompt',
    {
      description: 'Complete research workflow: planning → parallel execution → synthesis with quality controls',
      argsSchema: z.object({
        topic: z.string().describe('Research topic or question'),
        costBudget: z.string().optional().describe('Cost preference: low, high'),
        async: z.string().optional().describe('Use async job processing: true, false')
      })
    },
    async ({ topic, costBudget, async: asyncMode }) => {
      const safeTopic = topic || '[your_topic]';
      const workflowGuide = `# Research Workflow for: ${safeTopic}\n\n## 1. Planning Phase\n...(workflow content)...`;
      return {
        messages: [{ role: 'assistant', content: { type: 'text', text: workflowGuide } }]
      };
    }
  );
}
```

**Step 3: Verify prompts register**

Run: `echo '{"jsonrpc":"2.0","id":2,"method":"prompts/list","params":{}}' | ...`
Expected: Lists 3 prompts

**Step 4: Commit**

```bash
git add src/server/mcpServer.js
git commit -m "feat: migrate prompts to server.registerPrompt() (MCP SDK v2)

Replace setPromptRequestHandlers() with individual registerPrompt()
calls per the MCP SDK v2 API."
```

---

## Task 8: Migrate Resource Registration to registerResource()

**Files:**
- Modify: `src/server/mcpServer.js:903-1180` (resource registration)

**Step 1: Read current resource implementation**

Read `src/server/mcpServer.js` lines 903-1180.

Current pattern uses `server.setResourceRequestHandlers()` with a Map of resources and manual list/read handlers.

**Step 2: Migrate to server.registerResource()**

Replace the `setResourceRequestHandlers` block with individual `registerResource` calls.

For each resource in the Map, convert to:
```javascript
server.registerResource(
  'research-viewer',           // name (unique key)
  'ui://research/viewer',      // URI
  {},                          // metadata (empty object for now)
  async (uri) => {
    return {
      contents: [{
        uri: 'ui://research/viewer',
        mimeType: 'text/html+mcp',
        text: JSON.stringify(content, null, 2)
      }]
    };
  }
);
```

Repeat for all 9 resources:
1. `ui://research/viewer`
2. `ui://knowledge/graph`
3. `ui://timeline/session`
4. `mcp://specs/core`
5. `mcp://tools/catalog`
6. `mcp://patterns/workflows`
7. `mcp://examples/multimodal`
8. `mcp://use-cases/domains`
9. `mcp://optimization/caching`

**Step 3: Verify resources register**

Run: `echo '{"jsonrpc":"2.0","id":3,"method":"resources/list","params":{}}' | ...`
Expected: Lists 9 resources

**Step 4: Commit**

```bash
git add src/server/mcpServer.js
git commit -m "feat: migrate resources to server.registerResource() (MCP SDK v2)

Replace setResourceRequestHandlers() with individual registerResource()
calls per the MCP SDK v2 API."
```

---

## Task 9: Upgrade Express 4 → 5

**Files:**
- Modify: `package.json` (express version)
- Audit: `src/server/mcpServer.js` (HTTP routes)

**Step 1: Install Express 5**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npm install express@^5.1.0`
Expected: express@5.x.x installed

**Step 2: Search for breaking patterns**

Run: Grep for `req\.param\(` in `src/`
Run: Grep for `app\.del\(` in `src/`
Run: Grep for `res\.redirect\('back'\)` in `src/`
Run: Grep for `acceptsCharset\b|acceptsEncoding\b|acceptsLanguage\b` in `src/`
Expected: Identify any breaking patterns

**Step 3: Fix any breaking patterns found**

- `req.param('x')` → `req.params.x` or `req.query.x`
- `app.del()` → `app.delete()`
- `res.redirect('back')` → `res.redirect(req.get('Referrer') || '/')`

**Step 4: Verify HTTP server starts**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && node -e "const app = require('express')(); app.listen(0, () => { console.log('OK'); process.exit(0); })"`
Expected: `OK`

**Step 5: Verify full server**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add package.json package-lock.json src/
git commit -m "feat: upgrade Express 4 → 5

Express 5 adds async error handling, removes deprecated methods.
Fixed any breaking API changes (req.param, app.del, etc)."
```

---

## Task 10: Implement Circuit Breaker

**Files:**
- Create: `src/core/circuitBreaker.js`
- Modify: `src/server/mcpServer.js` (wrap API calls)
- Modify: `src/utils/dbClient.js` (wrap DB operations)

**Step 1: Write the failing test**

Create: `tests/unit/circuitBreaker.test.js`

```javascript
const { describe, it, expect, vi } = require('vitest');

// Tests will be written inline during implementation.
// Key test cases:
// 1. Circuit starts CLOSED
// 2. Successful calls keep circuit CLOSED
// 3. N failures transition to OPEN
// 4. OPEN circuit rejects immediately (fail-fast)
// 5. After resetTimeout, circuit transitions to HALF_OPEN
// 6. Success in HALF_OPEN closes circuit
// 7. Failure in HALF_OPEN reopens circuit
// 8. Integration with error taxonomy classify()
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npx vitest run tests/unit/circuitBreaker.test.js`
Expected: FAIL (module not found)

**Step 3: Implement CircuitBreaker class**

Create `src/core/circuitBreaker.js`:

```javascript
'use strict';

const { classify } = require('./errors');

const State = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
});

class CircuitOpenError extends Error {
  constructor(name, nextRetryAt) {
    super(`Circuit "${name}" is OPEN. Retry after ${new Date(nextRetryAt).toISOString()}`);
    this.name = 'CircuitOpenError';
    this.circuitName = name;
    this.nextRetryAt = nextRetryAt;
  }
}

class CircuitBreaker {
  constructor({ name, failureThreshold = 3, resetTimeoutMs = 60000, halfOpenMaxAttempts = 1 } = {}) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.halfOpenMaxAttempts = halfOpenMaxAttempts;

    this.state = State.CLOSED;
    this.failures = 0;
    this.lastFailureTime = 0;
    this.halfOpenAttempts = 0;
    this.stats = { totalCalls: 0, totalFailures: 0, totalSuccesses: 0, trips: 0 };
  }

  async execute(fn) {
    this.stats.totalCalls++;

    if (this.state === State.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = State.HALF_OPEN;
        this.halfOpenAttempts = 0;
      } else {
        throw new CircuitOpenError(this.name, this.lastFailureTime + this.resetTimeoutMs);
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure(error);
      throw error;
    }
  }

  _onSuccess() {
    this.stats.totalSuccesses++;
    if (this.state === State.HALF_OPEN) {
      this.state = State.CLOSED;
      this.failures = 0;
      this.halfOpenAttempts = 0;
    } else {
      this.failures = 0;
    }
  }

  _onFailure(error) {
    this.stats.totalFailures++;
    const classification = classify(error);
    const decision = classification?.tripDecision?.decision || 'warn';

    if (decision === 'ignore') return;

    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === State.HALF_OPEN) {
      this.state = State.OPEN;
      this.stats.trips++;
      return;
    }

    if (decision === 'escalate' || decision === 'trip') {
      if (decision === 'escalate' || this.failures >= this.failureThreshold) {
        this.state = State.OPEN;
        this.stats.trips++;
      }
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      nextRetryAt: this.state === State.OPEN ? this.lastFailureTime + this.resetTimeoutMs : null,
      stats: { ...this.stats }
    };
  }

  reset() {
    this.state = State.CLOSED;
    this.failures = 0;
    this.lastFailureTime = 0;
    this.halfOpenAttempts = 0;
  }
}

async function withRetry(fn, { maxRetries = 3, baseDelayMs = 1000, circuit = null } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return circuit ? await circuit.execute(fn) : await fn();
    } catch (error) {
      if (error instanceof CircuitOpenError) throw error;
      if (attempt === maxRetries) throw error;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

module.exports = { CircuitBreaker, CircuitOpenError, State, withRetry };
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npx vitest run tests/unit/circuitBreaker.test.js`
Expected: All tests pass

**Step 5: Wire circuits into server**

Add to `src/server/mcpServer.js` after imports:

```javascript
const { CircuitBreaker, withRetry } = require('../core/circuitBreaker');

const circuits = {
  openrouter: new CircuitBreaker({ name: 'openrouter', failureThreshold: 3, resetTimeoutMs: 60000 }),
  database: new CircuitBreaker({ name: 'database', failureThreshold: 3, resetTimeoutMs: 30000 }),
  embedder: new CircuitBreaker({ name: 'embedder', failureThreshold: 5, resetTimeoutMs: 45000 })
};
```

**Step 6: Wire circuit status into get_server_status**

In the `get_server_status` handler, add circuit breaker states to the response.

**Step 7: Wire circuits into API call paths**

In `src/utils/` or wherever OpenRouter API calls are made, wrap with:
```javascript
const result = await withRetry(
  () => makeOpenRouterCall(params),
  { circuit: circuits.openrouter, maxRetries: 2 }
);
```

**Step 8: Wire circuits into DB operations**

In `src/utils/dbClient.js`, wrap critical DB operations with:
```javascript
const result = await withRetry(
  () => db.query(sql, params),
  { circuit: circuits.database, maxRetries: 1 }
);
```

**Step 9: Verify**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npm test`
Expected: All tests pass

**Step 10: Commit**

```bash
git add src/core/circuitBreaker.js tests/unit/circuitBreaker.test.js src/server/mcpServer.js src/utils/dbClient.js
git commit -m "feat: add circuit breaker with retry and model fallback

Implement CircuitBreaker state machine (CLOSED→OPEN→HALF_OPEN)
with exponential backoff retry. Wired into OpenRouter API calls,
DB operations, and embedding calls. Integrates with semantic
error taxonomy for trip decisions."
```

---

## Task 11: Cleanup and Version Bump

**Files:**
- Modify: `package.json` (version → 2.0.0)
- Modify: `CLAUDE.md` (version references)
- Modify: `README.md` (version references, SDK info)
- Delete: `~/.zero/db` (if recreated with issues)
- Audit: `.gitignore` (ensure .zero/ excluded)

**Step 1: Version bump**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npm version 2.0.0 --no-git-tag-version`
Expected: package.json version updated to 2.0.0

**Step 2: Update CLAUDE.md version references**

Replace all `1.16.0` references with `2.0.0` where appropriate.
Update SDK version references from `1.26.0` to `v2`.
Update MCP SDK package names.

**Step 3: Update README.md**

Update installation instructions, version numbers, SDK references.

**Step 4: Update config.js version**

Find the server version string and update to `2.0.0`.

**Step 5: Clean up staged files**

Check `git status` for any unintended staged files.
Remove `.zero/` from tracking if present.

**Step 6: Final test run**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npm test`
Expected: All tests pass

**Step 7: Verify server starts in all modes**

Run: STDIO mode test
Run: `./bin/zero status`
Expected: Both work

**Step 8: Commit**

```bash
git add -A
git commit -m "chore: release v2.0.0 — MCP SDK v2, Zod 4, Express 5, circuit breakers

BREAKING: Internal dependency changes
- MCP SDK v1 → v2 (4-package split)
- Zod 3 → 4
- Express 4 → 5
- SSE transport → Streamable HTTP

NEW:
- Circuit breaker state machine on API/DB/embedder
- Exponential backoff with jitter
- Model fallback on circuit trip

FIXED:
- PGlite multi-statement SQL in fallback path
- Corrupted DB recovery
- npm audit vulnerabilities"
```

---

## Task 12: Publish to npm + GitHub Release

**Files:**
- None modified (publish step)

**Step 1: Dry-run npm publish**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npm publish --dry-run`
Expected: Shows what would be published, no errors

**Step 2: Publish to npm**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && npm publish --access public`
Expected: Published `@terminals-tech/openrouter-agents@2.0.0`

**Step 3: Verify npm publish**

Run: `npm info @terminals-tech/openrouter-agents version`
Expected: `2.0.0`

**Step 4: Git tag**

Run: `cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp && git tag v2.0.0`

**Step 5: Push to remote**

Run:
```bash
cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp
git push origin release/v2.0.0
git push origin v2.0.0
```

**Step 6: Create GitHub release**

Run:
```bash
cd /Users/terminals/Documents/agents/openrouter-deep-research-mcp
gh release create v2.0.0 --title "v2.0.0 — MCP SDK v2 Migration" --notes "$(cat <<'EOF'
## What's Changed

### Breaking Changes (Internal)
- MCP SDK v1 → v2 (4-package split: `@modelcontextprotocol/server`, `client`, `core`, `node`)
- Zod 3 → 4 (required by MCP SDK v2)
- Express 4 → 5 (async error handling, deprecated method removal)
- SSE server transport → Streamable HTTP transport

### New Features
- Circuit breaker state machine (CLOSED/OPEN/HALF_OPEN) on API, DB, and embedder
- Exponential backoff with jitter on retries
- Model tier fallback when circuits trip
- Prompt registration via `registerPrompt()` (MCP SDK v2 API)
- Resource registration via `registerResource()` (MCP SDK v2 API)

### Bug Fixes
- PGlite multi-statement SQL in fallback initialization path
- Corrupted `~/.zero/db` recovery
- Critical npm audit vulnerabilities (fast-xml-parser, axios, tar)

### Dependencies
- `@modelcontextprotocol/server` (v2)
- `@modelcontextprotocol/client` (v2)
- `@modelcontextprotocol/core` (v2)
- `@modelcontextprotocol/node` (v2)
- `zod` ^4.0.0
- `express` ^5.1.0

**Full Changelog**: https://github.com/nicholasb/openrouter-deep-research-mcp/compare/v1.16.0...v2.0.0
EOF
)"
```

**Step 7: Verify GitHub release**

Run: `gh release view v2.0.0`
Expected: Release visible with correct notes

---

## Execution Order & Parallelization

```
Phase 1 (parallel):
  Task 1: Fix DB + multi-statement SQL
  Task 2: Security audit fix
  Task 3: Upgrade Zod 3 → 4

Phase 2 (sequential — depends on Phase 1):
  Task 4: MCP SDK v2 package migration
  Task 5: Ensure z.object() wrapping

Phase 3 (parallel — depends on Phase 2):
  Task 6: SSE → Streamable HTTP transport
  Task 7: Migrate prompts to registerPrompt()
  Task 8: Migrate resources to registerResource()
  Task 9: Upgrade Express 4 → 5
  Task 10: Circuit breaker implementation

Phase 4 (sequential — depends on all above):
  Task 11: Cleanup + version bump
  Task 12: Publish npm + GitHub release
```

## Validation Checkpoints

| After Task | Validate |
|-----------|----------|
| 1 | `./bin/zero status` → Database: Connected |
| 2 | `npm audit` → 0 critical/high |
| 3 | `npm test` → all pass |
| 4 | `node -e "require('./src/server/mcpServer.js')"` → no errors |
| 5 | Server starts, `tools/list` returns correct count |
| 6 | HTTP transport works, no SSE references |
| 7 | `prompts/list` returns 3 prompts |
| 8 | `resources/list` returns 9 resources |
| 9 | `npm test` → all pass |
| 10 | Circuit breaker tests pass |
| 11 | `npm test` + `./bin/zero status` → all green |
| 12 | `npm info` shows 2.0.0, `gh release view` works |
