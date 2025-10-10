# Quick Start: v2.1.1-beta

Get started with the PLL-powered beta release in 5 minutes.

## Prerequisites

- Node.js 20+ (LTS recommended)
- OpenRouter API key ([get one](https://openrouter.ai/keys))
- Optional: Gemini API key for embeddings

## Install

```bash
npm install @terminals-tech/openrouter-agents@2.1.1-beta
```

Or globally:

```bash
npm install -g @terminals-tech/openrouter-agents@2.1.1-beta
```

## Configure for Beta

Create `.env`:

```bash
# Required
OPENROUTER_API_KEY=your-openrouter-key-here
SERVER_API_KEY=your-server-secret

# Beta features (opt-in)
BETA_FEATURES=true
MODE=AGENT

# Optional tuning
PLL_ENABLE=true
PLL_TARGET_TOKEN_RATE=32
COMPRESSION_ENABLE=true
```

## Run

**STDIO mode** (for Cursor/VS Code):
```bash
npx openrouter-agents --stdio
```

**HTTP/WebSocket mode** (daemon):
```bash
npx openrouter-agents
```

**Docker**:
```bash
docker run -p 3000:3000 \
  -e OPENROUTER_API_KEY=your_key \
  -e BETA_FEATURES=true \
  terminals/openrouter-agents:2.1.1-beta
```

## Verify Beta Features

With beta features enabled, WebSocket connections will emit telemetry events:

```javascript
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type?.startsWith('metrics.')) {
    console.log('PLL telemetry:', msg.payload);
  }
});
```

Look for: `cadence_error`, `dynamic_concurrency`, `jitter_ms`

## First Agent Query

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer your-server-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "agent",
      "arguments": {
        "query": "What is the Model Context Protocol?",
        "async": false
      }
    },
    "id": 1
  }'
```

## Beta Caveats

- **Stability**: Beta features are experimental. Use `BETA_FEATURES=false` for production.
- **Performance**: PLL may add slight overhead for telemetry collection.
- **Breaking Changes**: Beta APIs may change before v2.2 stable.

## When to Use Beta

✅ **Good for**:
- Testing new features
- Development environments
- Internal tools
- Observability/monitoring setups

❌ **Not recommended for**:
- Production customer-facing applications
- High-availability requirements
- Compliance-sensitive deployments

## Upgrade to Stable

When v2.2 stable releases:

```bash
npm install @terminals-tech/openrouter-agents@latest
```

Set `BETA_FEATURES=false` to revert to stable behavior anytime.



