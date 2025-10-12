# Cursor IDE End-User Test Guide
## Testing MCP Server from the Frontend Client

**Date**: October 12, 2025  
**Purpose**: Validate openrouterai-research-agents MCP server directly in Cursor IDE

---

## 🎯 **How to Test as End User in Cursor**

### **Step 1: Verify Server is Loaded**

1. Open Cursor Settings → MCP
2. Check that `openrouterai-research-agents` is listed and connected
3. Status should show: ✅ Connected

### **Step 2: Test Tools**

In Cursor chat or through MCP tool interface, try these commands:

#### **Quick Health Check**
```
Use the ping tool with info=true
```
**Expected**: Returns pong + timestamp

#### **Research Query (Async)**
```
Use the agent tool to research "What are the key features of Model Context Protocol?" with async=true
```
**Expected**: Returns job_id like `job_1760217491530_g0pxvx`

#### **Check Job Status**
```
Use the job_status tool with the job_id from above
```
**Expected**: Shows status (queued/running/succeeded) and progress

#### **Get Server Status**
```
Use the get_server_status tool
```
**Expected**: Returns database status, job queue info, system metrics

---

### **Step 3: Test Prompts**

Prompts should appear in Cursor's MCP prompts panel. Try:

#### **Planning Prompt**
```
Use the planning_prompt with:
- query: "Compare cloud vector databases"
- domain: "technical"
- complexity: "moderate"
- maxAgents: 5
```
**Expected**: Returns a structured research plan breaking down the query into sub-queries

#### **Synthesis Prompt**
```
Use the synthesis_prompt with results from previous research
```
**Expected**: Synthesizes multiple results into a coherent report

---

### **Step 4: Test Resources**

Resources should be browsable in Cursor. Check:

- `mcp://specs/core` - MCP specifications
- `mcp://tools/catalog` - Available tools metadata
- `mcp://patterns/workflows` - Research workflow examples
- `mcp://agent/status` - Real-time agent status

---

## ✅ **Success Criteria**

- [ ] All 42 tools visible in Cursor
- [ ] All 6 prompts visible in Cursor
- [ ] All 9 resources accessible
- [ ] Tools execute without errors
- [ ] Prompts return structured responses
- [ ] Async jobs complete successfully

---

## 🐛 **If Issues Occur**

1. **No tools visible**: Restart Cursor (Developer → Reload Window)
2. **Connection error**: Check server is running (see terminal output)
3. **Auth error**: Verify API keys in `.cursor/mcp.json` use `${env:VAR}` format
4. **Prompt errors**: Check `test-prompts3.out` to verify prompts registered

---

## 📝 **Test Results Template**

After testing, document:

```
### Tool Test Results
- ping: ✅/❌
- agent: ✅/❌
- job_status: ✅/❌
- get_server_status: ✅/❌

### Prompt Test Results
- planning_prompt: ✅/❌
- synthesis_prompt: ✅/❌

### Resource Test Results
- mcp://specs/core: ✅/❌
- mcp://tools/catalog: ✅/❌

### Overall Experience
- Ease of use: 1-5 stars
- Response time: Fast/Medium/Slow
- Error messages: Clear/Unclear
- Would recommend: Yes/No
```

---

**Ready to test!** Just use the MCP tools directly in this Cursor session.

