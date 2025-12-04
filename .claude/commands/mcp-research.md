# MCP Research Workflow

Execute a research query using the OpenRouter Agents MCP server.

## Instructions

1. First check server health: `mcp__openrouter-agents__get_server_status`
2. Run the research query provided by the user using `mcp__openrouter-agents__conduct_research` with:
   - `query`: The user's research topic
   - `costPreference`: "low" (default) or "high" for premium models
   - `outputFormat`: "report" (default), "briefing", or "bullet_points"
3. Extract the report ID from the result
4. Retrieve the full report using `mcp__openrouter-agents__get_report` with the reportId
5. Present a summary of the findings to the user with key citations

## User's Research Query
$ARGUMENTS
