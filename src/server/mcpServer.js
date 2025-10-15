// src/server/mcpServer.js
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const express = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid'); // Import uuid for connection IDs
const config = require('../../config');
const { setupWellKnownEndpoints } = require('./wellKnown');
const { createAuthMiddleware, requireScopes, getScopesForMethod } = require('./oauthResourceServer');
const elicitationManager = require('./elicitation');
const { zodToJsonSchema } = require('zod-to-json-schema');
const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');
const { registerPrompts } = require('./mcpPrompts');
const { registerResources } = require('./mcpResources');
const { 
  // Schemas
  conductResearchSchema,
  researchFollowUpSchema,
  getPastResearchSchema,
  rateResearchReportSchema,
  listResearchHistorySchema,
  getReportContentSchema,
  getServerStatusSchema, // Import schema for status tool
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
  listToolsSchema,
  searchToolsSchema,
  researchSchema,
  dateTimeSchema,
  calcSchema,
  retrieveSchema, // New: schema for retrieve tool
  getJobStatusSchema,
  cancelJobSchema,
  getJobResultSchema,
  agentSchema,
  pingSchema,
  executeSqlSchema,
  browserInferenceRequestSchema,
  browserInferenceResultSchema,
  localInferenceSchema,
  
  // Functions
  conductResearch,
  submitResearch,
  researchFollowUp,
  getPastResearch,
  rateResearchReport,
  listResearchHistory,
  getReportContent,
  getServerStatus, // Import function for status tool
  listModels, // New: function for listing models
  executeSql,
  
  getJobStatusTool,
  cancelJobTool,
  getJobResultTool,
  searchTool,
  queryTool,
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
  index_status,
  listToolsTool,
  searchToolsTool,
  researchTool,
  dateTimeTool,
  calcTool,
  retrieveTool, // New: function for retrieve tool
  agentTool,
  pingTool,
  runBrowserInference,
  handleBrowserInferenceResult,
  runLocalInference
} = require('./tools');
const dbClient = require('../utils/dbClient'); // Import dbClient
const { scheduleHttpSessionCleanup } = require('../utils/dbClient');
const nodeFetch = require('node-fetch');
const cors = require('cors');

// Create MCP server with proper capabilities declaration per MCP spec 2025-06-18
const server = new McpServer({
  name: config.server.name,
  version: config.server.version,
  capabilities: {
    tools: { list: true, call: true },
    prompts: { list: true, get: true, listChanged: true },
    resources: { list: true, read: true, subscribe: true, listChanged: true }
  }
});

// MODE-based tool exposure
const MODE = (config.mcp?.mode || 'ALL').toUpperCase();
const ALWAYS_ON = new Set(['ping','get_server_status','job_status','get_job_status','get_job_result','cancel_job']);
const AGENT_ONLY = new Set(['agent']);
const MANUAL_SET = new Set([
  'research','conduct_research','submit_research','research_follow_up',
  'retrieve','search','query',
  'get_report','get_report_content','history','list_research_history',
  'browser_inference_request','browser_inference_result','local_inference'
]);
function shouldExpose(name) {
  if (ALWAYS_ON.has(name)) return true;
  if (MODE === 'AGENT') return AGENT_ONLY.has(name);
  if (MODE === 'MANUAL') return MANUAL_SET.has(name);
  return true; // ALL
}

const TOOL_DESCRIPTIONS = {
  agent: 'Single entrypoint agent. Routes to research, follow-up, or retrieve/query actions.',
  ping: 'Health check. Returns pong, optionally with server info.',
  research: 'Submit research query. async:true (default) returns job_id, async:false streams results.',
  conduct_research: 'Synchronous research; returns final text. Accepts freeform query or {query}.',
  submit_research: 'Submit a long-running research job asynchronously. Returns a job_id immediately.',
  job_status: 'Check async job progress with summary, events, or full detail.',
  get_job_status: 'Alias for job_status with identical semantics.',
  get_job_result: 'Retrieve the structured result for a completed async job.',
  cancel_job: 'Request cancellation of a queued or running job.',
  retrieve: 'Unified knowledge base retrieval across indexes or SQL.',
  search: 'Simplified alias for retrieve in index mode.',
  query: 'Simplified alias for retrieve in SQL mode.',
  execute_sql: 'Execute a guarded SQL SELECT with optional parameter binding.',
  list_models: 'List available model configurations; refresh optionally forces catalog reload.',
  research_follow_up: 'Run a follow-up query building on existing research results.',
  get_past_research: 'Retrieve semantically similar past research reports.',
  rate_research_report: 'Record structured feedback for a research report.',
  list_research_history: 'List recent research reports with optional filter.',
  history: 'Alias for list_research_history.',
  get_report: 'Get research report by ID. Supports summary/full modes.',
  get_report_content: 'Fetch research report content with flexible output modes.',
  get_server_status: 'Server health summary including DB/embedder/job queue status.',
  export_reports: 'Export stored research reports as JSON or NDJSON.',
  import_reports: 'Import research reports from JSON or NDJSON payloads.',
  backup_db: 'Create a compressed backup archive of the local database.',
  db_health: 'Quick database health snapshot.',
  reindex_vectors: 'Rebuild vector indexes for semantic search.',
  search_web: 'Perform resilient web search with optional scraping.',
  fetch_url: 'Fetch and summarize content from a URL.',
  index_texts: 'Index provided documents into the hybrid search store.',
  index_url: 'Fetch and index a URL into the hybrid search store.',
  search_index: 'Search the hybrid BM25/vector index.',
  index_status: 'Report indexer configuration and status.',
  list_tools: 'List available MCP tools with metadata.',
  search_tools: 'Semantic search over available tools.',
  date_time: 'Get current date/time in various formats.',
  calc: 'Evaluate arithmetic expressions safely.',
  browser_inference_request: 'Request a client (browser) to perform LLM inference.',
  browser_inference_result: 'Handle LLM inference results received from a client (browser).',
  local_inference: 'Run inference using server-side GGUF models with optional Qwen->Utopia pipeline.'
};

function stripMetaArguments(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
  if ('_meta' in params) {
    const { _meta, ...rest } = params;
    return rest;
  }
  return params;
}

function createMcpExchange(extra) {
  const progressToken = extra?._meta?.progressToken;
  if (!progressToken || typeof extra?.sendNotification !== 'function') {
    return progressToken ? { progressToken, sendProgress: () => {} } : null;
  }
  const sendProgress = ({ value }) => {
    let progressValue = 0;
    let message;
    if (value && typeof value === 'object') {
      if (typeof value.progress === 'number') progressValue = value.progress;
      if (typeof value.message === 'string') {
        message = value.message;
      } else if (typeof value.content === 'string') {
        message = value.content;
      } else {
        try {
          message = JSON.stringify(value);
        } catch (_) {
          message = '[progress update]';
        }
      }
    } else if (typeof value === 'string') {
      message = value;
    }
    extra.sendNotification({
      method: 'notifications/progress',
      params: {
        progressToken,
        progress: progressValue,
        ...(message ? { message } : {})
      }
    });
  };
  return { progressToken, sendProgress };
}

function tryParseJson(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      return null;
    }
  }
  return null;
}

function formatToolResult(_name, rawResult) {
  if (rawResult === undefined || rawResult === null) {
    return { content: [] };
  }
  if (rawResult instanceof Error) {
    return { content: [{ type: 'text', text: rawResult.message }], isError: true };
  }
  if (rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)) {
    if (Array.isArray(rawResult.content)) {
      return rawResult;
    }
    const text = JSON.stringify(rawResult, null, 2);
    return {
      content: [{ type: 'text', text }],
      structuredContent: rawResult
    };
  }
  if (typeof rawResult === 'string') {
    const parsed = tryParseJson(rawResult);
    if (parsed) {
      return {
        content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }],
        structuredContent: parsed
      };
    }
    return { content: [{ type: 'text', text: rawResult }] };
  }
  if (Buffer.isBuffer(rawResult)) {
    return {
      content: [{ type: 'text', text: rawResult.toString('utf8') }]
    };
  }
  return { content: [{ type: 'text', text: String(rawResult) }] };
}

function buildAnnotations(schema, extraAnnotations) {
  const annotations = { ...(extraAnnotations || {}) };
  if (schema) {
    try {
      annotations['x-schema-json'] = zodToJsonSchema(schema, { name: `${Date.now()}Params` });
    } catch (_) {
      // Ignore schema conversion problems
    }
  }
  return Object.keys(annotations).length ? annotations : undefined;
}

function registerNormalizedTool(name, schema, handler, options = {}) {
  if (!shouldExpose(name)) return;
  const description = options.description || TOOL_DESCRIPTIONS[name];
  const annotations = buildAnnotations(schema, options.annotations);
  const registration = {
    title: options.title,
    description,
    annotations
  };
  server.registerTool(name, registration, async (rawParams = {}, extra = {}) => {
    const cleanedParams = stripMetaArguments(rawParams);
    const normalized = normalizeParamsForTool(name, cleanedParams);
    let parsed = normalized;
    if (schema) {
      const result = await schema.safeParseAsync(normalized);
      if (!result.success) {
        throw new McpError(ErrorCode.InvalidParams, result.error.message, { issues: result.error.issues });
      }
      parsed = result.data;
    }
    const requestId = extra?.requestId ? String(extra.requestId) : `req-${Date.now()}`;
    const exchange = createMcpExchange(extra);
    const rawResult = await handler(parsed, exchange, requestId);
    return formatToolResult(name, rawResult);
  });
}

const sessionStreams = new Map();

function registerSessionStream(sessionId, transport, transportType = 'ws') {
  if (!sessionId || !transport) return;
  sessionStreams.set(sessionId, { transport, transportType });
}

function releaseSessionStream(sessionId) {
  if (!sessionId) return;
  sessionStreams.delete(sessionId);
}

// Register Benchmark & Stack tools (MCP draft utilities)
try {
  const tools = require('./tools');
  registerNormalizedTool('benchmark.run', tools.benchmarkRunSchema, tools.benchmarkRunTool, {
    title: 'Benchmark Run',
    description: 'Start a benchmark run for a given scenario/model/stack and return run_id.'
  });
  registerNormalizedTool('benchmark.measure', tools.benchmarkMeasureSchema, tools.benchmarkMeasureTool, {
    title: 'Benchmark Measure',
    description: 'Insert a measurement into an existing benchmark run.'
  });
  registerNormalizedTool('benchmark.finish', tools.benchmarkFinishSchema, tools.benchmarkFinishTool, {
    title: 'Benchmark Finish',
    description: 'Mark a benchmark run as finished.'
  });
  registerNormalizedTool('benchmark.trace', tools.traceSchema, tools.benchmarkTraceTool, {
    title: 'Benchmark Compliance Trace',
    description: 'Persist MCP compliance/security trace for a benchmark run.'
  });
  registerNormalizedTool('model.catalog', tools.modelCatalogSchema, tools.modelCatalogTool, {
    title: 'Model Catalog',
    description: 'List known models and refresh catalog.'
  });
  registerNormalizedTool('model.set', tools.modelSetSchema, tools.modelSetTool, {
    title: 'Set Model',
    description: 'Set active modelProfileId in current stack config.'
  });
  registerNormalizedTool('stack.configure', tools.stackConfigureSchema, tools.stackConfigureTool, {
    title: 'Configure Stack',
    description: 'Save a secure stack configuration for runtime switching.'
  });
} catch (e) {
  console.error('[mcpServer] Failed to register benchmark/stack tools:', e?.message || e);
}

// Permissive parameter normalizer to accept loose single-string inputs (e.g., random_string)
function extractRawParam(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    for (const key of ['random_string', 'raw', 'text', 'payload']) {
      if (typeof input[key] === 'string' && input[key].trim()) return input[key];
    }
  }
  return null;
}

function parseKeyVals(raw) {
  const out = {};
  const s = String(raw || '').trim();
  // Handle JSON upfront
  const j = tryParseJson(s);
  if (j) return j;

  // Quick patterns
  const lower = s.toLowerCase();
  // Extract sql: rest of string after first occurrence
  if (/(^|[ ,;\n\t])sql\s*[:=]/i.test(s)) {
    const idx = s.toLowerCase().indexOf('sql');
    const after = s.slice(idx).replace(/^sql\s*[:=]\s*/i, '');
    out.sql = after.trim();
  }
  // Generic key:value pairs (stop at next key)
  const regex = /(\w+)\s*[:=]\s*([^,;\n]+)(?=\s*[,;\n]|$)/g;
  let m;
  while ((m = regex.exec(s)) !== null) {
    const k = m[1];
    const v = m[2].trim();
    if (out[k] === undefined) out[k] = v;
  }

  // If nothing parsed, return a hint object
  if (Object.keys(out).length === 0) return { _raw: s };
  return out;
}

function toNumberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['true','1','yes','y','on'].includes(s)) return true;
  if (['false','0','no','n','off'].includes(s)) return false;
  return fallback;
}

function normalizeParamsForTool(toolName, params) {
  // If already a structured object without loose fields, pass through
  if (params && typeof params === 'object' && !('random_string' in params) && !('raw' in params) && !('text' in params)) {
    return params;
  }

  const raw = extractRawParam(params);
  const parsed = raw !== null ? parseKeyVals(raw) : (params || {});
  const s = typeof raw === 'string' ? raw.trim() : '';

  switch (toolName) {
    case 'calc':
      if (parsed && parsed.expr) return parsed;
      return { expr: s || String(parsed._raw || '') };

    case 'date_time':
      if (parsed && parsed.format) return parsed;
      if (/^(iso|rfc|epoch|unix)$/i.test(s)) return { format: s.toLowerCase() === 'unix' ? 'epoch' : s.toLowerCase() };
      return {};

    case 'job_status':
    case 'get_job_status':
    case 'get_job_result':
      if (parsed && parsed.job_id) return parsed;
      if (parsed && parsed.jobId) return { ...parsed, job_id: parsed.jobId };
      if (parsed && parsed.id) return { ...parsed, job_id: parsed.id };
      return { job_id: s || String(parsed._raw || '') };

    case 'cancel_job':
      if (parsed && parsed.job_id) return parsed;
      return { job_id: s || String(parsed._raw || '') };

    case 'get_report':
    case 'get_report_content':
      if (parsed && parsed.reportId) return parsed;
      if (parsed && parsed.id) return { reportId: parsed.id };
      return { reportId: s || String(parsed._raw || '') };

    case 'history':
    case 'list_research_history':
      if (parsed && (parsed.limit || parsed.queryFilter)) {
        const out = { ...parsed };
        if (out.limit !== undefined) out.limit = toNumberOr(out.limit, 10);
        return out;
      }
      if (/^\d+$/.test(s)) return { limit: Number(s) };
      return s ? { queryFilter: s } : {};

    case 'retrieve':
      {
        const out = { ...parsed };
        // Mode detection
        const isSql = /mode\s*[:=]\s*sql/i.test(s) || /^\s*select\s/i.test(s) || (out.sql && !out.query);
        if (isSql) {
          out.mode = 'sql';
          out.sql = out.sql || (parsed._raw ? parsed._raw : s);
          // params support via JSON only; leave as-is if present
        } else {
          out.mode = out.mode || 'index';
          out.query = out.query || (parsed._raw ? parsed._raw : s);
        }
        if (out.k !== undefined) out.k = toNumberOr(out.k, 10);
        return out;
      }

    case 'research':
    case 'submit_research':
    case 'conduct_research':
      if (parsed && (parsed.query || parsed.q)) {
        const out = { ...parsed };
        if (out.q && !out.query) out.query = out.q;
        if (out.cost && !out.costPreference) out.costPreference = out.cost;
        if (out.async !== undefined) out.async = toBoolean(out.async, true);
        return out;
      }
      return s ? { query: s } : {};

    case 'list_tools':
    case 'search_tools':
      if (parsed && parsed.query) return parsed;
      return s ? { query: s } : {};

    case 'get_server_status':
      return {}; // no params

    default:
      // Best-effort passthrough
      return parsed && Object.keys(parsed).length ? parsed : {};
  }
}

// NOTE: Prompts are now registered via registerPrompts() in mcpPrompts.js (loaded after tools)

// Register resources using latest MCP spec with proper protocol handlers and URI templates
if (config.mcp?.features?.resources) {
  const resources = new Map([
    ['mcp://specs/core', {
      uri: 'mcp://specs/core',
      name: 'MCP Core Specification',
      description: 'Canonical Model Context Protocol specification links and references',
    mimeType: 'application/json'
    }],
    ['mcp://tools/catalog', {
      uri: 'mcp://tools/catalog',
      name: 'Available Tools Catalog',
      description: 'Live MCP tools catalog with lightweight params for client UIs',
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
        case 'mcp://tools/catalog':
          try {
            const text = await require('./tools').listToolsTool({ limit: 200, semantic: false });
            content = JSON.parse(text);
          } catch (_) {
            content = { tools: [] };
          }
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

// Register all core tools
registerNormalizedTool('ping', pingSchema, pingTool);
registerNormalizedTool('agent', agentSchema, agentTool);
registerNormalizedTool('research', researchSchema, researchTool);
registerNormalizedTool('conduct_research', conductResearchSchema, conductResearch);
registerNormalizedTool('submit_research', submitResearchSchema, submitResearch);
registerNormalizedTool('job_status', getJobStatusSchema, getJobStatusTool);
registerNormalizedTool('get_job_status', getJobStatusSchema, getJobStatusTool);
registerNormalizedTool('get_job_result', getJobResultSchema, getJobResultTool);
registerNormalizedTool('cancel_job', cancelJobSchema, cancelJobTool);
registerNormalizedTool('retrieve', retrieveSchema, retrieveTool);
registerNormalizedTool('search', searchSchema, searchTool);
registerNormalizedTool('query', querySchema, queryTool);
registerNormalizedTool('research_follow_up', researchFollowUpSchema, researchFollowUp);
registerNormalizedTool('get_past_research', getPastResearchSchema, getPastResearch);
registerNormalizedTool('rate_research_report', rateResearchReportSchema, rateResearchReport);
registerNormalizedTool('list_research_history', listResearchHistorySchema, listResearchHistory);
registerNormalizedTool('history', listResearchHistorySchema, listResearchHistory);
registerNormalizedTool('get_report_content', getReportContentSchema, getReportContent);
registerNormalizedTool('get_report', getReportContentSchema, getReportContent);
registerNormalizedTool('get_server_status', getServerStatusSchema, getServerStatus);
registerNormalizedTool('list_models', listModelsSchema, listModels);
registerNormalizedTool('execute_sql', executeSqlSchema, executeSql);
registerNormalizedTool('export_reports', exportReportsSchema, exportReports);
registerNormalizedTool('import_reports', importReportsSchema, importReports);
registerNormalizedTool('backup_db', backupDbSchema, backupDb);
registerNormalizedTool('db_health', dbHealthSchema, dbHealth);
registerNormalizedTool('reindex_vectors', reindexVectorsSchema, reindexVectorsTool);
registerNormalizedTool('search_web', searchWebSchema, searchWeb);
registerNormalizedTool('fetch_url', fetchUrlSchema, fetchUrl);
registerNormalizedTool('index_texts', indexTextsSchema, index_texts);
registerNormalizedTool('index_url', indexUrlSchema, index_url);
registerNormalizedTool('search_index', searchIndexSchema, search_index);
registerNormalizedTool('index_status', indexStatusSchema, index_status);
registerNormalizedTool('list_tools', listToolsSchema, listToolsTool);
registerNormalizedTool('search_tools', searchToolsSchema, searchToolsTool);
registerNormalizedTool('date_time', dateTimeSchema, dateTimeTool);
registerNormalizedTool('calc', calcSchema, calcTool);
registerNormalizedTool('elicitation_response', z.object({ elicitationId: z.string(), data: z.any() }), async (params) => {
    const { elicitationId, data } = params;
    const resolved = elicitationManager.resolve(elicitationId, data);
  return { success: resolved };
});
registerNormalizedTool('browser_inference_request', browserInferenceRequestSchema, runBrowserInference);
registerNormalizedTool('browser_inference_result', browserInferenceResultSchema, handleBrowserInferenceResult);
registerNormalizedTool('local_inference', localInferenceSchema, runLocalInference);
registerNormalizedTool('trace.log', require('./tools').traceLogSchema, require('./tools').traceLogTool, {
  title: 'Trace Log',
  description: 'Persist a client-side trace event into compliance_traces.'
});

// Initialize local model manager at startup
(async function initializeLocalModels() {
  try {
    if (config.localModels?.enabled) {
      const localModelManager = require('../utils/localModelManager');
      await localModelManager.initialize();
      console.error(`[${new Date().toISOString()}] Local models initialized: ${localModelManager.getLoadedModels().join(', ')}`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to initialize local models:`, error);
  }
})();

// Register MCP Prompts and Resources
registerPrompts(server);
registerResources(server);

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
    
  // Authentication Middleware
  const authenticate = createAuthMiddleware();

  scheduleHttpSessionCleanup();
 
  console.error(`Starting MCP server with HTTP/SSE transport on port ${port}`); // Use error
  if (config.auth.jwksUrl) {
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
      const { setupMCPEndpoint } = require('./mcpStreamableHttp');
      setupMCPEndpoint(app, server, authenticate, requireScopes, getScopesForMethod);
      setupWellKnownEndpoints(app);
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
     const sinceEventId = req.headers['last-event-id'] || req.query.since_event_id || 0;

     res.writeHead(200, {
       'Content-Type': 'text/event-stream',
       'Cache-Control': 'no-cache',
       'Connection': 'keep-alive'
     });
     let lastEventId = sinceEventId;
     const send = (type, data) => { 
       try { 
         if (data && data.id) res.write(`id: ${data.id}\n`);
         res.write(`event: ${type}\n`); 
         res.write(`data: ${JSON.stringify(data)}\n\n`);
       } catch(_){}
     };
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

        if ((req.headers['accept'] || '').includes('text/plain')) {
          res.setHeader('Content-Type','text/plain; version=0.0.4');
          const lines = [];
          lines.push(`# HELP jobs_total Number of jobs by status`);
          lines.push(`# TYPE jobs_total gauge`);
          for (const r of rows) lines.push(`jobs_total{status="${r.status}"} ${Number(r.n||0)}`);
          lines.push(`# HELP embedder_ready Whether embedder is initialized`);
          lines.push(`# TYPE embedder_ready gauge`);
          lines.push(`embedder_ready ${embedderReady?1:0}`);
          lines.push(`# HELP db_initialized Whether DB is initialized`);
          lines.push(`# TYPE db_initialized gauge`);
          lines.push(`db_initialized ${dbInitialized?1:0}`);
          lines.push(`# HELP tokens_prompt Total prompt tokens from recent reports`);
          lines.push(`# TYPE tokens_prompt counter`);
          lines.push(`tokens_prompt ${usageTotals.prompt_tokens}`);
          lines.push(`# HELP tokens_completion Total completion tokens from recent reports`);
          lines.push(`# TYPE tokens_completion counter`);
          lines.push(`tokens_completion ${usageTotals.completion_tokens}`);
          lines.push(`# HELP tokens_total Total tokens from recent reports`);
          lines.push(`# TYPE tokens_total counter`);
          lines.push(`tokens_total ${usageTotals.total_tokens}`);
          return res.end(lines.join('\n') + '\n');
        }

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

  // App Platform API v0 (graphs, runs, events)
  try {
    const platformApi = require('../platform/api');
    app.use('/platform', authenticate, express.json(), platformApi.router);
  } catch (e) {
    console.error('[platform] API not initialized:', e.message);
  }

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

   // Client demo: tool catalog UI (client-side), server performs semantic ranking
   app.get('/client/tools', async (req, res) => {
     try {
       const q = typeof req.query.q === 'string' ? req.query.q : undefined;
       const limit = req.query.limit ? Math.max(1, Math.min(200, Number(req.query.limit))) : undefined;
       const semantic = req.query.semantic === 'false' ? false : true;
       const text = await require('./tools').listToolsTool({ query: q, limit: limit || 50, semantic });
       res.setHeader('Content-Type', 'application/json');
       res.end(text);
     } catch (e) {
       res.status(500).json({ error: e.message });
     }
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
   const httpServer = app.listen(port, () => {
     console.error(`MCP server listening on port ${port}`); // Use error
   });

   if (config.mcp.transport.websocket) {
      const { setupWebSocketServer } = require('./wsTransport');
      setupWebSocketServer(httpServer, server, authenticate, requireScopes, getScopesForMethod);
   }

  } // Close the else block for HTTP setup
 };

 // Define the job worker function first
  async function startJobWorker(){
    const { concurrency, heartbeatMs } = require('../../config').jobs;
    const runners = Array.from({ length: Math.max(1, concurrency) }, () => (async function loop(){
      while (true) {
        try {
          // Await the full initialization before allowing the job worker to claim jobs
          // This prevents jobs from running before DB/embedder are ready
          const isReady = dbClient.isDbInitialized() && dbClient.isEmbedderReady();
          if (!isReady) {
            console.error(`[${new Date().toISOString()}] Job worker waiting for DB/Embedder initialization...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait and recheck
            continue;
          }

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
             // Optional webhook notification
            try {
              if (params?.notify) {
                await nodeFetch(params.notify, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ job_id: jobId, status: 'succeeded', message: resultText })
                }).catch(()=>{});
              }
            } catch (_) {}
           } else {
             await dbClient.setJobStatus(jobId, 'failed', { result: { error: 'Unknown job type' }, finished: true });
             await dbClient.appendJobEvent(jobId, 'error', { message: 'Unknown job type' });
            // Notify if requested
            try {
              const params = typeof job.params === 'string' ? JSON.parse(job.params) : job.params;
              if (params?.notify) {
                await nodeFetch(params.notify, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ job_id: jobId, status: 'failed', error: 'Unknown job type' })
                }).catch(()=>{});
              }
            } catch (_) {}
           }
         } catch (e) {
           await dbClient.setJobStatus(jobId, 'failed', { result: { error: e.message }, finished: true });
           await dbClient.appendJobEvent(jobId, 'error', { message: e.message });
          try {
            const params = typeof job.params === 'string' ? JSON.parse(job.params) : job.params;
            if (params?.notify) {
              await nodeFetch(params.notify, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ job_id: jobId, status: 'failed', error: e.message })
              }).catch(()=>{});
            }
          } catch (_) {}
         } finally {
           clearInterval(hb);
         }
       } catch (_) {
         await new Promise(r=>setTimeout(r, 1000));
       }
     }
   })());
   await Promise.allSettled(runners);
}

// Orchestrate full initialization before starting the server process
// This ensures DB and embedder are ready for all components
(async () => {
  const stdioMode = process.argv.includes('--stdio');
  if (stdioMode) {
    // Connect STDIO transport immediately to handle initialize without delay
    try {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    } catch (e) {
      // Avoid stdout logs in STDIO mode
    }
    // Initialize DB and embedder in the background; job worker will wait for readiness
    dbClient.initializeDbAndEmbedder().catch(() => {});
    startJobWorker().catch(() => {});
    return;
  }

  console.error(`[${new Date().toISOString()}] Initiating full MCP server initialization...`);
  const success = await dbClient.initializeDbAndEmbedder();
  if (success) {
    console.error(`[${new Date().toISOString()}] MCP server initialization COMPLETE.`);
  } else {
    console.error(`[${new Date().toISOString()}] MCP server initialization FAILED. Some features may be degraded.`);
  }
  // Proceed to start the transports and job worker after initialization
  setupTransports().catch(error => {
    console.error('Failed to start MCP server transports:', error.message);
    process.exit(1);
  });
  startJobWorker().catch(error => {
    console.error('Failed to start MCP job worker:', error.message);
    // Don't exit, allow server to run even if worker fails
  });
})();
