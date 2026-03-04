/**
 * Socket Client
 *
 * Client-side socket connection for agents connecting to orchestrator.
 * Features auto-discovery via ZERO_SOCKET env var, message queuing,
 * and reconnection with exponential backoff.
 *
 * @module core/transport/socketClient
 */

'use strict';

const net = require('net');
const { EventEmitter } = require('events');
const { encode, createDecoder } = require('./frameCodec');

/**
 * Client connection state
 */
const ClientState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting'
};

/**
 * Default reconnection configuration
 */
const DEFAULT_RECONNECT = {
  enabled: true,
  initialDelay: 100,
  maxDelay: 30000,
  factor: 2,
  maxAttempts: 10,
  jitter: 0.1
};

/**
 * Calculate next backoff delay with jitter
 *
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {Object} config - Reconnection config
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attempt, config) {
  const baseDelay = Math.min(
    config.initialDelay * Math.pow(config.factor, attempt),
    config.maxDelay
  );
  const jitter = baseDelay * config.jitter * (Math.random() * 2 - 1);
  return Math.round(baseDelay + jitter);
}

/**
 * Socket Client
 *
 * Connects to orchestrator's Unix domain socket with automatic
 * reconnection and message queuing during disconnection.
 *
 * Events:
 * - connect: Connected to server
 * - message: Message received (message)
 * - disconnect: Disconnected from server
 * - error: Connection error (error)
 * - reconnecting: Attempting reconnection (attempt, delay)
 * - queue: Message queued during disconnection (message, queueSize)
 */
class SocketClient extends EventEmitter {
  /**
   * Create a socket client
   *
   * @param {Object} options - Client options
   * @param {string} [options.socketPath] - Path to Unix socket (overrides ZERO_SOCKET)
   * @param {string} [options.agentId] - This agent's identifier
   * @param {Object} [options.reconnect] - Reconnection configuration
   * @param {number} [options.maxQueueSize] - Max messages to queue (default 1000)
   */
  constructor(options = {}) {
    super();
    this.socketPath = options.socketPath || process.env.ZERO_SOCKET || null;
    this.agentId = options.agentId || 'unknown';
    this.reconnectConfig = { ...DEFAULT_RECONNECT, ...options.reconnect };
    this.maxQueueSize = options.maxQueueSize || 1000;

    this.socket = null;
    this.decoder = null;
    this.state = ClientState.DISCONNECTED;
    this.reconnectAttempt = 0;
    this.reconnectTimeout = null;
    this.messageQueue = [];
    this.messageCount = 0;
    this.bytesReceived = 0;
    this.bytesSent = 0;
    this.connectedAt = null;
    this.lastError = null;
  }

  /**
   * Discover socket path from environment
   *
   * @returns {string|null} Socket path or null if not found
   */
  static discoverSocket() {
    return process.env.ZERO_SOCKET || null;
  }

  /**
   * Check if running in orchestrated environment
   *
   * @returns {boolean} True if ZERO_SOCKET is set
   */
  static isOrchestrated() {
    return !!process.env.ZERO_SOCKET;
  }

  /**
   * Connect to the orchestrator
   *
   * @param {string} [socketPath] - Override socket path
   * @returns {Promise<void>}
   */
  async connect(socketPath) {
    if (socketPath) {
      this.socketPath = socketPath;
    }

    if (!this.socketPath) {
      throw new Error('No socket path configured. Set ZERO_SOCKET env var or provide socketPath option.');
    }

    if (this.state === ClientState.CONNECTED) {
      return;
    }

    this.state = ClientState.CONNECTING;

    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ path: this.socketPath }, () => {
        this._onConnect();
        resolve();
      });

      this.socket.once('error', (err) => {
        if (this.state === ClientState.CONNECTING) {
          this.lastError = err;
          this.state = ClientState.DISCONNECTED;
          reject(err);
        }
      });

      this._setupSocketHandlers();
    });
  }

  /**
   * Set up socket event handlers
   * @private
   */
  _setupSocketHandlers() {
    this.decoder = createDecoder();

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

    this.socket.on('close', () => {
      this._onDisconnect();
    });

    this.socket.on('error', (err) => {
      this.lastError = err;
      this.emit('error', err);
    });

    this.socket.on('end', () => {
      // Server closed connection
    });
  }

  /**
   * Handle successful connection
   * @private
   */
  _onConnect() {
    this.state = ClientState.CONNECTED;
    this.reconnectAttempt = 0;
    this.connectedAt = Date.now();
    this.emit('connect');

    // Flush queued messages
    this._flushQueue();
  }

  /**
   * Handle disconnection
   * @private
   */
  _onDisconnect() {
    const wasConnected = this.state === ClientState.CONNECTED;
    this.state = ClientState.DISCONNECTED;
    this.socket = null;
    this.decoder = null;

    if (wasConnected) {
      this.emit('disconnect');
    }

    // Attempt reconnection if enabled
    if (this.reconnectConfig.enabled && !this._isClosing) {
      this._scheduleReconnect();
    }
  }

  /**
   * Schedule a reconnection attempt
   * @private
   */
  _scheduleReconnect() {
    if (this.reconnectAttempt >= this.reconnectConfig.maxAttempts) {
      this.emit('error', new Error(`Max reconnection attempts (${this.reconnectConfig.maxAttempts}) reached`));
      return;
    }

    const delay = calculateBackoff(this.reconnectAttempt, this.reconnectConfig);
    this.reconnectAttempt++;
    this.state = ClientState.RECONNECTING;

    this.emit('reconnecting', this.reconnectAttempt, delay);

    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect();
      } catch (err) {
        // Will retry via _onDisconnect
      }
    }, delay);
  }

  /**
   * Flush queued messages after reconnection
   * @private
   */
  _flushQueue() {
    while (this.messageQueue.length > 0 && this.state === ClientState.CONNECTED) {
      const message = this.messageQueue.shift();
      this._sendDirect(message);
    }
  }

  /**
   * Send a message directly (no queuing)
   *
   * @param {Object} message - Message to send
   * @returns {boolean} True if sent
   * @private
   */
  _sendDirect(message) {
    if (!this.socket || this.state !== ClientState.CONNECTED) {
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
   * Send a message (queues if disconnected)
   *
   * @param {Object} message - Message to send
   * @returns {boolean} True if sent or queued
   */
  send(message) {
    if (this.state === ClientState.CONNECTED) {
      return this._sendDirect(message);
    }

    // Queue message for when connected
    if (this.messageQueue.length < this.maxQueueSize) {
      this.messageQueue.push(message);
      this.emit('queue', message, this.messageQueue.length);
      return true;
    }

    // Queue full
    this.emit('error', new Error('Message queue full'));
    return false;
  }

  /**
   * Send a JSON-RPC request and wait for response
   *
   * @param {string} method - Method name
   * @param {Object} [params] - Method parameters
   * @param {number} [timeout] - Response timeout in ms (default 30000)
   * @returns {Promise<Object>} Response result
   */
  async request(method, params, timeout = 30000) {
    const id = `${this.agentId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          this.off('message', handler);
          clearTimeout(timeoutHandle);
        }
      };

      const timeoutHandle = setTimeout(() => {
        cleanup();
        reject(new Error(`Request timeout: ${method}`));
      }, timeout);

      const handler = (response) => {
        if (response.id !== id) return;

        cleanup();

        if (response.error) {
          const err = new Error(response.error.message);
          err.code = response.error.code;
          err.data = response.error.data;
          reject(err);
        } else {
          resolve(response.result);
        }
      };

      this.on('message', handler);
      this.send(message);
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected)
   *
   * @param {string} method - Method name
   * @param {Object} [params] - Method parameters
   * @returns {boolean} True if sent or queued
   */
  notify(method, params) {
    return this.send({
      jsonrpc: '2.0',
      method,
      params
    });
  }

  /**
   * Respond to a request
   *
   * @param {string|number} id - Request ID
   * @param {*} result - Result value
   * @returns {boolean} True if sent
   */
  respond(id, result) {
    return this.send({
      jsonrpc: '2.0',
      id,
      result
    });
  }

  /**
   * Send an error response
   *
   * @param {string|number} id - Request ID
   * @param {number} code - Error code
   * @param {string} message - Error message
   * @param {*} [data] - Additional error data
   * @returns {boolean} True if sent
   */
  respondError(id, code, message, data) {
    return this.send({
      jsonrpc: '2.0',
      id,
      error: { code, message, data }
    });
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  get isConnected() {
    return this.state === ClientState.CONNECTED;
  }

  /**
   * Get connection uptime in milliseconds
   * @returns {number}
   */
  get uptime() {
    return this.connectedAt ? Date.now() - this.connectedAt : 0;
  }

  /**
   * Get client statistics
   * @returns {Object}
   */
  getStats() {
    return {
      agentId: this.agentId,
      socketPath: this.socketPath,
      state: this.state,
      isConnected: this.isConnected,
      messageCount: this.messageCount,
      bytesReceived: this.bytesReceived,
      bytesSent: this.bytesSent,
      queuedMessages: this.messageQueue.length,
      reconnectAttempt: this.reconnectAttempt,
      uptime: this.uptime,
      lastError: this.lastError?.message
    };
  }

  /**
   * Disconnect and cleanup
   */
  close() {
    this._isClosing = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.state = ClientState.DISCONNECTED;
    this.decoder = null;
    this.messageQueue = [];
    this._isClosing = false;
  }
}

/**
 * Create a socket client with auto-discovery
 *
 * @param {Object} [options] - Client options
 * @returns {SocketClient}
 */
function createClient(options = {}) {
  return new SocketClient(options);
}

/**
 * Create a socket client and connect
 *
 * @param {Object} [options] - Client options
 * @returns {Promise<SocketClient>}
 */
async function connectClient(options = {}) {
  const client = new SocketClient(options);
  await client.connect();
  return client;
}

module.exports = {
  SocketClient,
  ClientState,
  createClient,
  connectClient,
  DEFAULT_RECONNECT,
  calculateBackoff
};
