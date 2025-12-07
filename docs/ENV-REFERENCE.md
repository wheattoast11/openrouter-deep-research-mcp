# Environment Variables Reference

Complete reference for all environment variables supported by OpenRouter Agents MCP Server.

## Table of Contents

- [Server Configuration](#server-configuration)
- [API Keys](#api-keys)
- [Database Configuration](#database-configuration)
- [Model Configuration](#model-configuration)
- [Token Limits](#token-limits)
- [Indexer/Search](#indexersearch)
- [Job Processing](#job-processing)
- [Logging](#logging)
- [Caching](#caching)
- [MCP Features](#mcp-features)
- [Core Abstractions](#core-abstractions)
- [Experimental](#experimental)

---

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `3002` | Server port (takes precedence over PORT) |
| `PORT` | `3002` | Alternative port variable |
| `SERVER_API_KEY` | `null` | Optional API key for server authentication |
| `REQUIRE_HTTPS` | `false` | Require HTTPS connections |
| `PUBLIC_URL` | auto | Public URL for SSE endpoints |
| `ALLOW_START_WITHOUT_DB` | `false` | Allow server to start even if database fails |
| `STARTUP_TIMEOUT_MS` | `30000` | Maximum time to wait for server startup |

## API Keys

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | *required* | OpenRouter API key for model access |
| `ALLOW_NO_API_KEY` | `false` | Allow server to run without API key (limited functionality) |

## Database Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PGLITE_DATA_DIR` | `./researchAgentDB` | Directory for PGLite database files |
| `PGLITE_DATABASE_URL` | `null` | Override auto-detected database URL |
| `PGLITE_RELAXED_DURABILITY` | `true` | Use relaxed durability for better performance |
| `PGLITE_MAX_RETRY_ATTEMPTS` | `3` | Maximum retry attempts for database operations |
| `PGLITE_RETRY_DELAY_BASE_MS` | `200` | Base delay between retries (exponential backoff) |
| `PGLITE_INIT_TIMEOUT_MS` | `30000` | Timeout for database initialization |
| `PGLITE_RETRY_ON_FAILURE` | `false` | Retry initialization on failure |
| `PGLITE_ALLOW_IN_MEMORY_FALLBACK` | `true` | Fall back to in-memory database if persistent fails |
| `CACHE_TTL_SECONDS` | `3600` | Default cache TTL (1 hour) |

## Model Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PLANNING_MODEL` | `google/gemini-2.5-pro` | Model for planning/orchestration |
| `PLANNING_CANDIDATES` | see defaults | Comma-separated list of planning candidates |
| `USE_DYNAMIC_CATALOG` | `false` | Fetch model list from OpenRouter API |
| `HIGH_COST_MODELS` | see defaults | JSON array or CSV of high-cost models |
| `LOW_COST_MODELS` | see defaults | JSON array or CSV of low-cost models |
| `VERY_LOW_COST_MODELS` | see defaults | JSON array or CSV of very low-cost models |
| `CLASSIFICATION_MODEL` | `openai/gpt-5-mini` | Model for classification tasks |
| `ENSEMBLE_SIZE` | `2` | Number of models in research ensemble |
| `MAX_RESEARCH_ITERATIONS` | `2` | Maximum research iterations (initial + refinements) |
| `PARALLELISM` | `4` | Concurrent sub-queries |
| `MIN_MAX_TOKENS` | `2048` | Minimum max_tokens for all calls |

## Token Limits

### Synthesis
| Variable | Default | Description |
|----------|---------|-------------|
| `SYNTHESIS_MIN_TOKENS` | `4000` | Minimum tokens for synthesis |
| `SYNTHESIS_MAX_TOKENS` | `16000` | Fallback max tokens for synthesis |
| `TOKENS_PER_SUBQUERY` | `800` | Token allocation per sub-query |
| `TOKENS_PER_DOC` | `500` | Token allocation per document |

### Research
| Variable | Default | Description |
|----------|---------|-------------|
| `RESEARCH_MIN_TOKENS` | `2000` | Minimum tokens for research |
| `RESEARCH_MAX_TOKENS` | `8000` | Fallback max tokens for research |

### Planning
| Variable | Default | Description |
|----------|---------|-------------|
| `PLANNING_MIN_TOKENS` | `1000` | Minimum tokens for planning |
| `PLANNING_MAX_TOKENS` | `4000` | Fallback max tokens for planning |

## Indexer/Search

| Variable | Default | Description |
|----------|---------|-------------|
| `INDEXER_ENABLED` | `true` | Enable document indexing |
| `INDEXER_AUTO_INDEX_REPORTS` | `false` | Auto-index research reports |
| `INDEXER_AUTO_INDEX_FETCHED` | `false` | Auto-index fetched content |
| `INDEXER_EMBED_DOCS` | `true` | Generate embeddings for indexed docs |
| `INDEXER_MAX_DOC_LENGTH` | `8000` | Maximum document length for indexing |
| `INDEXER_BM25_K1` | `1.2` | BM25 k1 parameter |
| `INDEXER_BM25_B` | `0.75` | BM25 b parameter |
| `INDEXER_WEIGHT_BM25` | `0.7` | Weight for BM25 in hybrid search |
| `INDEXER_WEIGHT_VECTOR` | `0.3` | Weight for vector in hybrid search |
| `INDEXER_STOPWORDS` | `` | Comma-separated custom stopwords |
| `INDEXER_RERANK_ENABLED` | `false` | Enable LLM reranking |
| `INDEXER_RERANK_MODEL` | `null` | Model for reranking |

## Job Processing

| Variable | Default | Description |
|----------|---------|-------------|
| `JOBS_CONCURRENCY` | `4` | Maximum concurrent jobs |
| `JOB_HEARTBEAT_MS` | `2000` | Heartbeat interval for job health |
| `JOB_LEASE_TIMEOUT_MS` | `30000` | Lease timeout for stale job detection |
| `JOB_BATCH_EVENT_LIMIT` | `500` | Max SSE events per batch poll |
| `JOB_SSE_POLLING_MS` | `500` | SSE polling interval |

## Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `LOG_OUTPUT` | `stderr` | Output mode: `stderr`, `mcp`, `both` |
| `LOG_JSON` | `false` | Enable JSON format for log aggregation |
| `NO_COLOR` | undefined | Disable colored output (any value) |
| `FORCE_COLOR` | undefined | Force colored output even in non-TTY |

## Caching

### Result Caching
| Variable | Default | Description |
|----------|---------|-------------|
| `RESULT_CACHING_ENABLED` | `true` | Enable semantic result caching |
| `RESULT_CACHE_TTL` | `7200` | Result cache TTL (2 hours) |
| `RESULT_CACHE_MAX_ENTRIES` | `1000` | Maximum cached results |
| `CACHE_SIMILARITY_THRESHOLD` | `0.85` | Similarity threshold for cache hits |

### Model Response Caching
| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_CACHING_ENABLED` | `true` | Enable model response caching |
| `MODEL_CACHE_TTL` | `3600` | Model cache TTL (1 hour) |
| `MODEL_CACHE_MAX_ENTRIES` | `500` | Maximum cached model responses |

## MCP Features

| Variable | Default | Description |
|----------|---------|-------------|
| `MODE` | `ALL` | Tool mode: `AGENT`, `MANUAL`, `ALL` |
| `MCP_ENABLE_PROMPTS` | `true` | Enable MCP prompts |
| `MCP_ENABLE_RESOURCES` | `true` | Enable MCP resources |
| `MCP_STREAMABLE_HTTP_ENABLED` | `true` | Enable streamable HTTP transport |

### Prompt Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `PROMPTS_COMPACT` | `true` | Use compact prompts |
| `PROMPTS_REQUIRE_URLS` | `true` | Require URLs in research output |
| `PROMPTS_CONFIDENCE` | `true` | Include confidence scoring |

### Tool Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `SIMPLE_TOOLS` | `true` | Enable short parameter aliases |
| `MAX_TOOL_DEPTH` | `3` | Maximum tool recursion depth (0 to disable) |

## Core Abstractions

| Variable | Default | Description |
|----------|---------|-------------|
| `CORE_HANDLERS_ENABLED` | `false` | Enable consolidated handlers |
| `CORE_HANDLER_DOMAINS` | `` | Domains using new handlers (comma-separated) |
| `SIGNAL_PROTOCOL_ENABLED` | `false` | Enable Signal protocol |
| `SIGNAL_MAX_HISTORY` | `1000` | Maximum signal history size |
| `ROLESHIFT_ENABLED` | `false` | Enable RoleShift bidirectional protocol |
| `ROLESHIFT_TIMEOUT_MS` | `60000` | RoleShift request timeout |
| `STRICT_SCHEMA_VALIDATION` | `false` | Enable strict Zod schema validation |

### Consensus Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `CONSENSUS_MIN_AGREEMENT` | `0.6` | Minimum agreement for consensus |

### Crystallization Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `CRYSTAL_POSITIVE_WEIGHT` | `0.2` | Weight for positive crystallization patterns |
| `CRYSTAL_NEGATIVE_WEIGHT` | `0.1` | Weight for negative crystallization patterns |

## Experimental

| Variable | Default | Description |
|----------|---------|-------------|
| `HYPER_MODE` | `false` | Enable hyper mode (experimental features) |

---

## Example .env File

```bash
# Required
OPENROUTER_API_KEY=sk-or-v1-xxx

# Server
SERVER_PORT=3002
PUBLIC_URL=http://localhost:3002

# Database
PGLITE_DATA_DIR=./data/research

# Logging
LOG_LEVEL=info
LOG_OUTPUT=stderr

# Performance
JOBS_CONCURRENCY=4
PARALLELISM=4

# Models (optional overrides)
# PLANNING_MODEL=openai/gpt-5-chat
# ENSEMBLE_SIZE=3

# Core Features (opt-in)
# CORE_HANDLERS_ENABLED=true
# SIGNAL_PROTOCOL_ENABLED=true
```

---

## Notes

1. **Boolean values**: Use `true` or `false` (case-insensitive). Empty or unset = default.
2. **Model lists**: Can be JSON array or comma-separated string.
3. **API Key**: Required unless `ALLOW_NO_API_KEY=true` is set.
4. **NO_COLOR**: Any value disables color output (per no-color.org standard).
5. **Defaults**: All defaults are designed for reasonable local development.
