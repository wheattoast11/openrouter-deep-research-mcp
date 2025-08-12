// src/agents/planningAgent.js
const openRouterClient = require('../utils/openRouterClient');
const config = require('../../config');

// Define DOMAINS globally or import if moved to utils
const DOMAINS = ["general", "technical", "reasoning", "search", "creative"];

class PlanningAgent {
  constructor() {
    this.model = config.models.planning;
    this.candidates = Array.isArray(config.models.planningCandidates) ? config.models.planningCandidates : [config.models.planning];
    this.classificationModel = config.models.classification; // Use classification model here too
    // AIMD controller state
    this.currentConcurrency = Math.max(1, Number(process.env.PARALLELISM) || 4);
    this.minConcurrency = 1;
    this.maxConcurrency = Math.max(this.currentConcurrency, 16);
    this.additiveStep = 1;
    this.multiplicativeFactor = 0.7; // reduce on error
  }

  getSemaphoreSize() {
    return Math.max(this.minConcurrency, Math.min(this.maxConcurrency, this.currentConcurrency));
  }

  recordSuccess() {
    this.currentConcurrency = Math.min(this.maxConcurrency, this.currentConcurrency + this.additiveStep);
  }

  recordFailure() {
    this.currentConcurrency = Math.max(this.minConcurrency, Math.floor(this.currentConcurrency * this.multiplicativeFactor));
  }

  // Reusing classification logic here, could be moved to a utility
  // Added options parameter to accept requestId
  async classifyQueryDomain(query, options = {}) { 
    const systemPrompt = `Classify the primary domain of the following research query. Respond with ONLY one domain from this list: ${DOMAINS.join(', ')}.`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ];
    // Ensure options exists before accessing requestId
    const requestId = (options && options.requestId) ? options.requestId : 'unknown-req'; 
    try {
      const response = await openRouterClient.chatCompletion(this.classificationModel, messages, {
        temperature: 0.1,
        max_tokens: 10
      });
      let domain = response.choices[0].message.content.trim().toLowerCase().replace(/[^a-z]/g, '');
      if (DOMAINS.includes(domain)) {
        console.error(`[${new Date().toISOString()}] [${requestId}] PlanningAgent: Classified overall query domain for "${query.substring(0, 50)}..." as: ${domain}`);
        return domain;
      } else {
        console.warn(`[${new Date().toISOString()}] [${requestId}] PlanningAgent: Domain classification model returned invalid domain "${domain}" for overall query "${query.substring(0, 50)}...". Defaulting to 'general'.`);
        return 'general';
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [${requestId}] PlanningAgent: Error classifying overall query domain for "${query.substring(0, 50)}...". Defaulting to 'general'. Error:`, error);
      return 'general';
    }
  }

  // Added previousResults, images, documents, structuredData, pastReports, inputEmbeddings, and requestId parameters
  async planResearch(query, options = {}, previousResults = null, requestId = 'unknown-req') { 
    const { images, documents, structuredData, pastReports, inputEmbeddings } = options; // Extract context
    let systemPrompt;
    let classifiedDomain = 'general'; // Default domain

    if (!previousResults) {
       // Classify the domain only for the initial planning step, passing requestId correctly
       classifiedDomain = await this.classifyQueryDomain(query, { requestId: requestId }); 
       // Pass past reports, documents, structured data, and input embeddings to the prompt generation method
       systemPrompt = this.getInitialPlanningPrompt(classifiedDomain, query, pastReports, documents, structuredData, inputEmbeddings);
       // Add image consideration note if applicable
       if (images && images.length > 0) {
          systemPrompt += "\n\nConsider the provided image(s) when formulating research questions.";
       }
    } else {
      // Refinement prompt logic (doesn't need initial context like documents/structuredData again)
      const formattedPreviousResults = previousResults.map(r =>
        `Agent ${r.agentId} (Model: ${r.model}) Query: ${r.query}\nResult Summary: ${r.result.substring(0, 200)}...\n${r.error ? `Error: ${r.errorMessage}\n` : ''}`
      ).join('\n---\n');

      systemPrompt = `
You are a research plan refinement agent. You previously created a research plan, and the initial results are provided below.
Analyze the original query and the initial results. Refine the research plan by generating NEW, more specific sub-queries to deepen the investigation or address gaps identified in the initial findings.

Original Query: ${query}

Initial Results Summary:
---
${formattedPreviousResults}
---

Refinement Guidelines:
- Generate 1-3 NEW sub-queries focusing on areas needing more detail, clarification, or addressing identified gaps/errors.
- Do NOT repeat the original sub-queries.
- Ensure new queries are highly specific and build upon the initial findings.
- If the initial results sufficiently answer the original query and no further detail is needed, respond with only "<plan_complete>".
- Otherwise, output ONLY the new XML tags for the refined queries (e.g., <agent_6>...</agent_6>, <agent_7>...</agent_7>). Use new agent IDs starting from the next available number.
`;
    }

    // Construct user message content, including all context types
    const userMessageContent = [];
    userMessageContent.push({ type: 'text', text: query });

    // Add text document content
    if (documents && documents.length > 0) {
       console.error(`[${new Date().toISOString()}] [${requestId}] PlanningAgent: Including ${documents.length} text document(s) in planning request.`);
       documents.forEach(doc => {
          const truncatedContent = doc.content.length > 2000 ? doc.content.substring(0, 2000) + '...' : doc.content;
          userMessageContent.push({ type: 'text', text: `\n\n--- Text Document: ${doc.name} ---\n${truncatedContent}\n--- End Document ---` });
       });
    }
    
    // Add structured data content
    if (structuredData && structuredData.length > 0) {
       console.error(`[${new Date().toISOString()}] [${requestId}] PlanningAgent: Including ${structuredData.length} structured data item(s) in planning request.`);
       structuredData.forEach(data => {
          const truncatedContent = data.content.length > 2000 ? data.content.substring(0, 2000) + '...' : data.content;
          userMessageContent.push({ type: 'text', text: `\n\n--- Structured Data (${data.type}): ${data.name} ---\n${truncatedContent}\n--- End Data ---` });
       });
    }

    // Add image content
    if (images && images.length > 0) {
      images.forEach(img => {
        userMessageContent.push({
          type: 'image_url',
          image_url: { url: img.url, detail: img.detail }
         });
       });
       console.error(`[${new Date().toISOString()}] [${requestId}] PlanningAgent: Including ${images.length} image(s) in planning request.`);
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessageContent } // Use constructed content
    ];

    const requestType = previousResults ? "Refinement" : "Initial Plan";
    console.error(`[${new Date().toISOString()}] [${requestId}] PlanningAgent: Requesting ${requestType} for query "${query.substring(0, 50)}..."`);

    try {
      // Try primary planning model, then fall back through candidates
      let response;
      let lastErr;
      const lineup = [this.model, ...this.candidates.filter(m => m !== this.model)];
      for (const m of lineup) {
        try {
          response = await openRouterClient.chatCompletion(m, messages, {
            temperature: previousResults ? 0.5 : 0.7, // Slightly lower temp for refinement
            max_tokens: 2000
          });
          this.model = m; // stick to a working model
          break;
        } catch (e) {
          lastErr = e;
          this.recordFailure();
        }
      }
      if (!response) throw lastErr || new Error('No planning model succeeded');

      const planResult = response.choices[0].message.content;
      console.error(`[${new Date().toISOString()}] [${requestId}] PlanningAgent: Successfully generated ${requestType}. Result: ${planResult.substring(0, 100)}...`);
      this.recordSuccess();
      return planResult;

    } catch (error) {
      console.error(`[${new Date().toISOString()}] [${requestId}] PlanningAgent: Error generating ${requestType} for query "${query.substring(0, 50)}...". Model: ${this.model}. Error:`, error);
      this.recordFailure();
      throw new Error(`[${requestId}] PlanningAgent failed to generate ${requestType} for query "${query.substring(0, 50)}...": ${error.message}`);
    }
  }

  // Method to get the appropriate initial planning prompt based on domain, past reports, documents, structured data, and input embeddings
  getInitialPlanningPrompt(domain, query, pastReports = [], documents = [], structuredData = [], inputEmbeddings = {}) {
    let knowledgeBaseContext = '';
    if (pastReports && pastReports.length > 0) {
      knowledgeBaseContext = `
Relevant Information from Past Research (note the date - use this to avoid redundant questions and build upon existing knowledge, considering its recency):
---
${pastReports.map(r => `Date Found: ${new Date(r.createdAt).toLocaleDateString()} (Similarity: ${r.similarityScore.toFixed(2)})\nPast Query: ${r.query}\nSummary Snippet:\n${r.summary}`).join('\n\n')}
---
`;
    }

    let documentContextInstruction = '';
    if (documents && documents.length > 0) {
       documentContextInstruction += `The user has provided ${documents.length} text document(s) for context. `;
    }
     if (structuredData && structuredData.length > 0) {
       documentContextInstruction += `The user has provided ${structuredData.length} structured data source(s) (${structuredData.map(d=>d.type).join(', ')}) for context. `;
    }
    // Add note about input embeddings if present
    if (inputEmbeddings && (inputEmbeddings.textDocuments?.length > 0 || inputEmbeddings.structuredData?.length > 0)) {
       documentContextInstruction += `Semantic embeddings for these inputs are available; leverage this deeper understanding. `;
    }
    if (documentContextInstruction) {
       documentContextInstruction += `Ensure your research plan considers and potentially analyzes the content and semantic meaning of these provided data sources in relation to the main query.`;
    }


    let basePrompt = `
 You are a research planning agent specialized in breaking down complex queries into well-structured components. The primary domain of this query is classified as: ${domain}.
 ${knowledgeBaseContext}
 ${documentContextInstruction}
 
 First, verify the query's assumptions (dates, entities, definitions). If assumptions are suspect, include a sub-query to validate them before deeper analysis.
 Prefer primary sources (official specs, docs, release notes) over tertiary commentary.
 For each sub-query, plan where to look (official docs, reputable blogs, academic sources) and what to extract (dates, versions, metrics, limitations).
 Require explicit citations with URLs in the final synthesis: each key claim must reference a source with an inline URL (e.g., [Source: Title — https://...]). Claims without URLs are marked [Unverified] and down-weighted in conclusions.
 `;

    let specificInstructions = '';
    let dimensions = `Consider standard dimensions like:
1. Core concepts and definitions
2. Key examples or applications
3. Historical context and evolution
4. Current state and recent developments
5. Future trends or implications
6. Related concepts or alternative perspectives`; // General dimensions

    switch (domain) {
      case 'technical':
        specificInstructions = 'Focus on technical underpinnings, algorithms, implementation details, performance characteristics, and comparisons with alternative technologies.';
        dimensions = `Consider dimensions like:
1. Fundamental principles and theory
2. Core algorithms and data structures
3. Implementation details and code examples (if applicable)
4. Performance analysis and benchmarks
5. Strengths, weaknesses, and trade-offs
6. Comparison with related technologies/methods`;
        break;
      case 'search':
        specificInstructions = 'Focus on formulating queries that retrieve specific facts, figures, statistics, and validate information from credible sources.';
         dimensions = `Consider dimensions like:
1. Specific factual data points requested
2. Key entities, dates, and locations
3. Source validation and credibility assessment
4. Quantitative data and statistics
5. Official definitions or classifications
6. Contradictory information or common misconceptions`;
        break;
      case 'reasoning':
        specificInstructions = 'Prioritize breaking down the query into logical steps, analyzing arguments, evaluating evidence, and exploring cause-and-effect relationships.';
         dimensions = `Consider dimensions like:
1. Underlying assumptions and premises
2. Logical steps in the argument/process
3. Supporting evidence for each step/claim
4. Potential counter-arguments or fallacies
5. Cause-and-effect relationships
6. Implications and consequences`;
        break;
      case 'creative':
         specificInstructions = 'Focus on exploring novel concepts, brainstorming diverse ideas, considering different perspectives, and generating imaginative content.';
          dimensions = `Consider dimensions like:
1. Brainstorming different angles/themes
2. Exploring unconventional ideas or perspectives
3. Generating varied examples or scenarios
4. Considering stylistic elements (tone, format)
5. Identifying potential sources of inspiration
6. Evaluating originality and feasibility`;
         break;
      // Default 'general' uses the base prompt and standard dimensions
    }

    let finalPrompt = `${basePrompt}\n\n${specificInstructions}\n\n${dimensions}\n\n`;

    finalPrompt += `
For each distinct aspect, create an XML tag with format:
<agent_1>First research question focusing on [specific aspect; include verification if needed]</agent_1>
<agent_2>Second research question focusing on [specific aspect]</agent_2>

Ensure each question is:
- Self-contained and specific
- Phrased to elicit verifiable facts with sources
- Focused on a distinct aspect with minimal overlap
- Appropriate for query complexity
- Optimized for web/evidence retrieval (names, dates, identifiers)

OUTPUT ONLY THE XML TAGS (e.g., <agent_1>...</agent_1>, <agent_2>...</agent_2>).`;

    return finalPrompt;
  }
}

module.exports = new PlanningAgent();
