// src/server/tools.js
const { z } = require('zod');
const NodeCache = require('node-cache');
const planningAgent = require('../agents/planningAgent');
const researchAgent = require('../agents/researchAgent');
const contextAgent = require('../agents/contextAgent');
const { parseAgentXml } = require('../utils/xmlParser');
const dbClient = require('../utils/dbClient');
const config = require('../../config');

// In-memory Cache Configuration
const CACHE_TTL_SECONDS = config.database.cacheTTL || 3600; // 1 hour in seconds from config
const cache = new NodeCache({
  stdTTL: CACHE_TTL_SECONDS,
  checkperiod: 120, // Check for expired entries every 2 minutes
  maxKeys: 100 // Limit cache size to prevent memory issues
});

console.log(`[${new Date().toISOString()}] In-memory cache initialized with TTL: ${CACHE_TTL_SECONDS}s, max keys: 100`);

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
      console.log(`[${new Date().toISOString()}] Cache hit for key: ${key.substring(0, 50)}...`);
      return cachedData;
    } else {
      console.log(`[${new Date().toISOString()}] Cache miss for key: ${key.substring(0, 50)}...`);
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
    console.log(`[${new Date().toISOString()}] Cache set for key: ${key.substring(0, 50)}... TTL: ${CACHE_TTL_SECONDS}s`);
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
  _mcpExchange: z.any().optional().describe("Internal MCP exchange context for progress reporting")
});

async function conductResearch(params, mcpExchange = null) {
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
    console.log(`[${new Date().toISOString()}] conductResearch: Returning cached result for query "${safeSubstring(query, 0, 50)}..." (Images: ${images ? images.length : 0}, Docs: ${textDocuments ? textDocuments.length : 0}, Structured: ${structuredData ? structuredData.length : 0})`);
    if (progressToken) {
      sendProgress({ content: cachedResult });
      return "Research complete. Results streamed (from cache).";
    }
    return cachedResult;
  }
  console.log(`[${new Date().toISOString()}] conductResearch: Cache miss for query "${safeSubstring(query, 0, 50)}..." (Images: ${images ? images.length : 0}, Docs: ${textDocuments ? textDocuments.length : 0}, Structured: ${structuredData ? structuredData.length : 0})`);

  const overallStartTime = Date.now();
  const MAX_ITERATIONS = config.models.maxResearchIterations;
  let currentIteration = 1;
  let allAgentQueries = [];
  let allResearchResults = [];
  let savedReportId = null;

  console.log(`[${new Date().toISOString()}] conductResearch: Starting iterative research process for query "${safeSubstring(query, 0, 50)}...". Max iterations: ${MAX_ITERATIONS}`);

  const totalStages = MAX_ITERATIONS * 3 + 1; // Define totalStages before the main try block
  let relevantPastReports = [];

  try {
    // --- Knowledge Base Lookup (Semantic Search) ---
    console.log(`[${new Date().toISOString()}] conductResearch: Performing semantic search in knowledge base for query "${safeSubstring(query, 0, 50)}..."`);
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
      console.log(`[${new Date().toISOString()}] conductResearch: Found ${relevantPastReports.length} semantically relevant past report(s).`);
    } else {
      console.log(`[${new Date().toISOString()}] conductResearch: No semantically relevant past reports found in knowledge base.`);
    }
    // --- End Knowledge Base Lookup ---

    let previousResultsForRefinement = null;
    let nextAgentId = 1;

    // --- Main Research Loop ---
    while (currentIteration <= MAX_ITERATIONS) {
      console.log(`[${new Date().toISOString()}] conductResearch: --- Iteration ${currentIteration}/${MAX_ITERATIONS} ---`);

      // Step 1: Plan or Refine Research
      const planningStartTime = Date.now();
      const currentStageBase = (currentIteration - 1) * 3;
      const stagePrefixPlan = `Stage ${currentStageBase + 1}/${totalStages}`;
      console.log(`[${new Date().toISOString()}] conductResearch: ${stagePrefixPlan} (Iter ${currentIteration}) - ${previousResultsForRefinement ? 'Refining' : 'Planning'} research...`);

      // Pass images, documents, structuredData, and past reports to the planning agent
      const planningResultXml = await planningAgent.planResearch(
        query,
        {
          maxAgents: params.maxAgents || 5,
          focusAreas: params.focusAreas,
          images: images,
          documents: textDocuments, // Pass text documents
          structuredData: structuredData, // Pass structured data
          pastReports: relevantPastReports
        },
        previousResultsForRefinement
      );
      const planningDuration = Date.now() - planningStartTime;
      console.log(`[${new Date().toISOString()}] conductResearch: ${stagePrefixPlan} - Planning completed in ${planningDuration}ms.`);

      if (planningResultXml.includes("<plan_complete>")) {
        console.log(`[${new Date().toISOString()}] conductResearch: Planning agent indicated completion. Stopping iterations.`);
        break;
      }

      // Step 2: Parse the XML output
      const parsingStartTime = Date.now();
      const stagePrefixParse = `Stage ${currentStageBase + 2}/${totalStages}`;
      console.log(`[${new Date().toISOString()}] conductResearch: ${stagePrefixParse} (Iter ${currentIteration}) - Parsing research plan...`);
      const currentAgentQueries = parseAgentXml(planningResultXml).map(q => ({ ...q, id: nextAgentId++ }));
      const parsingDuration = Date.now() - parsingStartTime;

      if (!currentAgentQueries || currentAgentQueries.length === 0) {
        if (previousResultsForRefinement) {
          console.warn(`[${new Date().toISOString()}] conductResearch: Refinement yielded no new queries. Stopping iterations.`);
          break;
        } else {
          console.error(`[${new Date().toISOString()}] conductResearch: Failed to parse initial research plan XML:`, planningResultXml);
          throw new Error('Failed to parse initial research plan. No agent queries found.');
        }
      }
      console.log(`[${new Date().toISOString()}] conductResearch: ${stagePrefixParse} - Parsing completed in ${parsingDuration}ms. Found ${currentAgentQueries.length} new sub-queries.`);
      allAgentQueries.push(...currentAgentQueries);

      // Step 3: Conduct parallel research
      const researchStartTime = Date.now();
      const stagePrefixResearch = `Stage ${currentStageBase + 3}/${totalStages}`;
      console.log(`[${new Date().toISOString()}] conductResearch: ${stagePrefixResearch} (Iter ${currentIteration}) - Conducting parallel research for ${currentAgentQueries.length} agents...`);
      let currentResearchResults;
      try {
        // Pass images and documents down to parallel research
        currentResearchResults = await researchAgent.conductParallelResearch(currentAgentQueries, costPreference, images, textDocuments, structuredData); // Pass structuredData
      } catch (researchError) {
        console.error(`[${new Date().toISOString()}] conductResearch: Parallel research failed in iteration ${currentIteration} with costPreference=${costPreference}. Error:`, researchError);
        if (costPreference === 'high') {
          console.warn(`[${new Date().toISOString()}] conductResearch: High-cost research failed (Iteration ${currentIteration}), falling back to low-cost models.`);
          try {
            // Pass images and documents to fallback research as well
            currentResearchResults = await researchAgent.conductParallelResearch(currentAgentQueries, 'low', images, textDocuments, structuredData); // Pass structuredData
          } catch (fallbackError) {
            console.error(`[${new Date().toISOString()}] conductResearch: Low-cost fallback research also failed (Iteration ${currentIteration}). Error:`, fallbackError);
            currentResearchResults = currentAgentQueries.map(q => ({
              agentId: q.id, model: 'N/A', query: q.query, result: `Research failed: ${fallbackError.message}`, error: true, errorMessage: fallbackError.message
            }));
            console.error(`[${new Date().toISOString()}] conductResearch: Marking iteration ${currentIteration} queries as failed due to fallback error.`);
          }
        } else {
          currentResearchResults = currentAgentQueries.map(q => ({
            agentId: q.id, model: 'N/A', query: q.query, result: `Research failed: ${researchError.message}`, error: true, errorMessage: researchError.message
          }));
          console.error(`[${new Date().toISOString()}] conductResearch: Marking iteration ${currentIteration} queries as failed due to initial low-cost error.`);
        }
      }
      const researchDuration = Date.now() - researchStartTime;
      console.log(`[${new Date().toISOString()}] conductResearch: ${stagePrefixResearch} - Parallel research completed in ${researchDuration}ms.`);

      allResearchResults.push(...currentResearchResults);
      previousResultsForRefinement = currentResearchResults;
      currentIteration++;
    } // End of while loop
    // --- End Main Research Loop ---

    if (allResearchResults.length === 0) {
      console.error(`[${new Date().toISOString()}] conductResearch: No research results were generated after all iterations.`);
      throw new Error("Failed to generate any research results after planning/refinement.");
    }

    // Step 4 (Final Synthesis): Contextualize ALL accumulated results
    const contextStartTime = Date.now();
    const finalStagePrefix = `Stage ${totalStages}/${totalStages}`;
    console.log(`[${new Date().toISOString()}] conductResearch: ${finalStagePrefix} - Contextualizing ${allResearchResults.length} total results (streaming)...`);
    let finalReportContent = '';
    let streamError = null;

    try {
      // Pass images, documents, and structuredData to the context agent
      const contextStream = contextAgent.contextualizeResultsStream(
        query,
        allResearchResults,
        { audienceLevel, outputFormat, includeSources, maxLength, images, documents: textDocuments, structuredData } // Pass structuredData
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
    } catch (contextError) {
      console.error(`[${new Date().toISOString()}] conductResearch: Error iterating context stream:`, contextError);
      streamError = `Error during result synthesis: ${contextError.message}`;
      sendProgress({ error: streamError });
    }

    const contextDuration = Date.now() - contextStartTime;
    if (!streamError) {
      console.log(`[${new Date().toISOString()}] conductResearch: ${finalStagePrefix} - Contextualization stream completed in ${contextDuration}ms.`);
    } else {
      console.error(`[${new Date().toISOString()}] conductResearch: ${finalStagePrefix} - Contextualization stream finished with error after ${contextDuration}ms.`);
      throw new Error(streamError);
    }

    // Store accumulated content in cache and DB (only if successful)
    if (!streamError) {
      setInCache(cacheKey, finalReportContent);

      const researchMetadata = {
        durationMs: Date.now() - overallStartTime,
        iterations: currentIteration - 1,
        totalSubQueries: allAgentQueries.length,
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

    } else {
      console.warn(`[${new Date().toISOString()}] conductResearch: Skipping cache set and DB save due to synthesis stream error.`);
    }

    const overallDuration = Date.now() - overallStartTime;
    console.log(`[${new Date().toISOString()}] conductResearch: Full research process completed in ${overallDuration}ms for query "${query.substring(0, 50)}..."`);

    const completionMessage = `Research complete. Results streamed. Report ID: ${savedReportId || 'N/A'}`;
    return completionMessage;

  } catch (error) { // Main catch block
    const overallDuration = Date.now() - overallStartTime;
    // Log the raw error directly for debugging
    console.error(`[${new Date().toISOString()}] conductResearch: Error during research process after ${overallDuration}ms. Query: "${query.substring(0, 50)}...". Original Error:`, error);
    // Create a generic error message
    const genericErrorMessage = `Research process failed for query "${query.substring(0, 50)}..."`;
    // Throw a new generic error
    throw new Error(genericErrorMessage);
  }
}

// Schema definitions for all tools
const researchFollowUpSchema = z.object({
  originalQuery: z.string().describe("The original research query for context."),
  followUpQuestion: z.string().describe("The specific follow-up question."),
  costPreference: conductResearchSchema.shape.costPreference.describe("Preference for model cost ('high' or 'low').")
});

const getPastResearchSchema = z.object({
  query: z.string().describe("The query string to search for semantically similar past reports."),
  limit: z.number().int().positive().optional().default(5).describe("Maximum number of past reports to return."),
  minSimilarity: z.number().min(0).max(1).optional().default(0.70).describe("Minimum cosine similarity score (0-1) for a report to be considered relevant.")
});

const rateResearchReportSchema = z.object({
  reportId: z.string().describe("The ID of the report to rate (obtained from conduct_research result)."),
  rating: z.number().min(1).max(5).int().describe("Rating from 1 (poor) to 5 (excellent)."),
  comment: z.string().optional().describe("Optional comment explaining the rating.")
});

const listResearchHistorySchema = z.object({
  limit: z.number().int().positive().optional().default(10).describe("Maximum number of recent reports to return."),
  queryFilter: z.string().optional().describe("Optional text to filter report queries by (case-insensitive substring match).")
});

// Helper function to safely truncate a string (shared across functions)
function safeSubstring(str, start, end) {
  if (!str) return '';
  return str.substring(start, end);
}

// Implementation of research_follow_up tool
async function researchFollowUp(params, mcpExchange = null) {
  const originalQuery = params.originalQuery || '';
  const followUpQuestion = params.followUpQuestion || '';
  const costPreference = params.costPreference || 'low';
  
  const sendProgress = (chunk) => {
    if (mcpExchange && mcpExchange.progressToken) {
      mcpExchange.sendProgress({ token: mcpExchange.progressToken, value: chunk });
    }
  };

  try {
    console.log(`[${new Date().toISOString()}] researchFollowUp: Starting follow-up for original query "${safeSubstring(originalQuery, 0, 50)}..."`);
    
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
    }, mcpExchange);
    
    // Return the result
    return result.replace("report-", "followup-report-");
  } catch (error) {
    console.error(`[${new Date().toISOString()}] researchFollowUp: Error processing follow-up query:`, error);
    throw new Error(`Error conducting follow-up research: ${error.message}`);
  }
}

// Implementation of get_past_research tool
async function getPastResearch(params, mcpExchange = null) {
  const query = params.query || '';
  const limit = params.limit || 5;
  const minSimilarity = params.minSimilarity !== undefined ? params.minSimilarity : 0.70;
  
  const sendProgress = (chunk) => {
    if (mcpExchange && mcpExchange.progressToken) {
      mcpExchange.sendProgress({ token: mcpExchange.progressToken, value: chunk });
    }
  };

  try {
    console.log(`[${new Date().toISOString()}] getPastResearch: Searching for semantically similar past reports for query "${safeSubstring(query, 0, 50)}..."`);
    
    // Send initial progress update
    sendProgress({ message: "Searching knowledge base for relevant past research..." });
    
    // Use semantic search function from dbClient
    const reports = await dbClient.findReportsBySimilarity(query, limit, minSimilarity);
    
    sendProgress({ message: `Found ${reports ? reports.length : 0} relevant past reports.` });
    
    if (!reports || reports.length === 0) {
      return "No recent research reports found" + (query ? ` matching query "${query}"` : ".");
    }
    
    // Format the results, including similarity score
    const formattedReports = reports.map(report => ({
      _id: report._id.toString(),
      originalQuery: report.originalQuery,
      createdAt: report.createdAt,
      parameters: report.parameters,
      similarityScore: report.similarityScore
    }));
    
    return JSON.stringify(formattedReports, null, 2);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] getPastResearch: Error searching for past reports:`, error);
    throw new Error(`Error retrieving past research: ${error.message}`);
  }
}

// Implementation of rate_research_report tool
async function rateResearchReport(params, mcpExchange = null) {
  const { reportId, rating, comment } = params;
  
  try {
    console.log(`[${new Date().toISOString()}] rateResearchReport: Processing rating ${rating} for report ${reportId}`);
    
    // Use dbClient to save the rating
    const success = await dbClient.addFeedbackToReport(reportId, { rating, comment });
    
    if (success) {
      return `Feedback successfully recorded for report ${reportId}.`;
    } else {
      throw new Error(`Failed to record feedback. Report ID ${reportId} might be invalid or a database error occurred.`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] rateResearchReport: Error processing rating:`, error);
    throw new Error(`Error recording feedback: ${error.message}`);
  }
}

// Implementation of list_research_history tool
async function listResearchHistory(params, mcpExchange = null) {
  // Ensure params are properly handled
  const limit = params.limit || 10;
  const queryFilter = params.queryFilter || null;
  
  try {
    console.log(`[${new Date().toISOString()}] listResearchHistory: Listing recent reports (limit: ${limit}, filter: "${queryFilter || 'None'}")`);
    
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
    console.error(`[${new Date().toISOString()}] listResearchHistory: Error listing reports:`, error);
    throw new Error(`Error retrieving research history: ${error.message}`);
  }
}

module.exports = {
  // Schemas
  conductResearchSchema,
  researchFollowUpSchema,
  getPastResearchSchema,
  rateResearchReportSchema,
  listResearchHistorySchema,
  
  // Functions
  conductResearch,
  researchFollowUp,
  getPastResearch,
  rateResearchReport,
  listResearchHistory
};
