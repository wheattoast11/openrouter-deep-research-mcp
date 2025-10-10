# PGlite + pgvector Embeddings Patterns — Research Findings

**Date**: October 8, 2025  
**Context**: Investigating best practices for using PGlite with pgvector embeddings without external LLM mocking layers

## Executive Summary

**Key Finding**: The mock LLM layer (`USE_MOCK_OPENROUTER`) was unnecessary and counterproductive. PGlite + pgvector + local embeddings (`@terminals-tech/embeddings` with `Xenova/all-MiniLM-L6-v2`) provide a complete, production-ready stack for vector similarity search without requiring external API mocks.

## PGlite Architecture Patterns

### 1. Single-Process, Ephemeral or Persistent
- **Pattern**: PGlite runs in single-user mode (no forking) — perfect for embedded use cases
- **Storage Options**:
  - Node/Bun/Deno: `file://path/to/pgdata` (filesystem persistence)
  - Browser: `idb://db-name` (IndexedDB persistence)
  - Memory: `new PGlite()` (ephemeral, test/dev only)
- **Our Implementation**: ✅ Using `file://researchAgentDB` correctly in `src/utils/dbClient.js:184`

### 2. pgvector Extension Integration
- **Pattern**: Load vector extension at init time, not per-query
- **Best Practice**: `await db.exec("CREATE EXTENSION IF NOT EXISTS vector;")` once during schema setup
- **Our Implementation**: ✅ Correct in `dbClient.js` lines 243-249 (PGLite vector extension enabled)

### 3. Embedding Pipeline (Local-First)
- **Pattern**: Use local embedding models (Transformers.js, ONNX Runtime) to avoid network dependencies
- **Dimension Alignment**: Vector column dimension MUST match embedding output (e.g., 384D for `all-MiniLM-L6-v2`)
- **Our Implementation**: ✅ Using `@terminals-tech/embeddings` with fallback to `MockEmbeddingProvider` (384D)
  - **Issue**: MockEmbeddingProvider generates random vectors, NOT semantic embeddings

## What the Mock Layer Broke

### Problem 1: Mock LLM Responses Don't Match Schemas
- **Agent Planning** expects XML tags like `<agent_1>...</agent_1>`
- **Mock returns**: `"MOCK RESPONSE (model): query text"`
- **Result**: XML parser fails → entire agent flow stops

### Problem 2: Cache Bypass Logic Confused
- `src/server/tools.js:309` checks `!shouldMockLLMs()` before returning cached results
- This meant mock mode forced re-execution even when valid cached results existed

### Problem 3: Test Suites Broken
- All agent-mode tests (`test-all-mcp-tools.js`, `test-research-agent.js`) fail because planning never produces valid XML
- Embeddings work fine, but downstream LLM calls are mocked incorrectly

## Correct Architecture (No Mock Layer)

```
┌─────────────────────────────────────────────────────────────┐
│  User Query                                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Embeddings Layer (@terminals-tech/embeddings)              │
│  • Xenova/all-MiniLM-L6-v2 (384D)                          │
│  • Local transformers.js (no network)                       │
│  • OR MockEmbeddingProvider (random, dev only)              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  PGlite + pgvector                                          │
│  • Vector similarity search (cosine distance)               │
│  • Persistent storage (file:// or idb://)                   │
│  • No external dependencies                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Planning/Research Agents (REAL LLM calls)                  │
│  • OpenRouter API (requires valid key)                      │
│  • Returns properly formatted XML, domain labels, etc.      │
│  • Agent mode works end-to-end                              │
└─────────────────────────────────────────────────────────────┘
```

## Recommended Actions

### 1. Remove Mock Layer Entirely
- **Files to Clean**:
  - `src/utils/openRouterClient.js`: Remove `shouldMock()`, `buildMockResponse()`, `MOCK_MODE` checks
  - `src/server/tools.js`: Remove `shouldMockLLMs()` and cache bypass logic
  - Test files: Remove `USE_MOCK_OPENROUTER` env var initialization

### 2. Embeddings Are Already Correct
- Keep `@terminals-tech/embeddings` as-is
- Keep PGlite + pgvector integration (no changes needed)
- ✅ This part never needed mocking—it works with local models

### 3. Test Requirements
- Agent tests REQUIRE a valid `OPENROUTER_API_KEY` or should be skipped
- Document this clearly in test headers and `.env.example`
- Alternatively: Create minimal integration tests that only test embeddings/pgvector without LLM calls

## Code Audit Results

### Current Mock Entry Points
1. `src/utils/openRouterClient.js:7-18, 68-72, 97-103` — Mock detection and responses
2. `src/server/tools.js:1-3, 285-307` — Mock-aware cache logic
3. Test files (6 files) — `USE_MOCK_OPENROUTER=true` initialization

### Embeddings Pipeline Status
- ✅ **Adapter**: `src/utils/embeddingsAdapter.js` correctly wraps `@terminals-tech/embeddings`
- ✅ **DB Integration**: `src/utils/dbClient.js` correctly initializes embedder and generates vectors
- ⚠️ **MockEmbeddingProvider**: Produces random vectors, NOT semantic — acceptable for structure tests, NOT for retrieval tests

### pgvector Integrity
- ✅ Vector column created with correct dimension (384)
- ✅ Similarity search uses pgvector's `<->` operator
- ✅ Indexes created for performance
- ✅ No regressions found in vector storage/retrieval

## Conclusions

1. **The mock layer was a mistake**: It tried to solve a non-existent problem (embeddings already work locally)
2. **PGlite + pgvector work perfectly**: No external dependencies needed for vector storage/search
3. **LLM calls cannot be mocked naively**: Planning/synthesis require structured outputs that simple text mocks don't provide
4. **Path forward**: Remove mocks, require real API keys for agent tests, document this clearly

## References

- PGlite Documentation: https://pglite.dev/docs
- PGlite GitHub: https://github.com/electric-sql/pglite
- @terminals-tech/embeddings: Internal package documentation
- pgvector: Standard Postgres extension, works identically in PGlite

