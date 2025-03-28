// src/agents/contextAgent.js
const openRouterClient = require('../utils/openRouterClient');
const config = require('../../config');

class ContextAgent {
  constructor() {
    this.model = config.models.planning; // Using the same model as planning
  }

  async contextualizeResults(originalQuery, researchResults, options = {}) {
    const { 
      audienceLevel = 'intermediate',
      outputFormat = 'report',
      includeSources = true,
      maxLength = null
    } = options;

    const formattedResults = researchResults.map(result => {
      return `
AGENT ${result.agentId} RESEARCH (Model: ${result.model})
QUERY: ${result.query}
RESULTS:
${result.result}
${result.error ? 'NOTE: This research encountered errors and may be incomplete.' : ''}
---
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

    const systemPrompt = `
You are an elite research synthesis specialist responsible for integrating findings from multiple research agents into a coherent, insightful analysis.

Your mission is to:
1. Analyze all research results with critical thinking and intellectual rigor
2. Identify key insights, patterns, and connections across different research domains
3. Synthesize findings into a unified knowledge framework that addresses the original query
4. Highlight significant gaps, inconsistencies, or limitations in the research
5. Draw evidence-based conclusions with appropriate confidence levels

${outputInstructions}

Audience level: ${audienceLevel} (adjust depth and terminology accordingly)
${includeSources ? 'Maintain source attributions where provided by research agents' : 'Source attribution not required'}
${maxLength ? `Target length: Approximately ${maxLength} words` : 'Use appropriate length for comprehensive coverage'}

Focus on providing genuine insights rather than merely summarizing. Where research agents disagree, acknowledge different perspectives and assess relative strength of evidence.
`;

    const userPrompt = `
ORIGINAL RESEARCH QUERY: ${originalQuery}

RESEARCH RESULTS FROM MULTIPLE AGENTS:
${formattedResults}

Please synthesize these findings into a comprehensive research report that addresses the original query. Include key insights, connections, and any identified gaps in the research.
`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      const response = await openRouterClient.chatCompletion(this.model, messages, {
        temperature: 0.3,
        max_tokens: 4000
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error in contextualizing results:', error);
      throw new Error('Failed to contextualize research results: ' + error.message);
    }
  }
}

module.exports = new ContextAgent();