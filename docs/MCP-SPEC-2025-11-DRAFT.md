# MCP Spec Draft (Nov 2025)

### Scope
Formalize draft extensions: implicit cognition mode, deterministic seeds, encrypted traces, async jobs with phased events, and client resource hints.

### 1) Implicit Cognition Mode
- Request fields on tool params (accepted, no-op if unsupported):
  - `agent_mode: 'implicit'|'explicit'` (default: 'implicit')
  - `algebra: string` single-letter tag algebra (e.g., `I(A(R(O(K))))`)
  - `resource_hints: { max_context?: number, rope_scale?: number, device?: 'webgpu'|'cpu' }`

### 2) Determinism & Seeds
- Envelope:
  - `seed?: number` (server may echo/override)
  - `prng?: 'lcg'|'xoroshiro'` (advisory)
- Response metadata (events/results):
  - `seed_used: number|null`, `determinism: 'best_effort'|'strict'`

### 3) Encrypted Traces (UoG)
- Clients MAY submit encrypted compliance traces.
- Payload shape:
  - `{ ciphertext: string, amb_proof?: any, algo: 'amb-3body-xor'|'aes-256-gcm' }`
- Server MUST accept, store; keys remain client-side.

### 4) Async Jobs (WS/SSE)
- Event model: `{ id, ts, phase: 'observe'|'abstract'|'decide'|'act'|'verify', event_type, payload, meta }`
- Multiplexed event-type streams; resumable via `Last-Event-Id` or `?since_event_id=`.

### 5) Client Resource Hints
- Clients MAY advertise `{ mem_mb, cores, gpu: boolean }` out-of-band; servers SHOULD adapt plans.

### Wire Examples

Request params (JSON-RPC tools/call):
```json
{
  "name": "agent",
  "arguments": {
    "action": "research",
    "query": "Phase-lock derivation",
    "agent_mode": "implicit",
    "algebra": "I(A(R(O(K))))",
    "seed": 42,
    "resource_hints": { "max_context": 32768, "rope_scale": 2.0, "device": "webgpu" }
  }
}
```

SSE event (server → client):
```json
{
  "id": 128,
  "event_type": "synthesis_token",
  "phase": "verify",
  "payload": { "content": "..." },
  "meta": {
    "seed_used": 42,
    "determinism": "best_effort",
    "resource_used": { "device": "webgpu", "max_context": 32768, "rope_scale": 2.0 }
  }
}
```

### Implementation Touchpoints
- Server: `src/server/mcpServer.js`, `src/server/mcpStreamableHttp.js`, `src/utils/dbClient.js`, `src/platform/api.js`, `src/server/tools.js`
- Client: `client/src/services/DynamicContextManager.ts`
- Traces: `src/utils/traceEncryption.js`

### SLOs
- Determinism: 99% same-seed reproducibility (same device)
- Coherence: stream coherence index ≥ 0.85
- Safety: 0 protocol errors in `--stdio`; WS close codes per policy


