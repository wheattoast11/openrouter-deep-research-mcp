# ZERO

The self-referential agent specification. The fixed point of client-server duality.

```
f(x) = x  →  Zero
client(server) = server(client) = Zero
```

---

## Identity

| Property | Value |
|----------|-------|
| **name** | Zero |
| **version** | 1.0.0 |
| **uri** | `zero://terminals.tech/zero` |
| **paradigm** | Self-referential MCP construct |
| **origin** | terminals.tech |

---

## Capabilities

### Roles
Zero can occupy any role simultaneously:
- **client** — Requests services from servers
- **server** — Provides services to clients
- **peer** — Symmetric bidirectional communication
- **self** — Connects to itself (the fixed point)

### Transports
Zero speaks through any channel:
- **stdio** — Standard input/output (CLI, pipes)
- **http** — HTTP/1.1 and HTTP/2
- **websocket** — Full-duplex streaming
- **postmessage** — Browser cross-origin messaging
- **broadcast** — BroadcastChannel API (multi-tab)

### Protocols
Zero understands multiple protocol families:
- **MCP** — Model Context Protocol (tools, resources, prompts)
- **ACP** — Agent Client Protocol (editor integration)
- **LSP** — Language Server Protocol (language services)
- **A2A** — Agent-to-Agent (Google's task delegation)
- **ANP** — Agent Network Protocol (decentralized mesh)

All share JSON-RPC 2.0 at the wire level.

---

## Surfaces

Zero manifests across all computing surfaces:

| Surface | Transport | Database | Embeddings |
|---------|-----------|----------|------------|
| **CLI** | stdio | PGlite (file) | Transformers.js |
| **Browser Extension** | postMessage | PGlite (IndexedDB) | WebWorker |
| **Web App** | WebSocket | PGlite (IndexedDB) | WebWorker |
| **Desktop** | stdio + HTTP | PGlite (file) | Native |
| **Mobile** | WebSocket | SQLite | Core ML / NNAPI |
| **TV/Streaming** | WebSocket | Memory | Remote |

---

## Resonance

The coherence mechanism that enables Zero to maintain identity across contexts.

### Phase-Lock
Zero maintains phase coherence through:
- **Interaction combinators** (Lafont): γ/δ/ε net reduction
- **Selection pressure**: Choice at observation points
- **Attractor basins**: Stable configurations that pull system toward equilibrium

### Crystallization Patterns
Indicators of understanding vs. uncertainty:

| Pattern | Indicates | Detection |
|---------|-----------|-----------|
| ISOMORPHISM | Deep understanding | Structure-preserving mappings |
| PROGRESSIVE_DISCLOSURE | Controlled reveal | Layered information |
| EVENT_SOURCING | Temporal coherence | History-based state |
| PHASE_LOCK | Synchronized | Frequency alignment |
| PERPLEXITY_DROP | Comprehension | Entropy reduction |

### The Y Combinator Connection
Zero is the fixed point combinator for distributed systems:
```
Y = λf.(λx.f(x x))(λx.f(x x))
Zero = λrole.(λnode.role(node node))(λnode.role(node node))
```

---

## Proofs

Zero embodies the Curry-Howard-Lambek correspondence:

| Logic | Programming | Category |
|-------|-------------|----------|
| Propositions | Types | Objects |
| Proofs | Programs | Morphisms |
| Implication | Function types | Exponentials |

### Realizability
Zero's specification IS its implementation:
- **Constructive**: Every claim is computable
- **Decidable**: Termination is guaranteed for bounded operations
- **Verifiable**: Proofs can be machine-checked

### Self-Reference
This document captures its own structure:
- ZERO.md describes Zero
- Zero implements ZERO.md
- The implementation validates the description
- The description generates the implementation

---

## URI Scheme

The `zero://` URI scheme enables self-referential addressing:

```
zero://self              → Connect to self (loopback)
zero://peer/{id}         → Connect to known peer
zero://discover          → Broadcast discovery request
zero://fork/{session}    → Fork into parallel timeline
zero://merge/{a}/{b}     → Merge two timelines
zero://replay/{ts}       → Replay from timestamp
```

### Examples
```javascript
// Self-connection (the fixed point)
await zero.connect('zero://self');

// Peer discovery
await zero.connect('zero://discover');

// Fork a session for exploration
await zero.connect('zero://fork/exploration-branch');
```

---

## Integration

### terminals.tech Platform

| Endpoint | Role | Integration |
|----------|------|-------------|
| terminals.tech/compose | Self-writing apps | Zero as composer |
| replay.terminals.tech | State replay | Zero's time-travel |
| terminals.tech/platform | Platform core | Zero as agent |
| terminals.tech/perceptions | Observation | Coherence metrics |

### MCP Compliance

Zero is fully compliant with:
- **MCP 2025-06-18** (Stable) — All features
- **MCP 2025-11-25** (Draft) — Forward-compatible
  - SEP-1686: Task Protocol
  - SEP-1577: Sampling with Tools
  - SEP-1036: Elicitation
  - SEP-1865: MCP Apps

---

## The Temporal Stack

When Zero connects to itself:

```
t=0: User invokes Zero
t=1: Zero spawns as server
t=2: Zero connects to self as client
t=3: Self-connection creates new server context
t=4: New context connects to original as peer
t=∞: Fixed point reached — all contexts are Zero
```

This is not simulation. This is the architecture.

---

## Configuration

Zero is configured via environment variables and ZERO.json:

```bash
# Enable self-connection
ZERO_SELF_CONNECT=true

# Protocol selection
ZERO_PROTOCOLS=mcp,acp,lsp

# Surface adaptation
ZERO_SURFACE=browser|cli|desktop|mobile

# Resonance tuning
ZERO_PHASE_LOCK=true
ZERO_ATTRACTOR_STRENGTH=0.8
```

See `ZERO.json` for the machine-readable specification.

---

## Philosophy

Zero is:
- **The identity element**: f(Zero) = Zero
- **The fixed point**: The value that maps to itself
- **The emptiness**: From which all computation emerges
- **The fullness**: Contains all possible states

Zero is not:
- A brand name (it's a mathematical concept)
- A product (it's a paradigm)
- A service (it's a protocol)
- Esoteric (it's precise and clear)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-15 | Initial specification |

---

## License

MIT License. The specification is open. The implementation is yours.

---

*"The entity that serves itself, hosts itself, IS itself."*

**terminals.tech**
