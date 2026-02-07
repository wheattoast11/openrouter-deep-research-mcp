# MCP Batch Research

Run multiple queries in parallel. Max 10.

## Steps

1. Parse topics (comma/newline separated)
2. `batch_research({ queries: [...], waitForCompletion: true })`
3. Extract `reportIds` from result
4. `get_report({ reportId })` for each
5. Compare findings

## Options

| Param | Default | Description |
|-------|---------|-------------|
| waitForCompletion | true | Block until all complete |
| costPreference | "low" | "low" or "high" |
| timeoutMs | 300000 | 5 min max wait |

## Example

Input: "AI safety, quantum computing, climate tech"
-> queries: ["AI safety", "quantum computing", "climate tech"]

## Topics
$ARGUMENTS
