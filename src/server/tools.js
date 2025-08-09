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
  _mcpExchange: z.any().optional().describe("Internal MCP exchange context for progress reporting"),
  _requestId: z.string().optional().describe("Internal request ID for logging") // Add optional requestId
});

// Schema for the new get_report_content tool
const getReportContentSchema = z.object({
  reportId: z.string().describe("The ID of the report to retrieve content for (obtained from conduct_research result)."),
  _requestId: z.string().optional().describe("Internal request ID for logging") // Add optional requestId
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
  // Removed the immediate debug return block

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
          inputEmbeddings: inputEmbeddings // Pass generated input embeddings
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
           requestId // Pass requestId
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
        requestId // Pass requestId to context agent
      );

      for await (const chunk of contextStream) {
        sendProgress(chunk);
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
        setInCache(cacheKey, finalReportContent);

        const researchMetadata = {
        durationMs: Date.now() - overallStartTime,
        iterations: currentIteration - 1,
        totalSubQueries: allAgentQueries.length,
          requestId: requestId // Store requestId with metadata
        };
        savedReportId = await dbClient.saveResearchReport({
        originalQuery: query,
        parameters: { costPreference, audienceLevel, outputFormat, includeSources, maxLength },
        finalReport: finalReportContent,
        researchMetadata: researchMetadata,
        images: images,
        textDocuments: textDocuments ? textDocuments.map(d => ({ name: d.name, length: d.content.length })) : null, // Store text doc metadata
        structuredData: structuredData ? structuredData.map(d => ({ name: d.name, type: d.type, length: d.content.length })) : null, // Store structured data metadata
          basedOnPastReportIds: relevantPastReports.map(r => r.reportId)
        });
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
    
    // Use semantic search function from dbClient
    const reports = await dbClient.findReportsBySimilarity(query, limit, minSimilarity);
    
    sendProgress({ message: `Found ${reports ? reports.length : 0} relevant past reports.` });
    const formattedReports = reports.map(report => ({
      _id: report._id.toString(),
      originalQuery: report.originalQuery,
      createdAt: report.createdAt,
      parameters: report.parameters,
      similarityScore: report.similarityScore
    }));
    
    return JSON.stringify(formattedReports, null, 2);
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
    
    // Add summary information at the beginning of the response
    let resultMessage = `Found ${reports.length} ` + 
      `report${reports.length !== 1 ? 's' : ''} ` + 
      (queryFilter ? `matching filter "${queryFilter}"` : "in the research database") +
      ".\n\n";
    
    // Format results for display (convert ObjectId)
    const formattedReports = reports.map(r => ({
      ...r,
      _id: r._id.toString()
    }));
    
    // Combine message with formatted JSON
    return resultMessage + JSON.stringify(formattedReports, null, 2);
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


module.exports = {
  // Schemas
  conductResearchSchema,
  executeSqlSchema, // Add new schema
  researchFollowUpSchema,
  getPastResearchSchema,
  rateResearchReportSchema,
  listResearchHistorySchema,
  listModelsSchema: z.object({ refresh: z.boolean().optional().default(false) }),
  
  // Functions
  conductResearch,
  researchFollowUp,
  getPastResearch,
  rateResearchReport,
  listResearchHistory,

  // Export schema and add function for the new tool
  getReportContentSchema,
  getServerStatusSchema, // Export new schema
  
  // Functions
  conductResearch,
  researchFollowUp,
  getPastResearch,
  rateResearchReport,
  listResearchHistory,
  getReportContent, // This will be the wrapper calling dbClient.getReportById
  getServerStatus, // Export new function
  executeSql, // Add new function
  listModels
};

// Implementation for get_report_content tool - updated to accept requestId
async function getReportContent(params, mcpExchange = null, requestId = 'unknown-req') { 
  const { reportId } = params;
  try {
    console.error(`[${new Date().toISOString()}] [${requestId}] getReportContent: Attempting to retrieve report ID: ${reportId}`);
    
    // Call the dbClient function
    const report = await dbClient.getReportById(reportId);
    
    if (report && report.final_report) {
      console.error(`[${new Date().toISOString()}] [${requestId}] getReportContent: Successfully retrieved report ID: ${reportId}`);
      // Return only the final report content for simplicity, or the full object if needed
      return report.final_report; 
      // Alternatively, return JSON.stringify(report, null, 2); for the full object
    } else if (report) {
      console.warn(`[${new Date().toISOString()}] [${requestId}] getReportContent: Report ID ${reportId} found, but it has no final_report content.`);
      throw new Error(`[${requestId}] Report ID ${reportId} found but contains no content.`);
    } else {
      console.warn(`[${new Date().toISOString()}] [${requestId}] getReportContent: Report ID ${reportId} not found.`);
      throw new Error(`[${requestId}] Report ID ${reportId} not found.`);
    }
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
    // Gather status information from dbClient
    const embedderReady = dbClient.isEmbedderReady();
    const dbInitialized = dbClient.isDbInitialized();
    const dbPathInfo = dbClient.getDbPathInfo();

    const status = {
      serverName: config.server.name,
      serverVersion: config.server.version,
      timestamp: new Date().toISOString(),
      database: {
        initialized: dbInitialized,
        storageType: dbPathInfo, // e.g., "File (C:\...)", "IndexedDB (...)", "In-Memory (Fallback)"
        vectorDimension: config.database.vectorDimension,
        maxRetries: config.database.maxRetryAttempts,
        retryDelayBaseMs: config.database.retryDelayBaseMs,
        relaxedDurability: config.database.relaxedDurability
      },
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
      config: { // Include some key config values (be careful not to expose secrets)
        serverPort: config.server.port,
        // Avoid exposing API keys here
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
