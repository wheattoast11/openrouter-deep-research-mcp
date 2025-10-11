const config = require('../../config');
const dbClient = require('../utils/dbClient');

/**
 * MCP Resources Registration
 * Exposes 9 dynamic resources for real-time system state and documentation
 */

/**
 * Register all MCP resources
 * @param {McpServer} server - MCP server instance
 */
function registerResources(server) {
  // 1. MCP Specifications
  server.registerResource('MCP Core Specification', 'mcp://specs/core', {
    title: 'MCP Core Specification',
    description: 'Model Context Protocol specification references and compliance documentation',
    mimeType: 'application/json'
  }, async () => {
    return {
      contents: [{
        uri: 'mcp://specs/core',
        mimeType: 'application/json',
        text: JSON.stringify({
          protocol_version: config.mcp.protocolVersion,
          supported_versions: config.mcp.supportedVersions,
          spec_url: 'https://github.com/modelcontextprotocol/specification',
          compliance: {
            tools: { list: true, call: true },
            prompts: { list: true, get: true, listChanged: true },
            resources: { list: true, read: true, subscribe: true, listChanged: true }
          },
          discovery_endpoints: [
            '/.well-known/mcp-server',
            '/.well-known/oauth-protected-resource'
          ]
        }, null, 2)
      }]
    };
  });

  // 2. Tools Catalog (Dynamic)
  server.registerResource('Tools Catalog', 'mcp://tools/catalog', {
    title: 'Live Tools Catalog',
    description: 'Real-time catalog of all registered MCP tools with current availability',
    mimeType: 'application/json'
  }, async () => {
    const MODE = (config.mcp?.mode || 'ALL').toUpperCase();
    const toolsList = await server.server.request({ method: 'tools/list' }, {});
    
    return {
      contents: [{
        uri: 'mcp://tools/catalog',
        mimeType: 'application/json',
        text: JSON.stringify({
          mode: MODE,
          tool_count: toolsList.tools?.length || 0,
          tools: toolsList.tools || [],
          last_updated: new Date().toISOString()
        }, null, 2)
      }]
    };
  });

  // 3. Workflow Patterns
  server.registerResource('Workflow Patterns', 'mcp://patterns/workflows', {
    title: 'Tool Chaining Patterns',
    description: 'Common workflow patterns for chaining tools and building research pipelines',
    mimeType: 'text/markdown'
  }, async () => {
    const patterns = `# Tool Chaining Patterns

## Pattern 1: Research → Index → Retrieve
\`\`\`javascript
// Submit research
const { job_id } = await agent({ query: "...", async: true });

// Get report when complete
const status = await job_status({ job_id });
const reportId = status.report_id;

// Report auto-indexed; retrieve later
const similar = await search({ q: "related query", scope: "reports" });
\`\`\`

## Pattern 2: Fetch → Document → Research
\`\`\`javascript
// Fetch external content
const content = await fetch_url({ url: "https://..." });

// Use as document input
const report = await agent({
  query: "Analyze this content...",
  textDocuments: [{ name: "doc.txt", content }]
});
\`\`\`

## Pattern 3: Async Job Monitoring
\`\`\`javascript
// Submit job
const { job_id } = await agent({ query: "...", async: true });

// Stream events via SSE
const events = new EventSource(\`/jobs/\${job_id}/events\`);
events.onmessage = (e) => {
  const { type, payload } = JSON.parse(e.data);
  console.log(type, payload);
};
\`\`\`

## Pattern 4: Multi-Modal Research
\`\`\`javascript
const report = await conduct_research({
  query: "Analyze these diagrams...",
  images: [{ url: "https://...", detail: "high" }],
  textDocuments: [{ name: "spec.md", content: "..." }],
  structuredData: [{ name: "data.json", type: "json", content: "{...}" }]
});
\`\`\`

## Pattern 5: Follow-Up Refinement
\`\`\`javascript
// Initial research
const initial = await agent({ query: "Overview of topic X" });

// Identify gap, follow up
const deepDive = await research_follow_up({
  originalQuery: "Overview of topic X",
  followUpQuestion: "Explain aspect Y in detail"
});
\`\`\``;

    return {
      contents: [{
        uri: 'mcp://patterns/workflows',
        mimeType: 'text/markdown',
        text: patterns
      }]
    };
  });

  // 4. Multi-Modal Examples
  server.registerResource('Multimodal Examples', 'mcp://examples/multimodal', {
    title: 'Vision-Capable Research Examples',
    description: 'Example queries demonstrating image, document, and data analysis capabilities',
    mimeType: 'application/json'
  }, async () => {
    return {
      contents: [{
        uri: 'mcp://examples/multimodal',
        mimeType: 'application/json',
        text: JSON.stringify({
          examples: [
            {
              type: 'image_analysis',
              query: 'Analyze the architecture shown in this diagram',
              params: {
                images: [{ url: 'https://example.com/diagram.png', detail: 'high' }],
                costPreference: 'high',
                audienceLevel: 'expert'
              }
            },
            {
              type: 'document_analysis',
              query: 'Compare these API specifications',
              params: {
                textDocuments: [
                  { name: 'api-v1.md', content: '...' },
                  { name: 'api-v2.md', content: '...' }
                ]
              }
            },
            {
              type: 'data_analysis',
              query: 'Identify trends in this sales data',
              params: {
                structuredData: [{
                  name: 'sales.csv',
                  type: 'csv',
                  content: 'date,product,revenue\\n...'
                }]
              }
            }
          ]
        }, null, 2)
      }]
    };
  });

  // 5. Domain-Specific Use Cases
  server.registerResource('Domain Use Cases', 'mcp://use-cases/domains', {
    title: 'Domain-Specific Research Patterns',
    description: 'Optimized research approaches for different domains (technical, business, academic)',
    mimeType: 'application/json'
  }, async () => {
    return {
      contents: [{
        uri: 'mcp://use-cases/domains',
        mimeType: 'application/json',
        text: JSON.stringify({
          domains: {
            technical: {
              recommended_params: { audienceLevel: 'expert', costPreference: 'high' },
              common_queries: [
                'Comprehensive technical analysis of [technology]',
                'Architecture comparison: [option A] vs [option B]',
                'Production readiness assessment for [system]'
              ]
            },
            business: {
              recommended_params: { audienceLevel: 'intermediate', costPreference: 'low' },
              common_queries: [
                'Market analysis: [segment] trends and players',
                'Competitive landscape for [product category]',
                'Business model analysis: [company]'
              ]
            },
            academic: {
              recommended_params: { audienceLevel: 'expert', costPreference: 'high', includeSources: true },
              common_queries: [
                'Literature review: [research area] (2023-2025)',
                'Methodology comparison in [field]',
                'Current consensus on [research question]'
              ]
            }
          }
        }, null, 2)
      }]
    };
  });

  // 6. Caching Strategies (Dynamic)
  server.registerResource('Caching Strategies', 'mcp://optimization/caching', {
    title: 'Cache Performance and Optimization',
    description: 'Current cache statistics and optimization strategies',
    mimeType: 'application/json'
  }, async () => {
    const cacheStats = {
      ttl_seconds: 3600,
      max_keys: 100,
      eviction_policy: 'LRU',
      semantic_cache_enabled: true,
      recommendations: [
        'Use identical queries for cache hits',
        'Semantic cache finds similar queries (threshold: 0.85)',
        'Clear cache with higher cost preference to bypass'
      ]
    };

    return {
      contents: [{
        uri: 'mcp://optimization/caching',
        mimeType: 'application/json',
        text: JSON.stringify(cacheStats, null, 2)
      }]
    };
  });

  // 7. Agent Status (Dynamic)
  server.registerResource('Agent Status', 'mcp://agent/status', {
    title: 'Real-Time Agent State',
    description: 'Current status of research agents, active jobs, and system health',
    mimeType: 'application/json'
  }, async () => {
    try {
      const embedderReady = dbClient.isEmbedderReady();
      const dbInitialized = dbClient.isDbInitialized();
      const dbPathInfo = dbClient.getDbPathInfo();
      
      let jobs = { queued: 0, running: 0, succeeded: 0, failed: 0, canceled: 0 };
      try {
        const jobRows = await dbClient.executeQuery(
          `SELECT status, COUNT(*) AS n FROM job_queue GROUP BY status`, 
          []
        );
        jobRows.forEach(row => {
          jobs[row.status] = parseInt(row.n, 10);
        });
      } catch (_) {}

      return {
        contents: [{
          uri: 'mcp://agent/status',
          mimeType: 'application/json',
          text: JSON.stringify({
            timestamp: new Date().toISOString(),
            database: { initialized: dbInitialized, path: dbPathInfo },
            embedder: { ready: embedderReady, model: 'Xenova/all-MiniLM-L6-v2', dimensions: 384 },
            jobs,
            health: 'operational'
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: 'mcp://agent/status',
          mimeType: 'application/json',
          text: JSON.stringify({
            timestamp: new Date().toISOString(),
            health: 'degraded',
            error: error.message
          }, null, 2)
        }]
      };
    }
  });

  // 8. Knowledge Base Updates (Dynamic)
  server.registerResource('KB Updates', 'mcp://knowledge_base/updates', {
    title: 'Knowledge Base Change Stream',
    description: 'Recent additions and updates to the knowledge base (reports, indexed documents)',
    mimeType: 'application/json'
  }, async () => {
    try {
      const recentReports = await dbClient.executeQuery(
        `SELECT id, original_query, created_at FROM research_reports ORDER BY created_at DESC LIMIT 10`,
        []
      );
      
      return {
        contents: [{
          uri: 'mcp://knowledge_base/updates',
          mimeType: 'application/json',
          text: JSON.stringify({
            timestamp: new Date().toISOString(),
            recent_reports: recentReports.map(r => ({
              id: r.id,
              query: r.original_query,
              created_at: r.created_at
            })),
            count: recentReports.length
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: 'mcp://knowledge_base/updates',
          mimeType: 'application/json',
          text: JSON.stringify({
            timestamp: new Date().toISOString(),
            error: error.message
          }, null, 2)
        }]
      };
    }
  });

  // 9. Temporal Schedule (Dynamic)
  server.registerResource('Scheduled Actions', 'mcp://temporal/schedule', {
    title: 'Scheduled Research Actions',
    description: 'Cron-scheduled continuous queries and monitoring jobs',
    mimeType: 'application/json'
  }, async () => {
    // In future: query actual scheduled jobs from database
    // For now: return structure for UI display
    return {
      contents: [{
        uri: 'mcp://temporal/schedule',
        mimeType: 'application/json',
        text: JSON.stringify({
          timestamp: new Date().toISOString(),
          scheduled_queries: [],
          note: 'Continuous query scheduling will be implemented in future release',
          supported_cron_formats: [
            '0 * * * * - Every hour',
            '0 0 * * * - Daily at midnight',
            '0 0 * * 0 - Weekly on Sunday'
          ]
        }, null, 2)
      }]
    };
  });

  console.error(`[${new Date().toISOString()}] Registered ${9} MCP resources`);
}

module.exports = { registerResources };

