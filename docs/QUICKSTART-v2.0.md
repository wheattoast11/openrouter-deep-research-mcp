# Quick Start Guide: v2.0

Get up and running with the next-generation agentic server in 5 minutes.

## Prerequisites

- Node.js >=18
- OpenRouter API key ([get one](https://openrouter.ai/keys))
- Gemini API key for embeddings ([get one](https://aistudio.google.com/app/apikey))

## Installation

```bash
npm install @terminals-tech/openrouter-agents
```

## Configuration

Create `.env`:

```bash
# Required
OPENROUTER_API_KEY=sk-or-v1-your-key-here
GEMINI_API_KEY=your-gemini-key-here

# Recommended
MODE=AGENT
SERVER_API_KEY=choose-a-secure-secret
PUBLIC_URL=http://localhost:3008

# Optional (defaults shown)
PARALLELISM=4
ENSEMBLE_SIZE=2
TEMPORAL_ENABLED=true
GRAPH_AUTO_EXTRACT=true
```

## Start the Server

```bash
# HTTP + WebSocket mode
npx openrouter-agents

# STDIO mode (for IDE integration like Cursor)
npx openrouter-agents --stdio
```

Server will start on port 3008.

## Test the Connection

### Option 1: HTTP Client

```bash
curl -X POST http://localhost:3008/mcp \
  -H "Authorization: Bearer YOUR_SERVER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "ping",
      "arguments": { "info": true }
    },
    "id": 1
  }'
```

### Option 2: WebSocket (Bidirectional)

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3008/mcp/ws?token=YOUR_SERVER_API_KEY');

ws.on('open', () => {
  console.log('Connected!');
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Event:', message.type, message.payload);
});
```

### Option 3: MCP SDK (Recommended)

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport('http://localhost:3008/mcp', {
  headers: { Authorization: 'Bearer YOUR_SERVER_API_KEY' }
});

const client = new Client({ name: 'my-app', version: '1.0.0' });
await client.connect(transport);

// Test
const ping = await client.callTool({
  name: 'ping',
  arguments: { info: true }
});

console.log(ping);
```

## Your First Research Query

```javascript
// Simple query
const result = await client.callTool({
  name: 'agent',
  arguments: {
    action: 'research',
    query: 'What is PGlite and how does it differ from PostgreSQL?',
    async: false  // Get immediate results
  }
});

console.log(result.content[0].text);
```

## Enable Bidirectional Features

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3008/mcp/ws?token=YOUR_SERVER_API_KEY');

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  
  switch (msg.type) {
    case 'session.started':
      console.log('✓ Agent session ready');
      break;
    case 'agent.thinking':
      console.log('💭', msg.payload.thought);
      break;
    case 'temporal.monitor_update':
      console.log('🔔 New information:', msg.payload.query);
      break;
  }
});
```

## Schedule Your First Proactive Action

```javascript
// Daily briefing at 9 AM
const schedule = await client.callTool({
  name: 'schedule_action',
  arguments: {
    cronExpression: '0 9 * * *',
    action: {
      type: 'briefing'
    }
  }
});

console.log('Scheduled:', schedule);

// You'll receive daily briefings via WebSocket!
```

## Use a Magic Prompt

```javascript
// Fetch a URL, research it, and add to knowledge graph - all in one command
const result = await client.getPrompt({
  name: 'summarize_and_learn',
  arguments: {
    url: 'https://electric-sql.com/blog/2024/09/03/pglite-v0.2'
  }
});

console.log(result.messages[0].content[0].text);

// Now query what was learned
const graph = await client.callTool({
  name: 'query_graph',
  arguments: { entity: 'PGlite' }
});

console.log('Knowledge graph:', graph);
```

## Launch the Client UI (Optional)

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173?token=YOUR_SERVER_API_KEY` to see the minimalist agent console.

## Next Steps

1. **Explore Tools**: `await client.listTools()`
2. **Browse Prompts**: `await client.listPrompts()`
3. **Check Resources**: `await client.listResources()`
4. **Read Docs**: See `docs/v2.0-USER-JOURNEYS.md` for advanced patterns
5. **Review Architecture**: See `docs/v2.0-ARCHITECTURE.md` for system design

## Common Commands

```bash
# List available models
curl -X POST http://localhost:3008/mcp \
  -H "Authorization: Bearer $SERVER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_models","arguments":{}},"id":1}' | jq

# Get server status
curl http://localhost:3008/about

# View metrics
curl -H "Authorization: Bearer $SERVER_API_KEY" http://localhost:3008/metrics

# Stream job events
curl -N -H "Authorization: Bearer $SERVER_API_KEY" \
  http://localhost:3008/jobs/YOUR_JOB_ID/events
```

## Troubleshooting

### "Embedder not ready"

Ensure `GEMINI_API_KEY` is set. On Windows, local HuggingFace embeddings are disabled due to dependency issues.

```bash
export GEMINI_API_KEY=your-key-here
```

### "WebSocket connection refused"

Ensure server is running in HTTP mode (not `--stdio`):
```bash
npx openrouter-agents  # NOT: npx openrouter-agents --stdio
```

### "Schedule not executing"

Check cron expression validity:
```javascript
const cron = require('node-cron');
console.log(cron.validate('0 9 * * *'));  // true = valid
```

## Support

- **Documentation**: `docs/` folder
- **Issues**: GitHub repository
- **Email**: admin@terminals.tech

---

**You're now running a next-generation agentic platform. Explore, experiment, and enjoy the intelligence.**

