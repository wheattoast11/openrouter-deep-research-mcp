/**
 * Heartbeat Monitor
 *
 * Monitors agent liveness through periodic heartbeat checks.
 * Provides early warning for stalled or dead agents in the orchestration system.
 *
 * @module core/heartbeat
 */

'use strict';

const { EventEmitter } = require('events');

/**
 * Agent status states
 */
const AgentStatus = {
  ALIVE: 'alive',
  TIMEOUT: 'timeout',
  DEAD: 'dead',
  UNKNOWN: 'unknown'
};

/**
 * Heartbeat configuration defaults
 */
const DEFAULTS = {
  interval: 5000,      // 5 seconds between heartbeat checks
  timeout: 15000,      // 15 seconds before marking as timeout
  deadThreshold: 3,    // 3 consecutive timeouts before marking as dead
  maxAgents: 100       // Maximum number of agents to track
};

/**
 * Agent heartbeat entry
 */
class AgentHeartbeat {
  constructor(agentId, connection) {
    this.agentId = agentId;
    this.connection = connection;
    this.lastHeartbeat = Date.now();
    this.status = AgentStatus.ALIVE;
    this.consecutiveTimeouts = 0;
    this.totalHeartbeats = 0;
    this.totalTimeouts = 0;
    this.registeredAt = Date.now();
    this.metadata = {};
  }

  /**
   * Record a successful heartbeat
   */
  recordHeartbeat() {
    this.lastHeartbeat = Date.now();
    this.status = AgentStatus.ALIVE;
    this.consecutiveTimeouts = 0;
    this.totalHeartbeats++;
  }

  /**
   * Record a timeout
   *
   * @returns {boolean} True if agent should be marked as dead
   */
  recordTimeout(deadThreshold) {
    this.consecutiveTimeouts++;
    this.totalTimeouts++;

    if (this.consecutiveTimeouts >= deadThreshold) {
      this.status = AgentStatus.DEAD;
      return true;
    }

    this.status = AgentStatus.TIMEOUT;
    return false;
  }

  /**
   * Get agent stats
   *
   * @returns {Object}
   */
  getStats() {
    return {
      agentId: this.agentId,
      status: this.status,
      lastHeartbeat: this.lastHeartbeat,
      timeSinceLastHeartbeat: Date.now() - this.lastHeartbeat,
      consecutiveTimeouts: this.consecutiveTimeouts,
      totalHeartbeats: this.totalHeartbeats,
      totalTimeouts: this.totalTimeouts,
      uptime: Date.now() - this.registeredAt,
      successRate: this.totalHeartbeats / (this.totalHeartbeats + this.totalTimeouts) || 0,
      metadata: this.metadata
    };
  }
}

/**
 * Heartbeat Monitor
 *
 * Monitors agent liveness and emits events on status changes.
 */
class HeartbeatMonitor extends EventEmitter {
  /**
   * Create a heartbeat monitor
   *
   * @param {Object} options
   * @param {number} [options.interval=5000] - Heartbeat check interval in ms
   * @param {number} [options.timeout=15000] - Timeout threshold in ms
   * @param {number} [options.deadThreshold=3] - Consecutive timeouts before marking as dead
   * @param {number} [options.maxAgents=100] - Maximum agents to track
   * @param {Object} [options.logger] - Optional logger
   */
  constructor(options = {}) {
    super();

    this.interval = options.interval || DEFAULTS.interval;
    this.timeout = options.timeout || DEFAULTS.timeout;
    this.deadThreshold = options.deadThreshold || DEFAULTS.deadThreshold;
    this.maxAgents = options.maxAgents || DEFAULTS.maxAgents;
    this.logger = options.logger || console;

    // Agent registry
    this.agents = new Map();

    // Monitor state
    this.running = false;
    this.intervalId = null;
    this.checkCount = 0;
  }

  /**
   * Register an agent for monitoring
   *
   * @param {string} agentId - Unique agent identifier
   * @param {Object} connection - Agent connection object (must have ping() method)
   * @param {Object} [metadata] - Optional metadata
   * @returns {AgentHeartbeat}
   */
  register(agentId, connection, metadata = {}) {
    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Maximum agent limit (${this.maxAgents}) reached`);
    }

    if (!connection || typeof connection.ping !== 'function') {
      throw new Error('Connection must have a ping() method');
    }

    const heartbeat = new AgentHeartbeat(agentId, connection);
    heartbeat.metadata = metadata;

    this.agents.set(agentId, heartbeat);
    this.emit('agent-registered', { agentId, metadata });

    this.logger.info?.('Agent registered for heartbeat monitoring', { agentId });
    return heartbeat;
  }

  /**
   * Unregister an agent
   *
   * @param {string} agentId
   * @returns {boolean}
   */
  unregister(agentId) {
    const removed = this.agents.delete(agentId);
    if (removed) {
      this.emit('agent-unregistered', { agentId });
      this.logger.info?.('Agent unregistered from heartbeat monitoring', { agentId });
    }
    return removed;
  }

  /**
   * Record a heartbeat for an agent
   *
   * @param {string} agentId
   */
  heartbeat(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      const wasTimeout = agent.status === AgentStatus.TIMEOUT;
      agent.recordHeartbeat();

      if (wasTimeout) {
        this.emit('agent-recovered', { agentId, stats: agent.getStats() });
      }
    }
  }

  /**
   * Check all registered agents
   *
   * @returns {Promise<Object>}
   */
  async checkAll() {
    this.checkCount++;
    const results = {
      checkId: this.checkCount,
      timestamp: Date.now(),
      alive: [],
      timeout: [],
      dead: [],
      errors: []
    };

    const checkPromises = Array.from(this.agents.entries()).map(
      async ([agentId, agent]) => {
        try {
          const startTime = Date.now();
          const success = await this._checkAgent(agent);
          const duration = Date.now() - startTime;

          if (success) {
            agent.recordHeartbeat();
            results.alive.push({ agentId, duration });
          } else {
            const isDead = agent.recordTimeout(this.deadThreshold);

            if (isDead) {
              results.dead.push({ agentId, stats: agent.getStats() });
              this.emit('agent-dead', { agentId, stats: agent.getStats() });
            } else {
              results.timeout.push({ agentId, stats: agent.getStats() });
              this.emit('agent-timeout', { agentId, stats: agent.getStats() });
            }
          }
        } catch (error) {
          results.errors.push({ agentId, error: error.message });

          // Treat errors as timeouts
          const isDead = agent.recordTimeout(this.deadThreshold);
          if (isDead) {
            this.emit('agent-dead', { agentId, error, stats: agent.getStats() });
          }
        }
      }
    );

    await Promise.all(checkPromises);

    this.emit('check-complete', results);
    return results;
  }

  /**
   * Check a single agent
   *
   * @private
   * @param {AgentHeartbeat} agent
   * @returns {Promise<boolean>}
   */
  async _checkAgent(agent) {
    let timeoutId;
    try {
      // Apply timeout to the ping
      const pingPromise = agent.connection.ping();
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Heartbeat timeout')), this.timeout);
      });

      const result = await Promise.race([pingPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result === true || result?.pong === true;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  }

  /**
   * Start the heartbeat monitor
   */
  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.intervalId = setInterval(() => {
      this.checkAll().catch(error => {
        this.logger.error?.('Heartbeat check failed', { error: error.message });
        this.emit('error', error);
      });
    }, this.interval);

    this.emit('started', { interval: this.interval, timeout: this.timeout });
    this.logger.info?.('Heartbeat monitor started', { interval: this.interval });
  }

  /**
   * Stop the heartbeat monitor
   */
  stop() {
    if (!this.running) {
      return;
    }

    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.emit('stopped', { checkCount: this.checkCount });
    this.logger.info?.('Heartbeat monitor stopped');
  }

  /**
   * Get all agent stats
   *
   * @returns {Array<Object>}
   */
  getAllStats() {
    return Array.from(this.agents.values()).map(agent => agent.getStats());
  }

  /**
   * Get agent stats by ID
   *
   * @param {string} agentId
   * @returns {Object|null}
   */
  getAgentStats(agentId) {
    const agent = this.agents.get(agentId);
    return agent ? agent.getStats() : null;
  }

  /**
   * Get monitor state
   *
   * @returns {Object}
   */
  getState() {
    const agents = this.getAllStats();
    return {
      running: this.running,
      interval: this.interval,
      timeout: this.timeout,
      deadThreshold: this.deadThreshold,
      checkCount: this.checkCount,
      agentCount: this.agents.size,
      aliveCount: agents.filter(a => a.status === AgentStatus.ALIVE).length,
      timeoutCount: agents.filter(a => a.status === AgentStatus.TIMEOUT).length,
      deadCount: agents.filter(a => a.status === AgentStatus.DEAD).length
    };
  }

  /**
   * Get dead agents
   *
   * @returns {Array<Object>}
   */
  getDeadAgents() {
    return Array.from(this.agents.values())
      .filter(agent => agent.status === AgentStatus.DEAD)
      .map(agent => agent.getStats());
  }

  /**
   * Cleanup and destroy the monitor
   */
  destroy() {
    this.stop();
    this.agents.clear();
    this.removeAllListeners();
  }
}

/**
 * Create a heartbeat monitor
 *
 * @param {Object} [options]
 * @returns {HeartbeatMonitor}
 */
function createHeartbeatMonitor(options = {}) {
  return new HeartbeatMonitor(options);
}

module.exports = {
  HeartbeatMonitor,
  AgentHeartbeat,
  AgentStatus,
  createHeartbeatMonitor,
  DEFAULTS
};
