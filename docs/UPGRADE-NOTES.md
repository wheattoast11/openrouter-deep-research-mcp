# Upgrade Notes

## 2025-08-26
- New MODE env (AGENT | MANUAL | ALL). Default is ALL (agent + individual tools + always-on ops).
  - If you prefer a minimal surface, set `MODE=AGENT` to expose only `agent` plus ops tools (`ping`, status, jobs).
  - `MODE=MANUAL` exposes individual tools without `agent`.
- Async `submit_research` now returns `ui_url` and `sse_url`, and emits a `ui_hint` event.
- No breaking changes to existing tool params.

# Upgrade Notes (v1.2.0)

## Highlights
- Async jobs (`submit_research`, `get_job_status`, `cancel_job`) with SSE streams.
- Unified `search` (BM25 + vectors + optional LLM rerank).
- Usage (tokens) aggregated into `research_metadata.usage`.
- Minimal micro UI at `/ui` for live monitoring.
- MCP client JSON config examples in README; package exposes `openrouter-agents` bin.

## Breaking changes
- None; existing tools remain. `search_index` is still available but superseded by `search`.

## Migrations
- On startup, tables and columns are created/altered idempotently:
  - `index_documents.doc_len`, `index_documents.doc_embedding`.
  - `jobs`, `job_events`.

## New env vars
- `JOBS_CONCURRENCY`, `JOB_HEARTBEAT_MS`, `JOB_LEASE_TIMEOUT_MS` for job worker.
- `INDEXER_RERANK_ENABLED`, `INDEXER_RERANK_MODEL` (optional rerank).

## Client configuration
- See README for STDIO and HTTP/SSE JSON config blocks.

# OpenRouter Agents MCP Server Upgrade Notes

## Summary of Changes

We have successfully implemented a suite of enhancements that improve the reliability, performance, and ease of use of the OpenRouter Agents MCP Server:

1. **Eliminated External Database Dependencies**
   - Replaced MongoDB with PGLite + pgvector for persistent storage
   - Implemented vector embeddings search natively with pgvector
   - All data is now stored locally in the `./researchAgentDB` directory

2. **Simplified Caching**
   - Replaced Redis with node-cache for in-memory caching
   - Implemented automatic expiration and key limits to prevent memory issues
   - All caching is now handled within the application process

3. **Streamlined Startup Process**
   - Created a simplified `start-mcp-server.bat` script
   - Removed the need for Docker Compose and external services
   - Updated MCP settings in Cline for plug-and-play operation

4. **Enhanced Documentation**
   - Updated README.md with new setup and configuration options
   - Added database configuration options to `.env.example`
   - Created test scripts to verify functionality

## Testing & Verification

Both core features of the system have been tested and verified to work correctly:

1. **Vector Search**: Semantic search for similar past research is functioning with PGLite's vector search capabilities.
2. **Caching**: In-memory caching of research results is working correctly with configurable TTL.
3. **Research Process**: The full research workflow has been tested and works correctly with the new implementation.

## Configuration Options

The following new configuration options are available in `.env`:

```
# Database and caching configuration
PGLITE_DATA_DIR=./researchAgentDB  # Directory for PGLite database files
CACHE_TTL_SECONDS=3600             # Cache time-to-live in seconds (default: 1 hour)
```

## Recent Enhancements (March 29, 2025)

We've implemented additional improvements to enhance the reliability and resilience of the OpenRouter Agents MCP Server:

1. **Enhanced PGLite Database Integration**:
   - Added robust error handling with retry logic using exponential backoff
   - Implemented in-memory database fallback when file system access fails
   - Added environment detection for browser vs Node.js contexts
   - Added comprehensive configuration options for database behavior

2. **Improved Null Safety**:
   - Added defensive programming techniques throughout the codebase
   - Implemented safe string handling to prevent "substring of undefined" errors
   - Added parameter validation with defaults for all tool functions
   - Fixed several edge cases in the `research_follow_up` tool

3. **Configuration Flexibility**:
   - Added new environment variables for fine-tuning database behavior
   - Implemented hierarchical configuration with intelligent defaults
   - Enhanced documentation of all configuration options

## Next Steps

The current implementation satisfies the requirements of Phase 1 and part of Phase 2 of the enhancement plan. Potential future improvements could include:

1. **Pluggable Agent System**: Create an abstract base Agent class with a registration mechanism.
2. **Iterative Planning Mechanism**: Implement multi-stage planning with feedback loops.
3. **Domain-Specific Model Routing**: Route sub-queries to models based on their strengths.
4. **Interactive Research Direction**: Allow user input during the research process.
5. **Multi-Modal Research**: Add support for images and structured data.

## Files Modified

- `config.js`: Updated to include PGLite configuration options and resilience settings
- `src/utils/dbClient.js`: Enhanced with robust error handling, retry logic, and fallback mechanisms
- `src/server/tools.js`: Improved parameter validation and null safety
- `.env.example`: Added new configuration options for database resilience
- New files: `test-follow-up.js` for focused testing of the research_follow_up tool

## How to Use

1. Start the server using the new script:
   ```
   start-mcp-server.bat
   ```

2. Or call the Node.js script directly:
   ```
   node src/server/mcpServer.js --stdio
   ```

3. The MCP tools will be available in Cline without any need for external services.
