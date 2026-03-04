/**
 * Agent Bridge
 *
 * Maps SDK Agent patterns to ZeroAgent instances.
 * Provides bidirectional conversion between SDK agents and native agents.
 *
 * @module core/sdk/agentBridge
 */

'use strict';

const { EventEmitter } = require('events');
const { Signal, SignalType } = require('../signal');

/**
 * Agent capability flags
 */
const AgentCapability = {
  RESEARCH: 'research',
  SYNTHESIS: 'synthesis',
  ANALYSIS: 'analysis',
  PLANNING: 'planning',
  EXECUTION: 'execution',
  VERIFICATION: 'verification'
};

/**
 * Agent state
 */
const AgentState = {
  IDLE: 'idle',
  THINKING: 'thinking',
  EXECUTING: 'executing',
  WAITING: 'waiting',
  ERROR: 'error',
  COMPLETE: 'complete'
};

/**
 * Bridged Agent
 *
 * Wraps a ZeroAgent with SDK-compatible interface.
 */
class BridgedAgent {
  constructor(zeroAgent, sdkConfig = {}) {
    this.zeroAgent = zeroAgent;
    this.sdkConfig = sdkConfig;
    this.id = sdkConfig.id || zeroAgent?.id || `agent-${Date.now()}`;
    this.name = sdkConfig.name || zeroAgent?.name || 'unnamed';
    this.description = sdkConfig.description || '';
    this.capabilities = sdkConfig.capabilities || [AgentCapability.RESEARCH];
    this.state = AgentState.IDLE;
    this.history = [];
    this.created = Date.now();
  }

  /**
   * Execute a task (SDK-style)
   *
   * @param {string} input - Input text
   * @param {Object} [options] - Execution options
   * @returns {Promise<Object>}
   */
  async execute(input, options = {}) {
    this.state = AgentState.EXECUTING;
    const startTime = Date.now();

    try {
      // Create execution context
      const context = {
        input,
        options,
        agentId: this.id,
        capabilities: this.capabilities
      };

      // Route through ZeroAgent if available
      let result;
      if (this.zeroAgent?.execute) {
        result = await this.zeroAgent.execute(context);
      } else {
        // Fallback to SDK config handler
        if (this.sdkConfig.handler) {
          result = await this.sdkConfig.handler(input, options);
        } else {
          throw new Error('No execution handler available');
        }
      }

      // Record history
      this.history.push({
        type: 'execution',
        input,
        result,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      });

      this.state = AgentState.COMPLETE;
      return {
        success: true,
        result,
        agentId: this.id,
        duration: Date.now() - startTime
      };

    } catch (error) {
      this.state = AgentState.ERROR;
      this.history.push({
        type: 'error',
        input,
        error: error.message,
        timestamp: Date.now()
      });

      return {
        success: false,
        error: error.message,
        agentId: this.id,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Get agent state
   *
   * @returns {Object}
   */
  getState() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      capabilities: this.capabilities,
      state: this.state,
      historyLength: this.history.length,
      uptime: Date.now() - this.created
    };
  }

  /**
   * Reset agent state
   */
  reset() {
    this.state = AgentState.IDLE;
    this.history = [];
  }
}

/**
 * Agent Bridge
 *
 * Manages mappings between SDK agents and ZeroAgents.
 */
class AgentBridge extends EventEmitter {
  constructor(options = {}) {
    super();

    this.agents = new Map();
    this.templates = new Map();
    this.logger = options.logger || console;

    // Default agent templates
    this._registerDefaultTemplates();
  }

  /**
   * Create a bridged agent from SDK config
   *
   * @param {Object} sdkConfig - SDK agent configuration
   * @param {Object} [zeroAgent] - Optional ZeroAgent to wrap
   * @returns {BridgedAgent}
   */
  createAgent(sdkConfig, zeroAgent = null) {
    const agent = new BridgedAgent(zeroAgent, sdkConfig);
    this.agents.set(agent.id, agent);
    this.emit('agent-created', { agentId: agent.id, config: sdkConfig });
    return agent;
  }

  /**
   * Create agent from template
   *
   * @param {string} templateName - Template name
   * @param {Object} [overrides] - Config overrides
   * @returns {BridgedAgent}
   */
  createFromTemplate(templateName, overrides = {}) {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    const config = { ...template, ...overrides };
    return this.createAgent(config);
  }

  /**
   * Get agent by ID
   *
   * @param {string} agentId
   * @returns {BridgedAgent|null}
   */
  getAgent(agentId) {
    return this.agents.get(agentId) || null;
  }

  /**
   * Remove agent
   *
   * @param {string} agentId
   * @returns {boolean}
   */
  removeAgent(agentId) {
    const removed = this.agents.delete(agentId);
    if (removed) {
      this.emit('agent-removed', { agentId });
    }
    return removed;
  }

  /**
   * Register agent template
   *
   * @param {string} name - Template name
   * @param {Object} config - Template configuration
   */
  registerTemplate(name, config) {
    this.templates.set(name, config);
    this.emit('template-registered', { name });
  }

  /**
   * Get all agents
   *
   * @returns {Array<BridgedAgent>}
   */
  getAllAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by capability
   *
   * @param {string} capability
   * @returns {Array<BridgedAgent>}
   */
  getAgentsByCapability(capability) {
    return this.getAllAgents().filter(
      agent => agent.capabilities.includes(capability)
    );
  }

  /**
   * Create Signal from agent output
   *
   * @param {BridgedAgent} agent
   * @param {Object} output
   * @returns {Signal}
   */
  toSignal(agent, output) {
    return Signal.response(output.result, agent.id, 1.0, {
      tags: ['agent', 'bridged', ...agent.capabilities],
      phase: 0
    });
  }

  /**
   * Register default templates
   *
   * @private
   */
  _registerDefaultTemplates() {
    this.registerTemplate('researcher', {
      name: 'Research Agent',
      description: 'Conducts deep research on topics',
      capabilities: [AgentCapability.RESEARCH, AgentCapability.ANALYSIS]
    });

    this.registerTemplate('synthesizer', {
      name: 'Synthesis Agent',
      description: 'Synthesizes multiple research results',
      capabilities: [AgentCapability.SYNTHESIS]
    });

    this.registerTemplate('planner', {
      name: 'Planning Agent',
      description: 'Creates execution plans for complex tasks',
      capabilities: [AgentCapability.PLANNING, AgentCapability.ANALYSIS]
    });

    this.registerTemplate('verifier', {
      name: 'Verification Agent',
      description: 'Verifies and validates results',
      capabilities: [AgentCapability.VERIFICATION]
    });
  }

  /**
   * Get bridge state
   *
   * @returns {Object}
   */
  getState() {
    return {
      agentCount: this.agents.size,
      templateCount: this.templates.size,
      agents: this.getAllAgents().map(a => a.getState())
    };
  }

  /**
   * Cleanup all agents
   */
  destroy() {
    this.agents.clear();
    this.removeAllListeners();
  }
}

/**
 * Create an agent bridge
 *
 * @param {Object} [options]
 * @returns {AgentBridge}
 */
function createAgentBridge(options = {}) {
  return new AgentBridge(options);
}

module.exports = {
  AgentBridge,
  BridgedAgent,
  createAgentBridge,
  AgentCapability,
  AgentState,
  available: true
};
