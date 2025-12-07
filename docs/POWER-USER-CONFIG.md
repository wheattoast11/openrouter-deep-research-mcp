# Power User Configuration Guide

This guide covers all environment variables and tuning options for advanced users.

## Table of Contents
- [Quick Reference](#quick-reference)
- [Server Configuration](#server-configuration)
- [Model Selection](#model-selection)
- [Performance Tuning](#performance-tuning)
- [Caching Strategies](#caching-strategies)
- [Database Configuration](#database-configuration)
- [Logging](#logging)
- [Feature Toggles](#feature-toggles)

---

## Quick Reference

| Variable | Default | Impact |
|----------|---------|--------|
| `ENSEMBLE_SIZE` | 2 | More models = higher quality, higher cost |
| `PARALLELISM` | 4 | Concurrent sub-queries, affects latency |
| `JOBS_CONCURRENCY` | 4 | Parallel async jobs |
| `RESULT_CACHING_ENABLED` | true | Cache research results |
| `MAX_TOOL_DEPTH` | 3 | Tool chaining depth limit |

---

## Server Configuration

### Core Settings

```bash
# Port (supports both env vars)
SERVER_PORT=3002
PORT=3002  # fallback

# Authentication
SERVER_API_KEY=your-api-key  # Required for HTTP mode

# Public URL (for SSE event URLs)
PUBLIC_URL=https://your-domain.com

# HTTPS enforcement
REQUIRE_HTTPS=true
```

### Startup Behavior

```bash
# Allow server to start without database ready
ALLOW_START_WITHOUT_DB=true

# Startup timeout (ms)
STARTUP_TIMEOUT_MS=30000
```

---

## Model Selection

### Primary Models

```bash
# Planning/synthesis model
PLANNING_MODEL=google/gemini-2.5-pro

# Fallback candidates (comma-separated)
PLANNING_CANDIDATES=openai/gpt-5-chat,google/gemini-2.5-pro,anthropic/claude-sonnet-4
```

### Cost Tiers

```bash
# High-quality, higher cost models
HIGH_COST_MODELS=x-ai/grok-4,openai/gpt-5-chat,google/gemini-2.5-pro

# Cost-effective models (default for costPreference: "low")
LOW_COST_MODELS=deepseek/deepseek-chat-v3.1,z-ai/glm-4.5v,qwen/qwen3-coder

# Ultra-cheap models for simple tasks
VERY_LOW_COST_MODELS=openai/gpt-5-nano
```

### Research Orchestration

```bash
# Models in each ensemble (higher = better quality, more cost)
ENSEMBLE_SIZE=2  # Range: 1-5, default 2

# Parallel sub-queries (higher = faster, more API calls)
PARALLELISM=4  # Range: 1-10, default 4

# Research refinement passes
MAX_RESEARCH_ITERATIONS=2  # 1 initial + N refinements
```

### Token Limits

```bash
# Synthesis tokens (final report generation)
SYNTHESIS_MIN_TOKENS=4000
SYNTHESIS_MAX_TOKENS=16000
TOKENS_PER_SUBQUERY=800
TOKENS_PER_DOC=500

# Research tokens (sub-query responses)
RESEARCH_MIN_TOKENS=2000
RESEARCH_MAX_TOKENS=8000

# Planning tokens (query decomposition)
PLANNING_MIN_TOKENS=1000
PLANNING_MAX_TOKENS=4000
```

---

## Performance Tuning

### Async Job Processing

```bash
# Concurrent jobs (affects parallelism)
JOBS_CONCURRENCY=4  # Range: 1-10

# Heartbeat interval (ms) - lower = faster stale detection
JOB_HEARTBEAT_MS=2000

# Job lease timeout (ms) - lower = faster recovery from crashes
JOB_LEASE_TIMEOUT_MS=30000

# SSE polling interval (ms) - lower = more responsive
JOB_SSE_POLLING_MS=500

# Max events per SSE poll
JOB_BATCH_EVENT_LIMIT=500
```

### Tool Recursion

```bash
# Max tool chaining depth (0 = disabled)
MAX_TOOL_DEPTH=3
```

### Quality vs Speed Trade-offs

| Profile | ENSEMBLE_SIZE | PARALLELISM | JOBS_CONCURRENCY | Use Case |
|---------|---------------|-------------|------------------|----------|
| Fast | 1 | 2 | 2 | Quick answers, low cost |
| Balanced | 2 | 4 | 4 | Default, good quality |
| Thorough | 3 | 6 | 6 | Deep research, higher cost |
| Maximum | 5 | 10 | 10 | Best quality, highest cost |

---

## Caching Strategies

### Result Caching

```bash
# Enable/disable semantic result caching
RESULT_CACHING_ENABLED=true

# Cache TTL (seconds) - 2 hours default
RESULT_CACHE_TTL=7200

# Max cached entries
RESULT_CACHE_MAX_ENTRIES=1000

# Similarity threshold for cache hits (0-1)
CACHE_SIMILARITY_THRESHOLD=0.85
```

### Model Response Caching

```bash
# Enable model response caching
MODEL_CACHING_ENABLED=true

# Model cache TTL (seconds) - 1 hour default
MODEL_CACHE_TTL=3600

# Max cached model responses
MODEL_CACHE_MAX_ENTRIES=500
```

### Cache Tuning Tips

- **Lower threshold (0.75)**: More cache hits, potentially less accurate
- **Higher threshold (0.95)**: Fewer hits, more fresh results
- **Disable caching**: Set `*_CACHING_ENABLED=false` for always-fresh results

---

## Database Configuration

### PGLite Settings

```bash
# Data directory (persistent storage)
PGLITE_DATA_DIR=./researchAgentDB

# Override database URL
PGLITE_DATABASE_URL=pglite://./custom-path

# Relaxed durability (faster writes, less safe)
PGLITE_RELAXED_DURABILITY=true

# Retry configuration
PGLITE_MAX_RETRY_ATTEMPTS=3
PGLITE_RETRY_DELAY_BASE_MS=200

# Initialization
PGLITE_INIT_TIMEOUT_MS=30000
PGLITE_RETRY_ON_FAILURE=true
PGLITE_ALLOW_IN_MEMORY_FALLBACK=true
```

### Indexer Settings

```bash
# Enable/disable indexer
INDEXER_ENABLED=true

# Auto-index research results
INDEXER_AUTO_INDEX_REPORTS=true
INDEXER_AUTO_INDEX_FETCHED=true

# Embed documents for vector search
INDEXER_EMBED_DOCS=true

# Max document length for indexing
INDEXER_MAX_DOC_LENGTH=8000

# BM25 tuning
INDEXER_BM25_K1=1.2
INDEXER_BM25_B=0.75

# Search weights (must sum to 1.0)
INDEXER_WEIGHT_BM25=0.7
INDEXER_WEIGHT_VECTOR=0.3

# LLM reranking (experimental)
INDEXER_RERANK_ENABLED=true
INDEXER_RERANK_MODEL=openai/gpt-5-mini
```

---

## Logging

```bash
# Log level: debug | info | warn | error
LOG_LEVEL=info

# Output mode: stderr | mcp | both
LOG_OUTPUT=stderr

# JSON format (for log aggregation)
LOG_JSON=false
```

### Log Levels

| Level | Output |
|-------|--------|
| `debug` | Everything including internal state |
| `info` | Normal operations |
| `warn` | Degraded functionality |
| `error` | Failures only |

---

## Feature Toggles

### MCP Features

```bash
# Enable MCP prompts
MCP_ENABLE_PROMPTS=true

# Enable MCP resources
MCP_ENABLE_RESOURCES=true

# Server mode: AGENT | MANUAL | ALL
MODE=ALL

# Streamable HTTP transport
MCP_STREAMABLE_HTTP_ENABLED=true
```

### Prompt Strategy

```bash
# Compact prompts (reduced token usage)
PROMPTS_COMPACT=true

# Require explicit URL citations
PROMPTS_REQUIRE_URLS=true

# Enable confidence scoring
PROMPTS_CONFIDENCE=true
```

### Simple Tools

```bash
# Enable short parameter aliases (q, cost, aud, etc.)
SIMPLE_TOOLS=true
```

### Experimental

```bash
# Hyper mode (experimental optimizations)
HYPER_MODE=false

# Dynamic model catalog (fetch from OpenRouter)
USE_DYNAMIC_CATALOG=true
```

---

## Common Configurations

### Development (Fast Iteration)

```bash
ENSEMBLE_SIZE=1
PARALLELISM=2
LOG_LEVEL=debug
RESULT_CACHING_ENABLED=true
```

### Production (High Quality)

```bash
ENSEMBLE_SIZE=3
PARALLELISM=6
LOG_LEVEL=info
JOBS_CONCURRENCY=6
RESULT_CACHING_ENABLED=true
```

### Cost-Conscious

```bash
ENSEMBLE_SIZE=1
PARALLELISM=2
LOW_COST_MODELS=deepseek/deepseek-chat-v3.1,openai/gpt-5-nano
RESULT_CACHE_TTL=14400  # 4 hours
CACHE_SIMILARITY_THRESHOLD=0.80
```

### Maximum Throughput

```bash
JOBS_CONCURRENCY=10
PARALLELISM=10
JOB_SSE_POLLING_MS=200
JOB_HEARTBEAT_MS=1000
RESULT_CACHING_ENABLED=true
```

---

## Environment File Template

```bash
# .env.production
OPENROUTER_API_KEY=sk-or-...
SERVER_API_KEY=your-secure-key
SERVER_PORT=3002
PUBLIC_URL=https://your-domain.com

# Models
PLANNING_MODEL=google/gemini-2.5-pro
ENSEMBLE_SIZE=2
PARALLELISM=4

# Performance
JOBS_CONCURRENCY=4
RESULT_CACHING_ENABLED=true
RESULT_CACHE_TTL=7200

# Storage
PGLITE_DATA_DIR=./data/research
REPORT_OUTPUT_PATH=./data/reports/

# Logging
LOG_LEVEL=info
LOG_OUTPUT=stderr

# Features
MODE=ALL
INDEXER_ENABLED=true
```
