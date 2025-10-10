# OpenRouter Research Agents - Parameterized Prompt Templates

**Version**: 2.1.1-beta  
**Date**: October 9, 2025  
**Purpose**: Production-ready prompt templates for various research use cases

---

## Table of Contents

1. [Quick Start Templates](#1-quick-start-templates)
2. [Research Workflows](#2-research-workflows)
3. [Multi-Modal Research](#3-multi-modal-research)
4. [Follow-Up & Refinement](#4-follow-up--refinement)
5. [Knowledge Base Queries](#5-knowledge-base-queries)
6. [Advanced Patterns](#6-advanced-patterns)
7. [Parameter Reference](#7-parameter-reference)

---

## 1. Quick Start Templates

### 1.1 Basic Research Query

```javascript
// Simple synchronous research
{
  "tool": "agent",
  "parameters": {
    "query": "{{RESEARCH_TOPIC}}",
    "async": false,
    "costPreference": "low",
    "audienceLevel": "intermediate",
    "outputFormat": "report"
  }
}
```

**Parameters**:
- `{{RESEARCH_TOPIC}}`: Your research question (required)

**Use Case**: Quick, synchronous research queries under 30 seconds

---

### 1.2 Async Research (Recommended)

```javascript
// Long-running research with progress streaming
{
  "tool": "agent",
  "parameters": {
    "query": "{{RESEARCH_TOPIC}}",
    "async": true,
    "costPreference": "{{COST}}",  // "low" | "high"
    "audienceLevel": "{{AUDIENCE}}",  // "beginner" | "intermediate" | "expert"
    "outputFormat": "{{FORMAT}}",  // "report" | "briefing" | "bullet_points"
    "includeSources": true
  }
}
```

**Parameters**:
- `{{RESEARCH_TOPIC}}`: Research question (required)
- `{{COST}}`: "low" (default) | "high"
- `{{AUDIENCE}}`: "beginner" | "intermediate" | "expert"
- `{{FORMAT}}`: "report" | "briefing" | "bullet_points"

**Use Case**: Complex queries requiring 30+ seconds, parallel agent orchestration

**Follow-up**:
```javascript
// Check status
{ "tool": "get_job_status", "parameters": { "job_id": "{{JOB_ID}}" } }

// Get report when complete
{ "tool": "get_report_content", "parameters": { "reportId": "{{REPORT_ID}}" } }
```

---

## 2. Research Workflows

### 2.1 Technical Deep Dive

**Scenario**: In-depth technical analysis of a technology, framework, or system

```javascript
{
  "tool": "agent",
  "parameters": {
    "query": "Provide a comprehensive technical analysis of {{TECHNOLOGY}}, including architecture, performance characteristics, trade-offs, and production readiness as of {{YEAR}}",
    "async": true,
    "costPreference": "high",  // Use high-quality models
    "audienceLevel": "expert",
    "outputFormat": "report",
    "includeSources": true,
    "mode": "hyper"  // Optional: experimental high-performance mode
  }
}
```

**Example Query**:
```
"Provide a comprehensive technical analysis of WebAssembly WASI runtime implementations, including architecture, performance characteristics, trade-offs, and production readiness as of 2025"
```

---

### 2.2 Market Research

**Scenario**: Competitive analysis, market trends, business intelligence

```javascript
{
  "tool": "agent",
  "parameters": {
    "query": "Analyze the {{MARKET_SEGMENT}} market: key players, trends, growth projections, competitive landscape, and emerging technologies as of {{DATE}}",
    "async": true,
    "costPreference": "low",
    "audienceLevel": "intermediate",
    "outputFormat": "briefing",
    "includeSources": true
  }
}
```

**Template Variables**:
- `{{MARKET_SEGMENT}}`: e.g., "AI agent orchestration", "edge computing", "quantum computing"
- `{{DATE}}`: e.g., "Q4 2025", "2025"

---

### 2.3 Academic Literature Review

**Scenario**: Survey recent research papers, methodologies, findings

```javascript
{
  "tool": "agent",
  "parameters": {
    "query": "Survey recent academic literature (2023-2025) on {{RESEARCH_AREA}}, focusing on methodologies, key findings, consensus views, and open research questions",
    "async": true,
    "costPreference": "high",
    "audienceLevel": "expert",
    "outputFormat": "report",
    "includeSources": true,
    "maxLength": 5000  // Longer reports for comprehensive coverage
  }
}
```

---

### 2.4 Comparative Analysis

**Scenario**: Compare multiple options, frameworks, or approaches

```javascript
{
  "tool": "agent",
  "parameters": {
    "query": "Compare {{OPTION_A}} vs {{OPTION_B}} vs {{OPTION_C}} across the following dimensions: {{CRITERIA}}. Provide a structured comparison with pros, cons, use cases, and recommendations.",
    "async": true,
    "costPreference": "low",
    "audienceLevel": "intermediate",
    "outputFormat": "report",
    "includeSources": true
  }
}
```

**Example**:
```javascript
{
  "query": "Compare Next.js vs Remix vs Astro across the following dimensions: performance, developer experience, SEO, deployment options, ecosystem maturity. Provide a structured comparison with pros, cons, use cases, and recommendations.",
  // ... other params
}
```

---

### 2.5 Trend Analysis

**Scenario**: Identify emerging trends, future directions

```javascript
{
  "tool": "agent",
  "parameters": {
    "query": "Identify emerging trends in {{DOMAIN}} based on recent developments (2024-2025). What are the key innovations, adoption patterns, and likely future directions?",
    "async": true,
    "costPreference": "low",
    "audienceLevel": "intermediate",
    "outputFormat": "briefing",
    "includeSources": true
  }
}
```

---

## 3. Multi-Modal Research

### 3.1 Research with Images

**Scenario**: Analyze diagrams, charts, screenshots, or visual data

```javascript
{
  "tool": "conduct_research",  // Direct tool for streaming
  "parameters": {
    "query": "Analyze the architecture shown in these diagrams and explain {{ANALYSIS_FOCUS}}",
    "images": [
      {
        "url": "{{IMAGE_URL_1}}",
        "detail": "high"  // "low" | "high" | "auto"
      },
      {
        "url": "{{IMAGE_URL_2}}",
        "detail": "high"
      }
    ],
    "costPreference": "high",  // Vision models require high-cost tier
    "audienceLevel": "expert",
    "outputFormat": "report",
    "includeSources": true
  }
}
```

**Image Formats**:
- HTTP/HTTPS URLs: `https://example.com/diagram.png`
- Data URIs: `data:image/png;base64,iVBORw0KG...`

**Use Cases**:
- Architecture diagram analysis
- Chart interpretation
- Screenshot debugging
- Visual design feedback

---

### 3.2 Research with Documents

**Scenario**: Analyze provided text documents, papers, logs

```javascript
{
  "tool": "conduct_research",
  "parameters": {
    "query": "Analyze these documents and {{TASK_DESCRIPTION}}",
    "textDocuments": [
      {
        "name": "{{DOC_NAME_1}}",
        "content": "{{DOCUMENT_CONTENT_1}}"
      },
      {
        "name": "{{DOC_NAME_2}}",
        "content": "{{DOCUMENT_CONTENT_2}}"
      }
    ],
    "costPreference": "low",
    "audienceLevel": "intermediate",
    "outputFormat": "report",
    "includeSources": true
  }
}
```

**Example**:
```javascript
{
  "query": "Analyze these API documentation files and identify breaking changes between v1 and v2",
  "textDocuments": [
    { "name": "api-v1.md", "content": "# API v1\n..." },
    { "name": "api-v2.md", "content": "# API v2\n..." }
  ]
}
```

---

### 3.3 Research with Structured Data

**Scenario**: Analyze CSV, JSON data and derive insights

```javascript
{
  "tool": "conduct_research",
  "parameters": {
    "query": "Analyze this dataset and {{ANALYSIS_GOAL}}",
    "structuredData": [
      {
        "name": "{{DATASET_NAME}}",
        "type": "{{TYPE}}",  // "csv" | "json"
        "content": "{{DATA_STRING}}"
      }
    ],
    "costPreference": "low",
    "audienceLevel": "intermediate",
    "outputFormat": "report",
    "includeSources": false  // No web sources needed for data analysis
  }
}
```

**CSV Example**:
```javascript
{
  "query": "Analyze this sales data and identify top performing products and seasonal trends",
  "structuredData": [
    {
      "name": "sales_2025.csv",
      "type": "csv",
      "content": "date,product,revenue,units\n2025-01-01,Widget A,1500,30\n..."
    }
  ]
}
```

**JSON Example**:
```javascript
{
  "query": "Analyze this API response data and summarize error patterns",
  "structuredData": [
    {
      "name": "api_logs.json",
      "type": "json",
      "content": '{"logs": [{"timestamp": "...", "status": 500, ...}]}'
    }
  ]
}
```

---

## 4. Follow-Up & Refinement

### 4.1 Basic Follow-Up

**Scenario**: Ask clarifying questions or dig deeper into specific aspects

```javascript
{
  "tool": "research_follow_up",
  "parameters": {
    "originalQuery": "{{ORIGINAL_RESEARCH_QUERY}}",
    "followUpQuestion": "{{SPECIFIC_QUESTION}}",
    "costPreference": "low"
  }
}
```

**Example**:
```javascript
{
  "originalQuery": "What are the latest best practices for prompt engineering with LLMs?",
  "followUpQuestion": "How do chain-of-thought prompting techniques compare to tree-of-thought approaches in terms of accuracy and computational cost?",
  "costPreference": "low"
}
```

---

### 4.2 Agent-Based Follow-Up

**Scenario**: Use the unified agent for contextual follow-ups

```javascript
{
  "tool": "agent",
  "parameters": {
    "action": "follow_up",
    "originalQuery": "{{ORIGINAL_QUERY}}",
    "followUpQuestion": "{{FOLLOW_UP}}",
    "costPreference": "low"
  }
}
```

---

### 4.3 Iterative Refinement Pattern

**Workflow**: Research → Review → Refine → Deep Dive

```javascript
// Step 1: Initial broad research
const initial = await agent({
  query: "Overview of {{TOPIC}}",
  async: true,
  outputFormat: "briefing"
});

// Step 2: Review and identify gaps
// (manual review or automated analysis)

// Step 3: Follow-up on specific aspects
const deepDive = await research_follow_up({
  originalQuery: "Overview of {{TOPIC}}",
  followUpQuestion: "Provide detailed analysis of {{SPECIFIC_ASPECT}}",
  costPreference: "high"  // Use better models for depth
});

// Step 4: Synthesize
// Combine initial + deepDive reports
```

---

## 5. Knowledge Base Queries

### 5.1 Search Past Research

**Scenario**: Find previously conducted research on similar topics

```javascript
{
  "tool": "get_past_research",
  "parameters": {
    "query": "{{SEARCH_QUERY}}",
    "limit": {{MAX_RESULTS}},  // Default: 5
    "minSimilarity": {{THRESHOLD}}  // 0.0-1.0, default: 0.70
  }
}
```

**Use Case**: Avoid redundant research, build on previous findings

**Example**:
```javascript
{
  "query": "machine learning model deployment strategies",
  "limit": 10,
  "minSimilarity": 0.75  // Higher threshold = stricter matching
}
```

---

### 5.2 Hybrid Search (BM25 + Vector)

**Scenario**: Search across reports and indexed documents

```javascript
{
  "tool": "search",
  "parameters": {
    "q": "{{SEARCH_QUERY}}",
    "k": {{MAX_RESULTS}},  // Default: 10
    "scope": "{{SCOPE}}",  // "both" | "reports" | "docs"
    "rerank": {{RERANK}}  // true | false (LLM reranking)
  }
}
```

**Scopes**:
- `"both"`: Search reports and indexed documents
- `"reports"`: Only past research reports
- `"docs"`: Only indexed external documents

**Reranking**:
- `false`: Pure BM25+vector fusion (fast)
- `true`: Add LLM reranking pass (slower, more accurate)

---

### 5.3 SQL Knowledge Queries

**Scenario**: Direct database queries for complex filters

```javascript
{
  "tool": "query",
  "parameters": {
    "sql": "SELECT {{COLUMNS}} FROM {{TABLE}} WHERE {{CONDITIONS}} ORDER BY {{ORDER}} LIMIT {{LIMIT}}",
    "params": [{{PARAM_ARRAY}}],  // Parameterized query values
    "explain": {{EXPLAIN}}  // true: get LLM explanation of results
  }
}
```

**Example**:
```javascript
{
  "sql": "SELECT id, original_query, created_at FROM reports WHERE original_query LIKE $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 10",
  "params": ["%AI agents%", "2025-01-01"],
  "explain": true  // Get natural language explanation
}
```

**Safety**: Only `SELECT` statements allowed

---

### 5.4 Retrieve with Unified Interface

**Scenario**: Use single tool for both index and SQL retrieval

```javascript
// Index mode (default)
{
  "tool": "retrieve",
  "parameters": {
    "mode": "index",
    "query": "{{SEARCH_QUERY}}",
    "k": 10,
    "scope": "both"
  }
}

// SQL mode
{
  "tool": "retrieve",
  "parameters": {
    "mode": "sql",
    "sql": "{{SQL_QUERY}}",
    "params": [],
    "explain": false
  }
}
```

---

## 6. Advanced Patterns

### 6.1 Research → Index → Retrieve Pattern

**Workflow**: Conduct research, index results, enable future retrieval

```javascript
// Step 1: Conduct research
const { job_id } = await agent({
  query: "Comprehensive analysis of {{TOPIC}}",
  async: true
});

// Step 2: Wait for completion and get report
const status = await get_job_status({ job_id });
const reportId = extractReportId(status);
const report = await get_report_content({ reportId, mode: "full" });

// Step 3: Index for future retrieval
// (Auto-indexed if config.indexer.autoIndexReports = true)

// Step 4: Future retrieval
const similar = await search({
  q: "{{RELATED_QUERY}}",
  scope: "reports",
  k: 5
});
```

---

### 6.2 Web → Fetch → Research Pattern

**Workflow**: Search web, fetch URLs, incorporate into research

```javascript
// Step 1: Search web
const { results } = await search_web({
  query: "{{SEARCH_TERMS}}",
  maxResults: 5
});

// Step 2: Fetch promising URLs
const contents = await Promise.all(
  results.map(r => fetch_url({ url: r.url, maxBytes: 200000 }))
);

// Step 3: Index fetched content
// (Auto-indexed if config.indexer.autoIndexFetchedContent = true)

// Step 4: Conduct research with context
const report = await agent({
  query: "Based on the fetched sources, analyze {{TOPIC}}",
  async: true
});
```

---

### 6.3 Multi-Stage Research Pipeline

**Workflow**: Planning → Research → Synthesis → Follow-up

```javascript
// Stage 1: Generate research plan
const plan = await mcp.getPrompt("planning_prompt", {
  query: "{{COMPLEX_QUERY}}",
  domain: "technical",
  complexity: "complex",
  maxAgents: 7
});

// Stage 2: Execute research (auto-orchestrated)
const { job_id } = await agent({
  query: "{{COMPLEX_QUERY}}",
  async: true,
  costPreference: "high"
});

// Stage 3: Monitor and synthesize
const events = new EventSource(`/jobs/${job_id}/events`);
events.onmessage = (e) => {
  const { type, payload } = JSON.parse(e.data);
  if (type === "synthesis_token") console.log(payload.content);
};

// Stage 4: Follow-up on gaps
const followUp = await research_follow_up({
  originalQuery: "{{COMPLEX_QUERY}}",
  followUpQuestion: "{{IDENTIFIED_GAP}}",
  costPreference: "high"
});
```

---

### 6.4 Continuous Research Pattern

**Workflow**: Monitor topic over time, compare reports

```javascript
// Initial baseline
const baseline = await agent({
  query: "State of {{TOPIC}} as of {{DATE_1}}",
  async: true
});

// ... wait days/weeks/months ...

// Follow-up research
const update = await agent({
  query: "State of {{TOPIC}} as of {{DATE_2}}",
  async: true
});

// Compare reports
const comparison = await agent({
  query: "Compare these two reports and identify key changes",
  textDocuments: [
    { name: "baseline.md", content: baselineReport },
    { name: "update.md", content: updateReport }
  ],
  async: false
});
```

---

## 7. Parameter Reference

### 7.1 Common Parameters

| Parameter | Type | Values | Default | Description |
|-----------|------|--------|---------|-------------|
| `query` | string | Any text | *required* | Research query or question |
| `async` | boolean | true, false | true | Async job (true) or sync streaming (false) |
| `costPreference` | string | "low", "high" | "low" | Model tier selection |
| `audienceLevel` | string | "beginner", "intermediate", "expert" | "intermediate" | Report complexity level |
| `outputFormat` | string | "report", "briefing", "bullet_points" | "report" | Output structure |
| `includeSources` | boolean | true, false | true | Include citations and URLs |
| `maxLength` | number | Any positive int | *auto* | Max report length (chars) |

### 7.2 Multi-Modal Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `images` | array | Array of `{ url, detail }` objects for vision analysis |
| `textDocuments` | array | Array of `{ name, content }` text documents |
| `structuredData` | array | Array of `{ name, type, content }` CSV/JSON data |

### 7.3 Advanced Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `mode` | string | "standard" (default) or "hyper" (experimental high-perf) |
| `clientContext` | object | Client environment context (OS, app, session) |
| `notify` | string | Webhook URL for job completion notification |

### 7.4 Shorthand Parameters (simpleTools enabled)

| Shorthand | Full Parameter | Example |
|-----------|----------------|---------|
| `q` | `query` | `q: "..."` |
| `cost` | `costPreference` | `cost: "high"` |
| `aud` | `audienceLevel` | `aud: "expert"` |
| `fmt` | `outputFormat` | `fmt: "briefing"` |
| `src` | `includeSources` | `src: false` |
| `imgs` | `images` | `imgs: [...]` |
| `docs` | `textDocuments` | `docs: [...]` |
| `data` | `structuredData` | `data: [...]` |

---

## 8. Use Case Matrix

| Use Case | Tool | Async | Cost | Audience | Format | Notes |
|----------|------|-------|------|----------|--------|-------|
| Quick fact check | agent | false | low | intermediate | briefing | <30s |
| Deep technical analysis | agent | true | high | expert | report | Vision if needed |
| Market research | agent | true | low | intermediate | report | Web sources |
| Literature survey | agent | true | high | expert | report | Academic focus |
| Comparative study | agent | true | low | intermediate | report | Structured comparison |
| Code review | conduct_research | false | low | expert | briefing | Use textDocuments |
| Data analysis | conduct_research | false | low | intermediate | report | Use structuredData |
| Diagram analysis | conduct_research | false | high | expert | report | Use images (high detail) |
| Follow-up question | research_follow_up | N/A | low | expert | briefing | Maintains context |
| KB search | search | N/A | N/A | N/A | N/A | Retrieval only |

---

## 9. Client Context Integration

**Purpose**: Provide environment context for more relevant research

```javascript
{
  "tool": "agent",
  "parameters": {
    "query": "{{QUERY}}",
    "clientContext": {
      "app": "Cursor",
      "os": "Windows 11",
      "workspace": "{{PROJECT_PATH}}",
      "language": "TypeScript",
      "frameworks": ["React", "Next.js"],
      "session": {
        "files_open": ["src/app.tsx", "README.md"],
        "current_task": "Implementing authentication"
      }
    },
    "async": true
  }
}
```

**Benefits**:
- Context-aware recommendations
- Technology-specific guidance
- Environment-optimized solutions

---

## 10. Error Handling & Retry Patterns

### 10.1 Retry on Failure

```javascript
async function researchWithRetry(query, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await agent({ query, async: false });
      return result;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * (i + 1));  // Exponential backoff
    }
  }
}
```

### 10.2 Graceful Degradation

```javascript
async function robustResearch(query) {
  try {
    // Try high-cost first
    return await agent({ query, costPreference: "high", async: true });
  } catch (error) {
    console.warn("High-cost failed, falling back to low-cost");
    return await agent({ query, costPreference: "low", async: true });
  }
}
```

---

## 11. Prompt Engineering Best Practices

### 11.1 Query Formulation

**Good**:
```
"Analyze the trade-offs between microservices and monolithic architectures for a SaaS application handling 10M users, focusing on scalability, operational complexity, and team structure implications"
```

**Bad**:
```
"microservices vs monolith"
```

**Tips**:
- Be specific about context
- Include constraints and scale
- Specify desired analysis dimensions
- State output preferences explicitly

### 11.2 Multi-Part Queries

**Structure**:
```
"{{MAIN_QUESTION}}. Specifically address: 1) {{ASPECT_1}}, 2) {{ASPECT_2}}, 3) {{ASPECT_3}}. Provide examples and cite recent sources (2024-2025)."
```

**Example**:
```
"How should I implement real-time collaboration in a web application? Specifically address: 1) WebSocket vs WebRTC trade-offs, 2) conflict resolution strategies, 3) scaling to 10K concurrent users. Provide code examples and cite recent sources (2024-2025)."
```

### 11.3 Temporal Specificity

**Good**:
```
"What are the latest developments in {{TOPIC}} as of Q4 2025?"
```

**Better**:
```
"Compare the state of {{TOPIC}} in Q1 2024 vs Q4 2025, highlighting major breakthroughs and shifts in best practices"
```

---

## 12. Troubleshooting

| Issue | Cause | Solution Template |
|-------|-------|-------------------|
| Empty results | Too specific query | Broaden query scope |
| Too generic | Vague query | Add constraints, examples, context |
| Slow response | Sync + complex query | Use `async: true` |
| Vision errors | Wrong format | Use "high" cost + valid image URLs |
| Cache hits | Identical query | Rephrase or add new constraints |
| Job not found | Wrong job_id | Use exact job_id from submission |

---

## Appendix: Template Generation Script

**Usage**: Generate filled templates programmatically

```javascript
function fillTemplate(template, variables) {
  let filled = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    filled = filled.replace(regex, value);
  }
  return filled;
}

// Example
const template = {
  tool: "agent",
  parameters: {
    query: "Analyze {{TOPIC}} with focus on {{FOCUS}}",
    async: true
  }
};

const params = fillTemplate(JSON.stringify(template), {
  TOPIC: "WebAssembly runtime security",
  FOCUS: "sandboxing mechanisms"
});

const request = JSON.parse(params);
```

---

**Template Library Version**: 2.1.1-beta  
**Last Updated**: October 9, 2025  
**Maintainer**: terminals.tech  
**License**: MIT



