/**
 * Socket Transport
 *
 * Unix domain socket server for agent communication.
 * Provides reliable, ordered message delivery using frame codec.
 *
 * Socket path convention:
 *   /tmp/zero/<session-id>/<agent-id>.sock
 *
 * @module core/transport/socketTransport
 */

'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { encode, createDecoder, validateJsonRpc } = require('./frameCodec');

/**
 * Default socket directory
 */
const SOCKET_BASE_DIR = '/tmp/zero';

/**
 * Connection state
 */
const ConnectionState = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTING: 'disconnecting',
  DISCONNECTED: 'disconnected'
};

/**
 * Ensure directory exists, creating parent directories if needed
 *
 * @param {string} dir - Directory path
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  }
}

/**
 * Remove socket file if it exists
 *
 * @param {string} socketPath - Path to socket file
 */
function cleanupSocket(socketPath) {
  try {
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  } catch (err) {
    // Ignore cleanup errors
  }
}

/**
 * Generate socket path for an agent
 *
 * @param {string} sessionId - Session identifier
 * @param {string} agentId - Agent identifier
 * @returns {string} Full socket path
 */
function getSocketPath(sessionId, agentId) {
  return path.join(SOCKET_BASE_DIR, sessionId, `${agentId}.sock`);
}

/**
 * Socket connection wrapper
 *
 * Wraps a net.Socket with message framing and event handling.
 */
class SocketConnection extends EventEmitter {
  /**
   * Create a socket connection wrapper
   *
   * @param {net.Socket} socket - Raw socket
   * @param {Object} options - Configuration options
   * @param {string} options.id - Connection ID
   * @param {string} [options.agentId] - Associated agent ID
   */
  constructor(socket, options = {}) {
    super();
    this.socket = socket;
    this.id = options.id || `conn-${Date.now()}`;
    this.agentId = options.agentId || null;
    this.state = ConnectionState.CONNECTED;
    this.decoder = createDecoder();
    this.messageCount = 0;
    this.bytesReceived = 0;
    this.bytesSent = 0;
    this.connectedAt = Date.now();

    this._setupSocketHandlers();
  }

  /**
   * Set up socket event handlers
   * @private
   */
  _setupSocketHandlers() {
    this.socket.on('data', (data) => {
      this.bytesReceived += data.length;

      try {
        const messages = this.decoder.push(data);
        for (const message of messages) {
          if (message._error) {
            this.emit('error', message._error);
            continue;
          }
          this.messageCount++;
          this.emit('message', message);
        }
      } catch (err) {
        this.emit('error', err);
      }
    });

    this.socket.on('close', (hadError) => {
      this.state = ConnectionState.DISCONNECTED;
      this.emit('close', hadError);
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });

    this.socket.on('end', () => {
      this.state = ConnectionState.DISCONNECTING;
      this.emit('end');
    });
  }

  /**
   * Send a message
   *
   * @param {Object} message - Message to send
   * @returns {boolean} True if write was accepted
   */
  send(message) {
    if (this.state !== ConnectionState.CONNECTED) {
      return false;
    }

    try {
      const frame = encode(message);
      this.bytesSent += frame.length;
      return this.socket.write(frame);
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  /**
   * Close the connection gracefully
   */
  close() {
    if (this.state === ConnectionState.CONNECTED) {
      this.state = ConnectionState.DISCONNECTING;
      this.socket.end();
    }
  }

  /**
   * Destroy the connection immediately
   */
  destroy() {
    this.state = ConnectionState.DISCONNECTED;
    this.socket.destroy();
  }

  /**
   * Get connection statistics
   * @returns {Object}
   */
  getStats() {
    return {
      id: this.id,
      agentId: this.agentId,
      state: this.state,
      messageCount: this.messageCount,
      bytesReceived: this.bytesReceived,
      bytesSent: this.bytesSent,
      connectedAt: this.connectedAt,
      uptime: Date.now() - this.connectedAt,
      bufferedBytes: this.decoder.bufferedBytes
    };
  }
}

/**
 * Socket Transport Server
 *
 * Manages a Unix domain socket server for agent connections.
 *
 * Events:
 * - connection: New agent connected (connection)
 * - message: Message received (message, connection)
 * - disconnect: Agent disconnected (agentId)
 * - error: Server or connection error (error)
 */
class SocketTransport extends EventEmitter {
  /**
   * Create a socket transport server
   *
   * @param {Object} options - Server options
   * @param {string} options.sessionId - Session identifier
   * @param {Function} [options.onConnection] - Connection handler
   * @param {Function} [options.onMessage] - Message handler
   */
  constructor(options = {}) {
    super();
    this.sessionId = options.sessionId || `session-${Date.now()}`;
    this.socketDir = path.join(SOCKET_BASE_DIR, this.sessionId);
    this.server = null;
    this.connections = new Map(); // agentId -> SocketConnection
    this.socketPaths = new Map(); // agentId -> socketPath
    this.started = false;

    if (options.onConnection) {
      this.on('connection', options.onConnection);
    }
    if (options.onMessage) {
      this.on('message', options.onMessage);
    }
  }

  /**
   * Create a listening socket for an agent
   *
   * @param {string} agentId - Agent identifier
   * @returns {Promise<string>} Socket path
   */
  async createSocket(agentId) {
    if (this.socketPaths.has(agentId)) {
      return this.socketPaths.get(agentId);
    }

    const socketPath = getSocketPath(this.sessionId, agentId);
    ensureDir(this.socketDir);
    cleanupSocket(socketPath);

    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        this._handleConnection(socket, agentId);
      });

      server.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      server.listen(socketPath, () => {
        // Set socket permissions (owner read/write only)
        try {
          fs.chmodSync(socketPath, 0o600);
        } catch (e) {
          // Ignore chmod errors on some platforms
        }

        this.socketPaths.set(agentId, socketPath);
        this.started = true;
        resolve(socketPath);
      });

      // Store server reference for cleanup
      if (!this.server) {
        this.server = new Map();
      }
      this.server.set(agentId, server);
    });
  }

  /**
   * Handle new socket connection
   *
   * @param {net.Socket} socket - Raw socket
   * @param {string} agentId - Agent identifier
   * @private
   */
  _handleConnection(socket, agentId) {
    const connection = new SocketConnection(socket, {
      id: `${agentId}-${Date.now()}`,
      agentId
    });

    // Handle existing connection
    const existing = this.connections.get(agentId);
    if (existing) {
      existing.destroy();
    }

    this.connections.set(agentId, connection);

    connection.on('message', (message) => {
      this.emit('message', message, connection);
    });

    connection.on('close', () => {
      if (this.connections.get(agentId) === connection) {
        this.connections.delete(agentId);
        this.emit('disconnect', agentId);
      }
    });

    connection.on('error', (err) => {
      this.emit('error', err);
    });

    this.emit('connection', connection);
  }

  /**
   * Send a message to a specific agent
   *
   * @param {string} agentId - Target agent
   * @param {Object} message - Message to send
   * @returns {boolean} True if sent
   */
  send(agentId, message) {
    const connection = this.connections.get(agentId);
    if (!connection) {
      return false;
    }
    return connection.send(message);
  }

  /**
   * Broadcast a message to all connected agents
   *
   * @param {Object} message - Message to broadcast
   * @returns {number} Number of agents sent to
   */
  broadcast(message) {
    let count = 0;
    for (const connection of this.connections.values()) {
      if (connection.send(message)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get connection for an agent
   *
   * @param {string} agentId - Agent identifier
   * @returns {SocketConnection|null}
   */
  getConnection(agentId) {
    return this.connections.get(agentId) || null;
  }

  /**
   * Get list of connected agent IDs
   *
   * @returns {Array<string>}
   */
  getConnectedAgents() {
    return Array.from(this.connections.keys());
  }

  /**
   * Check if an agent is connected
   *
   * @param {string} agentId - Agent identifier
   * @returns {boolean}
   */
  isConnected(agentId) {
    const conn = this.connections.get(agentId);
    return conn?.state === ConnectionState.CONNECTED;
  }

  /**
   * Disconnect a specific agent
   *
   * @param {string} agentId - Agent to disconnect
   */
  disconnect(agentId) {
    const connection = this.connections.get(agentId);
    if (connection) {
      connection.close();
    }
  }

  /**
   * Get socket path for an agent
   *
   * @param {string} agentId - Agent identifier
   * @returns {string|null}
   */
  getSocketPath(agentId) {
    return this.socketPaths.get(agentId) || null;
  }

  /**
   * Get transport statistics
   *
   * @returns {Object}
   */
  getStats() {
    const connectionStats = {};
    for (const [agentId, conn] of this.connections) {
      connectionStats[agentId] = conn.getStats();
    }

    return {
      sessionId: this.sessionId,
      socketDir: this.socketDir,
      started: this.started,
      connectedAgents: this.getConnectedAgents(),
      connectionCount: this.connections.size,
      socketCount: this.socketPaths.size,
      connections: connectionStats
    };
  }

  /**
   * Close all connections and cleanup
   *
   * @returns {Promise<void>}
   */
  async close() {
    // Close all connections
    for (const connection of this.connections.values()) {
      connection.destroy();
    }
    this.connections.clear();

    // Close all servers
    if (this.server instanceof Map) {
      for (const [agentId, server] of this.server) {
        await new Promise((resolve) => {
          server.close(resolve);
        });
        const socketPath = this.socketPaths.get(agentId);
        if (socketPath) {
          cleanupSocket(socketPath);
        }
      }
      this.server.clear();
    }
    this.socketPaths.clear();

    // Cleanup socket directory if empty
    try {
      const files = fs.readdirSync(this.socketDir);
      if (files.length === 0) {
        fs.rmdirSync(this.socketDir);
      }
    } catch (err) {
      // Ignore cleanup errors
    }

    this.started = false;
    this.emit('close');
  }
}

module.exports = {
  SocketTransport,
  SocketConnection,
  ConnectionState,
  getSocketPath,
  ensureDir,
  cleanupSocket,
  SOCKET_BASE_DIR
};
