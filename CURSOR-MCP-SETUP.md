# Cursor MCP Setup Guide for OpenRouter Research Agents

**Version**: 2.1.1-beta  
**Last Updated**: October 9, 2025  
**Tested**: Windows 11, macOS, Linux

---

## Quick Start (5 Minutes)

### 1. Install the Package

```bash
npm install -g @terminals-tech/openrouter-agents
```

### 2. Set Environment Variables

Create `.env` in your project or set system-wide:

```bash
# Required
OPENROUTER_API_KEY=your_key_here

# Optional (recommended)
PGLITE_DATA_DIR=./researchAgentDB
MODE=ALL
INDEXER_ENABLED=true
```

### 3. Configure Cursor MCP

Create `.cursor/mcp_config.json` in your project root:

```json
{
  "mcpServers": {
    "openrouter-agents": {
      "command": "npx",
      "args": ["@terminals-tech/openrouter-agents", "--stdio"],
      "env": {
        "OPENROUTER_API_KEY": "${OPENROUTER_API_KEY}",
        "PGLITE_DATA_DIR": "./researchAgentDB",
        "MODE": "ALL"
      }
    }
  }
}
```

### 4. Restart Cursor

Tools will be available immediately in the MCP tools panel.

---

## Important Findings from Testing

### ✅ What Works

- **STDIO Transport**: Reliable for tool-based queries
- **Synchronous Research**: `conduct_research` works perfectly in STDIO mode
- **Server Status**: `ping` and `get_server_status` provide instant health checks
- **Knowledge Base**: Hybrid search, past research retrieval all functional
- **Prompts & Resources**: All MCP protocol features properly exposed

### ⚠️ Current Limitations

- **Async Jobs in STDIO**: Job queue requires persistent HTTP server
  - Jobs are created but job worker only runs in HTTP server process
  - **Workaround**: Use synchronous tools (`conduct_research`) or run dedicated HTTP server
- **Multi-Process PGlite**: File-backed database has locking with multiple Node processes
  - Not an issue for single Cursor session
  - Use synchronous research for reliability

### 🔧 Recommended Setup

**For Most Users**: Use **STDIO mode with synchronous research**

```json
{
  "mcpServers": {
    "openrouter-agents": {
      "command": "npx",
      "args": ["@terminals-tech/openrouter-agents", "--stdio"],
      "env": {
        "OPENROUTER_API_KEY": "${OPENROUTER_API_KEY}",
        "MODE": "ALL",
        "INDEXER_ENABLED": "true"
      }
    }
  }
}
```

**For Power Users**: Run dedicated HTTP server + STDIO client

Terminal 1 (Server):
```bash
npm start  # Starts HTTP server on port 3008 with job worker
```

Terminal 2 (Cursor):
```json
{
  "mcpServers": {
    "openrouter-agents-http": {
      "url": "http://localhost:3008",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer ${SERVER_API_KEY}"
      }
    }
  }
}
```

---

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | *required* | OpenRouter API key |
| `SERVER_API_KEY` | random | Auth key for HTTP server |
| `MODE` | `ALL` | Tool exposure: `ALL`, `AGENT`, `MANUAL` |
| `PGLITE_DATA_DIR` | `./researchAgentDB` | Database storage path |
| `INDEXER_ENABLED` | `false` | Enable hybrid BM25+vector search |
| `MAX_RESEARCH_ITERATIONS` | `2` | Max research refinement loops |
| `CACHE_TTL` | `3600` | Cache TTL in seconds |
| `PORT` | `3008` | HTTP server port (if not STDIO) |

### Mode Settings

**MODE=ALL** (Recommended for Cursor)
- Exposes all 40+ tools
- Maximum flexibility
- Best for development and power users

**MODE=AGENT**
- Single `agent` tool with auto-routing
- Simplified interface
- Good for production/constrained environments

**MODE=MANUAL**
- Individual research tools only
- No unified agent
- For specific use cases

---

## Tool Usage in Cursor

### Basic Research

```javascript
// Synchronous (recommended for STDIO)
conduct_research({
  query: "Your research question",
  costPreference: "low",
  audienceLevel: "intermediate",
  outputFormat: "report"
})
```

### Follow-Up Questions

```javascript
research_follow_up({
  originalQuery: "Previous research question",
  followUpQuestion: "Specific follow-up",
  costPreference: "low"
})
```

### Knowledge Base Search

```javascript
// Semantic search
search({
  q: "search query",
  k: 10,
  scope: "both"  // "reports", "docs", or "both"
})

// Past research
get_past_research({
  query: "similar topic",
  limit: 5,
  minSimilarity: 0.75
})
```

### Report Access

```javascript
// Get report by ID
get_report_content({
  reportId: "12345",
  mode: "full"  // "full", "summary", "truncate"
})

// List recent reports
list_research_history({
  limit: 10,
  queryFilter: "optional filter"
})
```

---

## Troubleshooting

### Issue: "Tool not found"

**Cause**: MODE setting doesn't expose that tool  
**Solution**: Set `MODE=ALL` in env config

### Issue: "Job not found" (async queries)

**Cause**: Job worker not running in STDIO mode  
**Solution**: Use `conduct_research` instead of `submit_research`

### Issue: Slow first query

**Cause**: Embedder model loading (5-10s)  
**Solution**: Normal on first query, subsequent queries are fast

### Issue: "Database not initialized"

**Cause**: PGlite initialization in progress  
**Solution**: Wait 5-10 seconds and retry

### Issue: Empty search results

**Cause**: Indexer not enabled or no indexed content  
**Solution**: Set `INDEXER_ENABLED=true` and index some content

---

## Advanced Patterns

### Pattern 1: Research → Index → Retrieve

```javascript
// 1. Research a topic
const report1 = await conduct_research({
  query: "Topic A",
  includeSources: true
});

// 2. Research is auto-indexed (if INDEXER_ENABLED=true)

// 3. Later, search for related topics
const related = await search({
  q: "related topic",
  scope: "reports",
  k: 5
});
```

### Pattern 2: Multi-Stage Research

```javascript
// 1. Initial broad research
const overview = await conduct_research({
  query: "Overview of Topic X",
  outputFormat: "briefing"
});

// 2. Deep dive on specific aspect
const deepDive = await research_follow_up({
  originalQuery: "Overview of Topic X",
  followUpQuestion: "Detailed analysis of Aspect Y",
  costPreference: "high"  // Use better models for depth
});
```

### Pattern 3: Document Analysis

```javascript
// Research with your own documents
conduct_research({
  query: "Analyze these documents for X",
  textDocuments: [
    { name: "doc1.md", content: "..." },
    { name: "doc2.txt", content: "..." }
  ],
  includeSources: false  // No web sources needed
})
```

---

## Performance Tips

1. **Use Caching**: Identical queries return cached results (1hr TTL)
2. **Enable Indexer**: Dramatically speeds up KB queries
3. **Choose Cost Tier**: 
   - `low` for general queries (fast, cheaper)
   - `high` for complex analysis (better quality)
4. **Scope Searches**: Use `scope: "reports"` to search only past research
5. **Sync vs Async**: Use synchronous tools in STDIO mode for reliability

---

## Example Cursor Workflow

```javascript
// 1. Check server health
ping({ info: true })
// Returns: database, embedder, job counts

// 2. Research a topic
conduct_research({
  query: "Best practices for React Server Components in 2025",
  audienceLevel: "expert",
  outputFormat: "report"
})
// Returns: Report ID and content

// 3. Follow up on specific aspect
research_follow_up({
  originalQuery: "Best practices for React Server Components in 2025",
  followUpQuestion: "How do RSC patterns compare to traditional SSR for SEO?",
  costPreference: "low"
})

// 4. Find related past research
get_past_research({
  query: "React Server Components",
  limit: 5
})

// 5. Search indexed content
search({
  q: "server components performance",
  scope: "reports",
  k: 10
})
```

---

## Security Notes

- **API Keys**: Never commit `.env` or `mcp_config.json` with keys
- **Use Variables**: Cursor supports `${ENV_VAR}` in config
- **Local Only**: STDIO mode is completely local (no network exposure)
- **HTTP Server**: If running HTTP mode, use `SERVER_API_KEY` for auth

---

## Getting Help

1. **Server Status**: Run `get_server_status` to check health
2. **Tool List**: Run `list_tools` to see all available tools
3. **Database Health**: Run `db_health` for DB diagnostics
4. **GitHub Issues**: https://github.com/terminals-tech/openrouter-agents

---

## Next Steps

1. ✅ Install and configure (5 minutes)
2. ✅ Test with simple query: `ping({ info: true })`
3. ✅ Run first research: `conduct_research({ query: "..." })`
4. ✅ Explore tools: `list_tools({ semantic: false })`
5. ✅ Read prompt templates: See `PROMPT-TEMPLATES.md`

---

**Version**: 2.1.1-beta  
**Support**: admin@terminals.tech  
**License**: MIT



