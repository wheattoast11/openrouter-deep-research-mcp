# Core Abstractions

This directory contains reusable abstractions for Zero.

## Module Status

| File | Status | Description |
|------|--------|-------------|
| `normalize.js` | STABLE | Parameter normalization with alias support |
| `signal.js` | STABLE | Inter-agent message protocol |
| `combinators.js` | STABLE | Composable workflow building blocks |
| `schemas/` | STABLE | Zod validation schemas |
| `roleShift.js` | BETA | Bidirectional client↔server protocol |
| `dualRoleNode.js` | VISION | Node that acts as both client and server |
| `protocolAdapter.js` | VISION | Abstract protocol layer (MCP, ACP, LSP) |
| `zeroUri.js` | VISION | `zero://` URI scheme parsing |

## Status Definitions

- **STABLE**: Used in production, API is frozen
- **BETA**: Working, but API may change between versions
- **VISION**: Specification exists, integration planned for future version

## Quick Reference

### normalize.js (STABLE)

Declarative parameter normalization with alias support.

```javascript
const { normalizeParams } = require('./normalize');

const params = normalizeParams({
  q: 'machine learning',     // alias for 'query'
  cost: 'low'                // alias for 'costPreference'
}, 'research');

// Result: { query: 'machine learning', costPreference: 'low' }
```

### signal.js (STABLE)

Typed messages for inter-agent communication.

```javascript
const { Signal, ConsensusCalculator } = require('./signal');

// Create signals from different models
const s1 = Signal.response('Answer A', 'claude', 0.9);
const s2 = Signal.response('Answer A', 'gpt4', 0.85);
const s3 = Signal.response('Answer B', 'gemini', 0.7);

// Calculate consensus
const calc = new ConsensusCalculator({ minAgreement: 0.6 });
const result = calc.calculate([s1, s2, s3]);
// Result: { consensus: 'Answer A', confidence: 0.875, agreement: 0.67 }
```

### combinators.js (STABLE)

Building blocks for workflow composition.

```javascript
const { pipe, parallel, branch, retry } = require('./combinators');

// Sequential pipeline
const workflow = pipe(
  validateInput,
  fetchData,
  transform,
  store
);

// Parallel execution
const results = await parallel(
  fetchFromClauade,
  fetchFromGPT,
  fetchFromGemini
)(input);

// Conditional branching
const handler = branch(
  [isUrgent, handleUrgent],
  [isNormal, handleNormal],
  [() => true, handleDefault]
);
```

### schemas/ (STABLE)

Zod schemas for validation.

```javascript
const { researchSchema, jobSchema } = require('./schemas');

// Validate research params
const result = researchSchema.safeParse(input);
if (!result.success) {
  console.error(result.error.issues);
}
```

### roleShift.js (BETA)

Bidirectional protocol for server→client requests.

```javascript
const { RoleShift } = require('./roleShift');

const shift = new RoleShift(mcpServer);

// Server requests sampling from client
const response = await shift.requestSampling({
  messages: [{ role: 'user', content: 'Summarize this' }],
  maxTokens: 500
});
```

## Integration Roadmap

### v1.10 (Current)
- Core abstractions defined and documented
- STABLE modules used throughout server

### v1.11 (Planned)
- `DualRoleNode` integration into mcpServer.js
- Server can initiate outbound MCP connections
- Full RoleShift support

### v1.12 (Planned)
- `zero://` URI scheme for routing
- Protocol-agnostic communication layer
- Multi-protocol support (MCP, ACP, LSP)

## Usage Guidelines

### Do
- Import STABLE modules freely
- Use BETA modules with version pinning
- Read VISION module specs for future planning

### Don't
- Depend on VISION module APIs (they will change)
- Modify STABLE modules without discussion
- Skip validation (use schemas/)

## Contributing

1. Check module status before modifying
2. STABLE changes require RFC
3. BETA changes need tests
4. VISION changes are experimental

---

**See also**: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
