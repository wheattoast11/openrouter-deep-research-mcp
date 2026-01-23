/**
 * Rail Tunnel: Agent-to-Agent Messaging
 *
 * Tunnels provide direct communication channels between agents,
 * bypassing the standard tool call flow for low-latency messaging.
 *
 * Implements MCP notification: notifications/rail.tunnel
 *
 * @module core/rail/tunnel
 */

'use strict';

const crypto = require('crypto');
const { Token, Rail, Ok, Err } = require('../rail');

/**
 * Tunnel notification payload
 * @typedef {Object} TunnelMessage
 * @property {string} tunnelId - Unique tunnel identifier
 * @property {string} source - Source agent identifier
 * @property {string} target - Target agent identifier
 * @property {Object} signal - Signal payload
 * @property {Object} routing - Routing hints
 */

/**
 * Tunnel - Named bidirectional channel between agents
 */
class Tunnel {
  /**
   * @param {string} source - Source agent ID
   * @param {string} target - Target agent ID
   * @param {object} [options]
   * @param {number} [options.ttl=60000] - Message TTL in ms
   * @param {boolean} [options.requireAck=false] - Require acknowledgment
   * @param {number} [options.priority=0] - Message priority (0-10)
   */
  constructor(source, target, options = {}) {
    this.id = crypto.randomUUID();
    this.source = source;
    this.target = target;
    this.ttl = options.ttl ?? 60000;
    this.requireAck = options.requireAck ?? false;
    this.priority = options.priority ?? 0;
    this._rail = Rail.create({ maxBuffer: 100 });
    this._pendingAcks = new Map();
    this._closed = false;
  }

  /**
   * Send a message through the tunnel
   * @param {object} signal - Signal to send
   * @returns {{ ok: true, value: string } | { ok: false, error: Error }}
   */
  send(signal) {
    if (this._closed) {
      return Err(new Error('Tunnel is closed'));
    }

    const token = Token.from({
      tunnelId: this.id,
      source: this.source,
      target: this.target,
      signal,
      routing: {
        priority: this.priority,
        ttl: this.ttl,
        requireAck: this.requireAck,
        sentAt: Date.now()
      }
    }, this.source);

    const result = this._rail.send(token);
    if (result.ok && this.requireAck) {
      this._pendingAcks.set(token.id, {
        token,
        timeout: setTimeout(() => {
          this._pendingAcks.delete(token.id);
        }, this.ttl)
      });
    }

    return result.ok ? Ok(token.id) : result;
  }

  /**
   * Receive messages from the tunnel
   * @returns {AsyncIterator<TunnelMessage>}
   */
  receive() {
    return this._rail.receive();
  }

  /**
   * Acknowledge receipt of a message
   * @param {string} tokenId - Token ID to acknowledge
   */
  ack(tokenId) {
    const pending = this._pendingAcks.get(tokenId);
    if (pending) {
      clearTimeout(pending.timeout);
      this._pendingAcks.delete(tokenId);
    }
  }

  /**
   * Close the tunnel
   */
  async close() {
    this._closed = true;
    for (const { timeout } of this._pendingAcks.values()) {
      clearTimeout(timeout);
    }
    this._pendingAcks.clear();
    await this._rail.close();
  }

  /**
   * Get tunnel statistics
   */
  get stats() {
    return {
      ...this._rail.stats,
      pendingAcks: this._pendingAcks.size
    };
  }
}

/**
 * TunnelRegistry - Manages active tunnels
 */
class TunnelRegistry {
  constructor() {
    this._tunnels = new Map();
  }

  /**
   * Create or get existing tunnel between agents
   * @param {string} source - Source agent ID
   * @param {string} target - Target agent ID
   * @param {object} [options] - Tunnel options
   * @returns {Tunnel}
   */
  connect(source, target, options = {}) {
    const key = `${source}:${target}`;
    if (!this._tunnels.has(key)) {
      this._tunnels.set(key, new Tunnel(source, target, options));
    }
    return this._tunnels.get(key);
  }

  /**
   * Get tunnel by ID
   * @param {string} tunnelId
   * @returns {Tunnel|null}
   */
  get(tunnelId) {
    for (const tunnel of this._tunnels.values()) {
      if (tunnel.id === tunnelId) return tunnel;
    }
    return null;
  }

  /**
   * Disconnect tunnel
   * @param {string} source
   * @param {string} target
   */
  async disconnect(source, target) {
    const key = `${source}:${target}`;
    const tunnel = this._tunnels.get(key);
    if (tunnel) {
      await tunnel.close();
      this._tunnels.delete(key);
    }
  }

  /**
   * List all active tunnels
   * @returns {Array<{id: string, source: string, target: string}>}
   */
  list() {
    return Array.from(this._tunnels.values()).map(t => ({
      id: t.id,
      source: t.source,
      target: t.target,
      stats: t.stats
    }));
  }

  /**
   * Close all tunnels
   */
  async closeAll() {
    await Promise.all(
      Array.from(this._tunnels.values()).map(t => t.close())
    );
    this._tunnels.clear();
  }
}

// Singleton registry
const registry = new TunnelRegistry();

module.exports = {
  Tunnel,
  TunnelRegistry,
  registry,
  // MCP notification name
  NOTIFICATION_TYPE: 'notifications/rail.tunnel'
};
