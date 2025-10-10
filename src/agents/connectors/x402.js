/**
 * x402 Coinbase Agent-to-Agent Connector
 * Scaffold for x402 protocol integration (feature-flagged)
 * 
 * To enable: Set MCP_CONNECTOR_X402_ENABLED=true
 * Spec: Awaiting x402 specification from Coinbase
 */

/**
 * Register x402 connector
 * @param {Object} mcpServer - MCP server instance
 * @returns {Object} Connector interface
 */
function register(mcpServer) {
  console.error('[x402] Connector registered (no-op scaffold; awaiting spec)');

  return {
    name: 'x402',
    version: '0.0.1',
    enabled: true,
    
    /**
     * Handle x402 protocol requests (placeholder)
     */
    async handleRequest(payload) {
      throw new Error('x402 connector not yet implemented; awaiting specification');
    },

    /**
     * Initiate x402 transaction (placeholder)
     */
    async initiateTransaction(params) {
      throw new Error('x402 connector not yet implemented; awaiting specification');
    }
  };
}

module.exports = { register };

