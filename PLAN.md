# Consilience-Driven Enhancement Plan for OpenRouter Agents MCP Server

**Date:** December 15, 2025
**Branch:** private/secret-sauce
**Version:** 1.9.1 → 1.10.0
**Principle:** ZERO REGRESSION - Augment, Don't Break

---

## Executive Summary

This plan synthesizes findings from multiple research vectors using a consilience approach:
1. **Skywork Article Review** - External perception and praised features
2. **PGlite Documentation** - Available extensions and WASM patterns
3. **MCP Spec Research** - December 2025 updates and draft SEPs
4. **Codebase Exploration** - Current secret-sauce capabilities
5. **Multi-Agent Orchestration Patterns** - Best practices for 2026

The goal: Enhance the server to be the **gold standard north star** for MCP servers while ensuring **zero regression** and positioning "Zero" as an emergent force through terminals.tech.

---

## Part 1: Skywork Article Analysis

### Praised Features (Keep & Enhance)
- **Multi-agent architecture** - Research/Planning/Context/FactCheck agents
- **PGlite with pgvector in WASM** - Self-contained, no external DB
- **Model diversity & cost optimization** - Round-robin, fallbacks
- **"Specialized, high-performance appliance"** - Not trying to be everything

### Gaps Since Review (Already Addressed in v1.8-1.9)
- Session time-travel (undo/redo/checkpoint)
- Knowledge graph integration
- Signal Protocol for multi-model consensus
- Verification pipeline (hallucination prevention)
- Web grounding for real-time data
- MCP 2025-11-25 draft spec compliance

### Perception Opportunity
The article positions us as a "specialized appliance" - we should lean into this while expanding capabilities to establish market dominance in the multi-agent MCP space.

---

## Part 2: Enhancement Vectors (Prioritized)

### Vector A: PGlite Extension Enablement [LOW RISK, HIGH VALUE]

**Current State:** Only `vector` extension enabled
**Enhancement:** Enable additional contrib extensions for superior search

```javascript
// Current (dbClient.js)
const { vector } = require('@electric-sql/pglite/vector');

// Enhanced
const { vector } = require('@electric-sql/pglite/vector');
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
const { fuzzystrmatch } = require('@electric-sql/pglite/contrib/fuzzystrmatch');
const { unaccent } = require('@electric-sql/pglite/contrib/unaccent');
```

**Benefits:**
- `pg_trgm`: Trigram-based similarity search (GIN index support)
- `fuzzystrmatch`: Soundex, Levenshtein, Metaphone for typo tolerance
- `unaccent`: Accent-insensitive search (café → cafe)

**Regression Risk:** NONE - Additive only, existing vector search unchanged

**Implementation:**
1. Add extensions to PGlite initialization
2. Create GIN indexes on content columns
3. Add `similarity()` and `soundex()` to hybrid search
4. Enable via `PGLITE_ENHANCED_SEARCH=true` feature flag

---

### Vector B: HTTP Proxy Support for Web Research [LOW RISK, HIGH VALUE]

**Current State:** robustWebScraper.js uses direct connections
**Enhancement:** Route through user's proxy to bypass 403/IP restrictions

```javascript
// config.js addition
proxy: {
  httpProxy: process.env.HTTP_PROXY || process.env.http_proxy,
  httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy,
  noProxy: process.env.NO_PROXY || 'localhost,127.0.0.1',
  userProxyUrl: process.env.USER_PROXY_URL, // e.g., socks5://localhost:1080
}
```

**Implementation in robustWebScraper.js:**
```javascript
const axiosConfig = {
  timeout: 10000,
  headers: { 'User-Agent': this.getRandomUserAgent() },
  ...(config.proxy?.userProxyUrl && {
    proxy: false,
    httpsAgent: new SocksProxyAgent(config.proxy.userProxyUrl)
  })
};
```

**Benefits:**
- Bypass geo-restrictions and IP blocks
- Use local tunnel (cloudflared already included)
- Support SOCKS5, HTTP, HTTPS proxies

**Regression Risk:** NONE - Falls back to direct connection if no proxy

---

### Vector C: Browser Research Subagent [MEDIUM RISK, HIGH VALUE]

**Current State:**
- `src/browser/types.ts` defines comprehensive browser MCP types
- `src/utils/robustWebScraper.js` handles web fetching
- No actual browser automation

**Enhancement:** Add specialized BrowserResearchAgent for JavaScript-heavy sites

**Architecture:**
```
src/agents/
  ├── researchAgent.js      (existing)
  ├── planningAgent.js      (existing)
  ├── contextAgent.js       (existing)
  ├── factCheckAgent.js     (existing)
  └── browserResearchAgent.js (NEW)
```

**BrowserResearchAgent Capabilities:**
1. **Playwright-based extraction** - Handle SPAs, dynamic content
2. **Screenshot analysis** - Use vision models for UI understanding
3. **Form interaction** - Search forms, filters, pagination
4. **Proxy support** - Route through user's configured proxy
5. **Resource caching** - Reuse browser context for related queries

**Feature Flag:** `BROWSER_RESEARCH_ENABLED=true`

**Regression Risk:** MEDIUM - New dependency (Playwright), but isolated behind flag

**Integration with Existing:**
```javascript
// In researchAgent.js queryNeedsWebGrounding()
if (this.queryNeedsBrowserResearch(query)) {
  // Delegate to BrowserResearchAgent for JS-heavy sites
  const browserAgent = require('./browserResearchAgent');
  return browserAgent.extractContent(url, query, requestId);
}

// Detection patterns for browser-needed sites
const BROWSER_REQUIRED_DOMAINS = [
  /twitter\.com|x\.com/i,    // Heavy JS
  /linkedin\.com/i,          // Auth walls
  /reddit\.com/i,            // Dynamic loading
  /medium\.com/i,            // Paywalls
];
```

---

### Vector D: Live Queries for Reactive Knowledge Base [MEDIUM RISK, HIGH VALUE]

**Current State:** Standard query/response pattern
**Enhancement:** PGlite live queries for real-time KB subscriptions

```javascript
import { live } from '@electric-sql/pglite/live';

// In dbClient.js
const db = await PGlite.create({
  extensions: { vector, pg_trgm, live }
});

// Reactive subscription
const unsubscribe = await db.live.query(
  'SELECT * FROM research_reports WHERE query_embedding <=> $1 < 0.3',
  [currentEmbedding],
  (results) => {
    // Notify via MCP notification channel
    notifier.sendResourceUpdate('mcp://reports/live', results);
  }
);
```

**Benefits:**
- Real-time knowledge base updates to clients
- Fits with existing `resources: { subscribe: true, listChanged: true }`
- Enables "knowledge radar" feature

**Integration with UI Resources:**
- `ui://knowledge/graph` can show live updates
- Session timeline auto-updates

---

### Vector E: New UI Resource - Browser Research Viewer [LOW RISK, HIGH VALUE]

**Current UI Resources:**
- `ui://research/viewer` - Report viewer
- `ui://knowledge/graph` - Graph explorer
- `ui://timeline/session` - Session timeline

**New Resource:**
- `ui://browser/research` - Interactive browser research interface

**Features:**
- Visual preview of scraped pages
- Screenshot gallery from browser research
- Manual URL submission for research
- Proxy configuration UI
- Real-time extraction progress

**Implementation:**
```javascript
// In mcpServer.js resources Map
['ui://browser/research', {
  uri: 'ui://browser/research',
  name: 'Browser Research Interface',
  description: 'Interactive browser-based research with visual previews and proxy support',
  mimeType: 'text/html+mcp',
  linkedTools: ['search_web', 'fetch_url', 'research']
}]
```

---

### Vector F: WebSocket Transport (SEP-1288) [LOW RISK, FORWARD-LOOKING]

**Current State:** STDIO, HTTP/SSE, StreamableHTTP
**Enhancement:** Add optional WebSocket transport for SEP-1288 compatibility

**Rationale:**
- SEP-1288 is in progress at MCP Working Group
- Early adoption positions us as spec leaders
- Better for real-time bidirectional communication

**Implementation:**
```javascript
// In mcpServer.js
if (config.mcp?.features?.websocketTransport) {
  const wss = new WebSocketServer({ server: httpServer, path: '/mcp/ws' });

  wss.on('connection', (ws, req) => {
    const sessionId = crypto.randomUUID();
    ws.on('message', (data) => handleMcpMessage(JSON.parse(data), ws, sessionId));
    ws.on('close', () => cleanupSession(sessionId));
  });
}
```

**Feature Flag:** `MCP_WEBSOCKET_TRANSPORT=true`
**Regression Risk:** NONE - Additive, existing transports unchanged

---

### Vector G: Enhanced Signal Protocol for Browser Context [LOW RISK, HIGH VALUE]

**Current Signal Types:** query, response, consensus, crystallization, error

**New Signal Types for Browser Research:**
```javascript
// In src/core/signal.js
const SignalType = {
  // Existing
  QUERY: 'query',
  RESPONSE: 'response',
  CONSENSUS: 'consensus',
  CRYSTALLIZATION: 'crystallization',
  ERROR: 'error',

  // New for browser research
  NAVIGATION: 'navigation',      // URL navigation events
  EXTRACTION: 'extraction',      // Content extraction results
  SCREENSHOT: 'screenshot',      // Visual captures
  INTERACTION: 'interaction',    // Form/click events
};
```

**Benefits:**
- Unified event model across all agents
- Browser research integrates with consensus system
- Fact verification can include visual evidence

---

## Part 3: MCP Spec Compliance Updates

### Current Compliance (2025-06-18 Stable)
- 100% compliant per MCP-COMPLIANCE-REPORT.md

### Forward Compatibility (2025-11-25 Draft)
All SEPs already implemented:
- SEP-1686: Task Protocol
- SEP-1577: Sampling with Tools
- SEP-1036: Elicitation
- SEP-1865: MCP Apps
- SEP-990: Enterprise Auth
- SEP-991: Client Metadata

### New SEPs to Monitor
- **SEP-1288: WebSocket Transport** - Implement in Vector F
- **Streamable HTTP enhancements** - Already supported
- **MCP Apps iteration** - Extend with browser research UI

---

## Part 4: Implementation Phases

### Phase 1: Foundation (Zero Risk)
1. Enable PGlite extensions (pg_trgm, fuzzystrmatch, unaccent)
2. Add HTTP proxy configuration
3. Add WebSocket transport (feature flagged)
4. Update Signal Protocol with new types

**Estimated Impact:** Enhanced search quality, proxy support, future-proofing

### Phase 2: Browser Research (Controlled Risk)
1. Implement BrowserResearchAgent
2. Add `ui://browser/research` resource
3. Integrate with existing verification pipeline
4. Add Playwright as optional dependency

**Feature Flag:** `BROWSER_RESEARCH_ENABLED=false` (default off)

### Phase 3: Live Queries (Controlled Risk)
1. Enable PGlite live extension
2. Implement reactive KB subscriptions
3. Connect to MCP resource notifications
4. Update UI resources for real-time updates

**Feature Flag:** `PGLITE_LIVE_QUERIES=false` (default off)

---

## Part 5: Testing Strategy

### Regression Prevention
1. **Existing test suite must pass** - `npm test`
2. **Mic Drop orchestration test** - 10 parallel queries
3. **MCP compliance verification** - Run compliance checker

### New Tests
1. **PGlite extensions test** - Trigram search, fuzzy match
2. **Proxy routing test** - Mock proxy server
3. **Browser research test** - Playwright extraction
4. **Live queries test** - Subscription updates

### Feature Flag Matrix
| Feature | Flag | Default | Risk |
|---------|------|---------|------|
| Enhanced Search | `PGLITE_ENHANCED_SEARCH` | true | Low |
| Proxy Support | `USER_PROXY_URL` | null | Low |
| WebSocket Transport | `MCP_WEBSOCKET_TRANSPORT` | false | Low |
| Browser Research | `BROWSER_RESEARCH_ENABLED` | false | Medium |
| Live Queries | `PGLITE_LIVE_QUERIES` | false | Medium |

---

## Part 6: Version Bump Strategy

```
v1.9.1 (current) → v1.10.0 (this plan)

Changelog:
- feat(db): Enable pg_trgm, fuzzystrmatch, unaccent extensions
- feat(proxy): Add HTTP/SOCKS proxy support for web research
- feat(transport): Add WebSocket transport (SEP-1288 forward compat)
- feat(browser): Add BrowserResearchAgent for JS-heavy sites
- feat(ui): Add ui://browser/research MCP App resource
- feat(live): Add PGlite live queries for reactive KB
- feat(signal): Extend Signal Protocol with browser event types
```

---

## Part 7: "Zero" Branding Integration

### terminals.tech Paradigm
Position this as the **Zero paradigm manifesting in the MCP world**:

1. **Zero external dependencies** - PGlite WASM, all-in-one
2. **Zero hallucinations** - Verification pipeline with consensus gates
3. **Zero configuration** - Sensible defaults, feature flags for power users
4. **Zero latency (perception)** - Live queries, WebSocket streaming
5. **Zero boundaries** - Browser research bypasses restrictions

### Package Tagline Update
```json
{
  "description": "Zero-config, zero-hallucination MCP server for multi-agent research. The north star for agentic systems."
}
```

---

## Part 8: Decision Points for User

Before implementation, confirm:

1. **PGlite Extensions** - Enable pg_trgm/fuzzystrmatch by default? [Recommended: YES]
2. **Proxy Support** - Add as optional feature? [Recommended: YES]
3. **Browser Research** - Include Playwright dependency? [Recommended: YES, optional]
4. **WebSocket Transport** - Add ahead of SEP-1288 finalization? [Recommended: YES]
5. **Live Queries** - Enable reactive subscriptions? [Recommended: YES, flag off]

---

## Appendix: Research Sources

### PGlite Extensions
- https://pglite.dev/extensions/
- https://github.com/electric-sql/pglite

### MCP Specification
- https://spec.modelcontextprotocol.io/specification/2025-03-26/
- https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/
- SEP-1288: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1288

### Skywork Article
- https://skywork.ai/skypage/en/openrouter-deep-research-ai-engineer/1980459128491122688

---

**Plan Status:** READY FOR REVIEW
**Author:** Claude Opus 4.5 (consilience synthesis)
**Review Required:** User approval before implementation
