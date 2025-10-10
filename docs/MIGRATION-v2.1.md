# Migration Guide: v2.0 to v2.1

This guide provides instructions for migrating from version 2.0 to the new 2.1 architecture of the OpenRouter Agents MCP server.

**Version**: 2.1.0
**Date**: October 7, 2025

## 🚀 Key Architectural Changes

Version 2.1 introduces several fundamental architectural shifts focused on the "Zero Orchestrator" concept - a single, intelligent agent that coordinates all operations.

### 1. **Single-Agent Architecture (Breaking Change)**

**Before (v2.0)**:
- MODE defaulted to 'ALL' (21 tools exposed)
- Multiple specialized tools for different operations
- Manual orchestration required

**After (v2.1)**:
- MODE defaults to 'AGENT' (6 tools exposed)
- Single `agent` tool routes all operations
- Zero orchestrator handles planning → research → synthesis automatically

#### Migration Action Required:
```bash
# v2.0 (old)
MODE=ALL  # 21 tools

# v2.1 (new default)
MODE=AGENT  # 6 tools (recommended)
# or explicitly set to maintain old behavior:
MODE=ALL   # 21 tools (backward compatible)
```

### 2. **Asynchronous Operations (Breaking Change)**

**Before (v2.0)**:
- All tools were synchronous
- Immediate responses for all operations

**After (v2.1)**:
- `agent` tool defaults to async mode (`async: true`)
- Returns `{ job_id }` immediately
- Results streamed via WebSocket or job polling

#### Migration Action Required:
```javascript
// v2.0 (old)
const result = await client.callTool({
  name: 'research',
  arguments: { query: 'test' }
});

// v2.1 (new)
const { job_id } = await client.callTool({
  name: 'agent',
  arguments: {
    action: 'research',
    query: 'test',
    async: true  // default in v2.1
  }
});

// Poll for results or use WebSocket streaming
const status = await client.callTool({
  name: 'job_status',
  arguments: { job_id }
});
```

### 3. **@terminals-tech Integration**

**Before (v2.0)**:
- Custom embeddings implementation
- No standardized graph processing

**After (v2.1)**:
- `@terminals-tech/embeddings` with provider switching
- `@terminals-tech/graph` for entity enrichment
- Automatic fallback mechanisms

#### Migration Action Required:
- Install new dependencies (handled automatically)
- Configure embeddings provider in config.js:
```javascript
embeddings: {
  provider: 'terminals-tech', // new default
  model: 'Xenova/all-MiniLM-L6-v2',
  dimension: 384
}
```

### 4. **WebSocket Streaming (New)**

**Before (v2.0)**:
- HTTP/SSE only for streaming
- No real-time job monitoring

**After (v2.1)**:
- WebSocket transport (`/mcp/ws`)
- Real-time job events and tool streaming
- Bidirectional communication

#### Migration Action Required:
```javascript
// New WebSocket client setup
const ws = new WebSocket('ws://localhost:3008/mcp/ws?token=demo');

// Listen for job events
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  switch (message.type) {
    case 'job.started':
      // Job initiated
      break;
    case 'tool.started':
      // Tool execution started
      break;
    case 'tool.delta':
      // Streaming tool output
      break;
    case 'job.result':
      // Final results
      break;
  }
};
```

## 🛠️ Configuration Changes

### Environment Variables (New Defaults)

```bash
# v2.0 (old defaults)
MODE=ALL

# v2.1 (new defaults)
MODE=AGENT                    # Single-agent architecture
EMBEDDINGS_PROVIDER=terminals-tech  # @terminals-tech integration
WS_STREAMING_ENABLED=true     # WebSocket streaming
```

### Config File Updates

The `config.js` file now includes new sections:

```javascript
// New in v2.1
mcp: {
  mode: (process.env.MODE || 'AGENT').toUpperCase(), // AGENT | MANUAL | ALL
  features: {
    prompts: process.env.MCP_PROMPTS_ENABLED !== 'false',
    resources: process.env.MCP_RESOURCES_ENABLED !== 'false'
  }
},

embeddings: {
  provider: 'terminals-tech', // 'terminals-tech' | 'huggingface' | 'gemini'
  model: 'Xenova/all-MiniLM-L6-v2',
  dimension: 384
}
```

## 📊 Tool Changes

### Tools Removed in AGENT Mode
- `research` (use `agent` with `action: 'research'`)
- `retrieve` (use `agent` with `action: 'retrieve'`)
- `research_follow_up` (use `agent` with `action: 'follow_up'`)
- `submit_research` (use `agent` with `action: 'research'`)

### New Tools in v2.1
- `agent` (unified orchestrator)
- Enhanced `job_status` and `cancel_job`
- MCP resources and prompts

## 🔒 Security Enhancements

### Rate Limiting (New)
- Express rate limiting middleware added
- 100 requests per 15-minute window per IP
- JWT-authenticated requests bypass rate limits

### OAuth JWT Validation (Enhanced)
- Improved JWKS caching and validation
- Better error handling and logging

### Security Headers (New)
- Comprehensive security headers middleware
- CORS improvements for production

## 🧪 Testing Changes

### New Test Files
- `tests/streaming-contract.spec.js` (WebSocket streaming)
- `tests/retrieval-fusion.spec.js` (graph + vector + BM25)
- Enhanced `tests/oauth-resource-server.spec.js` (rate limiting)

### Test Commands
```bash
# Run all tests
npm test

# Run specific test suites
node tests/streaming-contract.spec.js
node tests/retrieval-fusion.spec.js
node tests/oauth-resource-server.spec.js
```

## 🚀 Deployment Considerations

### Backward Compatibility
- Setting `MODE=ALL` maintains v2.0 behavior
- All existing integrations continue to work
- No database schema changes required

### Performance Improvements
- Reduced tool surface area in AGENT mode
- Better resource utilization with async processing
- Improved caching with @terminals-tech integrations

### Monitoring Enhancements
- Job lifecycle events for better observability
- Enhanced logging and error reporting
- Real-time status via WebSocket

## 📝 Client Migration Examples

### JavaScript/TypeScript
```javascript
// Before (v2.0)
const result = await client.callTool({
  name: 'research',
  arguments: { query: 'test query' }
});

// After (v2.1)
const { job_id } = await client.callTool({
  name: 'agent',
  arguments: {
    action: 'research',
    query: 'test query',
    async: true
  }
});

// Poll for completion or use WebSocket
const status = await client.callTool({
  name: 'job_status',
  arguments: { job_id }
});
```

### Python
```python
# Before (v2.0)
result = client.call_tool("research", {"query": "test query"})

# After (v2.1)
job_result = client.call_tool("agent", {
    "action": "research",
    "query": "test query",
    "async": True
})
job_id = job_result["job_id"]

# Poll for completion
status = client.call_tool("job_status", {"job_id": job_id})
```

## 🔧 Troubleshooting

### Common Issues

1. **"Too many tools" error**
   - Set `MODE=AGENT` for single-agent mode
   - Or use `MODE=ALL` for backward compatibility

2. **Async operation timeouts**
   - Ensure WebSocket connection for real-time updates
   - Use job polling as fallback

3. **Embeddings errors**
   - Check `@terminals-tech` package installation
   - Verify config.embeddings.provider setting

4. **Rate limiting**
   - Use JWT authentication to bypass rate limits
   - Increase limits for development: adjust express-rate-limit config

### Debug Commands
```bash
# Check current mode
curl http://localhost:3008/about | jq .mode

# List available tools
curl http://localhost:3008/client/list-tools

# Check MCP discovery
curl http://localhost:3008/.well-known/mcp.json

# Monitor job status
curl http://localhost:3008/jobs/{job_id}
```

## 📚 Additional Resources

- [CLAUDE.md](./CLAUDE.md) - Technical guidance for AI agents
- [V2.1-IMPLEMENTATION-COMPLETE.md](./V2.1-IMPLEMENTATION-COMPLETE.md) - Implementation summary
- [GitHub Issues](../../issues) - Report bugs or request features
- [Discord](https://discord.gg/terminals-tech) - Community support

---

*This migration guide covers the transition from v2.0 to v2.1. For previous migrations, see [MIGRATION-v1.6.md](./docs/MIGRATION-v1.6.md).*
