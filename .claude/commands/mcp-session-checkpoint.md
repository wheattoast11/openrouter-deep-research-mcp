# MCP Session Checkpoint

Create a named checkpoint in the current session for later restoration.

## Instructions

1. Parse the user's input for a checkpoint name
2. Create the checkpoint using `mcp__openrouter-agents__checkpoint` with:
   - `name`: The checkpoint name (use a descriptive name if user doesn't provide one)
   - `sessionId`: "default" (unless user specifies)
3. Confirm the checkpoint was created
4. Show current session state using `mcp__openrouter-agents__session_state`

## Use Cases

- Before making major changes: "before-refactor"
- After successful completion: "working-v1"
- At investigation milestones: "found-root-cause"

## Example Usage

/mcp-session-checkpoint before-refactor
/mcp-session-checkpoint "working state v2"

## Checkpoint Name
$ARGUMENTS
