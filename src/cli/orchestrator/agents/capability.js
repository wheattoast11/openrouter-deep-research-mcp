/**
 * Capability Detector
 *
 * Detects available agent CLIs and their capabilities.
 * Zero dependencies beyond Node.js built-ins.
 *
 * @module cli/orchestrator/agents/capability
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getAgent, getAgentConfigPaths, AgentCapability, expandHome } = require('./registry');

/**
 * Check if a command exists in PATH
 *
 * @param {string} command - Command to check
 * @returns {boolean} True if command exists
 */
function commandExists(command) {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${cmd} ${command}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get command path if it exists
 *
 * @param {string} command - Command to locate
 * @returns {string|null} Full path or null
 */
function getCommandPath(command) {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${cmd} ${command}`, { stdio: 'pipe', encoding: 'utf8' });
    return result.trim().split('\n')[0];
  } catch {
    return null;
  }
}

/**
 * Get version of a CLI command
 *
 * @param {string} command - Command to check
 * @param {Array<string>} [versionArgs] - Arguments to get version
 * @returns {string|null} Version string or null
 */
function getCommandVersion(command, versionArgs = ['--version']) {
  try {
    const result = spawnSync(command, versionArgs, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000
    });
    if (result.status === 0) {
      const output = result.stdout || result.stderr;
      // Extract version number from output
      const match = output.match(/\d+\.\d+(\.\d+)?/);
      return match ? match[0] : output.trim().slice(0, 50);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if config file exists for an agent
 *
 * @param {string} agentId - Agent identifier
 * @returns {string|null} Path to existing config or null
 */
function findAgentConfig(agentId) {
  const configPaths = getAgentConfigPaths(agentId);
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

/**
 * Check if required environment variables are set
 *
 * @param {Array<string>} envVars - Environment variable names
 * @returns {{ set: Array<string>, missing: Array<string> }}
 */
function checkEnvVars(envVars) {
  const set = [];
  const missing = [];

  for (const varName of envVars) {
    if (process.env[varName]) {
      set.push(varName);
    } else {
      missing.push(varName);
    }
  }

  return { set, missing };
}

/**
 * Detect MCP capability for an agent
 *
 * @param {string} agentId - Agent identifier
 * @returns {Promise<boolean>} True if MCP is available
 */
async function detectMcpCapability(agentId) {
  const agent = getAgent(agentId);
  if (!agent) return false;

  // Use agent-specific detection logic
  if (typeof agent.detectMcp === 'function') {
    return agent.detectMcp(process.env);
  }

  return false;
}

/**
 * Query all capabilities for an agent
 *
 * @param {string} agentId - Agent identifier
 * @returns {Promise<Object>} Full capability report
 */
async function queryCapabilities(agentId) {
  const agent = getAgent(agentId);

  if (!agent) {
    return {
      agentId,
      available: false,
      error: 'Unknown agent'
    };
  }

  const commandPath = getCommandPath(agent.command);
  const installed = !!commandPath;
  const version = installed ? getCommandVersion(agent.command) : null;
  const configPath = findAgentConfig(agentId);
  const envStatus = checkEnvVars(agent.envVars);
  const hasMcp = await detectMcpCapability(agentId);

  // Determine if agent is fully usable
  const hasRequiredEnv = envStatus.missing.length === 0 || agent.envVars.length === 0;
  const usable = installed && hasRequiredEnv;

  return {
    agentId,
    name: agent.name,
    available: usable,
    installed,
    commandPath,
    version,
    capabilities: agent.capabilities,
    hasMcp,
    mcpSocketSupport: agent.mcpSocketSupport,
    configPath,
    envVars: envStatus,
    color: agent.color,
    warnings: [
      ...(!installed ? [`CLI '${agent.command}' not found in PATH`] : []),
      ...(envStatus.missing.length > 0 ? [`Missing env vars: ${envStatus.missing.join(', ')}`] : []),
      ...(!configPath && agent.configPaths.length > 0 ? ['No config file found'] : [])
    ]
  };
}

/**
 * Scan for all available agents
 *
 * @returns {Promise<Object>} Map of agentId -> capability report
 */
async function scanAllAgents() {
  const { getAgentIds } = require('./registry');
  const agentIds = getAgentIds();
  const results = {};

  for (const agentId of agentIds) {
    results[agentId] = await queryCapabilities(agentId);
  }

  return results;
}

/**
 * Get list of available (installed and usable) agents
 *
 * @returns {Promise<Array<Object>>} Available agent reports
 */
async function getAvailableAgents() {
  const all = await scanAllAgents();
  return Object.values(all).filter(r => r.available);
}

/**
 * Get list of agents with MCP support
 *
 * @returns {Promise<Array<Object>>} MCP-capable agent reports
 */
async function getMcpCapableAgents() {
  const all = await scanAllAgents();
  return Object.values(all).filter(r => r.available && r.hasMcp);
}

/**
 * Validate agent can be used in orchestrator
 *
 * @param {string} agentId - Agent identifier
 * @returns {Promise<{ valid: boolean, errors: Array<string> }>}
 */
async function validateAgentForOrchestrator(agentId) {
  const caps = await queryCapabilities(agentId);
  const errors = [];

  if (!caps.installed) {
    errors.push(`Agent CLI '${agentId}' is not installed`);
  }

  if (caps.envVars.missing.length > 0) {
    errors.push(`Missing required environment variables: ${caps.envVars.missing.join(', ')}`);
  }

  if (!caps.hasMcp && !caps.mcpSocketSupport) {
    errors.push(`Agent '${agentId}' does not support MCP or socket communication`);
  }

  return {
    valid: errors.length === 0,
    errors,
    capabilities: caps
  };
}

/**
 * Summarize capability status for display
 *
 * @param {Object} caps - Capability report from queryCapabilities
 * @returns {string} Human-readable summary
 */
function summarizeCapabilities(caps) {
  if (!caps.available) {
    return `${caps.agentId}: unavailable (${caps.warnings.join('; ')})`;
  }

  const features = [];
  if (caps.hasMcp) features.push('MCP');
  if (caps.mcpSocketSupport) features.push('Socket');
  if (caps.capabilities.includes(AgentCapability.STREAMING)) features.push('Streaming');
  if (caps.capabilities.includes(AgentCapability.FILE_EDIT)) features.push('FileEdit');
  if (caps.capabilities.includes(AgentCapability.TERMINAL)) features.push('Terminal');

  return `${caps.name} v${caps.version || '?'}: [${features.join(', ')}]`;
}

module.exports = {
  commandExists,
  getCommandPath,
  getCommandVersion,
  findAgentConfig,
  checkEnvVars,
  detectMcpCapability,
  queryCapabilities,
  scanAllAgents,
  getAvailableAgents,
  getMcpCapableAgents,
  validateAgentForOrchestrator,
  summarizeCapabilities
};
