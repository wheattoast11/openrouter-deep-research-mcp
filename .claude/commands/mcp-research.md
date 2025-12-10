# MCP Research (Sync)

Execute research synchronously. Streams results, returns reportId.

## Steps

1. `get_server_status()` -> verify db/embedder ready
2. `conduct_research({ query: "$ARGUMENTS", costPreference: "low" })`
3. Note `reportId` from completion message
4. `get_report({ reportId: "<id>" })` -> full content

## Options

| Param | Values | Default |
|-------|--------|---------|
| costPreference | "low", "high" | low |
| outputFormat | "report", "briefing", "bullet_points" | report |
| audienceLevel | "beginner", "intermediate", "expert" | intermediate |

## Query
$ARGUMENTS
