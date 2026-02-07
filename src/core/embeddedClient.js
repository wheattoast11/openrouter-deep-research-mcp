/**
 * Embedded MCP Client
 *
 * Enables "void simulation" - the server calling itself as a client.
 * This is the key abstraction for Zero's self-referential architecture.
 *
 * When connected to a DualRoleNode at the fixed point (self-connected),
 * this client enables the server to invoke its own tools programmatically.
 *
 * @module core/embeddedClient
 */

'use strict';

const { EventEmitter } = require('events');

/**
 * Embedded MCP Client
 *
 * Provides a client interface for a DualRoleNode to call its own services.
 * Implements the "void simulation" pattern where the server becomes its own client.
 */
class EmbeddedMcpClient extends EventEmitter {
  /**
   * Create an embedded client
   *
   * @param {Object} options
   * @param {DualRoleNode} options.dualNode - The DualRoleNode to wrap
   * @param {RoleShiftProtocol} [options.roleShift] - Optional RoleShift protocol for bidirectional communication
   * @param {Object} [options.logger] - Optional logger
   */
  constructor(options = {}) {
    super();

    this.dualNode = options.dualNode;
    this.roleShift = options.roleShift || null;
    this.logger = options.logger || console;

    // Boost mode state (enhanced processing)
    this.boostMode = false;
    this.boostStartTime = null;

    // Request tracking for telemetry
    this.requestCount = 0;
    this.lastRequestTime = null;

    // Tool call cache for efficiency
    this.callCache = new Map();
    this.cacheMaxAge = 60000; // 1 minute cache TTL
  }

  /**
   * Check if the embedded client is ready
   *
   * @returns {boolean}
   */
  isReady() {
    return this.dualNode?.isFixedPoint?.() === true;
  }

  /**
   * Get current state
   *
   * @returns {Object}
   */
  getState() {
    return {
      ready: this.isReady(),
      boostMode: this.boostMode,
      boostDuration: this.boostStartTime ? Date.now() - this.boostStartTime : null,
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime,
      cacheSize: this.callCache.size,
      nodeIdentity: this.dualNode?.identity,
      nodeState: this.dualNode?.state,
      roleShiftEnabled: !!this.roleShift?.canShift
    };
  }

  /**
   * Call a tool on the DualRoleNode
   *
   * @param {string} toolName - Name of the tool to call
   * @param {Object} args - Tool arguments
   * @param {Object} [options] - Call options
   * @param {boolean} [options.useCache=false] - Use cached result if available
   * @param {number} [options.timeout=30000] - Timeout in milliseconds
   * @returns {Promise<any>}
   */
  async callTool(toolName, args = {}, options = {}) {
    if (!this.isReady()) {
      throw new Error('Embedded client not ready - DualRoleNode not at fixed point');
    }

    const { useCache = false, timeout = 30000 } = options;

    // Compute cache key once if caching enabled
    const cacheKey = useCache ? this._getCacheKey(toolName, args) : null;

    // Check cache if enabled
    if (cacheKey) {
      const cached = this.callCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
        this.emit('cache-hit', { toolName, args });
        return cached.result;
      }
    }

    // Track request
    this.requestCount++;
    this.lastRequestTime = Date.now();
    this.emit('tool-call-start', { toolName, args, requestId: this.requestCount });

    try {
      // Call through DualRoleNode's service layer
      const result = await this.dualNode.call(`tools/${toolName}`, args, timeout);

      // Cache result if caching enabled
      if (cacheKey) {
        this.callCache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
      }

      this.emit('tool-call-complete', { toolName, args, result, requestId: this.requestCount });
      return result;
    } catch (error) {
      this.emit('tool-call-error', { toolName, args, error, requestId: this.requestCount });
      throw error;
    }
  }

  /**
   * Request synthesis from the server (using RoleShift if available)
   *
   * Uses the RoleShift protocol to request that the server synthesize
   * information, falling back to conduct_research if RoleShift is unavailable.
   *
   * @param {string} prompt - The synthesis prompt
   * @param {Object} [options] - Synthesis options
   * @returns {Promise<any>}
   */
  async requestSynthesis(prompt, options = {}) {
    // If RoleShift is available and enabled, use it for proper bidirectional communication
    if (this.roleShift?.canShift) {
      try {
        return await this.roleShift.requestSynthesis(prompt, options);
      } catch (error) {
        this.logger.warn('RoleShift synthesis failed, falling back to tool call', { error: error.message });
      }
    }

    // Fall back to direct tool call
    return this.callTool('conduct_research', {
      query: prompt,
      costPreference: options.costPreference || 'low',
      async: false,
      ...options
    });
  }

  /**
   * Request clarification from the user (using RoleShift if available)
   *
   * @param {string} question - The clarification question
   * @param {Object} [options] - Clarification options
   * @returns {Promise<any>}
   */
  async requestClarification(question, options = {}) {
    if (this.roleShift?.canShift) {
      try {
        return await this.roleShift.requestClarification(question, options);
      } catch (error) {
        this.logger.warn('RoleShift clarification failed', { error: error.message });
        throw error;
      }
    }

    throw new Error('Clarification requires RoleShift protocol but it is not available');
  }

  /**
   * Enable boost mode (enhanced processing)
   *
   * Boost mode signals to the DualRoleNode that the client is requesting
   * enhanced processing priority. This can affect model routing and resource allocation.
   */
  enableBoost() {
    if (this.boostMode) {
      return; // Already in boost mode
    }

    this.boostMode = true;
    this.boostStartTime = Date.now();

    // Notify the DualRoleNode
    if (this.dualNode) {
      this.dualNode.notify('zero/boost-start', {
        timestamp: this.boostStartTime,
        clientId: this.dualNode.identity
      });
    }

    this.emit('boost-enabled', { timestamp: this.boostStartTime });
  }

  /**
   * Disable boost mode
   */
  disableBoost() {
    if (!this.boostMode) {
      return; // Not in boost mode
    }

    const duration = Date.now() - this.boostStartTime;
    this.boostMode = false;

    // Notify the DualRoleNode
    if (this.dualNode) {
      this.dualNode.notify('zero/boost-end', {
        timestamp: Date.now(),
        duration,
        clientId: this.dualNode.identity
      });
    }

    this.emit('boost-disabled', { duration });
    this.boostStartTime = null;
  }

  /**
   * Ping the DualRoleNode
   *
   * @returns {Promise<boolean>}
   */
  async ping() {
    try {
      const result = await this.callTool('ping', {}, { timeout: 5000 });
      return result?.pong === true;
    } catch {
      return false;
    }
  }

  /**
   * Get server status
   *
   * @returns {Promise<Object>}
   */
  async getServerStatus() {
    return this.callTool('get_server_status', {});
  }

  /**
   * Run a research query
   *
   * @param {string} query - Research query
   * @param {Object} [options] - Research options
   * @returns {Promise<Object>}
   */
  async research(query, options = {}) {
    const params = {
      query,
      costPreference: options.costPreference || 'low',
      async: options.async !== false,
      ...options
    };

    if (params.async) {
      // Return job info for async research
      const result = await this.callTool('research', params);
      return typeof result === 'string' ? JSON.parse(result) : result;
    } else {
      // Return full result for sync research
      return this.callTool('conduct_research', { ...params, async: false });
    }
  }

  /**
   * Search the knowledge base
   *
   * @param {string} query - Search query
   * @param {Object} [options] - Search options
   * @returns {Promise<Object>}
   */
  async search(query, options = {}) {
    return this.callTool('search', {
      q: query,
      k: options.k || 10,
      scope: options.scope || 'both',
      ...options
    });
  }

  /**
   * Execute SQL query
   *
   * @param {string} sql - SQL query
   * @param {Array} [params] - Query parameters
   * @returns {Promise<Object>}
   */
  async query(sql, params = []) {
    return this.callTool('query', { sql, params });
  }

  /**
   * Clear the call cache
   */
  clearCache() {
    this.callCache.clear();
    this.emit('cache-cleared');
  }

  /**
   * Generate cache key for tool call
   *
   * @private
   * @param {string} toolName
   * @param {Object} args
   * @returns {string}
   */
  _getCacheKey(toolName, args) {
    return `${toolName}:${JSON.stringify(args)}`;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.boostMode) {
      this.disableBoost();
    }
    this.callCache.clear();
    this.removeAllListeners();
  }
}

/**
 * Create an embedded MCP client
 *
 * @param {Object} options
 * @returns {EmbeddedMcpClient}
 */
function createEmbeddedClient(options = {}) {
  return new EmbeddedMcpClient(options);
}

module.exports = {
  EmbeddedMcpClient,
  createEmbeddedClient
};
