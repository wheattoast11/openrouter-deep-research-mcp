const { z } = require('zod');
const config = require('../../config');

/**
 * MCP Prompts Registration
 * Exposes 6 prompt templates for various research workflows
 */

// Schemas for prompt arguments
const planningPromptArgs = z.object({
  query: z.string().describe('Research query to plan'),
  domain: z.string().optional().describe('Domain context (technical, business, academic)'),
  complexity: z.enum(['simple', 'moderate', 'complex']).optional().describe('Query complexity level'),
  maxAgents: z.number().int().min(1).max(10).optional().describe('Max parallel research agents')
});

const synthesisPromptArgs = z.object({
  results: z.array(z.any()).describe('Research results to synthesize'),
  format: z.enum(['report', 'briefing', 'bullet_points']).optional().describe('Output format'),
  includeSources: z.boolean().optional().describe('Include source citations')
});

const workflowPromptArgs = z.object({
  taskType: z.enum(['research', 'analysis', 'comparison', 'trend_tracking']).describe('Workflow type'),
  context: z.string().optional().describe('Additional context')
});

const summarizeLearnArgs = z.object({
  url: z.string().url().describe('URL to fetch and summarize'),
  focus: z.string().optional().describe('Specific aspect to focus on')
});

const dailyBriefingArgs = z.object({
  scope: z.enum(['reports', 'jobs', 'all']).optional().describe('Briefing scope'),
  since: z.string().optional().describe('ISO datetime to start from')
});

const continuousQueryArgs = z.object({
  query: z.string().describe('Query to monitor'),
  schedule: z.string().describe('Cron expression for monitoring frequency'),
  notify: z.string().url().optional().describe('Webhook URL for notifications')
});

/**
 * Register all MCP prompts
 * @param {McpServer} server - MCP server instance
 */
function registerPrompts(server) {
  // 1. Planning Prompt
  server.registerPrompt('planning_prompt', {
    title: 'Multi-Agent Research Planning',
    description: 'Generate an optimal multi-agent research plan for a complex query',
    argsSchema: planningPromptArgs
  }, async (args) => {
    const { query, domain = 'general', complexity = 'moderate', maxAgents = 7 } = args;
    
    const basePrompt = `You are a research planning agent. Your task is to decompose the following research query into optimal sub-queries for parallel execution by multiple specialized agents.

**Research Query**: ${query}
**Domain**: ${domain}
**Complexity**: ${complexity}
**Max Agents**: ${maxAgents}

Provide a structured plan with:
1. **Sub-queries**: Break down the main query into ${maxAgents} or fewer specific research questions
2. **Agent roles**: Assign a specialized role to each sub-query (e.g., "technical expert", "market analyst")
3. **Dependencies**: Identify any sequential dependencies between sub-queries
4. **Success criteria**: Define what constitutes a complete answer

Format your plan as structured JSON with keys: sub_queries (array), agent_roles (array), dependencies (array), criteria (string).`;

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: basePrompt
          }
        }
      ],
      description: `Research planning for: "${query}"`
    };
  });

  // 2. Synthesis Prompt
  server.registerPrompt('synthesis_prompt', {
    title: 'Ensemble Result Synthesis',
    description: 'Synthesize multiple research results into a coherent report with citations',
    argsSchema: synthesisPromptArgs
  }, async (args) => {
    const { results, format = 'report', includeSources = true } = args;
    
    const resultsText = results.map((r, i) => `**Result ${i+1}**:\n${JSON.stringify(r, null, 2)}`).join('\n\n');
    
    const prompt = `You are a synthesis agent. Your task is to integrate the following research results into a cohesive, well-structured ${format}.

${resultsText}

Requirements:
- Identify consensus views and contradictions
- Highlight unique insights from each result
- Organize information logically
${includeSources ? '- Include citations and source URLs' : '- Focus on content without citations'}
- Provide a critical assessment of completeness

Output format: ${format}`;

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt
          }
        }
      ],
      description: `Synthesizing ${results.length} research results into ${format}`
    };
  });

  // 3. Research Workflow Prompt
  server.registerPrompt('research_workflow_prompt', {
    title: 'Complete Research Workflow Guide',
    description: 'Step-by-step workflow template for different research task types',
    argsSchema: workflowPromptArgs
  }, async (args) => {
    const { taskType, context = '' } = args;
    
    const workflows = {
      research: `# Research Workflow

1. **Query Formulation**: Define clear, specific research question
2. **Planning**: Break down into sub-queries (use planning_prompt)
3. **Execution**: Submit async agent job with appropriate cost/audience settings
4. **Monitoring**: Track job status and progress events
5. **Review**: Get report, assess completeness
6. **Follow-up**: Use research_follow_up for gaps
7. **Indexing**: Report auto-indexed for future retrieval`,
      
      analysis: `# Analysis Workflow

1. **Data Gathering**: Collect documents, structured data, images
2. **Context Provision**: Pass data via textDocuments/structuredData/images params
3. **Analysis Execution**: Use conduct_research with sync mode
4. **Result Review**: Examine findings and structured outputs
5. **Validation**: Cross-reference with external sources
6. **Reporting**: Extract insights and generate summary`,
      
      comparison: `# Comparative Analysis Workflow

1. **Define Criteria**: List comparison dimensions
2. **Query Construction**: Frame as "Compare X vs Y across [criteria]"
3. **Execution**: Submit research with expert audience level
4. **Result Processing**: Extract structured comparison table
5. **Decision Support**: Provide recommendations based on trade-offs`,
      
      trend_tracking: `# Trend Tracking Workflow

1. **Baseline Research**: Conduct initial research at time T0
2. **Schedule Monitoring**: Use continuous_query for automated tracking
3. **Periodic Updates**: Run research at T1, T2, ... Tn
4. **Comparison**: Use textDocuments to pass baseline + update reports
5. **Change Detection**: Identify key shifts, new developments
6. **Alert Configuration**: Set up notify webhooks for significant changes`
    };

    const workflow = workflows[taskType] || workflows.research;
    
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: context ? `${workflow}\n\n**Context**: ${context}` : workflow
          }
        }
      ],
      description: `${taskType} workflow template`
    };
  });

  // 4. Summarize and Learn
  server.registerPrompt('summarize_and_learn', {
    title: 'URL Fetching + Knowledge Extraction',
    description: 'Fetch a URL, extract key information, and index for future retrieval',
    argsSchema: summarizeLearnArgs
  }, async (args) => {
    const { url, focus = '' } = args;
    
    const prompt = `Fetch and analyze the content at: ${url}

Your task:
1. **Fetch** the URL content
2. **Extract** key information, facts, and insights
3. **Summarize** in 3-5 bullet points
${focus ? `4. **Focus** specifically on: ${focus}` : '4. **Identify** the most valuable takeaways'}
5. **Index** the content for future retrieval

Provide a structured summary with: title, url, key_points (array), summary (string), tags (array for indexing).`;

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt
          }
        }
      ],
      description: `Summarizing ${url}`,
      resourceLinks: [
        { uri: url, name: 'Source URL' }
      ]
    };
  });

  // 5. Daily Briefing
  server.registerPrompt('daily_briefing', {
    title: 'KB Activity + Schedules Summary',
    description: 'Generate a daily briefing of knowledge base activity and scheduled actions',
    argsSchema: dailyBriefingArgs
  }, async (args) => {
    const { scope = 'all', since } = args;
    const sinceText = since || 'last 24 hours';
    
    const prompt = `Generate a daily briefing for ${scope} activity since ${sinceText}.

Include:
1. **New Research Reports**: Count and topics covered
2. **Active Jobs**: Running/queued jobs with status
3. **Indexed Content**: New documents added to KB
4. **Scheduled Actions**: Upcoming continuous queries
5. **System Health**: Database stats, embedder status, cache metrics

Format as a concise executive briefing with key metrics and highlights.`;

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt
          }
        }
      ],
      description: `Daily briefing (${scope})`,
      resourceLinks: [
        { uri: 'mcp://agent/status', name: 'Agent Status' },
        { uri: 'mcp://knowledge_base/updates', name: 'KB Updates' }
      ]
    };
  });

  // 6. Continuous Query
  server.registerPrompt('continuous_query', {
    title: 'Cron-Scheduled Monitoring',
    description: 'Set up continuous monitoring of a research topic with scheduled execution',
    argsSchema: continuousQueryArgs
  }, async (args) => {
    const { query, schedule, notify } = args;
    
    const prompt = `Configure continuous monitoring for the following research query:

**Query**: ${query}
**Schedule**: ${schedule} (cron format)
${notify ? `**Notification Webhook**: ${notify}` : '**Notifications**: None configured'}

Your task:
1. **Validate** the cron schedule expression
2. **Plan** the monitoring strategy:
   - What aspects of the query are time-sensitive?
   - What change signals should trigger notifications?
3. **Configure** job parameters:
   - Cost preference (recommend "low" for frequent monitoring)
   - Output format (recommend "briefing" for quick review)
4. **Set up** comparison baseline:
   - Run initial research now
   - Store as reference for future comparisons
5. **Return** configuration JSON with: schedule, params, baseline_report_id, notify_url

Output a structured configuration object that can be used to schedule the monitoring job.`;

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt
          }
        }
      ],
      description: `Continuous monitoring setup for: "${query}"`,
      resourceLinks: [
        { uri: 'mcp://temporal/schedule', name: 'Scheduled Actions' }
      ]
    };
  });

  console.error(`[${new Date().toISOString()}] Registered ${6} MCP prompts`);
}

module.exports = { registerPrompts };

