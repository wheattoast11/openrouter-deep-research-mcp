# Platform Integration Guide: terminals.tech

This guide explains how to integrate the OpenRouter Agents MCP server into the terminals.tech platform stack, enabling powerful AI agentic capabilities for the zero chatbot and other components.

## Architecture Overview

### Where MCP Server Fits in Stack
```
[User] → [terminals.tech Frontend] → [Next.js Backend] → [MCP Server] → [OpenRouter/Gemini APIs]
                                                             ↓
                                                    [PGlite + pgvector KB]
                                                             ↓
                                                    [Research Reports + Knowledge Graph]
```

- **Communication Pattern**: Platform makes JSON-RPC calls to MCP server via HTTP/WebSocket
- **Data Flow**: User query → Agent orchestration → LLM calls → Knowledge storage → Response
- **Benefits**: Adds research, knowledge management, and agentic reasoning to platform

### Key Integration Points
1. **Chat UI**: Embed MCP server responses in chat interface
2. **Knowledge Graph**: Use server's semantic search for context
3. **Research Automation**: Trigger agent queries from user interactions
4. **Multi-Modal**: Support images and structured data in queries

## Deployment Patterns

### Pattern A: Sidecar Process (Recommended for Development)

MCP server runs as separate process, communicating via STDIO or HTTP.

**Pros**:
- Isolated process boundaries
- Easier debugging and monitoring
- Can restart independently
- No impact on platform stability

**Cons**:
- Requires IPC coordination
- Slightly higher latency

**Implementation**:

1. **Install in Platform**:
   ```bash
   npm install @terminals-tech/openrouter-agents@2.1.1-beta
   ```

2. **Environment Setup**:
   ```bash
   # .env.local
   OPENROUTER_API_KEY=your_key
   SERVER_API_KEY=platform-secret
   MODE=AGENT
   BETA_FEATURES=true
   PLL_ENABLE=true
   ```

3. **Integration Code** (`lib/mcp-client.js`):
   ```javascript
   import { Client } from '@modelcontextprotocol/sdk/client';
   import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';

   export class MCPClient {
     constructor() {
       this.transport = new StreamableHTTPClientTransport('http://localhost:3000/mcp', {
         headers: { Authorization: `Bearer ${process.env.SERVER_API_KEY}` }
       });
       this.client = new Client({ name: 'terminals-platform', version: '1.0.0' });
     }

     async connect() {
       await this.transport.start();
       await this.client.connect(this.transport);
     }

     async query(prompt) {
       return await this.client.callTool({
         name: 'agent',
         arguments: {
           query: prompt,
           async: false,
           includeSources: true
         }
       });
     }
   }
   ```

4. **Usage in Chat Handler**:
   ```javascript
   // pages/api/chat.js
   import { MCPClient } from '../../lib/mcp-client';

   const mcp = new MCPClient();

   export default async function handler(req, res) {
     if (req.method !== 'POST') return;

     const { message } = req.body;
     await mcp.connect();

     const result = await mcp.query(message);
     res.json({ response: result.content[0].text });
   }
   ```

### Pattern B: Embedded Module

MCP server runs in same Node process as platform.

**Pros**:
- Lower latency
- Shared memory/process
- Simpler deployment

**Cons**:
- Tighter coupling
- Potential stability impact

**Implementation**:

1. **Import Directly**:
   ```javascript
   // In your platform's main server file
   const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp');
   const openRouterAgents = require('@terminals-tech/openrouter-agents');

   // Initialize MCP server
   const server = new McpServer({
     name: 'terminals-platform-agent',
     version: '1.0.0'
   });

   // Add tools from OpenRouter Agents
   server.setRequestHandler('tools/list', openRouterAgents.listTools);
   server.setRequestHandler('tools/call', openRouterAgents.callTool);

   // Connect to your client
   const client = new Client({ name: 'platform', version: '1.0.0' });
   await client.connect(new StdioClientTransport({
     command: 'node',
     args: ['-e', 'console.log("embedded")']
   }));
   ```

### Pattern C: Microservice (Docker)

MCP server runs in Docker container, communicating via HTTP/WebSocket.

**Pros**:
- Complete isolation
- Scalable deployment
- Platform-agnostic

**Cons**:
- Network overhead
- More complex orchestration

**Implementation**:

1. **Docker Compose**:
   ```yaml
   # docker-compose.yml
   services:
     mcp-server:
       image: terminals/openrouter-agents:2.1.1-beta
       environment:
         - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
         - MODE=AGENT
         - BETA_FEATURES=true
         - SERVER_PORT=3000
       ports:
         - "3000:3000"
       volumes:
         - mcp-data:/app/researchAgentDB

   volumes:
     mcp-data:
   ```

2. **Platform Integration**:
   ```javascript
   const response = await fetch('http://mcp-server:3000/mcp', {
     method: 'POST',
     headers: {
       'Authorization': 'Bearer platform-secret',
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       jsonrpc: '2.0',
       method: 'tools/call',
       params: {
         name: 'agent',
         arguments: { query: userMessage, async: false }
       }
     })
   });
   ```

## Environment Configuration

### Production-Ready Defaults for terminals.tech

```bash
# Required
OPENROUTER_API_KEY=your_openrouter_key
SERVER_API_KEY=platform-internal-secret

# Mode and Features
MODE=AGENT
BETA_FEATURES=true
PLL_ENABLE=true
COMPRESSION_ENABLE=true

# Performance Tuning (based on load)
PARALLELISM=4
ENSEMBLE_SIZE=2
PLL_MAX_CONCURRENCY=6

# Security (internal platform)
SERVER_PORT=3000
BIND_ADDRESS=0.0.0.0
REQUIRE_HTTPS=false  # Internal traffic
RATE_LIMIT_MAX_REQUESTS=1000  # Higher for internal use
ALLOWED_ORIGINS=http://platform:3000

# Storage
PGLITE_DATA_DIR=/data/researchAgentDB
REPORT_OUTPUT_PATH=/data/research_outputs

# Logging
LOG_LEVEL=info
```

### Security Considerations

1. **JWT Validation**: Use platform's auth system for MCP server access
2. **Rate Limiting**: Implement per-user/IP limits in platform layer
3. **SSRF Protection**: Already built-in via `validateUrlForFetch()`
4. **Secret Redaction**: Logs automatically redact API keys

## Code Examples

### Chat UI Integration

```javascript
// components/ChatAgent.js
import { useState } from 'react';

export default function ChatAgent() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const sendMessage = async () => {
    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);

    const response = await fetch('/api/agent', {
      method: 'POST',
      body: JSON.stringify({ message: input })
    });

    const result = await response.json();
    setMessages([...newMessages, { role: 'assistant', content: result.response }]);
    setInput('');
  };

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i} className={msg.role}>
          {msg.content}
        </div>
      ))}
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}
```

### Knowledge Graph Querying

```javascript
// lib/knowledge-graph.js
export async function queryKnowledgeGraph(entity, maxHops = 2) {
  const response = await fetch('/api/knowledge', {
    method: 'POST',
    body: JSON.stringify({ entity, maxHops })
  });
  return response.json();
}

// API route
// pages/api/knowledge.js
import { MCPClient } from '../../lib/mcp-client';

export default async function handler(req, res) {
  const { entity, maxHops } = req.body;
  const mcp = new MCPClient();
  await mcp.connect();

  const result = await mcp.client.callTool({
    name: 'query',
    arguments: {
      sql: `SELECT * FROM knowledge_graph WHERE entity = ? LIMIT ?`,
      params: [entity, maxHops]
    }
  });

  res.json(result);
}
```

## Testing Integration

### Unit Tests (Mock MCP Server)

```javascript
// __tests__/mcp-integration.test.js
import { MCPClient } from '../lib/mcp-client';

test('MCP client handles responses correctly', async () => {
  // Mock MCP server response
  const mockResponse = { content: [{ text: 'Mocked response' }] };

  const client = new MCPClient();
  client.client.callTool = jest.fn().mockResolvedValue(mockResponse);

  const result = await client.query('test query');
  expect(result.content[0].text).toBe('Mocked response');
});
```

### Integration Tests (Real MCP Server)

```javascript
// __tests__/integration.test.js
import { MCPClient } from '../lib/mcp-client';

test('Full chat integration', async () => {
  const client = new MCPClient();
  await client.connect();

  const result = await client.query('What is the Model Context Protocol?');
  expect(result.content).toBeDefined();
  expect(result.content[0].text).toContain('MCP');
});
```

### End-to-End Tests

```javascript
// e2e/chat.spec.js
import { test, expect } from '@playwright/test';

test('User can chat with AI agent', async ({ page }) => {
  await page.goto('/chat');
  await page.fill('[data-testid="chat-input"]', 'What is quantum computing?');
  await page.click('[data-testid="send-button"]');

  await expect(page.locator('[data-testid="chat-response"]')).toContainText('quantum');
});
```

## Monitoring and Observability

### Health Checks

```javascript
// lib/health.js
export async function checkMCPHealth() {
  try {
    const response = await fetch('http://mcp-server:3000/about');
    return response.ok;
  } catch (error) {
    return false;
  }
}
```

### Metrics Collection

```javascript
// lib/metrics.js
export async function collectMCPMetrics() {
  const response = await fetch('http://mcp-server:3000/metrics');
  const metrics = await response.text();

  // Parse and store in platform monitoring system
  return parsePrometheusMetrics(metrics);
}
```

## Troubleshooting

### Common Issues

1. **"MCP server not responding"**
   - Check if MCP server is running
   - Verify SERVER_API_KEY matches
   - Check network connectivity

2. **"OpenRouter API error"**
   - Verify OPENROUTER_API_KEY is set
   - Check OpenRouter account has credits
   - Review rate limits

3. **"PGlite database error"**
   - Ensure PGLITE_DATA_DIR has write permissions
   - Check disk space
   - Restart MCP server to reinitialize DB

4. **"No telemetry events"**
   - Verify BETA_FEATURES=true and PLL_ENABLE=true
   - Check WebSocket connection stability
   - Review server logs for errors

### Debug Mode

Enable detailed logging:

```bash
DEBUG_MODE=true
LOG_LEVEL=debug
```

This will output detailed logs including:
- MCP request/response cycles
- LLM API calls
- Database operations
- Telemetry events

## Performance Tuning

### For High Load

```bash
# Increase concurrency for heavy usage
PARALLELISM=8
PLL_MAX_CONCURRENCY=8

# Optimize compression
COMPRESSION_TARGET_TOKENS=5000

# Reduce cache TTL for fresh data
CACHE_TTL_SECONDS=1800
```

### Memory Optimization

```bash
# Reduce parallelism for memory-constrained environments
PARALLELISM=2
PLL_MAX_CONCURRENCY=2

# Smaller cache
CACHE_TTL_SECONDS=900
```

## Security Best Practices

1. **API Key Management**:
   - Store keys in environment variables or secrets manager
   - Rotate keys regularly
   - Use platform-specific key injection

2. **Network Security**:
   - Run MCP server on internal network
   - Use VPN for external access
   - Implement mutual TLS if needed

3. **Data Protection**:
   - Encrypt PGlite data directory
   - Implement data retention policies
   - Redact sensitive data in logs

## Future Enhancements

1. **WebSocket Integration**: Use WebSocket for real-time streaming in platform chat
2. **Custom Prompts**: Add platform-specific prompt templates
3. **Analytics**: Integrate with platform analytics for query insights
4. **Caching Layer**: Add Redis for shared caching across platform instances

## Support

For integration issues:
- Check this documentation first
- Review MCP server logs
- Test with simplified queries
- Contact terminals.tech team for platform-specific issues

This integration enables powerful AI capabilities in the terminals.tech platform while maintaining security and performance.

