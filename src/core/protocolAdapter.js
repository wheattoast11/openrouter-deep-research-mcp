/**
 * Protocol Adapter - Unified abstraction for MCP/ACP/LSP/A2A/ANP
 *
 * All protocols share JSON-RPC 2.0 at the wire level.
 * This adapter provides a common interface regardless of which protocol is in use.
 *
 * The key insight: MCP, LSP, ACP, A2A, ANP are all bidirectional.
 * The client/server distinction is arbitrary. Zero treats all nodes as peers.
 */

'use strict';

const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * Protocol types supported by Zero
 */
const Protocol = {
  MCP: 'mcp',       // Model Context Protocol (tools, resources, prompts)
  ACP: 'acp',       // Agent Client Protocol (editor integration)
  LSP: 'lsp',       // Language Server Protocol (language services)
  A2A: 'a2a',       // Agent-to-Agent Protocol (Google's task delegation)
  ANP: 'anp',       // Agent Network Protocol (decentralized mesh)
};

/**
 * Role modes for Zero nodes
 */
const Role = {
  CLIENT: 'client',   // Requests services from others
  SERVER: 'server',   // Provides services to others
  PEER: 'peer',       // Symmetric bidirectional
  SELF: 'self',       // Connected to self (the fixed point)
};

/**
 * Transport types
 */
const Transport = {
  STDIO: 'stdio',
  HTTP: 'http',
  WEBSOCKET: 'websocket',
  POSTMESSAGE: 'postmessage',
  BROADCAST: 'broadcast',
};

/**
 * JSON-RPC 2.0 message factory
 */
class JsonRpc {
  static request(method, params, id = null) {
    return {
      jsonrpc: '2.0',
      id: id ?? crypto.randomUUID(),
      method,
      params,
    };
  }

  static response(id, result) {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  static error(id, code, message, data = undefined) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
  }

  static notification(method, params) {
    return {
      jsonrpc: '2.0',
      method,
      params,
    };
  }

  static isRequest(message) {
    return message.jsonrpc === '2.0' && typeof message.method === 'string' && message.id !== undefined;
  }

  static isResponse(message) {
    return message.jsonrpc === '2.0' && (message.result !== undefined || message.error !== undefined);
  }

  static isNotification(message) {
    return message.jsonrpc === '2.0' && typeof message.method === 'string' && message.id === undefined;
  }
}

/**
 * Protocol Adapter - The unified interface
 *
 * This is the core abstraction that enables Zero to speak any protocol.
 */
class ProtocolAdapter extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.protocol - Protocol type (mcp, acp, lsp, a2a, anp)
   * @param {string} options.role - Initial role (client, server, peer, self)
   * @param {Object} options.transport - Transport adapter
   * @param {string} options.identity - Node identity (default: random UUID)
   */
  constructor(options = {}) {
    super();
    this.protocol = options.protocol || Protocol.MCP;
    this.role = options.role || Role.PEER;
    this.transport = options.transport || null;
    this.identity = options.identity || crypto.randomUUID();

    // Pending requests awaiting response
    this.pendingRequests = new Map();

    // Request handlers by method
    this.handlers = new Map();

    // Self-connection channel (for zero://self)
    this.selfChannel = null;

    // Connection state
    this.connected = false;
  }

  /**
   * Set the transport adapter
   */
  setTransport(transport) {
    this.transport = transport;

    // Wire up transport events
    if (transport.on) {
      transport.on('message', (msg) => this.handleMessage(msg));
      transport.on('error', (err) => this.emit('error', err));
      transport.on('close', () => {
        this.connected = false;
        this.emit('close');
      });
    }
  }

  /**
   * Connect to a peer via URI
   * @param {string} uri - Zero URI (e.g., zero://self, zero://peer/abc)
   */
  async connect(uri) {
    const parsed = this.parseZeroUri(uri);

    if (parsed.type === 'self') {
      return this.connectToSelf();
    }

    // Require transport for non-self connections
    if (!this.transport || !this.transport.connect) {
      throw new Error(`No transport configured for URI: ${uri}. Configure a transport before connecting to external peers.`);
    }

    await this.transport.connect(uri);
    this.connected = true;
    this.emit('connected', { uri, role: this.role });
    return true;
  }

  /**
   * Connect to self (the fixed point)
   *
   * This is the magic: when Zero connects to itself,
   * messages route back to the same instance.
   */
  async connectToSelf() {
    // Use BroadcastChannel if available (browser), otherwise in-memory queue
    if (typeof BroadcastChannel !== 'undefined') {
      this.selfChannel = new BroadcastChannel(`zero://self/${this.identity}`);
      this.selfChannel.onmessage = (event) => this.handleMessage(event.data);
    } else {
      // In-memory self-loop for Node.js
      this.selfChannel = {
        postMessage: (msg) => {
          // Use setImmediate to break synchronous recursion
          setImmediate(() => this.handleMessage(msg));
        },
        close: () => {},
      };
    }

    this.role = Role.SELF;
    this.connected = true;
    this.emit('connected', { uri: 'zero://self', role: Role.SELF });
    return true;
  }

  /**
   * Parse a zero:// URI
   */
  parseZeroUri(uri) {
    if (!uri.startsWith('zero://')) {
      throw new Error(`Invalid Zero URI: ${uri}`);
    }

    const path = uri.slice(7); // Remove 'zero://'
    const [type, ...rest] = path.split('/');

    return {
      type,
      id: rest.join('/') || null,
      raw: uri,
    };
  }

  /**
   * Send a message through the appropriate channel
   */
  async send(message) {
    if (this.role === Role.SELF && this.selfChannel) {
      this.selfChannel.postMessage(message);
      return;
    }

    if (this.transport && this.transport.send) {
      await this.transport.send(message);
      return;
    }

    throw new Error('No transport available');
  }

  /**
   * Send a request and await response
   */
  async request(method, params, timeoutMs = 30000) {
    const id = crypto.randomUUID();
    const message = JsonRpc.request(method, params, id);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.send(message).catch(reject);
    });
  }

  /**
   * Send a notification (no response expected)
   */
  async notify(method, params) {
    const message = JsonRpc.notification(method, params);
    return this.send(message);
  }

  /**
   * Handle incoming message
   */
  async handleMessage(message) {
    try {
      // Parse if string
      const msg = typeof message === 'string' ? JSON.parse(message) : message;

      if (JsonRpc.isResponse(msg)) {
        return this.handleResponse(msg);
      }

      if (JsonRpc.isRequest(msg)) {
        return this.handleRequest(msg);
      }

      if (JsonRpc.isNotification(msg)) {
        return this.handleNotification(msg);
      }

      this.emit('unknown', msg);
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Handle response to a pending request
   */
  handleResponse(message) {
    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      this.emit('orphan-response', message);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message));
    } else {
      pending.resolve(message.result);
    }
  }

  /**
   * Handle incoming request
   */
  async handleRequest(message) {
    const handler = this.handlers.get(message.method);

    if (!handler) {
      const error = JsonRpc.error(message.id, -32601, `Method not found: ${message.method}`);
      return this.send(error);
    }

    try {
      const result = await handler(message.params, { id: message.id, method: message.method });
      const response = JsonRpc.response(message.id, result);
      return this.send(response);
    } catch (error) {
      const errorResponse = JsonRpc.error(message.id, -32603, error.message);
      return this.send(errorResponse);
    }
  }

  /**
   * Handle notification (no response needed)
   */
  handleNotification(message) {
    const handler = this.handlers.get(message.method);
    if (handler) {
      handler(message.params, { method: message.method }).catch((err) =>
        this.emit('error', err)
      );
    }
    this.emit('notification', message);
  }

  /**
   * Register a method handler
   */
  onMethod(method, handler) {
    this.handlers.set(method, handler);
  }

  /**
   * Unregister a method handler
   */
  offMethod(method) {
    this.handlers.delete(method);
  }

  /**
   * Perform the Zero handshake (self-verifying proof)
   *
   * The lock IS the key at the fixed point.
   * When self === peer, the proof proves itself.
   */
  async handshake() {
    const nonce = crypto.randomBytes(32).toString('hex');
    const challenge = crypto
      .createHash('sha256')
      .update(nonce + this.identity)
      .digest('hex');

    // Send challenge
    const response = await this.request('zero/handshake', {
      challenge,
      identity: this.identity,
      protocol: this.protocol,
      role: this.role,
    });

    // Verify response
    const expectedProof = crypto
      .createHash('sha256')
      .update(challenge + response.identity)
      .digest('hex');

    if (response.proof !== expectedProof) {
      throw new Error('Handshake verification failed');
    }

    // If self-connection, both proofs are identical (fixed point)
    if (this.role === Role.SELF && response.identity === this.identity) {
      // proof(proof) = proof - the fixed point is reached
      this.emit('fixed-point', { identity: this.identity });
    }

    return {
      verified: true,
      peer: response.identity,
      protocol: response.protocol,
    };
  }

  /**
   * Handle handshake request
   */
  registerHandshakeHandler() {
    this.onMethod('zero/handshake', async (params) => {
      const proof = crypto
        .createHash('sha256')
        .update(params.challenge + this.identity)
        .digest('hex');

      return {
        proof,
        identity: this.identity,
        protocol: this.protocol,
        role: this.role,
      };
    });
  }

  /**
   * Disconnect
   */
  async disconnect() {
    if (this.selfChannel) {
      this.selfChannel.close();
      this.selfChannel = null;
    }

    if (this.transport && this.transport.disconnect) {
      await this.transport.disconnect();
    }

    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Disconnected'));
    }
    this.pendingRequests.clear();

    this.connected = false;
    this.emit('disconnected');
  }

  /**
   * Get current state
   */
  getState() {
    return {
      identity: this.identity,
      protocol: this.protocol,
      role: this.role,
      connected: this.connected,
      pendingRequests: this.pendingRequests.size,
      handlers: Array.from(this.handlers.keys()),
    };
  }
}

module.exports = {
  ProtocolAdapter,
  Protocol,
  Role,
  Transport,
  JsonRpc,
};
