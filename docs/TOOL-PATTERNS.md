# OpenRouter Agents MCP Server - Tool Patterns & Gotchas

This document captures learnings, patterns, and common issues when using the MCP server tools.

## Known Issues & Fixes (v1.6.0)

### 1. `sample_message` - Fixed in commit
**Issue**: Calling `samplingHandler.handleSampling()` but method is `createMessage()`
**Fix**: Changed to `samplingHandler.createMessage({ params: p }, ex)`
**Status**: Code fixed, requires server restart

### 2. `get_report` - Parameter Normalization Enhanced
**Issue**: `reportId` coming through as `undefined`
**Fix**: Enhanced parameter normalization to handle:
- `{reportId: "2"}` - standard
- `{reportId: 2}` - number (auto-converted to string)
- `{id: "2"}` - alternate key
- `{report_id: "2"}` - snake_case
- `"2"` - raw string input
**Status**: Code fixed, requires server restart

---

## Tool Input Patterns

### Pattern: Freeform to Structured
The server's `normalizeParamsForTool()` function converts loose inputs to structured params:

```javascript
// All of these work for calc:
{"expr": "2+2"}        // Structured (preferred)
"2+2"                  // Raw string
{"random_string": "2+2"} // Legacy format
```

### Pattern: Mode Detection for `retrieve`
```javascript
// Auto-detects SQL mode:
{"sql": "SELECT * FROM reports"}  // mode becomes "sql"
"SELECT * FROM reports"           // also detected as SQL

// Auto-detects index mode:
{"query": "find research"}        // mode becomes "index"
"find research"                   // also index mode
```

### Pattern: Alias Resolution
```javascript
// These are equivalent:
{"query": "topic", "costPreference": "low"}
{"q": "topic", "cost": "low"}
```

---

## Tool-Specific Gotchas

### `research` / `conduct_research`
- **Gotcha**: Without `query` parameter, runs with empty/default query
- **Solution**: Always provide explicit `query`
- **Gotcha**: `async: true` returns job_id, `async: false` streams
- **Pattern**: Use async for >30s expected research

### `job_status` / `get_job_status`
- **Gotcha**: Jobs have 1-hour TTL, then expire from memory
- **Pattern**: Extract report ID immediately when job completes
- **Pattern**: Use `since_event_id` for incremental polling

### `get_report` / `get_report_content`
- **Gotcha**: Requires string reportId (now auto-converted)
- **Gotcha**: `mode: "summary"` requires semantic embedding
- **Pattern**: Use `mode: "full"` for complete content

### `search`
- **Gotcha**: Requires `q` parameter (not optional)
- **Pattern**: Use `scope: "reports"` for research-only results
- **Pattern**: `k` defaults to 10, increase for broader search

### `query`
- **Gotcha**: Only SELECT statements allowed
- **Gotcha**: Params use PostgreSQL $1, $2 placeholders
- **Pattern**: Use `explain: true` for natural language summary

### `calc`
- **Gotcha**: Requires `expr` parameter explicitly
- **Gotcha**: Error message "Invalid characters" when expr missing
- **Supported**: +, -, *, /, ^, (), decimals

### `date_time`
- **Gotcha**: Format parameter is optional
- **Pattern**: `"iso"`, `"rfc"`, `"epoch"`, `"unix"` (same as epoch)

---

## Workflow Gotchas

### Async Research Lifecycle
```
research → job_id
   ↓
job_status (poll) → status: running/completed/failed
   ↓
When completed: Parse result for "Report ID: X"
   ↓
get_report {reportId: "X"}
```
**Gotcha**: Report ID is in the result message string, needs parsing

### Search Before Research
```
search {q: "topic"} → Check existing knowledge
   ↓
If found: get_report for details
If not found: conduct_research for new synthesis
```
**Pattern**: Avoid redundant research by checking KB first

---

## Parameter Type Coercion

The server attempts to coerce types:

| Parameter | Input | Coerced To |
|-----------|-------|------------|
| reportId | `2` (number) | `"2"` (string) |
| limit | `"10"` (string) | `10` (number) |
| async | `"true"` (string) | `true` (boolean) |
| k | `"5"` (string) | `5` (number) |

---

## Error Recovery Patterns

### Job Not Found
```javascript
// Error: "Job unknown: Not found or invalid job ID"
// Recovery:
1. Check task_list for valid job IDs
2. Jobs expire after 1 hour
3. Use correct job_id format: "job_xxx_yyy"
```

### Report Not Found
```javascript
// Error: "Report ID X not found"
// Recovery:
1. Check history for valid report IDs
2. Ensure reportId is string type
3. Reports persist in DB (don't expire like jobs)
```

### Empty Query
```javascript
// Error: "Query must not be empty"
// Recovery:
1. Always provide explicit query parameter
2. Don't rely on defaults for research
```

---

## Performance Patterns

### Minimize Embeddings
- Embeddings are CPU-intensive (~100ms each)
- Use `mode: "full"` to skip semantic summary
- Batch search requests when possible

### Parallel Tool Calls
These tools can be called in parallel:
- `ping` + `get_server_status` + `history`
- Multiple `search` queries
- `job_status` polling while doing other work

These must be sequential:
- `research` → `job_status` (wait for job_id)
- `job_status` → `get_report` (wait for report_id)

---

## MCP Protocol Notes

### Task vs Job
- **Task**: MCP 2025-11-25 protocol abstraction
- **Job**: Internal server job system
- **Mapping**: task_get/task_result wrap job_status/result

### Sampling
- `sample_message` creates LLM completions via OpenRouter
- Enables server-side agentic loops
- Uses configured models (planning_model default)

### SSE Streaming
- Async jobs provide SSE URL for real-time events
- Connect to `/jobs/{job_id}/events` for streaming
- Events: submitted, progress, completed, failed

---

## Testing Checklist

Before using tools:
- [ ] `ping {}` returns `{"pong": true}`
- [ ] `get_server_status` shows `database.initialized: true`
- [ ] `get_server_status` shows `embedder.ready: true`
- [ ] `list_tools {}` returns expected tools for current mode

After research:
- [ ] Job status shows `completed`
- [ ] Report ID extracted from result
- [ ] `get_report` returns content
- [ ] `history` shows new report
