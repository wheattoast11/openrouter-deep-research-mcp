# Testing Guide: openrouter-agents v1.6.0

## Overview

v1.6.0 introduces **13 test suites** covering every critical path:

| Test Suite | File | Coverage |
|------------|------|----------|
| Transport/Auth/Mode Matrix | `mcp-matrix.spec.js` | STDIO, HTTP, OAuth, API key, MODE filtering |
| Streaming Contracts | `streaming-contract.spec.js` | Progress events, backpressure, errors |
| OAuth2 Resource Server | `oauth-resource-server.spec.js` | JWT flows, audience validation, expiry |
| Dual Embedding Eval | `dual-embedding-eval.spec.js` | Side-by-side provider comparison |
| Performance Benchmarks | `perf-bench.js` | p50/p95/p99 latencies across transports |
| Idempotency & Leases | `idempotency-lease.spec.js` | Job leasing, heartbeat, reclaim |
| Cache Invalidation | `cache-invalidation.spec.js` | Exact/semantic hits, pruning |
| Model Routing | `model-routing.spec.js` | Cost-tier selection, fallbacks |
| Zod Schema Validation | `zod-schema-validation.spec.js` | Schema conformance |
| Resource Subscriptions | `resource-subscription.spec.js` | listChanged, subscribe/unsubscribe |
| Fault Injection | `fault-injection.spec.js` | DB/network/provider failures |
| Security Hardening | `security-hardening.spec.js` | SSRF, redaction, SQL validation |
| Webcontainer Integration | `webcontainer-zero-integration.spec.js` | Minimal-env startup for /zero |

---

## Quick Start

### Run All Critical Tests
```bash
npm run test:suite
```

This executes the **critical path** tests:
- Transport/Auth matrix
- Streaming contracts
- OAuth resource server
- Lease/idempotency
- Cache invariants
- Security hardening

**Expected duration:** ~2-5 minutes (depends on API keys and network).

### Generate QA Report
```bash
npm run qa:report
```

Produces: `docs/qa-automated-report.md` with pass/fail summary and critical-failure flags.

---

## Individual Test Suites

### 1. Transport/Auth/Mode Matrix
```bash
npm run test:matrix
```

**What it tests:**
- STDIO transport with AGENT/MANUAL/ALL modes
- Streamable HTTP with OAuth JWT, API key, and no-auth
- Tool exposure filtering based on MODE
- MCP protocol compliance (initialize, list_tools, ping)

**Required env:**
- `OPENROUTER_API_KEY` (optional for basic tests)
- `GEMINI_API_KEY` (optional)

**Expected output:**
```
[stdio-all] ✅ PASS
[stdio-agent-mode] ✅ PASS
[http-all-apikey] ✅ PASS
[http-manual-noauth] ✅ PASS
```

---

### 2. Streaming Contracts
```bash
npm run test:streaming
```

**What it tests:**
- Progress event ordering via `onprogress` callbacks
- Streaming over STDIO and HTTP transports
- Graceful teardown and timeout handling
- Error propagation in streams

**Expected behavior:**
- Progress events arrive before final result
- No out-of-order chunks
- Errors surface via `onprogress` or final result

---

### 3. OAuth2 Resource Server
```bash
npm run test:oauth
```

**What it tests:**
- Valid JWT with correct audience → 200 OK
- Missing bearer token → 401 Unauthorized
- Wrong audience → 403 Forbidden
- Expired token → 403 Forbidden

**Required:**
- No external dependencies (uses mock JWKS server)

**Expected output:**
```
[OAuth Positive JWT Flow] ✅
[OAuth Negative Cases] ✅
```

---

### 4. Dual Embedding Evaluation
```bash
npm run test:dual-embed
```

**What it tests:**
- Primary vs alternate embedding generation
- Cosine similarity computation
- Metric logging to `embedding_eval` table

**Required env:**
```bash
export EMBEDDINGS_DUAL_ENABLED=true
export EMBEDDINGS_DUAL_PROVIDER=huggingface-local
```

**Expected output:**
```
Query: quantum computing applications | Cosine(primary, alt) = 0.7823
Query: history of the Model Context Protocol | Cosine(primary, alt) = 0.8156
Query: agentic research patterns | Cosine(primary, alt) = 0.7492
```

---

### 5. Performance Benchmarks
```bash
npm run test:perf
```

**What it tests:**
- p50/p95/p99 latencies for `list_tools`, `ping`, `agent`
- STDIO vs Streamable HTTP comparison
- System resource metrics (CPU count, platform)

**Expected output:**
```json
{
  "host": "hostname",
  "platform": "win32",
  "cpus": 8,
  "results": [
    {
      "scenario": "STDIO transport",
      "stats": {
        "listTools": { "p50": 42, "p95": 67, "p99": 89 },
        "ping": { "p50": 8, "p95": 12, "p99": 15 },
        "agent": { "p50": 7234, "p95": 8901, "p99": 9456 }
      }
    }
  ]
}
```

---

### 6. Idempotency & Leases
```bash
npm run test:lease
```

**What it tests:**
- Job creation and lease acquisition
- Heartbeat updates
- Timeout reclaim (stale jobs → re-queued)
- Idempotency key lookup

**Expected behavior:**
- Jobs transition queued → running → succeeded
- Heartbeat updates `heartbeat_at` timestamp
- Jobs without heartbeat for >timeout are reclaimed
- Duplicate idempotency keys return cached result

---

### 7. Cache Invalidation
```bash
npm run test:cache
```

**What it tests:**
- Exact-match cache hits
- Semantic similarity fallback
- Cache clearing and miss behavior
- Metric tracking (exactHits, semanticHits, misses)

**Expected behavior:**
- First query → exact hit
- After clear → miss
- Metrics increment correctly

---

### 8. Model Routing
```bash
npm run test:routing
```

**What it tests:**
- Cost-tier routing (high vs low)
- Domain-based model selection (technical, coding, general)
- Fallback provision when primary unavailable

**Expected output:**
```
Low-cost routing: deepseek/deepseek-chat-v3.1
High-cost routing: x-ai/grok-4
```

---

### 9. Zod Schema Validation
```bash
npm run test:zod
```

**What it tests:**
- Schema parsing with valid params
- Enum validation (e.g., `costPreference: 'high'`)

**Expected output:**
```
Zod schema validation passes.
```

---

### 10. Resource Subscriptions
```bash
npm run test:resources
```

**What it tests:**
- `client.listResources()`
- `client.subscribeResource({ uri })`
- `client.unsubscribeResource({ uri })`

**Expected behavior:**
- Resources list non-empty (if `MCP_ENABLE_RESOURCES=true`)
- Subscribe/unsubscribe complete without errors

---

### 11. Fault Injection
```bash
npm run test:fault
```

**What it tests:**
- DB transient failure recovery (exponential backoff)
- Provider timeout handling (AbortController)
- 429 rate-limit logic existence

**Expected behavior:**
- Transient errors retry and succeed
- Timeouts throw abort/timeout errors
- OpenRouterClient has chatCompletion method

---

### 12. Security Hardening
```bash
npm run test:security
```

**What it tests:**
- Secret redaction (API keys, bearer tokens)
- SSRF blocking (localhost, private IPs, metadata endpoints)
- SQL validation (SELECT-only, blocked functions)
- PII redaction (email, SSN, credit cards)

**Expected output:**
```
[security] testing secret redaction ✅
[security] testing SSRF protection ✅
[security] testing SQL validation ✅
[security] testing PII redaction ✅
```

---

### 13. Webcontainer Integration
```bash
npm run test:webcontainer
```

**What it tests:**
- Minimal-env startup (no API keys, CPU-only)
- AGENT mode tool exposure (single `agent` tool)
- Graceful fallback to local HF embeddings
- Startup time <30s

**Expected behavior:**
- Server initializes without errors
- `agent` tool available in AGENT mode
- `research` tool hidden in AGENT mode

---

## CI/CD

### GitHub Actions Workflow
**File:** `.github/workflows/ci-matrix.yml`

**Matrix:**
- OS: Ubuntu, Windows, macOS
- Node: 18, 20
- Total: 6 combinations

**Jobs:**
1. `test-matrix`: Runs core + matrix + security + zod + cache tests
2. `test-comprehensive`: Runs comprehensive QA + intuitiveness QA + report generation
3. `test-transports`: STDIO and HTTP transport-specific tests

**Secrets required:**
- `OPENROUTER_API_KEY`
- `GEMINI_API_KEY`

---

## Troubleshooting

### Test Failures

#### "Server failed to start"
- **Cause:** Port already in use or missing dependencies.
- **Fix:** Kill stale processes, run `npm install`, check env vars.

#### "Embedder not ready"
- **Cause:** Local HF model not downloaded or API key missing.
- **Fix:** Wait for first initialization (downloads model), or set `GEMINI_API_KEY`.

#### "JWT verification failed"
- **Cause:** Mock JWKS server not started or port conflict.
- **Fix:** Ensure ports 38231-38234 are free.

#### "Database not initialized"
- **Cause:** PGLite directory creation failed.
- **Fix:** Check write permissions on `./researchAgentDB` or set `PGLITE_ALLOW_IN_MEMORY_FALLBACK=true`.

---

## Advanced Usage

### Run Specific Test Scenarios

#### Test STDIO + AGENT mode only
```bash
MODE=AGENT node tests/mcp-matrix.spec.js
```

#### Test with dual embeddings enabled
```bash
EMBEDDINGS_DUAL_ENABLED=true node tests/dual-embedding-eval.spec.js
```

#### Benchmark with high parallelism
```bash
PARALLELISM=8 node tests/perf-bench.js
```

---

## Test Development

### Adding New Tests

1. Create file in `tests/` directory (e.g., `new-feature.spec.js`)
2. Follow existing patterns (use MCP SDK client, spawn server, assert results)
3. Add npm script to `package.json`:
   ```json
   "test:new-feature": "node tests/new-feature.spec.js"
   ```
4. Update `scripts/generate-qa-report.js` TEST_SUITES array
5. Run validation: `npm run test:new-feature`

### Test Patterns

#### Spawn STDIO Server
```javascript
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [SERVER_ENTRY, '--stdio'],
  cwd: PROJECT_ROOT,
  env: { MODE: 'ALL', /* ... */ }
});
await transport.start();
await client.connect(transport);
```

#### Spawn HTTP Server
```javascript
const child = spawn(process.execPath, [SERVER_ENTRY], {
  env: { SERVER_PORT: '38000', SERVER_API_KEY: 'test', /* ... */ }
});
// Wait for ready, create StreamableHTTPClientTransport
```

#### Assert Tool Calls
```javascript
const result = await client.callTool({ name: 'ping', arguments: {} });
assert(result.content?.length, 'expected content');
```

---

## Metrics & Reporting

### QA Report Structure
```markdown
# QA Test Report

**Generated:** 2025-10-07T12:34:56.789Z
**Summary:** 12/13 passed, 1 failed, 0 skipped
**Critical Failures:** 0

## Test Results
✅ **MCP Matrix**: PASS
✅ **Streaming Contract**: PASS
❌ **OAuth Resource Server** [CRITICAL]: FAIL
  - Error: ...
```

### Performance Baselines
Captured in `npm run test:perf` JSON output:
- `p50`, `p95`, `p99` latencies
- OS/platform/CPU metadata
- Transport comparison (STDIO vs HTTP)

---

## Continuous Improvement

### Extending Coverage

1. **Add vision-specific tests** (image inputs to `agent` tool)
2. **Load testing** (concurrent requests, sustained throughput)
3. **Long-running job tests** (multi-hour research with heartbeat)
4. **Provider-specific tests** (OpenRouter rate limits, model availability)
5. **Graph enrichment tests** (query expansion via @terminals-tech/graph)

### Monitoring in Production

```bash
# Get server status
mcp_openrouterai-research-agents_get_server_status

# Check metrics endpoint
curl http://localhost:3002/metrics

# Review job queue
mcp_openrouterai-research-agents_get_job_status --job_id <id>
```

---

## Success Criteria

✅ **All 13 test suites pass**  
✅ **No critical failures in QA report**  
✅ **p95 latencies within baselines** (<50ms for ping, <150ms for list_tools over HTTP)  
✅ **Security tests all green** (SSRF blocked, secrets redacted, SQL validated)  
✅ **CI matrix passes** on Ubuntu/Windows/macOS × Node 18/20  

**Status:** ✅ **PRODUCTION READY**

---

**For full release notes, see:** [docs/RELEASE-v1.6.0.md](./RELEASE-v1.6.0.md)

