1 // src/agents/contextAgent.js
const openRouterClient = require('../utils/openRouterClient');
const config = require('../../config');
const structuredDataParser = require('../utils/structuredDataParser'); // Import parser

class ContextAgent {
  constructor() {
    this.model = config.models.planning; // Using the same model as planning for synthesis
  }

  // Added images, documents, and structuredData parameters
  async *contextualizeResultsStream(originalQuery, researchResults, options = {}) { 
    const {
      audienceLevel = 'intermediate',
      outputFormat = 'report',
      includeSources = true,
      maxLength = null,
      images = null, 
      documents = null, // Renamed from textDocuments for consistency
      structuredData = null 
    } = options;

    console.error(`[${new Date().toISOString()}] ContextAgent: Starting contextualization for query "${originalQuery.substring(0, 50)}..." (Images: ${images ? images.length : 0}, Docs: ${documents ? documents.length : 0}, Structured: ${structuredData ? structuredData.length : 0})`);
    console.error(`[${new Date().toISOString()}] ContextAgent: Options: audienceLevel=${audienceLevel}, outputFormat=${outputFormat}, includeSources=${includeSources}, maxLength=${maxLength}`);
    console.error(`[${new Date().toISOString()}] ContextAgent: Received ${researchResults.length} total research results from ensemble runs.`);

    // Group results by original agentId (sub-query)
    const groupedResults = researchResults.reduce((acc, result) => {
      if (!acc[result.agentId]) {
        acc[result.agentId] = { query: result.query, results: [] };
      }
      acc[result.agentId].results.push({
        model: result.model,
        result: result.result,
        error: result.error,
        errorMessage: result.errorMessage
      });
      return acc;
    }, {});

    // Format grouped results for the synthesis prompt
    const formattedResults = Object.entries(groupedResults).map(([agentId, data]) => {
      const query = data.query;
      const resultsText = data.results.map(r => 
        `--- Model: ${r.model} ---\n${r.result}\n${r.error ? `NOTE: This model encountered an error: ${r.errorMessage || 'Unknown error'}\n` : ''}`
      ).join('\n');
      
      return `
SUB-QUERY ${agentId}: ${query}
ENSEMBLE RESULTS:
${resultsText}
=== END OF SUB-QUERY ${agentId} RESULTS ===
`;
    }).join('\n');


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

    let systemPrompt = `
You are an elite research synthesis specialist responsible for integrating and critically evaluating findings from multiple research agents, potentially using different models for the same sub-query.

Your mission is to perform a critical synthesis:
1. **Intra-Query Analysis:** For each SUB-QUERY provided below, meticulously compare the ENSEMBLE RESULTS from the different models. Explicitly identify:
    *   Areas of strong agreement/consensus between models.
    *   Significant disagreements, contradictions, or differing perspectives.
    *   Unique insights or information provided by only one model.
    *   Apparent strengths or weaknesses in each model's response to that specific sub-query.
2. **Sub-Query Synthesis:** Based on the intra-query analysis, synthesize a consolidated understanding for *each* sub-query. Prioritize corroborated information but retain valuable unique insights. Clearly state where models diverged.
3. **Overall Integration:** Integrate the synthesized findings from all sub-queries into a unified knowledge framework that comprehensively addresses the ORIGINAL RESEARCH QUERY.
4. **Insight Generation:** Identify overarching themes, key insights, patterns, and connections that emerge from the integrated analysis.
5. Highlight significant gaps, inconsistencies, or limitations in the overall research, considering both the individual results and the ensemble comparison. Pay attention to confidence levels reported by individual agents.
6. Draw evidence-based conclusions, explicitly stating the overall confidence level for key takeaways. Note where findings are based on single models versus consensus, and mention if confidence levels reported by agents were low or conflicting.

${outputInstructions}

Audience level: ${audienceLevel} (adjust depth and terminology accordingly)
${includeSources ? 'Maintain source attributions where provided by research agents' : 'Source attribution not required'}
${maxLength ? `Target length: Approximately ${maxLength} words` : 'Use appropriate length for comprehensive coverage'}

Focus on providing genuine insights derived from the comparison and synthesis of ensemble results, rather than merely summarizing individual agent outputs. Explicitly mention when models agree or disagree on key points, and incorporate the confidence assessments provided by the research agents (if available in their results) into your synthesis and overall confidence assessment. If documents or structured data were provided, ensure the synthesis reflects their content appropriately.
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
           const summary = structuredDataParser.getStructuredDataSummary(data.content, data.type, data.name);
           structuredDataContext += `--- Data: ${data.name} (${data.type}) ---\n${summary}\n---\n`;
        });
     }

    const userPrompt = `
ORIGINAL RESEARCH QUERY: ${originalQuery}
${textDocumentContext}
${structuredDataContext}
ENSEMBLE RESEARCH RESULTS (Multiple models may have answered each sub-query):
${formattedResults}

Please perform a critical synthesis of these findings, considering the original query and any provided documents or structured data. For each sub-query, compare the ensemble results, then integrate these synthesized sub-query findings into a comprehensive analysis addressing the original query. Highlight consensus, discrepancies, and overall confidence.
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
       console.error(`[${new Date().toISOString()}] ContextAgent: Including ${images.length} image(s) in synthesis request.`);
       // Adjust system prompt if images are present
       systemPrompt += "\n\nSynthesize the research results in the context of the provided image(s) as well.";
    }
    
    // Adjust system prompt if documents or structured data are present (already handled in user prompt, but can reinforce here)
    if ((documents && documents.length > 0) || (structuredData && structuredData.length > 0)) {
        systemPrompt += "\n\nEnsure your synthesis incorporates relevant information from the provided document and/or structured data context.";
    }

    const messages = [
      { role: 'system', content: systemPrompt }, // Use potentially modified system prompt
      { role: 'user', content: synthesisUserMessageContent } // Use constructed multi-part content
    ];


    const startTime = Date.now();
    console.error(`[${new Date().toISOString()}] ContextAgent: Sending synthesis stream request to model ${this.model}...`);
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
        if (chunk.error) {
          streamError = chunk.error;
          console.error(`[${new Date().toISOString()}] ContextAgent: Error received in stream:`, streamError);
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
        console.error(`[${new Date().toISOString()}] ContextAgent: Synthesis stream completed successfully in ${duration}ms.`);
      } else {
         console.error(`[${new Date().toISOString()}] ContextAgent: Synthesis stream finished with error after ${duration}ms.`);
      }
      
    } catch (error) {
      // Catch errors from initiating the stream or other unexpected issues
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] ContextAgent: Unhandled error during synthesis stream after ${duration}ms. Query: "${originalQuery.substring(0, 50)}...". Model: ${this.model}. Error:`, error);
      yield { error: `ContextAgent failed to synthesize results stream for query "${originalQuery.substring(0, 50)}...": ${error.message}` };
    }
  }
}

module.exports = new ContextAgent();
