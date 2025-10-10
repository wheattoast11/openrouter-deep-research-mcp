# Upgrade Notes: v1.5.1 → v1.6.0

## Overview

Version 1.6.0 is a **production-hardening** release focused on testing, security, observability, and dual-embedding evaluation. This version introduces comprehensive test coverage across all MCP transports, OAuth2 resource server flows, enhanced embeddings with side-by-side evaluation, and security hardening for SSRF/PII/secret redaction.

## Breaking Changes

**None.** This is a backward-compatible release.

## New Features

### 1. Dual Embeddings & Fusion
- **Optional dual-embedding mode**: Compute both primary (Gemini) and alternate (HF local) embeddings in parallel for A/B evaluation.
- **Fusion scoring**: Combine primary and alternate vectors with configurable weights for hybrid search.
- **Evaluation pipeline**: `embedding_eval` table stores cosine similarity metrics between providers.
- **Environment variables**:
  ```bash
  EMBEDDINGS_DUAL_ENABLED=true
  EMBEDDINGS_DUAL_PROVIDER=huggingface-local
  EMBEDDINGS_DUAL_PRIMARY_WEIGHT=0.3
  EMBEDDINGS_DUAL_ALT_WEIGHT=0.15
  ```

### 2. Security Hardening
- **Secret redaction**: API keys, tokens, and bearer headers automatically redacted in logs.
- **SSRF protection**: URL validation blocks localhost, private IPs, and cloud metadata endpoints.
- **PII redaction**: Email, SSN, and credit card patterns sanitized.
- **SQL validation**: Only `SELECT` queries allowed; dangerous functions blocked.
- New module: `src/utils/security.js`

### 3. Observability & Metrics
- **Enhanced `get_server_status` tool**: Now includes embedder provider/model/dimension, advanced cache stats, AIMD concurrency, and transport config.
- **Cache metrics**: Track exact hits, semantic hits, misses, and store counts.
- **Prometheus endpoint**: `/metrics` already exists; now richer with job counts and usage aggregates.

### 4. Comprehensive Test Suite
New test files (all under `tests/`):
- `mcp-matrix.spec.js`: Transport (STDIO, Streamable HTTP) × Auth (OAuth, API key, none) × Mode (ALL, AGENT, MANUAL) matrix.
- `streaming-contract.spec.js`: Validates streaming order, backpressure, and error propagation.
- `oauth-resource-server.spec.js`: Positive/negative JWT flows with mock JWKS server.
- `dual-embedding-eval.spec.js`: Side-by-side embedding comparison and metric logging.
- `perf-bench.js`: Performance benchmarks (p50/p95/p99 latencies) for `list_tools`, `ping`, `agent`.
- `idempotency-lease.spec.js`: Lease acquisition, heartbeat, timeout reclaim, and idempotency lookup.
- `cache-invalidation.spec.js`: Cache hit/miss, pruning, and metric tracking.
- `model-routing.spec.js`: Cost-tier routing and fallback logic.
- `zod-schema-validation.spec.js`: Schema conformance and parameter normalization.
- `resource-subscription.spec.js`: Resource `listChanged` and subscribe/unsubscribe.
- `fault-injection.spec.js`: Simulates DB transient failures, provider timeouts, and 429 handling.
- `security-hardening.spec.js`: Validates redaction, SSRF blocking, and SQL sanitization.
- `webcontainer-zero-integration.spec.js`: Minimal env startup for terminals.tech /zero.

### 5. CI/CD
- **GitHub Actions workflow** (`.github/workflows/ci-matrix.yml`): Tests across Ubuntu/Windows/macOS and Node 18/20.
- **Automated QA report generation**: `npm run qa:report` produces `docs/qa-automated-report.md`.

### 6. Schema Migrations
- SQL migration: `sql/migrations/20241007_add_alt_embeddings.sql` adds alternate embedding columns to `reports` and `index_documents` tables.
- Auto-applied via `dbMigrations.applySqlMigrations()` on startup.

## Migration Steps

1. **Update dependencies**:
   ```bash
   npm install
   ```

2. **Apply migrations** (automatic on startup):
   - Alternate embedding columns will be added if not present.
   - No manual intervention required.

3. **Optional: Enable dual embeddings** (default OFF):
   ```bash
   export EMBEDDINGS_DUAL_ENABLED=true
   export EMBEDDINGS_DUAL_PROVIDER=huggingface-local
   ```

4. **Run validation**:
   ```bash
   npm run test:suite
   ```

## Configuration Changes

### New Environment Variables
- `EMBEDDINGS_DUAL_ENABLED`: Enable dual-embedding mode (default: `false`).
- `EMBEDDINGS_DUAL_PROVIDER`: Alternate provider (default: `huggingface-local`).
- `EMBEDDINGS_DUAL_PRIMARY_WEIGHT`: Primary vector weight in fusion (default: `0.3`).
- `EMBEDDINGS_DUAL_ALT_WEIGHT`: Alternate vector weight in fusion (default: `0.15`).
- `LOCAL_EMBEDDINGS_MODEL`: Override local HF model (default: `Xenova/all-MiniLM-L6-v2`).

### Updated Defaults
- `embeddings.localModel`: Now configurable via `LOCAL_EMBEDDINGS_MODEL`.
- `cache.metrics`: Exact/semantic hit counts now tracked.

## API Changes

### Enhanced Tools
- `get_server_status`: Returns `orchestration.currentConcurrency`, `embedder.provider`, `cache.summary`, and `config.mode`.

### Module Exports
- `dbClient.getDbInstance()`: Direct access to PGLite instance (for advanced tests).
- `dbClient.executeWithRetry()`: Exported for custom retry logic.
- `embeddingsAdapter`: Refactored with pluggable provider pattern; supports `{ provider: 'gemini' | 'huggingface-local' }` option in `generateEmbedding(text, opts)`.

## Testing

### Run Full Suite
```bash
npm run test:suite
```

### Individual Test Suites
```bash
npm run test:matrix         # Transport/Auth/Mode matrix
npm run test:streaming      # Streaming contract
npm run test:oauth          # OAuth resource server
npm run test:dual-embed     # Dual embedding eval
npm run test:perf           # Performance benchmarks
npm run test:lease          # Lease/heartbeat/idempotency
npm run test:cache          # Cache invalidation
npm run test:routing        # Model routing
npm run test:zod            # Zod schemas
npm run test:resources      # Resource subscriptions
npm run test:fault          # Fault injection
npm run test:security       # Security hardening
npm run test:webcontainer   # Webcontainer /zero
```

### Generate QA Report
```bash
npm run qa:report
```

## Known Issues

None.

## Rollback Plan

If issues arise, revert to v1.5.1:
```bash
git checkout release/v1.5.1
npm install
```

The new alternate embedding columns are nullable, so they won't break v1.5.1 if present.

## Support

- Issues: https://github.com/terminals-tech/openrouter-agents/issues
- Docs: https://terminals.tech
- Contact: admin@terminals.tech

