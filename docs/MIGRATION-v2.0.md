# Migration Guide: v1.6 → v2.0

## Executive Summary

Version 2.0 represents a **fundamental shift** in the OpenRouter Agents architecture, evolving from a request-response research tool into a **proactive, bidirectional agentic platform**. This migration guide will help you update your integration to leverage the new capabilities.

## What Changed

### 1. Bidirectional Communication (WebSocket Transport)

**Before (v1.6)**: Poll for job status after submission
```javascript
const response = await mcpClient.callTool({
  name: 'submit_research',
  arguments: { query: 'What is PGlite?' }
});

const jobId = JSON.parse(response.content[0].text).job_id;

// Poll for status
setInterval(async () => {
  const status = await mcpClient.callTool({
    name: 'job_status',
    arguments: { job_id: jobId }
  });
  // Check if complete...
}, 5000);
```

**After (v2.0)**: Real-time WebSocket session
```javascript
// Connect via WebSocket
const ws = new WebSocket('ws://localhost:3008/mcp/ws?token=YOUR_TOKEN');

ws.on('message', (data) => {
  const message = JSON.parse(data);
  
  switch (message.type) {
    case 'session.started':
      console.log('Agent session started:', message.payload);
      break;
    case 'agent.thinking':
      console.log('Agent is thinking:', message.payload.thought);
      break;
    case 'agent.status_update':
      console.log('Status:', message.payload.status);
      break;
    case 'temporal.action_triggered':
      console.log('Scheduled action triggered:', message.payload);
      break;
  }
});

// Send commands anytime
ws.send(JSON.stringify({
  type: 'agent.steer',
  payload: { new_goal: 'Focus on recent developments' }
}));
```

### 2. Knowledge Graph & Unified Retrieval

**Before (v1.6)**: Vector-only retrieval
```javascript
const results = await mcpClient.callTool({
  name: 'retrieve',
  arguments: { query: 'PGlite', mode: 'index', k: 10 }
});
```

**After (v2.0)**: Graph + Vector hybrid retrieval
```javascript
const results = await mcpClient.callTool({
  name: 'retrieve',
  arguments: { query: 'PGlite', mode: 'index', k: 10 }
});

// Returns:
{
  "query": "PGlite",
  "knowledge_graph": {
    "entity": {
      "id": 42,
      "name": "PGlite",
      "type": "technology",
      "metadata": { "description": "Lightweight PostgreSQL" }
    },
    "relationships": [
      { "source": "PGlite", "target": "PostgreSQL", "type": "is_a" },
      { "source": "PGlite", "target": "WebAssembly", "type": "uses" }
    ]
  },
  "search_results": [...],
  "retrieval_strategy": "unified_graph_vector"
}
```

### 3. Temporal Awareness & Proactive Actions

**New Capability**: Schedule recurring agent actions
```javascript
// Schedule a daily briefing
await mcpClient.callTool({
  name: 'schedule_action',
  arguments: {
    cronExpression: '0 9 * * *', // 9 AM daily
    action: {
      type: 'briefing',
      query: 'Summarize recent research activity'
    }
  }
});

// The agent will proactively send briefings via WebSocket
```

### 4. "Magic" Workflow Prompts

**New Capability**: Pre-defined, multi-step workflows as simple prompts
```javascript
// Fetch content, research it, and auto-populate knowledge graph
const result = await mcpClient.getPrompt({
  name: 'summarize_and_learn',
  arguments: {
    url: 'https://example.com/article',
    costPreference: 'low'
  }
});

// Continuous monitoring with proactive notifications
const monitor = await mcpClient.getPrompt({
  name: 'continuous_query',
  arguments: {
    query: 'AI safety developments',
    cronExpression: '0 */6 * * *' // Every 6 hours
  }
});
```

### 5. MCP Resources with Subscriptions

**New Capability**: Subscribe to agent state and knowledge base updates
```javascript
// Subscribe to agent status changes
await mcpClient.subscribeResource({ uri: 'mcp://agent/status' });

// Subscribe to knowledge base updates
await mcpClient.subscribeResource({ uri: 'mcp://knowledge_base/updates' });

// Client receives real-time notifications when resources change
```

## Migration Steps

### Step 1: Update Your Client Transport

If you're using HTTP/SSE, you can **optionally** migrate to WebSockets for bidirectional features:

```javascript
// Option A: Keep using HTTP (backwards compatible)
const transport = new StreamableHTTPClientTransport('http://localhost:3008/mcp');

// Option B: Upgrade to WebSocket (new features)
const ws = new WebSocket('ws://localhost:3008/mcp/ws?token=YOUR_TOKEN');
```

### Step 2: Update Tool Calls

The `agent` tool now supports new actions:

```javascript
// Old: separate tools
await client.callTool({ name: 'conduct_research', arguments: {...} });

// New: unified agent with actions
await client.callTool({
  name: 'agent',
  arguments: {
    action: 'research',
    query: 'What is PGlite?',
    async: false // Sync response, no job queueing
  }
});
```

### Step 3: Leverage New Capabilities

#### Knowledge Graph Queries
```javascript
const graphResult = await client.callTool({
  name: 'query_graph',
  arguments: {
    entity: 'PGlite',
    maxHops: 2
  }
});
```

#### Temporal Scheduling
```javascript
const schedule = await client.callTool({
  name: 'schedule_action',
  arguments: {
    cronExpression: '0 * * * *', // Hourly
    action: {
      type: 'monitor',
      query: 'AI research papers'
    }
  }
});
```

#### Magic Workflow Prompts
```javascript
// Use pre-defined workflows
const briefing = await client.getPrompt({
  name: 'daily_briefing',
  arguments: { limit: 10 }
});
```

## Breaking Changes

### None (Fully Backwards Compatible)

All v1.6 tools and workflows continue to work in v2.0. The new features are **additive enhancements** that you can adopt incrementally.

## New Environment Variables

```bash
# WebSocket configuration (optional)
WS_HEARTBEAT_INTERVAL=30000      # Ping interval in ms
WS_MAX_CONNECTIONS=100           # Max concurrent WebSocket sessions

# Temporal agent configuration
TEMPORAL_ENABLED=true            # Enable scheduling (default: true)
TEMPORAL_MAX_SCHEDULES=50        # Max concurrent schedules

# Knowledge graph configuration
GRAPH_AUTO_EXTRACT=true          # Auto-extract entities from reports
GRAPH_EXTRACTION_MODEL=openai/gpt-5-mini  # Model for entity extraction
```

## Recommended Integration Pattern

For the best experience, use a **hybrid approach**:

1. **HTTP/Streamable HTTP** for tool calls and one-off queries
2. **WebSocket** for long-running sessions, real-time updates, and proactive notifications
3. **Resource Subscriptions** for monitoring agent state and knowledge base changes
4. **Magic Prompts** for common, multi-step workflows

## Example: Full Integration

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import WebSocket from 'ws';

// Primary transport for tool calls
const httpTransport = new StreamableHTTPClientTransport('http://localhost:3008/mcp');
const client = new Client({ name: 'my-app', version: '1.0.0' });
await client.connect(httpTransport);

// Secondary WebSocket for bidirectional features
const ws = new WebSocket('ws://localhost:3008/mcp/ws?token=YOUR_TOKEN');

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Agent event:', message.type, message.payload);
});

// Use magic prompts
const dailyBriefing = await client.getPrompt({
  name: 'daily_briefing',
  arguments: { limit: 5 }
});

// Schedule proactive actions
await client.callTool({
  name: 'schedule_action',
  arguments: {
    cronExpression: '0 9 * * *',
    action: { type: 'briefing' }
  }
});

// Query knowledge graph
const graph = await client.callTool({
  name: 'query_graph',
  arguments: { entity: 'Model Context Protocol' }
});
```

## Support

For questions or issues during migration:
- GitHub Issues: https://github.com/wheattoast11/openrouter-deep-research
- Email: admin@terminals.tech
- Documentation: See `README.md` and `CLAUDE.md` for detailed API reference

## Timeline

- **v2.0.0**: Initial release with all features (October 2025)
- **v2.1.0**: Enhanced knowledge graph algorithms (Q4 2025)
- **v2.2.0**: Multi-tenant session management (Q1 2026)

