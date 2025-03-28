// src/server/mcpServer.js
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const express = require('express');
const { z } = require('zod');
const config = require('../../config');
const { conductResearchSchema, conductResearch } = require('./tools');

// Create MCP server
const server = new McpServer({
  name: config.server.name,
  version: config.server.version
});

// Register tools
server.tool(
  "conduct_research",
  conductResearchSchema.shape,
  async (params) => {
    try {
      console.error(`Starting research with query: "${params.query.substring(0, 50)}..."`);
      console.error(`Parameters: costPreference=${params.costPreference}, format=${params.outputFormat}, audience=${params.audienceLevel}`);
      
      const result = await conductResearch(params);
      
      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      console.error('Error in conduct_research tool:', error);
      return {
        content: [{
          type: 'text',
          text: `Error conducting research: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register follow-up research tool
server.tool(
  "research_follow_up",
  {
    originalQuery: z.string(),
    followUpQuestion: z.string(),
    costPreference: conductResearchSchema.shape.costPreference
  },
  async ({ originalQuery, followUpQuestion, costPreference }) => {
    try {
      // Craft a targeted follow-up query
      const query = `Follow-up research regarding "${originalQuery}": ${followUpQuestion}`;
      
      const result = await conductResearch({ 
        query, 
        costPreference,
        audienceLevel: 'expert', // Follow-ups tend to be more specific
        outputFormat: 'briefing', // More concise format for follow-ups
        includeSources: true
      });
      
      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      console.error('Error in research_follow_up tool:', error);
      return {
        content: [{
          type: 'text',
          text: `Error conducting follow-up research: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Set up transports based on environment
const setupTransports = async () => {
  // For command-line usage, use STDIO
  if (process.argv.includes('--stdio')) {
    console.error('Starting MCP server with STDIO transport');
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return;
  }

  // For HTTP usage, set up Express with SSE
  const app = express();
  const port = config.server.port;
  console.error(`Starting MCP server with HTTP/SSE transport on port ${port}`);

  // Endpoint for SSE
  app.get('/sse', async (req, res) => {
    console.error('New SSE connection');
    const transport = new SSEServerTransport('/messages', res);
    global.currentTransport = transport;
    await server.connect(transport);
  });

  // Endpoint for messages
  app.post('/messages', express.json(), (req, res) => {
    // This will be populated by the SSE transport
    if (!global.currentTransport) {
      return res.status(500).json({ error: 'No active transport' });
    }
    
    global.currentTransport.handlePostMessage(req, res);
  });

  // Start server
  app.listen(port, () => {
    console.error(`MCP server listening on port ${port}`);
  });
};

// Start the server
setupTransports().catch(error => {
  console.error('Failed to start MCP server:', error.message);
  process.exit(1);
});