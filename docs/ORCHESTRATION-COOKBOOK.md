# Orchestration Cookbook

Patterns for effective AI agent orchestration with the OpenRouter Agents MCP server.

## Table of Contents
- [Tier System](#tier-system)
- [Pattern 1: Quick Lookup](#pattern-1-quick-lookup)
- [Pattern 2: Standard Research](#pattern-2-standard-research)
- [Pattern 3: Knowledge Base First](#pattern-3-knowledge-base-first)
- [Pattern 4: Deep Exploration](#pattern-4-deep-exploration)
- [Pattern 5: Batch Processing](#pattern-5-batch-processing)
- [Pattern 6: Graph Navigation](#pattern-6-graph-navigation)
- [Anti-Patterns](#anti-patterns)

---

## Tier System

Tools are organized into tiers by complexity and cost:

| Tier | Tools | Latency | Cost | Use Case |
|------|-------|---------|------|----------|
| 0 | `ping`, `date_time`, `calc` | <10ms | Free | Health checks, utilities |
| 1 | `search`, `history`, `get_report` | <100ms | Free | Knowledge base queries |
| 2 | `research`, `batch_research` | 30-120s | $$ | New information gathering |
| 3 | `graph_traverse`, `graph_clusters` | <1s | Free | Relationship discovery |
| 4 | `chain` (multi-tool) | Varies | $$$ | Complex workflows |

**Rule of thumb:** Start at Tier 1, escalate only when needed.

---

## Pattern 1: Quick Lookup

**Use when:** Answer exists in knowledge base

```javascript
// Step 1: Search existing knowledge
search { q: "MCP protocol specification", k: 5 }

// If good results found, done!
// Otherwise, escalate to Pattern 2
```

**Token cost:** ~50-100 tokens

---

## Pattern 2: Standard Research

**Use when:** Need fresh information on a topic

```javascript
// Step 1: Check health
ping {}

// Step 2: Run research (async by default)
research {
  query: "Latest developments in AI agents",
  costPreference: "low",
  async: true
}
// Returns: { job_id: "job_xxx" }

// Step 3: Poll for completion
job_status { job_id: "job_xxx" }
// Returns: { status: "complete", reportId: "5" }

// Step 4: Get results
get_report { reportId: "5" }
```

**Token cost:** ~500-2000 tokens
**Wall time:** 30-60 seconds

---

## Pattern 3: Knowledge Base First

**Use when:** Avoid redundant research

```javascript
// Step 1: Check for existing research
search { q: "quantum computing applications", k: 3 }

// Step 2: Check relevance and recency
history { limit: 5, queryFilter: "quantum" }

// Step 3: If recent research exists, use it
get_report { reportId: "3" }

// Step 4: Only research if nothing found
research { query: "quantum computing 2025 applications" }
```

**Best for:** Frequent queries, cost optimization

---

## Pattern 4: Deep Exploration

**Use when:** Complex topic requiring multiple angles

```javascript
// Step 1: Initial research
research { query: "AI safety mechanisms", async: false }

// Step 2: Follow up on interesting aspects
research_follow_up {
  originalQuery: "AI safety mechanisms",
  followUpQuestion: "How do RLHF and Constitutional AI compare?"
}

// Step 3: Explore graph connections
graph_traverse { startNode: "report:5", depth: 3, strategy: "semantic" }

// Step 4: Find related clusters
graph_clusters {}
```

**Token cost:** 3000-8000 tokens
**Best for:** Comprehensive understanding

---

## Pattern 5: Batch Processing

**Use when:** Multiple independent queries

```javascript
// GOOD: Single call for multiple queries
batch_research {
  queries: [
    "Renewable energy trends 2025",
    "Carbon capture technologies",
    { query: "Climate policy frameworks", costPreference: "high" }
  ],
  waitForCompletion: true,
  timeoutMs: 300000
}
// Returns all results at once

// BAD: Sequential calls (wastes tokens)
research { query: "Renewable energy trends 2025" }
job_status { job_id: "job_1" }  // Polling loop
research { query: "Carbon capture technologies" }
job_status { job_id: "job_2" }  // More polling
```

**Efficiency gain:** 3-5x fewer tool calls

---

## Pattern 6: Graph Navigation

**Use when:** Understanding relationships between topics

```javascript
// Step 1: Find entry point
search { q: "machine learning", k: 1 }
// Returns: report:12

// Step 2: Traverse from node
graph_traverse {
  startNode: "report:12",
  depth: 3,
  strategy: "semantic"  // or "bfs", "dfs"
}

// Step 3: Find paths between topics
graph_path { from: "report:12", to: "report:25" }

// Step 4: Get importance rankings
graph_pagerank { topK: 10 }

// Step 5: Identify topic clusters
graph_clusters {}
```

---

## Chain Patterns

### Search → Research → Synthesize

```javascript
agent {
  action: "chain",
  chain: [
    { tool: "search", params: { q: "existing knowledge", k: 3 } },
    { tool: "research", params: { query: "fill gaps", async: false } },
    { tool: "get_report", params: { reportId: "$1.reportId" } }
  ]
}
```

### Multi-Source Verification

```javascript
agent {
  action: "chain",
  chain: [
    { tool: "search_web", params: { query: "fact to verify" } },
    { tool: "search", params: { q: "internal knowledge on topic" } },
    { tool: "research", params: {
      query: "synthesize and verify: [topic]",
      async: false
    }}
  ]
}
```

---

## Session Management

### Checkpointing Before Changes

```javascript
// Create checkpoint before major operation
checkpoint { name: "before-deep-research" }

// Do potentially expensive work
batch_research { queries: [...], waitForCompletion: true }

// If unhappy with results
undo {}

// Or restore checkpoint
time_travel { timestamp: "2025-12-05T10:30:00Z" }
```

### Branching Exploration

```javascript
// Fork session for experimental path
fork_session { sessionId: "default", newSessionId: "experimental" }

// Try different approach in fork
// Main session remains unchanged
```

---

## Cost Estimation

### Before Research

```javascript
// Estimate based on query complexity
const estimatedCost = {
  simple: "$0.01 - $0.05",    // Single topic, lowCost models
  moderate: "$0.05 - $0.20",  // Multi-aspect, ensemble
  complex: "$0.20 - $1.00"    // Deep research, highCost models
};
```

### Optimization Strategies

1. **Use caching:** Similar queries hit cache (free)
2. **Use KB first:** Search before research
3. **Use batch:** Single call for multiple queries
4. **Use lowCost:** Default costPreference is "low"

---

## Anti-Patterns

### 1. Polling Loop

```javascript
// BAD: Burns tokens on status checks
while (status !== "complete") {
  job_status { job_id }  // Each call costs tokens
  await sleep(1000)
}

// GOOD: Use waitForCompletion or SSE
batch_research { queries: [...], waitForCompletion: true }
// Or: Subscribe to SSE at /jobs/batch/events?ids=...
```

### 2. Research Before Search

```javascript
// BAD: Expensive research first
research { query: "topic" }  // $0.10+

// GOOD: Check KB first
search { q: "topic" }  // Free
// Only research if needed
```

### 3. Sequential When Parallel Works

```javascript
// BAD: Serial queries
research { query: "topic 1" }
// wait...
research { query: "topic 2" }
// wait...

// GOOD: Batch parallel
batch_research { queries: ["topic 1", "topic 2"] }
```

### 4. Ignoring Graph Context

```javascript
// BAD: Treating reports as isolated
get_report { reportId: "5" }
get_report { reportId: "6" }
// No connection understanding

// GOOD: Use graph for context
graph_traverse { startNode: "report:5", depth: 2 }
// Understand relationships
```

### 5. Over-Chaining

```javascript
// BAD: Chain when simpler works
agent {
  action: "chain",
  chain: [
    { tool: "ping", params: {} },
    { tool: "search", params: { q: "topic" } }
  ]
}

// GOOD: Direct calls
ping {}
search { q: "topic" }
```

---

## Decision Tree

```
Need information?
│
├─ Is it in the knowledge base?
│   ├─ Yes → search {} → Done
│   └─ Unknown → search {} first
│
├─ Is it fresh/current information?
│   ├─ Yes → research { async: false }
│   └─ Historical → search or history
│
├─ Multiple topics?
│   ├─ Yes → batch_research {}
│   └─ No → research {}
│
├─ Understanding relationships?
│   ├─ Yes → graph_traverse or graph_path
│   └─ No → search or research
│
└─ Complex multi-step workflow?
    ├─ Yes → agent { action: "chain" }
    └─ No → Direct tool calls
```

---

## Example: Complete Research Session

```javascript
// 1. Health check
ping {}

// 2. Check existing knowledge
search { q: "AI governance frameworks", k: 5 }

// 3. Check recency
history { limit: 3, queryFilter: "governance" }

// 4. Checkpoint before heavy work
checkpoint { name: "before-research" }

// 5. Run research if needed
research {
  query: "AI governance frameworks 2025 comparison",
  costPreference: "low",
  outputFormat: "report",
  async: false
}

// 6. Explore related topics
graph_traverse { startNode: "report:latest", depth: 2 }

// 7. Follow up on specifics
research_follow_up {
  originalQuery: "AI governance frameworks",
  followUpQuestion: "How does EU AI Act compare to US approach?"
}
```

---

## Metrics to Track

| Metric | Target | Tool |
|--------|--------|------|
| Cache hit rate | >30% | `get_server_status` |
| Avg research time | <60s | Job timestamps |
| Token efficiency | High | Batch over sequential |
| KB coverage | Growing | `graph_stats` |
