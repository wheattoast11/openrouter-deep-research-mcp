### /compress command

Produce an ultra-dense, MECE repository summary and cohesion plan per `.cursor/rules/compress.mdc`.

Output shape:
1) Single-word headline encoding realizability.
2) 6–12 MECE bullets: Architecture, Transports, Tools, DB, Agents, Client, Security, Observability, Tests/Benchmarks, Packaging/CI.
3) Key-file map with `mdc:` links to real files.
4) Env tree (vars→usage) from `config.js`, unknowns/required listed.
5) Risks/tech-debt (≤7) with concrete refactors.
6) Next actions (≤5) as verb-led, shippable steps.

Style:
- Use `###` headings, bold for key terms, minimal prose.
- Prefer CODE REFERENCES when quoting existing code; avoid large pastes.
- Normalize to project canon: MCP v2.2+, OAuth 2.1 Resource Server, PGlite, WebSocket `/mcp/ws`, Unified `agent` tool.

References:
- Rule: [.cursor/rules/compress.mdc](mdc:.cursor/rules/compress.mdc)
- Core files: [src/server/mcpServer.js](mdc:src/server/mcpServer.js), [src/server/tools.js](mdc:src/server/tools.js), [src/server/wsTransport.js](mdc:src/server/wsTransport.js), [src/server/mcpStreamableHttp.js](mdc:src/server/mcpStreamableHttp.js), [src/utils/dbClient.js](mdc:src/utils/dbClient.js), [src/platform/api.js](mdc:src/platform/api.js), [client/src/client/ContextGateway.js](mdc:client/src/client/ContextGateway.js), [client/src/services/DynamicContextManager.ts](mdc:client/src/services/DynamicContextManager.ts), [src/intelligence/algebraicTagSystem.js](mdc:src/intelligence/algebraicTagSystem.js), [genesis-emergence-mcp-nov2025.plan.md](mdc:genesis-emergence-mcp-nov2025.plan.md)