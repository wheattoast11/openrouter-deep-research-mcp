# OpenRouter Agents - Comprehensive Use Cases & Workflows

## 🎯 **Quick Start: Single-Prompt Workflows**

For platforms supporting MCP prompts, use these single-command workflows:

### **Research Workflow Prompt**
```mcp
research_workflow_prompt {
  "topic": "quantum computing applications in machine learning",
  "costBudget": "low", 
  "async": "true"
}
```

---

## 📋 **Domain-Specific Use Cases**

### 1. **Technical Research & Analysis**

#### **Domain**: System Architecture & Engineering
#### **Problem**: Understanding complex distributed systems and implementation patterns
#### **Research Strategy**: Multi-source technical analysis with authoritative citations

```xml
<workflow>
  <step1 tool="search_web">
    <params>{ "query": "microservices event-driven architecture patterns 2025", "maxResults": 5 }</params>
    <purpose>Gather current industry perspectives</purpose>
  </step1>
  
  <step2 tool="fetch_url">
    <params>{ "url": "[top_authoritative_source]", "maxBytes": 50000 }</params>
    <purpose>Deep-dive into primary technical documentation</purpose>
  </step2>
  
  <step3 tool="conduct_research">
    <params>{ 
      "query": "Compare event-driven microservices vs traditional REST APIs: performance, scalability, complexity trade-offs",
      "textDocuments": ["fetched_content"],
      "costPreference": "low",
      "audienceLevel": "expert"
    }</params>
    <purpose>Comprehensive analysis with ensemble model consensus</purpose>
  </step3>
  
  <step4 tool="research_follow_up">
    <params>{ 
      "originalQuery": "microservices architecture comparison",
      "followUpQuestion": "What are the specific security considerations and DevOps implications?"
    }</params>
    <purpose>Targeted follow-up for operational concerns</purpose>
  </step4>
</workflow>
```

**Expected Outcome**: Technical architecture report with 15-25 citations, consensus across multiple models, specific implementation guidance

---

### 2. **Market Intelligence & Competitive Analysis**

#### **Domain**: Business Intelligence & Market Research  
#### **Problem**: Gathering competitive landscape and trend analysis
#### **Research Strategy**: Async processing with knowledge base integration

```xml
<workflow>
  <step1 tool="get_past_research">
    <params>{ "query": "AI market competitive analysis", "limit": 5 }</params>
    <purpose>Leverage existing knowledge base</purpose>
  </step1>
  
  <step2 tool="submit_research">
    <params>{ 
      "query": "AI SaaS market competitive landscape Q3 2025: key players, market share, pricing strategies",
      "costPreference": "low",
      "outputFormat": "briefing",
      "audienceLevel": "intermediate"
    }</params>
    <purpose>Async comprehensive market research</purpose>
  </step2>
  
  <step3 tool="get_job_status" repeat="true">
    <params>{ "job_id": "[returned_job_id]" }</params>
    <purpose>Monitor progress with event streaming</purpose>
  </step3>
  
  <step4 tool="rate_research_report">
    <params>{ "reportId": "[final_report_id]", "rating": 5, "comment": "Excellent market analysis" }</params>
    <purpose>Quality feedback for continuous improvement</purpose>
  </step4>
</workflow>
```

**Expected Outcome**: Market intelligence briefing with competitive positioning, trend analysis, and actionable insights

---

### 3. **Creative Strategy & Innovation Research**

#### **Domain**: Design Thinking & Creative Solutions
#### **Problem**: Developing innovative approaches and creative strategies
#### **Research Strategy**: High-cost models for creative reasoning with multimodal analysis

```xml
<workflow>
  <step1 tool="list_models">
    <params>{ "refresh": false }</params>
    <purpose>Identify available creative and vision-capable models</purpose>
  </step1>
  
  <step2 tool="conduct_research">
    <params>{ 
      "query": "Innovative UX design patterns for AI interfaces: emerging trends and user psychology",
      "costPreference": "high",
      "audienceLevel": "expert",
      "outputFormat": "report"
    }</params>
    <purpose>High-quality creative analysis with sophisticated models</purpose>
  </step2>
  
  <step3 tool="search" parallel="true">
    <params>{ "q": "UX design AI interfaces", "scope": "reports", "rerank": true }</params>
    <purpose>Cross-reference with existing research for synthesis</purpose>
  </step3>
  
  <step4 tool="research_follow_up">
    <params>{ 
      "originalQuery": "AI interface UX patterns",
      "followUpQuestion": "How do these patterns apply specifically to conversational AI and voice interfaces?"
    }</params>
    <purpose>Targeted refinement for specific implementation domains</purpose>
  </step4>
</workflow>
```

**Expected Outcome**: Creative strategy recommendations with design principles, user psychology insights, and implementation guidelines

---

### 4. **Multimodal Research & Vision Analysis**

#### **Domain**: Visual Data Analysis & Multimodal Intelligence
#### **Problem**: Analyzing charts, diagrams, and visual content with contextual research
#### **Research Strategy**: Vision-capable models with document integration

```xml
<workflow>
  <step1 tool="conduct_research">
    <params>{ 
      "query": "Analyze the data visualization trends and explain statistical significance",
      "images": [{ "url": "data:image/png;base64,[chart_data]", "detail": "high" }],
      "costPreference": "low",
      "audienceLevel": "expert",
      "includeSources": true
    }</params>
    <purpose>Vision-assisted analysis with statistical interpretation</purpose>
  </step1>
  
  <step2 tool="search_web">
    <params>{ "query": "data visualization best practices statistical significance 2025" }</params>
    <purpose>Gather authoritative sources on visualization principles</purpose>
  </step2>
  
  <step3 tool="fetch_url">
    <params>{ "url": "[top_statistical_source]" }</params>
    <purpose>Deep-dive into statistical methodology</purpose>
  </step3>
  
  <step4 tool="conduct_research">
    <params>{ 
      "query": "Synthesize findings: chart analysis + statistical methodology + best practices",
      "textDocuments": ["statistical_methodology_content"],
      "costPreference": "low"
    }</params>
    <purpose>Comprehensive synthesis combining visual and textual analysis</purpose>
  </step4>
</workflow>
```

**Expected Outcome**: Detailed visual analysis report with statistical validation and methodology recommendations

---

### 5. **Knowledge Base Management & Quality Assurance**

#### **Domain**: Information Management & Research Quality
#### **Problem**: Maintaining research quality and leveraging historical insights
#### **Research Strategy**: Database-driven research with quality controls

```xml
<workflow>
  <step1 tool="db_health">
    <purpose>Verify system readiness and database integrity</purpose>
  </step1>
  
  <step2 tool="search">
    <params>{ "q": "artificial intelligence ethics", "scope": "reports", "k": 10, "rerank": true }</params>
    <purpose>Semantic search of existing knowledge base</purpose>
  </step2>
  
  <step3 tool="get_past_research">
    <params>{ "query": "AI ethics frameworks", "limit": 5, "minSimilarity": 0.7 }</params>
    <purpose>Retrieve relevant past research for context</purpose>
  </step3>
  
  <step4 tool="conduct_research">
    <params>{ 
      "query": "AI ethics frameworks: current standards, regulatory developments, implementation challenges",
      "costPreference": "low",
      "audienceLevel": "intermediate"
    }</params>
    <purpose>New research building on existing knowledge</purpose>
  </step4>
  
  <step5 tool="backup_db">
    <params>{ "destinationDir": "./backups" }</params>
    <purpose>Preserve research artifacts</purpose>
  </step5>
</workflow>
```

**Expected Outcome**: Well-grounded research report leveraging institutional knowledge with data integrity assurance

---

### 6. **Cost-Optimized High-Volume Research**

#### **Domain**: Efficient Research Operations
#### **Problem**: Processing multiple research queries with minimal cost
#### **Research Strategy**: Intelligent model routing with caching optimization

```xml
<workflow>
  <step1 tool="list_models">
    <params>{ "refresh": true }</params>
    <purpose>Get current model availability and pricing</purpose>
  </step1>
  
  <step2 tool="query" iterative="true">
    <params>{ 
      "sql": "SELECT query, report_id FROM research_reports WHERE created_at > NOW() - INTERVAL '7 days' ORDER BY created_at DESC LIMIT 10"
    }</params>
    <purpose>Identify recent research patterns for cache optimization</purpose>
  </step2>
  
  <step3 tool="submit_research" batch="true">
    <params>{ 
      "query": "[bulk_research_topics]",
      "costPreference": "low",
      "outputFormat": "bullet_points"
    }</params>
    <purpose>Async batch processing with cost-effective models</purpose>
  </step3>
  
  <step4 tool="reindex_vectors">
    <purpose>Optimize search performance for future queries</purpose>
  </step4>
</workflow>
```

**Expected Outcome**: High-volume research processing with 60-80% cost savings through intelligent caching and model selection

---

## 🛠 **Advanced Integration Patterns**

### **Pattern A: Iterative Deep-Dive Research**
```mcp
# Step 1: Initial broad research
conduct_research { "query": "blockchain scalability solutions", "costPreference": "low" }

# Step 2: Follow-up on specific findings  
research_follow_up { "originalQuery": "blockchain scalability", "followUpQuestion": "How does sharding compare to layer-2 solutions?" }

# Step 3: Cross-reference with knowledge base
search { "q": "blockchain sharding layer-2", "scope": "reports", "rerank": true }

# Step 4: Final synthesis
conduct_research { "query": "Synthesize comprehensive blockchain scalability analysis", "textDocuments": ["previous_research"] }
```

### **Pattern B: Multimodal Evidence Synthesis**  
```mcp
# Step 1: Vision analysis
conduct_research { 
  "query": "Analyze market data charts and explain trends",
  "images": [{"url": "data:image/png;base64,...", "detail": "high"}],
  "costPreference": "low"
}

# Step 2: Document integration
conduct_research {
  "query": "Correlate visual analysis with financial reports", 
  "textDocuments": [{"name": "q3_report.pdf", "content": "..."}],
  "structuredData": [{"name": "metrics.csv", "type": "csv", "content": "..."}]
}
```

### **Pattern C: Quality-Controlled Research Pipeline**
```mcp
# Step 1: Health check
db_health

# Step 2: Research execution
submit_research { "query": "AI safety alignment research 2025", "costPreference": "high" }

# Step 3: Quality assessment  
rate_research_report { "reportId": "[report_id]", "rating": 4, "comment": "Good coverage, needs more recent sources" }

# Step 4: Knowledge preservation
backup_db { "destinationDir": "./backups" }
```

---

## 📊 **Cost Optimization Guidelines**

### **Model Selection Matrix**
| Query Type | Recommended Models | Cost/Token | Use Case |
|------------|-------------------|------------|----------|
| **Simple Factual** | `deepseek/deepseek-chat-v3.1` | $0.0000002 | Quick lookups, basic Q&A |
| **Code Analysis** | `qwen/qwen3-coder` | $0.0000002 | Technical documentation, code review |
| **Vision Tasks** | `z-ai/glm-4.5v` | $0.0000005 | Chart analysis, image interpretation |
| **Complex Reasoning** | `x-ai/grok-4` | $0.000003 | Multi-step analysis, strategic planning |
| **Code Editing** | `morph/morph-v3-large` | $0.0000009 | Fast code edits at 4500+ tokens/sec |

### **Caching Strategy**
- **Result Caching**: 2-hour TTL with 85% similarity threshold
- **Model Caching**: 1-hour TTL for repeated model responses
- **Knowledge Base**: Automatic indexing of all research outputs
- **Cost Savings**: 60-80% reduction through intelligent caching

---

## 🔗 **Tool Chaining Best Practices**

### **Health & Resilience Patterns**
```xml
<best_practices>
  <health_monitoring>
    <step tool="get_server_status" frequency="startup" />
    <step tool="db_health" frequency="daily" />
    <step tool="list_models" frequency="weekly" refresh="true" />
  </health_monitoring>
  
  <error_recovery>
    <step tool="get_job_status" condition="async_research" />
    <step tool="cancel_job" condition="timeout_exceeded" />
    <step tool="backup_db" condition="before_major_operations" />
  </error_recovery>
  
  <quality_assurance>
    <step tool="get_past_research" purpose="context_validation" />
    <step tool="rate_research_report" purpose="feedback_loop" />
    <step tool="export_reports" purpose="audit_trail" />
  </quality_assurance>
</best_practices>
```

### **Iterative Refinement Pattern**
```mcp
# Initial broad research
submit_research { "query": "AI alignment research", "costPreference": "low" }

# Monitor progress
get_job_status { "job_id": "[job_id]" }

# Targeted follow-up based on initial findings
research_follow_up { 
  "originalQuery": "AI alignment research",
  "followUpQuestion": "What are the most promising current approaches to the alignment problem?"
}

# Cross-validate with existing knowledge
search { "q": "AI alignment approaches", "scope": "reports", "rerank": true }

# Quality feedback
rate_research_report { "reportId": "[report_id]", "rating": 5, "comment": "Excellent comprehensive analysis" }
```

---

## 🎯 **Manual Workflow Templates**

For platforms without MCP prompt support, use these structured templates:

### **Template 1: Competitive Intelligence**
```
1. Initial Search: search_web { "query": "[company/product] competitive analysis 2025" }
2. Source Verification: fetch_url { "url": "[credible_source]" }  
3. Comprehensive Research: conduct_research { "query": "[detailed_analysis_prompt]", "textDocuments": ["source_content"] }
4. Follow-up Analysis: research_follow_up { "originalQuery": "[original]", "followUpQuestion": "[specific_aspect]" }
5. Quality Control: rate_research_report { "reportId": "[id]", "rating": [1-5] }
```

### **Template 2: Technical Deep-Dive**
```
1. Model Selection: list_models (identify technical/coding capable models)
2. Initial Research: conduct_research { "costPreference": "high", "audienceLevel": "expert" }
3. Knowledge Integration: search { "scope": "reports", "rerank": true }
4. Iterative Refinement: research_follow_up (2-3 iterations)
5. Documentation: backup_db (preserve findings)
```

### **Template 3: Cost-Effective Bulk Research**
```
1. Health Check: db_health + get_server_status
2. Batch Processing: submit_research (multiple async jobs)
3. Progress Monitoring: get_job_status (polling strategy)
4. Result Compilation: get_report_content (batch retrieval)
5. Quality Assessment: rate_research_report (feedback loop)
```

---

## 💡 **Advanced Strategies**

### **Semantic Caching Optimization**
- Use `search` tool before `conduct_research` to check for similar past work
- Set `similarity threshold = 0.85` to balance freshness vs cost savings
- Implement automatic cache warming for frequently researched topics

### **Model Selection Intelligence**
- **Simple queries** → `deepseek/deepseek-chat-v3.1` (ultra-low cost)
- **Vision tasks** → `z-ai/glm-4.5v` (multimodal capability)  
- **Code analysis** → `qwen/qwen3-coder` (specialized for technical content)
- **Complex reasoning** → `x-ai/grok-4` (advanced reasoning capabilities)
- **Code editing** → `morph/morph-v3-large` (4500+ tokens/sec edits)

### **Quality Assurance Framework**
- **Pre-research**: Check `get_past_research` for context
- **During research**: Monitor via `get_job_status` for async jobs
- **Post-research**: Use `rate_research_report` for continuous improvement
- **Maintenance**: Regular `backup_db` and `reindex_vectors` operations

---

## 🔧 **Production Deployment Checklist**

### **Configuration Verification**
- [ ] `OPENROUTER_API_KEY` configured
- [ ] `SERVER_API_KEY` for HTTP transport  
- [ ] `INDEXER_ENABLED=true` for knowledge base
- [ ] `MCP_ENABLE_PROMPTS=true` and `MCP_ENABLE_RESOURCES=true`
- [ ] Cost optimization models configured in environment

### **Health Monitoring**
- [ ] `db_health` confirms database operational
- [ ] `get_server_status` shows all systems ready
- [ ] `list_models` returns comprehensive catalog
- [ ] Sample `conduct_research` executes successfully

### **Performance Optimization**
- [ ] Caching strategies enabled and configured
- [ ] Parallelism tuned for infrastructure (default: 4)
- [ ] Model selection algorithms validated
- [ ] Cost thresholds appropriate for use case

---

*Use these patterns as building blocks for sophisticated research workflows. Each pattern is designed for production reliability with comprehensive error handling and quality controls.*
