# MCP Session Undo/Redo

Navigate session history using undo, redo, or time-travel.

## Instructions

1. Parse the user's input for the action:
   - "undo" or empty - undo last action
   - "redo" - redo undone action
   - A timestamp or checkpoint name - time travel to that point

2. Execute the appropriate tool:
   - For undo: `mcp__openrouter-agents__undo`
   - For redo: `mcp__openrouter-agents__redo`
   - For timestamp: `mcp__openrouter-agents__time_travel` with the timestamp

3. Show the resulting session state using `mcp__openrouter-agents__session_state`

## Example Usage

/mcp-session-undo              # Undo last action
/mcp-session-undo redo         # Redo last undo
/mcp-session-undo 2025-12-05T10:30:00Z  # Time travel to timestamp

## Action
$ARGUMENTS
