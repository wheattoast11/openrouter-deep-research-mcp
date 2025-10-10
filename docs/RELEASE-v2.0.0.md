# Release Notes: v2.0.0 - "Agentic Intelligence Platform"

**Release Date**: October 7, 2025  
**Status**: Production Ready  
**Breaking Changes**: None (Fully Backward Compatible)

## 🎯 Executive Summary

Version 2.0 represents a **fundamental paradigm shift** in the OpenRouter Agents architecture. We've evolved from a powerful research tool into a **proactive, bidirectional agentic platform** that:

- Communicates in real-time via WebSocket
- Schedules its own actions and monitors topics proactively
- Builds a persistent knowledge graph that grows with every interaction
- Simplifies complex workflows into "magic" one-liner prompts
- Fully implements MCP resources and prompts specifications

**This is not an incremental update. This is a new way of thinking about human-agent collaboration.**

## 🚀 Major Features

### 1. Bidirectional Communication (WebSocket Transport)

**What**: Real-time, two-way communication between client and agent

**Why**: Move from polling-based status checks to instant, event-driven updates

**How**:
- New WebSocket server at `/mcp/ws`
- Clients can steer agent mid-task: `agent.steer({ new_goal: "..." })`
- Clients receive proactive events: `agent.thinking`, `agent.proactive_suggestion`
- Session-based interaction model

**Impact**: Transforms the agent from a service you call into a partner you collaborate with

### 2. Temporal Awareness & Scheduling

**What**: Cron-based scheduling for proactive, time-based actions

**Why**: Enable continuous monitoring and periodic briefings without manual triggers

**How**:
- New tools: `schedule_action`, `list_schedules`, `cancel_schedule`
- Supports: research, briefing, monitoring actions
- Proactive notifications via WebSocket when schedules trigger

**Impact**: Agent becomes **autonomous**, executing tasks on your behalf continuously

### 3. Universal Knowledge Graph

**What**: Persistent, graph-based memory extracted from all research

**Why**: Enable relationship-based queries and context accumulation over time

**How**:
- New database tables: `graph_nodes`, `graph_edges`
- Automatic entity extraction from every research report
- New tool: `query_graph` for entity-relationship exploration
- 768D vector embeddings for semantic node similarity

**Impact**: Agent **remembers and connects** information, improving over time

### 4. Unified Retrieval (Graph + Vector + BM25)

**What**: Multi-source retrieval synthesis

**Why**: Combine structured knowledge (graph) with unstructured search (vector + BM25)

**How**:
- Enhanced `retrieve` tool queries all three sources
- Returns: `{ knowledge_graph: {...}, search_results: [...] }`
- Intelligent fusion of entity matches + semantic similarity + keyword relevance

**Impact**: More comprehensive, context-aware answers

### 5. "Magic" Workflow Prompts

**What**: Pre-defined, multi-step workflows as simple prompts

**Why**: Hide complexity, make common operations effortless

**Prompts**:
- `summarize_and_learn`: Fetch URL → Research → Extract entities → Store in graph
- `daily_briefing`: Summarize recent KB activity + upcoming schedules
- `continuous_query`: Monitor topic with cron, notify on new info

**Impact**: Complex workflows become **one-liners**

### 6. Full MCP Resource Subscriptions

**What**: Event-driven resource updates via subscription model

**Why**: Enable reactive UIs that respond to server-side changes

**Resources**:
- `mcp://agent/status`: Agent state stream
- `mcp://knowledge_base/updates`: KB change notifications
- `mcp://temporal/schedule`: Scheduled actions list
- Plus all existing resources (tools catalog, workflows, etc.)

**Impact**: Clients can **react in real-time** to agent and knowledge base changes

## 📦 What's New

### New Files

```
src/server/wsTransport.js          # WebSocket transport implementation
src/utils/temporalAgent.js         # Cron-based scheduling
src/utils/graphManager.js          # Knowledge graph management
client/                             # Optional UI add-on (React + WebSocket)
docs/MIGRATION-v2.0.md              # Migration guide
docs/v2.0-ARCHITECTURE.md           # System design
docs/v2.0-USER-JOURNEYS.md          # Usage patterns
docs/CHANGELOG-v2.0.md              # Detailed changelog
docs/QUICKSTART-v2.0.md             # Quick start guide
docs/RELEASE-v2.0.0.md              # This file
```

### New Tools

```javascript
schedule_action      // Schedule recurring agent actions
list_schedules       // View all scheduled tasks
cancel_schedule      // Cancel a schedule
query_graph          // Query knowledge graph entities
```

### New MCP Prompts

```javascript
summarize_and_learn  // Fetch → Research → Learn workflow
daily_briefing       // KB summary + schedule overview
continuous_query     // Continuous monitoring with alerts
```

### New MCP Resources

```javascript
mcp://agent/status               // Agent state stream
mcp://knowledge_base/updates     // KB update notifications
mcp://temporal/schedule          // Scheduled actions list
```

### Database Schema Changes

```sql
-- New tables
CREATE TABLE graph_nodes (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE,
  type TEXT,
  metadata JSONB,
  embedding VECTOR(768),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE graph_edges (
  id SERIAL PRIMARY KEY,
  source_node_id INT,
  target_node_id INT,
  relation_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  UNIQUE (source_node_id, target_node_id, relation_type)
);
```

### Dependencies Added

```json
{
  "ws": "^8.18.3",         // WebSocket server
  "node-cron": "^4.2.1"    // Cron scheduler
}
```

## 🔄 Breaking Changes

**NONE**. v2.0 is 100% backward compatible with v1.6.

All existing tools, APIs, and workflows continue to function unchanged. New features are **additive enhancements**.

## ⚙️ Behavior Changes (Non-Breaking)

### 1. Default Mode

- **v1.6**: `MODE=ALL` (all tools exposed by default)
- **v2.0**: `MODE=AGENT` (unified agent interface by default)

**Migration**: Set `MODE=ALL` in `.env` to preserve v1.6 behavior.

### 2. Always-On Tools (Expanded)

New tools available in all modes:
- `schedule_action`
- `list_schedules`
- `cancel_schedule`
- `query_graph`
- `list_models` (moved from conditional to always-on)

### 3. Enhanced Tool Behavior

**`retrieve`**:
- Now queries knowledge graph + vector + BM25 (was: vector + BM25 only)
- Returns structured response with `knowledge_graph` key

**`agent`**:
- Now honors `async: false` for synchronous execution
- Improved auto-routing intelligence

**`conductResearch`**:
- Auto-extracts entities to knowledge graph (if `GRAPH_AUTO_EXTRACT=true`)
- Adds graph statistics to research metadata

## 🌍 Environment Variables

### New in v2.0

```bash
# WebSocket configuration
WS_HEARTBEAT_INTERVAL=30000        # Ping interval (ms), default: 30000
WS_MAX_CONNECTIONS=100             # Max concurrent sessions, default: 100
ALLOW_WS_NO_AUTH=false             # Require token, default: false

# Temporal agent
TEMPORAL_ENABLED=true              # Enable scheduling, default: true
TEMPORAL_MAX_SCHEDULES=50          # Max schedules, default: 50
TEMPORAL_DEFAULT_TZ=UTC            # Timezone, default: UTC

# Knowledge graph
GRAPH_AUTO_EXTRACT=true            # Auto-extract from reports, default: true
GRAPH_EXTRACTION_MODEL=openai/gpt-5-mini  # Model for extraction
GRAPH_MIN_CONFIDENCE=0.7           # Entity threshold, default: 0.7
```

### Changed Defaults

```bash
MODE=AGENT                         # Was: ALL
MCP_STREAMABLE_HTTP_ENABLED=true  # Unchanged (still true)
MCP_SSE_ENABLED=false              # Was: false (no change, deprecated)
```

## 🐛 Bug Fixes

1. **Job Status**: Fixed `job_status` returning "not found" for valid job IDs
2. **Async Behavior**: Fixed `async: false` being ignored (jobs were always queued)
3. **Idempotency Keys**: Fixed identical keys being generated for distinct requests
4. **Embedder Status**: Fixed `provider`/`model` showing as `null` in server status
5. **Metrics Endpoint**: Fixed `executeQuery` not being exported, causing `/metrics` errors
6. **DB Exports**: Added `executeQuery` and `getDb` exports for background jobs

## ⚡ Performance

- **WebSocket latency**: <1ms (local), ~10-50ms (remote)
- **Knowledge graph queries**: 10-50ms (indexed)
- **Temporal scheduling overhead**: Negligible (<0.1% CPU when idle)
- **All v1.6 optimizations retained**: Caching, parallelism, AIMD concurrency

## 🔒 Security

- WebSocket requires authentication (token via query param)
- Knowledge graph respects existing access controls
- Scheduled actions run in server security context
- All v1.6 security features retained (SSRF protection, secret redaction, SQL injection guards)

## 📊 New Metrics

Exposed via `/metrics` endpoint:

```
websocket_sessions_active          # Current WS connections
websocket_sessions_total           # Lifetime WS connections
temporal_schedules_active          # Active cron schedules
temporal_schedules_total           # Lifetime schedules created
knowledge_graph_nodes_total        # Total entities in graph
knowledge_graph_edges_total        # Total relationships in graph
knowledge_graph_extractions_total  # Lifetime entity extractions
```

## 🧪 Testing

### New Test Suites

```bash
npm run test:ws          # WebSocket transport tests
npm run test:temporal    # Temporal scheduling tests
npm run test:graph       # Knowledge graph tests
npm run test:v2          # Full v2.0 integration suite
```

### Existing Tests

All 13 existing test suites pass without modification:
- ✅ Transport matrix (STDIO, HTTP)
- ✅ Streaming contract
- ✅ OAuth resource server
- ✅ Idempotency & leasing
- ✅ Semantic caching
- ✅ Model routing
- ✅ Security hardening
- ✅ Fault injection
- ✅ Performance benchmarks

## 📚 Documentation

### New Documentation

1. **README.md**: Complete rewrite highlighting agentic paradigm
2. **docs/MIGRATION-v2.0.md**: Step-by-step migration guide
3. **docs/v2.0-ARCHITECTURE.md**: System design and patterns
4. **docs/v2.0-USER-JOURNEYS.md**: Progressive usage examples
5. **docs/QUICKSTART-v2.0.md**: 5-minute quick start
6. **docs/CHANGELOG-v2.0.md**: Detailed technical changelog
7. **client/README.md**: UI add-on documentation

### Updated Documentation

1. **CLAUDE.md**: Added v2.0 section, new file locations, updated commands
2. **package.json**: Updated version, description, added dependencies

## 🎓 Migration Path

### For v1.6 Users

**Option 1: No Changes Required** (Backward Compatible)
- Update to v2.0
- All v1.6 code continues to work
- Optionally set `MODE=ALL` to preserve exact v1.6 tool exposure

**Option 2: Gradual Adoption** (Recommended)
1. Update to v2.0, keep using HTTP transport
2. Experiment with magic prompts (`daily_briefing`, etc.)
3. Add WebSocket client for proactive notifications
4. Use knowledge graph queries for enhanced retrieval
5. Set up scheduled monitoring for key topics

**Option 3: Full v2.0 Experience**
- Use WebSocket for bidirectional communication
- Schedule proactive actions
- Query knowledge graph
- Use magic workflow prompts
- Subscribe to MCP resources

See `docs/MIGRATION-v2.0.md` for code examples.

## 🔮 Roadmap (v2.x)

- **v2.1.0** (Q4 2025): Multi-tenant knowledge graphs with session isolation
- **v2.2.0** (Q1 2026): Voice interface via Gemini 2.5 Live
- **v2.3.0** (Q1 2026): Multi-agent swarms with emergent behavior
- **v2.4.0** (Q2 2026): Federated knowledge graphs across instances

## 👥 For Users

### What You Get

- **Proactive Intelligence**: Agent monitors topics and alerts you
- **Persistent Memory**: Knowledge accumulates across sessions
- **Real-Time Steering**: Adjust focus mid-research
- **Zero-Friction Workflows**: Complex operations via simple commands
- **Event-Driven**: React to agent state and KB changes

### What Stays the Same

- All v1.6 tools work unchanged
- Same authentication model
- Same cost optimization strategies
- Same ensemble research approach
- Same caching mechanisms

### What's New

- WebSocket support (optional)
- Temporal scheduling (optional)
- Knowledge graph (auto-enabled, can disable)
- Magic prompts (opt-in)
- Resource subscriptions (opt-in)

## 👨‍💻 For Developers

### Integration Patterns

**Minimal** (v1.6 compatible):
```javascript
// Nothing changes
await client.callTool({ name: 'agent', arguments: {...} });
```

**Enhanced** (Use new features):
```javascript
// Add WebSocket for proactive updates
const ws = new WebSocket('ws://localhost:3008/mcp/ws?token=TOKEN');
ws.on('message', handleEvent);

// Use magic prompts
await client.getPrompt({ name: 'daily_briefing', arguments: {...} });
```

**Full v2.0** (Complete experience):
```javascript
// HTTP for tools + WebSocket for events + Resource subscriptions
// See docs/QUICKSTART-v2.0.md
```

### API Guarantees

- **Backward Compatibility**: All v1.6 APIs work in v2.0
- **Semantic Versioning**: We follow strict semver
- **Deprecation Policy**: 6-month notice before removing features
- **Migration Support**: Detailed guides and examples provided

## 📦 Installation

### New Installation

```bash
npm install @terminals-tech/openrouter-agents@2.0.0
```

### Upgrade from v1.6

```bash
npm update @terminals-tech/openrouter-agents
```

No code changes required for basic upgrade.

## ⚡ Quick Start

```bash
# Install
npm install @terminals-tech/openrouter-agents

# Configure
cat > .env << EOF
OPENROUTER_API_KEY=sk-or-v1-...
GEMINI_API_KEY=...
MODE=AGENT
SERVER_API_KEY=your-secret
EOF

# Run
npx openrouter-agents
```

See `docs/QUICKSTART-v2.0.md` for complete guide.

## 🎬 Demo: Client Add-On

Optional minimalist UI showcasing v2.0 capabilities:

```bash
cd client
npm install
npm run dev
# Open http://localhost:5173?token=YOUR_SERVER_API_KEY
```

Features:
- Real-time event stream
- Knowledge graph visualization
- Agent steering controls
- Quick action buttons
- Terminals.tech-inspired minimalist design

## 🙏 Acknowledgments

This release was inspired by:
- Model Context Protocol specification team
- Terminals.tech platform architecture
- User feedback on v1.6 limitations
- Research on agentic AI systems and proactive agents

Special thanks to the open-source community for tools like PGlite, OpenRouter, and the MCP SDK.

## 📞 Support

- **Documentation**: See `docs/` folder
- **Migration Help**: Read `docs/MIGRATION-v2.0.md`
- **Issues**: https://github.com/wheattoast11/openrouter-deep-research/issues
- **Email**: admin@terminals.tech
- **Website**: https://terminals.tech

## 🎉 Conclusion

v2.0 is not just an update—it's a **new paradigm** for human-agent collaboration. The agent is no longer a tool you use; it's a **partner that works alongside you continuously**.

We're excited to see what you build with this new platform.

**Welcome to the agentic future.**

---

Released with ❤️ by Terminals.tech  
MIT License © 2025 Tej Desai

