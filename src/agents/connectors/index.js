/**
 * A2A Connector Registry
 * Feature-flagged agent-to-agent protocol integrations
 */

const config = require('../../../config');

/**
 * Register A2A connectors based on feature flags
 * @param {Object} mcpServer - MCP server instance
 * @returns {Object} Registered connectors
 */
function registerConnectors(mcpServer) {
  const registered = {};

  // x402 Coinbase connector (disabled by default)
  if (config.mcp.connectors.x402) {
    const x402 = require('./x402');
    registered.x402 = x402.register(mcpServer);
    console.error('[A2A] x402 connector enabled');
  }

  // AP2 Google agent-to-agent connector (disabled by default)
  if (config.mcp.connectors.ap2) {
    const ap2 = require('./ap2');
    registered.ap2 = ap2.register(mcpServer);
    console.error('[A2A] AP2 connector enabled');
  }

  if (Object.keys(registered).length === 0) {
    console.error('[A2A] No connectors enabled (x402 and AP2 are feature-flagged)');
  }

  return registered;
}

module.exports = { registerConnectors };

