// src/agents/contextAgent.js
const openRouterClient = require('../utils/openRouterClient');
const config = require('../../config');
const structuredDataParser = require('../utils/structuredDataParser'); // Import parser

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

    console.error(`[${new Date().toISOString()}] [${requestId}] ContextAgent: Starting contextualization for query "${originalQuery.substring(0, 50)}..." (Images: ${images ? images.length : 0}, Docs: ${documents ? documents.length : 0}, Structured: ${structuredData ? structuredData.length : 0})`);
    console.error(`[${new Date().toISOString()}] [${requestId}] ContextAgent: Options: audienceLevel=${audienceLevel}, outputFormat=${outputFormat}, includeSources=${includeSources}, maxLength=${maxLength}`);
    console.error(`[${new Date().toISOString()}] [${requestId}] ContextAgent: Received ${researchResults.length} total research results from ensemble runs for ${allAgentQueries.length} planned sub-queries.`);

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
    let systemPrompt = compact ? `
Synthesize the ensemble results for the ORIGINAL QUERY with strict evidence:
- Compare per-sub-query outputs: consensus, contradictions, unique info.
- Mark sub-query status: SUCCESS/PARTIAL/FAILED.
- Integrate successful/partial sub-queries into one coherent answer.
- Cite with explicit URLs (format: [Source: Title — https://...]). Label missing URLs as [Unverified].
- Provide confidence for major claims.
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
${subQuerySummary}ENSEMBLE RESEARCH RESULTS (Grouped by Sub-Query, including status and failures):
${formattedResults}

Please perform a critical synthesis of these findings, considering the original query, the status of each sub-query (SUCCESS/PARTIAL/FAILED), and any provided documents, structured data, or their semantic embeddings. For each sub-query, compare the ensemble results (noting failures), then integrate the synthesized findings from available sub-queries into a comprehensive analysis addressing the original query. Highlight consensus, discrepancies, failed sub-queries, and overall confidence based on the available information.
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
       console.error(`[${new Date().toISOString()}] [${requestId}] ContextAgent: Including ${images.length} image(s) in synthesis request.`);
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
    console.error(`[${new Date().toISOString()}] [${requestId}] ContextAgent: Sending synthesis stream request to model ${this.model}...`);
    let fullContent = '';
    let streamError = null;

    try {
      // Use the new streaming method
      const stream = openRouterClient.streamChatCompletion(this.model, messages, {
        temperature: 0.3, // Low temperature for synthesis consistency
        max_tokens: 4000 // Allow ample space for the final report
      });

      for await (const chunk of stream) {
        if (chunk.done) {
          break; // Stream finished
        }
        if (chunk.usage) {
          console.error(`[${new Date().toISOString()}] [${requestId}] ContextAgent: Stream usage:`, JSON.stringify(chunk.usage));
          yield { usage: chunk.usage };
        }
        if (chunk.error) {
          streamError = chunk.error;
          console.error(`[${new Date().toISOString()}] [${requestId}] ContextAgent: Error received in stream:`, streamError);
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
        console.error(`[${new Date().toISOString()}] [${requestId}] ContextAgent: Synthesis stream completed successfully in ${duration}ms.`);
      } else {
         console.error(`[${new Date().toISOString()}] [${requestId}] ContextAgent: Synthesis stream finished with error after ${duration}ms.`);
      }
      
    } catch (error) {
      // Catch errors from initiating the stream or other unexpected issues
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ContextAgent: Unhandled error during synthesis stream after ${duration}ms. Query: "${originalQuery.substring(0, 50)}...". Model: ${this.model}. Error:`, error);
      yield { error: `[${requestId}] ContextAgent failed to synthesize results stream for query "${originalQuery.substring(0, 50)}...": ${error.message}` };
    }
  }
}

module.exports = new ContextAgent();
