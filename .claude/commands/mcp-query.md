# MCP SQL Query

Execute a read-only SQL query against the MCP server database.

## Instructions

1. Parse the user's intent and construct a safe SELECT query
2. Execute using `mcp__openrouter-agents__query` with:
   - `sql`: The SELECT statement
   - `params`: Array of parameters for placeholders ($1, $2, etc.)
   - `explain`: true (to get natural language explanation)
3. Present the results in a readable format

## Common Tables
- `research_reports`: id, query, final_report, rating, created_at
- `jobs`: id, type, status, result, created_at
- `doc_index`: id, source_type, title, content

## Query Request
$ARGUMENTS
