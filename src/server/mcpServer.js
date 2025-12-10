#!/usr/bin/env node
// src/server/mcpServer.js

// Handle --verify flag for installation verification
if (process.argv.includes('--verify')) {
  require('../../scripts/postinstall');
  // postinstall.js handles --verify and exits
  module.exports = {};
}
// Handle --setup-claude flag before loading the server
else if (process.argv.includes('--setup-claude')) {
  require('../../scripts/setup-claude-code').main()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
  // Prevent the rest of the file from executing synchronously
  // while the async setup runs
  module.exports = {};
} else {

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid'); // Import uuid for connection IDs
const config = require('../../config');

// MCP 2025-11-25 Feature Modules
const taskAdapter = require('./taskAdapter');
const samplingHandler = require('./sampling');
const elicitationHandler = require('./elicitation');

// Structured logging (MCP-compliant)
const logger = require('../utils/logger');

// Semantic error diagnostics (Rust-inspired)
const {
  createDiagnosticContext,
  validateWithDiagnostics,
  formatSemanticError
} = require('../utils/diagnostics');

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
  batchResearchSchema, // Batch research for parallel job dispatch
  
  // Functions
  conductResearch,
  researchFollowUp,
  getPastResearch,
  rateResearchReport,
  listResearchHistory,
  getReportContent,
  getServerStatus, // Import function for status tool
  listModels, // New: function for listing models
  
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
  index_status,
  listToolsTool,
  searchToolsTool,
  researchTool,
  dateTimeTool,
  calcTool,
  retrieveTool, // New: function for retrieve tool
  batchResearchTool, // Batch research function
  searchTool, // KB search
  queryTool, // SQL query

} = require('./tools');
const dbClient = require('../utils/dbClient'); // Import dbClient
const nodeFetch = require('node-fetch');
const cors = require('cors');

// @terminals-tech/* package integrations
const { getKnowledgeGraph } = require('../utils/knowledgeGraph');
const { getSessionManager, EventTypes } = require('../utils/sessionStore');

// Consolidated handlers (feature-flagged via CORE_HANDLERS_ENABLED)
const handlers = config.core?.handlers?.enabled ? require('./handlers') : null;

// Tools that require legacy tools.js implementation (complex orchestration, MCP protocols, external APIs)
const LEGACY_ONLY_TOOLS = new Set([
  'research', 'agent', 'research_follow_up', 'batch_research',
  'sample_message', 'elicitation_respond',
  'search_web', 'fetch_url', 'get_server_status'
]);

// Initialize singleton instances
let knowledgeGraph = null;
let sessionManager = null;

// Lazy init for knowledge graph and session manager
async function ensureIntegrations() {
  if (!knowledgeGraph) {
    knowledgeGraph = getKnowledgeGraph(dbClient);
    await knowledgeGraph.initialize().catch(e => logger.error('KnowledgeGraph init error', { error: e }));
  }
  if (!sessionManager) {
    sessionManager = getSessionManager(dbClient);
    await sessionManager.initialize().catch(e => logger.error('SessionManager init error', { error: e }));
  }
}

// MCP Apps (SEP-1865) UI Template Generator
// Generates minimal HTML templates that communicate via postMessage JSON-RPC
function generateUITemplate(templateType, options = {}) {
  const { title, description, linkedTools, capabilities } = options;
  const baseStyles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117; color: #c9d1d9; padding: 16px;
    }
    .header {
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid #30363d; padding-bottom: 12px; margin-bottom: 16px;
    }
    .title { font-size: 18px; font-weight: 600; }
    .description { font-size: 13px; color: #8b949e; }
    .tools { display: flex; gap: 8px; flex-wrap: wrap; }
    .tool-badge {
      background: #21262d; border: 1px solid #30363d; border-radius: 4px;
      padding: 4px 8px; font-size: 12px; font-family: monospace;
    }
    .content { flex: 1; overflow: auto; }
    .loading { text-align: center; padding: 40px; color: #8b949e; }
    #app { height: calc(100vh - 32px); display: flex; flex-direction: column; }
  `;

  const mcpBridge = `
    // MCP Apps Bridge - JSON-RPC over postMessage
    const mcpBridge = {
      requestId: 0,
      pending: new Map(),

      init() {
        window.addEventListener('message', (e) => {
          if (e.data?.jsonrpc === '2.0' && e.data.id) {
            const resolve = this.pending.get(e.data.id);
            if (resolve) {
              this.pending.delete(e.data.id);
              resolve(e.data.result || e.data.error);
            }
          }
        });
      },

      async callTool(toolName, params = {}) {
        const id = ++this.requestId;
        return new Promise((resolve) => {
          this.pending.set(id, resolve);
          window.parent.postMessage({
            jsonrpc: '2.0',
            id,
            method: 'tools/call',
            params: { name: toolName, arguments: params }
          }, '*');
          setTimeout(() => {
            if (this.pending.has(id)) {
              this.pending.delete(id);
              resolve({ error: 'Timeout' });
            }
          }, 30000);
        });
      },

      notify(method, params = {}) {
        window.parent.postMessage({
          jsonrpc: '2.0',
          method,
          params
        }, '*');
      }
    };
    mcpBridge.init();
  `;

  const templates = {
    'research-viewer': `
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><title>${title}</title>
      <style>${baseStyles}
        .report { white-space: pre-wrap; line-height: 1.6; }
        .citation { background: #161b22; border-left: 3px solid #58a6ff; padding: 8px 12px; margin: 8px 0; }
      </style>
      </head><body>
      <div id="app">
        <div class="header">
          <div><div class="title">${title}</div><div class="description">${description}</div></div>
          <div class="tools">${linkedTools.map(t => '<span class="tool-badge">' + t + '</span>').join('')}</div>
        </div>
        <div class="content" id="content"><div class="loading">Loading report...</div></div>
      </div>
      <script>${mcpBridge}
        async function loadReport(reportId) {
          const result = await mcpBridge.callTool('get_report', { reportId });
          if (result && !result.error) {
            document.getElementById('content').innerHTML = '<div class="report">' + result + '</div>';
          }
        }
        // Listen for report ID from parent
        window.addEventListener('message', (e) => {
          if (e.data?.reportId) loadReport(e.data.reportId);
        });
      </script>
      </body></html>
    `,
    'graph-explorer': `
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><title>${title}</title>
      <style>${baseStyles}
        #graph { width: 100%; height: calc(100% - 80px); }
        .controls { display: flex; gap: 8px; margin-bottom: 12px; }
        .btn { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
        .btn:hover { background: #30363d; }
      </style>
      <script src="https://d3js.org/d3.v7.min.js"></script>
      </head><body>
      <div id="app">
        <div class="header">
          <div><div class="title">${title}</div><div class="description">${description}</div></div>
          <div class="tools">${linkedTools.map(t => '<span class="tool-badge">' + t + '</span>').join('')}</div>
        </div>
        <div class="controls">
          <button class="btn" onclick="loadGraph()">Refresh</button>
          <button class="btn" onclick="showClusters()">Clusters</button>
          <button class="btn" onclick="showPageRank()">PageRank</button>
        </div>
        <svg id="graph"></svg>
      </div>
      <script>${mcpBridge}
        let simulation, svg, node, link;
        async function loadGraph(nodeId) {
          const result = await mcpBridge.callTool('graph_traverse', { startNode: nodeId || 'report:1', depth: 3 });
          if (result?.nodes) renderGraph(result);
        }
        async function showClusters() { await mcpBridge.callTool('graph_clusters', {}); }
        async function showPageRank() { await mcpBridge.callTool('graph_pagerank', { topK: 10 }); }
        function renderGraph(data) {
          const width = document.getElementById('graph').clientWidth || 800;
          const height = document.getElementById('graph').clientHeight || 500;
          d3.select('#graph').selectAll('*').remove();
          svg = d3.select('#graph').attr('viewBox', [0, 0, width, height]);
          simulation = d3.forceSimulation(data.nodes)
            .force('link', d3.forceLink(data.edges).id(d => d.id).distance(80))
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(width/2, height/2));
          link = svg.append('g').selectAll('line')
            .data(data.edges).join('line')
            .attr('stroke', '#30363d').attr('stroke-width', d => d.weight || 1);
          node = svg.append('g').selectAll('circle')
            .data(data.nodes).join('circle')
            .attr('r', 8).attr('fill', d => d.type === 'report' ? '#58a6ff' : '#3fb950')
            .call(d3.drag().on('drag', (e,d) => { d.fx = e.x; d.fy = e.y; }));
          node.append('title').text(d => d.title || d.id);
          simulation.on('tick', () => {
            link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
            node.attr('cx',d=>d.x).attr('cy',d=>d.y);
          });
        }
        loadGraph();
      </script>
      </body></html>
    `,
    'timeline': `
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><title>${title}</title>
      <style>${baseStyles}
        .timeline { display: flex; flex-direction: column; gap: 8px; }
        .event {
          display: flex; gap: 12px; padding: 12px; background: #161b22;
          border-radius: 6px; border-left: 3px solid #30363d;
        }
        .event.current { border-left-color: #58a6ff; }
        .event-time { color: #8b949e; font-size: 12px; min-width: 80px; }
        .event-type { font-weight: 500; }
        .controls { display: flex; gap: 8px; margin-bottom: 16px; }
        .btn { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .btn:hover { background: #30363d; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      </style>
      </head><body>
      <div id="app">
        <div class="header">
          <div><div class="title">${title}</div><div class="description">${description}</div></div>
          <div class="tools">${linkedTools.map(t => '<span class="tool-badge">' + t + '</span>').join('')}</div>
        </div>
        <div class="controls">
          <button class="btn" id="undoBtn" onclick="doUndo()">← Undo</button>
          <button class="btn" id="redoBtn" onclick="doRedo()">Redo →</button>
          <button class="btn" onclick="createCheckpoint()">📍 Checkpoint</button>
          <button class="btn" onclick="forkSession()">🔀 Fork</button>
        </div>
        <div class="timeline" id="timeline"><div class="loading">Loading session...</div></div>
      </div>
      <script>${mcpBridge}
        let sessionId = 'default';
        async function loadSession() {
          const result = await mcpBridge.callTool('session_state', { sessionId });
          if (result?.state) renderTimeline(result);
        }
        async function doUndo() {
          const result = await mcpBridge.callTool('undo', { sessionId });
          if (result) loadSession();
        }
        async function doRedo() {
          const result = await mcpBridge.callTool('redo', { sessionId });
          if (result) loadSession();
        }
        async function createCheckpoint() {
          await mcpBridge.callTool('checkpoint', { sessionId, name: 'Manual checkpoint' });
          loadSession();
        }
        async function forkSession() {
          const newId = 'fork_' + Date.now();
          await mcpBridge.callTool('fork_session', { sessionId, newSessionId: newId });
          sessionId = newId;
          loadSession();
        }
        function renderTimeline(data) {
          const events = [...(data.state?.queries || []), ...(data.state?.reports || [])];
          events.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
          document.getElementById('timeline').innerHTML = events.map((e, i) =>
            '<div class="event' + (i === events.length-1 ? ' current' : '') + '">' +
            '<span class="event-time">' + new Date(e.timestamp).toLocaleTimeString() + '</span>' +
            '<span class="event-type">' + (e.query ? '🔍 Query' : '📄 Report') + '</span>' +
            '<span>' + (e.query || e.summary || 'Event').substring(0,50) + '</span>' +
            '</div>'
          ).join('');
          document.getElementById('undoBtn').disabled = !data.canUndo;
          document.getElementById('redoBtn').disabled = !data.canRedo;
        }
        window.addEventListener('message', (e) => { if (e.data?.sessionId) sessionId = e.data.sessionId; loadSession(); });
        loadSession();
      </script>
      </body></html>
    `
  };

  return templates[templateType] || templates['research-viewer'];
}

// Create MCP server with proper capabilities declaration per MCP spec 2025-06-18
const server = new McpServer({
  name: config.server.name,
  version: config.server.version,
  capabilities: {
    tools: {},
    prompts: { listChanged: true },
    resources: { subscribe: true, listChanged: true },
    logging: {} // Enable MCP logging notifications
  }
});

// Wire structured logger to MCP server for sendLoggingMessage support
logger.setServer(server);

// MODE-based tool exposure
const MODE = (config.mcp?.mode || 'ALL').toUpperCase();
const ALWAYS_ON = new Set(['ping','get_server_status','job_status','get_job_status','cancel_job']);
const AGENT_ONLY = new Set(['agent']);
const MANUAL_SET = new Set([
  'research','conduct_research','submit_research','research_follow_up',
  'retrieve','search','query',
  'get_report','get_report_content','history','list_research_history'
]);
function shouldExpose(name) {
  if (ALWAYS_ON.has(name)) return true;
  if (MODE === 'AGENT') return AGENT_ONLY.has(name);
  if (MODE === 'MANUAL') return MANUAL_SET.has(name);
  return true; // ALL
}
function register(name, schema, handler) {
  if (shouldExpose(name)) {
    // Use registerTool with config object to properly pass ZodEffects schemas
    // The .tool() method only accepts ZodRawShape, not full Zod schemas with transforms
    const description = schema?.description || schema?._def?.description || '';
    server.registerTool(name, { inputSchema: schema, description }, handler);
  }
}

// =============================================================================
// Handler Integration (v1.8.1 - Feature-flagged via CORE_HANDLERS_ENABLED)
// =============================================================================

/**
 * Build context object for consolidated handlers
 */
function buildHandlerContext() {
  return {
    dbClient,
    sessionStore: sessionManager,
    graphClient: knowledgeGraph,
    toolRegistry: server.getTools?.() || new Map()
  };
}

/**
 * Route a tool call through consolidated handlers
 * Returns null if handlers are disabled or tool is unknown to handlers
 */
async function routeThroughHandler(toolName, params, context) {
  if (!handlers) return null;
  try {
    const result = await handlers.routeToHandler(toolName, params, context);
    return {
      content: [{
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      }]
    };
  } catch (e) {
    // If handler doesn't know the tool, fall back to legacy
    if (e.message.includes('Unknown tool')) return null;
    throw e;
  }
}

/**
 * Wrap a legacy tool with handler routing
 * When CORE_HANDLERS_ENABLED=true, routes through handlers first
 * Falls back to legacy implementation if handlers unavailable or for LEGACY_ONLY_TOOLS
 *
 * Includes semantic error formatting (Rust-inspired "borrow checker" style)
 * for actionable error messages that guide users to correct usage.
 */
function wrapWithHandler(toolName, legacyFn, needsNormalization = true) {
  return async (params, exchange, requestId = `req-${Date.now()}`) => {
    // Create diagnostic context at the start for rich error formatting
    const diagnosticCtx = createDiagnosticContext(toolName, params);

    try {
      // Run tool-specific validation with diagnostics
      const validation = validateWithDiagnostics(toolName, params);
      if (!validation.valid) {
        const formatted = formatSemanticError(toolName, new Error(validation.error), validation.ctx);
        return {
          content: [{ type: 'text', text: formatted }],
          isError: true
        };
      }

      // Use normalized params from validator if available, otherwise normalize
      const norm = validation.normalized
        ? { ...params, ...validation.normalized }
        : (needsNormalization ? normalizeParamsForTool(toolName, params) : params);

      // Try handler routing for non-legacy tools
      if (handlers && !LEGACY_ONLY_TOOLS.has(toolName)) {
        await ensureIntegrations();
        const result = await routeThroughHandler(toolName, norm, buildHandlerContext());
        if (result) return result;
      }

      // Fall back to legacy implementation
      const text = await legacyFn(norm, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      // Format error with semantic diagnostics
      const formatted = formatSemanticError(toolName, e, diagnosticCtx);
      return {
        content: [{ type: 'text', text: formatted }],
        isError: true
      };
    }
  };
}

// =============================================================================
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

function tryParseJson(text) {
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === 'object') return obj;
  } catch (_) {}
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
  // For research tools, always go through normalization to handle q -> query conversion
  const needsNormalization = ['research', 'submit_research', 'conduct_research'].includes(toolName);

  // If already a structured object without loose fields, pass through (except research tools)
  if (!needsNormalization && params && typeof params === 'object' && !('random_string' in params) && !('raw' in params) && !('text' in params)) {
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
      if (parsed && parsed.job_id) return parsed;
      return { job_id: s || String(parsed._raw || '') };

    case 'cancel_job':
      if (parsed && parsed.job_id) return parsed;
      return { job_id: s || String(parsed._raw || '') };

    case 'get_report':
    case 'get_report_content':
      // Handle various input formats: { reportId }, { id }, number, string
      if (parsed && parsed.reportId !== undefined) return { ...parsed, reportId: String(parsed.reportId) };
      if (parsed && parsed.id !== undefined) return { reportId: String(parsed.id), ...parsed };
      if (parsed && parsed.report_id !== undefined) return { reportId: String(parsed.report_id), ...parsed };
      // Handle numeric or string-only input
      const rid = s || String(parsed._raw || params || '');
      if (/^\d+$/.test(rid.trim())) return { reportId: rid.trim() };
      return { reportId: rid };

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

    case 'search':
      // Accept either 'q' or 'query' parameter
      if (parsed && (parsed.q || parsed.query)) return parsed;
      return s ? { q: s } : {};

    // Note: 'retrieve' case is handled above at line 503-518

    case 'get_server_status':
      return {}; // no params

    default:
      // Best-effort passthrough
      return parsed && Object.keys(parsed).length ? parsed : {};
  }
}

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
          if (!query) {
            return {
              description: prompt.description,
              messages: [{ role: 'assistant', content: [{ type: 'text', text: 'Please provide a query parameter to generate a research plan.' }] }]
            };
          }
    const p = require('../agents/planningAgent');
          const planResult = await p.planResearch(query, { domain, complexity, maxAgents }, null, 'prompt');
          return { 
            description: prompt.description,
            messages: [{ role: 'assistant', content: [{ type: 'text', text: planResult }] }]
          };
          
        case 'synthesis_prompt':
    const c = require('../agents/contextAgent');
          let parsedResults = [];
          try {
            parsedResults = results ? JSON.parse(results) : [];
          } catch (e) {
            parsedResults = [];
          }
          let synthesisResult = '';
          for await (const ch of c.contextualizeResultsStream(query, parsedResults, [], { 
            includeSources: true, 
            outputFormat: outputFormat || 'report',
            audienceLevel: audienceLevel || 'intermediate'
          }, 'prompt')) {
            if (ch.content) synthesisResult += ch.content;
          }
          return { 
            description: prompt.description,
            messages: [{ role: 'assistant', content: [{ type: 'text', text: synthesisResult }] }]
          };
          
        case 'research_workflow_prompt':
          const safeTopic = topic || '[your_topic]';
          const workflowGuide = `
# Research Workflow for: ${safeTopic}

## 1. Planning Phase
\`\`\`mcp
planning_prompt { "query": "${safeTopic}", "domain": "auto-detect", "complexity": "auto-assess" }
\`\`\`

## 2. Research Execution
${async === 'true' ? `
\`\`\`mcp
submit_research { "query": "${safeTopic}", "costPreference": "${costBudget || 'low'}" }
get_job_status { "job_id": "[returned_job_id]" }
\`\`\`
` : `
\`\`\`mcp
conduct_research { "query": "${safeTopic}", "costPreference": "${costBudget || 'low'}" }
\`\`\`
`}

## 3. Quality Assurance
\`\`\`mcp
get_past_research { "query": "${safeTopic}", "limit": 5 }
search { "q": "${safeTopic}", "scope": "reports" }
\`\`\`

## 4. Follow-up Analysis
\`\`\`mcp
research_follow_up { "originalQuery": "${safeTopic}", "followUpQuestion": "[your_specific_question]" }
\`\`\`
          `;
          return {
            description: prompt.description,
            messages: [{ role: 'assistant', content: [{ type: 'text', text: workflowGuide }] }]
          };
          
        default:
          throw new Error(`Unknown prompt: ${request.params.name}`);
      }
    }
  });
}

// Register resources using latest MCP spec with proper protocol handlers and URI templates
// Includes MCP Apps (SEP-1865) ui:// resources for autonomous UI surfacing
if (config.mcp?.features?.resources) {
  const resources = new Map([
    // === MCP Apps UI Resources (SEP-1865) ===
    ['ui://research/viewer', {
      uri: 'ui://research/viewer',
      name: 'Research Report Viewer',
      description: 'Interactive viewer for research reports with citation linking and markdown rendering',
      mimeType: 'text/html+mcp',
      linkedTools: ['research', 'get_report', 'research_follow_up']
    }],
    ['ui://knowledge/graph', {
      uri: 'ui://knowledge/graph',
      name: 'Knowledge Graph Explorer',
      description: 'Force-directed visualization of the knowledge graph with traversal and clustering',
      mimeType: 'text/html+mcp',
      linkedTools: ['search', 'graph_traverse', 'graph_clusters', 'graph_pagerank']
    }],
    ['ui://timeline/session', {
      uri: 'ui://timeline/session',
      name: 'Session Timeline',
      description: 'Time-travel interface showing session history with undo/redo controls',
      mimeType: 'text/html+mcp',
      linkedTools: ['history', 'undo', 'redo', 'time_travel', 'session_state']
    }],
    // === Data Resources ===
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
            spec: 'https://spec.modelcontextprotocol.io/specification/2025-06-18/',
            jsonrpc: 'https://www.jsonrpc.org/specification',
            org: 'https://github.com/modelcontextprotocol',
            docs: 'https://modelcontextprotocol.io/',
            sdk: 'https://github.com/modelcontextprotocol/sdk',
            implementations: {
              openrouter_agents: 'https://github.com/terminals-tech/openrouter-agents',
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

        // === MCP Apps UI Resources (SEP-1865) ===
        case 'ui://research/viewer':
          // Return HTML template for research report viewer
          content = generateUITemplate('research-viewer', {
            title: 'Research Report Viewer',
            description: 'Interactive research report display with markdown rendering',
            linkedTools: ['research', 'get_report', 'research_follow_up'],
            capabilities: ['markdown-rendering', 'citation-linking', 'export-pdf']
          });
          return {
            contents: [{
              uri: resource.uri,
              mimeType: 'text/html',
              text: content
            }]
          };

        case 'ui://knowledge/graph':
          // Return HTML template for knowledge graph explorer
          content = generateUITemplate('graph-explorer', {
            title: 'Knowledge Graph Explorer',
            description: 'Force-directed graph visualization with D3.js',
            linkedTools: ['search', 'graph_traverse', 'graph_clusters', 'graph_pagerank'],
            capabilities: ['force-directed', 'clustering', 'path-finding', 'pagerank']
          });
          return {
            contents: [{
              uri: resource.uri,
              mimeType: 'text/html',
              text: content
            }]
          };

        case 'ui://timeline/session':
          // Return HTML template for session timeline
          content = generateUITemplate('timeline', {
            title: 'Session Timeline',
            description: 'Time-travel debugging interface for session history',
            linkedTools: ['history', 'undo', 'redo', 'time_travel', 'session_state'],
            capabilities: ['undo-redo', 'time-travel', 'checkpoints', 'forking']
          });
          return {
            contents: [{
              uri: resource.uri,
              mimeType: 'text/html',
              text: content
            }]
          };

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

// Register tools (minimal unified set)
register(
  "research",
  researchSchema,
  async (params, exchange) => {
    const requestId = `req-${Date.now()}`;
    try {
      // Pre-flight check for research operations
      const { runResearchPreflight } = require('../utils/preflight');
      const preflight = await runResearchPreflight(dbClient);

      if (!preflight.passed) {
        const { formatErrorForResponse } = require('../utils/errors');
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: true,
              message: preflight.toError().message,
              code: 'PREFLIGHT_FAILED',
              checks: preflight.checks,
              errors: preflight.errors,
              warnings: preflight.warnings
            }, null, 2)
          }],
          isError: true
        };
      }

      const norm = normalizeParamsForTool('research', params);
      logger.info('Research params normalized', { requestId, normalizedQuery: norm?.query?.substring(0, 100), hasQuery: !!norm?.query });
      const text = await researchTool(norm, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      const { formatErrorForResponse } = require('../utils/errors');
      const errorResponse = formatErrorForResponse(e, true);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ...errorResponse, requestId }, null, 2)
        }],
        isError: true
      };
    }
  }
);
register(
  "agent",
  require('./tools').agentSchema,
  async (params, exchange) => {
    try { const norm = normalizeParamsForTool('agent', params); const text = await require('./tools').agentTool(norm, exchange, `req-${Date.now()}`); return { content: [{ type: 'text', text }] }; }
    catch (e) { return { content: [{ type: 'text', text: `Error agent: ${e.message}` }], isError: true }; }
  }
);
register(
  "ping",
  require('./tools').pingSchema,
  wrapWithHandler('ping', require('./tools').pingTool, false)
);
register(
  "job_status",
  getJobStatusSchema,
  wrapWithHandler('job_status', getJobStatusTool)
);
register(
  "cancel_job",
  cancelJobSchema,
  wrapWithHandler('cancel_job', cancelJobTool)
);
register(
  "retrieve",
  retrieveSchema,
  wrapWithHandler('retrieve', retrieveTool)
);
register(
  "get_report",
  getReportContentSchema,
  wrapWithHandler('get_report', getReportContent)
);
register(
  "history",
  listResearchHistorySchema,
  wrapWithHandler('history', listResearchHistory)
);
register(
  "date_time",
  dateTimeSchema,
  wrapWithHandler('date_time', dateTimeTool)
);
register(
  "calc",
  calcSchema,
  wrapWithHandler('calc', calcTool)
);
register(
  "list_tools",
  listToolsSchema,
  wrapWithHandler('list_tools', listToolsTool)
);
register(
  "search_tools",
  searchToolsSchema,
  wrapWithHandler('search_tools', searchToolsTool)
);
register(
  "get_server_status",
  getServerStatusSchema,
  async (params, exchange) => {
    try { const text = await getServerStatus({}, exchange, `req-${Date.now()}`); return { content: [{ type: 'text', text }] }; }
    catch (e) { return { content: [{ type: 'text', text: `Error get_server_status: ${e.message}` }], isError: true }; }
  }
);

// Semantic aliases - provide clearer names for common operations
register("search", searchSchema, wrapWithHandler('search', searchTool));
register("query", querySchema, wrapWithHandler('query', queryTool));
register("research_follow_up", researchFollowUpSchema, async (p, ex) => { try { const norm = normalizeParamsForTool('research_follow_up', p); const t = await researchFollowUp(norm, ex, `req-${Date.now()}`); return { content: [{ type: 'text', text: t }] }; } catch (e){ return { content: [{ type: 'text', text: `Error research_follow_up: ${e.message}`}], isError:true }; }});

// Batch research - dispatch multiple queries in single call
register("batch_research", batchResearchSchema, async (p, ex) => {
  try {
    const requestId = `batch-${Date.now()}`;
    const result = await batchResearchTool(p, ex, requestId);
    return { content: [{ type: 'text', text: result }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error batch_research: ${e.message}` }], isError: true };
  }
});

// ==========================================
// Session & Time-Travel Tools (@terminals-tech/core)
// ==========================================

// Session tool legacy implementations (for when handlers disabled)
// Each method calls ensureIntegrations() to guarantee sessionManager is initialized
const sessionLegacy = {
  undo: async (p) => {
    await ensureIntegrations();
    return JSON.stringify(await sessionManager.undo(p.sessionId || 'default'), null, 2);
  },
  redo: async (p) => {
    await ensureIntegrations();
    return JSON.stringify(await sessionManager.redo(p.sessionId || 'default'), null, 2);
  },
  fork_session: async (p) => {
    await ensureIntegrations();
    const newId = p.newSessionId || `fork_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    return JSON.stringify(await sessionManager.forkSession(p.sessionId || 'default', newId), null, 2);
  },
  time_travel: async (p) => {
    await ensureIntegrations();
    return JSON.stringify(await sessionManager.timeTravel(p.sessionId || 'default', p.timestamp), null, 2);
  },
  session_state: async (p) => {
    await ensureIntegrations();
    return JSON.stringify(await sessionManager.getState(p.sessionId || 'default'), null, 2);
  },
  checkpoint: async (p) => {
    await ensureIntegrations();
    return JSON.stringify(await sessionManager.createCheckpoint(p.sessionId || 'default', p.name), null, 2);
  }
};

register("undo", {
  sessionId: z.string().optional().describe("Session ID (defaults to 'default')")
}, wrapWithHandler('undo', sessionLegacy.undo, false));

register("redo", {
  sessionId: z.string().optional().describe("Session ID (defaults to 'default')")
}, wrapWithHandler('redo', sessionLegacy.redo, false));

register("fork_session", {
  sessionId: z.string().optional().describe("Session ID to fork (defaults to 'default')"),
  newSessionId: z.string().optional().describe("ID for the new forked session")
}, wrapWithHandler('fork_session', sessionLegacy.fork_session, false));

register("time_travel", {
  sessionId: z.string().optional().describe("Session ID"),
  timestamp: z.string().describe("ISO timestamp to navigate to")
}, wrapWithHandler('time_travel', sessionLegacy.time_travel, false));

register("session_state", {
  sessionId: z.string().optional().describe("Session ID (defaults to 'default')")
}, wrapWithHandler('session_state', sessionLegacy.session_state, false));

register("checkpoint", {
  sessionId: z.string().optional().describe("Session ID"),
  name: z.string().describe("Name for the checkpoint")
}, wrapWithHandler('checkpoint', sessionLegacy.checkpoint, false));

// ==========================================
// Knowledge Graph Tools (@terminals-tech/graph)
// ==========================================

// Graph tool legacy implementations (for when handlers disabled)
// Each method calls ensureIntegrations() to guarantee knowledgeGraph is initialized
const graphLegacy = {
  traverse: async (p) => {
    await ensureIntegrations();
    return JSON.stringify(await knowledgeGraph.traverse(p.startNode, p.depth || 3, p.strategy || 'semantic'), null, 2);
  },
  path: async (p) => {
    await ensureIntegrations();
    return JSON.stringify(await knowledgeGraph.findPath(p.from, p.to), null, 2);
  },
  clusters: async () => {
    await ensureIntegrations();
    return JSON.stringify(await knowledgeGraph.getClusters(), null, 2);
  },
  pagerank: async (p) => {
    await ensureIntegrations();
    return JSON.stringify(await knowledgeGraph.getPageRank(p.topK || 20), null, 2);
  },
  patterns: async (p) => {
    await ensureIntegrations();
    return JSON.stringify(await knowledgeGraph.findPatterns(p.n || 3), null, 2);
  },
  stats: async () => {
    await ensureIntegrations();
    return JSON.stringify(await knowledgeGraph.getStats(), null, 2);
  }
};

register("graph_traverse", {
  startNode: z.string().describe("Starting node ID (e.g., 'report:5')"),
  depth: z.number().optional().default(3).describe("Max traversal depth"),
  strategy: z.enum(['bfs', 'dfs', 'semantic']).optional().default('semantic').describe("Traversal strategy")
}, wrapWithHandler('graph_traverse', graphLegacy.traverse, false));

register("graph_path", {
  from: z.string().describe("Source node ID"),
  to: z.string().describe("Target node ID")
}, wrapWithHandler('graph_path', graphLegacy.path, false));

register("graph_clusters", {}, wrapWithHandler('graph_clusters', graphLegacy.clusters, false));

register("graph_pagerank", {
  topK: z.number().optional().default(20).describe("Number of top nodes to return")
}, wrapWithHandler('graph_pagerank', graphLegacy.pagerank, false));

register("graph_patterns", {
  n: z.number().optional().default(3).describe("N-gram size for pattern extraction")
}, wrapWithHandler('graph_patterns', graphLegacy.patterns, false));

register("graph_stats", {}, wrapWithHandler('graph_stats', graphLegacy.stats, false));

// ==========================================
// MCP 2025-11-25 Protocol Tools (SEP-1686, SEP-1577, SEP-1036)
// ==========================================

// Task Protocol Tools (SEP-1686)
// Note: taskId is accepted for backward compatibility but job_id is the canonical form
// after normalization. The normalize.js TOOL_ALIASES converts taskId -> job_id.
const taskLegacy = {
  get: async (p) => JSON.stringify(await taskAdapter.getTask(p.job_id || p.taskId), null, 2),
  result: async (p) => JSON.stringify(await taskAdapter.getTaskResult(p.job_id || p.taskId), null, 2),
  cancel: async (p) => JSON.stringify(await taskAdapter.cancelTask(p.job_id || p.taskId), null, 2),
  list: async (p) => JSON.stringify(await taskAdapter.listTasks(p.cursor, p.limit || 20), null, 2)
};

// Accept both job_id (canonical) and taskId (backward compat) in schema
register("task_get", {
  job_id: z.string().optional().describe("Job ID to retrieve (canonical)"),
  taskId: z.string().optional().describe("Task ID (alias for job_id, backward compatible)")
}, wrapWithHandler('task_get', taskLegacy.get, true));  // Enable normalization

register("task_result", {
  job_id: z.string().optional().describe("Job ID to get result for (canonical)"),
  taskId: z.string().optional().describe("Task ID (alias for job_id, backward compatible)")
}, wrapWithHandler('task_result', taskLegacy.result, true));  // Enable normalization

register("task_cancel", {
  job_id: z.string().optional().describe("Job ID to cancel (canonical)"),
  taskId: z.string().optional().describe("Task ID (alias for job_id, backward compatible)")
}, wrapWithHandler('task_cancel', taskLegacy.cancel, true));  // Enable normalization

register("task_list", { cursor: z.string().optional(), limit: z.number().optional() },
  wrapWithHandler('task_list', taskLegacy.list, true));  // Enable normalization for consistency

// Sampling with Tools (SEP-1577)
register("sample_message", {
  messages: z.array(z.object({ role: z.string(), content: z.string() })).describe("Messages for sampling"),
  model: z.string().optional().describe("Model preference"),
  maxTokens: z.number().optional().describe("Max tokens")
}, async (p, ex) => {
  try {
    const result = await samplingHandler.createMessage({ params: p }, ex);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error sample_message: ${e.message}` }], isError: true };
  }
});

// Elicitation Response (SEP-1036)
register("elicitation_respond", {
  requestId: z.string().describe("Elicitation request ID"),
  response: z.record(z.any()).describe("User response data")
}, async (p) => {
  try {
    const result = await elicitationHandler.handleResponse(p.requestId, p.response);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error elicitation_respond: ${e.message}` }], isError: true };
  }
});

// Web Search Tool - Real-time web grounding for factual queries
register("search_web", searchWebSchema, async (p, ex) => {
  try {
    const result = await searchWeb(p, ex, `req-${Date.now()}`);
    return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error search_web: ${e.message}` }], isError: true };
  }
});

// URL Fetch Tool - Retrieve and parse web page content
register("fetch_url", fetchUrlSchema, async (p, ex) => {
  try {
    const result = await fetchUrl(p, ex, `req-${Date.now()}`);
    return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error fetch_url: ${e.message}` }], isError: true };
  }
});

 // Set up transports based on environment
 const setupTransports = async () => {
  let lastSseTransport = null; // Variable to hold the last SSE transport
  const sseConnections = new Map(); // Map to store active SSE connections

  // Transport mode detection per MCP spec (STDIO is default per spec: "Clients SHOULD support stdio")
  const hasStdioFlag = process.argv.includes('--stdio');
  const hasHttpFlag = process.argv.includes('--http');

  // Mutual exclusivity check
  if (hasStdioFlag && hasHttpFlag) {
    logger.error('Cannot specify both --stdio and --http flags');
    process.exit(1);
  }

  // STDIO transport: explicit --stdio flag OR default when no flags specified
  if (hasStdioFlag || !hasHttpFlag) {
    // STDIO mode - no logging to stdout/stderr during operation (JSON-RPC protocol)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return; // Exit after setting up stdio, don't proceed to HTTP setup
  }

  // HTTP/SSE transport: only when --http is explicitly specified
  {
  // For HTTP usage, set up Express with SSE and optional Streamable HTTP
    const app = express();
    const port = config.server.port;
  // OAuth2/JWT placeholder: use AUTH_JWKS_URL or fallback to API key until configured
  const serverApiKey = config.server.apiKey;
  const jwksUrl = process.env.AUTH_JWKS_URL || null;
  const expectedAudience = process.env.AUTH_EXPECTED_AUD || 'mcp-server';

  // Supabase auth for terminals.tech OAuth (Google/GitHub)
  const supabaseAuth = require('./auth/supabaseAuth');

  app.use(cors({ origin: '*', exposedHeaders: ['Mcp-Session-Id'], allowedHeaders: ['Content-Type', 'authorization', 'mcp-session-id'] }));

  // Rate limiting middleware - production hardening
  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
  });
  app.use(limiter);

  // Request size limits
  app.use(express.json({ limit: '10mb' }));

  // Enforce HTTPS in production when required
  if (config.server.requireHttps) {
    app.use((req, res, next) => {
      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      if (proto !== 'https') return res.status(400).json({ error: 'HTTPS required' });
      next();
    });
  }
    
  // Authentication Middleware (Supabase JWT → Enterprise JWT → API key)
  const authenticate = async (req, res, next) => {
    const allowNoAuth = process.env.ALLOW_NO_API_KEY === 'true';
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      if (allowNoAuth) return next();
      return res.status(401).json({ error: 'Unauthorized: Missing bearer token' });
    }
    const token = authHeader.split(' ')[1];

    // 1. Try Supabase auth first (terminals.tech Google/GitHub OAuth)
    if (supabaseAuth.isEnabled()) {
      try {
        const user = await supabaseAuth.validateToken(token);
        req.user = user;
        req.userId = user.userId;
        return next();
      } catch (e) {
        // Fall through to other auth methods
      }
    }

    // 2. Try enterprise JWKS auth
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
        if (!serverApiKey && !supabaseAuth.isEnabled()) {
          return res.status(403).json({ error: 'Forbidden: JWT verification failed' });
        }
        // Fall through to API key if configured
      }
    }

    // 3. Try API key auth
    if (serverApiKey && token === serverApiKey) return next();
    if (allowNoAuth) return next();
    return res.status(403).json({ error: 'Forbidden: Auth failed' });
  };
 
  logger.info('Starting MCP server with HTTP/SSE transport', { port });
  if (supabaseAuth.isEnabled()) {
    logger.info('Supabase auth enabled (terminals.tech OAuth)', { providers: ['google', 'github'] });
  }
  if (jwksUrl) {
    logger.info('Enterprise JWT auth enabled', { jwksUrl, audience: expectedAudience });
  } else if (serverApiKey) {
    logger.info('API key fallback enabled for HTTP transport');
  } else if (process.env.ALLOW_NO_API_KEY === 'true') {
    logger.warn('Authentication DISABLED for HTTP transport (ALLOW_NO_API_KEY=true)');
  } else if (!supabaseAuth.isEnabled()) {
    logger.error('No auth configured. Set SUPABASE_JWT_SECRET or SERVER_API_KEY');
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
      logger.warn('StreamableHTTP transport not available', { error: e.message });
    }
  }

   // Endpoint for SSE - Apply authentication middleware
   // Endpoint for SSE - Apply authentication middleware
   app.get('/sse', authenticate, async (req, res) => {
     const connectionId = uuidv4(); // Generate a unique ID for this connection
     logger.debug('New SSE connection established', { connectionId });

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
       logger.debug('MCP Server connected to SSE transport', { connectionId });
     } catch (error) {
       logger.error('Error connecting MCP Server to SSE transport', { connectionId, error });
       sseConnections.delete(connectionId); // Clean up on connection error
       if (!res.writableEnded) {
         res.end();
       }
       return; // Stop further processing for this request
     }

     // Handle client disconnect
     req.on('close', () => {
       logger.debug('SSE connection closed', { connectionId });
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

   // Batch job events SSE - multiplexes multiple job streams
   app.get('/jobs/batch/events', authenticate, async (req, res) => {
     const idsParam = req.query.ids || '';
     const jobIds = idsParam.split(',').map(s => s.trim()).filter(Boolean);

     if (!jobIds.length) {
       return res.status(400).json({ error: 'ids query parameter required (comma-separated job IDs)' });
     }

     res.writeHead(200, {
       'Content-Type': 'text/event-stream',
       'Cache-Control': 'no-cache',
       'Connection': 'keep-alive'
     });

     const lastEventIds = new Map(); // jobId -> lastEventId
     jobIds.forEach(id => lastEventIds.set(id, 0));

     const completedJobs = new Set();
     const jobResults = new Map();

     const send = (type, data) => {
       try {
         res.write(`event: ${type}\n`);
         res.write(`data: ${JSON.stringify(data)}\n\n`);
       } catch(_) {}
     };

     send('open', { ok: true, jobIds, jobCount: jobIds.length });

     const timer = setInterval(async () => {
       try {
         // Poll each job for events
         for (const jobId of jobIds) {
           if (completedJobs.has(jobId)) continue;

           const lastId = lastEventIds.get(jobId) || 0;
           const events = await dbClient.getJobEvents(jobId, lastId, 100);

           for (const ev of events) {
             lastEventIds.set(jobId, ev.id);
             send(ev.event_type || 'message', { ...ev, jobId });
           }

           const j = await dbClient.getJobStatus(jobId);
           if (j && ['succeeded', 'failed', 'canceled'].includes(j.status)) {
             completedJobs.add(jobId);
             let result = j.result;
             if (typeof result === 'string') {
               try { result = JSON.parse(result); } catch (_) {}
             }
             jobResults.set(jobId, { status: j.status, result, reportId: result?.report_id || result?.reportId });
             send('job_complete', { jobId, status: j.status, reportId: result?.report_id || result?.reportId });
           }
         }

         // Emit progress summary
         const progress = {
           total: jobIds.length,
           completed: completedJobs.size,
           pending: jobIds.length - completedJobs.size,
           percent: Math.round((completedJobs.size / jobIds.length) * 100)
         };
         send('batch_progress', progress);

         // Check if all jobs complete
         if (completedJobs.size === jobIds.length) {
           const results = jobIds.map(id => ({
             jobId: id,
             ...jobResults.get(id)
           }));
           const reportIds = results.filter(r => r.reportId).map(r => r.reportId);
           send('batch_complete', {
             jobCount: jobIds.length,
             results,
             reportIds,
             allSucceeded: results.every(r => r.status === 'succeeded')
           });
           clearInterval(timer);
           if (!res.writableEnded) res.end();
         }
       } catch (e) {
         send('error', { message: e.message });
       }
     }, 500); // Faster polling for batch - 500ms

     req.on('close', () => { clearInterval(timer); });
   });

   // Simple HTTP job submission for testing and automation
   app.post('/jobs', authenticate, express.json(), async (req, res) => {
     try {
       const params = req.body || {};
       // Normalize params before storage to ensure query field exists
       const normalized = normalizeParamsForTool('research', params);
       if (!normalized.query || typeof normalized.query !== 'string' || normalized.query.trim() === '') {
         return res.status(400).json({ error: 'query parameter is required' });
       }
       const jobId = await dbClient.createJob('research', normalized);
       await dbClient.appendJobEvent(jobId, 'submitted', { query: normalized.query });
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

   // Health endpoint for monitoring (no auth required)
   app.get('/health', async (req, res) => {
     try {
       const dbInitialized = dbClient.isDbInitialized();
       const embedderReady = dbClient.isEmbedderReady();
       const healthy = dbInitialized; // Minimum: DB must be initialized

       res.status(healthy ? 200 : 503).json({
         status: healthy ? 'healthy' : 'unhealthy',
         version: config.server.version,
         timestamp: new Date().toISOString(),
         checks: {
           database: dbInitialized ? 'ok' : 'not_initialized',
           embedder: embedderReady ? 'ready' : 'initializing'
         }
       });
     } catch (e) {
       res.status(503).json({
         status: 'unhealthy',
         error: e.message,
         timestamp: new Date().toISOString()
       });
     }
   });

   // Auth configuration endpoint for clients (no auth required)
   // Tells clients how to authenticate with this server
   app.get('/auth/config', (req, res) => {
     res.json({
       supabase: supabaseAuth.getAuthConfig(),
       enterprise: {
         enabled: !!jwksUrl,
         jwksUrl: jwksUrl || null
       },
       apiKey: {
         enabled: !!serverApiKey
       },
       instructions: supabaseAuth.isEnabled()
         ? 'Login at terminals.tech with Google or GitHub. Use the returned access_token in Authorization: Bearer <token>'
         : jwksUrl
           ? 'Use enterprise SSO JWT in Authorization: Bearer <token>'
           : serverApiKey
             ? 'Use SERVER_API_KEY in Authorization: Bearer <key>'
             : 'No authentication configured'
     });
   });

   // OAuth redirect helper - redirects to terminals.tech login
   app.get('/auth/login/:provider', (req, res) => {
     const { provider } = req.params;
     const redirectTo = req.query.redirect_to || `${req.protocol}://${req.get('host')}/auth/callback`;

     if (!supabaseAuth.isEnabled()) {
       return res.status(400).json({ error: 'Supabase auth not configured' });
     }

     if (!['google', 'github'].includes(provider)) {
       return res.status(400).json({ error: 'Invalid provider. Use google or github' });
     }

     try {
       const loginUrl = supabaseAuth.getOAuthUrl(provider, redirectTo);
       res.redirect(loginUrl);
     } catch (e) {
       res.status(500).json({ error: e.message });
     }
   });

   // Callback handler - displays token for user to copy
   app.get('/auth/callback', (req, res) => {
     // Supabase redirects with tokens in URL hash (client-side)
     // This page extracts them and displays for MCP client setup
     res.send(`<!DOCTYPE html>
<html>
<head>
  <title>terminals.tech MCP Auth</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
    .token { background: #f0f0f0; padding: 10px; border-radius: 4px; word-break: break-all; font-family: monospace; font-size: 12px; }
    .success { color: #22c55e; }
    .error { color: #ef4444; }
    button { margin-top: 10px; padding: 8px 16px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>terminals.tech MCP Authentication</h1>
  <div id="result"></div>
  <script>
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const error = params.get('error_description') || params.get('error');

    const result = document.getElementById('result');
    if (accessToken) {
      result.innerHTML = \`
        <p class="success">Authentication successful!</p>
        <p>Your access token (copy this for MCP client):</p>
        <div class="token" id="token">\${accessToken}</div>
        <button onclick="navigator.clipboard.writeText(document.getElementById('token').textContent)">Copy Token</button>
        <p style="margin-top: 20px;">Use this in your MCP client configuration:</p>
        <pre>Authorization: Bearer \${accessToken.substring(0, 20)}...</pre>
      \`;
    } else if (error) {
      result.innerHTML = \`<p class="error">Error: \${error}</p>\`;
    } else {
      result.innerHTML = '<p>Waiting for authentication...</p>';
    }
  </script>
</body>
</html>`);
   });

   // Verify token endpoint - check if a token is valid
   app.get('/auth/verify', authenticate, (req, res) => {
     res.json({
       valid: true,
       user: req.user || null,
       userId: req.userId || null
     });
   });

   // Server discovery endpoint for MCP clients (SEP-1649 Server Cards)
   // No auth required per MCP draft spec Nov 2025
   app.get('/.well-known/mcp-server', (req, res) => {
     const { Domain, Role, ToolCategory, ToolRequirements, getToolsByCategory, getToolsByRole } = require('../utils/preflight');

     // Build tool taxonomy from Agent Zero type system
     const toolTaxonomy = {
       domains: Object.values(Domain),
       roles: Object.values(Role),
       categories: Object.values(ToolCategory),
       byCategory: {},
       byRole: {}
     };

     // Populate by category
     for (const cat of Object.values(ToolCategory)) {
       toolTaxonomy.byCategory[cat] = getToolsByCategory(cat);
     }

     // Populate by role
     for (const role of Object.values(Role)) {
       toolTaxonomy.byRole[role] = getToolsByRole(role);
     }

     // Tool interface specifications
     const toolInterfaces = Object.entries(ToolRequirements).reduce((acc, [name, spec]) => {
       if (spec.inputs && spec.output) {
         acc[name] = {
           inputs: spec.inputs,
           output: spec.output,
           role: spec.role,
           category: spec.category
         };
       }
       return acc;
     }, {});

     res.json({
       // SEP-1649 Server Card format
       serverInfo: {
         name: config.server.name,
         version: config.server.version,
         title: 'OpenRouter Agents MCP Server',
         description: 'Multi-agent deep research with knowledge graph and session time-travel'
       },
       protocolVersion: '2025-06-18',
       protocolDraft: '2025-11-25',
       capabilities: {
         tools: { listChanged: true },
         prompts: { listChanged: true },
         resources: { subscribe: true, listChanged: true },
         logging: {},
         async: true,
         streaming: true,
         authentication: ['jwt', 'bearer', 'optional']
       },
       transports: [
         {
           type: 'stdio',
           command: 'npx @terminals-tech/openrouter-agents --stdio',
           description: 'Standard I/O transport for IDE integration'
         },
         {
           type: 'sse',
           endpoint: '/sse',
           messageEndpoint: '/messages',
           description: 'Server-Sent Events transport with per-connection routing'
         },
         {
           type: 'http',
           endpoint: '/mcp',
           description: 'StreamableHTTP transport (if enabled)'
         }
       ],
       endpoints: {
         health: '/health',
         metrics: '/metrics',
         jobs: '/jobs',
         jobEvents: '/jobs/:jobId/events',
         discovery: '/.well-known/mcp-server',
         ui: '/ui'
       },
       // Agent Zero Type System - enables composition validation
       agentZero: {
         version: '1.0.0',
         description: 'Interface domain taxonomy for tool composition validation',
         compositionRule: 'A @ B valid iff A.output ∈ B.inputs',
         taxonomy: toolTaxonomy,
         interfaces: toolInterfaces
       },
       extensions: {
         'async-operations': {
           version: '1.0',
           description: 'Long-running async operations via job system',
           endpoints: {
             submit: '/jobs',
             status: 'tool:job_status',
             cancel: 'tool:cancel_job',
             events: '/jobs/:jobId/events'
           }
         },
         'knowledge-base': {
           version: '1.0',
           description: 'Semantic knowledge base with hybrid BM25+vector search',
           features: ['vector-search', 'bm25', 'hybrid-fusion', 'llm-rerank']
         },
         'multi-agent': {
           version: '1.0',
           description: 'Multi-agent orchestration (planning → research → synthesis)',
           features: ['domain-aware-planning', 'ensemble-execution', 'streaming-synthesis']
         },
         'observation-loop': {
           version: '1.0',
           description: 'Agent Zero feedback loop for convergence tracking',
           features: ['tool-observation', 'convergence-metrics', 'self-improvement']
         },
         'session-time-travel': {
           version: '1.0',
           description: 'Session management with undo/redo and branching',
           features: ['undo', 'redo', 'fork', 'checkpoint', 'time-travel']
         },
         'knowledge-graph': {
           version: '1.0',
           description: 'Graph-based knowledge navigation',
           features: ['traverse', 'path-finding', 'clustering', 'pagerank', 'patterns']
         }
       },
       contact: {
         name: 'Tej Desai',
         email: 'admin@terminals.tech',
         url: 'https://terminals.tech'
       },
       repository: 'https://github.com/wheattoast11/openrouter-deep-research-mcp',
       homepage: 'https://terminals.tech'
     });
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
        logger.warn('POST /messages for unknown connectionId', { connectionId });
        return res.status(404).json({ error: 'Unknown connectionId' });
      }
      logger.debug('Routing POST /messages', { connectionId });
      return transport.handlePostMessage(req, res);
    }

    // Legacy behavior: fall back to last transport if no connectionId provided
    if (!lastSseTransport) {
      logger.warn('POST /messages without connectionId and no active SSE transport');
      return res.status(500).json({ error: 'No active SSE transport available' });
    }
    logger.debug('Handling legacy POST /messages via last active SSE transport');
    return lastSseTransport.handlePostMessage(req, res);
  });

   // Start server with error handling
   const httpServer = app.listen(port);

   httpServer.on('error', (err) => {
     if (err.code === 'EADDRINUSE') {
       logger.error('Port already in use', {
         port,
         suggestion: `Another instance running? Try: lsof -i tcp:${port}`,
         alternatives: [
           'Use STDIO transport (default): npx @terminals-tech/openrouter-agents',
           `Use different port: SERVER_PORT=${port + 1} npx @terminals-tech/openrouter-agents --http`
         ]
       });
       process.exit(1); // Clean exit instead of crash
     }
     throw err;
   });

   httpServer.on('listening', () => {
     logger.info('MCP server listening', { port, transport: 'HTTP' });
   });
  } // Close the block for HTTP setup
 };

 /**
  * Job worker function - processes async research jobs
  * Only starts if database is initialized
  */
 function startJobWorker() {
   const initState = dbClient.getInitState ? dbClient.getInitState() : null;
   if (initState !== 'INITIALIZED' && !dbClient.isDbInitialized()) {
     logger.warn('Job worker not started: database not initialized', { initState });
     return;
   }

   logger.info('Starting job worker', { concurrency: require('../../config').jobs.concurrency });

   const { concurrency, heartbeatMs } = require('../../config').jobs;
   const runners = Array.from({ length: Math.max(1, concurrency) }, () => (async function loop(){
     while (true) {
       try {
         // Pre-flight check before claiming work
         const { quickCheck } = require('../utils/preflight');
         const health = quickCheck(dbClient);
         if (!health.ready) {
           logger.warn('JobWorker unhealthy', { issues: health.issues });
           await new Promise(r => setTimeout(r, 5000));
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
             // Validate query parameter before execution - fail fast with clear error
             if (!params?.query || typeof params.query !== 'string' || params.query.trim() === '') {
               logger.error('Job missing query parameter', { jobId, params: JSON.stringify(params).substring(0, 200) });
               throw new Error(`Job ${jobId} missing required query parameter`);
             }
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
           // Wrap error with full context for detailed diagnosis
           const { wrapError, formatErrorForLog } = require('../utils/errors');
           const wrapped = wrapError(e, `Job ${jobId} failed`, { requestId: jobId });

           logger.error('Job failed', formatErrorForLog(wrapped, jobId));

           await dbClient.setJobStatus(jobId, 'failed', {
             result: {
               error: wrapped.message,
               category: wrapped.category,
               code: wrapped.code,
               isRetryable: wrapped.isRetryable,
               originalError: e.message,
               stack: e.stack?.split('\n').slice(0, 5).join('\n')
             },
             finished: true
           });
           await dbClient.appendJobEvent(jobId, 'error', {
             message: wrapped.message,
             category: wrapped.category,
             code: wrapped.code,
             isRetryable: wrapped.isRetryable,
             originalError: e.message
           });
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
       } catch (loopError) {
         // Log worker loop errors with full context instead of swallowing
         const { formatErrorForLog } = require('../utils/errors');
         logger.error('JobWorker loop error', formatErrorForLog(loopError));

         // Distinguish transient vs fatal errors for backoff
         const isFatal = loopError.message?.includes('database') ||
                        loopError.message?.includes('connection') ||
                        loopError.message?.includes('ECONNREFUSED');
         await new Promise(r => setTimeout(r, isFatal ? 5000 : 1000));
       }
     }
   })());
   Promise.allSettled(runners).catch(err => {
     logger.error('Job worker runners failed', { error: err.message });
   });
 }

 /**
  * Main server startup sequence
  * Ensures proper initialization order: DB -> Embedder -> Transports -> Job Worker
  */
 async function startServer() {
   const startupConfig = require('../../config');
   const startupTimeoutMs = startupConfig.server?.startupTimeoutMs || 30000;
   const allowStartWithoutDb = startupConfig.server?.allowStartWithoutDb === true;

   logger.info('Phase 1/4: Initializing database...');
   try {
     // Wait for database initialization with timeout
     if (typeof dbClient.waitForInit === 'function') {
       await dbClient.waitForInit(startupTimeoutMs);
       logger.info('Database initialized successfully', { state: dbClient.getInitState?.() });
     } else {
       // Legacy fallback - just check if initialized
       const isInit = dbClient.isDbInitialized?.();
       if (!isInit && !allowStartWithoutDb) {
         throw new Error('Database not initialized and ALLOW_START_WITHOUT_DB is not set');
       }
       logger.warn('Using legacy DB initialization check', { initialized: isInit });
     }
   } catch (dbError) {
     if (allowStartWithoutDb) {
       logger.warn('Database initialization failed, continuing in degraded mode', {
         error: dbError.message,
         allowStartWithoutDb: true
       });
     } else {
       logger.error('FATAL: Database initialization failed', { error: dbError.message });
       throw dbError;
     }
   }

   logger.info('Phase 2/4: Initializing embedder...');
   try {
     // Initialize embedder (non-blocking - vector search is optional)
     if (typeof dbClient.waitForEmbedder === 'function') {
       await dbClient.waitForEmbedder(10000).catch(e => {
         logger.warn('Embedder init failed (vector search degraded)', { error: e.message });
       });
     } else {
       // Legacy check
       const embedderReady = dbClient.isEmbedderReady?.();
       logger.info('Embedder status', { ready: embedderReady });
     }
   } catch (embedError) {
     logger.warn('Embedder initialization warning', { error: embedError.message });
     // Continue - embedder is optional
   }

   logger.info('Phase 3/4: Starting transports...');
   await setupTransports();
   logger.info('Transports started successfully');

   logger.info('Phase 4/4: Starting job worker...');
   startJobWorker();

   logger.info('Server startup complete', {
     dbState: dbClient.getInitState?.() || (dbClient.isDbInitialized?.() ? 'INITIALIZED' : 'UNKNOWN'),
     embedderReady: dbClient.isEmbedderReady?.() || false
   });
 }

 // Single entry point with proper error handling
 startServer().catch(error => {
   logger.error('FATAL: Server startup failed', { error: error.message, stack: error.stack });
   process.exit(1);
 });

} // Close else block for --setup-claude check
