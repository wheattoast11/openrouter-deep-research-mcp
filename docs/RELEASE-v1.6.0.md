# Release v1.6.0: Production Hardening & Advanced Testing

**Release Date:** October 7, 2025  
**Focus:** Production readiness, comprehensive testing, security hardening, and dual-embedding evaluation

---

## 🎯 What's New

### 🧪 **Best-in-Class Test Coverage**
We've built a **state-of-the-art test harness** that validates every corner of the MCP server:

- **Transport Matrix**: STDIO and Streamable HTTP tested across all auth modes (OAuth JWT, API key, no-auth) and tool exposure modes (ALL, AGENT, MANUAL).
- **Streaming Contracts**: Ensures progress events arrive in order, backpressure is handled, and errors propagate correctly.
- **OAuth2 Resource Server**: Full positive/negative JWT flows with mock JWKS server, audience validation, token expiry, and clock-skew tolerance.
- **Performance Benchmarks**: Measure p50/p95/p99 latencies for key operations (`list_tools`, `ping`, `agent`) across transports.
- **Lease & Idempotency**: Validates job leasing, heartbeat reclaim, timeout recovery, and idempotent submission.
- **Cache Invariants**: Exact-match hits, semantic similarity retrieval, expiration pruning, and metric tracking.
- **Model Routing**: Verifies cost-tier selection, domain matching, and graceful fallback chains.
- **Fault Injection**: Simulates DB transient errors, provider timeouts, and rate-limit recovery.
- **Security Hardening**: SSRF protection, secret/PII redaction, and SQL injection guards.
- **Webcontainer Integration**: Minimal-env startup tests for seamless deployment on terminals.tech `/zero`.

Run the full suite:
```bash
npm run test:suite
```

Generate a QA report:
```bash
npm run qa:report
```

---

### 🔬 **Dual-Embedding Evaluation (Optional)**
Ever wondered if Gemini embeddings outperform local HuggingFace models for your use case?

Enable **dual-embedding mode** to compute both and compare:

```bash
export EMBEDDINGS_DUAL_ENABLED=true
export EMBEDDINGS_DUAL_PROVIDER=huggingface-local
```

The system will:
1. Compute **primary** (Gemini) and **alternate** (HF local) embeddings in parallel.
2. Store both vectors in the database with HNSW indexes.
3. Log **cosine similarity** and ranking differences to the `embedding_eval` table.
4. Use **fusion scoring** (weighted combination) in hybrid search for improved recall.

Side-by-side evaluation script:
```bash
npm run test:dual-embed
```

---

### 🔒 **Security Hardening**
Your MCP server is now **production-grade secure**:

- **SSRF Protection**: Blocks localhost, private IPs (10.x, 192.168.x, 169.254.x), link-local, and cloud metadata endpoints (AWS/GCP/Azure).
- **Secret Redaction**: API keys, bearer tokens, and sensitive headers automatically sanitized in all logs.
- **PII Redaction**: Email, SSN, and credit card patterns masked before storage/logging.
- **SQL Validation**: Only `SELECT` queries allowed; dangerous functions (`pg_sleep`, `pg_read_file`) blocked.

New module: `src/utils/security.js`

Test security:
```bash
npm run test:security
```

---

### 📊 **Enhanced Observability**
The `get_server_status` tool now returns:

- **Embedder details**: Provider (gemini, huggingface-local), model name, dimension.
- **Advanced cache stats**: Exact hits, semantic hits, misses, store count, and auto-pruning status.
- **AIMD concurrency**: Current and max concurrency for parallel research execution.
- **Transport config**: Streamable HTTP, SSE, and MODE settings.
- **Job queue snapshot**: Queued, running, succeeded, failed, canceled counts.

Example:
```json
{
  "embedder": {
    "ready": true,
    "provider": "gemini",
    "model": "gemini-embedding-001",
    "dimension": 768
  },
  "cache": {
    "summary": {
      "exactHits": 42,
      "semanticHits": 18,
      "misses": 5
    }
  },
  "orchestration": {
    "currentConcurrency": 4,
    "maxConcurrency": 16
  }
}
```

---

### 🚀 **CI/CD & Automation**
- **GitHub Actions CI matrix**: Runs tests across Ubuntu, Windows, macOS × Node 18, 20.
- **Automated QA reports**: `npm run qa:report` generates markdown summaries with pass/fail/critical flags.
- **Test suite runner**: `npm run test:suite` executes all critical tests in sequence.

---

### 🛠 **New Scripts**

| Command | Description |
|---------|-------------|
| `npm run test:matrix` | Transport/Auth/Mode matrix tests |
| `npm run test:streaming` | Streaming contract validation |
| `npm run test:oauth` | OAuth2 resource server flows |
| `npm run test:dual-embed` | Dual-embedding evaluation |
| `npm run test:perf` | Performance benchmarks |
| `npm run test:lease` | Lease/heartbeat/idempotency |
| `npm run test:cache` | Cache invalidation invariants |
| `npm run test:routing` | Model routing logic |
| `npm run test:zod` | Zod schema conformance |
| `npm run test:resources` | Resource subscriptions |
| `npm run test:fault` | Fault injection scenarios |
| `npm run test:security` | Security hardening checks |
| `npm run test:webcontainer` | Webcontainer /zero integration |
| `npm run test:suite` | Run all critical tests |
| `npm run qa:report` | Generate QA markdown report |

---

## 📦 Installation

```bash
npm install @terminals-tech/openrouter-agents@1.6.0
```

Or upgrade:
```bash
npm install @terminals-tech/openrouter-agents@latest
```

---

## 🔄 Migration

**No breaking changes.** Simply update and restart.

New schema columns are **nullable** and auto-applied on startup. If you enable dual embeddings, vectors will populate on the next research query.

See `docs/UPGRADE-v1.6.0.md` for full migration guide.

---

## 🎉 Highlights

This release transforms the openrouter-agents MCP server into a **production-grade, security-hardened, comprehensively-tested agentic research platform**. Key achievements:

1. **13 new test suites** covering every critical path.
2. **Dual-embedding evaluation** for side-by-side provider comparison.
3. **SSRF + secret/PII redaction** for enterprise security.
4. **CI/CD automation** across 3 OSes × 2 Node versions.
5. **Enhanced observability** with rich metrics and AIMD visibility.

---

## 🙏 Community

We're building the **best-in-class MCP research server**. This release sets a new bar for agentic systems:

- **Simple on the frontend**: Single `agent` tool with intuitive parameters.
- **State-of-the-art on the backend**: Graph-based orchestration, hybrid BM25+vector search, ensemble models, AIMD concurrency, dual embeddings, and semantic caching.

Join us at [terminals.tech](https://terminals.tech) and integrate with `/zero` for a seamless agentic research partner.

---

**Full Changelog**: [docs/CHANGELOG.md](./CHANGELOG.md)  
**Upgrade Notes**: [docs/UPGRADE-v1.6.0.md](./UPGRADE-v1.6.0.md)  
**Testing Guide**: Run `npm run test:suite` and `npm run qa:report`

---

Built with ❤️ by the terminals.tech team.

