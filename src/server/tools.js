// src/server/tools.js
const { z } = require('zod');
const NodeCache = require('node-cache');
const fs = require('fs'); // Added for file system operations
const path = require('path'); // Added for path manipulation
const planningAgent = require('../agents/planningAgent');
const researchAgent = require('../agents/researchAgent');
const contextAgent = require('../agents/contextAgent');
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
const robustScraperInstance = new robustWebScraper();

// Compact param normalization for conduct_research
function normalizeResearchParams(params) {
  if (!params || typeof params !== 'object') return params;
  // Only apply when simpleTools enabled (default true)
  try { if (require('../../config').simpleTools?.enabled === false) return params; } catch (_) {}
  const out = { ...params };
  if (out.q && !out.query) out.query = out.q;
  if (out.cost && !out.costPreference) out.costPreference = out.cost;
  if (out.aud && !out.audienceLevel) out.audienceLevel = out.aud;
  if (out.fmt && !out.outputFormat) out.outputFormat = out.fmt;
  if (typeof out.src === 'boolean' && out.includeSources === undefined) out.includeSources = out.src;
  if (Array.isArray(out.imgs) && !out.images) out.images = out.imgs;
  if (out.docs && !out.textDocuments) {
    if (Array.isArray(out.docs)) {
      out.textDocuments = out.docs.map((d, i) => typeof d === 'string' ? ({ name: `doc_${i+1}.txt`, content: d }) : d);
    }
  }
  if (out.data && !out.structuredData) {
    if (Array.isArray(out.data)) {
      out.structuredData = out.data.map((d, i) => {
        if (typeof d === 'string') return ({ name: `data_${i+1}.json`, type: 'json', content: d });
        return d;
      });
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
      console.error(`[${new Date().toISOString()}] Cache hit for key: ${key.substring(0, 50)}...`);
      return cachedData;
    } else {
      console.error(`[${new Date().toISOString()}] Cache miss for key: ${key.substring(0, 50)}...`);
      return null;
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Cache GET error for key ${key.substring(0, 50)}...:`, error);
    return null;
  }
}

function setInCache(key, data) {
  try {
    cache.set(key, data);
    console.error(`[${new Date().toISOString()}] Cache set for key: ${key.substring(0, 50)}... TTL: ${CACHE_TTL_SECONDS}s`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Cache SET error for key ${key.substring(0, 50)}...:`, error);
  }
}

const conductResearchSchema = z.object({
  query: z.string().min(1, "Query must not be empty"),
  costPreference: z.enum(['high', 'low']).default('low'),
  audienceLevel: z.enum(['beginner', 'intermediate', 'expert']).default('intermediate'),
  outputFormat: z.enum(['report', 'briefing', 'bullet_points']).default('report'),
  includeSources: z.boolean().default(true),
  maxLength: z.number().optional(),
  images: z.array(z.object({
    url: z.string().url().or(z.string().startsWith('data:image/')),
    detail: z.enum(['low', 'high', 'auto']).optional().default('auto')
  })).optional().describe("Optional array of images (URLs or base64 data URIs) relevant to the query."),
  // Renamed 'documents' to 'textDocuments' for clarity
  textDocuments: z.array(z.object({
    name: z.string().describe("Filename or identifier for the text document."),
    content: z.string().describe("Text content of the document.")
  })).optional().describe("Optional array of text documents relevant to the query."),
  // Add optional structured data input
  structuredData: z.array(z.object({
    name: z.string().describe("Identifier for the structured data (e.g., filename)."),
    type: z.enum(['csv', 'json']).describe("Type of structured data ('csv' or 'json')."),
    content: z.string().describe("String content of the structured data (e.g., CSV text or JSON string).")
  })).optional().describe("Optional array of structured data inputs relevant to the query."),
  // NEW: environment/client context and mode
  clientContext: z.any().optional().describe("Optional client-provided context about environment (app, os, user, session)."),
  mode: z.enum(['standard','hyper']).optional().default('standard'),
  _mcpExchange: z.any().optional().describe("Internal MCP exchange context for progress reporting"),
  _requestId: z.string().optional().describe("Internal request ID for logging") // Add optional requestId
});

// Async job tool schemas
const submitResearchSchema = conductResearchSchema.extend({
  notify: z.string().url().optional().describe("Optional webhook to notify on completion")
}).describe("Submit a long-running research job asynchronously. Returns a job_id immediately. Use get_job_status/cancel_job to manage. Input synonyms supported (q,cost,aud,fmt,src,imgs,docs,data).");
const getJobStatusSchema = z.object({ job_id: z.string(), since_event_id: z.number().int().optional(), format: z.enum(['summary','full','events']).optional().default('summary'), max_events: z.number().int().positive().optional().default(50) }).describe("Get job status with a compact summary by default. Use format: 'full' to include full status + events or 'events' to return only events.");
const cancelJobSchema = z.object({ job_id: z.string() }).describe("Cancel a queued or running job (best-effort).");
const getJobResultSchema = z.object({ job_id: z.string() }).describe("Get the structured result of a completed job if it succeeded.");

// Unified research schema (async by default)
const researchSchema = conductResearchSchema.extend({
  async: z.boolean().optional().default(true),
  notify: z.string().url().optional()
}).describe("Unified research tool. async=true (default) enqueues and returns {job_id}. async=false streams results synchronously like conduct_research.");

// Simplified tools
const searchSchema = z.object({
  q: z.string().min(1),
  k: z.number().int().positive().optional().default(10),
  scope: z.enum(['both','reports','docs']).optional().default('both'),
  rerank: z.boolean().optional()
}).describe("Unified hybrid retrieval across docs and reports (BM25+vector, optional LLM rerank). Returns typed hits with score fields.");
const querySchema = z.object({
  sql: z.string().min(1),
  params: z.array(z.any()).optional().default([]),
  explain: z.boolean().optional().default(false)
}).describe("Execute a read-only SELECT with bound params. Optional explain summarizes results in plain English.");

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

  // Destructure all potential inputs, with safety checks
  const query = params.query || ''; // Ensure query is at least an empty string
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
      console.error(`[${new Date().toISOString()}] Progress Error Chunk:`, chunk.error);
      if (mcpExchange && progressToken) {
        mcpExchange.sendProgress({ token: progressToken, value: { type: 'error', message: chunk.error } });
      }
    }
  };

  // NEW: Try semantic cache first
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
      console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Returning semantic-cached result for query "${safeSubstring(query, 0, 50)}..." (cacheType=${similarCache.cacheType}, sim=${typeof similarCache.similarity === 'number' ? similarCache.similarity.toFixed(3) : 'n/a'})`);
      if (progressToken) {
        sendProgress({ content: similarCache.result });
        return "Research complete. Results streamed (from cache).";
      }
      return similarCache.result;
    }
  } catch (_) {}

  const cacheKey = getCacheKey(params);
  const cachedResult = getFromCache(cacheKey);
  if (cachedResult) {
    console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Returning cached result for query "${safeSubstring(query, 0, 50)}..." (Images: ${images ? images.length : 0}, Docs: ${textDocuments ? textDocuments.length : 0}, Structured: ${structuredData ? structuredData.length : 0})`);
    if (progressToken) {
      sendProgress({ content: cachedResult });
      return "Research complete. Results streamed (from cache).";
    }
    return cachedResult;
  }
  console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Cache miss for query "${safeSubstring(query, 0, 50)}..." (Images: ${images ? images.length : 0}, Docs: ${textDocuments ? textDocuments.length : 0}, Structured: ${structuredData ? structuredData.length : 0})`);

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
    console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Assessed complexity as "${complexity}", setting MAX_ITERATIONS to ${MAX_ITERATIONS}.`);
  } catch (complexityError) {
    console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Error assessing complexity, using default MAX_ITERATIONS=${MAX_ITERATIONS}. Error:`, complexityError);
  }

  let currentIteration = 1;
  let allAgentQueries = [];
  let allResearchResults = [];
  let savedReportId = null;

  console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Starting iterative research process for query "${safeSubstring(query, 0, 50)}...". Max iterations: ${MAX_ITERATIONS}`);

  const totalStages = MAX_ITERATIONS * 3 + 1; // Define totalStages before the main try block
    let relevantPastReports = [];
    let inputEmbeddings = {}; // Object to hold embeddings for input data

    try { // Master try block for the whole process

      // If clientContext provided, persist a context snapshot event for traceability
      try { if (clientContext) await onEvent('client_context', { clientContext }); } catch (_) {}
      // --- Generate Embeddings for Input Data (Optional) ---
      try {
        if (textDocuments && textDocuments.length > 0) {
          console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Generating embeddings for ${textDocuments.length} input text document(s)...`);
        inputEmbeddings.textDocuments = await Promise.all(
          textDocuments.map(async (doc) => ({
            name: doc.name,
            embedding: await dbClient.generateEmbedding(doc.content.substring(0, 1000)) // Embed first 1k chars
          }))
        );
        // Filter out null embeddings
        inputEmbeddings.textDocuments = inputEmbeddings.textDocuments.filter(e => e.embedding !== null);
        console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Generated ${inputEmbeddings.textDocuments.length} text document embeddings.`);
      }
      if (structuredData && structuredData.length > 0) {
         console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Generating embeddings for ${structuredData.length} input structured data item(s)...`);
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
           console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Generated ${inputEmbeddings.structuredData.length} structured data embeddings.`);
        }
      } catch (embeddingError) {
        console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Error during input embedding generation:`, embeddingError);
        // Decide if this is fatal or recoverable. For now, let's treat it as non-fatal but log it.
        // throw new Error(`[${requestId}] Failed during input embedding generation: ${embeddingError.message}`); 
      }
      // --- End Input Embedding Generation ---


      // --- Knowledge Base Lookup (Semantic Search) ---
      try {
        console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Performing semantic search in knowledge base for query "${safeSubstring(query, 0, 50)}..."`);
        const similarReports = await dbClient.findReportsBySimilarity(query, 3, 0.75);
        if (similarReports && similarReports.length > 0) {
          relevantPastReports = similarReports.map(r => {
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
          console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Found ${relevantPastReports.length} semantically relevant past report(s).`);
        } else {
          console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: No semantically relevant past reports found in knowledge base.`);
        }
      } catch (searchError) {
         console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Error during semantic search:`, searchError);
         // Decide if this is fatal. Probably should be.
         throw new Error(`[${requestId}] Failed during semantic search: ${searchError.message}`);
      }
    // --- End Knowledge Base Lookup ---

    let previousResultsForRefinement = null;
    let nextAgentId = 1;

    // --- Main Research Loop ---
    while (currentIteration <= MAX_ITERATIONS) {
      console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: --- Iteration ${currentIteration}/${MAX_ITERATIONS} ---`);
      let planningResultXml; // Declare here to be accessible in catch
      const currentStageBase = (currentIteration - 1) * 3; // Define outside try block

      // Step 1: Plan or Refine Research
      try {
        const planningStartTime = Date.now();
        // const currentStageBase = (currentIteration - 1) * 3; // Moved outside
        const stagePrefixPlan = `Stage ${currentStageBase + 1}/${totalStages}`;
        console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: ${stagePrefixPlan} (Iter ${currentIteration}) - ${previousResultsForRefinement ? 'Refining' : 'Planning'} research...`);

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
        console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: ${stagePrefixPlan} - Planning completed in ${planningDuration}ms.`);
      } catch (planningError) {
         console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Error during planning/refinement call:`, planningError);
         throw new Error(`[${requestId}] Failed during planning agent call: ${planningError.message}`);
      }

      if (planningResultXml.includes("<plan_complete>")) {
        console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Planning agent indicated completion. Stopping iterations.`);
        break;
      }

      // Step 2: Parse the XML output from the planning agent
      let currentAgentQueries;
      try {
        const parsingStartTime = Date.now();
        const stagePrefixParse = `Stage ${currentStageBase + 2}/${totalStages}`;
        console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: ${stagePrefixParse} (Iter ${currentIteration}) - Parsing research plan (XML)...`);
        currentAgentQueries = parseAgentXml(planningResultXml).map(q => ({ ...q, id: nextAgentId++ })); // Use XML parser
        const parsingDuration = Date.now() - parsingStartTime;

        if (!currentAgentQueries || currentAgentQueries.length === 0) {
          // Handle specific case where refinement might return "<plan_complete>"
          if (planningResultXml.includes("<plan_complete>")) {
             console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Plan complete signal detected in raw output (during parsing stage).`);
             break; // Exit loop as plan is complete
          }
          // If not plan complete and parsing failed/yielded no queries
          if (previousResultsForRefinement) {
            console.warn(`[${new Date().toISOString()}] [${requestId}] conductResearch: Refinement yielded no new queries or failed parsing. Stopping iterations. Raw Output:\n${planningResultXml}`);
            break;
          } else {
            console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Failed to parse initial research plan XML or no queries found. Raw Output:\n${planningResultXml}`);
            throw new Error(`[${requestId}] Failed to parse initial research plan XML. No agent queries found.`);
          }
        }
        console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: ${stagePrefixParse} - XML Parsing completed in ${parsingDuration}ms. Found ${currentAgentQueries.length} new sub-queries.`);
        allAgentQueries.push(...currentAgentQueries);
      } catch (parsingError) {
         console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Error during XML parsing:`, parsingError);
         throw new Error(`[${requestId}] Failed during XML parsing: ${parsingError.message}`);
      }

      // Step 3: Conduct parallel research
      let currentResearchResults;
      try {
        const researchStartTime = Date.now();
        const stagePrefixResearch = `Stage ${currentStageBase + 3}/${totalStages}`;
        console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: ${stagePrefixResearch} (Iter ${currentIteration}) - Conducting parallel research for ${currentAgentQueries.length} agents...`);
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
        console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: ${stagePrefixResearch} - Parallel research completed in ${researchDuration}ms.`);
      } catch (researchError) {
        // This catch block might be less necessary now with Promise.allSettled inside conductParallelResearch, 
        // but kept for safety in case the call itself fails.
        console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Error calling conductParallelResearch:`, researchError);
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
      console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: No research results were generated after all iterations.`);
      throw new Error(`[${requestId}] Failed to generate any research results after planning/refinement.`);
    }

    // Step 4 (Final Synthesis): Contextualize ALL accumulated results
    let finalReportContent = '';
    let streamError = null;
    try {
      const contextStartTime = Date.now();
      const finalStagePrefix = `Stage ${totalStages}/${totalStages}`;
      console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: ${finalStagePrefix} - Contextualizing ${allResearchResults.length} total results (streaming)...`);
      
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
        console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: ${finalStagePrefix} - Contextualization stream completed in ${contextDuration}ms.`);
      } else {
         console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: ${finalStagePrefix} - Contextualization stream finished with error after ${contextDuration}ms.`);
         // Do not throw here, allow process to continue to report the error
         // throw new Error(streamError || 'Unknown error during context stream processing');
      }
    } catch (contextError) {
      // Catch errors from initiating the stream or other unexpected issues in the synthesis step
      console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Error during context agent call/stream:`, contextError);
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
        savedReportId = await dbClient.saveResearchReport({
        originalQuery: query,
        parameters: { costPreference, audienceLevel, outputFormat, includeSources, maxLength },
        finalReport: finalReportContent,
        researchMetadata: researchMetadata,
        images: images,
        textDocuments: textDocuments,
        structuredData: structuredData,
        basedOnPastReportIds: relevantPastReports.map(r => r.reportId)
        });
        console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Report saved with ID: ${savedReportId}`);
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
            console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Indexed report ${savedReportId} into local BM25 index.`);
          }
        } catch (idxErr) {
          console.warn(`[${new Date().toISOString()}] [${requestId}] conductResearch: Failed to index report ${savedReportId}: ${idxErr.message}`);
        }
      } catch (dbError) {
         console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Error saving report to DB:`, dbError);
         // Decide if this is fatal. Let's allow completion but log the error.
         // throw new Error(`[${requestId}] Failed saving report to database: ${dbError.message}`);
      }
    } else {
      console.warn(`[${new Date().toISOString()}] [${requestId}] conductResearch: Skipping cache set and DB save due to synthesis stream error.`);
    }

    const overallDuration = Date.now() - overallStartTime;
    console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Full research process finished in ${overallDuration}ms for query "${query.substring(0, 50)}..." (Synthesis status: ${streamError ? 'Failed' : 'Success'})`);

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
          console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Full report saved to: ${fullReportPath}`);
        } catch (fileError) {
          console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Error saving full report to file:`, fileError);
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
    // Log the raw error directly for debugging
    console.error(`[${new Date().toISOString()}] [${requestId}] conductResearch: Error during research process after ${overallDuration}ms. Query: "${query.substring(0, 50)}...". Original Error:`, error);
    // Create a generic error message including requestId
    const genericErrorMessage = `[${requestId}] Research process failed for query "${query.substring(0, 50)}..."`;
    // Throw a new generic error
    throw new Error(genericErrorMessage);
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
    const result_url = `${base.replace(/\/$/,'')}/mcp`; // Client would call get_job_result
    
    await dbClient.appendJobEvent(jobId, 'resource_links', { sse_url, ui_url, result_url });

    return JSON.stringify({
      job_id: jobId,
      resources: [
        { rel: 'monitor', href: sse_url, type: 'text/event-stream' },
        { rel: 'alternate', href: ui_url, type: 'text/html' },
        { rel: 'result', href: result_url, 'mcp-method': 'get_job_result' }
      ]
    });
  } catch (_) {
    return JSON.stringify({ job_id: jobId });
  }
}

async function getJobStatusTool(params) {
  const stat = await dbClient.getJobStatus(params.job_id);
  if (!stat) return JSON.stringify({ status: 'not_found' });
  if (params.format === 'events') {
    const events = await dbClient.getJobEvents(params.job_id, params.since_event_id, params.max_events);
    return JSON.stringify({ job_id: params.job_id, events });
  }
  if (params.format === 'full') {
    const events = await dbClient.getJobEvents(params.job_id, params.since_event_id, params.max_events);
    return JSON.stringify({ ...stat, events });
  }
  // summary is default
  const { result, ...summary } = stat;
  return JSON.stringify(summary);
}

async function getJobResultTool(params) {
  const stat = await dbClient.getJobStatus(params.job_id);
  if (!stat) return JSON.stringify({ status: 'not_found', result: null });
  if (stat.status !== 'succeeded') {
    return JSON.stringify({
      status: stat.status,
      error: `Job status is '${stat.status}', not 'succeeded'. Result is only available for succeeded jobs.`,
      result: null
    });
  }
  return JSON.stringify(stat.result || {});
}

async function cancelJobTool(params) {
  await dbClient.cancelJob(params.job_id);
  return JSON.stringify({ acknowledged: true, job_id: params.job_id });
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
  costPreference: conductResearchSchema.shape.costPreference.describe("Preference for model cost ('high' or 'low')."),
  _requestId: z.string().optional().describe("Internal request ID for logging") // Add optional requestId
});

const getPastResearchSchema = z.object({
  query: z.string().describe("The query string to search for semantically similar past reports."),
  limit: z.number().int().positive().optional().default(5).describe("Maximum number of past reports to return."),
  minSimilarity: z.number().min(0).max(1).optional().default(0.70).describe("Minimum cosine similarity score (0-1) for a report to be considered relevant."),
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
    console.error(`[${new Date().toISOString()}] [${requestId}] researchFollowUp: Starting follow-up for original query "${safeSubstring(originalQuery, 0, 50)}..."`);
    
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
    console.error(`[${new Date().toISOString()}] [${requestId}] researchFollowUp: Error processing follow-up query:`, error);
    throw new Error(`[${requestId}] Error conducting follow-up research: ${error.message}`);
  }
}

// Implementation of get_past_research tool - updated to accept requestId
async function getPastResearch(params, mcpExchange = null, requestId = 'unknown-req') { 
  const query = params.query || '';
  const limit = params.limit || 5;
  const minSimilarity = params.minSimilarity !== undefined ? params.minSimilarity : 0.70;
  
  const sendProgress = (chunk) => {
    if (mcpExchange && mcpExchange.progressToken) {
      mcpExchange.sendProgress({ token: mcpExchange.progressToken, value: chunk });
    }
  };

  try {
    console.error(`[${new Date().toISOString()}] [${requestId}] getPastResearch: Searching for semantically similar past reports for query "${safeSubstring(query, 0, 50)}..."`);
    
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
        console.warn(`[${new Date().toISOString()}] [${requestId}] getPastResearch: hybrid index lookup failed, falling back.`, e.message);
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
    console.error(`[${new Date().toISOString()}] [${requestId}] getPastResearch: Error searching for past reports:`, error);
    throw new Error(`[${requestId}] Error retrieving past research: ${error.message}`);
  }
}

// Implementation of rate_research_report tool - updated to accept requestId
async function rateResearchReport(params, mcpExchange = null, requestId = 'unknown-req') { 
  const { reportId, rating, comment } = params;
  
  try {
    console.error(`[${new Date().toISOString()}] [${requestId}] rateResearchReport: Processing rating ${rating} for report ${reportId}`);
    
    // Use dbClient to save the rating
    const success = await dbClient.addFeedbackToReport(reportId, { rating, comment });
    
    if (success) {
      return `Feedback successfully recorded for report ${reportId}.`;
    } else {
      throw new Error(`[${requestId}] Failed to record feedback. Report ID ${reportId} might be invalid or a database error occurred.`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${requestId}] rateResearchReport: Error processing rating:`, error);
    throw new Error(`[${requestId}] Error recording feedback: ${error.message}`);
  }
}

// Implementation of list_research_history tool - updated to accept requestId
async function listResearchHistory(params, mcpExchange = null, requestId = 'unknown-req') { 
  // Ensure params are properly handled
  const limit = params.limit || 10;
  const queryFilter = params.queryFilter || null;
  
  try {
    console.error(`[${new Date().toISOString()}] [${requestId}] listResearchHistory: Listing recent reports (limit: ${limit}, filter: "${queryFilter || 'None'}")`);
    
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
    console.error(`[${new Date().toISOString()}] [${requestId}] listResearchHistory: Error listing reports:`, error);
    throw new Error(`[${requestId}] Error retrieving research history: ${error.message}`);
  }
}

// Implementation for execute_sql tool
async function executeSql(params, mcpExchange = null, requestId = 'unknown-req') {
  const { sql, params: queryParams } = params; // Renamed params to queryParams to avoid conflict
  const toolName = "execute_sql";
  console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Attempting to execute SQL: "${safeSubstring(sql, 0, 100)}..." with ${queryParams.length} params.`);

  try {
    // Basic validation (can be expanded)
    if (!sql || sql.trim() === '') {
      throw new Error("SQL query cannot be empty.");
    }
    // Optional: Add more robust validation/restriction here if needed
    // e.g., restrict to SELECT statements initially for safety
    const lowerSql = sql.trim().toLowerCase();
    if (!lowerSql.startsWith('select')) {
       console.warn(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Blocking non-SELECT SQL query for safety: "${safeSubstring(sql, 0, 100)}..."`);
       throw new Error("Only SELECT statements are currently allowed for safety.");
    }

    // Ensure dbClient is ready
    if (!dbClient.isDbInitialized() || !dbClient.isEmbedderReady()) {
      throw new Error("Database or embedder is not ready.");
    }

    // Call the dbClient function to execute the query securely
    // IMPORTANT: Assumes dbClient.executeQuery handles parameterization correctly!
    const results = await dbClient.executeQuery(sql, queryParams);

    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: SQL query executed successfully. Rows returned: ${results?.length ?? 0}`);

    // Return results as JSON string
    return JSON.stringify(results, null, 2);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error executing SQL query: "${safeSubstring(sql, 0, 100)}...". Error:`, error);
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
  try {
    console.error(`[${new Date().toISOString()}] [${requestId}] getReportContent: Attempting to retrieve report ID: ${reportId}`);
    const report = await dbClient.getReportById(reportId);
    if (!report) {
      console.warn(`[${new Date().toISOString()}] [${requestId}] getReportContent: Report ID ${reportId} not found.`);
      throw new Error(`[${requestId}] Report ID ${reportId} not found.`);
    }
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
    console.error(`[${new Date().toISOString()}] [${requestId}] getReportContent: Error retrieving report ID ${reportId}:`, error);
    throw new Error(`[${requestId}] Error retrieving report content: ${error.message}`);
  }
}

// Implementation for get_server_status tool
async function getServerStatus(params, mcpExchange = null, requestId = 'unknown-req') {
  const toolName = "get_server_status";
  console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Retrieving server status...`);
  try {
    const embedderReady = dbClient.isEmbedderReady();
    const dbInitialized = dbClient.isDbInitialized();
    const dbPathInfo = dbClient.getDbPathInfo();

    let jobs = { queued: 0, running: 0, succeeded: 0, failed: 0, canceled: 0 };
    try {
      const rows = await dbClient.executeQuery("SELECT status, COUNT(*) AS count FROM jobs GROUP BY 1 ORDER BY 1");
      for (const r of rows) { jobs[r.status] = Number(r.count); }
    } catch (_) {}

    const status = {
      serverName: config.server.name,
      serverVersion: config.server.version,
      timestamp: new Date().toISOString(),
      database: {
        initialized: dbInitialized,
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
      }
    };

    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Status retrieved successfully.`);
    return JSON.stringify(status, null, 2);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error retrieving server status:`, error);
    throw new Error(`[${requestId}] Error retrieving server status: ${error.message}`);
  }
}

// Implementation for list_models tool
async function listModels(params = { refresh: false }, mcpExchange = null, requestId = 'unknown-req') {
  const toolName = "list_models";
  const refresh = !!params.refresh;
  console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Listing models (refresh=${refresh}).`);
  try {
    if (refresh) await modelCatalog.refresh();
    const catalog = await modelCatalog.getCatalog();
    return JSON.stringify(catalog, null, 2);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error:`, error);
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
      console.error(`[${new Date().toISOString()}] [${requestId}] importReports: Failed one item`, e);
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
  { name: 'browser_inference_request', description: 'Request a client (browser) to perform LLM inference. Returns a confirmation that the request was sent.' },
  { name: 'browser_inference_result', description: 'Internal tool for receiving LLM inference results from a browser client.' },
  { name: 'local_inference', description: 'Run inference using server-side GGUF models. Supports Qwen->Utopia logit pipeline.' }
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
    case 'browser_inference_request': return ['model', 'prompt', 'options?'];
    case 'browser_inference_result': return ['model', 'result'];
    case 'local_inference': return ['modelId', 'prompt', 'pipeline?', 'options?'];
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
  if (!/^[0-9+\-*/().^\s]+$/.test(src)) return JSON.stringify({ error: 'Invalid characters' });
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
  mode: z.enum(['index','sql']).default('index'),
  // index mode params
  query: z.string().optional(),
  k: z.number().int().positive().optional().default(10),
  scope: z.enum(['both','reports','docs']).optional().default('both'),
  rerank: z.boolean().optional(),
  // sql mode params
  sql: z.string().optional(),
  params: z.array(z.any()).optional().default([]),
  explain: z.boolean().optional().default(false)
}).describe("Retrieve from KB or DB. mode='index' uses hybrid BM25+vector (query, k, scope, rerank). mode='sql' executes SELECT (sql, params, explain).");

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
  action: z.enum(['auto','research','follow_up','retrieve','query']).optional().default('auto'),
  // Common
  async: z.boolean().optional().default(true),
  notify: z.string().url().optional(),
  // Research
  query: z.string().optional(),
  costPreference: conductResearchSchema.shape.costPreference.optional(),
  audienceLevel: conductResearchSchema.shape.audienceLevel.optional(),
  outputFormat: conductResearchSchema.shape.outputFormat.optional(),
  includeSources: conductResearchSchema.shape.includeSources.optional(),
  images: conductResearchSchema.shape.images.optional(),
  textDocuments: conductResearchSchema.shape.textDocuments.optional(),
  structuredData: conductResearchSchema.shape.structuredData.optional(),
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
  _requestId: z.string().optional()
}).describe("Single entrypoint agent tool. Routes to research, follow_up, or retrieve/query based on params. Set action to control explicitly or use action='auto'.");

async function agentTool(params, mcpExchange = null, requestId = `req-${Date.now()}`) {
  const { ZeroAgent } = require('../agents/zeroAgent');
  const agent = params.__zeroInstance || new ZeroAgent();

  // Build request object that ZeroAgent.execute expects
  const request = {
    query: params.query,
    action: params.action || 'research',
    costPreference: params.costPreference || 'low',
    audienceLevel: params.audienceLevel,
    outputFormat: params.outputFormat,
    includeSources: params.includeSources,
    images: params.images,
    textDocuments: params.textDocuments,
    structuredData: params.structuredData,
    inputEmbeddings: params.inputEmbeddings
  };

  // If async=true (default), submit as job and return job_id immediately
  if (params.async !== false) {
    try {
      const jobId = await dbClient.createJob({
        operation: 'agent',
        params: request,
        status: 'queued'
      });

      // Execute agent in background
      setImmediate(async () => {
        try {
          await dbClient.setJobStatus(jobId, 'running');
          
          const onEvent = async (type, payload) => {
            await dbClient.appendJobEvent(jobId, type, payload || {});
          };

          const result = await agent.execute(request, { job_id: jobId }, onEvent);
          
          await dbClient.setJobStatus(jobId, 'succeeded', {
            synthesis: result.synthesis,
            reportId: result.metadata?.reportId,
            duration_ms: result.metadata?.duration_ms
          });
        } catch (error) {
          await dbClient.setJobStatus(jobId, 'failed', { error: error.message });
        }
      });

      return { job_id: jobId, status: 'queued' };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to submit job: ${error.message}` }],
        isError: true
      };
    }
  }

  // Synchronous execution (async=false)
  const onEvent = async (type, payload) => {
    if (mcpExchange && typeof mcpExchange.sendProgress === 'function') {
      const value = { type, ...payload };
      mcpExchange.sendProgress({ token: mcpExchange.progressToken, value });
    }
  };

  try {
    const result = await agent.execute(request, { job_id: requestId }, onEvent);
    
    // Final result should be a structured object
    return {
      content: [
        {
          type: 'object',
          object: {
            summary: result.synthesis.substring(0, 500) + '...',
            reportId: result.metadata.reportId,
            durationMs: result.metadata.duration_ms
          }
        },
        {
          type: 'resource',
          resource: {
            rel: 'full-report',
            uri: `mcp://reports/${result.metadata.reportId}`
          }
        }
      ]
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Agent execution failed: ${error.message}` }],
      isError: true
    };
  }
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

// Schemas for new browser inference tools
const browserInferenceRequestSchema = z.object({
  model: z.string().describe("The name of the local model to use for inference (e.g., 'qwen', 'utopia')."),
  prompt: z.string().min(1).describe("The input prompt for the model."),
  options: z.record(z.any()).optional().describe("Optional inference options for the model."),
  _mcpExchange: z.any().optional().describe("Internal MCP exchange context for progress reporting"),
  _requestId: z.string().optional().describe("Internal request ID for logging")
}).describe("Request the client to perform an LLM inference using a local browser-based model.");

const browserInferenceResultSchema = z.object({
  model: z.string().describe("The name of the model that performed the inference."),
  result: z.any().describe("The inference result from the browser-based model."),
  _requestId: z.string().optional().describe("Internal request ID for logging")
}).describe("Receive inference results from a client-side browser-based LLM.");

// Schema for local inference tool (server-side GGUF models)
const localInferenceSchema = z.object({
  modelId: z.string().describe("The ID of the local model to use (as configured in LOCAL_MODEL_IDS)."),
  prompt: z.string().min(1).describe("The input prompt for the model."),
  pipeline: z.boolean().optional().describe("If true, use Qwen->Utopia logit pipeline (requires two models configured)."),
  options: z.object({
    maxTokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional()
  }).optional().describe("Inference options"),
  _requestId: z.string().optional().describe("Internal request ID for logging")
}).describe("Run inference using server-side GGUF models loaded at startup.");

// Implementation for browser_inference_request tool
async function runBrowserInference(params, mcpExchange = null, requestId = 'unknown-req') {
  const { model, prompt, options } = params;
  console.error(`[${new Date().toISOString()}] [${requestId}] runBrowserInference: Requesting client inference for model ${model} with prompt "${prompt.substring(0, 50)}..."`);

  if (!mcpExchange || typeof mcpExchange.sendEvent !== 'function') {
    throw new Error(`[${requestId}] Cannot initiate browser inference: No MCP exchange or sendEvent function available.`);
  }

  // Send a specific event to the client to trigger browser-side inference
  mcpExchange.sendEvent('browser.inference.request', {
    model,
    prompt,
    options,
    requestId // Pass requestId so client can echo it back
  });

  return JSON.stringify({ status: 'request_sent', model, requestId });
}

// Implementation for browser_inference_result tool
async function handleBrowserInferenceResult(params, mcpExchange = null, requestId = 'unknown-req') {
  const { model, result } = params;
  console.error(`[${new Date().toISOString()}] [${requestId}] handleBrowserInferenceResult: Received inference result from model ${model}.`);

  // Here, you would typically process the result, e.g., store it,
  // feed it to another agent, or forward it to the original requester.
  // For now, we'll just log and return an acknowledgment.

  // Example: If this was part of an ongoing job, you might append to job events
  if (requestId && requestId.startsWith('job_')) {
    await dbClient.appendJobEvent(requestId, 'browser_inference_completed', { model, result });
  }

  return JSON.stringify({ status: 'result_received', model, result, requestId });
}

// Implementation for local_inference tool (server-side GGUF models)
async function runLocalInference(params, mcpExchange = null, requestId = 'unknown-req') {
  const { modelId, prompt, pipeline, options } = params;
  
  try {
    const localModelManager = require('../utils/localModelManager');
    
    if (!localModelManager.isReady()) {
      throw new Error('Local models not available. Ensure LOCAL_MODELS_ENABLED=true and models are configured.');
    }

    console.error(`[${new Date().toISOString()}] [${requestId}] runLocalInference: Running inference with ${modelId}${pipeline ? ' (pipeline mode)' : ''}...`);

    let result;
    if (pipeline) {
      // Use Qwen->Utopia logit pipeline
      const modelIds = localModelManager.getLoadedModels();
      if (modelIds.length < 2) {
        throw new Error('Pipeline mode requires at least 2 models to be loaded.');
      }
      
      // Assume first model is Qwen, second is Utopia (or allow explicit configuration)
      const qwenId = modelIds.find(id => id.toLowerCase().includes('qwen')) || modelIds[0];
      const utopiaId = modelIds.find(id => id.toLowerCase().includes('utopia')) || modelIds[1];
      
      result = await localModelManager.runLogitPipeline(qwenId, utopiaId, prompt, options);
    } else {
      // Standard single-model inference
      result = await localModelManager.runInference(modelId, prompt, options);
    }

    console.error(`[${new Date().toISOString()}] [${requestId}] runLocalInference: Inference completed.`);
    
    return JSON.stringify({
      modelId,
      pipeline: !!pipeline,
      result,
      timestamp: new Date().toISOString()
    }, null, 2);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${requestId}] runLocalInference: Error:`, error);
    throw new Error(`[${requestId}] Local inference failed: ${error.message}`);
  }
}

module.exports = {
  // Schemas
  conductResearchSchema,
  submitResearchSchema,
  getJobStatusSchema,
  cancelJobSchema,
  getJobResultSchema,
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
  
  // New browser inference schemas
  browserInferenceRequestSchema,
  browserInferenceResultSchema,
  localInferenceSchema,
  
  // Functions
  conductResearch,
   submitResearch,
  getJobStatusTool,
  getJobResultTool,
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

  // New browser inference functions
  runBrowserInference,
  handleBrowserInferenceResult,
  runLocalInference
};
