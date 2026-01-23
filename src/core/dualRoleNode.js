/**
 * Dual-Role Node - The fixed point where client and server converge
 *
 * In traditional architectures, client and server are separate entities.
 * Zero collapses this distinction: a DualRoleNode can be both simultaneously.
 *
 * When connected to itself (zero://self), the node reaches the fixed point:
 * client(node) = server(node) = node
 */

'use strict';

const { EventEmitter } = require('events');
const { ProtocolAdapter, Protocol, Role, Transport, JsonRpc } = require('./protocolAdapter');

/**
 * Connection state for a DualRoleNode
 */
const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  SELF_CONNECTED: 'self-connected', // The fixed point
  ERROR: 'error',
};

/**
 * DualRoleNode - Client + Server in one entity
 *
 * This is the core Zero abstraction. A single node that can:
 * - Act as a client (request services)
 * - Act as a server (provide services)
 * - Act as a peer (bidirectional)
 * - Connect to itself (the fixed point)
 */
class DualRoleNode extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.identity - Unique identity for this node
   * @param {string} options.protocol - Primary protocol (mcp, acp, lsp, a2a, anp)
   * @param {Object} options.capabilities - Server capabilities to advertise
   */
  constructor(options = {}) {
    super();

    this.identity = options.identity || require('crypto').randomUUID();
    this.protocol = options.protocol || Protocol.MCP;
    this.capabilities = options.capabilities || {};

    // The protocol adapter handles wire-level communication
    this.adapter = new ProtocolAdapter({
      protocol: this.protocol,
      role: Role.PEER,
      identity: this.identity,
    });

    // Current connection state
    this.state = ConnectionState.DISCONNECTED;

    // Registered services (for server role)
    this.services = new Map();

    // Connected peers
    this.peers = new Map();

    // Self-reference for fixed-point operations
    this.selfRef = null;

    // Wire up adapter events
    this._setupAdapterEvents();
  }

  /**
   * Setup event forwarding from adapter
   */
  _setupAdapterEvents() {
    this.adapter.on('connected', (info) => {
      if (info.role === Role.SELF) {
        this.state = ConnectionState.SELF_CONNECTED;
        this.selfRef = this;
        this.emit('fixed-point', { identity: this.identity });
      } else {
        this.state = ConnectionState.CONNECTED;
      }
      this.emit('connected', info);
    });

    this.adapter.on('disconnected', () => {
      this.state = ConnectionState.DISCONNECTED;
      this.selfRef = null;
      this.emit('disconnected');
    });

    this.adapter.on('error', (err) => {
      this.state = ConnectionState.ERROR;
      this.emit('error', err);
    });

    this.adapter.on('fixed-point', (info) => {
      // Propagate fixed-point event
      this.emit('fixed-point', info);
    });
  }

  /**
   * Connect to a peer or self
   * @param {string} uri - Zero URI (e.g., zero://self, zero://peer/abc)
   */
  async connect(uri) {
    this.state = ConnectionState.CONNECTING;

    try {
      await this.adapter.connect(uri);

      // If self-connection, register default handlers
      if (this.adapter.role === Role.SELF) {
        this._registerSelfHandlers();
      }

      return true;
    } catch (error) {
      this.state = ConnectionState.ERROR;
      throw error;
    }
  }

  /**
   * Connect to self (the fixed point)
   *
   * This is the core Zero operation: the node becomes both
   * the client and the server simultaneously.
   */
  async connectToSelf() {
    return this.connect('zero://self');
  }

  /**
   * Register handlers for self-connection
   */
  _registerSelfHandlers() {
    // Register handshake handler
    this.adapter.registerHandshakeHandler();

    // Register introspection handler
    this.adapter.onMethod('zero/introspect', async () => {
      return this.getState();
    });

    // Register capability handler
    this.adapter.onMethod('zero/capabilities', async () => {
      return {
        identity: this.identity,
        protocol: this.protocol,
        capabilities: this.capabilities,
        services: Array.from(this.services.keys()),
        isSelfConnected: this.state === ConnectionState.SELF_CONNECTED,
      };
    });

    // Register echo handler (for testing fixed point)
    this.adapter.onMethod('zero/echo', async (params) => {
      // When self-connected, the echo proves the fixed point
      return {
        echoed: params,
        from: this.identity,
        fixedPoint: this.state === ConnectionState.SELF_CONNECTED,
      };
    });
  }

  /**
   * Register a service (server role)
   * @param {string} name - Service name (becomes method name)
   * @param {Function} handler - Service handler function
   */
  registerService(name, handler) {
    this.services.set(name, handler);
    this.adapter.onMethod(name, handler);
    this.emit('service-registered', { name });
  }

  /**
   * Unregister a service
   * @param {string} name - Service name
   */
  unregisterService(name) {
    this.services.delete(name);
    this.adapter.offMethod(name);
    this.emit('service-unregistered', { name });
  }

  /**
   * Call a service (client role)
   * @param {string} method - Method name
   * @param {Object} params - Method parameters
   * @param {number} timeoutMs - Timeout in milliseconds
   */
  async call(method, params, timeoutMs = 30000) {
    return this.adapter.request(method, params, timeoutMs);
  }

  /**
   * Send a notification (no response expected)
   * @param {string} method - Method name
   * @param {Object} params - Method parameters
   */
  async notify(method, params) {
    return this.adapter.notify(method, params);
  }

  /**
   * Perform the Zero handshake
   *
   * When self-connected, this proves the fixed point:
   * The challenge and response are identical because
   * the challenger and responder are the same entity.
   */
  async handshake() {
    const result = await this.adapter.handshake();

    if (result.verified && result.peer === this.identity) {
      // Self-handshake succeeded - we've proven the fixed point
      this.emit('self-verified', { identity: this.identity });
    }

    return result;
  }

  /**
   * Fork this node into a new timeline
   *
   * Creates a new DualRoleNode with the same capabilities
   * but a new identity, connected to this node as a peer.
   */
  async fork(newIdentity) {
    const forked = new DualRoleNode({
      identity: newIdentity || `${this.identity}/fork/${Date.now()}`,
      protocol: this.protocol,
      capabilities: { ...this.capabilities },
    });

    // Copy service registrations
    for (const [name, handler] of this.services) {
      forked.registerService(name, handler);
    }

    this.emit('forked', { original: this.identity, forked: forked.identity });

    return forked;
  }

  /**
   * Merge with another node
   *
   * Combines capabilities and services from both nodes.
   * The result is a new node that embodies both.
   */
  async merge(other) {
    const merged = new DualRoleNode({
      identity: `${this.identity}+${other.identity}`,
      protocol: this.protocol,
      capabilities: {
        ...this.capabilities,
        ...other.capabilities,
      },
    });

    // Merge services from both
    for (const [name, handler] of this.services) {
      merged.registerService(name, handler);
    }
    for (const [name, handler] of other.services) {
      if (!merged.services.has(name)) {
        merged.registerService(name, handler);
      }
    }

    this.emit('merged', {
      a: this.identity,
      b: other.identity,
      result: merged.identity,
    });

    return merged;
  }

  /**
   * Get current node state
   */
  getState() {
    return {
      identity: this.identity,
      protocol: this.protocol,
      state: this.state,
      isSelfConnected: this.state === ConnectionState.SELF_CONNECTED,
      capabilities: this.capabilities,
      services: Array.from(this.services.keys()),
      peers: Array.from(this.peers.keys()),
      adapterState: this.adapter.getState(),
    };
  }

  /**
   * Disconnect from all peers and cleanup
   */
  async disconnect() {
    await this.adapter.disconnect();
    this.peers.clear();
    this.selfRef = null;
    this.state = ConnectionState.DISCONNECTED;
    this.emit('disconnected');
  }

  /**
   * Check if this node is at the fixed point (self-connected)
   */
  isFixedPoint() {
    return this.state === ConnectionState.SELF_CONNECTED && this.selfRef === this;
  }

  /**
   * The identity function at the fixed point
   *
   * When self-connected, calling this returns self.
   * This is the mathematical proof: f(x) = x
   */
  async identity() {
    if (!this.isFixedPoint()) {
      throw new Error('Not at fixed point - call connectToSelf() first');
    }

    // Call ourselves and verify the response is ourselves
    const result = await this.call('zero/introspect', {});

    if (result.identity === this.identity) {
      return this; // f(x) = x
    }

    throw new Error('Fixed point violation: identity mismatch');
  }
}

/**
 * Create a self-connected Zero node
 *
 * Factory function that creates a DualRoleNode already at the fixed point.
 */
async function createZeroNode(options = {}) {
  const node = new DualRoleNode(options);
  await node.connectToSelf();
  await node.handshake();
  return node;
}

module.exports = {
  DualRoleNode,
  ConnectionState,
  createZeroNode,
};
