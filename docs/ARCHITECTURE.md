# Architecture Guide

Understanding the Zero codebase structure.

## Directory Overview

```
src/
├── server/        ← THE WORKING CODE (start here)
│   ├── mcpServer.js     Main entry point, request routing
│   ├── tools.js         Tool definitions and schemas
│   ├── handlers/        Request handlers (job, kb, research)
│   └── taskAdapter.js   MCP Task Protocol implementation
│
├── utils/         ← Working utilities
│   ├── dbClient.js      PGLite database wrapper
│   ├── logger.js        Structured logging
│   └── errors.js        Error classes with semantic codes
│
├── agents/        ← Research orchestration
│   └── research.js      Multi-model research pipeline
│
├── cli/           ← Command line tool
│   ├── index.js         CLI entry point
│   └── wizard/          Setup wizard (steps/)
│
├── core/          ← Abstractions (mixed stability)
│   ├── normalize.js     Parameter normalization (STABLE)
│   ├── signal.js        Inter-agent messaging (STABLE)
│   ├── combinators.js   Workflow building blocks (STABLE)
│   ├── schemas/         Zod validation schemas (STABLE)
│   ├── roleShift.js     Bidirectional protocol (BETA)
│   ├── dualRoleNode.js  Client+Server node (VISION)
│   ├── protocolAdapter.js  Protocol abstraction (VISION)
│   └── zeroUri.js       URI scheme parsing (VISION)
│
├── workflows/     ← Business workflows
│   └── rfpWorkflow.js   RFP response generation
│
└── routing/       ← Job routing (future)
```

## Status Legend

| Status | Meaning | Safe to use? |
|--------|---------|--------------|
| STABLE | Battle-tested, used in production | Yes |
| BETA | Working but API may change | Yes, with caution |
| VISION | Spec exists, not fully integrated | Not yet |

## Core Module Status

| Module | Status | Used By |
|--------|--------|---------|
| `normalize.js` | STABLE | All tool handlers |
| `signal.js` | STABLE | Research, verification |
| `combinators.js` | STABLE | Workflows |
| `schemas/` | STABLE | All validation |
| `roleShift.js` | BETA | Experimental features |
| `dualRoleNode.js` | VISION | Planned for v1.11 |
| `protocolAdapter.js` | VISION | Planned for v1.11 |
| `zeroUri.js` | VISION | Planned for v1.12 |

## Entry Points

### CLI Entry
```
bin/zero → src/cli/index.js
```

### Server Entry
```
npm start → src/server/mcpServer.js
```

### Extension Entry
```
extension/background.js → extension/popup.js
```

## Request Flow

```
1. Request arrives (STDIO or HTTP)
         ↓
2. mcpServer.js routes to handler
         ↓
3. Handler validates with schemas/
         ↓
4. Handler calls agent (research.js)
         ↓
5. Agent calls OpenRouter API
         ↓
6. Result stored in dbClient
         ↓
7. Response returned
```

## Database Schema

```sql
-- Core tables
research_reports    -- Completed research reports
jobs               -- Async job tracking
job_events         -- SSE streaming events
doc_index          -- Vector embeddings for search
session_events     -- Time travel history
```

## Key Files to Understand

| File | Purpose | Lines |
|------|---------|-------|
| `mcpServer.js` | Main server, all routing | ~2500 |
| `tools.js` | Tool definitions | ~800 |
| `research.js` | Research pipeline | ~600 |
| `dbClient.js` | Database operations | ~400 |
| `normalize.js` | Parameter handling | ~200 |

## Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Dry run (no API calls)
npm run test:mic-drop
```

## Configuration

| File | Purpose |
|------|---------|
| `.env` | Environment variables |
| `config.js` | Runtime configuration |
| `package.json` | Dependencies, scripts |

## Integration Roadmap

| Version | Features |
|---------|----------|
| v1.10 (current) | Core abstractions defined |
| v1.11 | DualRoleNode integration |
| v1.12 | Full `zero://` URI routing |

## Where to Start (by goal)

| Goal | Start here |
|------|------------|
| Understand tools | `src/server/tools.js` |
| Add a new tool | `src/server/handlers/` |
| Fix a bug | `src/server/mcpServer.js` |
| Understand research | `src/agents/research.js` |
| Understand storage | `src/utils/dbClient.js` |
| Understand core abstractions | `src/core/README.md` |

---

**Next**: [src/core/README.md](../src/core/README.md) for abstraction details
