# OpenRouter Agents MCP Server - LLM Integration Guide

This document provides Claude and other LLMs with everything needed to effectively use the OpenRouter Agents MCP server as an extension of their own capabilities.

## Quick Reference: Core Tools

### Always Available (All Modes)
| Tool | Purpose | Example |
|------|---------|---------|
| `ping` | Health check | `{}` → `{"pong":true}` |
| `get_server_status` | Full server health | `{}` → DB, embedder, jobs, cache status |
| `job_status` | Check async job | `{"job_id":"job_xxx"}` |
| `get_job_status` | Alias for job_status | Same as above |
| `cancel_job` | Cancel running job | `{"job_id":"job_xxx"}` |

### Research Tools
| Tool | Sync/Async | Parameters |
|------|------------|------------|
| `research` | Async (default) | `{"query":"...", "async":true}` returns job_id |
| `conduct_research` | Sync | `{"query":"...", "async":false}` streams results |
| `agent` | Auto-routes | `{"action":"research\|follow_up\|retrieve\|query", ...}` |

### Knowledge Base Tools
| Tool | Purpose | Parameters |
|------|---------|------------|
| `search` | Hybrid BM25+vector search | `{"q":"...", "k":10, "scope":"both\|reports\|docs"}` |
| `retrieve` | Index or SQL query | `{"mode":"index\|sql", "query":"...\|sql":"..."}` |
| `query` | SQL only | `{"sql":"SELECT...", "params":[], "explain":true}` |
| `get_report` | Get report by ID | `{"reportId":"2", "mode":"full\|summary\|truncate"}` |
| `history` | List recent reports | `{"limit":10, "queryFilter":"..."}` |

### Utility Tools
| Tool | Purpose | Example |
|------|---------|---------|
| `date_time` | Current timestamp | `{"format":"iso\|rfc\|epoch"}` |
| `calc` | Math evaluation | `{"expr":"2+2*3", "precision":2}` |
| `list_tools` | List all tools | `{}` |
| `search_tools` | Semantic tool search | `{"query":"find research"}` |

### Session & Time-Travel Tools (NEW in v1.8.0)
| Tool | Purpose | Parameters |
|------|---------|------------|
| `undo` | Undo last action | `{"sessionId":"default"}` |
| `redo` | Redo undone action | `{"sessionId":"default"}` |
| `fork_session` | Create alternate timeline | `{"sessionId":"...", "newSessionId":"..."}` |
| `time_travel` | Navigate to timestamp | `{"timestamp":"2025-12-04T..."}` |
| `session_state` | Get current state | `{"sessionId":"default"}` |
| `checkpoint` | Create named checkpoint | `{"name":"before refactor"}` |

### Knowledge Graph Tools (NEW in v1.8.0)
| Tool | Purpose | Parameters |
|------|---------|------------|
| `graph_traverse` | Explore graph from node | `{"startNode":"report:5", "depth":3, "strategy":"semantic"}` |
| `graph_path` | Find path between nodes | `{"from":"report:1", "to":"report:5"}` |
| `graph_clusters` | Find node clusters | `{}` |
| `graph_pagerank` | Get importance rankings | `{"topK":20}` |
| `graph_patterns` | Find event patterns | `{"n":3}` |
| `graph_stats` | Get graph statistics | `{}` |

---

## Parameter Normalization: How to Call Tools

The server is highly permissive with parameter formats. All of these work:

```javascript
// Structured (preferred)
{"query": "AI safety research", "costPreference": "low"}

// Shorthand aliases
{"q": "AI safety research", "cost": "low"}

// Mixed
{"query": "AI safety research", "cost": "low", "async": true}
```

### Alias Mappings
| Full Name | Short Alias |
|-----------|-------------|
| `query` | `q` |
| `costPreference` | `cost` |
| `audienceLevel` | `aud` |
| `outputFormat` | `fmt` |
| `includeSources` | `src` |
| `images` | `imgs` |
| `textDocuments` | `docs` |
| `structuredData` | `data` |

---

## Workflow Patterns

### Pattern 1: Quick Research (Sync)
```
1. conduct_research {"query": "...", "costPreference": "low"}
   → Streams results, returns report ID
2. get_report {"reportId": "<id>"}
   → Get full report content
```

### Pattern 2: Background Research (Async)
```
1. research {"query": "...", "async": true}
   → Returns {"job_id": "job_xxx", "sse_url": "...", "ui_url": "..."}
2. job_status {"job_id": "job_xxx"}
   → Returns status, progress %, artifacts
3. (Optional) Stream SSE at sse_url for real-time updates
4. get_report {"reportId": "<id from job result>"}
```

### Pattern 3: Knowledge Base Query
```
1. search {"q": "previous research on X", "k": 5}
   → Returns matching indexed content
2. retrieve {"mode": "sql", "sql": "SELECT * FROM reports WHERE query ILIKE '%X%'"}
   → Direct SQL access (SELECT only)
```

### Pattern 4: Follow-up Research
```
1. research_follow_up {
     "originalQuery": "...",
     "followUpQuestion": "...",
     "costPreference": "low"
   }
   → Context-aware follow-up using prior research
```

---

## MCP 2025-11-25 Protocol Features

### Task Protocol (SEP-1686)
```javascript
// Get task details
task_get {"taskId": "job_xxx"}

// Get task result
task_result {"taskId": "job_xxx"}

// List all tasks
task_list {"limit": 20, "cursor": "..."}

// Cancel task
task_cancel {"taskId": "job_xxx"}
```

### Sampling with Tools (SEP-1577)
```javascript
sample_message {
  "messages": [{"role": "user", "content": "What is 2+2?"}],
  "model": "google/gemini-2.5-pro",
  "maxTokens": 1000
}
```
> Note: Enables server-side agentic loops using client sampling.

### Elicitation (SEP-1036)
```javascript
elicitation_respond {
  "requestId": "elicit_xxx",
  "response": {"field": "value"}
}
```

---

## Database Schema Reference

### Core Tables
```sql
-- Research reports
SELECT id, query, cost_preference, audience_level, final_report,
       created_at, rating, rating_comment
FROM research_reports;

-- Async jobs
SELECT id, type, status, params, result, progress,
       created_at, started_at, finished_at
FROM jobs;

-- Job events (for SSE streaming)
SELECT id, job_id, event_type, payload, ts
FROM job_events;

-- Vector index (hybrid search)
SELECT id, source_type, source_id, title, content, embedding
FROM doc_index;
```

### Useful Queries
```javascript
// Recent reports with ratings
query {"sql": "SELECT id, query, rating FROM research_reports ORDER BY created_at DESC LIMIT 10"}

// Job statistics
query {"sql": "SELECT status, COUNT(*) FROM jobs GROUP BY status"}

// Search indexed documents
search {"q": "MCP protocol", "k": 5, "scope": "docs"}
```

---

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `Report ID undefined not found` | Missing or malformed reportId | Ensure `{"reportId": "2"}` (string) |
| `query is required when mode="index"` | Missing search query | Provide `{"q": "..."}` or `{"query": "..."}` |
| `Invalid characters` (calc) | Missing expression | Provide `{"expr": "2+2"}` |
| `Job unknown: Not found` | Invalid job ID or job expired | Jobs have 1-hour TTL |

### Validation Tips
1. Always provide required parameters - the server will error on missing params
2. Use string types for IDs (`"2"` not `2`)
3. Check `get_server_status` for current server state before complex operations

---

## Model Configuration

### Available Model Tiers
```javascript
// From environment/config
HIGH_COST_MODELS: ["openai/gpt-5-chat", "anthropic/claude-sonnet-4", "google/gemini-2.5-pro"]
LOW_COST_MODELS: ["deepseek/deepseek-chat-v3.1", "openai/gpt-5-mini", "google/gemini-2.5-flash"]
PLANNING_MODEL: "openai/gpt-5-chat" // For orchestration
```

### Cost Preference Impact
- `"high"`: Uses premium models, better quality, higher token cost
- `"low"`: Uses efficient models, good quality, lower cost (default)

---

## Best Practices for LLM Integration

### 1. Always Check Server Status First
```javascript
get_server_status {}
// Verify: database.initialized, embedder.ready, jobs counts
```

### 2. Use Async for Long-Running Research
```javascript
// For queries expecting >30s processing:
research {"query": "comprehensive analysis of...", "async": true}
// Then poll: job_status {"job_id": "..."}
```

### 3. Leverage the Knowledge Base
```javascript
// Before new research, check existing:
search {"q": "topic of interest", "k": 5}
// Reuse or reference existing reports
```

### 4. Handle Job Lifecycle
```javascript
// Always extract report ID from job result:
const jobResult = await job_status({job_id});
const reportId = jobResult.match(/Report ID: (\d+)/)?.[1];
if (reportId) await get_report({reportId});
```

### 5. Use Structured Parameters
```javascript
// Preferred: explicit parameter names
{"query": "research topic", "costPreference": "low", "outputFormat": "report"}

// Avoid: ambiguous single values (may work but less reliable)
"research topic"
```

---

## Server Modes

The server operates in one of three modes (set via `MODE` env var):

| Mode | Available Tools |
|------|-----------------|
| `AGENT` | `agent` + always-on tools only |
| `MANUAL` | Individual tools (`research`, `search`, `query`, etc.) + always-on |
| `ALL` | Everything (default) |

Always-on tools (available in all modes): `ping`, `get_server_status`, `job_status`, `get_job_status`, `cancel_job`

---

## Integration Checklist

- [ ] Server responding: `ping {}` returns `pong`
- [ ] Database initialized: `get_server_status` shows `database.initialized: true`
- [ ] Embedder ready: `get_server_status` shows `embedder.ready: true`
- [ ] API key configured: `OPENROUTER_API_KEY` set in environment
- [ ] Correct mode: Check `MODE` matches your use case

---

## Changelog Integration

When the server updates, check:
1. `docs/CHANGELOG.md` - Feature additions
2. `docs/MCP-COMPLIANCE-REPORT.md` - Spec compliance status
3. `list_tools {}` - Current tool inventory

---

## Version Info

- **Server Version**: 1.8.0
- **MCP SDK**: 1.21.1
- **MCP Spec**: 2025-06-18 (Nov 2025 ready)
- **Protocol Features**: Task Protocol, Sampling with Tools, Elicitation, Tool Chaining, MCP Apps (SEP-1865)
- **Package Integrations**: @terminals-tech/embeddings, @terminals-tech/graph, @terminals-tech/core

---

## MCP Apps (SEP-1865) - Autonomous UI Surfacing

The server declares `ui://` resources that clients can render as interactive UI components:

### Available UI Resources
| URI | Purpose | Linked Tools |
|-----|---------|--------------|
| `ui://research/viewer` | Interactive report viewer | `research`, `get_report`, `research_follow_up` |
| `ui://knowledge/graph` | Force-directed graph explorer | `search`, `graph_traverse`, `graph_clusters` |
| `ui://timeline/session` | Session timeline with undo/redo | `history`, `undo`, `redo`, `time_travel` |

### Using UI Resources
```javascript
// Read a UI resource to get HTML template
read_resource {"uri": "ui://research/viewer"}
// Returns HTML with embedded JSON-RPC bridge for tool calls

// The UI communicates via postMessage JSON-RPC:
window.parent.postMessage({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'get_report', arguments: { reportId: '5' } }
}, '*');
```

---

## Related Documentation

| File | Purpose |
|------|---------|
| `docs/TOOL-PATTERNS.md` | Detailed tool patterns, gotchas, and error recovery |
| `docs/CHANGELOG.md` | Version history and feature additions |
| `docs/MCP-COMPLIANCE-REPORT.md` | MCP specification compliance status |
| `docs/TESTING-GUIDE-v1.6.0.md` | Comprehensive testing procedures |
| `.claude/commands/` | Slash commands for common workflows |
| `.claude/settings.json` | Pre-configured tool permissions |

---

## Slash Commands Available

```
/mcp-status     - Check server health and recent activity
/mcp-research   - Run a research query (sync)
/mcp-async-research - Run research asynchronously
/mcp-search     - Search the knowledge base
/mcp-query      - Execute SQL query
```

---

## Quick Troubleshooting

| Symptom | Check | Action |
|---------|-------|--------|
| Tools not responding | `ping {}` | Restart server |
| Research fails | `get_server_status` | Check `OPENROUTER_API_KEY` |
| Embeddings slow | `embedder.ready` | Wait for model load |
| Job not found | `task_list {}` | Jobs expire after 1hr |
| Report not found | `history {}` | Check valid report IDs |
