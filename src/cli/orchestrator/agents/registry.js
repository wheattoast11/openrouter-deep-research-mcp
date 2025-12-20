/**
 * Agent Registry
 *
 * Defines known AI coding agents and their detection/launch configurations.
 * Zero dependencies - pure data definitions.
 *
 * @module cli/orchestrator/agents/registry
 */

'use strict';

const path = require('path');
const os = require('os');

/**
 * Expand ~ to home directory in path strings
 *
 * @param {string} p - Path that may contain ~
 * @returns {string} Expanded path
 */
function expandHome(p) {
  if (!p) return p;
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Agent capability flags
 */
const AgentCapability = {
  MCP: 'mcp',                  // Model Context Protocol support
  STDIO: 'stdio',             // Can communicate via stdio
  SOCKET: 'socket',           // Can communicate via Unix socket
  STREAMING: 'streaming',     // Supports streaming responses
  TOOLS: 'tools',             // Can use tools
  MULTI_TURN: 'multi_turn',   // Supports conversation history
  FILE_EDIT: 'file_edit',     // Can edit files
  TERMINAL: 'terminal',       // Can run terminal commands
  BROWSER: 'browser'          // Has browser capabilities
};

/**
 * Known agent definitions
 *
 * Each agent entry contains:
 * - command: CLI command to invoke the agent
 * - args: Default arguments for the command
 * - detectMcp: Function to detect if agent has MCP support
 * - capabilities: Array of capability flags
 * - configPaths: Where to find agent configuration
 * - envVars: Required environment variables
 */
const KNOWN_AGENTS = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    args: ['--mcp'],
    detectMcp: (env) => {
      // Claude Code has built-in MCP support
      return true;
    },
    capabilities: [
      AgentCapability.MCP,
      AgentCapability.STDIO,
      AgentCapability.STREAMING,
      AgentCapability.TOOLS,
      AgentCapability.MULTI_TURN,
      AgentCapability.FILE_EDIT,
      AgentCapability.TERMINAL
    ],
    configPaths: [
      '~/.claude/settings.json',
      '~/.config/claude/settings.json'
    ],
    envVars: ['ANTHROPIC_API_KEY'],
    mcpSocketSupport: true,
    color: 'cyan'
  },

  gemini: {
    id: 'gemini',
    name: 'Gemini CLI',
    command: 'gemini',
    args: [],
    detectMcp: (env) => {
      // Check for MCP configuration
      return env.GEMINI_MCP_ENABLED === 'true';
    },
    capabilities: [
      AgentCapability.STDIO,
      AgentCapability.STREAMING,
      AgentCapability.TOOLS,
      AgentCapability.MULTI_TURN
    ],
    configPaths: [
      '~/.config/gemini/config.json'
    ],
    envVars: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    mcpSocketSupport: false,
    color: 'blue'
  },

  qwen: {
    id: 'qwen',
    name: 'Qwen Agent',
    command: 'qwen',
    args: ['--agent'],
    detectMcp: (env) => {
      return env.QWEN_MCP_ENABLED === 'true';
    },
    capabilities: [
      AgentCapability.STDIO,
      AgentCapability.STREAMING,
      AgentCapability.TOOLS,
      AgentCapability.MULTI_TURN,
      AgentCapability.FILE_EDIT
    ],
    configPaths: [
      '~/.config/qwen/config.json'
    ],
    envVars: ['DASHSCOPE_API_KEY'],
    mcpSocketSupport: false,
    color: 'magenta'
  },

  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek Coder',
    command: 'deepseek',
    args: ['--coder'],
    detectMcp: (env) => {
      return env.DEEPSEEK_MCP_ENABLED === 'true';
    },
    capabilities: [
      AgentCapability.STDIO,
      AgentCapability.STREAMING,
      AgentCapability.TOOLS,
      AgentCapability.FILE_EDIT
    ],
    configPaths: [
      '~/.config/deepseek/config.json'
    ],
    envVars: ['DEEPSEEK_API_KEY'],
    mcpSocketSupport: false,
    color: 'green'
  },

  cursor: {
    id: 'cursor',
    name: 'Cursor',
    command: 'cursor',
    args: ['--cli'],
    detectMcp: (env) => {
      // Cursor has native MCP support
      return true;
    },
    capabilities: [
      AgentCapability.MCP,
      AgentCapability.STDIO,
      AgentCapability.STREAMING,
      AgentCapability.TOOLS,
      AgentCapability.MULTI_TURN,
      AgentCapability.FILE_EDIT,
      AgentCapability.TERMINAL
    ],
    configPaths: [
      '~/.cursor/settings.json',
      '~/Library/Application Support/Cursor/settings.json'
    ],
    envVars: [],
    mcpSocketSupport: true,
    color: 'brightBlue'
  },

  codex: {
    id: 'codex',
    name: 'OpenAI Codex',
    command: 'codex',
    args: [],
    detectMcp: (env) => {
      return env.CODEX_MCP_ENABLED === 'true';
    },
    capabilities: [
      AgentCapability.STDIO,
      AgentCapability.STREAMING,
      AgentCapability.FILE_EDIT
    ],
    configPaths: [
      '~/.config/openai/config.json'
    ],
    envVars: ['OPENAI_API_KEY'],
    mcpSocketSupport: false,
    color: 'brightGreen'
  },

  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot',
    command: 'gh',
    args: ['copilot', 'suggest'],
    detectMcp: () => false,
    capabilities: [
      AgentCapability.STDIO,
      AgentCapability.STREAMING
    ],
    configPaths: [
      '~/.config/gh/config.yml'
    ],
    envVars: ['GITHUB_TOKEN'],
    mcpSocketSupport: false,
    color: 'white'
  },

  aider: {
    id: 'aider',
    name: 'Aider',
    command: 'aider',
    args: [],
    detectMcp: () => false,
    capabilities: [
      AgentCapability.STDIO,
      AgentCapability.STREAMING,
      AgentCapability.FILE_EDIT,
      AgentCapability.TERMINAL
    ],
    configPaths: [
      '~/.aider.conf.yml'
    ],
    envVars: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
    mcpSocketSupport: false,
    color: 'yellow'
  }
};

/**
 * Get agent definition by ID
 *
 * @param {string} agentId - Agent identifier
 * @returns {Object|null} Agent definition or null if not found
 */
function getAgent(agentId) {
  return KNOWN_AGENTS[agentId.toLowerCase()] || null;
}

/**
 * Get all known agent IDs
 *
 * @returns {Array<string>} List of agent IDs
 */
function getAgentIds() {
  return Object.keys(KNOWN_AGENTS);
}

/**
 * Get agents with specific capability
 *
 * @param {string} capability - Capability to filter by
 * @returns {Array<Object>} Matching agent definitions
 */
function getAgentsWithCapability(capability) {
  return Object.values(KNOWN_AGENTS).filter(
    agent => agent.capabilities.includes(capability)
  );
}

/**
 * Get agents that support MCP
 *
 * @returns {Array<Object>} Agents with MCP capability
 */
function getMcpAgents() {
  return getAgentsWithCapability(AgentCapability.MCP);
}

/**
 * Get agents that support socket communication
 *
 * @returns {Array<Object>} Agents with socket support
 */
function getSocketAgents() {
  return Object.values(KNOWN_AGENTS).filter(
    agent => agent.mcpSocketSupport
  );
}

/**
 * Check if an agent ID is known
 *
 * @param {string} agentId - Agent identifier
 * @returns {boolean}
 */
function isKnownAgent(agentId) {
  return agentId.toLowerCase() in KNOWN_AGENTS;
}

/**
 * Get expanded config paths for an agent
 *
 * @param {string} agentId - Agent identifier
 * @returns {Array<string>} Expanded absolute paths
 */
function getAgentConfigPaths(agentId) {
  const agent = getAgent(agentId);
  if (!agent) return [];
  return agent.configPaths.map(expandHome);
}

/**
 * Build command array for spawning an agent
 *
 * @param {string} agentId - Agent identifier
 * @param {Object} [options] - Override options
 * @param {Array<string>} [options.extraArgs] - Additional arguments
 * @param {string} [options.workDir] - Working directory
 * @returns {{ command: string, args: Array<string> }|null}
 */
function buildAgentCommand(agentId, options = {}) {
  const agent = getAgent(agentId);
  if (!agent) return null;

  const args = [...agent.args];

  if (options.extraArgs) {
    args.push(...options.extraArgs);
  }

  return {
    command: agent.command,
    args
  };
}

module.exports = {
  KNOWN_AGENTS,
  AgentCapability,
  getAgent,
  getAgentIds,
  getAgentsWithCapability,
  getMcpAgents,
  getSocketAgents,
  isKnownAgent,
  getAgentConfigPaths,
  buildAgentCommand,
  expandHome
};
