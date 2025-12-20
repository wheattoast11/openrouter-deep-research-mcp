/**
 * Zero Bridge
 *
 * Central message router for multi-agent orchestration.
 * Manages agent connections via socket transport and phase-lock protocol.
 *
 * @module core/bridge/zeroBridge
 */

'use strict';

const { EventEmitter } = require('events');
const { SocketTransport } = require('../transport/socketTransport');
const {
  PhaseLockStateMachine,
  PhaseLockMessage,
  PhaseLockState,
  createOrchestratorPhaseLock
} = require('./phaseLock');

/**
 * Agent connection state
 */
const AgentState = {
  PENDING: 'pending',
  HANDSHAKING: 'handshaking',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  FAILED: 'failed'
};

/**
 * Bridge message types
 */
const BridgeMessage = {
  BROADCAST: 'bridge.broadcast',
  DIRECT: 'bridge.direct',
  QUERY: 'bridge.query',
  RESPONSE: 'bridge.response',
  SYSTEM: 'bridge.system'
};

/**
 * Agent connection wrapper
 *
 * Tracks an agent's connection state and phase-lock handshake.
 */
class AgentConnection {
  /**
   * Create agent connection wrapper
   *
   * @param {Object} options - Connection options
   * @param {string} options.agentId - Agent identifier
   * @param {string} options.orchestratorId - Orchestrator identifier
   * @param {Object} [options.capabilities] - Advertised capabilities
   */
  constructor(options) {
    this.agentId = options.agentId;
    this.state = AgentState.PENDING;
    this.phaseLock = createOrchestratorPhaseLock(options.agentId, {
      orchestratorId: options.orchestratorId,
      onStateChange: (event) => this._onPhaseChange(event)
    });
    this.socketConnection = null;
    this.capabilities = options.capabilities || {};
    this.remoteCapabilities = null;
    this.connectedAt = null;
    this.lastActivity = null;
    this.messageCount = 0;
    this.pendingRequests = new Map();
  }

  /**
   * Handle phase-lock state changes
   * @param {Object} event - State change event
   * @private
   */
  _onPhaseChange(event) {
    if (event.to === PhaseLockState.LOCKED) {
      this.state = AgentState.CONNECTED;
      this.connectedAt = Date.now();
      this.remoteCapabilities = this.phaseLock.remoteCapabilities;
    } else if (event.to === PhaseLockState.FAILED) {
      this.state = AgentState.FAILED;
    }
  }

  /**
   * Start handshake with agent
   * @returns {Object} HELLO message to send
   */
  initiateHandshake() {
    this.state = AgentState.HANDSHAKING;
    return this.phaseLock.initiateHandshake(this.capabilities);
  }

  /**
   * Process incoming phase-lock message
   * @param {Object} message - Phase-lock message
   * @returns {Object|null} Response message or null
   */
  processHandshake(message) {
    return this.phaseLock.process(message);
  }

  /**
   * Check if connection is fully established
   * @returns {boolean}
   */
  get isConnected() {
    return this.state === AgentState.CONNECTED && this.phaseLock.isLocked;
  }

  /**
   * Record message activity
   */
  recordActivity() {
    this.lastActivity = Date.now();
    this.messageCount++;
  }

  /**
   * Get connection info
   * @returns {Object}
   */
  getInfo() {
    return {
      agentId: this.agentId,
      state: this.state,
      isConnected: this.isConnected,
      connectedAt: this.connectedAt,
      lastActivity: this.lastActivity,
      messageCount: this.messageCount,
      capabilities: this.capabilities,
      remoteCapabilities: this.remoteCapabilities,
      phaseLock: this.phaseLock.getInfo()
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.phaseLock.destroy();
    this.pendingRequests.clear();
  }
}

/**
 * Zero Bridge
 *
 * Central message router connecting the orchestrator to multiple agents.
 *
 * Events:
 * - agentConnected: Agent completed handshake (agentId)
 * - agentDisconnected: Agent disconnected (agentId)
 * - message: Message received from agent (message, agentId)
 * - broadcast: Broadcast message received (message, agentId)
 * - error: Bridge or connection error (error, agentId?)
 */
class ZeroBridge extends EventEmitter {
  /**
   * Create a zero bridge
   *
   * @param {Object} options - Bridge options
   * @param {string} [options.sessionId] - Session identifier
   * @param {string} [options.orchestratorId] - Orchestrator identifier
   * @param {Object} [options.capabilities] - Orchestrator capabilities to advertise
   */
  constructor(options = {}) {
    super();
    this.sessionId = options.sessionId || `zero-${Date.now()}`;
    this.orchestratorId = options.orchestratorId || `zero-${process.pid}`;
    this.capabilities = options.capabilities || {
      mcp: true,
      streaming: true,
      multiAgent: true
    };

    this.transport = new SocketTransport({ sessionId: this.sessionId });
    this.agents = new Map(); // agentId -> AgentConnection
    this.requestId = 0;

    this._setupTransportHandlers();
  }

  /**
   * Set up transport event handlers
   * @private
   */
  _setupTransportHandlers() {
    this.transport.on('connection', (socketConnection) => {
      // Connection established but not yet identified
      // Wait for agent to identify via handshake
    });

    this.transport.on('message', (message, socketConnection) => {
      this._handleMessage(message, socketConnection);
    });

    this.transport.on('disconnect', (agentId) => {
      this._handleDisconnect(agentId);
    });

    this.transport.on('error', (error) => {
      this.emit('error', error);
    });
  }

  /**
   * Handle incoming message
   *
   * @param {Object} message - Message object
   * @param {Object} socketConnection - Socket connection
   * @private
   */
  _handleMessage(message, socketConnection) {
    const agentId = socketConnection.agentId;

    // Handle phase-lock messages
    if (message.type && message.type.startsWith('phase.')) {
      this._handlePhaseLockMessage(message, socketConnection);
      return;
    }

    // Handle bridge messages
    if (message.type && message.type.startsWith('bridge.')) {
      this._handleBridgeMessage(message, agentId);
      return;
    }

    // Handle JSON-RPC messages
    if (message.jsonrpc === '2.0') {
      this._handleJsonRpcMessage(message, agentId);
      return;
    }

    // Unknown message format
    this.emit('message', message, agentId);
  }

  /**
   * Handle phase-lock protocol messages
   *
   * @param {Object} message - Phase-lock message
   * @param {Object} socketConnection - Socket connection
   * @private
   */
  _handlePhaseLockMessage(message, socketConnection) {
    // Extract agent ID from message
    const agentId = message.payload?.agentId;

    if (!agentId) {
      this.emit('error', new Error('Phase-lock message missing agentId'));
      return;
    }

    // Get or create agent connection
    let agentConn = this.agents.get(agentId);
    if (!agentConn) {
      agentConn = new AgentConnection({
        agentId,
        orchestratorId: this.orchestratorId,
        capabilities: this.capabilities
      });
      this.agents.set(agentId, agentConn);
    }

    // Associate socket with agent
    agentConn.socketConnection = socketConnection;
    socketConnection.agentId = agentId;

    // Process handshake
    const response = agentConn.processHandshake(message);
    if (response) {
      socketConnection.send(response);
    }

    // Check if handshake completed
    if (agentConn.isConnected) {
      this.emit('agentConnected', agentId);
    }
  }

  /**
   * Handle bridge-specific messages
   *
   * @param {Object} message - Bridge message
   * @param {string} agentId - Source agent ID
   * @private
   */
  _handleBridgeMessage(message, agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.recordActivity();

    switch (message.type) {
      case BridgeMessage.BROADCAST:
        // Re-broadcast to all other agents
        this._rebroadcast(message.payload, agentId);
        this.emit('broadcast', message.payload, agentId);
        break;

      case BridgeMessage.DIRECT:
        // Route to specific agent
        const targetId = message.target;
        if (targetId && this.agents.has(targetId)) {
          this.send(targetId, message.payload);
        }
        break;

      case BridgeMessage.QUERY:
        this.emit('query', message.payload, agentId, message.id);
        break;

      case BridgeMessage.RESPONSE:
        // Handle response to pending request
        const pending = agent.pendingRequests.get(message.id);
        if (pending) {
          pending.resolve(message.payload);
          agent.pendingRequests.delete(message.id);
        }
        break;

      default:
        this.emit('message', message, agentId);
    }
  }

  /**
   * Handle JSON-RPC messages
   *
   * @param {Object} message - JSON-RPC message
   * @param {string} agentId - Source agent ID
   * @private
   */
  _handleJsonRpcMessage(message, agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.recordActivity();
    }

    // Emit for external handling
    this.emit('jsonrpc', message, agentId);
    this.emit('message', message, agentId);
  }

  /**
   * Handle agent disconnection
   *
   * @param {string} agentId - Disconnected agent ID
   * @private
   */
  _handleDisconnect(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.state = AgentState.DISCONNECTED;
      agent.destroy();
      this.agents.delete(agentId);
      this.emit('agentDisconnected', agentId);
    }
  }

  /**
   * Re-broadcast message to all agents except source
   *
   * @param {Object} payload - Message payload
   * @param {string} excludeAgentId - Agent to exclude
   * @private
   */
  _rebroadcast(payload, excludeAgentId) {
    for (const [agentId, agent] of this.agents) {
      if (agentId !== excludeAgentId && agent.isConnected) {
        this.send(agentId, {
          type: BridgeMessage.BROADCAST,
          source: excludeAgentId,
          payload
        });
      }
    }
  }

  /**
   * Prepare socket for an agent (before spawning)
   *
   * @param {string} agentId - Agent identifier
   * @returns {Promise<string>} Socket path
   */
  async prepareAgent(agentId) {
    // Create socket for agent
    const socketPath = await this.transport.createSocket(agentId);

    // Create agent connection wrapper
    const agentConn = new AgentConnection({
      agentId,
      orchestratorId: this.orchestratorId,
      capabilities: this.capabilities
    });
    this.agents.set(agentId, agentConn);

    return socketPath;
  }

  /**
   * Send message to a specific agent
   *
   * @param {string} agentId - Target agent
   * @param {Object} message - Message to send
   * @returns {boolean} True if sent
   */
  send(agentId, message) {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.isConnected) {
      return false;
    }
    return this.transport.send(agentId, message);
  }

  /**
   * Broadcast message to all connected agents
   *
   * @param {Object} message - Message to broadcast
   * @returns {number} Number of agents sent to
   */
  broadcast(message) {
    const wrapped = {
      type: BridgeMessage.BROADCAST,
      source: this.orchestratorId,
      payload: message,
      timestamp: Date.now()
    };

    let count = 0;
    for (const [agentId, agent] of this.agents) {
      if (agent.isConnected) {
        if (this.transport.send(agentId, wrapped)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Send a request to an agent and wait for response
   *
   * @param {string} agentId - Target agent
   * @param {Object} payload - Request payload
   * @param {number} [timeout=30000] - Response timeout
   * @returns {Promise<Object>} Response payload
   */
  async request(agentId, payload, timeout = 30000) {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.isConnected) {
      throw new Error(`Agent not connected: ${agentId}`);
    }

    const id = `req-${++this.requestId}`;

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        agent.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${agentId}`));
      }, timeout);

      agent.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeoutHandle);
          resolve(result);
        },
        reject
      });

      this.send(agentId, {
        type: BridgeMessage.QUERY,
        id,
        payload
      });
    });
  }

  /**
   * Respond to a query from an agent
   *
   * @param {string} agentId - Target agent
   * @param {string} requestId - Original request ID
   * @param {Object} payload - Response payload
   * @returns {boolean} True if sent
   */
  respond(agentId, requestId, payload) {
    return this.send(agentId, {
      type: BridgeMessage.RESPONSE,
      id: requestId,
      payload
    });
  }

  /**
   * Get list of connected agent IDs
   *
   * @returns {Array<string>}
   */
  getConnectedAgents() {
    return Array.from(this.agents.entries())
      .filter(([_, agent]) => agent.isConnected)
      .map(([agentId]) => agentId);
  }

  /**
   * Get agent connection info
   *
   * @param {string} agentId - Agent identifier
   * @returns {Object|null} Connection info or null
   */
  getAgentInfo(agentId) {
    const agent = this.agents.get(agentId);
    return agent ? agent.getInfo() : null;
  }

  /**
   * Check if agent is connected
   *
   * @param {string} agentId - Agent identifier
   * @returns {boolean}
   */
  isAgentConnected(agentId) {
    const agent = this.agents.get(agentId);
    return agent?.isConnected ?? false;
  }

  /**
   * Disconnect a specific agent
   *
   * @param {string} agentId - Agent to disconnect
   */
  disconnectAgent(agentId) {
    this.transport.disconnect(agentId);
  }

  /**
   * Get bridge statistics
   *
   * @returns {Object}
   */
  getStats() {
    const agentStats = {};
    for (const [agentId, agent] of this.agents) {
      agentStats[agentId] = agent.getInfo();
    }

    return {
      sessionId: this.sessionId,
      orchestratorId: this.orchestratorId,
      connectedAgents: this.getConnectedAgents(),
      totalAgents: this.agents.size,
      transport: this.transport.getStats(),
      agents: agentStats
    };
  }

  /**
   * Close bridge and all connections
   *
   * @returns {Promise<void>}
   */
  async close() {
    // Notify agents of shutdown
    this.broadcast({
      type: BridgeMessage.SYSTEM,
      event: 'shutdown',
      timestamp: Date.now()
    });

    // Destroy all agent connections
    for (const agent of this.agents.values()) {
      agent.destroy();
    }
    this.agents.clear();

    // Close transport
    await this.transport.close();

    this.emit('close');
  }
}

module.exports = {
  ZeroBridge,
  AgentConnection,
  AgentState,
  BridgeMessage
};
