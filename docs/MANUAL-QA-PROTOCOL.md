# Manual QA Protocol v2.1.1-beta

This document provides step-by-step instructions for human-executed quality assurance testing before the beta release.

**Estimated Time**: 45-60 minutes  
**Prerequisites**: Node 20+, OpenRouter API key, Gemini API key  
**Environment**: Clean test environment (fresh VM or dedicated machine)

---

## Setup Phase

### 1. Fresh Install

**Objective**: Verify installation process from scratch

**Steps**:
1. Create clean directory: `mkdir qa-test && cd qa-test`
2. Install package: `npm install @terminals-tech/openrouter-agents@2.1.1-beta`
3. Verify no errors during installation
4. Check node_modules directory created
5. Verify bin scripts exist: `ls node_modules/@terminals-tech/openrouter-agents/bin/`

**Expected**:
- Installation completes without errors
- All dependencies resolved
- Bin scripts present: `openrouter-agents.js`, `openrouter-agents-mcp.js`

**Pass/Fail**: ___________

---

### 2. Configuration Setup

**Objective**: Verify env.example completeness

**Steps**:
1. Copy env.example: `cp node_modules/@terminals-tech/openrouter-agents/env.example .env`
2. Open `.env` in editor
3. Verify BETA_FEATURES section present with clear documentation
4. Set required variables:
   ```
   OPENROUTER_API_KEY=your_actual_key
   GEMINI_API_KEY=your_actual_key
   SERVER_API_KEY=test-secret-123
   BETA_FEATURES=true
   ```
5. Save file

**Expected**:
- env.example includes all necessary variables
- Beta section clearly marked
- Comments explain each variable's purpose

**Pass/Fail**: ___________

---

## Functional Testing Phase

### 3. First Run (AGENT Mode)

**Objective**: Verify server starts correctly in default AGENT mode

**Steps**:
1. Start server: `npx openrouter-agents`
2. Observe startup logs
3. Look for:
   - "MCP server ready on http://localhost:3008"
   - "MODE=AGENT (6 tools available)"
   - "WebSocket transport enabled"
   - No error messages

**Expected**:
- Server starts within 5 seconds
- Logs indicate successful initialization
- Port listening confirmed
- No crashes or errors

**Pass/Fail**: ___________

---

### 4. Mode Testing

**Objective**: Verify MODE switching works correctly

**Test 4a: AGENT Mode**

**Steps**:
1. Set `MODE=AGENT` in `.env`
2. Restart server
3. curl tools list:
   ```bash
   curl -X POST http://localhost:3008/mcp \
     -H "Authorization: Bearer test-secret-123" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'
   ```
4. Count tools in response

**Expected**:
- Exactly 6 tools: `agent`, `ping`, `get_server_status`, `job_status`, `get_job_status`, `cancel_job`
- `agent` tool present

**Pass/Fail**: ___________

**Test 4b: MANUAL Mode**

**Steps**:
1. Set `MODE=MANUAL` in `.env`
2. Restart server
3. curl tools list (same command as 4a)
4. Count tools

**Expected**:
- Approximately 15 tools (individual tools like `conduct_research`, `retrieve`, etc.)
- No `agent` tool

**Pass/Fail**: ___________

**Test 4c: ALL Mode**

**Steps**:
1. Set `MODE=ALL` in `.env`
2. Restart server
3. curl tools list
4. Count tools

**Expected**:
- Approximately 21 tools (agent + individual tools)
- Both `agent` and `conduct_research` present

**Pass/Fail**: ___________

---

### 5. Beta Features Toggle

**Objective**: Verify beta features can be enabled/disabled

**Test 5a: BETA_FEATURES=false**

**Steps**:
1. Set `BETA_FEATURES=false` in `.env`
2. Set `MODE=AGENT`
3. Restart server
4. Use WebSocket test client or script to connect
5. Execute ping tool
6. Monitor for `metrics.*` events

**Expected**:
- Server runs normally
- No telemetry/metrics events emitted
- Stable v2.1 behavior

**Pass/Fail**: ___________

**Test 5b: BETA_FEATURES=true**

**Steps**:
1. Set `BETA_FEATURES=true` in `.env`
2. Set `PLL_ENABLE=true`
3. Restart server
4. Connect WebSocket client
5. Execute simple query
6. Monitor for `metrics.update` or `metrics.job_final` events

**Expected**:
- Telemetry events emitted
- Events include `cadence_error`, `dynamic_concurrency`, `jitter_ms`
- No crashes or hangs

**Pass/Fail**: ___________

---

### 6. Error Handling

**Objective**: Verify graceful error handling

**Test 6a: Invalid API Key**

**Steps**:
1. Set `OPENROUTER_API_KEY=invalid-key` in `.env`
2. Restart server
3. Call agent tool with research query:
   ```bash
   curl -X POST http://localhost:3008/mcp \
     -H "Authorization: Bearer test-secret-123" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"agent","arguments":{"query":"test","async":false}},"id":1}'
   ```
4. Observe response

**Expected**:
- Server returns error (not crash)
- Error message indicates authentication issue
- Server remains running

**Pass/Fail**: ___________

**Test 6b: Malformed Request**

**Steps**:
1. Restore valid API keys
2. Send malformed JSON:
   ```bash
   curl -X POST http://localhost:3008/mcp \
     -H "Authorization: Bearer test-secret-123" \
     -H "Content-Type: application/json" \
     -d '{invalid json}'
   ```

**Expected**:
- 400 Bad Request or JSON-RPC error
- Server remains stable

**Pass/Fail**: ___________

**Test 6c: Unauthorized Access**

**Steps**:
1. Send request without Authorization header:
   ```bash
   curl -X POST http://localhost:3008/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'
   ```

**Expected**:
- 401 Unauthorized response
- WWW-Authenticate header present

**Pass/Fail**: ___________

---

### 7. Performance Test

**Objective**: Verify server stability under concurrent load

**Steps**:
1. Ensure server running with valid config
2. Open 10 terminal windows
3. In each, execute ping tool:
   ```bash
   for i in {1..5}; do
     curl -X POST http://localhost:3008/mcp \
       -H "Authorization: Bearer test-secret-123" \
       -H "Content-Type: application/json" \
       -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"ping","arguments":{}},"id":'$i'}' &
   done
   wait
   ```
4. Monitor server logs
5. Check memory usage (top/htop)

**Expected**:
- All requests complete successfully
- Response times < 500ms for ping
- Memory usage stable (no leaks)
- No crashes or hangs

**Pass/Fail**: ___________

---

### 8. Graceful Shutdown

**Objective**: Verify clean shutdown process

**Steps**:
1. With server running, send SIGTERM: `kill -TERM <pid>`
   (or Ctrl+C in terminal)
2. Observe shutdown logs
3. Check for:
   - "Shutting down gracefully..."
   - "PGlite database flushed"
   - "WebSocket connections closed"
   - Process exits cleanly

**Expected**:
- Shutdown completes within 3 seconds
- No error messages
- Database properly flushed
- No orphaned processes

**Pass/Fail**: ___________

---

## Docker Testing Phase

### 9. Docker Build

**Objective**: Verify Dockerfile builds successfully

**Steps**:
1. Navigate to project root
2. Build image: `docker build -t openrouter-agents:qa .`
3. Observe build process
4. Verify no errors

**Expected**:
- Build completes without errors
- Image size reasonable (< 500MB)
- All layers cached correctly on rebuild

**Pass/Fail**: ___________

---

### 10. Docker Run

**Objective**: Verify Docker container runs correctly

**Steps**:
1. Run container:
   ```bash
   docker run -p 3000:3000 \
     -e OPENROUTER_API_KEY=your_key \
     -e GEMINI_API_KEY=your_key \
     -e MODE=AGENT \
     -e BETA_FEATURES=true \
     openrouter-agents:qa
   ```
2. Wait for startup
3. Test from host: `curl http://localhost:3000/about`

**Expected**:
- Container starts successfully
- Server accessible on port 3000
- About endpoint responds with JSON

**Pass/Fail**: ___________

---

## Final Checklist

- [ ] All tests passed
- [ ] No critical issues found
- [ ] Performance acceptable
- [ ] Documentation accurate
- [ ] Ready for beta release

## Issues Found

_Document any issues discovered during QA:_

| Issue | Severity | Description | Status |
|-------|----------|-------------|--------|
|       |          |             |        |

## QA Sign-Off

**Tester Name**: ___________________  
**Date**: ___________________  
**Overall Result**: PASS / FAIL  
**Recommendation**: RELEASE / HOLD / RETEST

**Notes**:



