// src/agents/contextAgent.js
const openRouterClient = require('../utils/openRouterClient');
const config = require('../../config');
const structuredDataParser = require('../utils/structuredDataParser'); // Import parser
const modelCatalog = require('../utils/modelCatalog'); // Model-aware token limits
const logger = require('../utils/logger').child('ContextAgent');
const localKnowledge = require('../utils/localKnowledge'); // Local knowledge for hallucination prevention
const citationValidator = require('../utils/citationValidator'); // Citation validation

/**
 * Calculate adaptive max_tokens based on model capabilities and content size
 * Uses OpenRouter model catalog to detect model-specific limits dynamically
 * @param {string} model - Model ID
 * @param {Array} researchResults - Research results to synthesize
 * @param {Object} options - Additional options (documents, structuredData)
 * @returns {Promise<number>} Calculated max tokens
 */
async function calculateAdaptiveMaxTokens(model, researchResults, options = {}) {
  const tokenCfg = config.models?.tokens?.synthesis || {
    min: 4000,
    fallbackMax: 16000,
    perSubQuery: 800,
    perDocument: 500
  };

  // Get model-specific max output tokens
  const modelMax = await modelCatalog.getModelMaxOutputTokens(model, tokenCfg.fallbackMax);

  // Calculate content-based token estimate
  let tokens = tokenCfg.min;
  tokens += (researchResults?.length || 0) * tokenCfg.perSubQuery;
  tokens += (options.documents?.length || 0) * tokenCfg.perDocument;
  tokens += (options.structuredData?.length || 0) * tokenCfg.perDocument;

  // Use 90% of model max to leave room for safety margin
  const maxAllowed = Math.floor(modelMax * 0.9);
  const result = Math.min(Math.max(tokens, tokenCfg.min), maxAllowed);

  logger.debug('Adaptive tokens calculated', { calculated: tokens, modelMax, final: result });
  return result;
}

/**
 * Detect if content appears to be truncated mid-sentence
 * Common patterns: ends with incomplete number (d ≈ 0.), trailing comma, no sentence terminator
 * @param {string} content - Content to check
 * @returns {boolean} True if truncation detected
 */
function detectTruncation(content) {
  if (!content || content.length < 100) return false;
  const lastChars = content.slice(-50).trim();

  // Truncation patterns - content cut off mid-thought
  const truncationPatterns = [
    /\d+\.\s*$/,              // Ends with "d ≈ 0." pattern (from report 2)
    /[a-z],\s*$/i,            // Ends with comma after word
    /\s[a-z]{1,3}\s*$/i,      // Ends with short word fragment
    /[^.!?)\]\"\'…]\s*$/,     // No sentence terminator at end
    /\([^)]*$/,               // Unclosed parenthesis
    /\[[^\]]*$/,              // Unclosed bracket
    /:\s*$/,                  // Ends with colon
    /—\s*$/,                  // Ends with em-dash
  ];

  return truncationPatterns.some(p => p.test(lastChars));
}

class ContextAgent {
  constructor() {
    this.model = config.models.planning; // Using the same model as planning for synthesis
  }

  // Added allAgentQueries, images, documents, structuredData, inputEmbeddings, and requestId parameters
  async *contextualizeResultsStream(originalQuery, researchResults, allAgentQueries = [], options = {}, requestId = 'unknown-req') { 
    const {
      audienceLevel = 'intermediate',
      outputFormat = 'report',
      includeSources = true,
      maxLength = null,
      images = null, 
      documents = null, // Renamed from textDocuments for consistency
      structuredData = null,
      inputEmbeddings = null // Add inputEmbeddings
    } = options;

    logger.info('Starting contextualization', {
      requestId,
      query: originalQuery.substring(0, 50),
      images: images?.length || 0,
      docs: documents?.length || 0,
      structured: structuredData?.length || 0
    });
    logger.debug('Contextualization options', { requestId, audienceLevel, outputFormat, includeSources, maxLength });
    logger.debug('Research results received', { requestId, resultCount: researchResults.length, subQueries: allAgentQueries.length });

    // Create a map of planned queries by ID for easy lookup
    const plannedQueriesMap = new Map(allAgentQueries.map(q => [q.id.toString(), q.query]));

    // Group results by original agentId (sub-query ID)
    const groupedResults = researchResults.reduce((acc, result) => {
      const agentIdStr = result.agentId.toString();
      if (!acc[agentIdStr]) {
        // Get the planned query text from the map
        const plannedQueryText = plannedQueriesMap.get(agentIdStr) || `Unknown Query (ID: ${agentIdStr})`;
        acc[agentIdStr] = { query: plannedQueryText, results: [], status: 'partial' }; // Default status
      }
      acc[agentIdStr].results.push({
        model: result.model,
        result: result.result,
        error: result.error,
        errorMessage: result.errorMessage
      });
      // Update status based on results
      const hasSuccess = acc[agentIdStr].results.some(r => !r.error);
      const hasError = acc[agentIdStr].results.some(r => r.error);
      if (hasSuccess && !hasError) acc[agentIdStr].status = 'success';
      else if (!hasSuccess && hasError) acc[agentIdStr].status = 'failed';
      else acc[agentIdStr].status = 'partial'; // Mixed results or potentially empty if something went wrong

      return acc;
    }, {});

    // Add entries for planned queries that have no results (completely failed before execution)
    allAgentQueries.forEach(plannedQuery => {
      const agentIdStr = plannedQuery.id.toString();
      if (!groupedResults[agentIdStr]) {
        groupedResults[agentIdStr] = {
          query: plannedQuery.query,
          results: [],
          status: 'failed' // Mark as failed if no results were returned at all
        };
      }
    });

    // Format grouped results for the synthesis prompt, including status
    let subQuerySummary = "SUB-QUERIES STATUS:\n";
    const formattedResults = Object.entries(groupedResults).map(([agentId, data]) => {
      const query = data.query;
      const status = data.status;
      subQuerySummary += `- Sub-Query ${agentId}: ${status.toUpperCase()}\n`; // Add to summary

      let resultsText = '';
      if (data.results.length > 0) {
         resultsText = data.results.map(r =>
           `--- Model: ${r.model} (${r.error ? 'FAILED' : 'Success'}) ---\n${r.result}\n${r.error ? `ERROR DETAILS: ${r.errorMessage || 'Unknown error'}\n` : ''}`
         ).join('\n');
      } else {
         resultsText = "--- No results returned for this sub-query (likely failed before execution). ---";
      }

      return `
SUB-QUERY ${agentId} (Status: ${status.toUpperCase()}): ${query}
ENSEMBLE RESULTS:
${resultsText}
=== END OF SUB-QUERY ${agentId} RESULTS ===
`;
    }).join('\n');

    subQuerySummary += "\n"; // Add newline after summary

    // Detect ensemble contradictions before synthesis
    let contradictionWarning = '';
    try {
      const allResults = researchResults.filter(r => !r.error && r.result);
      if (allResults.length > 1) {
        // Use the factCheckAgent to detect contradictions
        const contradictions = require('./factCheckAgent').detectEnsembleContradictions(
          allResults.map(r => ({ model: r.model, content: r.result }))
        );
        if (contradictions.length > 0) {
          contradictionWarning = `\n\nIMPORTANT - DETECTED CONTRADICTIONS BETWEEN MODELS:\n`;
          contradictionWarning += `The following ${contradictions.length} contradiction(s) were detected between ensemble outputs. Mark these claims as LOW CONFIDENCE and do NOT present them as consensus:\n`;
          for (const c of contradictions.slice(0, 5)) {
            contradictionWarning += `- ${c.model1} says: "${c.claim1?.substring(0, 60)}..." BUT ${c.model2} says: "${c.claim2?.substring(0, 60)}..."\n`;
          }
          contradictionWarning += '\n';
          logger.info('Ensemble contradictions detected', { requestId, count: contradictions.length });
        }
      }
    } catch (e) {
      // Ignore errors in contradiction detection
      logger.debug('Contradiction detection skipped', { error: e.message });
    }

    let outputInstructions = '';
    switch(outputFormat) {
      case 'briefing':
        outputInstructions = 'Format as an executive briefing with summary, key points, and actionable insights. Prioritize brevity and clarity.';
        break;
      case 'bullet_points':
        outputInstructions = 'Format as a structured bullet-point document with clear sections and hierarchical organization.';
        break;
      case 'report':
      default:
        outputInstructions = 'Format as a comprehensive research report with an executive summary, detailed sections, and conclusion.';
        break;
    }

    const compact = require('../../config').prompts?.compact !== false;

    // Inject verified local knowledge to prevent hallucinations
    const localKnowledgeContext = localKnowledge.getKnowledgeContext(originalQuery);

    let systemPrompt = compact ? `
Synthesize the ensemble results for the ORIGINAL QUERY with strict evidence:
- Compare per-sub-query outputs: consensus, contradictions, unique info.
- Mark sub-query status: SUCCESS/PARTIAL/FAILED.
- Integrate successful/partial sub-queries into one coherent answer.
- Cite with explicit URLs (format: [Source: Title — https://...]). Label missing URLs as [Unverified].
- Provide confidence for major claims.
${localKnowledgeContext}
` : `
 You are an elite research synthesis specialist responsible for integrating and critically evaluating findings from multiple research agents, potentially using different models for the same sub-query.
 
 Your mission is to perform a critical synthesis:
 1. **Intra-Query Analysis:** For each SUB-QUERY provided below, meticulously compare the ENSEMBLE RESULTS from the different models. Explicitly identify:
     *   Areas of strong agreement/consensus between models.
     *   Significant disagreements, contradictions, or differing perspectives.
     *   Unique insights or information provided by only one model.
     *   Apparent strengths or weaknesses in each model's response to that specific sub-query. Note if a model failed for a sub-query.
 2. **Sub-Query Synthesis:** Based on the intra-query analysis, synthesize a consolidated understanding for *each* sub-query, noting its overall status (SUCCESS, PARTIAL, FAILED). Prioritize corroborated information from successful runs but retain valuable unique insights. Clearly state where models diverged or failed. If a sub-query FAILED entirely, acknowledge this lack of information.
 3. **Overall Integration:** Integrate the synthesized findings from all *successfully or partially executed* sub-queries into a unified knowledge framework that comprehensively addresses the ORIGINAL RESEARCH QUERY. Explicitly mention which planned sub-queries could not be completed due to errors (status: FAILED).
 4. **Insight Generation:** Identify overarching themes, key insights, patterns, and connections that emerge from the integrated analysis of available results.
 5. Highlight significant gaps, inconsistencies, or limitations in the overall research, considering both the individual results, the ensemble comparison, and any failed sub-queries. Pay attention to confidence levels reported by individual agents.
 6. **Citations & Evidence:** For each key claim, include a brief inline citation with an explicit URL using the format [Source: Title — https://example.com]. If a claim lacks a URL, explicitly label it [Unverified] and down-weight it in conclusions.
 ${localKnowledgeContext}
 `;
    
    // Prepare text document context for the user prompt
    let textDocumentContext = '';
    if (documents && documents.length > 0) {
       textDocumentContext = `\n\nPROVIDED TEXT DOCUMENTS FOR CONTEXT:\n`;
       documents.forEach(doc => {
          const truncatedContent = doc.content.length > 1000 ? doc.content.substring(0, 1000) + '...' : doc.content; 
          textDocumentContext += `--- Document: ${doc.name} ---\n${truncatedContent}\n---\n`;
       });
    }
    
    // Prepare structured data context for the user prompt
    let structuredDataContext = '';
     if (structuredData && structuredData.length > 0) {
       structuredDataContext = `\n\nPROVIDED STRUCTURED DATA SUMMARIES FOR CONTEXT:\n`;
       structuredData.forEach(data => {
           const summary = structuredDataParser.getStructuredDataSummary(data.content, data.type, data.name); // Consider passing requestId if parser logs
           structuredDataContext += `--- Data: ${data.name} (${data.type}) ---\n${summary}\n---\n`;
        });
     }
     
    // Add note about input embeddings if present
    let embeddingContext = '';
    if (inputEmbeddings && (inputEmbeddings.textDocuments?.length > 0 || inputEmbeddings.structuredData?.length > 0)) {
       embeddingContext = `\n\nNOTE: Semantic embeddings were generated for the provided documents/data, indicating their potential relevance. Consider this semantic context during synthesis.`;
    }


    const userPrompt = `
ORIGINAL RESEARCH QUERY: ${originalQuery}
${textDocumentContext}
${structuredDataContext}
${embeddingContext}
${contradictionWarning}
${subQuerySummary}ENSEMBLE RESEARCH RESULTS (Grouped by Sub-Query, including status and failures):
${formattedResults}

Please perform a critical synthesis of these findings, considering the original query, the status of each sub-query (SUCCESS/PARTIAL/FAILED), and any provided documents, structured data, or their semantic embeddings. For each sub-query, compare the ensemble results (noting failures), then integrate the synthesized findings from available sub-queries into a comprehensive analysis addressing the original query. Highlight consensus, discrepancies, failed sub-queries, and overall confidence based on the available information.${contradictionWarning ? ' Pay special attention to the detected contradictions above and mark conflicting claims as LOW CONFIDENCE.' : ''}
`;

    // Construct user message content for synthesis, including images if provided
    const synthesisUserMessageContent = [];
    synthesisUserMessageContent.push({ type: 'text', text: userPrompt }); // Add the text prompt part first
    
    if (images && images.length > 0) {
      images.forEach(img => {
        synthesisUserMessageContent.push({
          type: 'image_url',
          image_url: { url: img.url, detail: img.detail }
        });
       });
       logger.debug('Including images in synthesis', { requestId, count: images.length });
       // Adjust system prompt if images are present
       systemPrompt += "\n\nSynthesize the research results in the context of the provided image(s) as well.";
    }
    
    // Adjust system prompt if documents, structured data, or embeddings are present
    if ((documents && documents.length > 0) || (structuredData && structuredData.length > 0) || embeddingContext) {
        systemPrompt += "\n\nEnsure your synthesis incorporates relevant information and semantic context from the provided documents, structured data, and their embeddings.";
    }

    const messages = [
      { role: 'system', content: systemPrompt }, // Use potentially modified system prompt
      { role: 'user', content: synthesisUserMessageContent } // Use constructed multi-part content
    ];


    const startTime = Date.now();
    logger.debug('Sending synthesis stream request', { requestId, model: this.model });
    let fullContent = '';
    let streamError = null;

    try {
      // Calculate adaptive max_tokens based on model capabilities and content size
      const adaptiveMaxTokens = await calculateAdaptiveMaxTokens(
        this.model,
        researchResults,
        { documents, structuredData }
      );

      // Use the new streaming method with adaptive token limit
      const stream = openRouterClient.streamChatCompletion(this.model, messages, {
        temperature: 0.3, // Low temperature for synthesis consistency
        max_tokens: adaptiveMaxTokens // Model-aware adaptive limit
      });

      for await (const chunk of stream) {
        if (chunk.done) {
          break; // Stream finished
        }
        if (chunk.usage) {
          logger.debug('Stream usage', { requestId, usage: chunk.usage });
          yield { usage: chunk.usage };
        }
        if (chunk.error) {
          streamError = chunk.error;
          logger.error('Error received in stream', { requestId, error: streamError });
          yield { error: `Stream error during synthesis: ${streamError.message || 'Unknown stream error'}` };
          break; // Stop processing on stream error
        }
        if (chunk.content) {
          fullContent += chunk.content;
          yield { content: chunk.content }; // Yield the content chunk
        }
      }

      const duration = Date.now() - startTime;
      if (!streamError) {
        logger.info('Synthesis stream completed', { requestId, durationMs: duration });

        // Check for truncation and warn if detected
        if (detectTruncation(fullContent)) {
          logger.warn('Possible truncation detected in synthesis output', { requestId });
          yield {
            warning: 'Response may have been truncated by token limit. Consider increasing SYNTHESIS_MAX_TOKENS or using a model with larger output capacity.',
            truncationDetected: true
          };
        }
      } else {
         logger.error('Synthesis stream finished with error', { requestId, durationMs: duration });
      }

    } catch (error) {
      // Catch errors from initiating the stream or other unexpected issues
      const duration = Date.now() - startTime;
      logger.error('Unhandled error during synthesis stream', { requestId, durationMs: duration, query: originalQuery.substring(0, 50), model: this.model, error });
      yield { error: `[${requestId}] ContextAgent failed to synthesize results stream for query "${originalQuery.substring(0, 50)}...": ${error.message}` };
    }
  }
}

module.exports = new ContextAgent();
