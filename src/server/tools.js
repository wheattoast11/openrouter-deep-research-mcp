// src/server/tools.js
const { z } = require('zod');
const NodeCache = require('node-cache');
const fs = require('fs'); // Added for file system operations
const path = require('path'); // Added for path manipulation
const planningAgent = require('../agents/planningAgent');
const researchAgent = require('../agents/researchAgent');
const contextAgent = require('../agents/contextAgent');
const factCheckAgent = require('../agents/factCheckAgent'); // Fact-checking for research output
const { parseAgentXml } = require('../utils/xmlParser'); // Re-enable XML parser import
const dbClient = require('../utils/dbClient'); // Imports necessary functions and status checks
const config = require('../../config');
const modelCatalog = require('../utils/modelCatalog'); // New: dynamic model catalog
const tar = require('tar');
const fetch = require('node-fetch');
const openRouterClient = require('../utils/openRouterClient');
const structuredDataParser = require('../utils/structuredDataParser');
const advancedCache = require('../utils/advancedCache');
const robustWebScraper = require('../utils/robustWebScraper');
const logger = require('../utils/logger').child('Tools');
const { normalize: coreNormalize, GLOBAL_ALIASES } = require('../core/normalize');
const robustScraperInstance = new robustWebScraper();

// ===== RECURSIVE TOOL EXECUTION =====
// Enabled by default with MAX_TOOL_DEPTH=3. Set MAX_TOOL_DEPTH=0 to disable.
const MAX_TOOL_DEPTH = config.toolRecursion?.maxDepth ?? 3;
const toolDepthMap = new Map();

/**
 * Track recursion depth for a request to prevent infinite loops
 * @param {string} requestId - Unique request identifier
 * @returns {number} Current depth for this request
 */
function getToolDepth(requestId) {
  return toolDepthMap.get(requestId) || 0;
}

/**
 * Increment depth before tool call, decrement after
 * @param {Function} toolFn - The tool function to wrap
 * @param {string} requestId - Request ID for tracking
 * @returns {Function} Wrapped function with depth tracking
 */
function withDepthTracking(toolFn, requestId) {
  return async (...args) => {
    if (MAX_TOOL_DEPTH === 0) return toolFn(...args); // Disabled
    const depth = toolDepthMap.get(requestId) || 0;
    if (depth >= MAX_TOOL_DEPTH) {
      throw new Error(`Max tool recursion depth (${MAX_TOOL_DEPTH}) exceeded. Set MAX_TOOL_DEPTH env to increase.`);
    }
    toolDepthMap.set(requestId, depth + 1);
    try {
      return await toolFn(...args);
    } finally {
      toolDepthMap.set(requestId, depth);
      // Cleanup if back to zero
      if (depth === 0) toolDepthMap.delete(requestId);
    }
  };
}

/**
 * Route a tool call by name with depth tracking
 * @param {string} toolName - Name of the tool to call
 * @param {object} params - Tool parameters
 * @param {object} mcpExchange - MCP exchange for progress
 * @param {string} requestId - Request ID for depth tracking
 * @returns {Promise<string>} Tool result
 */
async function routeToTool(toolName, params, mcpExchange, requestId) {
  const depth = getToolDepth(requestId);
  if (MAX_TOOL_DEPTH > 0 && depth >= MAX_TOOL_DEPTH) {
    return JSON.stringify({ error: `Max recursion depth (${MAX_TOOL_DEPTH}) reached`, tool: toolName });
  }

  toolDepthMap.set(requestId, depth + 1);
  try {
    // Route to appropriate tool
    switch (toolName) {
      case 'research':
      case 'conduct_research':
        return await conductResearch(params, mcpExchange, requestId);
      case 'search':
        return await searchTool(params);
      case 'query':
        return await queryTool(params, mcpExchange, requestId);
      case 'retrieve':
        return await retrieveTool(params, mcpExchange, requestId);
      case 'get_report':
      case 'get_report_content':
        return await getReportContent(params, mcpExchange, requestId);
      case 'search_web':
        return await searchWeb(params, mcpExchange, requestId);
      case 'fetch_url':
        return await fetchUrl(params, mcpExchange, requestId);
      case 'list_models':
        return await listModels(params);
      case 'batch_research':
        return await batchResearchTool(params, mcpExchange, requestId);
      case 'ping':
        return await pingTool(params);
      case 'get_server_status':
        return await getServerStatus(params);
      case 'job_status':
      case 'get_job_status':
        return await getJobStatusTool(params);
      case 'date_time':
        return await dateTimeTool(params);
      case 'calc':
        return await calcTool(params);
      case 'history':
      case 'list_research_history':
        return await listResearchHistory(params);
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}`, available: ['research', 'search', 'query', 'retrieve', 'get_report', 'search_web', 'fetch_url'] });
    }
  } finally {
    toolDepthMap.set(requestId, depth);
    if (depth === 0) toolDepthMap.delete(requestId);
  }
}

// Compact param normalization - delegates to core/normalize.js
// Handles: q, cost, aud, fmt, src, imgs, docs, data aliases
function normalizeResearchParams(params) {
  if (!params || typeof params !== 'object') return params;
  // Only apply when simpleTools enabled (default true)
  try { if (require('../../config').simpleTools?.enabled === false) return params; } catch (_) {}

  // Use core normalize for alias mapping
  const out = coreNormalize('research', params);

  // Handle complex transformations for docs/data arrays (not covered by core aliases)
  if (out.docs && !out.textDocuments) {
    if (Array.isArray(out.docs)) {
      out.textDocuments = out.docs.map((d, i) => typeof d === 'string' ? ({ name: `doc_${i+1}.txt`, content: d }) : d);
      delete out.docs;
    }
  }
  if (out.data && !out.structuredData) {
    if (Array.isArray(out.data)) {
      out.structuredData = out.data.map((d, i) => {
        if (typeof d === 'string') return ({ name: `data_${i+1}.json`, type: 'json', content: d });
        return d;
      });
      delete out.data;
    }
  }
  return out;
}

// Indexer tool schemas (opt-in)
const indexTextsSchema = z.object({
  documents: z.array(z.object({
    id: z.string().optional(),
    title: z.string().optional(),
    content: z.string()
  })),
  sourceType: z.enum(['doc','report']).default('doc'),
  _requestId: z.string().optional()
});

const indexUrlSchema = z.object({
  url: z.string().url(),
  maxBytes: z.number().int().positive().optional().default(200000),
  _requestId: z.string().optional()
});

const searchIndexSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional().default(10),
  _requestId: z.string().optional()
});

const indexStatusSchema = z.object({ _requestId: z.string().optional() });

async function index_texts(params, mcpExchange = null, requestId = 'unknown-req') {
  if (!require('../../config').indexer?.enabled) return JSON.stringify({ enabled: false });
  const { documents, sourceType } = params;
  let indexed = 0;
  for (const d of documents) {
    try {
      const id = await dbClient.indexDocument({ sourceType, sourceId: d.id || `doc:${Date.now()}-${indexed}`, title: d.title || null, content: d.content });
      if (id) indexed++;
    } catch (_) {}
  }
  return JSON.stringify({ indexed });
}

async function index_url(params, mcpExchange = null, requestId = 'unknown-req') {
  if (!require('../../config').indexer?.enabled) return JSON.stringify({ enabled: false });
  const { url, maxBytes } = params;
  const raw = await fetchUrl({ url, maxBytes }, mcpExchange, requestId);
  const obj = JSON.parse(raw);
  const title = obj.title || url;
  const content = `${title}\nSource: ${url}\n\n${obj.textSnippet || ''}`;
  const id = await dbClient.indexDocument({ sourceType: 'doc', sourceId: url, title, content });
  return JSON.stringify({ indexed: !!id, id });
}

async function search_index(params, mcpExchange = null, requestId = 'unknown-req') {
  if (!require('../../config').indexer?.enabled) return JSON.stringify({ enabled: false, results: [] });
  const { query, limit } = params;
  const rows = await dbClient.searchHybrid(query, limit);
  return JSON.stringify(rows, null, 2);
}

async function index_status(params, mcpExchange = null, requestId = 'unknown-req') {
  const cfg = require('../../config').indexer || {};
  return JSON.stringify({ enabled: !!cfg.enabled, autoIndexReports: !!cfg.autoIndexReports, embedDocs: !!cfg.embedDocs, weights: cfg.weights || {} }, null, 2);
}

// In-memory Cache Configuration
const CACHE_TTL_SECONDS = config.database.cacheTTL || 3600; // 1 hour in seconds from config
const cache = new NodeCache({
  stdTTL: CACHE_TTL_SECONDS,
  checkperiod: 120, // Check for expired entries every 2 minutes
  maxKeys: 100 // Limit cache size to prevent memory issues
});

process.stderr.write(`[${new Date().toISOString()}] In-memory cache initialized with TTL: ${CACHE_TTL_SECONDS}s, max keys: 100\n`); // Use stderr

function getCacheKey(params) {
  const keyData = {
    query: params.query,
    costPreference: params.costPreference,
    audienceLevel: params.audienceLevel,
    outputFormat: params.outputFormat,
    includeSources: params.includeSources
  };
  // Add image info to cache key if present
  if (params.images && params.images.length > 0) {
    keyData.imageCount = params.images.length;
    keyData.firstImage = params.images[0].url.substring(0, 50);
  }
  // Add text document info to cache key if present
  if (params.textDocuments && params.textDocuments.length > 0) {
    keyData.docCount = params.textDocuments.length;
    keyData.firstDocName = params.textDocuments[0].name.substring(0, 50);
  }
  // Add structured data info to cache key if present
  if (params.structuredData && params.structuredData.length > 0) {
    keyData.structuredDataCount = params.structuredData.length;
    keyData.firstStructuredDataName = params.structuredData[0].name.substring(0, 50);
  }
  return `researchCache:${JSON.stringify(keyData)}`;
}

function getFromCache(key) {
  try {
    const cachedData = cache.get(key);
    if (cachedData) {
      logger.debug('Cache hit', { key: key.substring(0, 50) });
      return cachedData;
    } else {
      logger.debug('Cache miss', { key: key.substring(0, 50) });
      return null;
    }
  } catch (error) {
    logger.error('Cache GET error', { key: key.substring(0, 50), error });
    return null;
  }
}

function setInCache(key, data) {
  try {
    cache.set(key, data);
    logger.debug('Cache set', { key: key.substring(0, 50), ttl: CACHE_TTL_SECONDS });
  } catch (error) {
    logger.error('Cache SET error', { key: key.substring(0, 50), error });
  }
}

// Base schema without transform (for extending)
const conductResearchSchemaBase = z.object({
  query: z.string().min(1, "Query must not be empty").optional(),
  q: z.string().min(1).optional().describe("Alias for query"),
  costPreference: z.enum(['high', 'low']).default('low'),
  cost: z.enum(['high', 'low']).optional().describe("Alias for costPreference"),
  audienceLevel: z.enum(['beginner', 'intermediate', 'expert']).default('intermediate'),
  outputFormat: z.enum(['report', 'briefing', 'bullet_points']).default('report'),
  includeSources: z.boolean().default(true),
  maxLength: z.number().optional(),
  images: z.array(z.object({
    url: z.string().url().or(z.string().startsWith('data:image/')),
    detail: z.enum(['low', 'high', 'auto']).optional().default('auto')
  })).optional().describe("Optional array of images (URLs or base64 data URIs) relevant to the query."),
  textDocuments: z.array(z.object({
    name: z.string().describe("Filename or identifier for the text document."),
    content: z.string().describe("Text content of the document.")
  })).optional().describe("Optional array of text documents relevant to the query."),
  structuredData: z.array(z.object({
    name: z.string().describe("Identifier for the structured data (e.g., filename)."),
    type: z.enum(['csv', 'json']).describe("Type of structured data ('csv' or 'json')."),
    content: z.string().describe("String content of the structured data (e.g., CSV text or JSON string).")
  })).optional().describe("Optional array of structured data inputs relevant to the query."),
  clientContext: z.any().optional().describe("Optional client-provided context about environment (app, os, user, session)."),
  mode: z.enum(['standard','hyper']).optional().default('standard'),
  _mcpExchange: z.any().optional().describe("Internal MCP exchange context for progress reporting"),
  _requestId: z.string().optional().describe("Internal request ID for logging")
});

// Helper to normalize research params - delegates to core/normalize.js
// Zod transform wrapper for schema validation
function normalizeResearchInputSchema(data) {
  return coreNormalize('research', data);
}

// Schema with transform for validation (used for conductResearch which is sync)
const conductResearchSchema = conductResearchSchemaBase
  .transform(normalizeResearchInputSchema)
  .refine((data) => data.query, {
    message: "Either 'query' or 'q' must be provided",
    path: ["query"]
  });

// Async job tool schemas - use base schema with extend, then add transform
const submitResearchSchemaBase = conductResearchSchemaBase.extend({
  notify: z.string().url().optional().describe("Optional webhook to notify on completion")
});
const submitResearchSchema = submitResearchSchemaBase
  .transform(normalizeResearchInputSchema)
  .refine((data) => data.query, { message: "Either 'query' or 'q' must be provided", path: ["query"] })
  .describe("Submit a long-running research job asynchronously. Returns a job_id immediately. Use get_job_status/cancel_job to manage. Input synonyms supported (q,cost,aud,fmt,src,imgs,docs,data).");
const getJobStatusSchema = z.object({ job_id: z.string(), since_event_id: z.number().int().optional(), format: z.enum(['summary','full','events']).optional().default('summary'), max_events: z.number().int().positive().optional().default(50) }).describe("Get job status with a compact summary by default. Use format: 'full' to include full status + events or 'events' to return only events.");
const cancelJobSchema = z.object({ job_id: z.string() }).describe("Cancel a queued or running job (best-effort).");

// Unified research schema (async by default) - use base schema with extend, then add transform
const researchSchemaBase = conductResearchSchemaBase.extend({
  async: z.boolean().optional().default(true),
  notify: z.string().url().optional()
});
const researchSchema = researchSchemaBase
  .transform(normalizeResearchInputSchema)
  .refine((data) => data.query, { message: "Either 'query' or 'q' must be provided", path: ["query"] })
  .describe("Unified research tool. async=true (default) enqueues and returns {job_id}. async=false streams results synchronously like conduct_research. Example: {query: 'What is quantum computing?', costPreference: 'low', async: true}");

// Simplified tools
const searchSchema = {
  q: z.string().min(1).optional().describe("Search query (alias for 'query')"),
  query: z.string().min(1).optional().describe("Search query"),
  k: z.number().int().positive().optional().default(10).describe("Number of results"),
  scope: z.enum(['both','reports','docs']).optional().default('both').describe("Search scope"),
  rerank: z.boolean().optional().describe("Enable reranking")
};
const querySchema = z.object({
  sql: z.string().min(1).describe("SELECT query, e.g. 'SELECT id, query FROM research_reports LIMIT 5'"),
  params: z.array(z.any()).optional().default([]).describe("Bound params, e.g. [1, 'topic'] for $1, $2 placeholders"),
  explain: z.boolean().optional().default(false).describe("If true, summarizes results in plain English")
}).describe("Execute a read-only SELECT with bound params. Example: {sql: 'SELECT * FROM research_reports WHERE id = $1', params: ['5'], explain: true}");

// Schema for the new get_report_content tool
const getReportContentSchema = z.object({
  reportId: z.string().describe("The ID of the report to retrieve content for (obtained from conduct_research result)."),
  mode: z.enum(['full','truncate','summary','smart']).optional().default('full'),
  maxChars: z.number().int().positive().optional().default(2000),
  query: z.string().optional(),
  _requestId: z.string().optional().describe("Internal request ID for logging")
});

// Schema for the new get_server_status tool
const getServerStatusSchema = z.object({
  _requestId: z.string().optional().describe("Internal request ID for logging") // Add optional requestId
});

// Schema for the new execute_sql tool
const executeSqlSchema = z.object({
  sql: z.string().min(1, "SQL query must not be empty").describe("The SQL query string, using placeholders ($1, $2, etc.) for parameters."),
  params: z.array(z.any()).optional().default([]).describe("An array of parameters to safely bind to the SQL query placeholders."),
  _requestId: z.string().optional().describe("Internal request ID for logging")
});

// Updated to accept requestId
async function conductResearch(params, mcpExchange = null, requestId = 'unknown-req') {
  // Normalize shorthand parameters (q,cost,aud,fmt,src,imgs,docs,data)
  params = normalizeResearchParams(params);

  // CRITICAL: Validate query parameter - fail fast instead of silent empty default
  const query = params.query;
  if (!query || typeof query !== 'string' || query.trim() === '') {
    const errMsg = `query parameter is required but got: ${JSON.stringify(params.query)}`;
    logger.error('conductResearch: missing query', { requestId, params: JSON.stringify(params).substring(0, 200) });
    throw new Error(`[${requestId}] ${errMsg}`);
  }
  logger.debug('conductResearch starting', { requestId, query: query.substring(0, 80) });
  const costPreference = params.costPreference || 'low';
  const audienceLevel = params.audienceLevel || 'intermediate';
  const outputFormat = params.outputFormat || 'report';
  const includeSources = params.includeSources !== undefined ? params.includeSources : true;
  const maxLength = params.maxLength;
  const images = params.images;
  const textDocuments = params.textDocuments;
  const structuredData = params.structuredData;
  const clientContext = params.clientContext || null;
  const mode = params.mode || 'standard';
  const progressToken = mcpExchange?.progressToken;

  // Helper function to safely truncate a string
  const safeSubstring = (str, start, end) => {
    if (!str) return '';
    return str.substring(start, end);
  };

  const sendProgress = (chunk) => {
    if (mcpExchange && progressToken) {
      mcpExchange.sendProgress({ token: progressToken, value: chunk });
    }
    if (chunk.error) {
      logger.warn('Progress error chunk', { requestId, error: chunk.error });
      if (mcpExchange && progressToken) {
        mcpExchange.sendProgress({ token: progressToken, value: { type: 'error', message: chunk.error } });
      }
    }
  };

  // Try semantic cache first (with strict similarity validation)
  try {
    const similarCache = await advancedCache.findSimilarResult(query, {
      costPreference,
      audienceLevel,
      outputFormat,
      includeSources,
      images: Array.isArray(images) ? images.length : 0,
      textDocuments: Array.isArray(textDocuments) ? textDocuments.length : 0,
      structuredData: Array.isArray(structuredData) ? structuredData.length : 0
    });
    if (similarCache && similarCache.result) {
      // Double-check similarity threshold at this layer too
      const similarity = typeof similarCache.similarity === 'number' ? similarCache.similarity : 0;
      if (similarity < 0.85) {
        logger.info('Semantic cache rejected: similarity below threshold', {
          requestId,
          query: safeSubstring(query, 0, 50),
          similarity: similarity.toFixed(3),
          threshold: 0.85
        });
        // Fall through to fresh research
      } else {
        logger.info('Returning semantic-cached result', {
          requestId,
          query: safeSubstring(query, 0, 50),
          cacheType: similarCache.cacheType,
          similarity: similarity.toFixed(3)
        });
        if (progressToken) {
          sendProgress({ content: similarCache.result });
          return "Research complete. Results streamed (from cache).";
        }
        return similarCache.result;
      }
    }
  } catch (cacheErr) {
    logger.warn('Semantic cache lookup failed, proceeding with fresh research', {
      requestId,
      query: safeSubstring(query, 0, 50),
      error: cacheErr.message
    });
  }

  const cacheKey = getCacheKey(params);
  const cachedResult = getFromCache(cacheKey);
  if (cachedResult) {
    logger.info('Returning cached result', {
      requestId,
      query: safeSubstring(query, 0, 50),
      images: images?.length || 0,
      docs: textDocuments?.length || 0,
      structured: structuredData?.length || 0
    });
    if (progressToken) {
      sendProgress({ content: cachedResult });
      return "Research complete. Results streamed (from cache).";
    }
    return cachedResult;
  }
  logger.info('Cache miss, starting research', {
    requestId,
    query: safeSubstring(query, 0, 50),
    images: images?.length || 0,
    docs: textDocuments?.length || 0,
    structured: structuredData?.length || 0
  });

  const overallStartTime = Date.now();
  const isJob = typeof requestId === 'string' && requestId.startsWith('job_');
  const usageAgg = { planning: [], agents: [], synthesis: [], totals: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
  const onEvent = async (type, payload) => {
    // Aggregate usage metrics when present
    try {
      if (type === 'planning_usage' && payload?.usage) usageAgg.planning.push(payload.usage);
      if (type === 'agent_usage' && payload?.usage) usageAgg.agents.push(payload);
      if (type === 'synthesis_usage' && payload?.usage) usageAgg.synthesis.push(payload.usage);
    } catch(_) {}
    // Forward to job events if running as async job
    if (isJob) {
      try { await dbClient.appendJobEvent(requestId, type, payload || {}); } catch (_) {}
    }
  };
  // Determine MAX_ITERATIONS dynamically based on complexity assessment
  let MAX_ITERATIONS = config.models.maxResearchIterations; // Default
  try {
    const complexity = await researchAgent.assessQueryComplexity(query, { requestId });
    switch (complexity) {
      case 'simple':
        MAX_ITERATIONS = 1; // Simple queries get fewer iterations
        break;
      case 'complex':
        MAX_ITERATIONS = (config.models.maxResearchIterations || 2) + 1; // Complex queries might get more
        break;
      case 'moderate':
      default:
        MAX_ITERATIONS = config.models.maxResearchIterations || 2; // Moderate uses default
        break;
    }
    logger.info('Assessed query complexity', { requestId, complexity, maxIterations: MAX_ITERATIONS });
  } catch (complexityError) {
    logger.warn('Error assessing complexity, using default', { requestId, maxIterations: MAX_ITERATIONS, error: complexityError });
  }

  let currentIteration = 1;
  let allAgentQueries = [];
  let allResearchResults = [];
  let savedReportId = null;

  logger.info('Starting iterative research', { requestId, query: safeSubstring(query, 0, 50), maxIterations: MAX_ITERATIONS });

  const totalStages = MAX_ITERATIONS * 3 + 1; // Define totalStages before the main try block
    let relevantPastReports = [];
    let inputEmbeddings = {}; // Object to hold embeddings for input data

    try { // Master try block for the whole process

      // If clientContext provided, persist a context snapshot event for traceability
      try { if (clientContext) await onEvent('client_context', { clientContext }); } catch (_) {}
      // --- Generate Embeddings for Input Data (Optional) ---
      try {
        if (textDocuments && textDocuments.length > 0) {
          logger.debug('Generating text document embeddings', { requestId, count: textDocuments.length });
        inputEmbeddings.textDocuments = await Promise.all(
          textDocuments.map(async (doc) => ({
            name: doc.name,
            embedding: await dbClient.generateEmbedding(doc.content.substring(0, 1000)) // Embed first 1k chars
          }))
        );
        // Filter out null embeddings
        inputEmbeddings.textDocuments = inputEmbeddings.textDocuments.filter(e => e.embedding !== null);
        logger.debug('Generated text document embeddings', { requestId, count: inputEmbeddings.textDocuments.length });
      }
      if (structuredData && structuredData.length > 0) {
         logger.debug('Generating structured data embeddings', { requestId, count: structuredData.length });
         inputEmbeddings.structuredData = await Promise.all(
           structuredData.map(async (data) => {
             const summary = structuredDataParser.getStructuredDataSummary(data.content, data.type, data.name, 10); // Embed summary
             return {
               name: data.name,
               type: data.type,
               embedding: await dbClient.generateEmbedding(summary)
             };
           })
         );
         // Filter out null embeddings
         inputEmbeddings.structuredData = inputEmbeddings.structuredData.filter(e => e.embedding !== null);
           logger.debug('Generated structured data embeddings', { requestId, count: inputEmbeddings.structuredData.length });
        }
      } catch (embeddingError) {
        logger.warn('Error during input embedding generation', { requestId, error: embeddingError });
        // Decide if this is fatal or recoverable. For now, let's treat it as non-fatal but log it.
        // throw new Error(`[${requestId}] Failed during input embedding generation: ${embeddingError.message}`); 
      }
      // --- End Input Embedding Generation ---


      // --- Knowledge Base Lookup (Semantic Search) ---
      try {
        // Raised from 0.70 to 0.80 to prevent cache contamination from marginally-related reports
        const MIN_SIMILARITY_FOR_CONTEXT = 0.80;
        logger.debug('Performing semantic search in knowledge base', { requestId, query: safeSubstring(query, 0, 50) });
        const similarReports = await dbClient.findReportsBySimilarity(query, 3, 0.80);

        // Filter out low-similarity reports to prevent contamination
        const filteredReports = (similarReports || []).filter(r => {
          const score = r.similarityScore ?? 0;
          if (score < MIN_SIMILARITY_FOR_CONTEXT) {
            logger.info('Excluding low-similarity report from context', {
              requestId,
              reportQuery: safeSubstring(r.originalQuery, 0, 40),
              similarity: score.toFixed(3),
              threshold: MIN_SIMILARITY_FOR_CONTEXT
            });
            return false;
          }
          return true;
        });

        if (filteredReports.length > 0) {
          relevantPastReports = filteredReports.map(r => {
            // Safely handle potential undefined values with null coalescing
            const reportId = r._id ? r._id.toString() : 'unknown_id';
            const originalQuery = r.originalQuery || 'Unknown query';
            const createdAt = r.createdAt || new Date();
            const similarityScore = r.similarityScore || 0;

            // Safely handle the final report for summary extraction
            let summary = 'No summary available';
            if (r.finalReport) {
              summary = r.finalReport.substring(0, 500) + (r.finalReport.length > 500 ? '...' : '');
            }

            return {
              reportId,
              query: originalQuery,
              createdAt,
              similarityScore,
              summary
            };
          });
          logger.debug('Found semantically relevant past reports', { requestId, count: relevantPastReports.length });
        } else {
          if (similarReports && similarReports.length > 0) {
            logger.info('All similar reports filtered out due to low similarity', { requestId, filteredCount: similarReports.length });
          }
          logger.debug('No semantically relevant past reports found', { requestId });
        }
      } catch (searchError) {
         logger.error('Error during semantic search', { requestId, error: searchError });
         // Decide if this is fatal. Probably should be.
         throw new Error(`[${requestId}] Failed during semantic search: ${searchError.message}`);
      }
    // --- End Knowledge Base Lookup ---

    let previousResultsForRefinement = null;
    let nextAgentId = 1;

    // --- Main Research Loop ---
    while (currentIteration <= MAX_ITERATIONS) {
      logger.info('Research iteration', { requestId, iteration: currentIteration, maxIterations: MAX_ITERATIONS });
      let planningResultXml; // Declare here to be accessible in catch
      const currentStageBase = (currentIteration - 1) * 3; // Define outside try block

      // Step 1: Plan or Refine Research
      try {
        const planningStartTime = Date.now();
        // const currentStageBase = (currentIteration - 1) * 3; // Moved outside
        const stagePrefixPlan = `Stage ${currentStageBase + 1}/${totalStages}`;
        logger.debug('Planning research', { requestId, stage: stagePrefixPlan, iteration: currentIteration, mode: previousResultsForRefinement ? 'refining' : 'planning' });

        // Pass images, documents, structuredData, and past reports to the planning agent
        planningResultXml = await planningAgent.planResearch(
        query,
        {
          maxAgents: params.maxAgents || 5,
          focusAreas: params.focusAreas,
          images: images,
          documents: textDocuments,
          structuredData: structuredData,
          pastReports: relevantPastReports,
          inputEmbeddings: inputEmbeddings, // Pass generated input embeddings
          onEvent
        },
          previousResultsForRefinement, // Pass previous results for refinement context
          requestId // Pass requestId
        );
        const planningDuration = Date.now() - planningStartTime;
        logger.debug('Planning completed', { requestId, stage: stagePrefixPlan, durationMs: planningDuration });
      } catch (planningError) {
         logger.error('Error during planning/refinement', { requestId, error: planningError });
         throw new Error(`[${requestId}] Failed during planning agent call: ${planningError.message}`);
      }

      if (planningResultXml.includes("<plan_complete>")) {
        logger.info('Planning agent indicated completion', { requestId });
        break;
      }

      // Step 2: Parse the XML output from the planning agent
      let currentAgentQueries;
      try {
        const parsingStartTime = Date.now();
        const stagePrefixParse = `Stage ${currentStageBase + 2}/${totalStages}`;
        logger.debug('Parsing research plan XML', { requestId, stage: stagePrefixParse, iteration: currentIteration });
        currentAgentQueries = parseAgentXml(planningResultXml).map(q => ({ ...q, id: nextAgentId++ })); // Use XML parser
        const parsingDuration = Date.now() - parsingStartTime;

        if (!currentAgentQueries || currentAgentQueries.length === 0) {
          // Handle specific case where refinement might return "<plan_complete>"
          if (planningResultXml.includes("<plan_complete>")) {
             logger.info('Plan complete signal detected during parsing', { requestId });
             break; // Exit loop as plan is complete
          }
          // If not plan complete and parsing failed/yielded no queries
          if (previousResultsForRefinement) {
            logger.warn('Refinement yielded no new queries', { requestId, rawOutput: planningResultXml.substring(0, 200) });
            break;
          } else {
            logger.error('Failed to parse initial research plan XML', { requestId, rawOutput: planningResultXml.substring(0, 200) });
            throw new Error(`[${requestId}] Failed to parse initial research plan XML. No agent queries found.`);
          }
        }
        logger.debug('XML parsing completed', { requestId, stage: stagePrefixParse, durationMs: parsingDuration, subQueries: currentAgentQueries.length });
        allAgentQueries.push(...currentAgentQueries);
      } catch (parsingError) {
         logger.error('Error during XML parsing', { requestId, error: parsingError });
         throw new Error(`[${requestId}] Failed during XML parsing: ${parsingError.message}`);
      }

      // Step 3: Conduct parallel research
      let currentResearchResults;
      try {
        const researchStartTime = Date.now();
        const stagePrefixResearch = `Stage ${currentStageBase + 3}/${totalStages}`;
        logger.info('Conducting parallel research', { requestId, stage: stagePrefixResearch, iteration: currentIteration, agentCount: currentAgentQueries.length });
        // Pass images, documents, structuredData, inputEmbeddings, and requestId down to parallel research
        currentResearchResults = await researchAgent.conductParallelResearch(
           currentAgentQueries,
           costPreference,
           images,
           textDocuments,
           structuredData,
           inputEmbeddings, // Pass input embeddings
           requestId, // Pass requestId
           onEvent,
           { clientContext, mode }
        );
        const researchDuration = Date.now() - researchStartTime;
        logger.info('Parallel research completed', { requestId, stage: stagePrefixResearch, durationMs: researchDuration });
      } catch (researchError) {
        // This catch block might be less necessary now with Promise.allSettled inside conductParallelResearch,
        // but kept for safety in case the call itself fails.
        logger.error('Error calling conductParallelResearch', { requestId, error: researchError });
        // Decide if this is fatal. Let's assume it is for now.
        throw new Error(`[${requestId}] Failed during parallel research call: ${researchError.message}`);
        /* // Original fallback logic - less relevant if conductParallelResearch handles internal errors
        if (costPreference === 'high') {
          console.warn(`[${new Date().toISOString()}] [${requestId}] conductResearch: High-cost research failed (Iteration ${currentIteration}), falling back to low-cost models.`);
          try {
            // Pass context to fallback research as well
            currentResearchResults = await researchAgent.conductParallelResearch(
               currentAgentQueries, 
               'low', 
               images, 
               textDocuments, 
               structuredData,
               inputEmbeddings, // Pass input embeddings
               requestId
            ); 
          } catch (fallbackError) {
            console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Low-cost fallback research also failed (Iteration ${currentIteration}). Error:`, fallbackError);
            currentResearchResults = currentAgentQueries.map(q => ({
              agentId: q.id, model: 'N/A', query: q.query, result: `Research failed: ${fallbackError.message}`, error: true, errorMessage: fallbackError.message
            }));
            console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Marking iteration ${currentIteration} queries as failed due to fallback error.`);
          }
        } else {
          currentResearchResults = currentAgentQueries.map(q => ({
            agentId: q.id, model: 'N/A', query: q.query, result: `Research failed: ${researchError.message}`, error: true, errorMessage: researchError.message
          }));
          console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Marking iteration ${currentIteration} queries as failed due to initial low-cost error.`);
        }
        */
      }

      allResearchResults.push(...currentResearchResults);
      previousResultsForRefinement = currentResearchResults;
      currentIteration++;
    } // End of while loop
    // --- End Main Research Loop ---

    if (allResearchResults.length === 0) {
      logger.error('No research results generated', { requestId });
      throw new Error(`[${requestId}] Failed to generate any research results after planning/refinement.`);
    }

    // Step 4 (Final Synthesis): Contextualize ALL accumulated results
    let finalReportContent = '';
    let streamError = null;
    try {
      const contextStartTime = Date.now();
      const finalStagePrefix = `Stage ${totalStages}/${totalStages}`;
      logger.info('Contextualizing results', { requestId, stage: finalStagePrefix, resultCount: allResearchResults.length });
      
      // Pass allAgentQueries, images, documents, structuredData, and inputEmbeddings to the context agent
      const contextStream = contextAgent.contextualizeResultsStream(
        query,
        allResearchResults,
        allAgentQueries, // Pass the list of planned agent queries
        { 
          audienceLevel, 
          outputFormat, 
          includeSources, 
          maxLength, 
          images, 
          documents: textDocuments, 
          structuredData,
          inputEmbeddings // Pass input embeddings
        },
        requestId, // Pass requestId to context agent
        clientContext
      );

      for await (const chunk of contextStream) {
        sendProgress(chunk);
        if (onEvent) {
          if (chunk.content) await onEvent('synthesis_token', { content: chunk.content });
          if (chunk.usage) await onEvent('synthesis_usage', { usage: chunk.usage });
          if (chunk.error) await onEvent('synthesis_error', { error: chunk.error });
        }
        if (chunk.content) {
          finalReportContent += chunk.content;
        }
        if (chunk.error) {
          streamError = chunk.error;
          break;
        }
      }
      const contextDuration = Date.now() - contextStartTime;
      if (!streamError) {
        logger.info('Contextualization completed', { requestId, stage: finalStagePrefix, durationMs: contextDuration });
      } else {
         logger.warn('Contextualization finished with error', { requestId, stage: finalStagePrefix, durationMs: contextDuration });
         // Do not throw here, allow process to continue to report the error
         // throw new Error(streamError || 'Unknown error during context stream processing');
      }
    } catch (contextError) {
      // Catch errors from initiating the stream or other unexpected issues in the synthesis step
      logger.error('Error during context agent call/stream', { requestId, error: contextError });
      streamError = `Error during result synthesis: ${contextError.message}`;
      sendProgress({ error: streamError }); // Try to send progress update about the error
      // Do not throw here, allow process to continue to report the error
      // throw new Error(`[${requestId}] Failed during context agent call/stream: ${contextError.message}`);
    }


    // Store accumulated content in cache and DB (only if synthesis was successful)
    if (!streamError) {
      try {
        // Store in semantic cache first; fallback to local cache
        try {
          await advancedCache.storeResult(query, { costPreference, audienceLevel, outputFormat, includeSources }, finalReportContent, savedReportId);
        } catch (_) {}
        setInCache(cacheKey, finalReportContent);

        // Compute usage totals
        const add = (u) => {
          if (!u) return; const pt=Number(u.prompt_tokens||0), ct=Number(u.completion_tokens||0), tt=Number(u.total_tokens||pt+ct);
          usageAgg.totals.prompt_tokens += pt; usageAgg.totals.completion_tokens += ct; usageAgg.totals.total_tokens += tt;
        };
        usageAgg.planning.forEach(add); usageAgg.synthesis.forEach(add); usageAgg.agents.forEach(a=>add(a.usage));
        const researchMetadata = {
        durationMs: Date.now() - overallStartTime,
        iterations: currentIteration - 1,
        totalSubQueries: allAgentQueries.length,
          requestId: requestId, // Store requestId with metadata
          usage: usageAgg
        };

        // Run fact-checking on the final report before saving
        let factCheckResults = null;
        let accuracyScore = null;
        try {
          factCheckResults = await factCheckAgent.factCheck(finalReportContent, {
            ensembleResults: aggregatedResults,
            requestId
          });
          accuracyScore = factCheckResults.accuracyScore?.score ?? null;

          // Generate warnings and append to report if issues found
          const warnings = factCheckAgent.generateWarnings(factCheckResults);
          if (warnings.length > 0) {
            finalReportContent += '\n\n---\n## Research Quality Warnings\n' + warnings.join('\n');
            logger.warn('Fact-check warnings generated', { requestId, warningCount: warnings.length, accuracyScore });
          }
        } catch (fcError) {
          logger.error('Fact-checking failed', { requestId, error: fcError.message });
        }

        savedReportId = await dbClient.saveResearchReport({
        originalQuery: query,
        parameters: { costPreference, audienceLevel, outputFormat, includeSources, maxLength },
        finalReport: finalReportContent,
        researchMetadata: researchMetadata,
        images: images,
        textDocuments: textDocuments,
        structuredData: structuredData,
        basedOnPastReportIds: relevantPastReports.map(r => r.reportId),
        accuracyScore: accuracyScore,
        factCheckResults: factCheckResults
        });
        logger.info('Report saved', { requestId, reportId: savedReportId, accuracyScore: accuracyScore ?? 'N/A' });
        // Index the saved report for hybrid search when enabled
        try {
          const cfg = require('../../config');
          if (cfg.indexer?.enabled) {
            const title = String(query || `Report ${savedReportId}`).slice(0, 120);
            await dbClient.indexDocument({ sourceType: 'report', sourceId: String(savedReportId), title, content: finalReportContent || '' });
          }
        } catch (_) {}
        if (onEvent && savedReportId) await onEvent('report_saved', { report_id: savedReportId });

        // Auto-index saved report content when enabled
        try {
          const cfg = require('../../config');
          if (cfg.indexer?.enabled && cfg.indexer.autoIndexReports && savedReportId && finalReportContent) {
            await dbClient.indexDocument({
              sourceType: 'report',
              sourceId: String(savedReportId),
              title: query.slice(0, 120),
              content: finalReportContent
            });
            logger.debug('Indexed report into BM25', { requestId, reportId: savedReportId });
          }
        } catch (idxErr) {
          logger.warn('Failed to index report', { requestId, reportId: savedReportId, error: idxErr.message });
        }
      } catch (dbError) {
         // Log with full error context
         const { wrapError, formatErrorForLog } = require('../utils/errors');
         const wrapped = wrapError(dbError, `Failed to save research report`, { requestId });
         logger.error('CRITICAL: Report save failed', formatErrorForLog(wrapped, requestId));

         // Mark as unsaved - let the user know in the response
         savedReportId = null;

         // Add warning to final report if available
         if (finalReportContent) {
           finalReportContent = `> **Warning**: This report could not be saved to the database. Error: ${dbError.message}\n\n${finalReportContent}`;
         }
      }
    } else {
      logger.warn('Skipping cache/DB save due to synthesis error', { requestId });
    }

    const overallDuration = Date.now() - overallStartTime;
    logger.info('Research process finished', { requestId, durationMs: overallDuration, query: query.substring(0, 50), status: streamError ? 'failed' : 'success' });

    if (streamError) {
      // If synthesis failed, throw an error here to be caught by the main catch block
      throw new Error(streamError);
    } else {
      // --- Save Full Report to File ---
      let fullReportPath = null;
      if (savedReportId && finalReportContent) {
        try {
          const reportDir = path.resolve(config.reportOutputPath); // Use absolute path
          const reportFilename = `research-report-${savedReportId}.md`; // Use Markdown extension
          fullReportPath = path.join(reportDir, reportFilename);

          // Ensure the directory exists
          fs.mkdirSync(reportDir, { recursive: true });

          // Write the file
          fs.writeFileSync(fullReportPath, finalReportContent, 'utf8');
          logger.info('Full report saved to file', { requestId, path: fullReportPath });
        } catch (fileError) {
          logger.error('Error saving full report to file', { requestId, error: fileError });
          // Non-fatal error, just log it. The main result is still available.
          fullReportPath = `Error saving file: ${fileError.message}`;
        }
      }
      // --- End Save Full Report ---

      // If synthesis succeeded, return the completion message including the file path
      const completionMessage = `Research complete. Results streamed. Report ID: ${savedReportId || 'N/A'}. Full report saved to: ${fullReportPath || 'Not saved'}. [${requestId}]`; // Include requestId and file path
      return completionMessage;
    }

  } catch (error) { // Main catch block for errors *before* or *during* synthesis failure reporting
    const overallDuration = Date.now() - overallStartTime;
    const { wrapError, formatErrorForLog } = require('../utils/errors');

    // Wrap error with full context, preserving original error as cause
    const wrappedError = wrapError(error,
      `[${requestId}] Research failed after ${overallDuration}ms for "${query.substring(0, 50)}..."`,
      {
        requestId,
        context: {
          query: query.substring(0, 200),
          duration: overallDuration,
          phase: 'research'
        }
      }
    );

    // Log FULL error details including cause chain (structured JSON for parsing)
    logger.error('Research failed', formatErrorForLog(wrappedError, requestId));

    // Re-throw with cause preserved for upstream handlers
    throw wrappedError;
  }
}

// Submit research job (async)
async function submitResearch(params, mcpExchange = null, requestId = 'unknown-req') {
  const normalized = normalizeResearchParams(params);
  const jobId = await dbClient.createJob('research', normalized);
  await dbClient.appendJobEvent(jobId, 'submitted', { requestId, query: normalized.query });
  try {
    const { server } = require('../../config');
    const base = server.publicUrl || '';
    const sse_url = `${base.replace(/\/$/,'')}/jobs/${jobId}/events`;
    const ui_url = `${base.replace(/\/$/,'')}/ui?job=${encodeURIComponent(jobId)}`;
    await dbClient.appendJobEvent(jobId, 'ui_hint', { sse_url, ui_url });
    return JSON.stringify({ job_id: jobId, sse_url, ui_url });
  } catch (_) {
    return JSON.stringify({ job_id: jobId });
  }
}

async function getJobStatusTool(params) {
  const stat = await dbClient.getJobStatus(params.job_id);
  const events = await dbClient.getJobEvents(params.job_id, params.since_event_id || 0, Math.max(1, params.max_events || 50));
  const format = params.format || 'summary';
  
  if (format === 'summary') {
    const summary = summarizeJobStatus(stat, events, params.max_events);
    // Return concise text summary instead of verbose JSON
    if (!stat) {
      return `Job ${params.job_id || 'unknown'}: Not found or invalid job ID`;
    }
    const progress = summary.progressPercent ? ` (${summary.progressPercent}%)` : '';
    const result = summary.artifacts?.reportId ? ` Report: ${summary.artifacts.reportId}` : '';
    return `Job ${stat.id}: ${stat.status}${progress}${result}. Updated: ${summary.timestamps?.updatedAt || 'unknown'}`;
  }
  
  if (format === 'events') {
    return JSON.stringify({ job: { id: stat?.id, status: stat?.status }, events }, null, 2);
  }
  return JSON.stringify({ job: stat, events }, null, 2);
}

async function cancelJobTool(params) {
  await dbClient.cancelJob(params.job_id);
  return JSON.stringify({ canceled: true }, null, 2);
}

// Unified hybrid search
async function searchTool(params) {
  const rows = await dbClient.searchHybrid(params.q, params.k);
  const filtered = rows.filter(r => {
    if (params.scope === 'reports') return r.type === 'report';
    if (params.scope === 'docs') return r.type === 'doc';
    return true;
  });
  return JSON.stringify(filtered, null, 2);
}

// Guarded SQL + optional LLM explanation
async function queryTool(params, mcpExchange = null, requestId = 'unknown-req') {
  const { sql, params: queryParams, explain } = params;
  const rowsStr = await executeSql({ sql, params: queryParams }, null, requestId);
  if (!explain) return rowsStr;
  try {
    const model = require('../../config').models.planning;
    const messages = [
      { role: 'system', content: 'Explain these SQL SELECT results concisely in plain English for a technical reader.' },
      { role: 'user', content: `Results (first 30 rows max):\n${rowsStr.slice(0, 2000)}` }
    ];
    const resp = await openRouterClient.chatCompletion(model, messages, { temperature: 0.2, max_tokens: 400 });
    const explanation = resp.choices?.[0]?.message?.content || '';
    return JSON.stringify({ rows: JSON.parse(rowsStr), explanation }, null, 2);
  } catch (_) {
    return rowsStr;
  }
}

// Schema definitions for all tools
const researchFollowUpSchema = z.object({
  originalQuery: z.string().describe("The original research query for context."),
  followUpQuestion: z.string().describe("The specific follow-up question."),
  costPreference: conductResearchSchemaBase.shape.costPreference.describe("Preference for model cost ('high' or 'low')."),
  _requestId: z.string().optional().describe("Internal request ID for logging") // Add optional requestId
});

const getPastResearchSchema = z.object({
  query: z.string().describe("The query string to search for semantically similar past reports."),
  limit: z.number().int().positive().optional().default(5).describe("Maximum number of past reports to return."),
  minSimilarity: z.number().min(0).max(1).optional().default(0.80).describe("Minimum cosine similarity score (0-1) for a report to be considered relevant."),
  _requestId: z.string().optional().describe("Internal request ID for logging") // Add optional requestId
});

const rateResearchReportSchema = z.object({
  reportId: z.string().describe("The ID of the report to rate (obtained from conduct_research result)."),
  rating: z.number().min(1).max(5).int().describe("Rating from 1 (poor) to 5 (excellent)."),
  comment: z.string().optional().describe("Optional comment explaining the rating."),
  _requestId: z.string().optional().describe("Internal request ID for logging") // Add optional requestId
});

const listResearchHistorySchema = z.object({
  limit: z.number().int().positive().optional().default(10).describe("Maximum number of recent reports to return."),
  queryFilter: z.string().optional().describe("Optional text to filter report queries by (case-insensitive substring match)."),
  _requestId: z.string().optional().describe("Internal request ID for logging") // Add optional requestId
});

// Helper function to safely truncate a string (shared across functions)
function safeSubstring(str, start, end) {
  if (!str) return '';
  return str.substring(start, end);
}

function parseReportIdFromMessage(message) {
  try {
    const m = String(message || '').match(/Report ID:\s*(\d+)/i);
    return m ? m[1] : null;
  } catch (_) { return null; }
}

function summarizeJobStatus(job, events, maxEvents = 50) {
  const lastEvent = Array.isArray(events) && events.length > 0 ? events[events.length - 1] : null;
  const recent = Array.isArray(events) ? events.slice(Math.max(0, events.length - maxEvents)) : [];
  const percent = (job?.progress && typeof job.progress.percent === 'number') ? job.progress.percent : null;
  const message = job?.result?.message || lastEvent?.payload?.message || null;
  const reportId = parseReportIdFromMessage(message);
  return {
    jobId: job?.id || null,
    status: job?.status || 'unknown',
    canceled: !!job?.canceled,
    progressPercent: percent,
    timestamps: { updatedAt: job?.updated_at || null, startedAt: job?.started_at || null, finishedAt: job?.finished_at || null },
    lastEvent: lastEvent ? { id: lastEvent.id, type: lastEvent.event_type, ts: lastEvent.ts } : null,
    resultHint: message ? (message.length > 200 ? message.slice(0, 200) + '…' : message) : null,
    artifacts: { reportId },
    nextPollHint: { since_event_id: lastEvent?.id || 0 }
  };
}

// Implementation of research_follow_up tool - updated to accept requestId
async function researchFollowUp(params, mcpExchange = null, requestId = 'unknown-req') { 
  const originalQuery = params.originalQuery || '';
  const followUpQuestion = params.followUpQuestion || '';
  const costPreference = params.costPreference || 'low';
  
  const sendProgress = (chunk) => {
    if (mcpExchange && mcpExchange.progressToken) {
      mcpExchange.sendProgress({ token: mcpExchange.progressToken, value: chunk });
    }
  };

  try {
    logger.info('Starting follow-up research', { requestId, originalQuery: safeSubstring(originalQuery, 0, 50) });

    // Send initial progress update
    sendProgress({ message: "Starting follow-up research..." });
    
    // Craft a targeted follow-up query
    const query = `Follow-up research regarding "${originalQuery}": ${followUpQuestion}`;

    // Call the main research function with the follow-up query
    const result = await conductResearch({ 
      query,
      costPreference,
      audienceLevel: 'expert', // Follow-ups tend to be more specific
      outputFormat: 'briefing', // More concise format for follow-ups
      includeSources: true
    }, mcpExchange, requestId); // Pass requestId down
    
    // Return the result
    return result.replace("report-", "followup-report-");
  } catch (error) {
    logger.error('Error processing follow-up query', { requestId, error });
    throw new Error(`[${requestId}] Error conducting follow-up research: ${error.message}`);
  }
}

// Implementation of get_past_research tool - updated to accept requestId
async function getPastResearch(params, mcpExchange = null, requestId = 'unknown-req') { 
  const query = params.query || '';
  const limit = params.limit || 5;
  const minSimilarity = params.minSimilarity !== undefined ? params.minSimilarity : 0.80;
  
  const sendProgress = (chunk) => {
    if (mcpExchange && mcpExchange.progressToken) {
      mcpExchange.sendProgress({ token: mcpExchange.progressToken, value: chunk });
    }
  };

  try {
    logger.debug('Searching for past research', { requestId, query: safeSubstring(query, 0, 50) });

    // Send initial progress update
    sendProgress({ message: "Searching knowledge base for relevant past research..." });

    // Prefer local hybrid index when enabled
    const cfg = require('../../config');
    let reports = [];
    if (cfg.indexer?.enabled && typeof dbClient.searchHybrid === 'function') {
      try {
        const hybrid = await dbClient.searchHybrid(query, Math.max(limit * 2, 10));
        const reportIds = [];
        const idToScore = new Map();
        for (const r of hybrid) {
          if (r.source_type === 'report') {
            const idNum = Number(r.source_id);
            if (!Number.isNaN(idNum) && !reportIds.includes(idNum)) reportIds.push(idNum);
            if (!Number.isNaN(idNum) && typeof r.hybridScore === 'number') idToScore.set(idNum, r.hybridScore);
          }
          if (reportIds.length >= limit) break;
        }
        const enriched = [];
        for (const id of reportIds) {
          const rep = await dbClient.getReportById(String(id));
          if (rep) {
            enriched.push({
              _id: String(rep.id || rep._id || id),
              originalQuery: rep.original_query || rep.originalQuery,
              createdAt: rep.created_at || rep.createdAt,
              parameters: rep.parameters,
              similarityScore: idToScore.has(Number(id)) ? idToScore.get(Number(id)) : undefined
            });
          }
        }
        if (enriched.length > 0) {
          reports = enriched;
        }
      } catch (e) {
        logger.warn('Hybrid index lookup failed, using vector fallback', { requestId, error: e.message });
      }
    }

    // Fallback to vector similarity
    if (!reports || reports.length === 0) {
      reports = await dbClient.findReportsBySimilarity(query, limit, minSimilarity);
      // Normalize to expected shape
      reports = (reports || []).map(report => ({
        _id: report._id.toString(),
        originalQuery: report.originalQuery,
        createdAt: report.createdAt,
        parameters: report.parameters,
        similarityScore: report.similarityScore
      }));
    }
    
    sendProgress({ message: `Found ${reports ? reports.length : 0} relevant past reports.` });
    return JSON.stringify(reports, null, 2);
  } catch (error) {
    logger.error('Error searching for past reports', { requestId, error });
    throw new Error(`[${requestId}] Error retrieving past research: ${error.message}`);
  }
}

// Implementation of rate_research_report tool - updated to accept requestId
async function rateResearchReport(params, mcpExchange = null, requestId = 'unknown-req') { 
  const { reportId, rating, comment } = params;
  
  try {
    logger.info('Processing report rating', { requestId, reportId, rating });
    
    // Use dbClient to save the rating
    const success = await dbClient.addFeedbackToReport(reportId, { rating, comment });
    
    if (success) {
      return `Feedback successfully recorded for report ${reportId}.`;
    } else {
      throw new Error(`[${requestId}] Failed to record feedback. Report ID ${reportId} might be invalid or a database error occurred.`);
    }
  } catch (error) {
    logger.error('Error processing rating', { requestId, error });
    throw new Error(`[${requestId}] Error recording feedback: ${error.message}`);
  }
}

// Implementation of list_research_history tool - updated to accept requestId
async function listResearchHistory(params, mcpExchange = null, requestId = 'unknown-req') {
  // Ensure params are properly handled
  const limit = params.limit || 10;
  const queryFilter = params.queryFilter || null;

  try {
    logger.debug('Listing research history', { requestId, limit, filter: queryFilter || 'none' });

    // Use dbClient to retrieve recent reports
    const reports = await dbClient.listRecentReports(limit, queryFilter);
    
    if (!reports || reports.length === 0) {
      return "No recent research reports found" + (queryFilter ? ` matching filter "${queryFilter}"` : ".");
    }
    
    // Return concise, readable summary instead of verbose JSON
    const summary = reports.map((report, i) => {
      // Support both snake_case and camelCase from db rows
      const createdAt = report.created_at || report.createdAt || null;
      let dateStr = 'unknown';
      try {
        if (createdAt) {
          const d = new Date(createdAt);
          if (!isNaN(d.getTime())) {
            dateStr = d.toISOString().slice(0, 16).replace('T', ' ');
          }
        }
      } catch (_) {}
      const params = report.parameters || report.researchMetadata || {};
      const cost = params?.costPreference || 'low';
      const original = report.originalQuery || report.original_query || '';
      const query = original.slice(0, 60) + (original.length > 60 ? '...' : '');
      const id = report._id || report.id;
      return `${i + 1}. ${id} - "${query}" (${cost}, ${dateStr})`;
    }).join('\n');
    
    const filterText = queryFilter ? ` matching "${queryFilter}"` : '';
    return `Recent research reports${filterText} (${reports.length}/${limit}):\n${summary}`;
  } catch (error) {
    logger.error('Error listing reports', { requestId, error });
    throw new Error(`[${requestId}] Error retrieving research history: ${error.message}`);
  }
}

// Implementation for execute_sql tool
async function executeSql(params, mcpExchange = null, requestId = 'unknown-req') {
  const { sql, params: queryParams } = params; // Renamed params to queryParams to avoid conflict
  logger.debug('Executing SQL', { requestId, sql: safeSubstring(sql, 0, 100), paramCount: queryParams?.length || 0 });

  try {
    // Basic validation (can be expanded)
    if (!sql || sql.trim() === '') {
      throw new Error("SQL query cannot be empty.");
    }
    // Optional: Add more robust validation/restriction here if needed
    // e.g., restrict to SELECT statements initially for safety
    const lowerSql = sql.trim().toLowerCase();
    if (!lowerSql.startsWith('select')) {
       logger.warn('Blocking non-SELECT SQL query', { requestId, sql: safeSubstring(sql, 0, 100) });
       throw new Error("Only SELECT statements are currently allowed for safety.");
    }

    // Ensure database is ready (embedder NOT required for SQL queries)
    if (!dbClient.isDbInitialized()) {
      throw new Error("Database is not initialized. Wait for initialization to complete.");
    }

    // Call the dbClient function to execute the query securely
    // IMPORTANT: Assumes dbClient.executeQuery handles parameterization correctly!
    const results = await dbClient.executeQuery(sql, queryParams);

    logger.debug('SQL query executed', { requestId, rowCount: results?.length ?? 0 });

    // Return results as JSON string
    return JSON.stringify(results, null, 2);

  } catch (error) {
    logger.error('Error executing SQL query', { requestId, sql: safeSubstring(sql, 0, 100), error });
    // Rethrow a user-friendly error, including the request ID
    throw new Error(`[${requestId}] Error executing SQL: ${error.message}`);
  }
}

// DB QoL tool schemas
const exportReportsSchema = z.object({
  format: z.enum(['json', 'ndjson']).default('json'),
  limit: z.number().int().positive().optional(),
  queryFilter: z.string().optional(),
  _requestId: z.string().optional()
});

const importReportsSchema = z.object({
  format: z.enum(['json', 'ndjson']).default('json'),
  content: z.string().min(1),
  _requestId: z.string().optional()
});

const backupDbSchema = z.object({
  destinationDir: z.string().optional().default('./backups'),
  _requestId: z.string().optional()
});

const dbHealthSchema = z.object({ _requestId: z.string().optional() });
const reindexVectorsSchema = z.object({ _requestId: z.string().optional() });
const searchWebSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().positive().max(10).optional().default(5),
  _requestId: z.string().optional()
});
const fetchUrlSchema = z.object({
  url: z.string().url(),
  maxBytes: z.number().int().positive().optional().default(200000),
  _requestId: z.string().optional()
});

// Implementation for get_report_content tool - updated to accept requestId
async function getReportContent(params, mcpExchange = null, requestId = 'unknown-req') {
  const { reportId, mode = 'full', maxChars = 2000, query } = params;
  const { NotFoundError, DatabaseError, formatErrorForResponse } = require('../utils/errors');

  try {
    logger.debug('Retrieving report', { requestId, reportId, mode });
    // getReportById now throws NotFoundError if not found
    const report = await dbClient.getReportById(reportId);
    const content = report.final_report || '';

    if (mode === 'full') {
      return content;
    }
    if (mode === 'truncate') {
      return JSON.stringify({ reportId, mode, totalLength: content.length, contentSnippet: content.slice(0, maxChars) + (content.length > maxChars ? '…' : '') }, null, 2);
    }
    // helper for cosine similarity
    const cosineSim = (a, b) => {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
      return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
    };
    // Build semantic summary when possible
    let semantic = null;
    if (query) {
      try {
        const qv = await dbClient.generateEmbedding(query);
        if (qv) {
          const sentences = String(content).split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2000); // cap sentences
          // Embed in small batches to reduce cost; use first N chars per sentence
          const scored = [];
          for (const s of sentences) {
            const ev = await dbClient.generateEmbedding(s.slice(0, 256));
            if (ev) scored.push({ text: s, score: cosineSim(qv, ev) });
          }
          scored.sort((a,b) => b.score - a.score);
          const top = scored.slice(0, 8);
          semantic = { query, topSentences: top.map(t => t.text), scores: top.map(t => Number(t.score.toFixed(3))) };
        }
      } catch (_) {}
    }
    // summary mode: include both snippet and semantic top sentences
    const payload = {
      reportId,
      mode: mode === 'smart' ? 'summary' : mode,
      totalLength: content.length,
      contentSnippet: content.slice(0, maxChars) + (content.length > maxChars ? '…' : ''),
      semantic
    };
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    // Distinguish between NotFoundError (user error) and DatabaseError (system error)
    if (error.name === 'NotFoundError') {
      logger.warn('Report not found', { requestId, reportId, resourceType: error.resourceType });
      throw new Error(`[${requestId}] Report ID ${reportId} not found. Use 'history' tool to list available reports.`);
    }

    if (error.name === 'DatabaseError' || error.name === 'InitializationError' || error.name === 'RetryExhaustedError') {
      logger.error('Database error retrieving report', { requestId, reportId, error: error.message, category: error.category });
      throw new Error(`[${requestId}] Database error: ${error.message}. The database may be unavailable or initializing.`);
    }

    // Unknown error - log and rethrow with context
    logger.error('Error retrieving report', { requestId, reportId, error: error.message });
    throw new Error(`[${requestId}] Error retrieving report content: ${error.message}`);
  }
}

// Implementation for get_server_status tool
async function getServerStatus(params, mcpExchange = null, requestId = 'unknown-req') {
  logger.debug('Retrieving server status', { requestId });
  try {
    const embedderReady = dbClient.isEmbedderReady();
    const dbInitialized = dbClient.isDbInitialized();
    const dbPathInfo = dbClient.getDbPathInfo();
    const initState = typeof dbClient.getInitState === 'function' ? dbClient.getInitState() : 'UNKNOWN';

    let jobs = { queued: 0, running: 0, succeeded: 0, failed: 0, canceled: 0 };
    try {
      const rows = await dbClient.executeQuery("SELECT status, COUNT(*) AS count FROM jobs GROUP BY 1 ORDER BY 1");
      for (const r of rows) { jobs[r.status] = Number(r.count); }
    } catch (_) {}

    // Agent Zero Convergence Metrics - feedback loop status
    let convergence = null;
    try {
      if (dbInitialized && typeof dbClient.getConvergenceMetrics === 'function') {
        convergence = await dbClient.getConvergenceMetrics(24);
      }
    } catch (convErr) {
      logger.warn('Could not fetch convergence metrics', { error: convErr.message });
    }

    const status = {
      serverName: config.server.name,
      serverVersion: config.server.version,
      timestamp: new Date().toISOString(),
      database: {
        initialized: dbInitialized,
        initState,
        storageType: dbPathInfo,
        vectorDimension: config.database.vectorDimension,
        maxRetries: config.database.maxRetryAttempts,
        retryDelayBaseMs: config.database.retryDelayBaseMs,
        relaxedDurability: config.database.relaxedDurability
      },
      jobs,
      embedder: {
        ready: embedderReady,
        model: embedderReady ? 'Xenova/all-MiniLM-L6-v2' : 'Not Loaded'
      },
      cache: {
        ttlSeconds: CACHE_TTL_SECONDS,
        maxKeys: cache.options.maxKeys,
        currentKeys: cache.keys().length,
        stats: cache.getStats()
      },
      config: {
        serverPort: config.server.port,
        maxResearchIterations: config.models.maxResearchIterations
      },
      // Agent Zero Observation Loop - Convergence tracking
      convergence: convergence ? {
        windowHours: convergence.windowHours,
        status: convergence.overall.convergenceStatus,
        rate: convergence.overall.convergenceRate,
        totalCalls: convergence.overall.totalCalls,
        successfulCalls: convergence.overall.successfulCalls,
        failedCalls: convergence.overall.failedCalls,
        uniqueTools: convergence.overall.uniqueTools,
        avgLatencyMs: convergence.overall.avgLatencyMs,
        topErrors: convergence.errorBreakdown.slice(0, 3)
      } : { status: 'unavailable', reason: 'No observation data' }
    };

    logger.debug('Server status retrieved', { requestId });
    return JSON.stringify(status, null, 2);

  } catch (error) {
    logger.error('Error retrieving server status', { requestId, error });
    throw new Error(`[${requestId}] Error retrieving server status: ${error.message}`);
  }
}

// Implementation for list_models tool
async function listModels(params = { refresh: false }, mcpExchange = null, requestId = 'unknown-req') {
  const refresh = !!params.refresh;
  logger.debug('Listing models', { requestId, refresh });
  try {
    if (refresh) await modelCatalog.refresh();
    const catalog = await modelCatalog.getCatalog();
    return JSON.stringify(catalog, null, 2);
  } catch (error) {
    logger.error('Error listing models', { requestId, error });
    throw new Error(`[${requestId}] Error listing models: ${error.message}`);
  }
}

async function exportReports(params, mcpExchange = null, requestId = 'unknown-req') {
  const { format, limit, queryFilter } = params;
  const reports = await dbClient.listRecentReports(limit || 1000, queryFilter || null);
  const safeReports = reports.map(r => {
    const { final_report, ...rest } = r; // keep full report by default; can adjust
    return { ...rest, final_report };
  });
  if (format === 'ndjson') {
    return safeReports.map(r => JSON.stringify(r)).join('\n');
  }
  return JSON.stringify(safeReports, null, 2);
}

async function importReports(params, mcpExchange = null, requestId = 'unknown-req') {
  const { format, content } = params;
  const lines = format === 'ndjson' ? content.split(/\r?\n/).filter(Boolean) : [];
  const items = format === 'ndjson' ? lines.map(l => JSON.parse(l)) : JSON.parse(content);
  const array = Array.isArray(items) ? items : [items];
  let imported = 0;
  for (const item of array) {
    try {
      // Minimal fields for saveResearchReport
      await dbClient.saveResearchReport({
        originalQuery: item.originalQuery || item.original_query || 'Imported Report',
        parameters: item.parameters || {},
        finalReport: item.final_report || item.finalReport || '',
        researchMetadata: item.researchMetadata || item.research_metadata || {},
        images: item.images || null,
        textDocuments: null,
        structuredData: null,
        basedOnPastReportIds: item.based_on_past_report_ids || []
      });
      imported++;
    } catch (e) {
      logger.warn('Failed to import report item', { requestId, error: e.message });
    }
  }
  return JSON.stringify({ imported, total: array.length }, null, 2);
}

async function backupDb(params, mcpExchange = null, requestId = 'unknown-req') {
  const destDir = path.resolve(params.destinationDir || './backups');
  fs.mkdirSync(destDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const srcInfo = dbClient.getDbPathInfo();
  if (!srcInfo.toLowerCase().startsWith('file')) {
    const note = `Backup supported only for file-backed DB. Current: ${srcInfo}`;
    return JSON.stringify({ status: 'skipped', reason: note }, null, 2);
  }
  const match = srcInfo.match(/File \((.*)\)/i);
  const srcPath = match ? match[1] : config.database.dataDirectory;
  const tarName = `pglite-backup-${stamp}.tar.gz`;
  const tarPath = path.join(destDir, tarName);
  await tar.c({ gzip: true, file: tarPath, cwd: srcPath, portable: true }, ['.']);
  const manifest = { when: new Date().toISOString(), source: srcPath, archive: tarPath };
  fs.writeFileSync(path.join(destDir, `manifest-${stamp}.json`), JSON.stringify(manifest, null, 2));
  return JSON.stringify({ status: 'ok', archive: tarPath, manifest: `manifest-${stamp}.json` }, null, 2);
}

async function dbHealth(params, mcpExchange = null, requestId = 'unknown-req') {
  const embedderReady = dbClient.isEmbedderReady();
  const dbInitialized = dbClient.isDbInitialized();
  const dbPathInfo = dbClient.getDbPathInfo();
  return JSON.stringify({ embedderReady, dbInitialized, dbPathInfo, vectorDimension: config.database.vectorDimension }, null, 2);
}

async function reindexVectorsTool(params, mcpExchange = null, requestId = 'unknown-req') {
  const ok = await dbClient.reindexVectors();
  return JSON.stringify({ reindexed: ok }, null, 2);
}

async function searchWeb(params, mcpExchange = null, requestId = 'unknown-req') {
  const { query, maxResults } = params;
  try {
    const results = await robustScraperInstance.searchWeb(query, maxResults);
    return JSON.stringify({ query, results }, null, 2);
  } catch (e) {
    // Fallback to simple DDG API
    const endpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
    const res = await fetch(endpoint, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      return JSON.stringify({ error: `HTTP ${res.status}`, query }, null, 2);
    }
    const data = await res.json();
    const items = [];
    if (data.AbstractText) {
      items.push({ title: data.Heading || 'Abstract', text: data.AbstractText, url: data.AbstractURL || null, source: 'ddg' });
    }
    const related = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
    for (const rt of related) {
      if (items.length >= maxResults) break;
      if (rt.Text && rt.FirstURL) items.push({ title: rt.Text.slice(0, 120), text: rt.Text, url: rt.FirstURL, source: 'ddg' });
      if (Array.isArray(rt.Topics)) {
        for (const t of rt.Topics) {
          if (items.length >= maxResults) break;
          if (t.Text && t.FirstURL) items.push({ title: t.Text.slice(0, 120), text: t.Text, url: t.FirstURL, source: 'ddg' });
        }
      }
    }
    return JSON.stringify({ query, results: items.slice(0, maxResults) }, null, 2);
  }
}

function stripHtml(html) {
  try {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { title, text };
  } catch (e) {
    return { title: null, text: html };
  }
}

async function fetchUrl(params, mcpExchange = null, requestId = 'unknown-req') {
  const { url, maxBytes } = params;
  try {
    const resObj = await robustScraperInstance.fetchUrl(url, { maxBytes });
    // Auto-index fetched text when enabled
    try {
      const cfg = require('../../config');
      if (cfg.indexer?.enabled && cfg.indexer.autoIndexFetchedContent && resObj.success && resObj.content) {
        await dbClient.indexDocument({ sourceType: 'doc', sourceId: url, title: resObj.title || url, content: resObj.content.slice(0, cfg.indexer.maxDocLength || 8000) });
      }
    } catch (_) {}
    return JSON.stringify({ url, status: resObj.success ? 200 : 500, contentType: 'text/html', title: resObj.title, textSnippet: (resObj.content || '').slice(0, 2000), fullTextLength: (resObj.content || '').length, success: resObj.success, error: resObj.error || null }, null, 2);
  } catch (e) {
    // Fallback to simple fetch
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    const contentType = res.headers.get('content-type') || '';
    const status = res.status;
    if (!res.ok) {
      return JSON.stringify({ url, status, error: `HTTP ${status}` }, null, 2);
    }
    const buf = await res.arrayBuffer();
    const limited = Buffer.from(buf).subarray(0, Math.min(maxBytes, buf.byteLength));
    const body = limited.toString('utf8');
    if (/text\/html/i.test(contentType)) {
      const { title, text } = stripHtml(body);
      try {
        const cfg = require('../../config');
        if (cfg.indexer?.enabled && cfg.indexer.autoIndexFetchedContent && text) {
          await dbClient.indexDocument({ sourceType: 'doc', sourceId: url, title: title || url, content: text.slice(0, cfg.indexer.maxDocLength || 8000) });
        }
      } catch (_) {}
      return JSON.stringify({ url, status, contentType, title, textSnippet: text.slice(0, 2000), fullTextLength: text.length }, null, 2);
    }
    try {
      const cfg = require('../../config');
      if (cfg.indexer?.enabled && cfg.indexer.autoIndexFetchedContent && /text\//i.test(contentType)) {
        await dbClient.indexDocument({ sourceType: 'doc', sourceId: url, title: url, content: body.slice(0, cfg.indexer.maxDocLength || 8000) });
      }
    } catch (_) {}
    return JSON.stringify({ url, status, contentType, textSnippet: body.slice(0, 2000), length: body.length }, null, 2);
  }
}

// Unified research tool
async function researchTool(params, exchange, requestId = `req-${Date.now()}`) {
  const isAsync = params?.async !== false; // default async
  if (isAsync) {
    return submitResearch(params, exchange, requestId);
  }
  return conductResearch(params, exchange, requestId);
}

// New: tool discovery schemas
const listToolsSchema = z.object({
  query: z.string().optional().describe("Optional text to filter tool names/descriptions."),
  limit: z.number().int().positive().optional().default(50),
  semantic: z.boolean().optional().default(true),
  _requestId: z.string().optional()
}).describe("List available MCP tools with metadata. Optionally filter by query and use semantic ranking.");

const searchToolsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional().default(10),
  _requestId: z.string().optional()
}).describe("Semantic search over available tools. Returns ranked matches.");

// New: Tool catalog utilities
const TOOL_CATALOG = [
  { name: 'agent', description: 'Single entrypoint agent. Routes to research, follow_up, or retrieve/query with parameters.' },
  { name: 'ping', description: 'Health check. Returns pong, optionally with server info.' },
  { name: 'research', description: 'Submit research query. async:true (default) returns job_id, async:false streams results. Requires query parameter.' },
  { name: 'conduct_research', description: 'Synchronous research; returns final text. Accepts freeform query or {query}.' },
  { name: 'job_status', description: 'Check async job progress. Requires job_id parameter. Returns terse status summary by default.' },
  { name: 'get_job_status', description: 'Alias for job_status.' },
  { name: 'cancel_job', description: 'Cancel running job. Requires job_id parameter.' },
  { name: 'retrieve', description: 'Search KB or run SQL. Freeform query = index; SQL text or mode:sql runs SELECT.' },
  { name: 'search', description: 'Alias for retrieve (index mode) with keys: q,k,scope.' },
  { name: 'query', description: 'Alias for retrieve (sql mode): {sql, params?, explain?}.' },
  { name: 'get_report', description: 'Get research report by ID. mode:"summary" for brief, mode:"full" for complete text.' },
  { name: 'get_report_content', description: 'Alias for get_report.' },
  { name: 'history', description: 'List recent research reports. Optional limit and queryFilter.' },
  { name: 'get_server_status', description: 'Server health check - database, embedder, job queue status.' },
  { name: 'date_time', description: "Current date/time. format: 'iso'|'rfc'|'epoch' (aka 'unix'); accepts freeform iso/rfc/epoch too." },
  { name: 'calc', description: 'Evaluate math: +,-,*,/,^,(), decimals. Accepts freeform expression or {expr}.' },
  { name: 'list_tools', description: 'Show all available tools with parameters.' },
  { name: 'search_tools', description: 'Find tools by semantic search. Requires query parameter.' },
  { name: 'batch_research', description: 'Dispatch multiple research queries in single call. waitForCompletion:true waits and returns results.' }
];

function summarizeParamsForTool(name) {
  // Minimal param summaries for client display (avoid leaking full zod schemas)
  switch (name) {
    case 'agent': return ['action? (auto|research|follow_up|retrieve|query)', 'query?', 'async?', 'originalQuery?', 'followUpQuestion?', 'mode?', 'sql?', 'params?', 'k?', 'scope?', 'explain?'];
    case 'ping': return ['info?'];
    case 'research': return ['query', 'async?', 'costPreference?', 'audienceLevel?', 'outputFormat?', 'includeSources?'];
    case 'job_status': return ['job_id', 'format?', 'since_event_id?', 'max_events?'];
    case 'cancel_job': return ['job_id'];
    case 'retrieve': return ['mode', 'query?', 'sql?', 'params?', 'k?', 'scope?', 'explain?'];
    case 'get_report': return ['reportId', 'mode?', 'maxChars?', 'query?'];
    case 'history': return ['limit?', 'queryFilter?'];
    case 'conduct_research': return ['query', 'costPreference?', 'audienceLevel?', 'outputFormat?', 'includeSources?', 'images?', 'textDocuments?', 'structuredData?'];
    case 'submit_research': return ['query', 'notify?'];
    case 'search': return ['q', 'k?', 'scope?'];
    case 'query': return ['sql', 'params?', 'explain?'];
    case 'get_past_research': return ['query', 'limit?', 'minSimilarity?'];
    case 'research_follow_up': return ['originalQuery', 'followUpQuestion', 'costPreference?'];
    case 'get_report_content': return ['reportId'];
    case 'execute_sql': return ['sql', 'params?'];
    case 'list_models': return ['refresh?'];
    case 'export_reports': return ['format?', 'limit?', 'queryFilter?'];
    case 'import_reports': return ['format?', 'content'];
    case 'backup_db': return ['destinationDir?'];
    case 'search_web': return ['query', 'maxResults?'];
    case 'fetch_url': return ['url', 'maxBytes?'];
    case 'index_texts': return ['documents[]', 'sourceType?'];
    case 'index_url': return ['url', 'maxBytes?'];
    case 'search_index': return ['query', 'limit?'];
    case 'calc': return ['expr', 'precision?'];
    case 'list_tools': return ['query?', 'limit?', 'semantic?'];
    case 'search_tools': return ['query', 'limit?'];
    case 'date_time': return ['format?'];
    case 'get_server_status': return [];
    case 'batch_research': return ['queries[]', 'waitForCompletion?', 'timeoutMs?', 'costPreference?'];
    default: return [];
  }
}

function dot(a, b) {
  let s = 0; const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += (Number(a[i]) || 0) * (Number(b[i]) || 0);
  return s;
}

async function buildToolEmbedding(text) {
  try {
    const emb = await dbClient.generateEmbedding(String(text).slice(0, 1000));
    return emb || [];
  } catch (_) {
    return [];
  }
}

// MODE-based tool exposure (mirrors mcpServer.js shouldExpose logic)
const MODE = (config.mcp?.mode || 'ALL').toUpperCase();
const ALWAYS_ON = new Set(['ping', 'get_server_status', 'job_status', 'get_job_status', 'cancel_job']);
const AGENT_ONLY = new Set(['agent']);
const MANUAL_SET = new Set([
  'research', 'conduct_research', 'submit_research', 'research_follow_up',
  'retrieve', 'search', 'query',
  'get_report', 'get_report_content', 'history', 'list_research_history'
]);
function toolExposedByMode(name) {
  if (ALWAYS_ON.has(name)) return true;
  if (MODE === 'AGENT') return AGENT_ONLY.has(name);
  if (MODE === 'MANUAL') return MANUAL_SET.has(name);
  return true; // ALL
}

async function listToolsTool(params, mcpExchange = null, requestId = 'unknown-req') {
  const { query, limit, semantic } = params || {};
  const all = TOOL_CATALOG.filter(t => toolExposedByMode(t.name)).filter(t => {
    if (!query || !query.trim()) return true;
    const q = query.toLowerCase();
    return t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
  });

  if (!semantic || !query || !query.trim()) {
    const items = all.slice(0, limit).map(t => ({
      name: t.name,
      description: t.description,
      params: summarizeParamsForTool(t.name)
    }));
    return JSON.stringify({ tools: items }, null, 2);
  }

  // Semantic rank
  const qEmb = await buildToolEmbedding(query);
  const ranked = [];
  for (const t of all) {
    const text = `${t.name}: ${t.description}`;
    const emb = await buildToolEmbedding(text);
    const score = (qEmb.length && emb.length) ? dot(qEmb, emb) : 0;
    ranked.push({
      name: t.name,
      description: t.description,
      params: summarizeParamsForTool(t.name),
      score
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  return JSON.stringify({ tools: ranked.slice(0, limit) }, null, 2);
}

async function searchToolsTool(params, mcpExchange = null, requestId = 'unknown-req') {
  const { query, limit } = params;
  return listToolsTool({ query, limit, semantic: true }, mcpExchange, requestId);
}

// Date/time and calculator tools
const dateTimeSchema = z.object({ format: z.string().optional().default('iso') }).describe("Get current date/time. format: 'iso'|'rfc'|'epoch'.");
async function dateTimeTool(params) {
  const now = new Date();
  switch ((params?.format || 'iso').toLowerCase()) {
    case 'rfc': return JSON.stringify({ now: now.toUTCString() });
    case 'epoch':
    case 'unix': return JSON.stringify({ now: Math.floor(now.getTime()/1000) });
    default: return JSON.stringify({ now: now.toISOString() });
  }
}

const calcSchema = z.object({ expr: z.string(), precision: z.number().int().min(0).max(12).optional().default(6) }).describe("Evaluate a simple arithmetic expression (+,-,*,/,^,(), decimals). Safe parser.");
async function calcTool(params) {
  const src = String(params.expr || '').trim();
  // Allow digits, operators, parens, decimal, caret, and whitespace (space, tab)
  if (!/^[0-9+\-*/().^ \t]+$/.test(src)) return JSON.stringify({ error: 'Invalid characters' });
  try {
    // Replace ^ with ** for exponent
    const js = src.replace(/\^/g, '**');
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${js});`);
    const val = fn();
    if (typeof val !== 'number' || !isFinite(val)) return JSON.stringify({ error: 'Computation failed' });
    return JSON.stringify({ expr: src, result: Number(val.toFixed(params.precision || 6)) });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

// Unified retrieve schema (index/sql)
const retrieveSchema = z.object({
  mode: z.enum(['index','sql']).default('index').describe("'index' for semantic search, 'sql' for database query"),
  // index mode params
  query: z.string().optional().describe("Search query for index mode, e.g. 'machine learning'"),
  k: z.number().int().positive().optional().default(10).describe("Number of results (1-100)"),
  scope: z.enum(['both','reports','docs']).optional().default('both').describe("Search in reports, docs, or both"),
  rerank: z.boolean().optional().describe("Enable LLM reranking for better relevance"),
  // sql mode params
  sql: z.string().optional().describe("SQL query for sql mode, e.g. 'SELECT * FROM research_reports LIMIT 5'"),
  params: z.array(z.any()).optional().default([]).describe("SQL bound parameters"),
  explain: z.boolean().optional().default(false).describe("Explain results in plain English")
}).describe("Retrieve from KB or DB. Examples: {mode:'index', query:'AI safety', k:5} or {mode:'sql', sql:'SELECT id,query FROM research_reports', explain:true}");

// Unified retrieve wrapper
async function retrieveTool(params, mcpExchange = null, requestId = `req-${Date.now()}`) {
  const wantsSql = (params?.mode === 'sql') || (!!params?.sql && !params?.query);
  if (wantsSql) {
    if (!params.sql) throw new Error('retrieve: sql is required when mode="sql"');
    return queryTool({ sql: params.sql, params: params.params || [], explain: !!params.explain }, mcpExchange, requestId);
  }
  const q = (params?.query || '').trim();
  if (!q) throw new Error('retrieve: query is required when mode="index"');
  return searchTool({ q, k: params.k || 10, scope: params.scope || 'both', rerank: !!params.rerank }, mcpExchange, requestId);
}

// Agent meta-tool schema and router
const agentSchema = z.object({
  action: z.enum(['auto','research','follow_up','retrieve','query','chain']).optional().default('auto'),
  // Common
  async: z.boolean().optional().default(true),
  notify: z.string().url().optional(),
  // Research
  query: z.string().optional(),
  q: z.string().optional().describe("Alias for query"),
  costPreference: conductResearchSchemaBase.shape.costPreference.optional(),
  cost: z.enum(['high', 'low']).optional().describe("Alias for costPreference"),
  audienceLevel: conductResearchSchemaBase.shape.audienceLevel.optional(),
  outputFormat: conductResearchSchemaBase.shape.outputFormat.optional(),
  includeSources: conductResearchSchemaBase.shape.includeSources.optional(),
  images: conductResearchSchemaBase.shape.images.optional(),
  textDocuments: conductResearchSchemaBase.shape.textDocuments.optional(),
  structuredData: conductResearchSchemaBase.shape.structuredData.optional(),
  // Follow up
  originalQuery: z.string().optional(),
  followUpQuestion: z.string().optional(),
  // Retrieve / Query
  mode: z.enum(['index','sql']).optional(),
  k: z.number().int().positive().optional(),
  scope: z.enum(['both','reports','docs']).optional(),
  rerank: z.boolean().optional(),
  sql: z.string().optional(),
  params: z.array(z.any()).optional(),
  explain: z.boolean().optional(),
  // Tool chaining: execute multiple tools in sequence
  chain: z.array(z.object({
    tool: z.string(),
    params: z.record(z.any()).optional()
  })).optional(),
  _requestId: z.string().optional()
}).describe("Single entrypoint agent tool. Routes to research, follow_up, retrieve/query, or chain. Examples: {query:'AI safety'} for research, {action:'retrieve', query:'topic', k:5} for search, {chain:[{tool:'search',params:{q:'topic'}},{tool:'get_report',params:{reportId:'1'}}]} for chaining. Max depth: " + (parseInt(process.env.MAX_TOOL_DEPTH,10) ?? 3) + ".");

async function agentTool(params, mcpExchange = null, requestId = `req-${Date.now()}`) {
  const action = (params?.action || 'auto').toLowerCase();

  // Handle tool chaining: execute multiple tools in sequence
  if (action === 'chain' || (params?.chain && Array.isArray(params.chain))) {
    const chain = params.chain || [];
    if (!chain.length) {
      return JSON.stringify({ error: 'chain requires at least one step', example: { chain: [{ tool: 'search', params: { q: 'topic' } }, { tool: 'get_report', params: { reportId: '1' } }] } });
    }

    const maxSteps = Math.min(chain.length, MAX_TOOL_DEPTH > 0 ? MAX_TOOL_DEPTH : 10);
    const results = [];

    for (let i = 0; i < maxSteps; i++) {
      const step = chain[i];
      const toolName = step.tool?.toLowerCase();
      const toolParams = step.params || {};

      try {
        const result = await routeToTool(toolName, toolParams, mcpExchange, requestId);
        results.push({
          step: i + 1,
          tool: toolName,
          success: true,
          result: typeof result === 'string' ? (result.startsWith('{') || result.startsWith('[') ? JSON.parse(result) : result) : result
        });
      } catch (err) {
        results.push({
          step: i + 1,
          tool: toolName,
          success: false,
          error: err.message
        });
        // Stop chain on error (can be made configurable)
        break;
      }
    }

    return JSON.stringify({
      chain: {
        requested: chain.length,
        executed: results.length,
        maxDepth: MAX_TOOL_DEPTH,
        results
      }
    }, null, 2);
  }

  if (action === 'research') return researchTool(params, mcpExchange, requestId);
  if (action === 'follow_up') return researchFollowUp(params, mcpExchange, requestId);
  if (action === 'retrieve') return retrieveTool({ mode: 'index', query: params.query, k: params.k, scope: params.scope, rerank: params.rerank }, mcpExchange, requestId);
  if (action === 'query') return retrieveTool({ mode: 'sql', sql: params.sql, params: params.params || [], explain: !!params.explain }, mcpExchange, requestId);
  if (params?.originalQuery && params?.followUpQuestion) {
    return researchFollowUp({ originalQuery: params.originalQuery, followUpQuestion: params.followUpQuestion, costPreference: params.costPreference }, mcpExchange, requestId);
  }
  if (params?.sql) {
    return retrieveTool({ mode: 'sql', sql: params.sql, params: params.params || [], explain: !!params.explain }, mcpExchange, requestId);
  }
  if (params?.mode === 'index' || (params?.k || params?.scope || params?.rerank)) {
    if (!params?.query) throw new Error('agent: query is required for retrieve mode');
    return retrieveTool({ mode: 'index', query: params.query, k: params.k || 10, scope: params.scope || 'both', rerank: !!params.rerank }, mcpExchange, requestId);
  }
  return researchTool(params, mcpExchange, requestId);
}

// Batch research tool for efficient parallel job dispatch
const batchResearchSchema = z.object({
  queries: z.array(z.union([
    z.string(),
    z.object({
      query: z.string(),
      costPreference: z.enum(['high', 'low']).optional(),
      audienceLevel: z.enum(['beginner', 'intermediate', 'expert']).optional()
    })
  ])).min(1).max(10).describe("Array of research queries (strings or objects with query + options). Max 10."),
  waitForCompletion: z.boolean().optional().default(false).describe("If true, waits for all jobs to complete and returns results. If false, returns job IDs immediately."),
  timeoutMs: z.number().int().positive().optional().default(300000).describe("Max wait time in ms when waitForCompletion=true. Default 5 minutes."),
  costPreference: z.enum(['high', 'low']).optional().default('low').describe("Default cost preference for all queries"),
  _requestId: z.string().optional()
}).describe("Batch dispatch multiple research queries in a single call. Returns job IDs or waits for completion. Example: {queries: ['topic 1', 'topic 2', {query:'topic 3', costPreference:'high'}], waitForCompletion: true}");

async function batchResearchTool(params, mcpExchange = null, requestId = `batch-${Date.now()}`) {
  const queries = params.queries || [];
  const waitForCompletion = params.waitForCompletion || false;
  const timeoutMs = params.timeoutMs || 300000;
  const defaultCost = params.costPreference || 'low';

  if (!queries.length) {
    return JSON.stringify({ error: 'queries array is required and must not be empty' });
  }

  // Dispatch all jobs
  const jobIds = [];
  const dispatchedQueries = [];

  for (const q of queries) {
    const queryStr = typeof q === 'string' ? q : q.query;
    const cost = typeof q === 'object' && q.costPreference ? q.costPreference : defaultCost;
    const audience = typeof q === 'object' && q.audienceLevel ? q.audienceLevel : 'intermediate';

    const jobParams = {
      query: queryStr,
      costPreference: cost,
      audienceLevel: audience
    };

    const jobId = await dbClient.createJob('research', jobParams);
    await dbClient.appendJobEvent(jobId, 'submitted', { requestId, query: queryStr, batch: true });
    jobIds.push(jobId);
    dispatchedQueries.push({ jobId, query: queryStr, costPreference: cost });
  }

  // Generate batch SSE URL
  const { server } = require('../../config');
  const base = server.publicUrl || '';
  const batchSseUrl = `${base.replace(/\/$/,'')}/jobs/batch/events?ids=${jobIds.join(',')}`;

  // Track in session if available
  try {
    const { getSessionManager, EventTypes } = require('../utils/sessionStore');
    const sessionManager = getSessionManager(dbClient);
    await sessionManager.dispatch('default', 'JOBS_DISPATCHED', {
      jobIds,
      queries: dispatchedQueries,
      requestId,
      timestamp: new Date().toISOString()
    });
  } catch (_) {
    // Session tracking optional
  }

  // If not waiting, return immediately
  if (!waitForCompletion) {
    return JSON.stringify({
      batch: {
        jobCount: jobIds.length,
        jobIds,
        queries: dispatchedQueries,
        batchSseUrl,
        status: 'dispatched',
        message: `${jobIds.length} research jobs dispatched. Poll ${batchSseUrl} for updates or use job_status for individual jobs.`
      }
    }, null, 2);
  }

  // Wait for all jobs to complete
  const startTime = Date.now();
  const results = [];
  const pendingJobs = new Set(jobIds);

  while (pendingJobs.size > 0 && (Date.now() - startTime) < timeoutMs) {
    for (const jobId of [...pendingJobs]) {
      const status = await dbClient.getJobStatus(jobId);
      if (status && ['succeeded', 'failed', 'canceled'].includes(status.status)) {
        let result = status.result;
        if (typeof result === 'string') {
          try { result = JSON.parse(result); } catch (_) {}
        }
        results.push({
          jobId,
          status: status.status,
          query: dispatchedQueries.find(q => q.jobId === jobId)?.query,
          result,
          reportId: result?.report_id || result?.reportId || null
        });
        pendingJobs.delete(jobId);
      }
    }

    if (pendingJobs.size > 0) {
      // Wait before next poll (500ms)
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Track completion in session
  try {
    const { getSessionManager } = require('../utils/sessionStore');
    const sessionManager = getSessionManager(dbClient);
    await sessionManager.dispatch('default', 'JOBS_COMPLETED', {
      results: results.map(r => ({ jobId: r.jobId, status: r.status, reportId: r.reportId })),
      requestId,
      timestamp: new Date().toISOString()
    });
  } catch (_) {}

  const timedOut = pendingJobs.size > 0;
  const elapsedMs = Date.now() - startTime;

  return JSON.stringify({
    batch: {
      jobCount: jobIds.length,
      completedCount: results.length,
      timedOut,
      elapsedMs,
      results,
      pendingJobIds: timedOut ? [...pendingJobs] : [],
      reportIds: results.filter(r => r.reportId).map(r => r.reportId)
    }
  }, null, 2);
}

// Ping tool for health check and latency
const pingSchema = z.object({
  info: z.boolean().optional().default(false)
}).describe("Lightweight health check. Returns pong with server time; info=true adds DB/embedder/job counts.");

async function pingTool(params) {
  const base = { pong: true, time: new Date().toISOString() };
  if (!params?.info) return JSON.stringify(base);
  try {
    const embedderReady = dbClient.isEmbedderReady();
    const dbInitialized = dbClient.isDbInitialized();
    const dbPathInfo = dbClient.getDbPathInfo();
    let jobs = [];
    try { jobs = await dbClient.executeQuery(`SELECT status, COUNT(*) AS n FROM jobs GROUP BY status`, []); } catch (_) {}
    return JSON.stringify({ ...base, database: { initialized: dbInitialized, storageType: dbPathInfo }, embedder: { ready: embedderReady }, jobs }, null, 2);
  } catch (_) {
    return JSON.stringify(base);
  }
}

module.exports = {
  // Schemas
  conductResearchSchema,
  submitResearchSchema,
  getJobStatusSchema,
  cancelJobSchema,
  executeSqlSchema, // Add new schema
  researchFollowUpSchema,
  getPastResearchSchema,
  rateResearchReportSchema,
  listResearchHistorySchema,
  listModelsSchema: z.object({ refresh: z.boolean().optional().default(false) }),
  getReportContentSchema,
  getServerStatusSchema,
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
  searchSchema,
  querySchema,
  researchSchema,
  listToolsSchema,
  searchToolsSchema,
  dateTimeSchema,
  calcSchema,
  retrieveSchema,
  
  // Functions
  conductResearch,
   submitResearch,
  getJobStatusTool,
  cancelJobTool,
  researchFollowUp,
  getPastResearch,
  rateResearchReport,
  listResearchHistory,
  getReportContent,
  getServerStatus,
  executeSql,
  listModels,
  exportReports,
  importReports,
  backupDb,
  dbHealth,
  reindexVectorsTool,
  searchWeb,
  fetchUrl,
  searchTool,
  queryTool,
  index_texts,
  index_url,
  search_index,
  index_status,
  researchTool,
  listToolsTool,
  searchToolsTool,
  dateTimeTool,
  calcTool,
  retrieveTool,
  // Agent & ping
  agentSchema,
  agentTool,
  pingSchema,
  pingTool,
  // Batch research
  batchResearchSchema,
  batchResearchTool,
  // Recursive tool execution utilities
  routeToTool,
  getToolDepth,
  withDepthTracking,
  MAX_TOOL_DEPTH
};
