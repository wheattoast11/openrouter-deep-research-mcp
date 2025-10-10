# Migration Guide: v2.1 to v2.2

This guide provides instructions for migrating from version 2.1 to the new 2.2 architecture of the OpenRouter Agents MCP server.

**Version**: 2.2.0
**Date**: 2025-10-10

## Key Architectural Changes

Version 2.2 introduces several enhancements to align with the latest MCP specification and improve scalability and developer experience.

### 1. **Server Identity and Discovery**

The server now exposes `.well-known` endpoints for automated discovery:
- `/.well-known/mcp-server`: Provides server metadata, including supported protocol versions, transport paths, and capabilities.
- `/.well-known/oauth-protected-resource`: Describes the OAuth 2.1 resource server, including the issuer and supported scopes.

**Action Required**: Ensure your client infrastructure can consume these endpoints for dynamic configuration.

### 2. **Stateless HTTP Sessions**

The in-memory session store for the Streamable HTTP transport has been replaced with a database-backed store in PGlite. This makes the server stateless and allows for horizontal scaling.

**Action Required**: 
- The `mcp_sessions` table will be created automatically.
- Set the following new environment variables in your `.env` file to control session lifecycle:
  ```
  MCP_SESSION_TIMEOUT_SECONDS=3600
  MCP_SESSION_CLEANUP_INTERVAL_SECONDS=600
  ```

### 3. **Elicitation Support**

The server can now request additional information from the client during a tool call.
- The server sends an `elicitation/request` event over the active transport (WebSocket or SSE).
- The client should respond by calling the `elicitation_response` tool with the requested data.

**Action Required**: Update your client to handle the `elicitation/request` event and provide a UI for the user to respond. Add the `mcp:elicitation:write` scope to clients that need to respond.

### 4. **Structured Tool Outputs**

The `agent` tool and other core tools now return structured content, including `object` and `resource` types, instead of just plain text.

**Action Required**: Update your client to parse the new structured `content` array from tool call results and render different content types appropriately, such as displaying resource links.

### 5. **Unified Event Stream Cursors**

Both WebSocket and SSE transports now support a `since_event_id` parameter (or `Last-Event-ID` header for SSE) to resume an event stream from a specific point.

**Action Required**: Update your client's stream handling logic to store the last received event ID and use it to resume the connection in case of a disconnect.

## Discovery & Protocol Negotiation

- Advertise `/\.well-known/mcp-server` and `/\.well-known/oauth-protected-resource` in production environments.
- Require clients to send `MCP-Protocol-Version` header (2025-06-18 recommended) after initialization; respond with 400 and supported versions otherwise.
- Extend server capability payloads to include `tools: { list: true, call: true }`, `prompts: { list: true, get: true, listChanged: true }`, and `resources: { list: true, read: true, subscribe: true, listChanged: true }`.

## OAuth 2.1 Resource Server

- Configure `AUTH_JWKS_URL`, `AUTH_EXPECTED_AUD`, and optional `AUTH_ISSUER_URL` via environment variables.
- Define minimal scopes and method-level scope map in `config.auth.scopes.scopeMap`; enforce for HTTP `/mcp` and WebSocket `/mcp/ws`.
- Reject unauthorized or insufficient-scope requests with RFC 6750 compliant `WWW-Authenticate` headers.

## Session Management & Cleanup

- Persist MCP HTTP sessions in `mcp_sessions` table with TTL defined by `MCP_SESSION_TIMEOUT_SECONDS` (defaults to 3600s).
- Enable periodic cleanup via `scheduleHttpSessionCleanup()`; configure frequency with `MCP_SESSION_CLEANUP_INTERVAL_SECONDS` (default 600s).
- Ensure WebSocket sessions register with `registerSessionStream` to allow elicitation and server-initiated notifications.

## Async Lifecycle Compliance

- Use `@terminals-tech/core` `BoundedExecutor` for deterministic parallel research execution; configure max concurrency via `PARALLELISM` or task overrides.
- Emit progress notifications using `notifications/progress` with progression metadata whenever `progressToken` is present.
- Guarantee tool responses provide `structuredContent` including `resources` array for surfaced artifacts.

## Testing Requirements

- Run new compliance suites before release:
  - `node tests/mcp-sdk-compatibility.spec.js`
  - `node tests/mcp-async-lifecycle.spec.js`
  - `node tests/mcp-oauth-authz.spec.js`
  - `node tests/mcp-structured-output.spec.js`
- Ensure CI captures logs for WebSocket scope enforcement and HTTP batch rejection cases.

## MCP Client Updates

- Update `.cursor/mcp.json` to reference environment variables instead of hardcoded secrets (`${env:VAR}` format).
- Document required scopes for client integrations; expose metadata via `metadata.scopes` in MCP config for discovery.

## Release Checklist (v2.2)

- ✅ Capabilities advertisement aligned with draft spec (Oct 2025).
- ✅ OAuth/JWT enforcement with scope map.
- ✅ Elicitation create/resolve flows with UI support.
- ✅ Session cleanup and async lifecycle tests passing.
- ☐ Documentation updated (README, env templates) prior to publish.
- ☐ Publish beta tag after green CI; promote to `latest` post-UAT.