# Testing Guide: OpenRouter Agents

**Package:** @terminals-tech/openrouter-agents
**Version:** 2.0.0
**Date:** February 6, 2026

---

## Current Features

This release includes:
- ✅ MCP SDK 1.26.0 (latest)
- ✅ Server discovery endpoint (`/.well-known/mcp-server`)
- ✅ Health monitoring endpoint (`/health`)
- ✅ Rate limiting (100 req/min per IP)
- ✅ Request size limits (10MB)
- ✅ 100% MCP Specification 2025-11-25 compliance
- ✅ Knowledge Graph tools (traverse, path, clusters, pagerank)
- ✅ Session time-travel (undo, redo, fork, checkpoint)
- ✅ MCP Apps with UI resources (SEP-1865)
- ✅ Structured error handling with cause chains
- ✅ Pre-flight validation for research operations

---

## Installation Options

### Option 1: Local Development Install (Recommended for Testing)

```bash
# Clone the repository
git clone https://github.com/wheattoast11/openrouter-deep-research-mcp.git
cd openrouter-deep-research-mcp

# Checkout the beta branch
git checkout claude/mcp-compliance-review-hardening-011CV4DVd434Mj4UvYfrW9C3

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

**Edit `.env` with your configuration:**
```bash
OPENROUTER_API_KEY=your_openrouter_api_key_here
SERVER_API_KEY=your_secure_api_key_here
SERVER_PORT=3002
MODE=ALL
```

### Option 2: npm link (For System-Wide Testing)

```bash
# From the repository directory
npm link

# Now you can use it from anywhere
openrouter-agents --stdio

# To unlink later
npm unlink -g @terminals-tech/openrouter-agents
```

### Option 3: Direct npx (After npm publish)

```bash
# Once v1.10.0 is published to npm
npx @terminals-tech/openrouter-agents@1.10.0 --stdio
```

---

## Testing Scenarios

### 1. Test Server Discovery (New Feature)

**Verify the new `.well-known/mcp-server` endpoint:**

```bash
# Start server in HTTP mode
SERVER_API_KEY=testkey node src/server/mcpServer.js

# In another terminal, test discovery endpoint (no auth required)
curl http://localhost:3002/.well-known/mcp-server | jq

# Expected response:
# {
#   "name": "openrouter-agents",
#   "version": "1.10.0",
#   "specification": "2025-11-25",
#   "specificationDraft": "2025-11-25",
#   "capabilities": { ... },
#   "transports": [ ... ],
#   "endpoints": { ... },
#   "extensions": {
#     "async-operations": { ... },
#     "knowledge-base": { ... },
#     "multi-agent": { ... }
#   }
# }
```

**What to verify:**
- ✅ Returns 200 OK
- ✅ Contains `version: "1.10.0"`
- ✅ Shows `specificationDraft: "2025-11-25"`
- ✅ Lists all three extensions
- ✅ No authentication required

### 2. Test Health Endpoint (New Feature)

```bash
# Test health endpoint (no auth required)
curl http://localhost:3002/health | jq

# Expected response:
# {
#   "status": "healthy",
#   "version": "1.10.0",
#   "timestamp": "2025-11-12T...",
#   "checks": {
#     "database": "ok",
#     "embedder": "ready"
#   }
# }
```

**What to verify:**
- ✅ Returns 200 OK when healthy, 503 when unhealthy
- ✅ Shows correct version
- ✅ Database status check works
- ✅ No authentication required

### 3. Test Rate Limiting (New Feature)

```bash
# Rapid fire test (should hit rate limit)
for i in {1..110}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer testkey" \
    http://localhost:3002/metrics
done

# First 100 should return 200
# Requests 101-110 should return 429 (Too Many Requests)
```

**What to verify:**
- ✅ First 100 requests succeed
- ✅ Request 101+ returns 429 status
- ✅ Response includes `RateLimit-*` headers
- ✅ Error message: "Too many requests, please try again later."

### 4. Test STDIO Mode (MCP Clients)

**For Claude Code / Cursor / VS Code:**

Create MCP client config:

**Claude Code (`claude_desktop_config.json`):**
```json
{
  "mcpServers": {
    "openrouter-agents-beta": {
      "command": "node",
      "args": [
        "/absolute/path/to/openrouter-deep-research-mcp/src/server/mcpServer.js",
        "--stdio"
      ],
      "env": {
        "OPENROUTER_API_KEY": "your_key_here",
        "INDEXER_ENABLED": "true",
        "MODE": "ALL"
      }
    }
  }
}
```

**Restart your MCP client** and verify:
- ✅ Server appears in MCP client list
- ✅ All tools are available (27 tools)
- ✅ Resources are listed (6 resources)
- ✅ Prompts are available (3 prompts)

### 5. Test Async Operations

**Via HTTP/SSE:**

```bash
# Start server
SERVER_API_KEY=testkey node src/server/mcpServer.js

# Submit async research job
curl -X POST http://localhost:3002/jobs \
  -H "Authorization: Bearer testkey" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Latest developments in AI safety November 2025",
    "maxIterations": 2
  }' | jq

# Returns: {"job_id": "some-uuid"}

# Monitor job events via SSE
curl -N -H "Authorization: Bearer testkey" \
  http://localhost:3002/jobs/YOUR-JOB-ID/events

# Watch real-time progress events
```

**What to verify:**
- ✅ Job submission returns immediately with job_id
- ✅ SSE events stream shows progress (submitted → processing → completed)
- ✅ Final event includes research results
- ✅ Can check job status via `/jobs/:id/events`

### 6. Test Knowledge Base (Hybrid Search)

**Test semantic search:**

```bash
# Via STDIO mode in MCP client, use these tools:
# 1. index_texts - Add documents
# 2. search_index - Query with hybrid BM25+vector search
# 3. retrieve - Get past research reports
```

**Example query (in MCP client):**
```
Tool: search_index
Parameters: {
  "query": "machine learning optimization",
  "limit": 5
}
```

**What to verify:**
- ✅ Returns relevant documents
- ✅ Hybrid scoring works (BM25 + vector)
- ✅ Results include similarity scores
- ✅ Fast response time (< 500ms)

### 7. Test Multi-Agent Orchestration

**Run a complex research query:**

```bash
# In MCP client, use 'research' or 'conduct_research' tool
Tool: research
Parameters: {
  "query": "Compare quantum computing approaches from IBM, Google, and IonQ",
  "domain": "technology",
  "maxIterations": 3,
  "ensembleSize": 2
}
```

**What to verify:**
- ✅ Planning phase decomposes query
- ✅ Parallel execution of sub-queries (watch logs)
- ✅ Synthesis streams progressively
- ✅ Citations included in output
- ✅ Usage metrics tracked

### 8. Test Production Features

**A. Request Size Limit:**
```bash
# Try to send > 10MB payload (should be rejected)
dd if=/dev/zero bs=1M count=11 | base64 | \
  curl -X POST http://localhost:3002/jobs \
    -H "Authorization: Bearer testkey" \
    -H "Content-Type: application/json" \
    -d @-

# Expected: 413 Payload Too Large (or connection refused)
```

**B. Authentication:**
```bash
# Test JWT auth (if configured)
export AUTH_JWKS_URL=https://your-auth-provider.com/.well-known/jwks.json
export AUTH_EXPECTED_AUD=mcp-server

# Test with valid JWT
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3002/metrics

# Test with invalid token (should return 403)
curl -H "Authorization: Bearer invalid" \
  http://localhost:3002/metrics
```

**C. HTTPS Enforcement (Production):**
```bash
# Set HTTPS requirement
export REQUIRE_HTTPS=true

# Test HTTP request (should be rejected)
curl http://localhost:3002/health
# Expected: {"error": "HTTPS required"}
```

---

## Testing Checklist

Use this checklist to verify all features:

### Core MCP Compliance
- [ ] STDIO transport works with MCP client
- [ ] HTTP/SSE transport works
- [ ] All 27 tools are registered and working
- [ ] Resources API returns 6 resources
- [ ] Prompts API returns 3 prompts
- [ ] Progress notifications stream correctly

### New Features (v1.10.0)
- [ ] `/.well-known/mcp-server` returns discovery info
- [ ] `/health` endpoint works (no auth)
- [ ] Extension metadata present in discovery
- [ ] Rate limiting blocks after 100 req/min
- [ ] Request size limit rejects >10MB
- [ ] Security headers present (`RateLimit-*`)

### Async Operations
- [ ] Job submission returns immediately
- [ ] Job status can be queried
- [ ] SSE events stream progress
- [ ] Job cancellation works
- [ ] Multiple concurrent jobs work

### Knowledge Base
- [ ] Documents can be indexed
- [ ] Hybrid search returns relevant results
- [ ] Past research can be retrieved
- [ ] Vector similarity works
- [ ] BM25 keyword search works

### Multi-Agent System
- [ ] Planning decomposes queries
- [ ] Parallel research executes
- [ ] Synthesis includes citations
- [ ] Domain-aware planning works
- [ ] Ensemble execution works

### Production Features
- [ ] Rate limiting enforces limits
- [ ] Request size limits work
- [ ] JWT authentication works (if configured)
- [ ] API key fallback works
- [ ] Health checks work
- [ ] Metrics endpoint works

### Performance
- [ ] Research completes in <2 minutes
- [ ] Search returns results in <500ms
- [ ] Health check responds in <100ms
- [ ] No memory leaks (run for 1 hour)
- [ ] Concurrent clients work (test with 5 clients)

---

## Troubleshooting

### Issue: Dependencies not installing

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### Issue: STDIO mode not connecting

```bash
# Check logs for errors
# Verify no stdout pollution (use stderr for logs)
# Confirm JSON-RPC messages are valid

# Test manually
echo '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' | \
  node src/server/mcpServer.js --stdio
```

### Issue: Rate limit too restrictive

```bash
# Adjust in src/server/mcpServer.js (line 731-738)
# Change max: 100 to higher value for testing
# Example: max: 1000 for load testing
```

### Issue: Database not initializing

```bash
# Check permissions
ls -la ./researchAgentDB/

# Try in-memory mode
export PGLITE_IN_MEMORY=true
node src/server/mcpServer.js
```

### Issue: Embedder slow to initialize

```bash
# First run downloads model (~25MB)
# Check ~/.cache/huggingface/

# Pre-download model:
node -e "require('./src/utils/dbClient').initializeDb()"
```

---

## Reporting Issues

When reporting issues, include:

1. **Version:** 1.10.0
2. **Branch:** `claude/mcp-compliance-review-hardening-011CV4DVd434Mj4UvYfrW9C3`
3. **Environment:**
   - Node version: `node --version`
   - OS: macOS/Linux/Windows
   - MCP client: Claude Desktop/Cursor/Custom
4. **Logs:**
   ```bash
   # Capture stderr output
   node src/server/mcpServer.js --stdio 2> debug.log
   ```
5. **Steps to reproduce**
6. **Expected vs actual behavior**

---

## Performance Benchmarks

Expected performance on modern hardware:

| Operation | Expected Time | Notes |
|-----------|---------------|-------|
| Server startup | < 5 seconds | Includes DB init + embedder load |
| Simple research | 30-90 seconds | 1-2 iterations, ensemble size 2 |
| Complex research | 1-3 minutes | 3 iterations, ensemble size 3 |
| Knowledge search | < 500ms | Hybrid BM25+vector search |
| Health check | < 100ms | No DB queries |
| Server discovery | < 50ms | Static JSON response |
| Job submission | < 200ms | Creates job, returns ID |

---

## Next Steps After Testing

1. **Report results** via GitHub issues or PR comments
2. **Wait for MCP RC** (November 14, 2025) and re-test
3. **Monitor for breaking changes** in RC spec
4. **Prepare for final release** (November 25, 2025)

---

## Quick Test Commands

**Full test suite (5 minutes):**

```bash
# 1. Start server
SERVER_API_KEY=testkey node src/server/mcpServer.js &
SERVER_PID=$!

# 2. Test discovery
curl -s http://localhost:3002/.well-known/mcp-server | jq '.version'

# 3. Test health
curl -s http://localhost:3002/health | jq '.status'

# 4. Test rate limit
for i in {1..110}; do curl -s -o /dev/null -w "%{http_code} " \
  -H "Authorization: Bearer testkey" http://localhost:3002/metrics; done

# 5. Test job submission
JOB_ID=$(curl -s -X POST http://localhost:3002/jobs \
  -H "Authorization: Bearer testkey" \
  -H "Content-Type: application/json" \
  -d '{"query":"test query"}' | jq -r '.job_id')
echo "Job ID: $JOB_ID"

# 6. Check job status
curl -s "http://localhost:3002/jobs/$JOB_ID/events" \
  -H "Authorization: Bearer testkey"

# 7. Stop server
kill $SERVER_PID
```

---

## Contact & Support

- **Issues:** https://github.com/wheattoast11/openrouter-deep-research-mcp/issues
- **Email:** admin@terminals.tech
- **Documentation:** [docs/](../docs/)

---

**Happy Testing!** 🚀

This release is production-ready and fully compliant with MCP Specification 2025-11-25 (stable, AAIF/Linux Foundation governance).
