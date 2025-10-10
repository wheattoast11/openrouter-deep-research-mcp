# Migration Guide: v1.5.x → v1.6.0

## Overview

Version 1.6.0 introduces significant improvements focused on simplicity, determinism, and integration with `@terminals-tech/*` packages. This guide will help you upgrade smoothly.

## Breaking Changes

### 1. Embeddings Provider Change

**Before (v1.5.x):**
- Local HuggingFace `all-MiniLM-L6-v2` (384 dimensions)
- No external API required

**After (v1.6.0):**
- Default: Gemini `gemini-embedding-001` (768 dimensions)
- Fallback: Local HF model (384 dimensions)
- Requires: `GOOGLE_API_KEY` or `GEMINI_API_KEY`

**Action Required:**
1. Add Gemini API key to your `.env`:
   ```bash
   GOOGLE_API_KEY=AIzaSy...
   ```

2. Set dimension explicitly (recommended):
   ```bash
   EMBEDDINGS_DIMENSION=768
   ```

3. **Important**: Existing embeddings will be automatically cleared and regenerated on first run after dimension change. This is handled by the auto-migration system.

**Fallback Option:**
To continue using local embeddings only:
```bash
EMBEDDINGS_PROVIDER=huggingface
EMBEDDINGS_FALLBACK_LOCAL=true
EMBEDDINGS_DIMENSION=384
```

### 2. Default Mode Changed to AGENT

**Before:** `MODE=ALL` (default)
**After:** `MODE=AGENT` (recommended default)

The `agent` tool is now the primary interface. Individual tools remain available for back-compat.

**No Action Required** unless you prefer `ALL` or `MANUAL` mode:
```bash
MODE=ALL  # Keep both agent + individual tools
```

### 3. MCP Transport Updates

**Before:** SSE enabled by default
**After:** Streamable HTTP primary, SSE deprecated

**Action Required:**
If you're using HTTP/SSE transport, update your client to support Streamable HTTP (MCP 2025-06-18 spec). STDIO mode is unchanged.

To temporarily re-enable SSE:
```bash
MCP_SSE_ENABLED=true
```

## New Features

### @terminals-tech Integration

Three new packages are integrated:

1. **@terminals-tech/embeddings**
   - Unified embeddings API
   - Supports multiple providers (Gemini, HF, OpenAI)
   
2. **@terminals-tech/graph**
   - Knowledge graph for query expansion
   - Automatic entity/relation tracking
   - Enable: `INDEXER_GRAPH_ENRICHMENT=true`

3. **@terminals-tech/core**
   - Enhanced orchestration utilities
   - Streaming aggregation
   - Cancellation support

### Progressive Threshold Relaxation

Similarity search now uses progressive thresholds for deterministic results:

```javascript
// Default thresholds: [0.75, 0.70, 0.65, 0.60]
// Customize via config
INDEXER_SIMILARITY_THRESHOLDS=0.75,0.70,0.65,0.60
```

### Vector Dimension Auto-Migration

The system automatically migrates vector columns when dimension changes are detected. No manual intervention required.

## Upgrade Steps

### Step 1: Update Dependencies

```bash
npm install @terminals-tech/openrouter-agents@latest
```

### Step 2: Update Environment Variables

Add new required variables to `.env`:

```bash
# New: Required for Gemini embeddings
GOOGLE_API_KEY=your_gemini_api_key

# New: Embeddings configuration
EMBEDDINGS_PROVIDER=gemini
EMBEDDINGS_MODEL=gemini-embedding-001
EMBEDDINGS_DIMENSION=768
EMBEDDINGS_FALLBACK_LOCAL=true

# Optional: Knowledge graph
INDEXER_GRAPH_ENRICHMENT=true
INDEXER_MAX_GRAPH_EXPANSION=5

# Optional: Update mode
MODE=AGENT
```

### Step 3: Restart Server

```bash
npm start
```

On first startup with new dimension, you'll see:
```
⚠️  Vector dimension mismatch detected
✓ Vector dimension migration complete. All embeddings cleared and will be regenerated.
ℹ️  Note: Existing embeddings were cleared. Reports will be re-embedded on next access.
```

This is expected and happens only once.

### Step 4: Verify

```bash
npm run qa:intuitive
```

Expected output: `Intuitiveness Score: 4-5/5`

## Backward Compatibility

### Existing Tool Names

All existing tools remain functional:
- `conduct_research` → routes to `agent`
- `retrieve` → available in ALL/MANUAL modes
- `query` → available in ALL/MANUAL modes
- etc.

### Local-Only Mode

To run without external APIs (development/testing):

```bash
EMBEDDINGS_PROVIDER=huggingface
EMBEDDINGS_FALLBACK_LOCAL=true
EMBEDDINGS_DIMENSION=384
PGLITE_ALLOW_IN_MEMORY_FALLBACK=true
```

### SSE Transport

While deprecated, SSE remains functional:

```bash
MCP_SSE_ENABLED=true
```

Plan to migrate to Streamable HTTP by Q1 2026.

## Troubleshooting

### Issue: "Embedder not ready"

**Cause:** Missing API key or network issue

**Solution:**
1. Verify `GOOGLE_API_KEY` is set
2. Check network connectivity
3. Enable fallback: `EMBEDDINGS_FALLBACK_LOCAL=true`

### Issue: "Vector dimension mismatch"

**Cause:** Dimension changed between runs

**Solution:**
Auto-migration should handle this. If it fails:
```bash
node -e "require('./src/utils/vectorDimensionMigration').autoMigrateIfNeeded()"
```

### Issue: "No results from hybrid search"

**Cause:** Embeddings not yet generated

**Solution:**
Wait for background re-embedding to complete. Check server logs for progress.

### Issue: "@terminals-tech packages not found"

**Cause:** Missing dependencies

**Solution:**
```bash
npm install @terminals-tech/embeddings @terminals-tech/graph @terminals-tech/core
```

## Performance Notes

- **Gemini Embeddings**: ~50-100ms per request, cached for 2 hours
- **Local HF Embeddings**: ~200-500ms first run, ~10-20ms cached
- **Graph Enrichment**: Adds ~20-50ms to retrieval (optional)
- **Vector Migration**: One-time cost of ~5-30 seconds depending on DB size

## Rollback

To rollback to v1.5.x:

```bash
npm install @terminals-tech/openrouter-agents@1.5.1
```

Remove new env vars and restart. Your database remains compatible.

## Support

- GitHub Issues: [github.com/terminals-tech/openrouter-agents/issues](https://github.com/terminals-tech/openrouter-agents/issues)
- Docs: [CLAUDE.md](../CLAUDE.md)
- Examples: [docs/USE_CASES.md](./USE_CASES.md)

---

**Questions?** File an issue or consult the updated [CLAUDE.md](../CLAUDE.md) for implementation details.

