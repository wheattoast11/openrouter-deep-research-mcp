# Agentic Orchestration Framework - Context Injection & Optimal Execution Policy

**Version**: 2.2.0-beta  
**Date**: October 12, 2025  
**Status**: Production Implementation

---

## 🎯 **Executive Summary**

This document defines the **formal rewrite and optimization framework** for agentic orchestration in the OpenRouter Research Agents MCP server. It establishes a MECE (Mutually Exclusive, Collectively Exhaustive) policy for **context injection**, **execution optimization**, and **parallel test-time compute scaling**.

---

## 📐 **Architecture: Optimal Execution Policy**

### **1. Context Injection Pipeline** (Sequential + Parallel)

```
User Query → Formal Rewrite → Context Enrichment → Policy Selection → Execution
     ↓            ↓                    ↓                  ↓              ↓
 Raw Intent   Structured       Knowledge Graph       Cost/Quality    Distributed
              Parameters         + History           Optimizer        Workers
```

#### **1.1 Formal Rewrite Step** (Entry Point)

**Purpose**: Transform natural language queries into structured, optimized execution policies

**Implementation**: `src/agents/planningAgent.js::planResearch()`

**Formal Parameters**:
```javascript
{
  query: string,              // Raw user intent
  domain: enum<Domain>,       // general|technical|reasoning|search|creative
  complexity: enum<Level>,    // simple|moderate|complex
  costPreference: enum<Cost>, // low|high
  audienceLevel: enum<Audience>, // beginner|intermediate|expert
  outputFormat: enum<Format>,    // report|briefing|bullet_points
  contextWindow: number,      // Max context tokens (default: 128k)
  parallelism: number,        // Max concurrent agents (1-10)
  executionPolicy: {
    type: 'sequential' | 'parallel' | 'hybrid' | 'adaptive',
    budgetTokens: number,
    budgetDollars: number,
    timeoutMs: number,
    fallbackStrategy: 'degrade' | 'fail' | 'retry'
  }
}
```

**Formal Rewrite Algorithm**:
```
INPUT: query, domain, complexity, constraints
OUTPUT: ExecutionPolicy

1. Parse query → intent_tree (semantic decomposition)
2. Load contextual_knowledge_graph (historical queries, cached embeddings)
3. Estimate cost_surface(intent_tree) → (tokens, time, $)
4. IF cost > budget THEN
     decompose(intent_tree) → sub_queries[]
     optimize_subquery_allocation(sub_queries, constraints)
   ELSE
     monolithic_execution(intent_tree)
5. SELECT execution_policy ∈ {sequential, parallel, hybrid, adaptive}
6. INJECT optimal_context(knowledge_graph, intent_tree) → enriched_query
7. RETURN ExecutionPolicy(enriched_query, sub_queries, policy, constraints)
```

---

### **2. Optimal Execution Policies** (MECE Taxonomy)

#### **Policy A: Sequential Execution** (single-agent, deterministic)
- **Use Case**: Simple queries, low latency requirement, cost-sensitive
- **Agent Count**: 1
- **Concurrency**: 1
- **Cost Model**: O(1) * query_complexity
- **Example**: `"What is the capital of France?"`

#### **Policy B: Parallel Execution** (multi-agent ensemble)
- **Use Case**: Complex queries requiring diverse perspectives
- **Agent Count**: 3-10 (BoundedExecutor with max=10)
- **Concurrency**: `Math.min(parallelism, sub_queries.length)`
- **Cost Model**: O(N) * query_complexity / parallelism_factor
- **Example**: `"Compare 5 LLM providers across cost, performance, and compliance"`
- **Implementation**: `src/agents/researchAgent.js::conductParallelResearch()`

#### **Policy C: Hybrid Execution** (sequential → parallel fan-out)
- **Use Case**: Queries with dependencies between sub-questions
- **Agent Count**: 2-7
- **Concurrency**: Variable (adapts per stage)
- **Cost Model**: O(depth) * O(breadth)
- **Example**: `"First explain quantum computing, then compare top 3 quantum cloud platforms"`

#### **Policy D: Adaptive Execution** (dynamic policy switching)
- **Use Case**: Unknown complexity, budget-constrained exploration
- **Agent Count**: Starts 1, scales to N
- **Concurrency**: Dynamically adjusted based on intermediate results
- **Cost Model**: O(initial) + Σ O(expansions)
- **Example**: `"Research [topic] until confidence > 0.9 or budget exhausted"`

---

### **3. Context Injection Mechanisms** (Optimization Layer)

#### **3.1 Knowledge Graph Injection**
**Implemented in**: `src/utils/dbClient.js` + `research_reports` table

```sql
-- Retrieve semantically similar past research
SELECT id, query, content, metadata->'sources' as sources
FROM research_reports
WHERE embedding <-> $queryEmbedding < 0.3
ORDER BY created_at DESC
LIMIT 5;
```

**Injected Context**:
- Previous research on similar topics (vector similarity < 0.3)
- Cached embeddings (768-dim from `gemini-embedding-001`)
- Source URLs and citations from prior reports
- Confidence scores and ratings

#### **3.2 Prompt Template Injection**
**Implemented in**: `src/server/mcpPrompts.js`

**Available Prompts** (MCP `prompts/get`):
1. `planning_prompt` - Multi-agent decomposition with XML tags
2. `synthesis_prompt` - Ensemble result synthesis with citations
3. `research_workflow_prompt` - End-to-end workflow templates
4. `summarize_and_learn` - Iterative learning loop
5. `daily_briefing` - Structured daily research aggregation
6. `continuous_query` - Ongoing monitoring workflow

**Usage**:
```javascript
// Client calls prompts/get
const prompt = await mcpClient.getPrompt('planning_prompt', {
  query: userQuery,
  domain: 'technical',
  complexity: 'complex',
  maxAgents: 7
});

// Returns pre-optimized planning output from planningAgent
```

#### **3.3 Resource Injection** (Dynamic System State)
**Implemented in**: `src/server/mcpResources.js`

**Available Resources** (MCP `resources/read`):
- `mcp://specs/core` - MCP protocol specifications
- `mcp://tools/catalog` - Tool metadata and schemas
- `mcp://patterns/workflows` - Common research patterns
- `mcp://examples/multimodal` - Multimodal query examples
- `mcp://agent/status` - Real-time agent job queue status
- `mcp://knowledge_base/updates` - Recent research additions

**Agentic Usage**:
```javascript
// Agent autonomously reads resource before execution
const toolCatalog = await server.readResource('mcp://tools/catalog');
const availableTools = JSON.parse(toolCatalog.contents[0].text);

// Inject tool selection into execution policy
executionPolicy.toolchain = selectOptimalTools(availableTools, query);
```

---

### **4. Parallel Test-Time Compute Scaling**

#### **4.1 BoundedExecutor Integration**
**Implemented in**: `src/agents/researchAgent.js`

```javascript
const { BoundedExecutor } = require('@terminals-tech/core');

async conductParallelResearch(queries, costPreference, ..., extra) {
  const parallelism = Math.min(
    config.researchAgent.maxParallelQueries || 5,
    queries.length
  );
  
  const executor = new BoundedExecutor(parallelism); // Deterministic concurrency
  
  const results = await Promise.all(
    queries.map((query, idx) =>
      executor.execute(async () => {
        return await this.researchQuery(query, costPreference, ...);
      })
    )
  );
  
  return results;
}
```

**Benefits**:
- **Deterministic concurrency**: No thundering herd, predictable token/$ costs
- **Fair scheduling**: FIFO queue ensures no agent starves
- **Backpressure**: Auto-throttles when upstream (OpenRouter) rate-limits
- **Observability**: Executor tracks queue depth, throughput, latency

#### **4.2 Subagent Distribution Strategies**

**Strategy 1: Homogeneous Ensemble** (same model, different prompts)
```javascript
const agents = queries.map(q => ({
  model: 'anthropic/claude-3.5-sonnet',
  query: q,
  temperature: 0.7
}));
```

**Strategy 2: Heterogeneous Ensemble** (different models, same query)
```javascript
const models = ['anthropic/claude-3.5-sonnet', 'openai/gpt-4', 'google/gemini-pro'];
const agents = models.map(model => ({
  model,
  query: originalQuery,
  temperature: 0.7
}));
```

**Strategy 3: Hierarchical Cascade** (specialist → generalist)
```javascript
// Stage 1: Specialist agents (parallel)
const stage1 = await executor.executeAll([
  researchQuery(q1, { model: 'deepseek/deepseek-r1' }), // Reasoning
  researchQuery(q2, { model: 'perplexity/llama-3.1-sonar-huge-128k-online' }), // Search
]);

// Stage 2: Generalist synthesis (sequential)
const synthesis = await contextAgent.synthesize(stage1, {
  model: 'anthropic/claude-3.5-sonnet'
});
```

---

### **5. Optimal Policy Injection: Formal Implementation**

#### **5.1 Policy Injection Interface**

**New Function**: `src/agents/zeroAgent.js::injectOptimalPolicy()`

```javascript
class ZeroAgent {
  /**
   * Formal rewrite: User query → Optimal execution policy
   * @param {string} query - Raw user query
   * @param {Object} constraints - Budget, time, quality constraints
   * @param {Object} context - Knowledge graph, history, tools
   * @returns {ExecutionPolicy} - Optimized policy with injected context
   */
  async injectOptimalPolicy(query, constraints = {}, context = {}) {
    // 1. Semantic parse
    const intent = await this.parseIntent(query);
    
    // 2. Load contextual knowledge
    const pastResearch = await dbClient.findReportsBySimilarity(
      await embeddings.generate(query),
      5
    );
    
    // 3. Estimate cost surface
    const costEstimate = this.estimateCost(intent, constraints);
    
    // 4. Select policy
    const policyType = this.selectPolicy(intent, costEstimate, constraints);
    
    // 5. Decompose if needed
    let subQueries = [intent];
    if (policyType === 'parallel' || policyType === 'hybrid') {
      const plan = await this.planner.planResearch(query, {
        domain: intent.domain,
        complexity: intent.complexity,
        maxAgents: constraints.maxAgents || 7
      });
      subQueries = plan.sub_queries || [intent];
    }
    
    // 6. Inject context into each sub-query
    const enrichedQueries = subQueries.map(sq => ({
      ...sq,
      context: {
        pastResearch: pastResearch.filter(r => 
          this.isRelevant(r, sq)
        ),
        availableTools: context.toolCatalog || [],
        constraints: constraints
      }
    }));
    
    // 7. Return execution policy
    return {
      type: policyType,
      queries: enrichedQueries,
      parallelism: Math.min(constraints.maxAgents || 5, enrichedQueries.length),
      costEstimate: costEstimate,
      fallbackStrategy: constraints.fallback || 'degrade'
    };
  }
  
  /**
   * Execute policy with optimal orchestration
   */
  async executePolicy(policy, onProgress = null) {
    switch (policy.type) {
      case 'sequential':
        return await this.executeSequential(policy.queries, onProgress);
      
      case 'parallel':
        return await this.researcher.conductParallelResearch(
          policy.queries,
          policy.constraints.costPreference,
          null, null, null, null, null,
          onProgress
        );
      
      case 'hybrid':
        return await this.executeHybrid(policy.queries, onProgress);
      
      case 'adaptive':
        return await this.executeAdaptive(policy, onProgress);
      
      default:
        throw new Error(`Unknown policy type: ${policy.type}`);
    }
  }
}
```

#### **5.2 Integration with MCP `agent` Tool**

**Update**: `src/server/tools.js::agentTool()`

```javascript
async function agentTool(params, mcpExchange = null, requestId = `req-${Date.now()}`) {
  const { ZeroAgent } = require('../agents/zeroAgent');
  const agent = params.__zeroInstance || new ZeroAgent();
  
  // NEW: Inject optimal policy before execution
  const policy = await agent.injectOptimalPolicy(
    params.query,
    {
      costPreference: params.costPreference || 'low',
      maxAgents: params.maxAgents || 5,
      timeoutMs: params.timeoutMs || 300000,
      fallback: params.fallback || 'degrade'
    },
    {
      toolCatalog: await getToolCatalog(),
      resourceCatalog: await getResourceCatalog()
    }
  );
  
  // Execute with injected policy
  if (params.async !== false) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await dbClient.createJob({
      job_id: jobId,
      operation: 'agent',
      params: { ...params, policy: policy }, // Store policy
      status: 'queued'
    });
    
    // Background execution
    (async () => {
      const result = await agent.executePolicy(policy, async (type, payload) => {
        await dbClient.appendJobEvent(jobId, { type, ...payload });
      });
      
      await dbClient.setJobStatus(jobId, 'succeeded', result);
    })();
    
    return { job_id: jobId, status: 'queued', policy: policy.type };
  } else {
    // Synchronous execution
    const result = await agent.executePolicy(policy);
    return result;
  }
}
```

---

### **6. Agentic Orchestration: Self-Optimization Loop**

#### **6.1 Continuous Learning Architecture**

```
User Query → Policy Injection → Execution → Result → Feedback → Policy Update
     ↑                                                               ↓
     └───────────────────── Learning Loop ─────────────────────────┘
```

**Implementation**: `src/agents/zeroAgent.js::learn()`

```javascript
class ZeroAgent {
  async learn(query, policy, result, feedback = {}) {
    // 1. Extract execution metrics
    const metrics = {
      cost: result.metadata?.cost || 0,
      time: result.metadata?.time || 0,
      confidence: result.metadata?.confidence || 0,
      quality: feedback.rating || null
    };
    
    // 2. Update policy heuristics
    if (metrics.cost > policy.costEstimate * 1.5) {
      // Policy overestimated, adjust future estimates
      await this.updateCostModel(query, policy.type, metrics.cost);
    }
    
    // 3. Store result in knowledge graph
    await dbClient.saveResearchReport({
      query: query,
      content: result.synthesis,
      metadata: {
        policy: policy.type,
        parallelism: policy.parallelism,
        ...metrics
      }
    });
    
    // 4. Retrain policy selector (offline batch)
    if (this.shouldRetrain()) {
      await this.retrainPolicySelector();
    }
  }
}
```

#### **6.2 Multi-Agent Coordination Patterns**

**Pattern 1: Leader-Follower** (ZeroAgent orchestrates specialists)
```javascript
const leader = new ZeroAgent();
const followers = [planningAgent, researchAgent, contextAgent];

const result = await leader.coordinate(query, followers, policy);
```

**Pattern 2: Peer-to-Peer** (Agents negotiate execution)
```javascript
const agents = [agent1, agent2, agent3];
const consensus = await negotiate(agents, query, constraints);
const result = await executeConsensus(consensus);
```

**Pattern 3: Hierarchical** (Specialist → Manager → Executive)
```javascript
const specialists = await executeSpecialists(subQueries);
const managerSynthesis = await managerAgent.synthesize(specialists);
const executiveBrief = await executiveAgent.summarize(managerSynthesis);
```

---

## 🚀 **Implementation Checklist**

### **Phase 1: Core Policy Injection** (2-3 hours)
- [ ] Implement `ZeroAgent.injectOptimalPolicy()`
- [ ] Add policy storage to `job_queue` table schema
- [ ] Update `agentTool()` to use injected policies
- [ ] Add policy type tracking to job events

### **Phase 2: Optimization Algorithms** (4-5 hours)
- [ ] Implement cost estimation model
- [ ] Build policy selector (rule-based → ML later)
- [ ] Add fallback strategies for each policy type
- [ ] Integrate adaptive execution with dynamic scaling

### **Phase 3: Learning Loop** (3-4 hours)
- [ ] Implement `ZeroAgent.learn()` feedback integration
- [ ] Add policy performance tracking table
- [ ] Build policy retraining pipeline (offline)
- [ ] Add A/B testing for policy selection

### **Phase 4: Advanced Orchestration** (5-6 hours)
- [ ] Implement leader-follower coordination
- [ ] Add peer negotiation protocol
- [ ] Build hierarchical synthesis pipeline
- [ ] Add real-time policy switching

---

## 📊 **Performance Benchmarks** (Target Metrics)

| Policy Type | Avg Cost/Query | Avg Latency | Confidence | Quality Score |
|-------------|----------------|-------------|------------|---------------|
| Sequential  | $0.02-0.05     | 5-10s       | 0.75       | 3.8/5.0       |
| Parallel    | $0.10-0.25     | 8-15s       | 0.88       | 4.5/5.0       |
| Hybrid      | $0.05-0.15     | 12-20s      | 0.82       | 4.2/5.0       |
| Adaptive    | $0.03-0.30*    | 5-60s*      | 0.90*      | 4.6/5.0       |

*Adaptive metrics vary based on exploration depth

---

## 🎯 **Next Steps: Agentic Execution**

1. **Immediate**: Test current prompts visibility in Cursor (should now work after removing duplicate registration)

2. **Short-term** (today): Implement `injectOptimalPolicy()` in `ZeroAgent`

3. **Medium-term** (this week): Build learning loop with feedback integration

4. **Long-term** (next sprint): Add ML-based policy selector trained on historical execution data

---

**Author**: AI Agent (Claude Sonnet 4.5)  
**Last Updated**: 2025-10-12 21:45 UTC  
**Status**: Ready for Implementation

