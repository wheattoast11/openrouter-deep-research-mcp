# OpenRouter Agents - Claude Code Integration

This directory contains Claude Code-specific configuration for the OpenRouter Agents MCP server.

## Directory Structure

```
.claude/
├── README.md           # This file
├── settings.json       # Tool permissions and hints
├── settings.local.json # Local overrides (not published)
├── commands/           # Slash commands
│   ├── mcp-status.md
│   ├── mcp-research.md
│   ├── mcp-async-research.md
│   ├── mcp-search.md
│   └── mcp-query.md
└── hooks/              # Event hooks
    └── mcp-hints.sh
```

## Slash Commands

| Command | Description | Usage |
|---------|-------------|-------|
| `/mcp-status` | Check server health | Just type `/mcp-status` |
| `/mcp-research` | Run synchronous research | `/mcp-research "your query"` |
| `/mcp-async-research` | Run async research (returns job_id) | `/mcp-async-research "your query"` |
| `/mcp-search` | Search knowledge base | `/mcp-search "search terms"` |
| `/mcp-query` | Execute SQL query | `/mcp-query "SELECT * FROM reports LIMIT 5"` |

## Settings

### settings.json (Published)

Pre-configured tool permissions for all MCP tools:

```json
{
  "permissions": {
    "allow": [
      "mcp__openrouter-agents__ping",
      "mcp__openrouter-agents__get_server_status",
      // ... all tools pre-approved
    ]
  }
}
```

### settings.local.json (Local Only)

Personal overrides - not published with the package:

```json
{
  "env": {
    "OPENROUTER_API_KEY": "sk-or-..."
  }
}
```

## Hooks

### mcp-hints.sh

Triggered on tool calls to provide contextual usage hints:

- Reminds about parameter formats
- Suggests follow-up tools after operations
- Warns about common mistakes

## Installation

### Option 1: Quick Setup (Recommended)

```bash
claude mcp add openrouter-agents -- npx @terminals-tech/openrouter-agents --stdio
```

### Option 2: Interactive Setup

```bash
npx @terminals-tech/openrouter-agents --setup-claude
```

This copies the `.claude/` directory to your project or home directory.

### Option 3: Manual Setup

Copy the `.claude/` directory from the package:

```bash
cp -r node_modules/@terminals-tech/openrouter-agents/.claude ./.claude
```

## Configuration

### Environment Variables

Set in your shell profile or `.env` file:

```bash
export OPENROUTER_API_KEY="sk-or-..."
```

Or in `.mcp.json`:

```json
{
  "mcpServers": {
    "openrouter-agents": {
      "command": "npx",
      "args": ["@terminals-tech/openrouter-agents", "--stdio"],
      "env": {
        "OPENROUTER_API_KEY": "${OPENROUTER_API_KEY}",
        "INDEXER_ENABLED": "true"
      }
    }
  }
}
```

## Troubleshooting

### Commands not appearing

1. Restart Claude Code after copying files
2. Check that `.claude/` is in project root or `~/.claude/`
3. Verify file permissions: `chmod +x .claude/hooks/*.sh`

### Server not responding

1. Check status: `/mcp-status`
2. Verify API key: `echo $OPENROUTER_API_KEY`
3. Check logs in Claude Code terminal

### Tools not available

1. Run `list_tools {}` to verify connection
2. Check `settings.json` permissions
3. Ensure MCP server is running

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - LLM integration guide
- [TOOL-PATTERNS.md](../docs/TOOL-PATTERNS.md) - Detailed tool patterns
- [README.md](../README.md) - Main documentation
