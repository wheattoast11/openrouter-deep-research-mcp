# MCP Async Research

Submit research asynchronously. Returns job_id for tracking.

## Steps

1. `research({ query: "$ARGUMENTS", async: true })` -> note `job_id`
2. `job_status({ job_id: "<id>" })` -> check status
3. When status="succeeded", extract `reportId` from response
4. `get_report({ reportId: "<id>" })` -> full report

## Key Points

- job_id format: `job_<timestamp>_<random>` (e.g., job_1234567890_abc123)
- reportId format: numeric (e.g., "5", "42")
- Do NOT pass job_id to get_report - extract reportId first
- Real-time progress via SSE: `sse_url` in initial response

## Query
$ARGUMENTS
