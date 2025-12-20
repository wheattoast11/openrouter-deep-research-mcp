/**
 * Zero Orchestrator
 *
 * Multi-agent CLI orchestrator entry point.
 * Coordinates multiple AI coding agents in a tmux session with
 * real-time communication via Unix sockets.
 *
 * @module cli/orchestrator
 */

'use strict';

const path = require('path');
const { EventEmitter } = require('events');

// Core components
const { ZeroBridge } = require('../../core/bridge/zeroBridge');
const { SessionManager, createSession } = require('./core/session');
const { LayoutManager, createLayoutManager, LayoutStrategy } = require('./core/layout');

// Agent management
const { AgentSpawner } = require('./agents/spawner');
const { getAgent, getAgentIds, isKnownAgent } = require('./agents/registry');
const { queryCapabilities, getAvailableAgents } = require('./agents/capability');

// Bus and protocol
const { OrchestratorBus } = require('./bus/orchestratorBus');
const { ProtocolBridge } = require('./bus/protocolBridge');

// UI components
const { createRenderer } = require('./ui/renderer');
const { createStatusBar } = require('./ui/statusBar');

// Micro-libs
const { red, green, yellow, cyan, bold, dim, writeln, error } = require('../lib/micro-term');

/**
 * Default orchestrator options
 */
const DEFAULT_OPTIONS = {
  sessionName: null, // Auto-generate if not provided
  agents: [],        // Agents to spawn
  query: null,       // Initial query to broadcast
  layout: LayoutStrategy.MAIN_WITH_AGENTS,
  workDir: process.cwd(),
  detached: false,
  timeout: 60000     // Agent connection timeout
};

/**
 * Orchestrator state
 */
const OrchestratorState = {
  INITIALIZING: 'initializing',
  RUNNING: 'running',
  SHUTTING_DOWN: 'shutting_down',
  STOPPED: 'stopped'
};

/**
 * Zero Orchestrator
 *
 * Main orchestrator class that coordinates:
 * - tmux session management
 * - Agent spawning and lifecycle
 * - Inter-agent communication via sockets
 * - Signal protocol and consensus
 * - Terminal UI rendering
 */
class Orchestrator extends EventEmitter {
  /**
   * Create orchestrator
   *
   * @param {Object} options - Orchestrator options
   * @param {string} [options.sessionName] - tmux session name
   * @param {Array<string>} [options.agents] - Agents to spawn
   * @param {string} [options.query] - Initial query
   * @param {string} [options.layout] - Layout strategy
   * @param {string} [options.workDir] - Working directory
   * @param {boolean} [options.detached] - Run detached
   */
  constructor(options = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.state = OrchestratorState.INITIALIZING;

    // Components (initialized in start())
    this.session = null;
    this.bridge = null;
    this.bus = null;
    this.protocol = null;
    this.spawner = null;
    this.layout = null;
    this.renderer = null;

    // State tracking
    this.startTime = null;
    this.agentStates = new Map();
  }

  /**
   * Start the orchestrator
   *
   * @returns {Promise<void>}
   */
  async start() {
    try {
      writeln(bold(cyan('Zero Orchestrator')));
      writeln(dim('Multi-agent coordination system'));
      writeln('');

      // Validate agents
      await this._validateAgents();

      // Create tmux session
      writeln(dim('Creating session...'));
      await this._createSession();

      // Initialize bridge
      writeln(dim('Initializing bridge...'));
      this._initializeBridge();

      // Initialize bus
      this._initializeBus();

      // Initialize layout
      this._initializeLayout();

      // Initialize spawner
      this._initializeSpawner();

      // Spawn agents
      if (this.options.agents.length > 0) {
        writeln(dim(`Spawning ${this.options.agents.length} agents...`));
        await this._spawnAgents();
      }

      // Initialize renderer
      this._initializeRenderer();

      // Start running
      this.state = OrchestratorState.RUNNING;
      this.startTime = Date.now();

      // Send initial query if provided
      if (this.options.query) {
        setTimeout(() => {
          this._broadcastQuery(this.options.query);
        }, 1000);
      }

      // Start render loop
      this.renderer.start();

      writeln(green('Orchestrator ready'));
      writeln(dim('Type /help for commands'));
      writeln('');

    } catch (err) {
      error(`Failed to start orchestrator: ${err.message}`);
      await this.shutdown();
      throw err;
    }
  }

  /**
   * Validate requested agents
   * @private
   */
  async _validateAgents() {
    const invalidAgents = [];

    for (const agentId of this.options.agents) {
      if (!isKnownAgent(agentId)) {
        invalidAgents.push(agentId);
        continue;
      }

      const caps = await queryCapabilities(agentId);
      if (!caps.available) {
        writeln(yellow(`Warning: Agent ${agentId} not available: ${caps.warnings.join(', ')}`));
      }
    }

    if (invalidAgents.length > 0) {
      throw new Error(`Unknown agents: ${invalidAgents.join(', ')}`);
    }
  }

  /**
   * Create tmux session
   * @private
   */
  async _createSession() {
    this.session = new SessionManager({
      name: this.options.sessionName || `zero-${Date.now()}`,
      windowName: 'orchestrator',
      startDirectory: this.options.workDir,
      detached: this.options.detached
    });

    await this.session.create();

    // Set up session event handlers
    this.session.on('signal', (signal) => {
      this.shutdown();
    });

    this.session.on('destroyed', () => {
      this.state = OrchestratorState.STOPPED;
      this.emit('stopped');
    });
  }

  /**
   * Initialize zero bridge
   * @private
   */
  _initializeBridge() {
    this.bridge = new ZeroBridge({
      sessionId: this.session.name,
      orchestratorId: `zero-${process.pid}`,
      capabilities: {
        mcp: true,
        streaming: true,
        multiAgent: true,
        consensus: true
      }
    });

    // Set up bridge event handlers
    this.bridge.on('agentConnected', (agentId) => {
      this.agentStates.set(agentId, { state: 'ready', connectedAt: Date.now() });
      this.emit('agentConnected', agentId);
      if (this.renderer) {
        this.renderer.notify(`Agent connected: ${agentId}`, 'success');
        this.renderer.updateStatus();
      }
    });

    this.bridge.on('agentDisconnected', (agentId) => {
      this.agentStates.set(agentId, { state: 'disconnected' });
      this.emit('agentDisconnected', agentId);
      if (this.renderer) {
        this.renderer.notify(`Agent disconnected: ${agentId}`, 'warning');
        this.renderer.updateStatus();
      }
    });

    this.bridge.on('message', (message, agentId) => {
      if (this.renderer) {
        this.renderer.showActivity(agentId, 'message received');
      }
    });

    this.bridge.on('error', (err) => {
      if (this.renderer) {
        this.renderer.notify(`Bridge error: ${err.message}`, 'error');
      }
    });
  }

  /**
   * Initialize orchestrator bus
   * @private
   */
  _initializeBus() {
    this.bus = new OrchestratorBus({
      bridge: this.bridge
    });

    this.protocol = new ProtocolBridge({
      samplingEnabled: true
    });

    // Set up bus event handlers
    this.bus.on('consensus', (queryId, consensus) => {
      this.emit('consensus', queryId, consensus);
      if (this.renderer) {
        const confidence = Math.round(consensus.confidence * 100);
        this.renderer.notify(`Consensus reached: ${confidence}% confidence`, 'success');
      }
    });

    this.bus.on('crystallization', (signalId, crystal) => {
      if (crystal.score > 0.7) {
        this.emit('crystallization', signalId, crystal);
        if (this.renderer) {
          this.renderer.notify('Understanding crystallized', 'info');
        }
      }
    });
  }

  /**
   * Initialize layout manager
   * @private
   */
  _initializeLayout() {
    this.layout = createLayoutManager({
      sessionName: this.session.name,
      strategy: this.options.layout
    });

    // Initialize with main pane
    if (this.session.mainPaneId) {
      this.layout.initialize(this.session.mainPaneId);
    }
  }

  /**
   * Initialize agent spawner
   * @private
   */
  _initializeSpawner() {
    this.spawner = new AgentSpawner({
      bridge: this.bridge,
      sessionName: this.session.name,
      workDir: this.options.workDir,
      autoRestart: true
    });

    // Set up spawner event handlers
    this.spawner.on('spawned', (agentId) => {
      this.agentStates.set(agentId, { state: 'connecting' });
    });

    this.spawner.on('connected', (agentId) => {
      this.agentStates.set(agentId, { state: 'ready', connectedAt: Date.now() });
    });

    this.spawner.on('stopped', (agentId) => {
      this.agentStates.set(agentId, { state: 'disconnected' });
    });

    this.spawner.on('error', (agentId, err) => {
      this.agentStates.set(agentId, { state: 'error', error: err.message });
      if (this.renderer) {
        this.renderer.notify(`Agent error (${agentId}): ${err.message}`, 'error');
      }
    });
  }

  /**
   * Spawn configured agents
   * @private
   */
  async _spawnAgents() {
    // Create layout for agents
    const panes = this.layout.layoutAgents(this.options.agents);
    const failures = [];

    // Spawn each agent
    for (const agentId of this.options.agents) {
      const pane = panes.get(agentId);
      if (pane) {
        try {
          await this.spawner.spawnAgent(agentId, pane);
          writeln(green(`  Spawned: ${agentId}`));
        } catch (err) {
          writeln(red(`  Failed to spawn ${agentId}: ${err.message}`));
          failures.push({ agentId, error: err });
        }
      }
    }

    // Fail fast if all agents failed
    if (failures.length > 0 && failures.length === this.options.agents.length) {
      throw new Error(`Failed to spawn any agents: ${failures.map(f => f.agentId).join(', ')}`);
    }

    // Warn about partial failures
    if (failures.length > 0) {
      writeln(yellow(`Warning: ${failures.length} agent(s) failed to spawn`));
    }
  }

  /**
   * Initialize UI renderer
   * @private
   */
  _initializeRenderer() {
    const context = {
      bridge: this.bridge,
      bus: this.bus,
      spawner: this.spawner,
      layout: this.layout,
      session: this.session
    };

    this.renderer = createRenderer({
      context,
      statusBar: createStatusBar()
    });

    // Set up renderer event handlers
    this.renderer.on('quit', () => {
      this.shutdown();
    });

    this.renderer.on('input', (input) => {
      // Handle non-command input
      this.emit('input', input);
    });

    this.renderer.on('command', (command, args) => {
      this.emit('command', command, args);
    });
  }

  /**
   * Broadcast query to all agents
   *
   * @param {string} query - Query to broadcast
   * @private
   */
  _broadcastQuery(query) {
    const { Signal } = require('../../core/signal');
    const signal = Signal.query(query, 'orchestrator');
    this.bus.broadcast(signal);

    if (this.renderer) {
      this.renderer.notify(`Broadcast: ${query.slice(0, 50)}...`, 'info');
    }
  }

  /**
   * Get orchestrator info
   *
   * @returns {Object}
   */
  getInfo() {
    return {
      state: this.state,
      sessionName: this.session?.name,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      agents: Object.fromEntries(this.agentStates),
      bridge: this.bridge?.getStats(),
      bus: this.bus?.getStats(),
      layout: this.layout?.getInfo()
    };
  }

  /**
   * Shutdown the orchestrator
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.state === OrchestratorState.SHUTTING_DOWN ||
        this.state === OrchestratorState.STOPPED) {
      return;
    }

    this.state = OrchestratorState.SHUTTING_DOWN;
    writeln('');
    writeln(dim('Shutting down...'));

    // Stop renderer
    if (this.renderer) {
      this.renderer.stop();
    }

    // Stop spawner (stops all agents)
    if (this.spawner) {
      await this.spawner.shutdown();
    }

    // Close bridge
    if (this.bridge) {
      await this.bridge.close();
    }

    // Cleanup layout
    if (this.layout) {
      this.layout.cleanup();
    }

    // Destroy session
    if (this.session) {
      await this.session.destroy();
    }

    this.state = OrchestratorState.STOPPED;
    writeln(green('Orchestrator stopped'));
    this.emit('stopped');
  }
}

/**
 * Parse orchestrator arguments
 *
 * @param {Array<string>} args - Command line arguments
 * @returns {Object} Parsed options
 */
function parseArgs(args) {
  const options = {
    agents: [],
    query: null,
    layout: null,
    sessionName: null,
    detached: false,
    help: false
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--session' || arg === '-s') {
      options.sessionName = args[++i];
    } else if (arg === '--layout' || arg === '-l') {
      options.layout = args[++i];
    } else if (arg === '--query' || arg === '-q') {
      options.query = args[++i];
    } else if (arg === '--detached' || arg === '-d') {
      options.detached = true;
    } else if (!arg.startsWith('-')) {
      // Positional argument - could be agent ID or query
      if (isKnownAgent(arg)) {
        options.agents.push(arg);
      } else if (!options.query) {
        // If not a known agent and no query set, treat as query
        options.query = arg;
      }
    }

    i++;
  }

  return options;
}

/**
 * Show orchestrator help
 */
function showHelp() {
  writeln(bold('Zero Orchestrator'));
  writeln('Multi-agent CLI coordination system');
  writeln('');
  writeln(bold('Usage:'));
  writeln('  zero <agents...> [options]');
  writeln('  zero claude gemini "research quantum computing"');
  writeln('');
  writeln(bold('Options:'));
  writeln('  -s, --session <name>   Session name');
  writeln('  -l, --layout <type>    Layout: main_with_agents, horizontal, vertical, grid');
  writeln('  -q, --query <text>     Initial query to broadcast');
  writeln('  -d, --detached         Start detached from terminal');
  writeln('  -h, --help             Show this help');
  writeln('');
  writeln(bold('Available Agents:'));
  for (const agentId of getAgentIds()) {
    const agent = getAgent(agentId);
    writeln(`  ${agentId.padEnd(12)} ${agent.name}`);
  }
  writeln('');
  writeln(bold('Examples:'));
  writeln('  zero claude gemini           # Start with Claude and Gemini');
  writeln('  zero claude -q "hello"       # Start Claude with initial query');
  writeln('  zero claude gemini qwen      # Start with three agents');
  writeln('');
}

/**
 * Run the orchestrator
 *
 * @param {Array<string>} args - Command line arguments
 * @returns {Promise<void>}
 */
async function run(args) {
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    return;
  }

  // Check for tmux and ensure server is running
  const tmuxCheck = SessionManager.checkTmux();
  if (!tmuxCheck.available) {
    error('tmux is required but not available.');
    if (tmuxCheck.error) {
      error(tmuxCheck.error);
    } else {
      error('Install with: brew install tmux (macOS) or apt install tmux (Linux)');
    }
    process.exit(1);
  }

  // Need at least one agent
  if (options.agents.length === 0) {
    // Check if any agents are available
    const available = await getAvailableAgents();
    if (available.length > 0) {
      writeln(yellow('No agents specified. Available agents:'));
      for (const agent of available) {
        writeln(`  ${green('\u25cf')} ${agent.agentId} (${agent.name})`);
      }
      writeln('');
      writeln(dim('Usage: zero claude gemini "your query"'));
    } else {
      error('No agent CLIs found. Install at least one AI coding assistant.');
    }
    return;
  }

  // Create and start orchestrator
  const orchestrator = new Orchestrator(options);

  // Handle exit
  const handleExit = async () => {
    await orchestrator.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  try {
    await orchestrator.start();
  } catch (err) {
    error(`Orchestrator failed: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Check if arguments indicate orchestrator mode
 *
 * @param {Array<string>} args - Command line arguments
 * @returns {boolean} True if orchestrator should handle these args
 */
function isOrchestratorMode(args) {
  // Check if any arg is a known agent ID
  for (const arg of args) {
    if (isKnownAgent(arg)) {
      return true;
    }
  }

  // Check for explicit orchestrator flags
  return args.includes('--orchestrate') || args.includes('-o');
}

module.exports = {
  Orchestrator,
  OrchestratorState,
  run,
  parseArgs,
  showHelp,
  isOrchestratorMode
};
