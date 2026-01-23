# Getting Started with Zero

Your first 5 minutes with Zero - from install to first research.

## 45 Seconds to First Value

```bash
# 1. Install globally
npm install -g @terminals-tech/openrouter-agents

# 2. Run setup wizard
zero init

# 3. Try your first research
zero research "What is MCP?"
```

## What Just Happened?

1. **Step 1** installed the `zero` CLI globally
2. **Step 2** ran an interactive wizard that:
   - Prompted for your OpenRouter API key
   - Selected transport mode (STDIO for Claude Code, HTTP for REST)
   - Configured optional features
   - Set up data storage location
3. **Step 3** ran a multi-model research query that:
   - Sent your question to multiple AI models
   - Synthesized their responses
   - Stored the result in the knowledge base
   - Returned a verified report

## Core Commands

| Command | What it does |
|---------|--------------|
| `zero research "topic"` | Research a topic using multiple AI models |
| `zero search "keyword"` | Search past research reports |
| `zero show <id>` | View a specific report |
| `zero verify <id>` | Verify claims in a report |
| `zero status` | Check server health |
| `zero --help` | Show all commands |

## Using with Claude Code

After running `zero init`, add Zero to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "zero": {
      "command": "zero",
      "args": ["--stdio"]
    }
  }
}
```

Then in Claude Code, you'll have access to all Zero tools:
- `research` - Multi-model research
- `search` - Knowledge base search
- `graph_traverse` - Explore knowledge connections
- `undo`/`redo` - Session time travel

## Using with HTTP API

Start the HTTP server:

```bash
zero --port 3002
```

Then make API calls:

```bash
# Health check
curl http://localhost:3002/health

# Research query
curl -X POST http://localhost:3002/research \
  -H "Content-Type: application/json" \
  -d '{"query": "What is machine learning?"}'
```

## Next Steps

- **Search existing knowledge**: `zero search "your topic"`
- **Explore graph connections**: `zero graph stats`
- **Read concepts**: [CONCEPTS.md](./CONCEPTS.md)
- **See all commands**: [COMMAND-COOKBOOK.md](./COMMAND-COOKBOOK.md)
- **Troubleshooting**: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `OPENROUTER_API_KEY` | API key for model access | (required) |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `DATA_DIR` | Where to store data | Platform-specific |

See [ENV-REFERENCE.md](./ENV-REFERENCE.md) for all options.

---

**Need help?** Open an issue at [github.com/terminals-tech/openrouter-agents](https://github.com/terminals-tech/openrouter-agents)
