# AGENTS.md

Last verified: 2026-01-20 (Grounding: 2026-01-20)

## Isomorphic 5-Layer Architecture Alignment

Agent Zero now operates as the **L5 Protocol Bridge** for the terminals.tech ecosystem.

### Layer Correspondence (AXON Architecture)
- **L1 (Core)**: `Signal` and `Token` now support `shapeHash` (deterministic structural fingerprints).
- **L2 (Machine)**: `HVMClient` provides symbolic steering via logit bias mapping.
- **L3 (Mesh)**: `ResearchAgent` emits isomorphic `MeshEvent` formatted tokens.
- **L4 (Brain)**: Research cycles use `CognitiveContext` primitives.
- **L5 (Protocol)**: MCP implementation serves as the bridge between terminals.tech and external models.

## Resilience & Production Status
- **Node 25 Auto-Heal**: `dbClient.js` automatically enables "Resilient In-Memory Mode" on Node 25/macOS to prevent WASM mutex crashes.
- **Isomorphic Reduction**: All signals are now reduced to deterministic hashes for structural integrity verification.
- **High-Fidelity Ensemble**: `HYPER_MODE` enabled with `ENSEMBLE_SIZE=3` for high-fidelity technical research.

## Quick Commands

Install:
- `npm install`

Run server (STDIO default for MCP clients):
- `npm start`
- `npm run stdio`

Dev (watch):
- `npm run dev`

Tests (unit + auth + config):
- `npm test`

Single test (direct node entrypoints):
- `node tests/unit/core.test.js`
- `node tests/unit/config.test.js`
- `node tests/unit/auth.test.js`
- `node tests/integration/orchestration/mic-drop.test.js`
- `DRY_RUN=true node tests/integration/orchestration/mic-drop.test.js`

Note: Some tests use Jest APIs (`describe`, `test`, `expect`) but are not
wired into `npm test`. Run them directly with `node` only if they do not
require a Jest runner. If a test uses Jest globals, install/run Jest locally.

Docs generation:
- `npm run gen:docs`
- `npm run gen:examples`
- `npm run gen:diagram`

## Repo Structure

- `src/server/` MCP server, tool registration, handlers, transports.
- `src/agents/` research, planning, zero protocol, context agents.
- `src/core/` core abstractions: signal, rail, context, normalize.
- `src/utils/` infra helpers: logging, errors, db, diagnostics.
- `tests/` unit + integration tests (mostly node scripts).
- `docs/` product docs and guides.

## Code Style (Observed)

Language: Node.js (CommonJS modules), no TypeScript.

### Imports
- Use `const x = require('module')`.
- Group core/third-party imports before local modules.
- Keep import lists tidy; avoid deep destructuring unless used.

### Formatting
- 2-space indentation.
- Single quotes for strings.
- Semicolons are used consistently.
- Blank lines separate logical sections.
- Align multi-line object literals for readability.

### Naming
- Files: lowerCamelCase for JS modules (`openRouterClient.js`).
- Classes: PascalCase (`MCPLogger`, `Signal`).
- Functions/vars: lowerCamelCase (`formatActionableError`).
- Constants/enums: UPPER_SNAKE_CASE or Capitalized objects (`LogLevel`).

### Types & Validation
- Prefer runtime validation via Zod schemas for tool inputs.
- Use structured error types (see `src/utils/errors.js`).
- Return plain objects for tool outputs; avoid classes in API boundaries.

### Error Handling (Semantic Error Taxonomy v1.14.1)

**Use the Semantic Error Taxonomy** (`src/core/errors/`) for all error handling:

```javascript
const errors = require('./src/core/errors');

// Wrap any error for semantic classification
const semantic = errors.wrapError(rawError);
// → { category, severity, tripDecision, suggestedFix }

// Record to trace history (auto-persists to DB)
await errors.recordTrace(error, { operation: 'research' }, sessionId);

// Export full state for debugging
const state = errors.exportTaxonomyState();
```

**Error Categories and Circuit Breaker Decisions:**
| Category | Trip on... | Action |
|----------|------------|--------|
| `network` | 3 errors/min | Trip circuit |
| `rate_limit` | Any occurrence | Always trip |
| `auth`, `config`, `resource` | Any occurrence | Escalate (fatal) |
| `timeout`, `execution` | 3-5 errors/min | Trip circuit |
| `validation`, `schema`, `not_found` | Never | Ignore (client error) |
| `unknown` | 10 errors/min | Trip after threshold |

**Best Practices:**
- Wrap errors with `wrapError()` or throw `SemanticError`
- Record all errors with `recordTrace()` for debugging
- Use `exportTaxonomyState()` for AI-assisted improvement
- Learn new patterns with `learnPattern(pattern, category, severity)`
- Check `error_trace` table in DB for historical analysis

**Self-Improvement Loop:**
Errors are auto-classified and persisted. When an unknown error appears frequently,
`suggestedPattern` is generated. AI/operators can review traces and teach new patterns
that will be applied to future errors automatically.

### Logging
- Use `src/utils/logger` (structured, MCP-compliant).
- Respect `LOG_LEVEL`, `LOG_OUTPUT`, and `--stdio` behavior.
- Avoid writing to stdout in STDIO mode.

### Async
- Prefer async/await; avoid unhandled promises.
- Use explicit timeouts when hitting external services.

### Config & Environment
- Read from `config.js` and `src/config/*`.
- Do not inline env access in feature modules unless necessary.
- Always handle missing config with actionable errors.

## Testing Patterns

- Unit tests are plain Node scripts using `assert`.
- Integration test `mic-drop` can be dry-run with `DRY_RUN=true`.
- When adding tests, match the existing pattern (standalone runner).

## Tooling & Linting

- No ESLint/Prettier config is present.
- Keep formatting consistent with existing files.

## Documentation Rules

- Update `README.md` and `docs/CHANGELOG.md` if behavior changes.
- Follow `.github/pull_request_template.md` checklist when preparing PRs.

## Cursor/Copilot Rules

- No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md`
  detected in this repository.

## Domain-Specific Conventions

- MCP tools and schemas live in `src/server/tools.js` and `src/config/schema.js`.
- Protocol features (Task/Sampling/Elicitation/Rail) are centralized in
  `src/server/*` and `src/core/rail/*`.
- Maintain structured diagnostics in `src/utils/diagnostics` and
  actionable error returns in `src/utils/errors`.

## Isomorphic Abstraction (Repository Pattern Summary)

Think of the codebase as a layered, isomorphic pipeline:

1. **Inputs**: External requests (HTTP/STDIO) or internal agent tasks.
2. **Normalization**: Parameter normalization + schema validation.
3. **Execution**: Tool handlers + core abstractions (Signal/Rail/Context).
4. **Persistence**: DB + indexers + knowledge graph.
5. **Outputs**: Structured responses + logs + notifications.

Each layer transforms data but preserves shape: a request becomes a validated
tool call; a tool call yields a structured response; errors are always wrapped
into MCPError-compatible forms. This symmetry is the isomorphic “abstraction”
agents should preserve when adding new capabilities.

## Suggested Defaults for New Code

- Place new tool handlers in `src/server/handlers/` with Zod schemas.
- Wire new tools in `src/server/tools.js` and expose via `mcpServer.js`.
- Keep error paths explicit and structured (retryable vs terminal).
- Avoid global state; use lazy init for integrations.
