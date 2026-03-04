// src/agents/contextAgent.js
const providerManager = require('../core/providers');
const config = require('../../config');
const structuredDataParser = require('../utils/structuredDataParser'); // Import parser
const modelCatalog = require('../utils/modelCatalog'); // Model-aware token limits
const logger = require('../utils/logger').child('ContextAgent');
const localKnowledge = require('../utils/localKnowledge'); // Local knowledge for hallucination prevention
const citationValidator = require('../utils/citationValidator'); // Citation validation
const providerTelemetry = require('../utils/providerTelemetry');
// const { padicDistance, PadicAddress } = require('../core/math/padic');

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
 * Wrap an async iterable with per-chunk timeout
 * Resets timeout after each successful chunk, throws if no data received within timeoutMs
 * @param {AsyncIterable} stream - The stream to wrap
 * @param {number} timeoutMs - Timeout in milliseconds between chunks
 * @returns {AsyncGenerator} Wrapped stream with timeout
 */
async function* streamWithTimeout(stream, timeoutMs) {
  let timeoutId = null;
  let rejectFn = null;

  const resetTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    return new Promise((_, reject) => {
      rejectFn = reject;
      timeoutId = setTimeout(() => {
        reject(new Error(`Stream timeout: no data received for ${timeoutMs}ms`));
      }, timeoutMs);
    });
  };

  try {
    const iterator = stream[Symbol.asyncIterator]();
    let timeoutPromise = resetTimeout();

    while (true) {
      const nextPromise = iterator.next();
      const result = await Promise.race([nextPromise, timeoutPromise]);

      if (result.done) {
        break;
      }

      yield result.value;
      timeoutPromise = resetTimeout(); // Reset for next chunk
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Truncate content to a maximum character limit to prevent 413 Payload Too Large errors
 * Tries to truncate at natural boundaries (paragraphs, sentences)
 * @param {string} content - Content to truncate
 * @param {number} maxChars - Maximum characters allowed (default 60000)
 * @returns {string} Truncated content
 */
function truncateForSynthesis(content, maxChars = 60000) {
  if (!content || content.length <= maxChars) return content;
  
  // Find a good break point - try paragraph, then sentence, then word
  const truncated = content.substring(0, maxChars);
  
  // Try to break at last paragraph
  const lastParagraph = truncated.lastIndexOf('\n\n');
  if (lastParagraph > maxChars * 0.8) {
    return truncated.substring(0, lastParagraph) + '\n\n[... content truncated for synthesis ...]';
  }
  
  // Try to break at last sentence
  const lastSentence = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('.\n'),
    truncated.lastIndexOf('? '),
    truncated.lastIndexOf('! ')
  );
  if (lastSentence > maxChars * 0.7) {
    return truncated.substring(0, lastSentence + 1) + '\n\n[... content truncated for synthesis ...]';
  }
  
  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.5) {
    return truncated.substring(0, lastSpace) + '\n\n[... content truncated for synthesis ...]';
  }
  
  return truncated + '\n\n[... content truncated for synthesis ...]';
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

  /**
   * Prune context items based on p-adic distance to target address
   * Used to filter context to relevant provider lineage or topological proximity.
   * 
   * @param {Array} contextItems - Items to filter (docs, results, etc)
   * @param {string|Array|Object} targetAddress - Target address/source to measure against
   * @param {number} [threshold=0.5] - Distance threshold (default 0.5)
   * @returns {Array} Filtered context items
   */
  pruneContext(contextItems, targetAddress, threshold = 0.5) {
    return contextItems || [];
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
      inputEmbeddings = null, // Add inputEmbeddings
      consensusData = null // Iteration consensus snapshots
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
         // Truncate individual model results to prevent payload too large (8K per result)
         resultsText = data.results.map(r => {
           const truncatedResult = truncateForSynthesis(r.result || '', 8000);
           return `--- Model: ${r.model} (${r.error ? 'FAILED' : 'Success'}) ---\n${truncatedResult}\n${r.error ? `ERROR DETAILS: ${r.errorMessage || 'Unknown error'}\n` : ''}`;
         }).join('\n');
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

    // Final safety truncation to prevent 413 Payload Too Large (max 80K for all results combined)
    const truncatedFormattedResults = truncateForSynthesis(formattedResults, 80000);
    if (truncatedFormattedResults.length < formattedResults.length) {
      logger.warn('Research results truncated for synthesis', { 
        requestId, 
        originalLength: formattedResults.length, 
        truncatedLength: truncatedFormattedResults.length 
      });
    }

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

    // Build consensus context for synthesis weighting
    let consensusContext = '';
    if (consensusData && consensusData.length > 0) {
      const last = consensusData[consensusData.length - 1];
      const majorityModels = last.details
        ?.filter(d => d.state === 'converged' || d.state === 'phase_locked')
        .map((_, i) => `sub-query ${i + 1}`) || [];
      consensusContext = `\n\nCONSENSUS METRICS: ${last.subQueryCount} sub-queries, avg agreement ${(last.avgAgreement * 100).toFixed(0)}%, ${last.convergedCount} converged, ${last.divergedCount} diverged.${majorityModels.length > 0 ? ` Converged: ${majorityModels.join(', ')}.` : ''} Weight converged sub-queries higher.`;
    }

    const userPrompt = `
ORIGINAL RESEARCH QUERY: ${originalQuery}
${textDocumentContext}
${structuredDataContext}
${embeddingContext}
${consensusContext}
${contradictionWarning}
${subQuerySummary}ENSEMBLE RESEARCH RESULTS (Grouped by Sub-Query, including status and failures):
${truncatedFormattedResults}

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
    const baseModel = this.model;
    const degradedLevel = providerManager.health().degradedLevel || 'none';
    const fallbackModels = [];
    if (degradedLevel === 'severe') {
      const tier = Array.isArray(config.models?.veryLowCost) && config.models.veryLowCost.length > 0
        ? config.models.veryLowCost
        : config.models.lowCost;
      for (const m of tier || []) {
        if (m?.name && m.name !== baseModel) fallbackModels.push(m.name);
      }
    } else if (degradedLevel === 'degraded') {
      const tier = config.models.lowCost || [];
      for (const m of tier) {
        if (m?.name && m.name !== baseModel) fallbackModels.push(m.name);
      }
    }
    if (fallbackModels.length === 0 && Array.isArray(config.models.planningCandidates)) {
      for (const m of config.models.planningCandidates) {
        if (m && m !== baseModel) fallbackModels.push(m);
      }
    }
    const uniqueFallbacks = fallbackModels.filter((m, idx) => fallbackModels.indexOf(m) === idx);
    const synthesisLineup = [baseModel, ...uniqueFallbacks].slice(0, 4);
    logger.debug('Sending synthesis stream request', { requestId, model: baseModel, degradedLevel, fallbackCount: synthesisLineup.length - 1 });
    let fullContent = '';
    let streamError = null;

    let activeModel = baseModel;
    let lastError = null;
    for (let attempt = 0; attempt < synthesisLineup.length; attempt++) {
      activeModel = synthesisLineup[attempt];
      try {
        const adaptiveMaxTokens = await calculateAdaptiveMaxTokens(
          activeModel,
          researchResults,
          { documents, structuredData }
        );

        const rawStream = providerManager.stream(activeModel, messages, {
          temperature: 0.3,
          max_tokens: adaptiveMaxTokens
        });

        const streamTimeoutMs = config.openrouter?.timeout || 180000;
        const stream = streamWithTimeout(rawStream, streamTimeoutMs);

        for await (const chunk of stream) {
          if (chunk.done) {
            break;
          }
          if (chunk.usage) {
            logger.debug('Stream usage', { requestId, usage: chunk.usage, model: activeModel });
            yield { usage: chunk.usage };
          }
          if (chunk.error) {
            streamError = chunk.error;
            logger.error('Error received in stream', { requestId, error: streamError, model: activeModel });
            lastError = streamError;
            break;
          }
          if (chunk.content) {
            fullContent += chunk.content;
            yield { content: chunk.content };
          }
        }

        if (streamError) {
          streamError = null;
          fullContent = '';
          if (activeModel !== baseModel) {
            providerTelemetry.recordFallback({ provider: 'openrouter', fromModel: baseModel, toModel: activeModel });
          }
          continue;
        }

        const duration = Date.now() - startTime;
        logger.info('Synthesis stream completed', { requestId, durationMs: duration, model: activeModel });

        if (detectTruncation(fullContent)) {
          logger.warn('Possible truncation detected in synthesis output', { requestId, model: activeModel });
          yield {
            warning: 'Response may have been truncated by token limit. Consider increasing SYNTHESIS_MAX_TOKENS or using a model with larger output capacity.',
            truncationDetected: true
          };
        }
        return;
      } catch (error) {
        lastError = error;
        logger.warn('Synthesis stream attempt failed', { requestId, durationMs: Date.now() - startTime, model: activeModel, error: error.message });
        if (activeModel !== baseModel) {
          providerTelemetry.recordFallback({ provider: 'openrouter', fromModel: baseModel, toModel: activeModel });
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.error('Unhandled error during synthesis stream', { requestId, durationMs: duration, query: originalQuery.substring(0, 50), model: activeModel, error: lastError });
    yield { error: `[${requestId}] ContextAgent failed to synthesize results stream for query "${originalQuery.substring(0, 50)}...": ${lastError?.message || 'Unknown error'}` };
  }
}

module.exports = new ContextAgent();
