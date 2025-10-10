// src/agents/researchAgent.js
const openRouterClient = require('../utils/openRouterClient');
const config = require('../../config');
const structuredDataParser = require('../utils/structuredDataParser'); // Import the new parser
const modelCatalog = require('../utils/modelCatalog'); // Dynamic model catalog
const parallelism = require('../../config').models.parallelism || 4;
const { BoundedExecutor } = require('@terminals-tech/core');

const DOMAINS = ["general", "technical", "reasoning", "search", "creative"];
const COMPLEXITY_LEVELS = ["simple", "moderate", "complex"];
const SIMPLE_QUERY_MAX_LENGTH = 15; // Example threshold for length heuristic

class ResearchAgent {
  constructor() {
    this.highCostModels = config.models.highCost;
    this.lowCostModels = config.models.lowCost;
    this.veryLowCostModels = config.models.veryLowCost || []; // Add veryLowCost models
    this.classificationModel = config.models.classification;
    this.ensembleSize = config.models.ensembleSize || 2; // Set ensemble size from config or default to 2
  }

  // Ensure options parameter is accepted
  async classifyQueryDomain(query, options = {}) { 
    const systemPrompt = `Classify the primary domain of the following research query. Respond with ONLY one domain from this list: ${DOMAINS.join(', ')}.`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ];
    // Assuming requestId is passed down or generated if needed
    const requestId = options?.requestId || 'unknown-req'; 
    try {
      const response = await openRouterClient.chatCompletion(this.classificationModel, messages, {
        temperature: 0.1, // Low temp for consistent classification
        max_tokens: 64 // Ensure well above OpenRouter minimum of 16
      });
      let domain = response.choices[0].message.content.trim().toLowerCase();
      // Basic cleanup if model adds punctuation etc.
      domain = domain.replace(/[^a-z]/g, ''); 
      
      if (DOMAINS.includes(domain)) {
        console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent: Classified query domain for "${query.substring(0, 50)}..." as: ${domain}`);
        return domain;
      } else {
        console.warn(`[${new Date().toISOString()}] [${requestId}] ResearchAgent: Domain classification model returned invalid domain "${domain}" for query "${query.substring(0, 50)}...". Defaulting to 'general'.`);
        return 'general';
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent: Error classifying query domain for "${query.substring(0, 50)}...". Defaulting to 'general'. Error:`, error);
      return 'general';
    }
  }

  async assessQueryComplexity(query, options = {}) {
     const requestId = options?.requestId || 'unknown-req';
     // Simple heuristic: short queries might be simple
     if (query.split(' ').length <= SIMPLE_QUERY_MAX_LENGTH) {
        console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent: Query "${query.substring(0, 50)}..." assessed as potentially simple based on length.`);
        // Optionally add LLM call for more nuanced assessment
        const systemPrompt = `Assess the complexity of the following research query. Is it likely answerable with a concise factual statement or does it require deep analysis? Respond with ONLY one complexity level: ${COMPLEXITY_LEVELS.join(', ')}.`;
        const messages = [ { role: 'system', content: systemPrompt }, { role: 'user', content: query } ];
        try {
           const response = await openRouterClient.chatCompletion(this.classificationModel, messages, { temperature: 0.1, max_tokens: 64 });
           let complexity = response.choices[0].message.content.trim().toLowerCase().replace(/[^a-z]/g, '');
           if (COMPLEXITY_LEVELS.includes(complexity)) {
              console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent: Classified query complexity for "${query.substring(0, 50)}..." as: ${complexity}`);
              return complexity;
           } else {
              console.warn(`[${new Date().toISOString()}] [${requestId}] ResearchAgent: Complexity classification model returned invalid level "${complexity}". Defaulting to 'moderate'.`);
              return 'moderate';
           }
        } catch (error) {
           console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent: Error classifying query complexity for "${query.substring(0, 50)}...". Defaulting to 'moderate'. Error:`, error);
           return 'moderate'; // Default to moderate on error
        }
     }
     // Longer queries default to moderate/complex
     console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent: Query "${query.substring(0, 50)}..." assessed as moderate/complex based on length.`);
     return 'moderate'; 
  }


  async getModel(costPreference, agentIndex, domain = 'general', complexity = 'moderate', requestId = 'unknown-req') {
    let selectedModel;
    let reason = '';
    // Try dynamic catalog first if enabled
    if (config.models.useDynamicCatalog) {
      try {
        const catalog = await modelCatalog.getCatalog();
        if (Array.isArray(catalog) && catalog.length > 0) {
          const preferred = modelCatalog.getPreferred2025Models();
          const domainRegex = new RegExp(domain, 'i');
          const filtered = (preferred.length > 0 ? preferred : catalog)
            .filter(m => domainRegex.test(m.label) || domainRegex.test(m.id));
          if (filtered.length > 0) {
            const idx = Math.abs(agentIndex) % filtered.length;
            selectedModel = filtered[idx].id;
            reason = `dynamic catalog preference (2025 priority), domain heuristic: ${domain}`;
          }
        }
      } catch (e) {
        console.warn(`[${new Date().toISOString()}] [${requestId}] ResearchAgent: Dynamic catalog unavailable, using static model lists.`);
      }
    }

    // Fallbacks to configured tiers
    if (!selectedModel) {
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
            console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent: CRITICAL ERROR - No models available for cost preference "${costPreference}".`);
            // Fallback to planning model as last resort
            return config.models.planning || "openai/gpt-5-chat"; 
         }
         const domainMatchingModels = availableModels.filter(m => m.domains.includes(domain));
         if (domainMatchingModels.length > 0) {
           selectedModel = domainMatchingModels[agentIndex % domainMatchingModels.length].name;
           reason = `standard routing, domain match in ${costPreference} tier (domain: ${domain})`;
         } else {
           selectedModel = availableModels[agentIndex % availableModels.length].name;
           reason = `standard routing, fallback in ${costPreference} tier (no domain match for ${domain})`;
         }
      }
    }
    console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent: Selected model for agent ${agentIndex}: ${selectedModel}. Reason: ${reason}.`);
    return selectedModel; 
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

  // Updated to accept images, textDocuments, structuredData, inputEmbeddings, and requestId parameters
  async conductResearch(query, agentId, costPreference = 'low', audienceLevel = 'intermediate', includeSources = true, images = null, textDocuments = null, structuredData = null, inputEmbeddings = null, requestId = 'unknown-req', onEvent = null, extra = {}) {
    const domain = await this.classifyQueryDomain(query, { requestId });
    const complexity = await this.assessQueryComplexity(query, { requestId });
    const mode = extra?.mode || 'standard';
    // Hyper mode prefers fastest locally-available providers from config/catalog (no hardcoded Morph models)
    let primaryModel;
    if (mode === 'hyper') {
      try {
        const preferred = [
          'inception/mercury',
          'google/gemini-2.5-flash',
          'z-ai/glm-4.5-air',
          'z-ai/glm-4.5v',
          'deepseek/deepseek-chat-v3.1',
          'openai/gpt-oss-120b'
        ];
        // From dynamic catalog if available; else fall back to configured lists
        let catalog = [];
        try { catalog = await modelCatalog.getCatalog(); } catch(_) {}
        const allConfigured = [
          ...(config.models.lowCost || []).map(m=>m.name),
          ...(config.models.highCost || []).map(m=>m.name)
        ];
        const pick = preferred.find(id => catalog.some(c=>c.id===id) || allConfigured.includes(id));
        primaryModel = pick || (config.models.lowCost?.[0]?.name || config.models.planning);
      } catch (_) {
        primaryModel = config.models.lowCost?.[0]?.name || config.models.planning;
      }
    } else {
      primaryModel = await this.getModel(costPreference, agentId, domain, complexity, requestId);
    }

    // Multimodal fallback detection
    let catalogEntry = null;
    try {
      const catalog = await modelCatalog.getCatalog();
      catalogEntry = catalog.find(m => m.id === primaryModel) || null;
    } catch (_) {}

    const needsVision = Array.isArray(images) && images.length > 0;
    const primarySupportsVision = !!catalogEntry?.capabilities?.vision;

    // Build ensemble (2-3 models) with kurtosis-guided heuristic: diversify providers
    const ensemble = new Set();
    ensemble.add(primaryModel);

    const addAlt = (id) => { if (id && !ensemble.has(id)) ensemble.add(id); };

    if (mode === 'hyper') {
      const hyperAlts = [
        'qwen/qwen3-235b-a22b-2507',
        'google/gemini-2.5-flash',
        'z-ai/glm-4.5-air'
      ];
      for (const id of hyperAlts) addAlt(id);
    }

    // Prefer 2025 models if available for diversity
    try {
      const preferred = modelCatalog.getPreferred2025Models();
      for (const p of preferred) {
        if (ensemble.size >= Math.max(2, Math.min(3, this.ensembleSize))) break;
        addAlt(p.id);
      }
    } catch (_) {}

    // Add tier alternatives for diversity
    const altTierModel = this.getAlternativeModel(primaryModel, costPreference, agentId);
    addAlt(altTierModel);

    // If we need vision and primary doesn’t support it, try to replace/add a vision-capable model
    if (needsVision && !primarySupportsVision) {
      try {
        const catalog = await modelCatalog.getCatalog();
        const visionCandidates = catalog.filter(m => m.capabilities?.vision);
        if (visionCandidates.length > 0) {
          addAlt(visionCandidates[agentId % visionCandidates.length].id);
        }
      } catch (_) {}
    }

    const modelsToRun = Array.from(ensemble).slice(0, Math.max(2, Math.min(3, this.ensembleSize)));
    console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent ${agentId}: Ensemble models: ${modelsToRun.join(', ')}`);

    const ensemblePromises = modelsToRun.map(model => 
      this._executeSingleResearch(query, agentId, model, audienceLevel, includeSources, images, textDocuments, structuredData, inputEmbeddings, requestId, onEvent)
    );
    return Promise.all(ensemblePromises);
  }
  
  // Updated to include structuredData, inputEmbeddings, requestId, and onEvent parameters
  async _executeSingleResearch(query, agentId, model, audienceLevel, includeSources, images = null, textDocuments = null, structuredData = null, inputEmbeddings = null, requestId = 'unknown-req', onEvent = null) { 
     // Dynamic capability check via model catalog
     let modelSupportsVision = false;
     try {
       const catalog = await modelCatalog.getCatalog();
       const entry = catalog.find(m => m.id === model);
       modelSupportsVision = !!entry?.capabilities?.vision;
     } catch (_) {}
     // Fallback known list
     if (!modelSupportsVision) {
             const KNOWN_VISION_MODELS = [
        "openai/gpt-4o", "openai/gpt-4o-mini",
        "google/gemini-2.5-pro", "google/gemini-2.5-flash",
        "z-ai/glm-4.5v",
        "anthropic/claude-3.7-sonnet"
      ];
       modelSupportsVision = KNOWN_VISION_MODELS.includes(model);
     }
     
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
           const summary = structuredDataParser.getStructuredDataSummary(data.content, data.type, data.name); // Consider passing requestId here if parser logs
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
 ${includeSources ? 'Citations: For every key claim, include an inline citation with an explicit URL using the format [Source: Title — https://...]. If a claim cannot be sourced with a URL, label it [Unverified] and de-emphasize it. Never invent repository names, package names, IDs, or registry URLs. If you cannot find an exact official URL (e.g., GitHub org repo path, docs page), state [Unverified] rather than guessing.' : ''}
 
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
       console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent ${agentId}: Including ${images.length} image(s) and analysis prompt for model ${model}.`);
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
          console.warn(`[${new Date().toISOString()}] [${requestId}] ResearchAgent ${agentId}: Model ${model} selected does not support vision, skipping image analysis.`);
       }
    }
    
    // Replace the user message content
    messages[1] = { role: 'user', content: userMessageContent };

    const startTime = Date.now();
    console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent ${agentId}: Starting research for query "${query.substring(0, 50)}..." using model ${model} (Vision: ${modelSupportsVision && images && images.length > 0})`);
    // Add detailed logging before the API call
    console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent ${agentId}: Preparing API call. Model: ${model}, Message Count: ${messages.length}, Options: ${JSON.stringify({ temperature: 0.3, max_tokens: 4000 })}`);
    if (!model) {
       console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent ${agentId}: CRITICAL - Model variable is undefined/null/empty before API call!`);
       // Throw an explicit error here to prevent calling the API with an invalid model
       throw new Error(`ResearchAgent ${agentId}: Attempted to call API with undefined model.`);
    }
    try {
      const response = await openRouterClient.chatCompletion(model, messages, {
        temperature: 0.3, // Low temperature for factual research
        max_tokens: 4000 // Allow ample space for detailed analysis
      });
      // Capture usage if provided
      const usage = response.usage || null;
      if (onEvent && usage) {
        await onEvent('agent_usage', { agent_id: agentId, model, usage });
      }
      
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent ${agentId}: Research completed successfully in ${duration}ms using model ${model}.`);
      return {
        agentId, // Keep original agentId for grouping
        model,   // Record the specific model used
        query,
        result: response.choices[0].message.content,
        error: false, // Indicate success
        usage
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent ${agentId}: Error after ${duration}ms. Query: "${query.substring(0, 50)}...". Model: ${model}. Error:`, error);
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

  // Added images, textDocuments, structuredData, inputEmbeddings, and requestId parameters here
  async conductParallelResearch(queries, costPreference = 'low', images = null, textDocuments = null, structuredData = null, inputEmbeddings = null, requestId = 'unknown-req', onEvent = null, extra = {}) { 
    console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent: Starting parallel ensemble research for ${queries.length} queries with costPreference=${costPreference}. Parallelism=${parallelism}.`);
    const startTime = Date.now();

    const mode = extra?.mode || 'standard';

    const executor = new BoundedExecutor({
      maxConcurrency: Math.min(parallelism, queries.length),
      meter: extra?.meter,
      onTaskStart: async ({ index }) => {
        const q = queries[index];
        if (q && onEvent) await onEvent('agent_started', { agent_id: q.id, query: q.query, cost: costPreference, mode });
      },
      onTaskFinish: async ({ index, result, error }) => {
        const q = queries[index];
        if (!q || !onEvent) return;
        const ok = error ? false : (Array.isArray(result) ? result.every(r => !r.error) : !result?.error);
        await onEvent('agent_completed', { agent_id: q.id, ok });
      }
    });

    const tasks = queries.map((q, index) => ({
      id: q.id || `agent-${index}`,
      run: async () => {
        try {
          const value = await this.conductResearch(
            q.query,
            q.id,
            costPreference,
            'intermediate',
            true,
            images,
            textDocuments,
            structuredData,
            inputEmbeddings,
            requestId,
            onEvent,
            { mode }
          );
          return value;
        } catch (e) {
          console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent task failure for ${q.id}:`, e);
          return [{
            agentId: q.id,
            model: 'N/A',
            query: q.query,
            result: `Error: ${e.message}`,
            error: true,
            errorMessage: e.message
          }];
        }
      }
    }));

    const results = await executor.runAll(tasks);

    const flatResults = results.flat();
    const duration = Date.now() - startTime;
    const successfulTasks = flatResults.filter(r => !r.error).length;
    const failedTasks = flatResults.length - successfulTasks;
    console.error(`[${new Date().toISOString()}] [${requestId}] ResearchAgent: Parallel research completed in ${duration}ms. Total results: ${flatResults.length}. Success: ${successfulTasks}, Failed: ${failedTasks}.`);
    return flatResults;
  }
}

module.exports = new ResearchAgent();
