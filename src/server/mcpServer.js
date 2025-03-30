// src/server/mcpServer.js
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const express = require('express');
const { z } = require('zod');
const config = require('../../config');
const { 
  // Schemas
  conductResearchSchema,
  researchFollowUpSchema,
  getPastResearchSchema,
  rateResearchReportSchema,
  listResearchHistorySchema,
  getReportContentSchema, // Import schema for new tool
  
  // Functions
  conductResearch,
  researchFollowUp,
  getPastResearch,
  rateResearchReport,
  listResearchHistory,
  getReportContent // Import function for new tool
} = require('./tools');
const dbClient = require('../utils/dbClient'); // Import dbClient

// Create MCP server
const server = new McpServer({
  name: config.server.name,
  version: config.server.version
});

// Register tools
   // The second argument to the tool handler is the exchange context from the SDK
   server.tool(
     "conduct_research",
     conductResearchSchema.shape,
     async (params, exchange) => { // Added exchange parameter
        const startTime = Date.now();
        console.error(`[${new Date().toISOString()}] conduct_research: Starting research for query "${params.query.substring(0, 50)}..."`); // Use error
        console.error(`[${new Date().toISOString()}] conduct_research: Parameters: costPreference=${params.costPreference}, format=${params.outputFormat}, audience=${params.audienceLevel}`); // Use error
        try {
          // Pass the exchange context to conductResearch
          const result = await conductResearch(params, exchange);
          const duration = Date.now() - startTime;
          // Log completion, the actual content is streamed via progress
          console.error(`[${new Date().toISOString()}] conduct_research: Research stream finished successfully in ${duration}ms.`); // Use error
          // Return the final confirmation message (which now includes the report ID)
          return {
         content: [{
          type: 'text',
          text: result // e.g., "Research complete. Results streamed. Report ID: 6..."
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] conduct_research: Error after ${duration}ms. Query: "${params.query.substring(0, 50)}...". Error:`, error);
      return {
        content: [{
          type: 'text',
          text: `Error conducting research for query "${params.query.substring(0, 50)}...": ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register follow-up research tool
server.tool(
  "research_follow_up",
  researchFollowUpSchema.shape,
  async (params, exchange) => {
    const startTime = Date.now();
    const toolName = "research_follow_up";
    console.error(`[${new Date().toISOString()}] ${toolName}: Starting follow-up for original query "${params.originalQuery.substring(0, 50)}..."`);
    console.error(`[${new Date().toISOString()}] ${toolName}: Follow-up question: "${params.followUpQuestion.substring(0, 50)}..."`);
    console.error(`[${new Date().toISOString()}] ${toolName}: Parameters: costPreference=${params.costPreference}`);
    
    try {
      // Call researchFollowUp from tools.js
      const result = await researchFollowUp(params, exchange);
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] ${toolName}: Follow-up research completed in ${duration}ms.`);
      
      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] ${toolName}: Error after ${duration}ms: ${error.message}`);
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

// Register tool to retrieve past research reports
server.tool(
  "get_past_research",
  getPastResearchSchema.shape,
  async (params, exchange) => {
    const startTime = Date.now();
    const toolName = "get_past_research";
    console.error(`[${new Date().toISOString()}] ${toolName}: Searching for similar past reports for query "${params.query ? params.query.substring(0, 50) : 'N/A'}..."`);
    
    try {
      // Call getPastResearch from tools.js
      const result = await getPastResearch(params, exchange);
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] ${toolName}: Search completed in ${duration}ms.`);
      
      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving past research: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register tool to rate a past research report
server.tool(
  "rate_research_report",
  rateResearchReportSchema.shape,
  async (params, exchange) => {
    const startTime = Date.now();
    const toolName = "rate_research_report";
    console.error(`[${new Date().toISOString()}] ${toolName}: Processing rating ${params.rating} for report ${params.reportId}`);
    
    try {
      // Call rateResearchReport from tools.js
      const result = await rateResearchReport(params, exchange);
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] ${toolName}: Rating processed in ${duration}ms.`);
      
      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return {
        content: [{
          type: 'text',
          text: `Error recording feedback: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register tool to list recent research reports
server.tool(
  "list_research_history",
  listResearchHistorySchema.shape,
  async (params, exchange) => {
    const startTime = Date.now();
    const toolName = "list_research_history";
    console.error(`[${new Date().toISOString()}] ${toolName}: Listing recent reports (limit: ${params.limit}, filter: "${params.queryFilter || 'None'}")`);
    
    try {
      // Call listResearchHistory from tools.js
      const result = await listResearchHistory(params, exchange);
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] ${toolName}: Listing completed in ${duration}ms.`);
      
      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving research history: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register tool to retrieve specific report content by ID
server.tool(
  "get_report_content",
  getReportContentSchema.shape,
  async (params, exchange) => {
    const startTime = Date.now();
    const toolName = "get_report_content";
    console.error(`[${new Date().toISOString()}] ${toolName}: Retrieving content for report ID ${params.reportId}`);
    
    try {
      // Call getReportContent from tools.js
      const result = await getReportContent(params, exchange); // Pass exchange if needed later
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] ${toolName}: Retrieval completed in ${duration}ms.`);
      
      // Return the report content directly
      return {
        content: [{
          type: 'text',
          text: result // This is the report content string
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving report content: ${error.message}`
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
    console.error('Starting MCP server with STDIO transport'); // Use error
    const transport = new StdioServerTransport();
    console.error('Attempting server.connect(transport)...'); // Add error before
    await server.connect(transport);
    console.error('server.connect(transport) completed.'); // Add error after
    return; // Exit after setting up stdio, don't proceed to HTTP setup
  } else { // Only setup HTTP/SSE if --stdio is NOT specified
    // For HTTP usage, set up Express with SSE
    const app = express();
    const port = config.server.port;
  const serverApiKey = config.server.apiKey; // Get the API key from config

  // Authentication Middleware
  const authenticate = (req, res, next) => {
    // Check if authentication is explicitly allowed to be disabled via environment variable
    const allowNoApiKey = process.env.ALLOW_NO_API_KEY === 'true';
    
    // Skip auth only if explicitly allowed AND no key is configured
    if (allowNoApiKey && !serverApiKey) {
      console.warn(`[${new Date().toISOString()}] WARNING: Running with authentication DISABLED (ALLOW_NO_API_KEY=true and no SERVER_API_KEY set).`);
      return next();
    }
    
    // If we don't have a server API key but authentication is mandatory (default)
    if (!serverApiKey) {
      console.error(`[${new Date().toISOString()}] AUTHENTICATION ERROR: SERVER_API_KEY is not set but authentication is mandatory.`);
      console.error(`[${new Date().toISOString()}] To disable authentication (NOT RECOMMENDED), set ALLOW_NO_API_KEY=true in the environment.`);
      return res.status(500).json({ error: 'Server misconfiguration: API key required but not configured.' });
    }
    
    // From here on, we have a serverApiKey and authentication is required
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn(`[${new Date().toISOString()}] Authentication failed: Missing or invalid Authorization header.`);
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header.' });
    }

    const token = authHeader.split(' ')[1];
    if (token !== serverApiKey) {
      console.warn(`[${new Date().toISOString()}] Authentication failed: Invalid API key provided.`);
      return res.status(403).json({ error: 'Forbidden: Invalid API key.' });
    }

    // Authentication successful
    next();
  };
 
  console.error(`Starting MCP server with HTTP/SSE transport on port ${port}`); // Use error
  if (serverApiKey) {
    console.error(`[${new Date().toISOString()}] Basic API key authentication ENABLED for HTTP transport.`); // Use error
  } else if (process.env.ALLOW_NO_API_KEY === 'true') {
    console.error(`[${new Date().toISOString()}] SECURITY WARNING: Authentication DISABLED for HTTP transport (ALLOW_NO_API_KEY=true).`); // Use error, keep as warning level
  } else {
    console.error(`[${new Date().toISOString()}] CRITICAL: SERVER_API_KEY not set and ALLOW_NO_API_KEY!=true. HTTP transport may fail.`); // Keep error
  }
 
 
   // Endpoint for SSE - Apply authentication middleware
   app.get('/sse', authenticate, async (req, res) => {
     console.error('New SSE connection'); // Use error
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
     console.error(`MCP server listening on port ${port}`); // Use error
   });
  } // Close the else block for HTTP setup
 };

 // Start the server
 setupTransports().catch(error => {
   console.error('Failed to start MCP server:', error.message); // Keep error
   process.exit(1);
 });
