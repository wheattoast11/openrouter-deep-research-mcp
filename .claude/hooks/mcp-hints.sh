#!/bin/bash
# MCP Server Usage Hints Hook
# This hook provides contextual hints for MCP tool usage

# Get the tool being called from stdin or env
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"

case "$TOOL_NAME" in
  mcp__openrouter-agents__research)
    echo "Hint: Use 'async: true' for long queries. Extract job_id from response." >&2
    ;;
  mcp__openrouter-agents__get_report)
    echo "Hint: reportId must be a string. Use mode:'summary' for brief content." >&2
    ;;
  mcp__openrouter-agents__search)
    echo "Hint: 'q' parameter required. Use 'scope: reports|docs|both'." >&2
    ;;
  mcp__openrouter-agents__job_status)
    echo "Hint: Jobs expire after 1 hour. Extract report ID from completed jobs." >&2
    ;;
  mcp__openrouter-agents__calc)
    echo "Hint: Use 'expr' parameter. Supports: +,-,*,/,^,()" >&2
    ;;
esac

# Always succeed - hints are optional
exit 0
