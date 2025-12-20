/**
 * Commands Registry
 *
 * Defines and handles slash commands for the orchestrator.
 * Provides parsing, validation, and execution.
 *
 * @module cli/orchestrator/ui/commands
 */

'use strict';

const { EventEmitter } = require('events');
const { bold, dim, green, yellow, red, cyan } = require('../../lib/micro-term');
const { getAgentIds, getAgent } = require('../agents/registry');

/**
 * Command definitions
 */
const COMMANDS = {
  status: {
    name: 'status',
    aliases: ['s', 'st'],
    description: 'Show orchestrator and agent status',
    usage: '/status',
    handler: 'handleStatus'
  },

  focus: {
    name: 'focus',
    aliases: ['f'],
    description: 'Focus a specific agent pane',
    usage: '/focus <agent>',
    args: ['agent'],
    handler: 'handleFocus'
  },

  broadcast: {
    name: 'broadcast',
    aliases: ['bc', 'all'],
    description: 'Send prompt to all agents',
    usage: '/broadcast <message>',
    args: ['message'],
    handler: 'handleBroadcast'
  },

  send: {
    name: 'send',
    aliases: ['to'],
    description: 'Send prompt to specific agent',
    usage: '/send <agent> <message>',
    args: ['agent', 'message'],
    handler: 'handleSend'
  },

  consensus: {
    name: 'consensus',
    aliases: ['con', 'agree'],
    description: 'Query all agents and calculate consensus',
    usage: '/consensus <question>',
    args: ['question'],
    handler: 'handleConsensus'
  },

  disconnect: {
    name: 'disconnect',
    aliases: ['dc', 'kill'],
    description: 'Disconnect an agent',
    usage: '/disconnect <agent>',
    args: ['agent'],
    handler: 'handleDisconnect'
  },

  reconnect: {
    name: 'reconnect',
    aliases: ['rc', 'restart'],
    description: 'Reconnect/restart an agent',
    usage: '/reconnect <agent>',
    args: ['agent'],
    handler: 'handleReconnect'
  },

  layout: {
    name: 'layout',
    aliases: ['l'],
    description: 'Change pane layout',
    usage: '/layout <preset>',
    args: ['preset'],
    handler: 'handleLayout'
  },

  agents: {
    name: 'agents',
    aliases: ['list', 'ls'],
    description: 'List available and connected agents',
    usage: '/agents',
    handler: 'handleAgents'
  },

  spawn: {
    name: 'spawn',
    aliases: ['add', 'start'],
    description: 'Spawn a new agent',
    usage: '/spawn <agent>',
    args: ['agent'],
    handler: 'handleSpawn'
  },

  help: {
    name: 'help',
    aliases: ['h', '?'],
    description: 'Show command help',
    usage: '/help [command]',
    args: ['command'],
    optional: ['command'],
    handler: 'handleHelp'
  },

  quit: {
    name: 'quit',
    aliases: ['q', 'exit'],
    description: 'Exit orchestrator',
    usage: '/quit',
    handler: 'handleQuit'
  },

  zoom: {
    name: 'zoom',
    aliases: ['z'],
    description: 'Toggle zoom on current pane',
    usage: '/zoom',
    handler: 'handleZoom'
  },

  history: {
    name: 'history',
    aliases: ['hist'],
    description: 'Show signal history',
    usage: '/history [count]',
    args: ['count'],
    optional: ['count'],
    handler: 'handleHistory'
  },

  clear: {
    name: 'clear',
    aliases: ['cls'],
    description: 'Clear screen',
    usage: '/clear',
    handler: 'handleClear'
  }
};

/**
 * Parse a command string
 *
 * @param {string} input - Input string (may start with /)
 * @returns {{ command: string|null, args: Array<string>, raw: string }|null}
 */
function parseCommand(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();

  // Must start with /
  if (!trimmed.startsWith('/')) {
    return null;
  }

  // Split into parts
  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  // Handle quoted arguments
  const parsedArgs = [];
  let inQuote = false;
  let currentArg = '';

  for (const part of args) {
    if (inQuote) {
      currentArg += ' ' + part;
      if (part.endsWith('"') || part.endsWith("'")) {
        parsedArgs.push(currentArg.slice(0, -1));
        currentArg = '';
        inQuote = false;
      }
    } else if (part.startsWith('"') || part.startsWith("'")) {
      if (part.endsWith('"') || part.endsWith("'")) {
        parsedArgs.push(part.slice(1, -1));
      } else {
        currentArg = part.slice(1);
        inQuote = true;
      }
    } else {
      parsedArgs.push(part);
    }
  }

  if (currentArg) {
    parsedArgs.push(currentArg);
  }

  return {
    command,
    args: parsedArgs,
    raw: trimmed
  };
}

/**
 * Resolve command name or alias
 *
 * @param {string} input - Command name or alias
 * @returns {Object|null} Command definition or null
 */
function resolveCommand(input) {
  if (!input) return null;
  const lower = input.toLowerCase();

  // Direct match
  if (COMMANDS[lower]) {
    return COMMANDS[lower];
  }

  // Alias match
  for (const cmd of Object.values(COMMANDS)) {
    if (cmd.aliases?.includes(lower)) {
      return cmd;
    }
  }

  return null;
}

/**
 * Command Handler
 *
 * Executes commands within the orchestrator context.
 *
 * Events:
 * - output: Command output (lines)
 * - quit: Quit requested
 * - error: Command error (error)
 */
class CommandHandler extends EventEmitter {
  /**
   * Create command handler
   *
   * @param {Object} context - Orchestrator context
   * @param {Object} context.bridge - ZeroBridge instance
   * @param {Object} context.bus - OrchestratorBus instance
   * @param {Object} context.spawner - AgentSpawner instance
   * @param {Object} context.layout - LayoutManager instance
   * @param {Object} context.session - SessionManager instance
   */
  constructor(context) {
    super();
    this.context = context;
  }

  /**
   * Execute a parsed command
   *
   * @param {{ command: string, args: Array<string> }} parsed - Parsed command
   * @returns {Promise<boolean>} True if command was handled
   */
  async execute(parsed) {
    const cmdDef = resolveCommand(parsed.command);

    if (!cmdDef) {
      this.output([red(`Unknown command: ${parsed.command}`), dim('Type /help for available commands.')]);
      return false;
    }

    // Validate required arguments
    const requiredArgs = (cmdDef.args || []).filter(
      arg => !(cmdDef.optional || []).includes(arg)
    );

    if (parsed.args.length < requiredArgs.length) {
      this.output([
        red(`Missing arguments for /${cmdDef.name}`),
        dim(`Usage: ${cmdDef.usage}`)
      ]);
      return false;
    }

    try {
      await this[cmdDef.handler](parsed.args);
      return true;
    } catch (err) {
      this.output([red(`Command failed: ${err.message}`)]);
      this.emit('error', err);
      return false;
    }
  }

  /**
   * Output lines
   * @param {Array<string>} lines
   */
  output(lines) {
    this.emit('output', lines);
  }

  // Command handlers

  async handleStatus() {
    const stats = this.context.bridge.getStats();
    const lines = [
      bold('Orchestrator Status'),
      dim('\u2500'.repeat(40)),
      `Session: ${stats.sessionId}`,
      `Connected Agents: ${stats.connectedAgents.length}`,
      ''
    ];

    for (const agentId of stats.connectedAgents) {
      const info = stats.agents[agentId];
      const state = info?.state || 'unknown';
      const uptime = info?.connectedAt
        ? `${Math.round((Date.now() - info.connectedAt) / 1000)}s`
        : 'N/A';
      lines.push(`  ${green('\u25cf')} ${agentId}: ${state} (${uptime})`);
    }

    this.output(lines);
  }

  async handleFocus(args) {
    const agentId = args[0];
    const layout = this.context.layout;

    if (agentId === 'main' || agentId === 'zero') {
      layout.focusMain();
      this.output([dim(`Focused: main pane`)]);
    } else {
      layout.focusAgent(agentId);
      this.output([dim(`Focused: ${agentId}`)]);
    }
  }

  async handleBroadcast(args) {
    const message = args.join(' ');
    const count = this.context.bridge.broadcast({ type: 'prompt', content: message });
    this.output([green(`Broadcast to ${count} agents: ${message.slice(0, 50)}...`)]);
  }

  async handleSend(args) {
    const agentId = args[0];
    const message = args.slice(1).join(' ');

    if (!this.context.bridge.isAgentConnected(agentId)) {
      this.output([red(`Agent not connected: ${agentId}`)]);
      return;
    }

    this.context.spawner.sendPrompt(agentId, message);
    this.output([dim(`Sent to ${agentId}: ${message.slice(0, 50)}...`)]);
  }

  async handleConsensus(args) {
    const question = args.join(' ');
    this.output([dim(`Querying consensus: ${question.slice(0, 50)}...`)]);

    const result = await this.context.bus.collectResponses(question, { timeout: 30000 });

    const lines = [
      bold('Consensus Result'),
      `Responses: ${result.responseCount}/${result.expectedCount}`,
      `State: ${result.state}`
    ];

    if (result.consensus) {
      const confidence = Math.round(result.consensus.confidence * 100);
      lines.push(`Confidence: ${confidence}%`);
      lines.push(`Method: ${result.consensus.method}`);
    }

    this.output(lines);
  }

  async handleDisconnect(args) {
    const agentId = args[0];
    await this.context.spawner.stopAgent(agentId);
    this.output([yellow(`Disconnected: ${agentId}`)]);
  }

  async handleReconnect(args) {
    const agentId = args[0];
    await this.context.spawner.restartAgent(agentId);
    this.output([green(`Reconnecting: ${agentId}`)]);
  }

  async handleLayout(args) {
    const preset = args[0] || 'tiled';
    this.context.layout.applyPreset(preset);
    this.output([dim(`Applied layout: ${preset}`)]);
  }

  async handleAgents() {
    const knownIds = getAgentIds();
    const connectedIds = this.context.bridge.getConnectedAgents();
    const connectedSet = new Set(connectedIds);

    const lines = [bold('Agents')];

    lines.push('', bold('Connected:'));
    for (const id of connectedIds) {
      const agent = getAgent(id);
      lines.push(`  ${green('\u25cf')} ${agent?.name || id}`);
    }
    if (connectedIds.length === 0) {
      lines.push(dim('  None'));
    }

    lines.push('', bold('Available:'));
    for (const id of knownIds) {
      if (!connectedSet.has(id)) {
        const agent = getAgent(id);
        lines.push(`  ${dim('\u25cb')} ${agent?.name || id}`);
      }
    }

    this.output(lines);
  }

  async handleSpawn(args) {
    const agentId = args[0];

    if (!getAgent(agentId)) {
      this.output([red(`Unknown agent: ${agentId}`)]);
      return;
    }

    if (this.context.bridge.isAgentConnected(agentId)) {
      this.output([yellow(`Agent already connected: ${agentId}`)]);
      return;
    }

    this.output([dim(`Spawning ${agentId}...`)]);

    // Create pane and spawn
    const pane = this.context.layout.addAgentPane(agentId);
    await this.context.spawner.spawnAgent(agentId, pane);

    this.output([green(`Spawned: ${agentId}`)]);
  }

  async handleHelp(args) {
    const cmdName = args[0];

    if (cmdName) {
      const cmd = resolveCommand(cmdName);
      if (!cmd) {
        this.output([red(`Unknown command: ${cmdName}`)]);
        return;
      }

      this.output([
        bold(`/${cmd.name}`),
        cmd.description,
        '',
        `Usage: ${cmd.usage}`,
        cmd.aliases?.length ? `Aliases: ${cmd.aliases.join(', ')}` : ''
      ].filter(Boolean));
      return;
    }

    const lines = [
      bold('Available Commands'),
      ''
    ];

    for (const cmd of Object.values(COMMANDS)) {
      const aliases = cmd.aliases?.length ? dim(` (${cmd.aliases.join(', ')})`) : '';
      lines.push(`  ${cyan('/' + cmd.name.padEnd(12))} ${cmd.description}${aliases}`);
    }

    lines.push('', dim('Type /help <command> for detailed usage.'));

    this.output(lines);
  }

  async handleQuit() {
    this.output([dim('Shutting down...')]);
    this.emit('quit');
  }

  async handleZoom() {
    this.context.layout.toggleZoom();
    this.output([dim('Toggled zoom')]);
  }

  async handleHistory(args) {
    const count = parseInt(args[0]) || 10;
    const history = this.context.bus.getHistory({ limit: count });

    const lines = [bold(`Last ${count} Signals`)];

    for (const signal of history.slice(-count)) {
      const time = new Date(signal.timestamp).toLocaleTimeString();
      lines.push(`  ${dim(time)} ${signal.type} from ${signal.source}`);
    }

    if (history.length === 0) {
      lines.push(dim('  No signals recorded'));
    }

    this.output(lines);
  }

  async handleClear() {
    // Emit special clear event
    this.emit('clear');
  }
}

module.exports = {
  COMMANDS,
  parseCommand,
  resolveCommand,
  CommandHandler
};
