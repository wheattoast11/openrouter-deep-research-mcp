/**
 * Agent Spawner
 *
 * Spawns agent processes in tmux panes with proper environment setup.
 * Handles lifecycle management and connection coordination.
 *
 * @module cli/orchestrator/agents/spawner
 */

'use strict';

const { spawn, execSync } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');
const { getAgent, buildAgentCommand } = require('./registry');
const { queryCapabilities, validateAgentForOrchestrator } = require('./capability');
const { Pane, createPane, PaneState } = require('../core/pane');

/**
 * Spawn state
 */
const SpawnState = {
  PENDING: 'pending',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  FAILED: 'failed'
};

/**
 * Agent process wrapper
 *
 * Tracks a spawned agent's process and pane.
 */
class AgentProcess extends EventEmitter {
  /**
   * Create agent process wrapper
   *
   * @param {Object} options - Process options
   * @param {string} options.agentId - Agent identifier
   * @param {Pane} options.pane - Associated tmux pane
   * @param {string} options.socketPath - Socket path for communication
   */
  constructor(options) {
    super();
    this.agentId = options.agentId;
    this.pane = options.pane;
    this.socketPath = options.socketPath;
    this.state = SpawnState.PENDING;
    this.startedAt = null;
    this.stoppedAt = null;
    this.exitCode = null;
    this.error = null;
    this.restartCount = 0;
    this.maxRestarts = 3;
  }

  /**
   * Get process info
   * @returns {Object}
   */
  getInfo() {
    const paneInfo = this.pane?.getInfo() || {};
    return {
      agentId: this.agentId,
      state: this.state,
      socketPath: this.socketPath,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
      exitCode: this.exitCode,
      error: this.error,
      restartCount: this.restartCount,
      pane: paneInfo
    };
  }

  /**
   * Check if process can be restarted
   * @returns {boolean}
   */
  canRestart() {
    return this.restartCount < this.maxRestarts;
  }
}

/**
 * Agent Spawner
 *
 * Manages spawning and lifecycle of agent processes.
 *
 * Events:
 * - spawned: Agent process started (agentId)
 * - connected: Agent connected to bridge (agentId)
 * - stopped: Agent process stopped (agentId, exitCode)
 * - error: Spawn error (agentId, error)
 * - restart: Agent restarting (agentId, attempt)
 */
class AgentSpawner extends EventEmitter {
  /**
   * Create agent spawner
   *
   * @param {Object} options - Spawner options
   * @param {Object} options.bridge - ZeroBridge instance
   * @param {string} options.sessionName - tmux session name
   * @param {string} [options.workDir] - Working directory
   * @param {boolean} [options.autoRestart] - Enable auto-restart
   */
  constructor(options) {
    super();
    this.bridge = options.bridge;
    this.sessionName = options.sessionName;
    this.workDir = options.workDir || process.cwd();
    this.autoRestart = options.autoRestart ?? true;
    this.processes = new Map(); // agentId -> AgentProcess
    this.connectionTimeout = 30000; // 30s connection timeout
  }

  /**
   * Spawn an agent in a pane
   *
   * @param {string} agentId - Agent identifier
   * @param {Pane} pane - Target pane
   * @param {Object} [options] - Spawn options
   * @param {Array<string>} [options.extraArgs] - Additional CLI arguments
   * @param {Object} [options.env] - Additional environment variables
   * @param {string} [options.prompt] - Initial prompt to send
   * @returns {Promise<AgentProcess>}
   */
  async spawnAgent(agentId, pane, options = {}) {
    // Validate agent
    const validation = await validateAgentForOrchestrator(agentId);
    if (!validation.valid) {
      const error = new Error(`Cannot spawn agent: ${validation.errors.join(', ')}`);
      this.emit('error', agentId, error);
      throw error;
    }

    // Get agent definition
    const agent = getAgent(agentId);
    const cmdInfo = buildAgentCommand(agentId, { extraArgs: options.extraArgs });

    if (!cmdInfo) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    // Prepare socket for agent
    const socketPath = await this.bridge.prepareAgent(agentId);

    // Create process wrapper
    const agentProcess = new AgentProcess({
      agentId,
      pane,
      socketPath
    });
    this.processes.set(agentId, agentProcess);

    // Build environment
    const env = {
      ZERO_SOCKET: socketPath,
      ZERO_SESSION: this.bridge.sessionId,
      ZERO_AGENT_ID: agentId,
      ...options.env
    };

    // Build full command
    const fullCommand = [cmdInfo.command, ...cmdInfo.args].join(' ');

    // Update state
    agentProcess.state = SpawnState.STARTING;
    pane.agentId = agentId;

    // Set pane title
    pane.setTitle(agent.name);

    // Run command in pane
    pane.run(fullCommand, env);
    agentProcess.startedAt = Date.now();
    agentProcess.state = SpawnState.RUNNING;

    this.emit('spawned', agentId);

    // Wait for connection with timeout
    try {
      await this._waitForConnection(agentId);
      this.emit('connected', agentId);
    } catch (err) {
      agentProcess.state = SpawnState.FAILED;
      agentProcess.error = err.message;
      this.emit('error', agentId, err);
      throw err;
    }

    // Send initial prompt if provided
    if (options.prompt) {
      setTimeout(() => {
        pane.send(options.prompt);
      }, 500);
    }

    return agentProcess;
  }

  /**
   * Wait for agent to connect to bridge
   *
   * @param {string} agentId - Agent identifier
   * @returns {Promise<void>}
   * @private
   */
  _waitForConnection(agentId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.bridge.off('agentConnected', handler);
        reject(new Error(`Connection timeout for agent: ${agentId}`));
      }, this.connectionTimeout);

      const handler = (connectedId) => {
        if (connectedId === agentId) {
          clearTimeout(timeout);
          this.bridge.off('agentConnected', handler);
          resolve();
        }
      };

      // Check if already connected
      if (this.bridge.isAgentConnected(agentId)) {
        clearTimeout(timeout);
        resolve();
        return;
      }

      this.bridge.on('agentConnected', handler);
    });
  }

  /**
   * Stop an agent process
   *
   * @param {string} agentId - Agent identifier
   * @param {Object} [options] - Stop options
   * @param {boolean} [options.graceful] - Send quit command first
   * @param {number} [options.timeout] - Graceful shutdown timeout
   * @returns {Promise<void>}
   */
  async stopAgent(agentId, options = {}) {
    const agentProcess = this.processes.get(agentId);
    if (!agentProcess) {
      return;
    }

    agentProcess.state = SpawnState.STOPPING;

    // Try graceful shutdown
    if (options.graceful !== false) {
      try {
        // Send exit command
        agentProcess.pane.send('/exit');

        // Wait for disconnect
        await new Promise((resolve) => {
          const timeout = setTimeout(resolve, options.timeout || 5000);
          const handler = (disconnectedId) => {
            if (disconnectedId === agentId) {
              clearTimeout(timeout);
              this.bridge.off('agentDisconnected', handler);
              resolve();
            }
          };
          this.bridge.on('agentDisconnected', handler);
        });
      } catch {
        // Fall through to force kill
      }
    }

    // Force kill if still running
    if (agentProcess.pane?.isAlive()) {
      agentProcess.pane.interrupt();
      await new Promise(resolve => setTimeout(resolve, 100));

      if (agentProcess.pane.isAlive()) {
        agentProcess.pane.kill();
      }
    }

    agentProcess.state = SpawnState.STOPPED;
    agentProcess.stoppedAt = Date.now();

    // Disconnect from bridge
    this.bridge.disconnectAgent(agentId);

    this.emit('stopped', agentId, agentProcess.exitCode);
  }

  /**
   * Restart an agent process
   *
   * @param {string} agentId - Agent identifier
   * @param {Object} [options] - Restart options
   * @returns {Promise<AgentProcess>}
   */
  async restartAgent(agentId, options = {}) {
    const agentProcess = this.processes.get(agentId);
    if (!agentProcess) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (!agentProcess.canRestart()) {
      throw new Error(`Max restarts exceeded for agent: ${agentId}`);
    }

    agentProcess.restartCount++;
    this.emit('restart', agentId, agentProcess.restartCount);

    // Stop current process
    await this.stopAgent(agentId, { graceful: true, timeout: 3000 });

    // Respawn with same pane
    return this.spawnAgent(agentId, agentProcess.pane, options);
  }

  /**
   * Send a prompt to an agent
   *
   * @param {string} agentId - Agent identifier
   * @param {string} prompt - Prompt text
   * @returns {boolean} True if sent
   */
  sendPrompt(agentId, prompt) {
    const agentProcess = this.processes.get(agentId);
    if (!agentProcess || agentProcess.state !== SpawnState.RUNNING) {
      return false;
    }

    agentProcess.pane.send(prompt);
    return true;
  }

  /**
   * Interrupt an agent (Ctrl+C)
   *
   * @param {string} agentId - Agent identifier
   */
  interrupt(agentId) {
    const agentProcess = this.processes.get(agentId);
    if (agentProcess?.pane) {
      agentProcess.pane.interrupt();
    }
  }

  /**
   * Get agent output from pane
   *
   * @param {string} agentId - Agent identifier
   * @param {Object} [options] - Output options
   * @returns {string} Captured output
   */
  getOutput(agentId, options = {}) {
    const agentProcess = this.processes.get(agentId);
    if (!agentProcess?.pane) {
      return '';
    }
    return agentProcess.pane.getOutput(options);
  }

  /**
   * Get agent process info
   *
   * @param {string} agentId - Agent identifier
   * @returns {Object|null}
   */
  getAgentInfo(agentId) {
    const agentProcess = this.processes.get(agentId);
    return agentProcess?.getInfo() || null;
  }

  /**
   * Get all spawned agent IDs
   *
   * @returns {Array<string>}
   */
  getSpawnedAgents() {
    return Array.from(this.processes.keys());
  }

  /**
   * Get running agent IDs
   *
   * @returns {Array<string>}
   */
  getRunningAgents() {
    return Array.from(this.processes.entries())
      .filter(([_, proc]) => proc.state === SpawnState.RUNNING)
      .map(([id]) => id);
  }

  /**
   * Get spawner statistics
   *
   * @returns {Object}
   */
  getStats() {
    const processes = {};
    for (const [agentId, proc] of this.processes) {
      processes[agentId] = proc.getInfo();
    }

    return {
      sessionName: this.sessionName,
      workDir: this.workDir,
      autoRestart: this.autoRestart,
      totalSpawned: this.processes.size,
      running: this.getRunningAgents().length,
      processes
    };
  }

  /**
   * Stop all agents and cleanup
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    const stopPromises = [];

    for (const agentId of this.processes.keys()) {
      stopPromises.push(
        this.stopAgent(agentId, { graceful: true, timeout: 3000 })
          .catch(() => {}) // Ignore errors during shutdown
      );
    }

    await Promise.all(stopPromises);
    this.processes.clear();
  }
}

module.exports = {
  AgentSpawner,
  AgentProcess,
  SpawnState
};
