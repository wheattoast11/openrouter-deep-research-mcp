# Zero Concepts

Plain English explanations of Zero terminology.

## What is Zero?

Zero is a self-referential AI agent server. It implements the Model Context Protocol (MCP) but with a twist: it can act as both **client** and **server** simultaneously.

Think of it like a mirror that can ask itself questions and get consistent answers.

## Key Terms

| Term | Plain English | Technical |
|------|---------------|-----------|
| **MCP** | A standard way for AI tools to communicate | Model Context Protocol - JSON-RPC over stdio/HTTP |
| **Fixed Point** | When Zero asks itself something and gets the same answer back | `f(x) = x` - the output equals the input |
| **Dual-Role** | Acting as both client and server at once | A node that handles requests and sends them |
| **Signal** | A message between AI models | Typed payload with confidence score |
| **Handshake** | Proving "I am me" | Self-referential identity verification |
| **Combinator** | A building block for workflows | Composable function that transforms signals |
| **Knowledge Graph** | Connected research topics | Semantic relationships between reports |
| **Time Travel** | Undo/redo for your session | Navigate session history |

## The f(x) = x Thing

This is the core concept. When Zero processes a request:

```
Input:  "Who am I?"
Process: Zero asks itself
Output: "You are Zero"
```

The identity is preserved through the loop. This enables:
- **Self-verification**: Zero can prove its own identity
- **Recursive research**: Ask follow-up questions to itself
- **Consensus**: Multiple models agree on answers

## How Research Works

```
You ask: "What is quantum computing?"
    ↓
Zero sends to multiple AI models:
    - Claude
    - GPT-4
    - Gemini
    ↓
Each model responds with:
    - Answer
    - Confidence score (0.0 - 1.0)
    ↓
Zero synthesizes:
    - Common themes (consensus)
    - Disagreements (noted)
    - Sources (cited)
    ↓
Result: Verified report with confidence rating
```

## Transport Modes

| Mode | Use Case | How it works |
|------|----------|--------------|
| **STDIO** | Claude Code, Cursor, VS Code | Communicates over stdin/stdout |
| **HTTP** | REST APIs, web apps | Standard HTTP + SSE streaming |
| **Both** | Maximum compatibility | Runs both simultaneously |

## Storage Options

| Option | Trade-off |
|--------|-----------|
| **Persistent** | Data survives restarts, ~100MB disk usage |
| **In-memory** | Faster, but data lost on restart |

## Feature Flags

| Feature | What it enables |
|---------|-----------------|
| **Knowledge Graph** | Semantic search, document connections, graph analysis |
| **Time Travel** | Undo, redo, session forking, checkpoint restoration |
| **Strict Validation** | Enforce schema validation on all tool calls |
| **Debug Mode** | Verbose logging for troubleshooting |

## Architecture Overview

```
CLI (zero command)
    ↓
MCP Server (mcpServer.js)
    ↓
┌─────────────────────────────┐
│  Tools (research, search)   │
│  Handlers (job, kb)         │
│  Core (signal, normalize)   │
└─────────────────────────────┘
    ↓
Database (PGLite + pgvector)
    ↓
OpenRouter API (multi-model)
```

## Common Workflows

### Research → Verify → Follow-up

```bash
# Initial research
zero research "climate change effects"
# Output: Report #5

# Verify the claims
zero verify 5

# Ask follow-up
zero follow-up 5 "What about ocean acidification?"
```

### Search → Explore → Export

```bash
# Find related research
zero search "machine learning"

# Explore graph connections
zero graph traverse --node report:5

# See knowledge structure
zero graph stats
```

---

**Next**: [ARCHITECTURE.md](./ARCHITECTURE.md) for code structure
