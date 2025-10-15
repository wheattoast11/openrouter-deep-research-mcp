# OpenRouter Deep Research Agent - Quickstart Guide

**Get started in 5 minutes** ⚡

---

## 1. Prerequisites

- **Node.js** 18+ installed
- **OpenRouter API Key** ([get one here](https://openrouter.ai/))
- **Cursor IDE** or **Claude Desktop** (for MCP integration)

---

## 2. Installation

```powershell
# Clone the repository
git clone https://github.com/your-org/openrouter-agents.git
cd openrouter-agents

# Install dependencies
npm install

# Copy environment template
copy env.example .env
```

---

## 3. Configuration

### Option A: Environment Variables (Recommended)

Edit `.env`:

```bash
# Required
OPENROUTER_API_KEY=your_key_here

# Optional but recommended
GOOGLE_API_KEY=your_google_key_here  # For Gemini embeddings
MODE=AGENT  # AGENT | MANUAL | ALL
```

### Option B: Encrypted Credentials (Advanced)

Use the built-in credential manager:

```javascript
// Via Node.js
const credentialManager = require('./src/utils/credentialManager');

await credentialManager.storeCredential(
  'openrouter',
  'your-api-key',
  'your-master-password'
);
```

---

## 4. Start the Server

### For Cursor IDE / Claude Desktop (MCP)

```powershell
node src/server/mcpServer.js --stdio
```

The server will:
- ✓ Initialize PGlite database
- ✓ Load embeddings model
- ✓ Register tools and prompts
- ✓ Connect to MCP client

### For Standalone HTTP Server

```powershell
npm start
```

Server available at: `http://localhost:3009`

---

## 5. MCP Client Setup

### Cursor IDE

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "openrouter-agents": {
      "command": "node",
      "args": ["src/server/mcpServer.js", "--stdio"],
      "env": {
        "OPENROUTER_API_KEY": "${env:OPENROUTER_API_KEY}",
        "MODE": "AGENT"
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openrouter-agents": {
      "command": "node",
      "args": ["C:/path/to/openrouter-agents/src/server/mcpServer.js", "--stdio"],
      "env": {
        "OPENROUTER_API_KEY": "your-key-here",
        "MODE": "AGENT"
      }
    }
  }
}
```

---

## 6. Your First Research Query

### In Cursor/Claude Desktop

Simply ask:

```
Research the latest developments in quantum computing
```

The agent will:
1. ✓ Plan a multi-faceted research approach
2. ✓ Dispatch parallel research agents
3. ✓ Synthesize findings from multiple sources
4. ✓ Generate a comprehensive report
5. ✓ Save to `research_outputs/`

### Via HTTP API

```powershell
curl -X POST http://localhost:3009/mcp `
  -H "Content-Type: application/json" `
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"agent","arguments":{"query":"quantum computing developments"}}}'
```

---

## 7. Viewing Results

### Research Reports

Reports are saved to:
```
research_outputs/
  2025-10-12_quantum-computing/
    research-report-123.md
    visual-journey.md (coming soon)
    screenshots/ (coming soon)
```

### Via MCP Tool

```javascript
// In Cursor/Claude Desktop
"Get report content for report ID 123"
```

### Via HTTP

```powershell
curl http://localhost:3009/mcp `
  -H "Content-Type: application/json" `
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_report","arguments":{"reportId":"123"}}}'
```

---

## 8. Advanced Features

### Async Research (for long queries)

```javascript
// Automatically async by default
{
  "query": "Comprehensive analysis of AI safety research",
  "async": true  // Returns job_id immediately
}
```

### Check Job Status

```javascript
{
  "job_id": "job_abc123",
  "format": "summary"  // or "full" or "events"
}
```

### Follow-up Questions

```javascript
{
  "action": "follow_up",
  "originalQuery": "quantum computing",
  "followUpQuestion": "What about quantum error correction?"
}
```

### Search Knowledge Base

```javascript
{
  "action": "retrieve",
  "mode": "index",
  "query": "previous research on quantum",
  "k": 10
}
```

---

## 9. Monitoring & Health

### Server Status

```powershell
curl http://localhost:3009/health
```

### MCP Status Tool

```
"Check server status"
```

Returns:
- Database initialized: ✓
- Embedder ready: ✓
- Job queue status
- Cache statistics

---

## 10. Troubleshooting

### Database Issues

```powershell
# Reset database (destructive!)
Remove-Item -Recurse -Force ./researchAgentDB
npm start
```

### Missing Dependencies

```powershell
npm install
npm audit fix
```

### MCP Connection Issues

1. Check that `node` is in your PATH
2. Verify `.env` file exists with valid API key
3. Restart Cursor/Claude Desktop
4. Check logs in:
   - Windows: `%APPDATA%\Cursor\logs`
   - Mac: `~/Library/Logs/Cursor`

### API Key Issues

```powershell
# Test your key
curl https://openrouter.ai/api/v1/models `
  -H "Authorization: Bearer your-api-key-here"
```

---

## 11. What's Next?

- [ ] Read the [User Guide](./ULTIMATE-RESEARCH-AGENT-GUIDE.md)
- [ ] Explore the [Architecture Docs](./TRI-AGENT-ARCHITECTURE.md)
- [ ] Check the [Showcase](./SHOWCASE.md)
- [ ] Join our [Discord](#) for support

---

## 12. Common Workflows

### Daily Research

```
Morning: "Summarize AI news from the past 24 hours"
Afternoon: "Deep dive into [specific topic]"
Evening: "Compare findings with previous research on [topic]"
```

### Academic Research

```
1. "Conduct a literature review on [topic]"
2. "What are the knowledge gaps in [field]?"
3. "Compare methodologies across [papers/sources]"
```

### Market Research

```
1. "Analyze competitive landscape for [product]"
2. "Find pricing strategies in [industry]"
3. "Identify market trends in [sector]"
```

### Technical Documentation

```
1. "Research best practices for [technology]"
2. "Find code examples for [framework/library]"
3. "Compare approaches to [technical problem]"
```

---

## 13. Pro Tips

### Faster Research
- Use `costPreference: "low"` for speed
- Set `mode: "AGENT"` for streamlined experience
- Cache frequently used queries

### Better Results
- Be specific with your queries
- Use follow-up questions for depth
- Review past research to avoid duplication

### Secure Credentials
- Use credential manager for team sharing
- Rotate keys regularly
- Never commit `.env` to version control

---

## 14. Performance Benchmarks

**Typical Query Times**:
- Simple question: 5-10 seconds
- Standard research: 20-40 seconds
- Deep research: 1-3 minutes

**Cost Estimates** (OpenRouter):
- Simple query: $0.001-0.005
- Standard research: $0.01-0.05
- Deep research: $0.05-0.20

---

## 15. Getting Help

### Documentation
- [Full User Guide](./ULTIMATE-RESEARCH-AGENT-GUIDE.md)
- [API Reference](./API-REFERENCE.md)
- [FAQ](./FAQ.md)

### Community
- GitHub Issues: Report bugs
- Discord: Get help
- Email: support@terminals.tech

### Logs
- Server logs: Console output
- MCP logs: Client app logs
- Database: `researchAgentDB/logs/`

---

## 🎉 You're Ready!

Start researching with the world's most advanced agentic research system.

**First Query Suggestion**:
```
"Research the current state of agentic AI systems and compare different architectures"
```

Enjoy exploring! 🚀




