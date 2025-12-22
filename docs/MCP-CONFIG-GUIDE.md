# MCP Configuration Guide

**Optimized configurations for token efficiency, performance, and agentic workflows**

Version: 1.0.0 | Server: OpenRouter Agents v1.10.0+

---

## Quick Start

| Config File | Use Case | Token Efficiency | Features |
|-------------|----------|------------------|----------|
| `.mcp.optimized.json` | **Recommended** - Full-featured with optimizations | High | All tools, resources, workflows |
| `.mcp.minimal.json` | Token-constrained environments | Maximum | Essential tools only |
| `.mcp.json` | Current default | Medium | Basic feature set |

### Installation

1. **Copy optimized config**:
   ```bash
   cp .mcp.optimized.json .mcp.json
   ```

2. **Set API key** (if not already in environment):
   ```bash
   export OPENROUTER_API_KEY="your-key-here"
   ```

3. **Restart MCP client** to load new configuration

---

## Configuration Profiles

### Optimized Profile (Recommended)

**File**: `.mcp.optimized.json`

**Design Goals**:
- Token efficiency through selective resource exposure
- High performance via async jobs and caching
- Complete agentic workflow coverage
- Minimal abstraction for direct tool access

**Key Optimizations**:

1. **Search Before Research** - Expose `knowledge-base://` resources so clients check existing knowledge before creating new research
   - Saves: ~50-100K tokens per avoided research job
   - Pattern: `search(q) -> if_not_found(conduct_research)`

2. **Async by Default** - Enable `MCP_ENABLE_TASKS=true` for non-blocking research
   - Allows parallel work while research runs
   - Pattern: `research(async:true) -> continue_other_work -> job_status(poll)`

3. **Batch Operations** - Use `batch_research` for 2-10 parallel queries
   - Single tool call vs N calls + polling loop
   - Saves: ~10-20K tokens per batch
   - Pattern: `batch_research(queries, waitForCompletion:true)`

4. **Embedding Cache** - `EMBEDDING_CACHE_SIZE=1000` reduces redundant semantic processing
   - Hit rate: ~60-70% for typical workflows
   - Saves: ~100ms per cached embedding

5. **Selective Resources** - Only expose high-value resources
   - Knowledge base (reports, search) - enables search-before-research
   - UI resources (optional) - for MCP Apps if enabled
   - Omit raw database dumps, full event streams

**Environment Variables**:

| Variable | Value | Rationale |
|----------|-------|-----------|
| `MODE` | `ALL` | Full tool access for maximum flexibility |
| `INDEXER_ENABLED` | `true` | Enable semantic search (core feature) |
| `MCP_ENABLE_TASKS` | `true` | Async job management (performance) |
| `MCP_SAMPLING_TOOLS` | `true` | Server-side agentic loops |
| `LOG_LEVEL` | `info` | Balance between visibility and noise |
| `LOG_OUTPUT` | `stderr` | STDIO-compatible logging |
| `EMBEDDING_CACHE_SIZE` | `1000` | Balance memory vs performance |
| `JOB_TTL_HOURS` | `1` | Reasonable job retention |

**When to Use**:
- General-purpose MCP client integration
- Production deployments
- Token-aware LLM applications
- Clients that support MCP 2025-11-25 draft features

---

### Minimal Profile

**File**: `.mcp.minimal.json`

**Design Goals**:
- Absolute minimum token usage
- Essential tools only
- No optional features

**Key Differences**:

| Feature | Optimized | Minimal |
|---------|-----------|---------|
| Mode | `ALL` (all tools) | `MANUAL` (discrete tools) |
| Resources | Knowledge base + UI | None |
| Logging | `info` level | `warn` level only |
| Cache size | 1000 embeddings | 500 embeddings |
| Protocol features | Full 2025-11-25 | Core only |

**Trade-offs**:
- ✅ Saves: ~20-30% token usage vs optimized
- ❌ Loses: Resource hints, UI surfacing, advanced protocol features
- ❌ Manual workflow management (no resource-driven patterns)

**When to Use**:
- Token-constrained environments (GPT-3.5, Claude Haiku)
- Simple research-only use cases
- Prototyping and testing
- Budget-limited production deployments

---

## Agentic Workflow Patterns

The optimized config supports these documented workflows:

### 1. Search Before Research

**Pattern**: Always check knowledge base before creating new research

```javascript
// Client pseudocode
const existing = await search({q: "topic", k: 5, scope: "reports"});
if (existing.resultCount > 0) {
  // Use existing report
  const report = await get_report({reportId: existing.results[0].id});
} else {
  // Create new research
  const job = await research({query: "topic", async: true});
}
```

**Token Savings**: 50-100K per avoided research
**Resource Dependency**: `knowledge-base://search`
**Documented**: `docs/TOOL-PATTERNS.md` § Workflow Gotchas

---

### 2. Async Research Lifecycle

**Pattern**: Background research with job monitoring

```javascript
// Start async research
const {job_id, sse_url} = await research({
  query: "comprehensive topic analysis",
  async: true,
  costPreference: "low"
});

// Optional: Stream SSE for real-time updates
// connect to sse_url for progress events

// Poll for completion
let status;
do {
  status = await job_status({job_id});
  if (status.status === 'running') {
    await sleep(5000); // Wait 5s between polls
  }
} while (status.status !== 'completed');

// Extract report ID from result
const reportId = status.result.match(/Report ID: (\d+)/)?.[1];
const report = await get_report({reportId});
```

**Token Savings**: Enables parallel work during research
**Performance**: No blocking on 2-7 minute research jobs
**Documented**: `CLAUDE.md` § Workflow Patterns

---

### 3. Batch Parallel Research

**Pattern**: Dispatch multiple queries in single call

```javascript
// Instead of N async calls + polling:
const {results, reportIds} = await batch_research({
  queries: [
    "Non-Euclidean geometry in rendering",
    "Brainwave entrainment for digital art",
    {query: "Las Vegas Sphere technology", costPreference: "high"}
  ],
  waitForCompletion: true,
  timeoutMs: 600000  // 10 min max
});

// All reports ready immediately
for (const id of reportIds) {
  const report = await get_report({reportId: id});
}
```

**Token Savings**: ~10-20K per batch vs sequential
**Performance**: True parallelism (not sequential with waits)
**Documented**: `CLAUDE.md` § Pattern 5 (v1.8.1+)

---

### 4. Session Time-Travel

**Pattern**: Undo/redo and alternate timelines

```javascript
// Undo last action
await undo({sessionId: "default"});

// Fork timeline for what-if analysis
await fork_session({
  sessionId: "default",
  newSessionId: "scenario-a"
});

// Navigate to specific timestamp
await time_travel({
  sessionId: "default",
  timestamp: "2025-12-15T10:30:00Z"
});

// Create named checkpoint
await checkpoint({
  sessionId: "default",
  name: "before-major-refactor"
});
```

**Token Savings**: Negligible (state management)
**Value**: Exploratory analysis, debugging, what-if scenarios
**Documented**: `CLAUDE.md` § Session & Time-Travel Tools

---

## Parameter Normalization

The server automatically normalizes parameter names and types, reducing client-side code:

### Aliases

| Full Parameter | Accepted Aliases |
|----------------|------------------|
| `query` | `q` |
| `costPreference` | `cost` |
| `reportId` | `id`, `report_id` |
| `audienceLevel` | `aud` |
| `outputFormat` | `fmt` |
| `includeSources` | `src` |

### Type Coercion

| Parameter | Input | Coerced To |
|-----------|-------|------------|
| `reportId` | `2` (number) | `"2"` (string) |
| `limit` | `"10"` (string) | `10` (number) |
| `async` | `"true"` (string) | `true` (boolean) |
| `k` | `"5"` (string) | `5` (number) |

### Mode Detection

The `retrieve` tool auto-detects intent:

```javascript
// SQL mode (explicit)
retrieve({sql: "SELECT * FROM reports"})

// SQL mode (auto-detected)
retrieve("SELECT * FROM reports")

// Index mode (explicit)
retrieve({mode: "index", query: "topic"})

// Index mode (auto-detected)
retrieve({query: "topic"})
retrieve("topic")
```

**Documented**: `docs/TOOL-PATTERNS.md` § Tool Input Patterns

---

## Resource Strategy

### Knowledge Base Resources

**Exposed**: `knowledge-base://reports`, `knowledge-base://search`

**Why**: Enable clients to check existing knowledge before creating new research

**Usage**:
```javascript
// Client reads resource
const kbIndex = await read_resource("knowledge-base://search");
// kbIndex contains searchable report metadata

// Search within resource
const matches = kbIndex.filter(r => r.query.includes("topic"));

// Fetch full report
const report = await get_report({reportId: matches[0].id});
```

**Token Impact**: Reading resource costs ~1-2K tokens, but saves 50-100K per avoided research

---

### UI Resources (Optional)

**Exposed** (if `MCP_APPS_ENABLED=true`):
- `ui://research/viewer` - Interactive report viewer
- `ui://knowledge/graph` - Force-directed graph explorer
- `ui://timeline/session` - Session timeline with undo/redo

**Why**: MCP Apps (SEP-1865) for autonomous UI surfacing

**Usage**: Client renders HTML resource with embedded JSON-RPC bridge

**Token Impact**: Minimal (resource read only happens once)

**Documented**: `CLAUDE.md` § MCP Apps (SEP-1865)

---

## Performance Tuning

### Environment Variable Reference

| Variable | Default | Tuning Guidance |
|----------|---------|-----------------|
| `EMBEDDING_CACHE_SIZE` | `1000` | Increase for high-volume semantic search |
| `EMBEDDING_BATCH_SIZE` | `10` | Increase for bulk indexing operations |
| `JOB_TTL_HOURS` | `1` | Increase if clients poll jobs slowly |
| `LOG_LEVEL` | `info` | Set to `warn` to reduce stderr noise |
| `LOG_JSON` | `false` | Set to `true` for structured log aggregation |

### Caching Strategy

**Embedding Cache**:
- LRU cache for semantic embeddings
- Hit rate: ~60-70% for typical workflows
- Configured via `EMBEDDING_CACHE_SIZE`

**Database Query Cache**:
- PostgreSQL built-in query cache
- No explicit configuration needed

**Job Results Cache**:
- In-memory cache for completed jobs
- TTL configured via `JOB_TTL_HOURS`

---

## Migration Guide

### From Default Config

1. **Backup current config**:
   ```bash
   cp .mcp.json .mcp.json.backup
   ```

2. **Copy optimized config**:
   ```bash
   cp .mcp.optimized.json .mcp.json
   ```

3. **Update API key** (if needed):
   ```bash
   # In .mcp.json, ensure:
   "OPENROUTER_API_KEY": "${OPENROUTER_API_KEY}"
   ```

4. **Restart MCP client**

5. **Verify**:
   ```bash
   # Test ping
   claude mcp-call openrouter-agents ping '{}'

   # Check server status
   claude mcp-call openrouter-agents get_server_status '{}'
   ```

### Breaking Changes

None. The optimized config is fully backward-compatible with existing clients.

**New features** (opt-in):
- MCP Apps (set `MCP_APPS_ENABLED=true`)
- Zero Protocol (set experimental flags)

---

## Troubleshooting

### Issue: "Tool not found"

**Cause**: Client expects tool that's not in current mode

**Solution**: Check `MODE` environment variable:
- `ALL` - All tools available
- `MANUAL` - Discrete tools only
- `AGENT` - Single unified agent tool

### Issue: "Resource not found"

**Cause**: Resource not exposed in config or feature disabled

**Solution**:
1. Check `resources.enabled` array in config
2. Verify `INDEXER_ENABLED=true` for knowledge base resources
3. Verify `MCP_APPS_ENABLED=true` for UI resources

### Issue: High token usage

**Solution**:
1. Switch to `.mcp.minimal.json` config
2. Implement search-before-research pattern
3. Use `batch_research` for parallel queries
4. Set `costPreference: "low"` in research calls

### Issue: Slow research performance

**Solution**:
1. Use `async: true` for long-running research
2. Increase `EMBEDDING_CACHE_SIZE` if doing heavy semantic search
3. Check `get_server_status` for embedder readiness
4. Monitor job queue with `task_list` tool

---

## Best Practices

### 1. Always Check Server Status First

```javascript
const status = await get_server_status();
if (!status.database.initialized || !status.embedder.ready) {
  throw new Error("Server not ready");
}
```

### 2. Use Async for Long-Running Research

```javascript
// Good: Non-blocking
const job = await research({query: "...", async: true});

// Bad: Blocks for 2-7 minutes
const report = await conduct_research({query: "..."});
```

### 3. Leverage Knowledge Base

```javascript
// Good: Check first
const existing = await search({q: "topic"});
if (existing.resultCount === 0) {
  await research({query: "topic", async: true});
}

// Bad: Always create new research
await research({query: "topic", async: true});
```

### 4. Handle Job Lifecycle Correctly

```javascript
// Good: Extract report ID
const status = await job_status({job_id});
const reportId = status.result.match(/Report ID: (\d+)/)?.[1];
if (reportId) {
  const report = await get_report({reportId});
}

// Bad: Assume report ID
const report = await get_report({reportId: "6"}); // May not exist
```

### 5. Use Batch for Parallel Queries

```javascript
// Good: Single call, true parallelism
await batch_research({
  queries: ["topic1", "topic2", "topic3"],
  waitForCompletion: true
});

// Bad: Sequential with overhead
for (const topic of ["topic1", "topic2", "topic3"]) {
  await research({query: topic, async: true});
}
// ... polling loop ...
```

---

## Token Efficiency Checklist

- [ ] Using `.mcp.optimized.json` or `.mcp.minimal.json`
- [ ] Implemented search-before-research pattern
- [ ] Using `async: true` for long-running research
- [ ] Using `batch_research` for parallel queries
- [ ] Set `costPreference: "low"` by default
- [ ] Exposing only necessary resources
- [ ] Handling job lifecycle correctly (extract report IDs)
- [ ] Not redundantly reading resources
- [ ] Using parameter aliases where appropriate
- [ ] Leveraging server-side parameter normalization

---

## Advanced Configuration

### Zero Protocol Features (Experimental)

Enable self-referential MCP architecture:

```json
{
  "env": {
    "CORE_HANDLERS_ENABLED": "true",
    "SIGNAL_PROTOCOL_ENABLED": "true",
    "ROLESHIFT_ENABLED": "true",
    "STRICT_SCHEMA_VALIDATION": "true"
  }
}
```

**Features**:
- Signal protocol for inter-agent communication
- Role-shift for bidirectional client/server communication
- Dual-role nodes (peer-to-peer MCP)
- Fixed-point convergence for consensus

**Status**: Experimental (v1.10.0+)
**Documented**: `ZERO.md`, `docs/RFP-USER-JOURNEY.md`

---

### Custom Model Configuration

Override default model tiers:

```json
{
  "env": {
    "HIGH_COST_MODELS": "openai/gpt-5-chat,anthropic/claude-opus-4.5",
    "LOW_COST_MODELS": "deepseek/deepseek-chat-v3.1,openai/gpt-5-mini",
    "PLANNING_MODEL": "anthropic/claude-sonnet-4.5"
  }
}
```

**Impact**:
- `costPreference: "high"` uses HIGH_COST_MODELS
- `costPreference: "low"` uses LOW_COST_MODELS
- Orchestration uses PLANNING_MODEL

---

### Logging Configuration

Production logging setup:

```json
{
  "env": {
    "LOG_LEVEL": "info",
    "LOG_OUTPUT": "stderr",
    "LOG_JSON": "true"
  }
}
```

**Log Levels**:
- `debug` - Detailed diagnostic (development only)
- `info` - General operational messages
- `warn` - Degraded functionality
- `error` - Operation failures

**Output Modes**:
- `stderr` - Traditional stderr (compatible with STDIO transport)
- `mcp` - Use MCP SDK `sendLoggingMessage()` notifications
- `both` - Output to both channels

**JSON Format**: Enable for log aggregation systems (ELK, Splunk, etc.)

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | Complete LLM integration guide |
| `docs/TOOL-PATTERNS.md` | Gotchas and recovery patterns |
| `docs/RFP-USER-JOURNEY.md` | Example end-to-end workflow |
| `docs/CHANGELOG.md` | Version history and features |
| `docs/MCP-COMPLIANCE-REPORT.md` | Protocol compliance status |
| `docs/TESTING-GUIDE.md` | Testing procedures |
| `ZERO.md` | Zero Protocol specification |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-16 | Initial guide with optimized and minimal configs |

---

**Feedback**: Open an issue at the repository or contribute improvements via PR.
