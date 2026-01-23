/**
 * Provider Adapters
 * Unified interface for multi-provider integration
 *
 * @module adapters
 */

'use strict';

const { ClaudeCodeAdapter } = require('./claude-code');
const { OpencodeAdapter } = require('./opencode');

/**
 * Provider registry for detecting and managing installed providers
 */
class ProviderRegistry {
  constructor() {
    this.adapters = {
      'claude-code': new ClaudeCodeAdapter(),
      'opencode': new OpencodeAdapter()
    };
  }

  /**
   * Detect all installed providers
   */
  detectInstalled() {
    const installed = [];

    for (const [id, adapter] of Object.entries(this.adapters)) {
      if (adapter.isInstalled()) {
        installed.push({
          id,
          name: adapter.providerName,
          version: adapter.getVersion(),
          configPath: adapter.configPath
        });
      }
    }

    return installed;
  }

  /**
   * Get adapter for a specific provider
   */
  getAdapter(providerId) {
    return this.adapters[providerId] || null;
  }

  /**
   * Get all MCP servers across all providers
   */
  getAllMcpServers() {
    const servers = {};

    for (const [providerId, adapter] of Object.entries(this.adapters)) {
      if (adapter.isInstalled() && adapter.getMcpServers) {
        const providerServers = adapter.getMcpServers();
        for (const [name, config] of Object.entries(providerServers)) {
          servers[`${providerId}:${name}`] = {
            ...config,
            provider: providerId
          };
        }
      }
    }

    return servers;
  }

  /**
   * Sync MCP server configuration from one provider to another
   */
  syncMcpServer(serverName, fromProvider, toProvider) {
    const fromAdapter = this.adapters[fromProvider];
    const toAdapter = this.adapters[toProvider];

    if (!fromAdapter || !toAdapter) {
      return { success: false, error: 'Invalid provider' };
    }

    const servers = fromAdapter.getMcpServers();
    const serverConfig = servers[serverName];

    if (!serverConfig) {
      return { success: false, error: 'Server not found' };
    }

    const success = toAdapter.addMcpServer(serverName, serverConfig);
    return { success, serverName, from: fromProvider, to: toProvider };
  }

  /**
   * Discover all skills/agents across providers
   */
  discoverAllSkills(projectRoot = process.cwd()) {
    const result = {
      claude: {
        skills: [],
        agents: [],
        commands: []
      },
      opencode: []
    };

    // Claude Code
    const claudeAdapter = this.adapters['claude-code'];
    if (claudeAdapter.isInstalled()) {
      result.claude.skills = claudeAdapter.discoverSkills();
      result.claude.agents = claudeAdapter.discoverAgents();
      result.claude.commands = claudeAdapter.discoverCommands();
    }

    // OpenCode
    const opencodeAdapter = this.adapters['opencode'];
    if (opencodeAdapter.isInstalled()) {
      result.opencode = opencodeAdapter.discoverAgents(projectRoot);
    }

    return result;
  }

  /**
   * Convert skill between providers
   */
  convertSkill(skill, targetProvider) {
    const sourceProvider = skill.source || skill.convertedFrom;

    if (targetProvider === 'opencode' && sourceProvider === 'claude-code') {
      return this.adapters['claude-code'].convertToOpencode(skill);
    }

    if (targetProvider === 'claude-code' && sourceProvider === 'opencode') {
      return this.adapters['opencode'].convertToClaude(skill);
    }

    return skill;
  }

  /**
   * Get combined capabilities across all providers
   */
  getCombinedCapabilities() {
    const capabilities = {
      tools: new Set(),
      hooks: new Set(),
      features: new Set()
    };

    for (const adapter of Object.values(this.adapters)) {
      if (adapter.isInstalled()) {
        const caps = adapter.getCapabilities();

        if (caps.tools) {
          caps.tools.forEach(t => capabilities.tools.add(t));
        }
        if (caps.hooks) {
          caps.hooks.forEach(h => capabilities.hooks.add(h));
        }

        // Features
        ['skills', 'subagents', 'mcp', 'tui', 'planMode', 'buildMode', 'commands']
          .filter(f => caps[f])
          .forEach(f => capabilities.features.add(f));
      }
    }

    return {
      tools: Array.from(capabilities.tools),
      hooks: Array.from(capabilities.hooks),
      features: Array.from(capabilities.features)
    };
  }
}

// Singleton instance
let registryInstance = null;

function getProviderRegistry() {
  if (!registryInstance) {
    registryInstance = new ProviderRegistry();
  }
  return registryInstance;
}

module.exports = {
  ClaudeCodeAdapter,
  OpencodeAdapter,
  ProviderRegistry,
  getProviderRegistry
};
