# Command Cookbook

Quick reference for common Zero tasks.

## Research & Search

### I want to research a topic
```bash
zero research "What is quantum computing?"

# With high-cost models (better quality)
zero research "Explain transformer architecture" --cost high

# Skip verification (faster)
zero research "Quick answer" --no-verify
```

### I want to find past research
```bash
zero search "machine learning"

# Limit results
zero search "AI" --limit 5

# JSON output
zero search "neural" --json
```

### I want to see a specific report
```bash
zero show 5

# Full report
zero show 5 --full

# Summary only
zero show 5 --summary
```

### I want follow-up on a report
```bash
zero follow-up 5 "What about the limitations?"
```

## Verification

### I want to verify claims
```bash
zero verify 5
```

### I want to correct a fact
```bash
zero verify 5 --correct "The correct date is 2024, not 2023"
```

### I want to see verification history
```bash
zero verify 5 --history
```

## Knowledge Graph

### I want to see graph statistics
```bash
zero graph stats
```

### I want to explore connections
```bash
zero graph traverse --node report:5

# With depth limit
zero graph traverse --node report:5 --depth 2
```

### I want to find path between topics
```bash
zero graph path --from report:1 --to report:10
```

### I want to find clusters
```bash
zero graph clusters
```

### I want to see important nodes
```bash
zero graph pagerank --top 10
```

## Session Management

### I want to undo my last action
```bash
zero session undo
```

### I want to redo an undone action
```bash
zero session redo
```

### I want to create a checkpoint
```bash
zero session checkpoint "before major changes"
```

### I want to list checkpoints
```bash
zero session list
```

### I want to restore a checkpoint
```bash
zero session restore "checkpoint-name"
```

### I want to time travel
```bash
zero session travel --to "2024-01-15T10:30:00"
```

## Configuration

### I want to see current config
```bash
zero config list
```

### I want to change a setting
```bash
zero config set LOG_LEVEL debug
```

### I want to check my API key
```bash
zero config get OPENROUTER_API_KEY
```

### I want to run setup again
```bash
zero init
```

## Server Operations

### I want to check server health
```bash
zero status
```

### I want to start STDIO mode
```bash
zero --stdio
```

### I want to start HTTP server
```bash
zero --port 3002
```

## Batch Operations

### I want to research multiple topics
```bash
# Via MCP tools (in Claude Code)
batch_research {
  "queries": ["topic1", "topic2", "topic3"],
  "waitForCompletion": true
}
```

### I want to export all reports
```bash
# Via SQL query
zero query "SELECT * FROM research_reports" --json > reports.json
```

## Debugging

### I want verbose output
```bash
LOG_LEVEL=debug zero research "topic"
```

### I want to check database
```bash
zero query "SELECT COUNT(*) FROM research_reports"
```

### I want to see job status
```bash
zero job status <job-id>
```

## Tips & Tricks

### Aliases
| Long | Short |
|------|-------|
| `zero research` | `zero r` |
| `zero search` | `zero s` |
| `zero graph` | `zero g` |
| `zero session` | `zero ss` |
| `zero verify` | `zero v` |
| `zero config` | `zero c` |
| `zero status` | `zero st` |
| `zero help` | `zero h` |

### Environment Variables
```bash
# Set cost preference globally
export COST_PREFERENCE=high

# Enable debug mode
export LOG_LEVEL=debug

# Custom data directory
export DATA_DIR=/path/to/data
```

---

**See also**: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | [GETTING-STARTED.md](./GETTING-STARTED.md)
