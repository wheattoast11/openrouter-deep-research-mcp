# MCP Batch Research

Run multiple research queries in parallel using the OpenRouter Agents MCP server.

## Instructions

1. Parse the user's input for multiple research topics (comma-separated or numbered list)
2. Run batch research using `mcp__openrouter-agents__batch_research` with:
   - `queries`: Array of research queries
   - `waitForCompletion`: true (to get results immediately)
   - `costPreference`: "low" (default) or "high" for premium models
3. Extract the report IDs from the result
4. For each completed report, retrieve using `mcp__openrouter-agents__get_report`
5. Present a consolidated summary comparing findings across all topics

## Example Usage

/mcp-batch-research "AI safety, quantum computing, climate tech"
/mcp-batch-research topic1, topic2, topic3

## User's Research Topics
$ARGUMENTS
