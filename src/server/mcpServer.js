// src/server/mcpServer.js
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const express = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid'); // Import uuid for connection IDs
const config = require('../../config');
const { 
  // Schemas
  conductResearchSchema,
  researchFollowUpSchema,
  getPastResearchSchema,
  rateResearchReportSchema,
  listResearchHistorySchema,
  getReportContentSchema,
  getServerStatusSchema, // Import schema for status tool
  executeSqlSchema, // Import schema for SQL tool
  listModelsSchema, // New: schema for listing models
  submitResearchSchema,
  searchSchema,
  querySchema,
  exportReportsSchema,
  importReportsSchema,
  backupDbSchema,
  dbHealthSchema,
  reindexVectorsSchema,
  searchWebSchema,
  fetchUrlSchema,
  indexTextsSchema,
  indexUrlSchema,
  searchIndexSchema,
  indexStatusSchema,
  
  // Functions
  conductResearch,
  researchFollowUp,
  getPastResearch,
  rateResearchReport,
  listResearchHistory,
  getReportContent,
  getServerStatus, // Import function for status tool
  executeSql, // Import function for SQL tool
  listModels, // New: function for listing models
  submitResearch,
  searchTool,
  queryTool,
  getJobStatusSchema,
  cancelJobSchema,
  getJobStatusTool,
  cancelJobTool,
  exportReports,
  importReports,
  backupDb,
  dbHealth,
  reindexVectorsTool,
  searchWeb,
  fetchUrl,
  index_texts,
  index_url,
  search_index,
  index_status
} = require('./tools');
const dbClient = require('../utils/dbClient'); // Import dbClient
const cors = require('cors');

// Create MCP server with proper capabilities declaration per latest MCP spec
const server = new McpServer({
  name: config.server.name,
  version: config.server.version,
  capabilities: {
    tools: {},
    prompts: {
      listChanged: true // Notify clients when prompt list changes
    },
    resources: {
      subscribe: true, // Support resource subscriptions
      listChanged: true // Notify clients when resource list changes
    }
  }
});

// Register prompts using latest MCP spec with proper protocol handlers
if (config.mcp?.features?.prompts) {
  const prompts = new Map([
    ['planning_prompt', {
      name: 'planning_prompt',
      description: 'Generate sophisticated multi-agent research plan using advanced XML tagging and domain-aware query decomposition',
      arguments: [
        { name: 'query', description: 'Research query to decompose into specialized sub-queries', required: true },
        { name: 'domain', description: 'Primary domain: general, technical, reasoning, search, creative', required: false },
        { name: 'complexity', description: 'Query complexity: simple, moderate, complex', required: false },
        { name: 'maxAgents', description: 'Maximum number of research agents (1-10)', required: false }
      ]
    }],
    ['synthesis_prompt', {
      name: 'synthesis_prompt', 
      description: 'Synthesize ensemble research results with rigorous citation framework and confidence scoring',
      arguments: [
        { name: 'query', description: 'Original research query for synthesis context', required: true },
        { name: 'results', description: 'JSON string of research results to synthesize', required: true },
        { name: 'outputFormat', description: 'Output format: report, briefing, bullet_points', required: false },
        { name: 'audienceLevel', description: 'Target audience: beginner, intermediate, expert', required: false }
      ]
    }],
    ['research_workflow_prompt', {
      name: 'research_workflow_prompt',
      description: 'Complete research workflow: planning → parallel execution → synthesis with quality controls',
      arguments: [
        { name: 'topic', description: 'Research topic or question', required: true },
        { name: 'costBudget', description: 'Cost preference: low, high', required: false },
        { name: 'async', description: 'Use async job processing: true, false', required: false }
      ]
    }]
  ]);

  server.setPromptRequestHandlers({
    list: async () => ({ prompts: Array.from(prompts.values()) }),
    get: async (request) => {
      const prompt = prompts.get(request.params.name);
      if (!prompt) throw new Error(`Prompt not found: ${request.params.name}`);
      
      const { query, domain, complexity, maxAgents, results, outputFormat, audienceLevel, topic, costBudget, async } = request.params.arguments || {};
      
      switch (request.params.name) {
        case 'planning_prompt':
    const p = require('../agents/planningAgent');
          const planResult = await p.planResearch(query, { domain, complexity, maxAgents }, null, 'prompt');
          return { 
            description: prompt.description,
            messages: [{ role: 'assistant', content: planResult }] 
          };
          
        case 'synthesis_prompt':
    const c = require('../agents/contextAgent');
          let synthesisResult = '';
          for await (const ch of c.contextualizeResultsStream(query, JSON.parse(results), [], { 
            includeSources: true, 
            outputFormat: outputFormat || 'report',
            audienceLevel: audienceLevel || 'intermediate'
          }, 'prompt')) {
            if (ch.content) synthesisResult += ch.content;
          }
          return { 
            description: prompt.description,
            messages: [{ role: 'assistant', content: synthesisResult }] 
          };
          
        case 'research_workflow_prompt':
          const workflowGuide = `
# Research Workflow for: ${topic}

## 1. Planning Phase
\`\`\`mcp
planning_prompt { "query": "${topic}", "domain": "auto-detect", "complexity": "auto-assess" }
\`\`\`

## 2. Research Execution
${async === 'true' ? `
\`\`\`mcp
submit_research { "query": "${topic}", "costPreference": "${costBudget || 'low'}" }
get_job_status { "job_id": "[returned_job_id]" }
\`\`\`
` : `
\`\`\`mcp
conduct_research { "query": "${topic}", "costPreference": "${costBudget || 'low'}" }
\`\`\`
`}

## 3. Quality Assurance
\`\`\`mcp
get_past_research { "query": "${topic}", "limit": 5 }
search { "q": "${topic}", "scope": "reports" }
\`\`\`

## 4. Follow-up Analysis
\`\`\`mcp
research_follow_up { "originalQuery": "${topic}", "followUpQuestion": "[your_specific_question]" }
\`\`\`
          `;
          return {
            description: prompt.description,
            messages: [{ role: 'assistant', content: workflowGuide }]
          };
          
        default:
          throw new Error(`Unknown prompt: ${request.params.name}`);
      }
    }
  });
}

// Register resources using latest MCP spec with proper protocol handlers and URI templates
if (config.mcp?.features?.resources) {
  const resources = new Map([
    ['mcp://specs/core', {
      uri: 'mcp://specs/core',
      name: 'MCP Core Specification',
      description: 'Canonical Model Context Protocol specification links and references',
    mimeType: 'application/json'
    }],
    ['mcp://patterns/workflows', {
      uri: 'mcp://patterns/workflows', 
      name: 'Research Workflow Patterns',
      description: 'Sophisticated tool chaining patterns for multi-agent research orchestration',
    mimeType: 'application/json'
    }],
    ['mcp://examples/multimodal', {
      uri: 'mcp://examples/multimodal',
      name: 'Multimodal Research Examples',
      description: 'Advanced examples for vision-capable research with dynamic model routing',
    mimeType: 'application/json'
    }],
    ['mcp://use-cases/domains', {
      uri: 'mcp://use-cases/domains',
      name: 'Domain-Specific Use Cases',
      description: 'Comprehensive use cases across technical, creative, and analytical domains',
      mimeType: 'application/json'
    }],
    ['mcp://optimization/caching', {
      uri: 'mcp://optimization/caching',
      name: 'Caching & Cost Optimization',
      description: 'Advanced caching strategies and cost-effective model selection patterns',
      mimeType: 'application/json'
    }]
  ]);

  // Helper function to generate domain-specific use cases
  const generateDomainUseCases = async () => {
    return {
      technical_research: {
        domain: "Technical Analysis",
        problem: "Understanding complex system architectures and implementation patterns",
        workflow: {
          step1: { tool: "search_web", params: { query: "microservices architecture patterns 2025" } },
          step2: { tool: "fetch_url", params: { url: "authoritative_source_url" } },
          step3: { tool: "conduct_research", params: { query: "Compare microservices vs monolithic architectures", textDocuments: ["fetched_content"] } },
          step4: { tool: "research_follow_up", params: { originalQuery: "architecture comparison", followUpQuestion: "What are the security implications?" } }
        },
        expected_outcome: "Comprehensive technical analysis with authoritative citations"
      },
      business_intelligence: {
        domain: "Market Research & Analysis", 
        problem: "Gathering competitive intelligence and market trends",
        workflow: {
          step1: { tool: "search_web", params: { query: "AI market trends Q3 2025" } },
          step2: { tool: "submit_research", params: { query: "AI market competitive landscape analysis", costPreference: "low" } },
          step3: { tool: "get_job_status", params: { job_id: "monitor_async_job" } },
          step4: { tool: "get_past_research", params: { query: "AI market", limit: 3 } }
        },
        expected_outcome: "Market intelligence report with trend analysis and competitive positioning"
      },
      creative_synthesis: {
        domain: "Creative Content & Strategy",
        problem: "Developing innovative solutions and creative strategies",  
        workflow: {
          step1: { tool: "conduct_research", params: { query: "innovative UX design patterns 2025", costPreference: "high" } },
          step2: { tool: "search", params: { q: "UX design", scope: "reports" } },
          step3: { tool: "research_follow_up", params: { originalQuery: "UX patterns", followUpQuestion: "How do these apply to AI interfaces?" } }
        },
        expected_outcome: "Creative strategy recommendations with design inspiration"
      }
    };
  };

  server.setResourceRequestHandlers({
    list: async () => ({ resources: Array.from(resources.values()) }),
    read: async (request) => {
      const uri = request.params.uri;
      const resource = resources.get(uri);
      if (!resource) throw new Error(`Resource not found: ${uri}`);
      
      let content;
      switch (uri) {
        case 'mcp://specs/core':
          content = {
            spec: 'https://spec.modelcontextprotocol.io/specification/2025-03-26/',
            jsonrpc: 'https://www.jsonrpc.org/specification',
            org: 'https://github.com/modelcontextprotocol',
            docs: 'https://modelcontextprotocol.io/',
            sdk: 'https://github.com/modelcontextprotocol/sdk',
            implementations: {
              openrouter_agents: 'https://github.com/wheattoast11/openrouter-deep-research',
              anthropic_examples: 'https://github.com/modelcontextprotocol/servers'
            }
          };
          break;
          
        case 'mcp://patterns/workflows':
          content = {
            basic_patterns: [
              {
                name: 'Search → Fetch → Research',
                steps: ['search_web { query }', 'fetch_url { url }', 'conduct_research { query, textDocuments:[content] }'],
                use_case: 'Web research with source verification'
              },
              {
                name: 'Knowledge Base Query → Research',
                steps: ['search { q, scope:"reports" }', 'get_past_research { query }', 'conduct_research { query }'],
                use_case: 'Building on previous research'
              },
              {
                name: 'Async Research Pipeline',
                steps: ['submit_research { query }', 'get_job_status { job_id }', 'get_report_content { reportId }'],
                use_case: 'Long-running comprehensive research'
              }
            ],
            advanced_patterns: [
              {
                name: 'Multimodal Research Chain',
                steps: ['conduct_research { query, images:[...] }', 'research_follow_up { originalQuery, followUpQuestion }'],
                use_case: 'Vision-assisted analysis with iterative refinement'
              },
              {
                name: 'Cost-Optimized Research',
                steps: ['list_models', 'conduct_research { query, costPreference:"low" }', 'rate_research_report'],
                use_case: 'Budget-conscious research with quality feedback'
              }
            ]
          };
          break;
          
        case 'mcp://examples/multimodal':
          content = {
            vision_research: {
              conduct_research: {
                query: 'Analyze the technical architecture diagram and explain the data flow patterns',
                images: [{ url: 'data:image/png;base64,...', detail: 'high' }],
                costPreference: 'low',
                audienceLevel: 'expert'
              }
            },
            document_analysis: {
              conduct_research: {
                query: 'Synthesize key findings from the research papers',
                textDocuments: [{ name: 'paper1.pdf', content: '...' }],
                structuredData: [{ name: 'results.csv', type: 'csv', content: 'metric,value\\n...' }]
              }
            }
          };
          break;
          
        case 'mcp://use-cases/domains':
          content = await generateDomainUseCases();
          break;
          
        case 'mcp://optimization/caching':
          content = {
            strategies: {
              result_caching: {
                description: 'Cache research results with semantic similarity matching',
                ttl_seconds: 3600,
                implementation: 'In-memory NodeCache + PGLite semantic search'
              },
              model_routing: {
                description: 'Route queries to cost-effective models based on complexity',
                models: {
                  simple: ['deepseek/deepseek-chat-v3.1', 'qwen/qwen3-coder'],
                  complex: ['x-ai/grok-4', 'morph/morph-v3-large'],
                  vision: ['z-ai/glm-4.5v', 'google/gemini-2.5-flash']
                }
              },
              batch_processing: {
                description: 'Process multiple queries in parallel with bounded concurrency',
                parallelism: 4,
                cost_savings: '60-80% through efficient resource utilization'
              }
            }
          };
          break;
          
        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
      
      return {
        contents: [{
          uri: resource.uri,
          mimeType: resource.mimeType,
          text: JSON.stringify(content, null, 2)
        }]
      };
    }
  });
}

// Register tools
   // Async submit_research
   server.tool(
     "submit_research",
     { ...submitResearchSchema.shape, _title: z.string().optional().default('Submit async research job'), _readOnlyHint: z.boolean().optional().default(false), _destructiveHint: z.boolean().optional().default(false) },
     async (params, exchange) => {
       try {
         const text = await submitResearch(params, exchange, `req-${Date.now()}`);
         return { content: [{ type: 'text', text }] };
       } catch (e) {
         return { content: [{ type: 'text', text: `Error submit_research: ${e.message}` }], isError: true };
       }
     }
   );

   // Job status/cancel
   server.tool(
     "get_job_status",
     getJobStatusSchema.shape,
     async (params) => {
       try { const text = await getJobStatusTool(params); return { content: [{ type: 'text', text }] }; }
       catch (e) { return { content: [{ type: 'text', text: `Error get_job_status: ${e.message}` }], isError: true }; }
     }
   );
   server.tool(
     "cancel_job",
     cancelJobSchema.shape,
     async (params) => {
       try { const text = await cancelJobTool(params); return { content: [{ type: 'text', text }] }; }
       catch (e) { return { content: [{ type: 'text', text: `Error cancel_job: ${e.message}` }], isError: true }; }
     }
   );

   // Unified search
   server.tool(
     "search",
     { ...searchSchema.shape, _title: z.string().optional().default('Hybrid search (BM25+vector)'), _readOnlyHint: z.boolean().optional().default(true), _destructiveHint: z.boolean().optional().default(false) },
     async (params, exchange) => {
       try { const text = await searchTool(params, exchange, `req-${Date.now()}`); return { content: [{ type: 'text', text }] }; }
       catch (e) { return { content: [{ type: 'text', text: `Error search: ${e.message}` }], isError: true }; }
     }
   );

   // Guarded query
   server.tool(
     "query",
     { ...querySchema.shape, _title: z.string().optional().default('SQL (read-only)'), _readOnlyHint: z.boolean().optional().default(true), _destructiveHint: z.boolean().optional().default(false) },
     async (params, exchange) => {
       try { const text = await queryTool(params, exchange, `req-${Date.now()}`); return { content: [{ type: 'text', text }] }; }
       catch (e) { return { content: [{ type: 'text', text: `Error query: ${e.message}` }], isError: true }; }
     }
   );
   // The second argument to the tool handler is the exchange context from the SDK
   server.tool(
     "conduct_research",
     { ...conductResearchSchema.shape, _title: z.string().optional().default('Conduct research (streamed)'), _readOnlyHint: z.boolean().optional().default(false), _destructiveHint: z.boolean().optional().default(false) },
     async (params, exchange) => { 
        const startTime = Date.now();
        const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`; // Simple request ID
        console.error(`[${new Date().toISOString()}] [${requestId}] conduct_research: Starting research for query "${params.query.substring(0, 50)}..."`); 
        console.error(`[${new Date().toISOString()}] [${requestId}] conduct_research: Parameters: costPreference=${params.costPreference}, format=${params.outputFormat}, audience=${params.audienceLevel}`); 
        try {
          // Pass the exchange context and requestId to conductResearch
          const result = await conductResearch(params, exchange, requestId); 
          const duration = Date.now() - startTime;
          console.error(`[${new Date().toISOString()}] [${requestId}] conduct_research: Research stream finished successfully in ${duration}ms.`); 
          // Return the final confirmation message (which now includes the report ID)
          return {
         content: [{
          type: 'text',
          text: result // e.g., "Research complete. Results streamed. Report ID: 6..."
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] conduct_research: Error after ${duration}ms. Query: "${params.query.substring(0, 50)}...". Error:`, error);
      return {
        content: [{
          type: 'text',
          text: `Error conducting research for query "${params.query.substring(0, 50)}...": ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register follow-up research tool
server.tool(
  "research_follow_up",
  { ...researchFollowUpSchema.shape, _title: z.string().optional().default('Follow-up research'), _readOnlyHint: z.boolean().optional().default(false), _destructiveHint: z.boolean().optional().default(false) },
  async (params, exchange) => {
    const startTime = Date.now();
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "research_follow_up";
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Starting follow-up for original query "${params.originalQuery.substring(0, 50)}..."`);
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Follow-up question: "${params.followUpQuestion.substring(0, 50)}..."`);
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Parameters: costPreference=${params.costPreference}`);
    
    try {
      // Call researchFollowUp from tools.js, passing requestId
      const result = await researchFollowUp(params, exchange, requestId); 
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Follow-up research completed in ${duration}ms.`);
      
      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return {
        content: [{
          type: 'text',
          text: `Error conducting follow-up research: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register tool to retrieve past research reports
server.tool(
  "get_past_research",
  { ...getPastResearchSchema.shape, _title: z.string().optional().default('Find similar past research'), _readOnlyHint: z.boolean().optional().default(true), _destructiveHint: z.boolean().optional().default(false) },
  async (params, exchange) => {
    const startTime = Date.now();
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "get_past_research";
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Searching for similar past reports for query "${params.query ? params.query.substring(0, 50) : 'N/A'}..."`);
    
    try {
      // Call getPastResearch from tools.js, passing requestId
      const result = await getPastResearch(params, exchange, requestId); 
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Search completed in ${duration}ms.`);
      
      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving past research: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register tool to rate a past research report
server.tool(
  "rate_research_report",
  { ...rateResearchReportSchema.shape, _title: z.string().optional().default('Rate a research report'), _readOnlyHint: z.boolean().optional().default(false), _destructiveHint: z.boolean().optional().default(false) },
  async (params, exchange) => {
    const startTime = Date.now();
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "rate_research_report";
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Processing rating ${params.rating} for report ${params.reportId}`);
    
    try {
      // Call rateResearchReport from tools.js, passing requestId
      const result = await rateResearchReport(params, exchange, requestId); 
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Rating processed in ${duration}ms.`);
      
      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return {
        content: [{
          type: 'text',
          text: `Error recording feedback: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register tool to list recent research reports
server.tool(
  "list_research_history",
  { ...listResearchHistorySchema.shape, _title: z.string().optional().default('List recent research reports'), _readOnlyHint: z.boolean().optional().default(true), _destructiveHint: z.boolean().optional().default(false) },
  async (params, exchange) => {
    const startTime = Date.now();
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "list_research_history";
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Listing recent reports (limit: ${params.limit}, filter: "${params.queryFilter || 'None'}")`);
    
    try {
      // Call listResearchHistory from tools.js, passing requestId
      const result = await listResearchHistory(params, exchange, requestId); 
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Listing completed in ${duration}ms.`);
      
      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving research history: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register tool to retrieve specific report content by ID
server.tool(
  "get_report_content",
  { ...getReportContentSchema.shape, _title: z.string().optional().default('Get report content'), _readOnlyHint: z.boolean().optional().default(true), _destructiveHint: z.boolean().optional().default(false) },
  async (params, exchange) => {
    const startTime = Date.now();
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "get_report_content";
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Retrieving content for report ID ${params.reportId}`);
    
    try {
      // Call getReportContent from tools.js, passing requestId
      const result = await getReportContent(params, exchange, requestId); 
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Retrieval completed in ${duration}ms.`);
      
      // Return the report content directly
      return {
        content: [{
          type: 'text',
          text: result // This is the report content string
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving report content: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register tool to get server status
server.tool(
  "get_server_status",
  { ...getServerStatusSchema.shape, _title: z.string().optional().default('Get server status'), _readOnlyHint: z.boolean().optional().default(true), _destructiveHint: z.boolean().optional().default(false) },
  async (params, exchange) => {
    const startTime = Date.now();
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "get_server_status";
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Request received.`);

    try {
      // Call getServerStatus from tools.js, passing requestId
      const result = await getServerStatus(params, exchange, requestId);
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Status retrieval completed in ${duration}ms.`);

      return {
        content: [{
          type: 'text',
          text: result // This is the status JSON string
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving server status: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register tool to execute SQL queries
server.tool(
  "execute_sql",
  { ...executeSqlSchema.shape, _title: z.string().optional().default('Execute SELECT SQL'), _readOnlyHint: z.boolean().optional().default(true), _destructiveHint: z.boolean().optional().default(false) },
  async (params, exchange) => {
    const startTime = Date.now();
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "execute_sql";
    // Avoid logging full SQL in production if sensitive
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Attempting to execute SQL (Params: ${params.params?.length ?? 0})`);

    try {
      // Call executeSql from tools.js, passing requestId
      const result = await executeSql(params, exchange, requestId);
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: SQL execution completed in ${duration}ms.`);

      return {
        content: [{
          type: 'text',
          text: result // This is the JSON string of results
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return {
        content: [{
          type: 'text',
          text: `Error executing SQL: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register tool to list available models (dynamic catalog)
server.tool(
  "list_models",
  { ...listModelsSchema.shape, _title: z.string().optional().default('List available models'), _readOnlyHint: z.boolean().optional().default(true), _destructiveHint: z.boolean().optional().default(false) },
  async (params, exchange) => {
    const startTime = Date.now();
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "list_models";
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Request received (refresh=${params.refresh === true}).`);

    try {
      const result = await listModels(params, exchange, requestId);
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Completed in ${duration}ms.`);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return { content: [{ type: 'text', text: `Error listing models: ${error.message}` }], isError: true };
    }
  }
);

// Register DB QoL tools
server.tool(
  "export_reports",
  { ...exportReportsSchema.shape, _title: z.string().optional().default('Export reports'), _readOnlyHint: z.boolean().optional().default(true), _destructiveHint: z.boolean().optional().default(false) },
  async (params, exchange) => {
    const start = Date.now();
    const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
    const toolName = "export_reports";
    try {
      const text = await exportReports(params, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error exporting reports: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "import_reports",
  { ...importReportsSchema.shape, _title: z.string().optional().default('Import reports'), _readOnlyHint: z.boolean().optional().default(false), _destructiveHint: z.boolean().optional().default(true) },
  async (params, exchange) => {
    const start = Date.now();
    const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
    const toolName = "import_reports";
    try {
      const text = await importReports(params, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error importing reports: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "backup_db",
  { ...backupDbSchema.shape, _title: z.string().optional().default('Backup DB (tar.gz)'), _readOnlyHint: z.boolean().optional().default(false), _destructiveHint: z.boolean().optional().default(false) },
  async (params, exchange) => {
    const start = Date.now();
    const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
    const toolName = "backup_db";
    try {
      const text = await backupDb(params, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error backing up DB: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "db_health",
  { ...dbHealthSchema.shape, _title: z.string().optional().default('Database health'), _readOnlyHint: z.boolean().optional().default(true), _destructiveHint: z.boolean().optional().default(false) },
  async (params, exchange) => {
    const start = Date.now();
    const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
    const toolName = "db_health";
    try {
      const text = await dbHealth(params, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error getting DB health: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "reindex_vectors",
  { ...reindexVectorsSchema.shape, _title: z.string().optional().default('Reindex vectors (HNSW)'), _readOnlyHint: z.boolean().optional().default(false), _destructiveHint: z.boolean().optional().default(true) },
  async (params, exchange) => {
    const start = Date.now();
    const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
    const toolName = "reindex_vectors";
    try {
      const text = await reindexVectorsTool(params, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error reindexing vectors: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "search_web",
  { ...searchWebSchema.shape, _title: z.string().optional().default('Quick web search'), _readOnlyHint: z.boolean().optional().default(true), _destructiveHint: z.boolean().optional().default(false) },
  async (params, exchange) => {
    const start = Date.now();
    const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
    const toolName = "search_web";
    try {
      const text = await searchWeb(params, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error search_web: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "fetch_url",
  { ...fetchUrlSchema.shape, _title: z.string().optional().default('Fetch URL (text/html)'), _readOnlyHint: z.boolean().optional().default(true), _destructiveHint: z.boolean().optional().default(false) },
  async (params, exchange) => {
    const start = Date.now();
    const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
    const toolName = "fetch_url";
    try {
      const text = await fetchUrl(params, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error fetch_url: ${e.message}` }], isError: true };
    }
  }
);

// Optional Indexer tools
if (require('../../config').indexer?.enabled) {
  server.tool(
    "index_texts",
    { ...indexTextsSchema.shape, _title: z.string().optional().default('Index text documents'), _readOnlyHint: z.boolean().optional().default(false), _destructiveHint: z.boolean().optional().default(true) },
    async (params, exchange) => {
      const start = Date.now();
      const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
      try { const text = await index_texts(params, exchange, requestId); return { content: [{ type: 'text', text }] }; }
      catch (e) { return { content: [{ type: 'text', text: `Error index_texts: ${e.message}` }], isError: true }; }
    }
  );

  server.tool(
    "index_url",
    { ...indexUrlSchema.shape, _title: z.string().optional().default('Index URL content'), _readOnlyHint: z.boolean().optional().default(false), _destructiveHint: z.boolean().optional().default(true) },
    async (params, exchange) => {
      const start = Date.now();
      const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
      try { const text = await index_url(params, exchange, requestId); return { content: [{ type: 'text', text }] }; }
      catch (e) { return { content: [{ type: 'text', text: `Error index_url: ${e.message}` }], isError: true }; }
    }
  );

  server.tool(
    "search_index",
    { ...searchIndexSchema.shape, _title: z.string().optional().default('Search local index'), _readOnlyHint: z.boolean().optional().default(true), _destructiveHint: z.boolean().optional().default(false) },
    async (params, exchange) => {
      const start = Date.now();
      const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
      try { const text = await search_index(params, exchange, requestId); return { content: [{ type: 'text', text }] }; }
      catch (e) { return { content: [{ type: 'text', text: `Error search_index: ${e.message}` }], isError: true }; }
    }
  );

  server.tool(
    "index_status",
    { ...indexStatusSchema.shape, _title: z.string().optional().default('Index status'), _readOnlyHint: z.boolean().optional().default(true), _destructiveHint: z.boolean().optional().default(false) },
    async (params, exchange) => {
      const start = Date.now();
      const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
      try { const text = await index_status(params, exchange, requestId); return { content: [{ type: 'text', text }] }; }
      catch (e) { return { content: [{ type: 'text', text: `Error index_status: ${e.message}` }], isError: true }; }
    }
  );
}
 
 // Set up transports based on environment
 const setupTransports = async () => {
  let lastSseTransport = null; // Variable to hold the last SSE transport
  const sseConnections = new Map(); // Map to store active SSE connections

  // For command-line usage, use STDIO
  if (process.argv.includes('--stdio')) {
    // console.error('Starting MCP server with STDIO transport'); // Commented out: Logs interfere with STDIO JSON-RPC
    const transport = new StdioServerTransport();
    // console.error('Attempting server.connect(transport)...'); // Commented out: Logs interfere with STDIO JSON-RPC
    await server.connect(transport);
    // console.error('server.connect(transport) completed.'); // Commented out: Logs interfere with STDIO JSON-RPC
    return; // Exit after setting up stdio, don't proceed to HTTP setup
  } else { // Only setup HTTP/SSE if --stdio is NOT specified
  // For HTTP usage, set up Express with SSE and optional Streamable HTTP
    const app = express();
    const port = config.server.port;
  // OAuth2/JWT placeholder: use AUTH_JWKS_URL or fallback to API key until configured
  const serverApiKey = config.server.apiKey;
  const jwksUrl = process.env.AUTH_JWKS_URL || null;
  const expectedAudience = process.env.AUTH_EXPECTED_AUD || 'mcp-server';

  app.use(cors({ origin: '*', exposedHeaders: ['Mcp-Session-Id'], allowedHeaders: ['Content-Type', 'authorization', 'mcp-session-id'] }));
  // Enforce HTTPS in production when required
  if (config.server.requireHttps) {
    app.use((req, res, next) => {
      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      if (proto !== 'https') return res.status(400).json({ error: 'HTTPS required' });
      next();
    });
  }
    
  // Authentication Middleware (JWT first, fallback API key if configured)
  const authenticate = async (req, res, next) => {
    const allowNoAuth = process.env.ALLOW_NO_API_KEY === 'true';
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      if (allowNoAuth) return next();
      return res.status(401).json({ error: 'Unauthorized: Missing bearer token' });
    }
    const token = authHeader.split(' ')[1];
    if (jwksUrl) {
      try {
        // Lazy import jose to keep dep optional
        const { createRemoteJWKSet, jwtVerify } = require('jose');
        const JWKS = createRemoteJWKSet(new URL(jwksUrl));
        const { payload } = await jwtVerify(token, JWKS, { audience: expectedAudience });
        if (!payload || (expectedAudience && payload.aud !== expectedAudience && !Array.isArray(payload.aud))) {
          return res.status(403).json({ error: 'Forbidden: invalid token audience' });
        }
        return next();
      } catch (e) {
        if (!serverApiKey) {
          return res.status(403).json({ error: 'Forbidden: JWT verification failed' });
        }
        // Fall through to API key if configured
      }
    }
    if (serverApiKey && token === serverApiKey) return next();
    if (allowNoAuth) return next();
    return res.status(403).json({ error: 'Forbidden: Auth failed' });
  };
 
  console.error(`Starting MCP server with HTTP/SSE transport on port ${port}`); // Use error
  if (jwksUrl) {
    console.error(`[${new Date().toISOString()}] OAuth2/JWT auth ENABLED (JWKS=${jwksUrl}, aud=${expectedAudience}).`);
  } else if (serverApiKey) {
    console.error(`[${new Date().toISOString()}] API key fallback ENABLED for HTTP transport.`);
  } else if (process.env.ALLOW_NO_API_KEY === 'true') {
    console.error(`[${new Date().toISOString()}] SECURITY WARNING: Authentication DISABLED for HTTP transport (ALLOW_NO_API_KEY=true).`); // Use error, keep as warning level
  } else {
    console.error(`[${new Date().toISOString()}] CRITICAL: SERVER_API_KEY not set and ALLOW_NO_API_KEY!=true. HTTP transport may fail.`); // Keep error
  }
  
  // Streamable HTTP transport (preferred) guarded by feature flag
  if (require('../../config').mcp.transport.streamableHttpEnabled) {
    try {
      const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
      app.all('/mcp', authenticate, async (req, res) => {
        const transport = new StreamableHTTPServerTransport({
          enableDnsRebindingProtection: true,
          allowedHosts: ['127.0.0.1', 'localhost'],
          allowedOrigins: ['http://localhost', 'http://127.0.0.1']
        });
        res.on('close', () => transport.close());
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      });
    } catch (e) {
      console.error('StreamableHTTP transport not available:', e.message);
    }
  }

   // Endpoint for SSE - Apply authentication middleware
   // Endpoint for SSE - Apply authentication middleware
   app.get('/sse', authenticate, async (req, res) => {
     const connectionId = uuidv4(); // Generate a unique ID for this connection
     console.error(`[${new Date().toISOString()}] New SSE connection established with ID: ${connectionId}`); // Use error

     // Set headers for SSE
     res.writeHead(200, {
       'Content-Type': 'text/event-stream',
       'Cache-Control': 'no-cache',
       'Connection': 'keep-alive',
     });

     const transport = new SSEServerTransport('/messages', res); // Pass the response object
     sseConnections.set(connectionId, transport); // Store transport keyed by ID
     lastSseTransport = transport; // Keep track of the last one for the simple POST handler

     try {
       await server.connect(transport); // Connect the server to this specific transport
       console.error(`[${new Date().toISOString()}] MCP Server connected to SSE transport for connection ID: ${connectionId}`);
     } catch (error) {
       console.error(`[${new Date().toISOString()}] Error connecting MCP Server to SSE transport for ID ${connectionId}:`, error);
       sseConnections.delete(connectionId); // Clean up on connection error
       if (!res.writableEnded) {
         res.end();
       }
       return; // Stop further processing for this request
     }

     // Handle client disconnect
     req.on('close', () => {
       console.error(`[${new Date().toISOString()}] SSE connection closed for ID: ${connectionId}`);
       sseConnections.delete(connectionId);
       if (lastSseTransport === transport) {
         lastSseTransport = null; // Clear if it was the last one
       }
       // Optionally notify the server instance if needed, though transport might handle this
       // server.disconnect(transport); // If SDK supports targeted disconnect
     });
   });

   // Job events SSE per job id
   app.get('/jobs/:jobId/events', authenticate, async (req, res) => {
     const { jobId } = req.params;
     res.writeHead(200, {
       'Content-Type': 'text/event-stream',
       'Cache-Control': 'no-cache',
       'Connection': 'keep-alive'
     });
     let lastEventId = 0;
     const send = (type, data) => { try { res.write(`event: ${type}\n`); res.write(`data: ${JSON.stringify(data)}\n\n`);} catch(_){} };
     send('open', { ok: true, jobId });
     const timer = setInterval(async () => {
       try {
         const events = await dbClient.getJobEvents(jobId, lastEventId, 200);
         for (const ev of events) { lastEventId = ev.id; send(ev.event_type || 'message', ev); }
         const j = await dbClient.getJobStatus(jobId);
         if (!j || j.status === 'succeeded' || j.status === 'failed' || j.status === 'canceled') {
           send('complete', j || { jobId, status: 'unknown' });
           clearInterval(timer);
           if (!res.writableEnded) res.end();
         }
       } catch (e) {
         send('error', { message: e.message });
       }
     }, 1000);
     req.on('close', () => { clearInterval(timer); });
   });

   // Simple HTTP job submission for testing and automation
   app.post('/jobs', authenticate, express.json(), async (req, res) => {
     try {
       const params = req.body || {};
       const jobId = await dbClient.createJob('research', params);
       await dbClient.appendJobEvent(jobId, 'submitted', { query: params.query || params.q || '' });
       res.json({ job_id: jobId });
     } catch (e) {
       res.status(500).json({ error: e.message });
     }
   });

   // Lightweight JSON metrics
   app.get('/metrics', authenticate, async (req, res) => {
     try {
       const embedderReady = dbClient.isEmbedderReady();
       const dbInitialized = dbClient.isDbInitialized();
       const dbPathInfo = dbClient.getDbPathInfo();
       const rows = await dbClient.executeQuery(`SELECT status, COUNT(*) AS n FROM jobs GROUP BY status`, []);
       const recent = await dbClient.executeQuery(`SELECT id, type, status, created_at, finished_at FROM jobs ORDER BY created_at DESC LIMIT 25`, []);
       // Aggregate usage totals from recent reports
        const usageRows = await dbClient.executeQuery(`SELECT research_metadata FROM reports ORDER BY id DESC LIMIT 200`, []);
        const usageTotals = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        try {
          for (const r of usageRows) {
            const meta = typeof r.research_metadata === 'string' ? JSON.parse(r.research_metadata) : r.research_metadata;
            const t = meta?.usage?.totals; if (!t) continue;
            usageTotals.prompt_tokens += Number(t.prompt_tokens||0);
            usageTotals.completion_tokens += Number(t.completion_tokens||0);
            usageTotals.total_tokens += Number(t.total_tokens||0);
          }
        } catch(_) {}
       res.json({
         time: new Date().toISOString(),
         database: { initialized: dbInitialized, storageType: dbPathInfo },
         embedder: { ready: embedderReady },
         jobs: rows,
         recent,
          usageTotals,
       });
     } catch (e) {
       res.status(500).json({ error: e.message });
     }
   });

   // About endpoint for directory metadata
   app.get('/about', (req, res) => {
     res.json({
       name: config.server.name,
       version: config.server.version,
       author: 'Tej Desai',
       email: 'admin@terminals.tech',
       homepage: 'https://terminals.tech',
       privacy: 'https://terminals.tech/privacy',
       support: 'admin@terminals.tech'
     });
   });

   // Minimal static UI placeholder (can be replaced later)
   app.get('/ui', (req, res) => {
     res.setHeader('Content-Type', 'text/html');
     res.end(`<!doctype html><html><head><meta charset="utf-8"><title>MCP Jobs</title><style>
      :root{--ok:#22c55e;--warn:#f59e0b;--err:#ef4444;--muted:#6b7280;--bg:#0b1220;--card:#0f172a;--fg:#e5e7eb;--chip:#1f2937}
      body{font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
      header{display:flex;gap:8px;align-items:center;padding:12px 16px;background:linear-gradient(180deg,#0b1220,#0b122000)}
      input,button{border-radius:10px;border:1px solid #334155;background:#0b1220;color:var(--fg);padding:8px 10px}
      button{background:#1d4ed8;border-color:#1e40af;cursor:pointer}
      main{display:grid;grid-template-columns: 1.2fr 0.8fr;gap:12px;padding:12px}
      .card{background:var(--card);border:1px solid #1f2a44;border-radius:14px;box-shadow:0 8px 24px #0008;overflow:hidden}
      .title{padding:10px 12px;font-weight:600;border-bottom:1px solid #1f2a44;background:#0b1224}
      .lane{display:flex;flex-direction:column;gap:8px;padding:10px;max-height:64vh;overflow:auto}
      .row{display:flex;align-items:center;gap:8px}
      .chip{background:var(--chip);border:1px solid #374151;padding:2px 8px;border-radius:999px;font-size:12px;color:#cbd5e1}
      .ok{color:var(--ok)}.warn{color:var(--warn)}.err{color:var(--err)}
      .log{white-space:pre-wrap;font-family:ui-monospace,monospace;padding:10px;max-height:64vh;overflow:auto}
     </style></head><body>
      <header>
        <strong>MCP Job Stream</strong>
        <input id="job" placeholder="job_id" style="width:320px">
        <button id="go">Connect</button>
        <span id="status" class="chip">idle</span>
      </header>
      <main>
        <section class="card">
          <div class="title">Agents</div>
          <div class="lane" id="agents"></div>
        </section>
        <section class="card">
          <div class="title">Synthesis</div>
          <div class="log" id="log"></div>
        </section>
      </main>
      <script>
        const logEl=document.getElementById('log');
        const agentsEl=document.getElementById('agents');
        const statusEl=document.getElementById('status');
        const rows=new Map();
        function addAgentRow(id,text,cls){
          let r=rows.get(id);
          if(!r){ r=document.createElement('div'); r.className='row'; r.innerHTML='<span class="chip">agent '+id+'</span><span class="chip" id="st"></span><span id="q" class="muted"></span>'; agentsEl.appendChild(r); rows.set(id,r); }
          r.querySelector('#st').textContent=text; r.querySelector('#st').className='chip '+(cls||'');
        }
        function appendLog(s){ logEl.textContent += s; logEl.scrollTop = logEl.scrollHeight; }
        document.getElementById('go').onclick=()=>{
          logEl.textContent=''; agentsEl.textContent=''; rows.clear(); statusEl.textContent='connecting…';
          const id=document.getElementById('job').value.trim(); if(!id){ alert('enter job id'); return; }
          const es=new EventSource('/jobs/'+id+'/events');
          es.addEventListener('open', e=>{ statusEl.textContent='open'; statusEl.className='chip'; });
          es.addEventListener('progress', e=>{ /* generic progress hook */ });
          es.addEventListener('agent_started', e=>{ const p=JSON.parse(e.data).payload||JSON.parse(e.data); addAgentRow(p.agent_id,'started','warn'); });
          es.addEventListener('agent_completed', e=>{ const p=JSON.parse(e.data).payload||JSON.parse(e.data); addAgentRow(p.agent_id, p.ok===false?'failed':'done', p.ok===false?'err':'ok'); });
          es.addEventListener('agent_usage', e=>{ const p=JSON.parse(e.data).payload||JSON.parse(e.data); addAgentRow(p.agent_id, 'tokens:'+ (p.usage?.total_tokens||'?'), ''); });
          es.addEventListener('synthesis_token', e=>{ const d=JSON.parse(e.data).payload||JSON.parse(e.data); appendLog(d.content); });
          es.addEventListener('synthesis_error', e=>{ const d=JSON.parse(e.data).payload||JSON.parse(e.data); appendLog('\n[error] '+(d.error||'')+'\n'); });
          es.addEventListener('report_saved', e=>{ const d=JSON.parse(e.data).payload||JSON.parse(e.data); appendLog('\n[report] id='+d.report_id+'\n'); });
          es.addEventListener('complete', e=>{ statusEl.textContent='complete'; es.close(); });
          es.onerror=()=>{ statusEl.textContent='error'; statusEl.className='chip err'; };
        };
      </script>
     </body></html>`);
   });

  // Endpoint for messages with per-connection routing and authentication
  // Supports both legacy (no connectionId) and new path/query param routing
  app.post(['/messages', '/messages/:connectionId'], authenticate, express.json(), (req, res) => {
    // Prefer explicit connectionId via route param or query
    const routeId = req.params.connectionId;
    const queryId = req.query.connectionId;
    const connectionId = routeId || queryId || null;

    if (connectionId) {
      const transport = sseConnections.get(connectionId);
      if (!transport) {
        console.error(`[${new Date().toISOString()}] Received POST /messages for unknown connectionId: ${connectionId}`);
        return res.status(404).json({ error: 'Unknown connectionId' });
      }
      console.error(`[${new Date().toISOString()}] Routing POST /messages to connectionId: ${connectionId}`);
      return transport.handlePostMessage(req, res);
    }

    // Legacy behavior: fall back to last transport if no connectionId provided
    if (!lastSseTransport) {
      console.error(`[${new Date().toISOString()}] Received POST /messages without connectionId and no active SSE transport found.`);
      return res.status(500).json({ error: 'No active SSE transport available' });
    }
    console.error(`[${new Date().toISOString()}] Handling legacy POST /messages via last active SSE transport.`);
    return lastSseTransport.handlePostMessage(req, res);
  });

   // Start server
   app.listen(port, () => {
     console.error(`MCP server listening on port ${port}`); // Use error
   });
  } // Close the else block for HTTP setup
 };

 // Start the server
 setupTransports().catch(error => {
   console.error('Failed to start MCP server:', error.message); // Keep error
   process.exit(1);
 });

 // Start in-process job worker
 (async function startJobWorker(){
   const { concurrency, heartbeatMs } = require('../../config').jobs;
   const runners = Array.from({ length: Math.max(1, concurrency) }, () => (async function loop(){
     while (true) {
       try {
         const job = await dbClient.claimNextJob();
         if (!job) { await new Promise(r=>setTimeout(r, 750)); continue; }
         const jobId = job.id;
         await dbClient.appendJobEvent(jobId, 'started', {});
         const hb = setInterval(()=> dbClient.heartbeatJob(jobId).catch(()=>{}), Math.max(1000, heartbeatMs));
         try {
           if (job.type === 'research') {
             // Reuse conductResearch flow but stream events via job events
             const params = typeof job.params === 'string' ? JSON.parse(job.params) : job.params;
             // Minimal bridge: send progress chunks into job events
             const exchange = { progressToken: 'job', sendProgress: ({ value }) => dbClient.appendJobEvent(jobId, 'progress', value || {}) };
             const resultText = await require('./tools').conductResearch(params, exchange, jobId);
             await dbClient.setJobStatus(jobId, 'succeeded', { result: { message: resultText }, finished: true });
             await dbClient.appendJobEvent(jobId, 'completed', { message: resultText });
           } else {
             await dbClient.setJobStatus(jobId, 'failed', { result: { error: 'Unknown job type' }, finished: true });
             await dbClient.appendJobEvent(jobId, 'error', { message: 'Unknown job type' });
           }
         } catch (e) {
           await dbClient.setJobStatus(jobId, 'failed', { result: { error: e.message }, finished: true });
           await dbClient.appendJobEvent(jobId, 'error', { message: e.message });
         } finally {
           clearInterval(hb);
         }
       } catch (_) {
         await new Promise(r=>setTimeout(r, 1000));
       }
     }
   })());
   await Promise.allSettled(runners);
 })();
