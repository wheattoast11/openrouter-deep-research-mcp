# MCP Async Research Workflow

Submit a research query asynchronously and monitor progress.

## Instructions

1. Submit the research using `mcp__openrouter-agents__research` with:
   - `query`: The user's research topic
   - `async`: true (will return a job_id)
2. Note the job_id from the response
3. Poll `mcp__openrouter-agents__job_status` with the job_id every few seconds
4. When status shows "completed", extract the report ID from the result
5. Retrieve the full report using `mcp__openrouter-agents__get_report`
6. Present the findings with citations

## Research Query
$ARGUMENTS
