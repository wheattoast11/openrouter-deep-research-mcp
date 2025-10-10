#!/usr/bin/env node

/**
 * OpenRouter Agents MCP Server Entry Point
 * Optimized for MCP usage with Streamable HTTP transport
 */

// Force MCP-optimized defaults
process.env.MCP_STREAMABLE_HTTP_ENABLED = process.env.MCP_STREAMABLE_HTTP_ENABLED || 'true';
process.env.MODE = process.env.MODE || 'AGENT';

require('../src/server/mcpServer.js');

