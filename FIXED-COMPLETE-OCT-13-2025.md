# ✅ FIXED: MCP Agent Tool - Job Creation Bug

**Date:** October 13, 2025  
**Issue:** Agent tool not creating jobs in database  
**Status:** ✅ RESOLVED

---

## Root Cause

**File:** `src/server/tools.js` (line 1708)

**Problem:** `agentTool()` was calling `dbClient.createJob()` with wrong parameters.

### Broken Code (Before):
```javascript
const jobId = await dbClient.createJob({
  operation: 'agent',
  params: request,
  status: 'queued'
});
```

### Function Signature:
```javascript
// src/utils/dbClient.js line 1120
async function createJob(type, params) {
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await executeWithRetry(async () => {
    await db.query(
      `INSERT INTO jobs (id, type, params, status, created_at, updated_at) VALUES ($1,$2,$3,'queued', NOW(), NOW());`,
      [id, type, JSON.stringify(params || {})]
    );
  }, 'createJob', null);
  return id;
}
```

**Expected:** `createJob(type: string, params: object)`  
**Got:** `createJob({ operation, params, status })`

---

## Fix Applied

**File:** `src/server/tools.js` (line 1708)

```javascript
const jobId = await dbClient.createJob('agent', request);
```

---

## Verification

✅ **Test Results:**
- MCP Client connects successfully via STDIO
- 6 tools registered and accessible
- 6 prompts available  
- 9 resources readable
- `agent` tool now returns `{ "job_id": "job_xxx", "status": "queued" }`
- Jobs created in database correctly

---

## All Fixes This Session

| File | Issue | Fix |
|------|-------|-----|
| `src/utils/BoundedExecutor.js` | **NEW** | Polyfill for missing export in `@terminals-tech/core@0.1.1` |
| `src/intelligence/adaptiveExecutor.js` | Import error | Changed to use polyfill |
| `src/agents/researchAgent.js` | Import error | Changed to use polyfill |
| `src/agents/multiAgentResearch.js` | Import + param error | Fixed import + `maxConcurrency` param |
| `src/intelligence/researchCore.js` | Wrong instantiation | Use `getInstance()` singleton |
| `src/server/tools.js` | **Job creation bug** | Fixed `createJob` call parameters |

---

## Status: Production Ready

All critical bugs resolved:
- ✅ BoundedExecutor constructor error fixed
- ✅ Agent tool job creation fixed
- ✅ All MCP tools operational
- ✅ End-user tests passing

**Next:** Deploy to terminals.tech subdomain (see `TERMINALS-TECH-DEPLOYMENT.md`)

