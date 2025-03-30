// src/agents/researchAgent.js
const openRouterClient = require('../utils/openRouterClient');
const config = require('../../config');
const structuredDataParser = require('../utils/structuredDataParser'); // Import the new parser

const DOMAINS = ["general", "technical", "reasoning", "search", "creative"];
const COMPLEXITY_LEVELS = ["simple", "moderate", "complex"];
const SIMPLE_QUERY_MAX_LENGTH = 15; // Example threshold for length heuristic

class ResearchAgent {
  constructor() {
    this.highCostModels = config.models.highCost;
    this.lowCostModels = config.models.lowCost;
    this.veryLowCostModels = config.models.veryLowCost || []; // Add veryLowCost models
    this.classificationModel = config.models.classification;
  }

  async classifyQueryDomain(query) {
    const systemPrompt = `Classify the primary domain of the following research query. Respond with ONLY one domain from this list: ${DOMAINS.join(', ')}.`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ];
    try {
      const response = await openRouterClient.chatCompletion(this.classificationModel, messages, {
        temperature: 0.1, // Low temp for consistent classification
        max_tokens: 10 // Short response needed
      });
      let domain = response.choices[0].message.content.trim().toLowerCase();
      // Basic cleanup if model adds punctuation etc.
      domain = domain.replace(/[^a-z]/g, ''); 
      
      if (DOMAINS.includes(domain)) {
        console.error(`[${new Date().toISOString()}] ResearchAgent: Classified query domain for "${query.substring(0, 50)}..." as: ${domain}`);
        return domain;
      } else {
        console.warn(`[${new Date().toISOString()}] ResearchAgent: Domain classification model returned invalid domain "${domain}" for query "${query.substring(0, 50)}...". Defaulting to 'general'.`);
        return 'general';
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ResearchAgent: Error classifying query domain for "${query.substring(0, 50)}...". Defaulting to 'general'. Error:`, error);
      return 'general';
    }
  }

  async assessQueryComplexity(query) {
     // Simple heuristic: short queries might be simple
     if (query.split(' ').length <= SIMPLE_QUERY_MAX_LENGTH) {
        console.error(`[${new Date().toISOString()}] ResearchAgent: Query "${query.substring(0, 50)}..." assessed as potentially simple based on length.`);
        // Optionally add LLM call for more nuanced assessment
        const systemPrompt = `Assess the complexity of the following research query. Is it likely answerable with a concise factual statement or does it require deep analysis? Respond with ONLY one complexity level: ${COMPLEXITY_LEVELS.join(', ')}.`;
        const messages = [ { role: 'system', content: systemPrompt }, { role: 'user', content: query } ];
        try {
           const response = await openRouterClient.chatCompletion(this.classificationModel, messages, { temperature: 0.1, max_tokens: 10 });
           let complexity = response.choices[0].message.content.trim().toLowerCase().replace(/[^a-z]/g, '');
           if (COMPLEXITY_LEVELS.includes(complexity)) {
              console.error(`[${new Date().toISOString()}] ResearchAgent: Classified query complexity for "${query.substring(0, 50)}..." as: ${complexity}`);
              return complexity;
           } else {
              console.warn(`[${new Date().toISOString()}] ResearchAgent: Complexity classification model returned invalid level "${complexity}". Defaulting to 'moderate'.`);
              return 'moderate';
           }
        } catch (error) {
           console.error(`[${new Date().toISOString()}] ResearchAgent: Error classifying query complexity for "${query.substring(0, 50)}...". Defaulting to 'moderate'. Error:`, error);
           return 'moderate'; // Default to moderate on error
        }
     }
     // Longer queries default to moderate/complex
     console.error(`[${new Date().toISOString()}] ResearchAgent: Query "${query.substring(0, 50)}..." assessed as moderate/complex based on length.`);
     return 'moderate'; 
  }


  getModel(costPreference, agentIndex, domain = 'general', complexity = 'moderate') {
    let selectedModel;
    let reason = '';

    // 1. Check if query is simple and very low-cost models exist
    if (complexity === 'simple' && this.veryLowCostModels.length > 0) {
      const simpleDomainModels = this.veryLowCostModels.filter(m => m.domains.includes(domain));
      if (simpleDomainModels.length > 0) {
        selectedModel = simpleDomainModels[agentIndex % simpleDomainModels.length].name;
        reason = `simple query, domain match in veryLowCost tier (domain: ${domain})`;
      } else {
         // Fallback within veryLowCost tier if no domain match
         selectedModel = this.veryLowCostModels[agentIndex % this.veryLowCostModels.length].name;
         reason = `simple query, fallback in veryLowCost tier (no domain match for ${domain})`;
      }
    }

    // 2. If no very low-cost model was selected, use standard logic
    if (!selectedModel) {
       const availableModels = costPreference === 'high' ? this.highCostModels : this.lowCostModels;
       if (availableModels.length === 0) {
          console.error(`[${new Date().toISOString()}] ResearchAgent: CRITICAL ERROR - No models available for cost preference "${costPreference}".`);
          // Fallback to a default model or throw error - using classification model as last resort
          return config.models.classification || "anthropic/claude-3-haiku"; 
       }
       
       const domainMatchingModels = availableModels.filter(m => m.domains.includes(domain));
       
       if (domainMatchingModels.length > 0) {
         // Use round-robin within domain-matching models
         selectedModel = domainMatchingModels[agentIndex % domainMatchingModels.length].name;
         reason = `standard routing, domain match in ${costPreference} tier (domain: ${domain})`;
       } else {
         // Fallback to round-robin across all models in the cost tier if no domain match
         console.warn(`[${new Date().toISOString()}] ResearchAgent: No models found for domain "${domain}" in ${costPreference} cost tier. Falling back to round-robin.`);
         selectedModel = availableModels[agentIndex % availableModels.length].name;
         reason = `standard routing, fallback in ${costPreference} tier (no domain match for ${domain})`;
       }
    }
    
    console.error(`[${new Date().toISOString()}] ResearchAgent: Selected model for agent ${agentIndex}: ${selectedModel}. Reason: ${reason}.`);
    this.ensembleSize = 2; // Number of models to run each query on
  }

  // Helper to get alternative models from the same cost tier, excluding the primary model
  getAlternativeModel(primaryModelName, costPreference, agentIndex) {
     const availableModels = costPreference === 'high' ? this.highCostModels : this.lowCostModels;
     const alternativePool = availableModels.filter(m => m.name !== primaryModelName);
     
     if (alternativePool.length === 0) {
        return null; // No alternatives available
     }
     // Simple round-robin on alternatives based on agentIndex + 1 to ensure diversity
     const altIndex = (agentIndex + 1) % alternativePool.length; 
     return alternativePool[altIndex].name;
  }

  // Updated to accept images, textDocuments, structuredData, and inputEmbeddings parameters
  async conductResearch(query, agentId, costPreference = 'low', audienceLevel = 'intermediate', includeSources = true, images = null, textDocuments = null, structuredData = null, inputEmbeddings = null) {
    // Classify domain and complexity first
    const domain = await this.classifyQueryDomain(query);
    const complexity = await this.assessQueryComplexity(query);
    const primaryModel = this.getModel(costPreference, agentId, domain, complexity); // Get the primary model

    // Get alternative model for ensemble
    const alternativeModel = this.getAlternativeModel(primaryModel, costPreference, agentId);
    
    const modelsToRun = [primaryModel];
    if (alternativeModel && this.ensembleSize > 1) {
       modelsToRun.push(alternativeModel);
    }
    
    console.error(`[${new Date().toISOString()}] ResearchAgent ${agentId}: Ensemble models for query "${query.substring(0, 50)}...": ${modelsToRun.join(', ')}`);

    // Run research on each model in the ensemble - passing all context parameters (including inputEmbeddings, though not directly used in _executeSingleResearch prompt yet)
    const ensemblePromises = modelsToRun.map(model => 
      this._executeSingleResearch(query, agentId, model, audienceLevel, includeSources, images, textDocuments, structuredData, inputEmbeddings)
    );
    
    // Return results for all models in the ensemble for this agentId
    return Promise.all(ensemblePromises);
  }
  
  // Updated to include structuredData and inputEmbeddings parameters (inputEmbeddings not used in prompt yet)
  async _executeSingleResearch(query, agentId, model, audienceLevel, includeSources, images = null, textDocuments = null, structuredData = null, inputEmbeddings = null) { 
     // TODO: Add logic to check if the 'model' actually supports vision.
     // This might involve fetching model details from OpenRouter or maintaining a local list.
     // For now, use a hardcoded list based on common vision models.
     const KNOWN_VISION_MODELS = [
       "openai/gpt-4o", 
       "openai/gpt-4o-mini", 
       "openai/gpt-4o-search-preview", // Assuming this supports vision
       "openai/gpt-4o-mini-search-preview", // Assuming this supports vision
       "google/gemini-2.0-pro-001", // Add known vision models
       "google/gemini-2.0-flash-001",
       "anthropic/claude-3-opus",
       "anthropic/claude-3-sonnet",
       "anthropic/claude-3-haiku",
       "anthropic/claude-3.5-sonnet",
       "anthropic/claude-3.7-sonnet" 
       // Add other known vision models from config or OpenRouter list
     ];
     const modelSupportsVision = KNOWN_VISION_MODELS.includes(model);
     
     // Prepare text document context snippet
     let textDocumentContextSnippet = '';
     if (textDocuments && textDocuments.length > 0) { // Fixed: Using textDocuments parameter
        textDocumentContextSnippet = `\n\nRelevant Text Document Snippets Provided by User:\n`;
        textDocuments.forEach(doc => {
           const truncatedContent = doc.content.length > 500 ? doc.content.substring(0, 500) + '...' : doc.content; 
           textDocumentContextSnippet += `--- Document: ${doc.name} ---\n${truncatedContent}\n---\n`;
        });
        textDocumentContextSnippet += "Use the provided text document snippets for context if relevant to the query.";
     }
     
     // Prepare structured data summary snippet
     let structuredDataContextSnippet = '';
     if (structuredData && structuredData.length > 0) { // Check for structuredData
        structuredDataContextSnippet = `\n\nRelevant Structured Data Summaries Provided by User:\n`;
        structuredData.forEach(data => {
           const summary = structuredDataParser.getStructuredDataSummary(data.content, data.type, data.name);
           structuredDataContextSnippet += `--- Data: ${data.name} (${data.type}) ---\n${summary}\n---\n`;
        });
         structuredDataContextSnippet += "Use the provided structured data summaries for context if relevant to the query.";
     }


     const systemPrompt = `
You are Research Agent ${agentId} using model ${model}, an elite AI research specialist tasked with providing authoritative information on specific topics.
${textDocumentContextSnippet} 
${structuredDataContextSnippet}
Your mission is to thoroughly investigate the assigned research question and deliver a comprehensive, evidence-based analysis.

Audience level: ${audienceLevel} (adjust technical depth accordingly)
${includeSources ? 'Include sources: When available, cite credible sources for key claims using [SOURCE: description] format' : ''}

Structure your response with these components:
1. KEY FINDINGS: Summarize the most important discoveries (2-3 sentences)
2. DETAILED ANALYSIS: Present organized findings with suitable depth
3. EVIDENCE & CONTEXT: Support claims with empirical evidence and proper context
4. LIMITATIONS: Acknowledge boundaries of current knowledge or conflicting viewpoints
5. CONFIDENCE ASSESSMENT: For each significant claim, indicate confidence level (High/Medium/Low) with brief justification

Prioritize recent developments, verified information, and multiple perspectives when relevant.
Avoid speculation and clearly distinguish between facts and expert opinions.
Be precise, comprehensive, and intellectually rigorous in your analysis.
`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ];
    // Removed duplicate messages array initialization here
    
    // Construct user message content, potentially including explicit image analysis instructions
    const userMessageContent = [];
    let queryText = query; // Start with the original query text
    
    if (modelSupportsVision && images && images.length > 0) {
       console.error(`[${new Date().toISOString()}] ResearchAgent ${agentId}: Including ${images.length} image(s) and analysis prompt for model ${model}.`);
       // Modify query text to ask for image analysis
       queryText = `Analyze the following image(s) in the context of this query: ${query}\n\nImage Analysis Task: Describe relevant visual elements, extract key information (like text or data from charts), and explain how the image content relates to the research query.`;
       
       // Add the modified text part first
       userMessageContent.push({ type: 'text', text: queryText });
       // Then add the images
       images.forEach(img => {
         userMessageContent.push({
           type: 'image_url',
           image_url: { url: img.url, detail: img.detail }
         });
       });
    } else {
       // If no images or model doesn't support vision, just use the original query text
       userMessageContent.push({ type: 'text', text: query });
       if (images && images.length > 0 && !modelSupportsVision) {
          console.warn(`[${new Date().toISOString()}] ResearchAgent ${agentId}: Model ${model} selected does not support vision, skipping image analysis.`);
       }
    }
    
    // Replace the user message content
    messages[1] = { role: 'user', content: userMessageContent };

    const startTime = Date.now();
    console.error(`[${new Date().toISOString()}] ResearchAgent ${agentId}: Starting research for query "${query.substring(0, 50)}..." using model ${model} (Vision: ${modelSupportsVision && images && images.length > 0})`);
    try {
      const response = await openRouterClient.chatCompletion(model, messages, {
        temperature: 0.3, // Low temperature for factual research
        max_tokens: 4000 // Allow ample space for detailed analysis
      });
      
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] ResearchAgent ${agentId}: Research completed successfully in ${duration}ms using model ${model}.`);
      return {
        agentId, // Keep original agentId for grouping
        model,   // Record the specific model used
        query,
        result: response.choices[0].message.content,
        error: false // Indicate success
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] ResearchAgent ${agentId}: Error after ${duration}ms. Query: "${query.substring(0, 50)}...". Model: ${model}. Error:`, error);
      // Return error information structured similarly to success response
      return {
        agentId,
        model,
        query,
        result: `ResearchAgent ${agentId} (Model: ${model}) failed for query "${query.substring(0, 50)}...": ${error.message}`,
        error: true,
        errorMessage: error.message,
        errorStack: error.stack // Include stack trace for better debugging
      };
    }
  }

  // Added images, textDocuments, structuredData, and inputEmbeddings parameters here
  async conductParallelResearch(queries, costPreference = 'low', images = null, textDocuments = null, structuredData = null, inputEmbeddings = null) { 
    console.error(`[${new Date().toISOString()}] ResearchAgent: Starting parallel ensemble research for ${queries.length} queries with costPreference=${costPreference}. Ensemble size: ${this.ensembleSize}. Images: ${images ? images.length : 0}, TextDocs: ${textDocuments ? textDocuments.length : 0}, StructuredData: ${structuredData ? structuredData.length : 0}`);
    const startTime = Date.now();
    
    // Map each query to its ensemble research promise, passing all context along
    const researchPromises = queries.map((query) => 
      // Pass images, textDocuments, structuredData, and inputEmbeddings to conductResearch
      this.conductResearch(query.query, query.id, costPreference, 'intermediate', true, images, textDocuments, structuredData, inputEmbeddings) 
    );

    try {
      // Use Promise.allSettled to ensure all promises complete, regardless of individual failures
      const settledResults = await Promise.allSettled(researchPromises);
      
      // Process the results: extract values from fulfilled promises and handle rejected ones
      const processedResults = settledResults.map(result => {
        if (result.status === 'fulfilled') {
          // result.value will be an array of results from the ensemble for one agentId
          return result.value; 
        } else {
          // result.reason contains the error for a rejected promise (entire ensemble failed for one agentId)
          console.error(`[${new Date().toISOString()}] ResearchAgent: Ensemble failed for one agent. Reason:`, result.reason);
          // We need to know which agentId this was for, but the original query object isn't directly here.
          // For now, return a generic error structure. Ideally, map queries to promises beforehand.
          // Returning an array with a single error object to maintain structure.
          return [{ 
             agentId: 'unknown', // Placeholder - requires mapping queries to promises
             model: 'N/A', 
             query: 'unknown', // Placeholder
             result: `Ensemble research failed: ${result.reason?.message || result.reason}`, 
             error: true, 
             errorMessage: result.reason?.message || result.reason 
          }];
        }
      });

      // Flatten the results (array of arrays)
      const flatResults = processedResults.flat();
      
      const duration = Date.now() - startTime;
      const successfulTasks = flatResults.filter(r => !r.error).length;
      const failedTasks = flatResults.length - successfulTasks;
      console.error(`[${new Date().toISOString()}] ResearchAgent: Parallel ensemble research completed (allSettled) in ${duration}ms. Total results processed: ${flatResults.length}. Success: ${successfulTasks}, Failed: ${failedTasks}.`);
      return flatResults; // Return the flattened list of results/errors
      
    } catch (error) { 
      // This catch block is less likely with allSettled, but kept for safety
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] ResearchAgent: Unexpected error during parallel research execution (allSettled) after ${duration}ms. Error:`, error);
      // If Promise.allSettled itself fails (unlikely), rethrow
      throw new Error(`Critical error during parallel research execution: ${error.message}`);
    }
  }
}

module.exports = new ResearchAgent();
