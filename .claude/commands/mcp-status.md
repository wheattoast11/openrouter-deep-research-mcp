# MCP Server Status Check

Perform a comprehensive health check of the OpenRouter Agents MCP server.

## Instructions

1. Run `mcp__openrouter-agents__ping` to verify basic connectivity
2. Run `mcp__openrouter-agents__get_server_status` for full status
3. Run `mcp__openrouter-agents__history` to see recent research reports
4. Run `mcp__openrouter-agents__task_list` to see any active or recent tasks
5. Present a summary including:
   - Server version and health
   - Database and embedder status
   - Job queue status (queued, running, succeeded, failed)
   - Recent research reports (last 5)
   - Any active tasks
