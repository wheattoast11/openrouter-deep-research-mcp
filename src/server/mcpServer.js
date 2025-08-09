// src/server/mcpServer.js
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const express = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid'); // Import uuid for connection IDs
const config = require('../../config');
const { 
  // Schemas
  conductResearchSchema,
  researchFollowUpSchema,
  getPastResearchSchema,
  rateResearchReportSchema,
  listResearchHistorySchema,
  getReportContentSchema,
  getServerStatusSchema, // Import schema for status tool
  executeSqlSchema, // Import schema for SQL tool
  listModelsSchema, // New: schema for listing models
  exportReportsSchema,
  importReportsSchema,
  backupDbSchema,
  dbHealthSchema,
  reindexVectorsSchema,
  searchWebSchema,
  fetchUrlSchema,
  
  // Functions
  conductResearch,
  researchFollowUp,
  getPastResearch,
  rateResearchReport,
  listResearchHistory,
  getReportContent,
  getServerStatus, // Import function for status tool
  executeSql, // Import function for SQL tool
  listModels, // New: function for listing models
  exportReports,
  importReports,
  backupDb,
  dbHealth,
  reindexVectorsTool,
  searchWeb,
  fetchUrl
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
     async (params, exchange) => { 
        const startTime = Date.now();
        const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`; // Simple request ID
        console.error(`[${new Date().toISOString()}] [${requestId}] conduct_research: Starting research for query "${params.query.substring(0, 50)}..."`); 
        console.error(`[${new Date().toISOString()}] [${requestId}] conduct_research: Parameters: costPreference=${params.costPreference}, format=${params.outputFormat}, audience=${params.audienceLevel}`); 
        try {
          // Pass the exchange context and requestId to conductResearch
          const result = await conductResearch(params, exchange, requestId); 
          const duration = Date.now() - startTime;
          console.error(`[${new Date().toISOString()}] [${requestId}] conduct_research: Research stream finished successfully in ${duration}ms.`); 
          // Return the final confirmation message (which now includes the report ID)
          return {
         content: [{
          type: 'text',
          text: result // e.g., "Research complete. Results streamed. Report ID: 6..."
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] conduct_research: Error after ${duration}ms. Query: "${params.query.substring(0, 50)}...". Error:`, error);
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
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "research_follow_up";
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Starting follow-up for original query "${params.originalQuery.substring(0, 50)}..."`);
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Follow-up question: "${params.followUpQuestion.substring(0, 50)}..."`);
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Parameters: costPreference=${params.costPreference}`);
    
    try {
      // Call researchFollowUp from tools.js, passing requestId
      const result = await researchFollowUp(params, exchange, requestId); 
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Follow-up research completed in ${duration}ms.`);
      
      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
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
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "get_past_research";
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Searching for similar past reports for query "${params.query ? params.query.substring(0, 50) : 'N/A'}..."`);
    
    try {
      // Call getPastResearch from tools.js, passing requestId
      const result = await getPastResearch(params, exchange, requestId); 
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Search completed in ${duration}ms.`);
      
      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
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
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "rate_research_report";
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Processing rating ${params.rating} for report ${params.reportId}`);
    
    try {
      // Call rateResearchReport from tools.js, passing requestId
      const result = await rateResearchReport(params, exchange, requestId); 
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Rating processed in ${duration}ms.`);
      
      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
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
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "list_research_history";
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Listing recent reports (limit: ${params.limit}, filter: "${params.queryFilter || 'None'}")`);
    
    try {
      // Call listResearchHistory from tools.js, passing requestId
      const result = await listResearchHistory(params, exchange, requestId); 
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Listing completed in ${duration}ms.`);
      
      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
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
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "get_report_content";
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Retrieving content for report ID ${params.reportId}`);
    
    try {
      // Call getReportContent from tools.js, passing requestId
      const result = await getReportContent(params, exchange, requestId); 
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Retrieval completed in ${duration}ms.`);
      
      // Return the report content directly
      return {
        content: [{
          type: 'text',
          text: result // This is the report content string
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
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

// Register tool to get server status
server.tool(
  "get_server_status",
  getServerStatusSchema.shape,
  async (params, exchange) => {
    const startTime = Date.now();
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "get_server_status";
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Request received.`);

    try {
      // Call getServerStatus from tools.js, passing requestId
      const result = await getServerStatus(params, exchange, requestId);
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Status retrieval completed in ${duration}ms.`);

      return {
        content: [{
          type: 'text',
          text: result // This is the status JSON string
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return {
        content: [{
          type: 'text',
          text: `Error retrieving server status: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register tool to execute SQL queries
server.tool(
  "execute_sql",
  executeSqlSchema.shape,
  async (params, exchange) => {
    const startTime = Date.now();
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "execute_sql";
    // Avoid logging full SQL in production if sensitive
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Attempting to execute SQL (Params: ${params.params?.length ?? 0})`);

    try {
      // Call executeSql from tools.js, passing requestId
      const result = await executeSql(params, exchange, requestId);
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: SQL execution completed in ${duration}ms.`);

      return {
        content: [{
          type: 'text',
          text: result // This is the JSON string of results
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return {
        content: [{
          type: 'text',
          text: `Error executing SQL: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Register tool to list available models (dynamic catalog)
server.tool(
  "list_models",
  listModelsSchema.shape,
  async (params, exchange) => {
    const startTime = Date.now();
    const requestId = `req-${startTime}-${Math.random().toString(36).substring(2, 7)}`;
    const toolName = "list_models";
    console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Request received (refresh=${params.refresh === true}).`);

    try {
      const result = await listModels(params, exchange, requestId);
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Completed in ${duration}ms.`);
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName}: Error after ${duration}ms: ${error.message}`);
      return { content: [{ type: 'text', text: `Error listing models: ${error.message}` }], isError: true };
    }
  }
);

// Register DB QoL tools
server.tool(
  "export_reports",
  exportReportsSchema.shape,
  async (params, exchange) => {
    const start = Date.now();
    const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
    const toolName = "export_reports";
    try {
      const text = await exportReports(params, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error exporting reports: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "import_reports",
  importReportsSchema.shape,
  async (params, exchange) => {
    const start = Date.now();
    const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
    const toolName = "import_reports";
    try {
      const text = await importReports(params, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error importing reports: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "backup_db",
  backupDbSchema.shape,
  async (params, exchange) => {
    const start = Date.now();
    const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
    const toolName = "backup_db";
    try {
      const text = await backupDb(params, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error backing up DB: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "db_health",
  dbHealthSchema.shape,
  async (params, exchange) => {
    const start = Date.now();
    const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
    const toolName = "db_health";
    try {
      const text = await dbHealth(params, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error getting DB health: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "reindex_vectors",
  reindexVectorsSchema.shape,
  async (params, exchange) => {
    const start = Date.now();
    const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
    const toolName = "reindex_vectors";
    try {
      const text = await reindexVectorsTool(params, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error reindexing vectors: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "search_web",
  searchWebSchema.shape,
  async (params, exchange) => {
    const start = Date.now();
    const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
    const toolName = "search_web";
    try {
      const text = await searchWeb(params, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error search_web: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "fetch_url",
  fetchUrlSchema.shape,
  async (params, exchange) => {
    const start = Date.now();
    const requestId = `req-${start}-${Math.random().toString(36).substring(2,7)}`;
    const toolName = "fetch_url";
    try {
      const text = await fetchUrl(params, exchange, requestId);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error fetch_url: ${e.message}` }], isError: true };
    }
  }
);


 // Set up transports based on environment
 const setupTransports = async () => {
  let lastSseTransport = null; // Variable to hold the last SSE transport
  const sseConnections = new Map(); // Map to store active SSE connections

  // For command-line usage, use STDIO
  if (process.argv.includes('--stdio')) {
    // console.error('Starting MCP server with STDIO transport'); // Commented out: Logs interfere with STDIO JSON-RPC
    const transport = new StdioServerTransport();
    // console.error('Attempting server.connect(transport)...'); // Commented out: Logs interfere with STDIO JSON-RPC
    await server.connect(transport);
    // console.error('server.connect(transport) completed.'); // Commented out: Logs interfere with STDIO JSON-RPC
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
   // Endpoint for SSE - Apply authentication middleware
   app.get('/sse', authenticate, async (req, res) => {
     const connectionId = uuidv4(); // Generate a unique ID for this connection
     console.error(`[${new Date().toISOString()}] New SSE connection established with ID: ${connectionId}`); // Use error

     // Set headers for SSE
     res.writeHead(200, {
       'Content-Type': 'text/event-stream',
       'Cache-Control': 'no-cache',
       'Connection': 'keep-alive',
     });

     const transport = new SSEServerTransport('/messages', res); // Pass the response object
     sseConnections.set(connectionId, transport); // Store transport keyed by ID
     lastSseTransport = transport; // Keep track of the last one for the simple POST handler

     try {
       await server.connect(transport); // Connect the server to this specific transport
       console.error(`[${new Date().toISOString()}] MCP Server connected to SSE transport for connection ID: ${connectionId}`);
     } catch (error) {
       console.error(`[${new Date().toISOString()}] Error connecting MCP Server to SSE transport for ID ${connectionId}:`, error);
       sseConnections.delete(connectionId); // Clean up on connection error
       if (!res.writableEnded) {
         res.end();
       }
       return; // Stop further processing for this request
     }

     // Handle client disconnect
     req.on('close', () => {
       console.error(`[${new Date().toISOString()}] SSE connection closed for ID: ${connectionId}`);
       sseConnections.delete(connectionId);
       if (lastSseTransport === transport) {
         lastSseTransport = null; // Clear if it was the last one
       }
       // Optionally notify the server instance if needed, though transport might handle this
       // server.disconnect(transport); // If SDK supports targeted disconnect
     });
   });

  // Endpoint for messages with per-connection routing and authentication
  // Supports both legacy (no connectionId) and new path/query param routing
  app.post(['/messages', '/messages/:connectionId'], authenticate, express.json(), (req, res) => {
    // Prefer explicit connectionId via route param or query
    const routeId = req.params.connectionId;
    const queryId = req.query.connectionId;
    const connectionId = routeId || queryId || null;

    if (connectionId) {
      const transport = sseConnections.get(connectionId);
      if (!transport) {
        console.error(`[${new Date().toISOString()}] Received POST /messages for unknown connectionId: ${connectionId}`);
        return res.status(404).json({ error: 'Unknown connectionId' });
      }
      console.error(`[${new Date().toISOString()}] Routing POST /messages to connectionId: ${connectionId}`);
      return transport.handlePostMessage(req, res);
    }

    // Legacy behavior: fall back to last transport if no connectionId provided
    if (!lastSseTransport) {
      console.error(`[${new Date().toISOString()}] Received POST /messages without connectionId and no active SSE transport found.`);
      return res.status(500).json({ error: 'No active SSE transport available' });
    }
    console.error(`[${new Date().toISOString()}] Handling legacy POST /messages via last active SSE transport.`);
    return lastSseTransport.handlePostMessage(req, res);
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
