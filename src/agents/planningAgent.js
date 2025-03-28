// src/agents/planningAgent.js
const openRouterClient = require('../utils/openRouterClient');
const config = require('../../config');

class PlanningAgent {
  constructor() {
    this.model = config.models.planning;
  }

  async planResearch(query, options = {}) {
    const systemPrompt = `
You are a research planning agent specialized in breaking down complex queries into well-structured components.

Analyze the research query carefully and identify distinct aspects requiring investigation:
1. Technical/scientific dimensions
2. Commercial/industry applications
3. Historical context and recent developments
4. Future trends and predictions
5. Competing approaches or perspectives

For each distinct aspect, create an XML tag with format:
<agent_1>First research question focusing on [specific aspect]</agent_1>
<agent_2>Second research question focusing on [specific aspect]</agent_2>

Ensure each question is:
- Self-contained and specific
- Phrased to elicit comprehensive factual information
- Focused on a distinct aspect with minimal overlap
- Appropriate for query complexity

Use 2-5 agents depending on complexity. OUTPUT ONLY THE XML TAGS.
`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ];

    try {
      const response = await openRouterClient.chatCompletion(this.model, messages, {
        temperature: 0.7,
        max_tokens: 2000
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error in planning research:', error);
      throw new Error('Failed to plan research: ' + error.message);
    }
  }
}

module.exports = new PlanningAgent();