// src/agents/researchAgent.js
const openRouterClient = require('../utils/openRouterClient');
const highCostModels = require('../models/highCostModels');
const lowCostModels = require('../models/lowCostModels');

class ResearchAgent {
  constructor() {
    this.highCostModels = highCostModels;
    this.lowCostModels = lowCostModels;
  }

  getModel(costPreference, agentIndex) {
    const models = costPreference === 'high' ? this.highCostModels : this.lowCostModels;
    const modelIndex = agentIndex % models.length;
    return models[modelIndex];
  }

  async conductResearch(query, agentId, costPreference = 'low', audienceLevel = 'intermediate', includeSources = true) {
    const model = this.getModel(costPreference, agentId);
    
    const systemPrompt = `
You are Research Agent ${agentId}, an elite AI research specialist tasked with providing authoritative information on specific topics.

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

    try {
      console.error(`Researching with agent ${agentId} using model ${model}`);
      
      const response = await openRouterClient.chatCompletion(model, messages, {
        temperature: 0.3,
        max_tokens: 4000
      });

      return {
        agentId,
        model,
        query,
        result: response.choices[0].message.content
      };
    } catch (error) {
      console.error(`Error in research for agent ${agentId}:`, error);
      return {
        agentId,
        model,
        query,
        result: `Error conducting research: ${error.message}`,
        error: true
      };
    }
  }

  async conductParallelResearch(queries, costPreference = 'low') {
    const researchPromises = queries.map((query, index) => 
      this.conductResearch(query.query, query.id, costPreference)
    );

    return await Promise.all(researchPromises);
  }
}

module.exports = new ResearchAgent();