# MCP v2.1 + OAuth 2.1 Resource Server Implementation Summary

**Date**: 2025-10-08  
**Version**: 2.1.0  
**Status**: ✅ Complete

## Overview

This implementation delivers full MCP v2.1 compliance with Streamable HTTP transport, strict OAuth 2.1 Resource Server authentication (no token passthrough), lifecycle/utilities support, and feature-flagged A2A connector scaffolding.

## Implementation Scope

### 1. Configuration (`config.js`, `env.example`)

**Added Configuration Sections**:
- `server.bindAddress`: Bind address for security (localhost in dev)
- `mcp.protocolVersion`: Default protocol version (2025-03-26)
- `mcp.supportedVersions`: Array of supported protocol versions
- `mcp.connectors`: Feature flags for x402 and AP2
- `auth.*`: Complete OAuth 2.1 RS configuration
  - `jwksUrl`: JWKS endpoint for JWT validation
  - `expectedAudience`: Required JWT audience claim
  - `issuer`: Optional issuer URL
  - `discovery`: Discovery metadata settings
  - `scopes`: Minimal baseline and operation-specific scope mappings
- `security.*`: Enhanced security configuration
  - `allowedOrigins`: CORS origin patterns
  - `rateLimit`: Global and per-tool rate limits

**Environment Variables**:
- `MCP_PROTOCOL_VERSION`, `MCP_CONNECTOR_X402_ENABLED`, `MCP_CONNECTOR_AP2_ENABLED`
- `AUTH_JWKS_URL`, `AUTH_EXPECTED_AUD`, `AUTH_ISSUER_URL`, `AUTH_DISCOVERY_ENABLED`, `AUTH_SERVERS`, `AUTH_SCOPES_MINIMAL`
- `ALLOWED_ORIGINS`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`

### 2. Packaging (`package.json`)

**Updates**:
- Added `bin/openrouter-agents.js` and `bin/openrouter-agents-mcp.js` executables
- Added `files` field to include `src/**`, `bin/**`, `config.js`
- Added `jose` dependency for JWT validation
- Enhanced keywords: `model-context-protocol`, `oauth2`, `websocket`, `sse`, `streaming`
- Added `test:mcp` script for MCP test suite
- Configured `publishConfig.access: public`

### 3. CLI Executables (`bin/`)

**Created**:
- `bin/openrouter-agents.js`: Standard entry point for all transports
- `bin/openrouter-agents-mcp.js`: MCP-optimized entry point with Streamable HTTP defaults

### 4. Streamable HTTP Transport (`src/server/mcpStreamableHttp.js`)

**Implemented**:
- Unified `/mcp` endpoint (POST/GET/DELETE)
- Session management with unique `Mcp-Session-Id`
- Protocol version negotiation via `MCP-Protocol-Version` header
- Lifecycle enforcement (initialize → notifications/initialized → active)
- SSE streaming with event IDs for resumability
- Support for `Last-Event-ID` header for stream resumption
- JSON-RPC message routing to MCP server handlers
- Notification handling (cancelled, progress)
- Pre-initialization gating (only ping and logging allowed before initialized)

**Key Functions**:
- `setupMCPEndpoint(app, mcpServer, authenticate)`: Registers endpoints
- `createSession()`, `validateSession()`, `deleteSession()`: Session lifecycle
- `sendSSE()`, `getNextEventId()`: SSE event streaming
- `routeRequest()`: JSON-RPC method routing
- `handleNotification()`: Notification processing

### 5. OAuth 2.1 Resource Server (`src/server/oauthResourceServer.js`)

**Implemented**:
- Protected Resource Metadata (RFC 9728) endpoints:
  - `/.well-known/oauth-protected-resource`
  - `/.well-known/oauth-protected-resource/mcp`
- Enhanced authentication middleware with WWW-Authenticate challenges:
  - 401 responses with `resource_metadata` and optional `scope` parameters
  - 403 responses with `insufficient_scope` error and required scopes
- JWT validation via JWKS (using `jose` library)
- Strict audience binding (no token passthrough)
- Scope extraction from JWT claims
- Scope validation middleware factory

**Key Functions**:
- `setupOAuthDiscovery(app)`: Registers discovery endpoints
- `createAuthMiddleware()`: Returns enhanced auth middleware
- `requireScopes(...scopes)`: Scope validation middleware
- `getScopesForMethod(method)`: Maps methods to required scopes
- `getProtectedResourceMetadata()`: Builds RFC 9728 metadata

### 6. A2A Connector Scaffolding (`src/agents/connectors/`)

**Created**:
- `index.js`: Connector registry with feature flag checks
- `x402.js`: Coinbase x402 protocol scaffold (no-op, awaiting spec)
- `ap2.js`: Google AP2 protocol scaffold (no-op, awaiting spec)

**Integration**:
- Registered in `mcpServer.js` at startup
- Feature flags: `MCP_CONNECTOR_X402_ENABLED`, `MCP_CONNECTOR_AP2_ENABLED`
- Throws "not yet implemented" errors when invoked

### 7. Server Integration (`src/server/mcpServer.js`)

**Changes**:
- Added imports for new modules
- Registered A2A connectors at startup
- Updated server capabilities to include `logging` and `completions`
- Replaced authentication middleware with OAuth RS version
- Added OAuth discovery setup call
- Replaced legacy Streamable HTTP with new MCP v2.1 endpoint
- Updated logging to reflect OAuth configuration

### 8. Test Suite

**Created Tests**:
1. `tests/mcp-http-streamable.spec.js`:
   - Initialize session with `Mcp-Session-Id` header
   - Protocol version validation
   - Session management (POST/GET/DELETE)
   - Error handling for missing session
   
2. `tests/mcp-lifecycle-utils.spec.js`:
   - Ping before/after initialization
   - Pre-initialization gating for other methods
   - `notifications/initialized` acknowledgement
   - `notifications/cancelled` handling
   - `logging/setLevel` functionality

3. `tests/mcp-auth-discovery.spec.js`:
   - Protected Resource Metadata endpoints
   - WWW-Authenticate headers in 401/403 responses
   - Scope discovery
   - Legacy discovery endpoint compatibility

4. `tests/run-mcp-tests.js`:
   - Test suite runner for all MCP tests
   - Summary reporting

### 9. Documentation (`README.md`)

**Added Sections**:
- MCP v2.1 feature highlights in "What's new"
- OAuth 2.1 configuration in Quick Start
- Complete MCP v2.1 Usage section:
  - Global CLI installation
  - Streamable HTTP endpoint documentation
  - OAuth 2.1 authentication flow
  - Scope-based authorization
  - A2A connector enablement
  - curl examples

## Acceptance Criteria

✅ **Config & Environment**: All new config keys added with sane defaults and env var support  
✅ **Packaging**: CLI executables created; package.json updated for global install; jose added  
✅ **Streamable HTTP**: Unified `/mcp` endpoint with POST/GET/DELETE; session management; version headers  
✅ **OAuth 2.1 RS**: JWKS validation; audience binding; discovery endpoints; WWW-Authenticate challenges  
✅ **Lifecycle**: Initialize → initialized gating; ping; notifications/cancelled support  
✅ **Utilities**: logging/setLevel implemented; completion scaffold present  
✅ **A2A Connectors**: Feature-flagged scaffolds for x402 and AP2  
✅ **Tests**: Three comprehensive test files covering HTTP, lifecycle, and auth  
✅ **Documentation**: README updated with MCP v2.1 usage and OAuth setup  
✅ **No Token Passthrough**: Strict audience validation; no raw token forwarding  

## Outstanding Items

### For Future Implementation

1. **Completion API**: Full `completion/complete` implementation for prompt/resource template arguments
2. **Pagination**: Cursor-based pagination in `tools/list`, `resources/list`, `prompts/list`
3. **Progress Notifications**: `notifications/progress` emission during long operations
4. **Resources Subscribe**: Full `resources/subscribe` and `notifications/resources/updated` implementation
5. **Sampling/Roots/Elicitation**: Client-feature support (sampling, roots, elicitation requests)
6. **A2A Specs**: Implementation of x402 and AP2 protocols once specifications are available
7. **Session Persistence**: Redis/DB-backed sessions for production scaling
8. **Event Replay**: Persistent SSE event storage for resumability across restarts

### Testing Recommendations

1. **Integration Tests**: Run full MCP SDK client against the server
2. **JWT Tests**: Test with real JWT tokens from an OAuth provider
3. **Scope Tests**: Verify 403 insufficient_scope challenges with various token scopes
4. **Load Tests**: Verify session management under concurrent connections
5. **Resumability Tests**: Test SSE stream resumption with `Last-Event-ID`

## Deployment Notes

### Development

```bash
# Allow dev mode without auth
ALLOW_NO_API_KEY=true npm start

# With OAuth
AUTH_JWKS_URL=https://your-issuer.com/.well-known/jwks.json \
AUTH_EXPECTED_AUD=mcp-server \
npm start
```

### Production

1. **Required**:
   - Set `REQUIRE_HTTPS=true`
   - Configure `AUTH_JWKS_URL` and `AUTH_EXPECTED_AUD`
   - Set `ALLOWED_ORIGINS` to specific domains
   - Remove or set `ALLOW_NO_API_KEY=false`

2. **Recommended**:
   - Use Redis/DB for session persistence
   - Enable rate limiting with appropriate thresholds
   - Monitor `/.well-known/oauth-protected-resource` endpoint
   - Log all 401/403 responses for security auditing

## Migration from v2.0

1. **No Breaking Changes**: Existing stdio and WebSocket transports unchanged
2. **New Features Opt-In**: MCP v2.1 endpoint enabled by default but can be disabled
3. **Auth Optional**: OAuth is optional; API key auth still works
4. **Config Additions**: New config keys have sensible defaults

## References

- [MCP Specification 2025-03-26](https://modelcontextprotocol.io/specification/draft)
- [RFC 9728: OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 8414: OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13)

