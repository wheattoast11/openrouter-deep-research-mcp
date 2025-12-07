# MCP Graph Explorer

Explore the knowledge graph starting from a node using the OpenRouter Agents MCP server.

## Instructions

1. Parse the user's input for:
   - Node ID (e.g., "report:5") - required
   - Depth (optional, default 3)
   - Strategy (optional: "bfs", "dfs", or "semantic")

2. If the user provides just a number, assume it's a report ID: "report:{number}"

3. Run graph traversal using `mcp__openrouter-agents__graph_traverse` with:
   - `startNode`: The node identifier (e.g., "report:5")
   - `depth`: How many levels to explore (default 3)
   - `strategy`: "semantic" (default), "bfs", or "dfs"

4. Present the graph structure showing:
   - Connected nodes and their relationships
   - Key concepts and topics discovered
   - Paths between related reports

## Example Usage

/mcp-graph-explore report:5
/mcp-graph-explore 5 --depth=2 --strategy=bfs

## User's Graph Query
$ARGUMENTS
