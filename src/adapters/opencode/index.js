/**
 * OpenCode Adapter
 * Provider-specific integration for OpenCode CLI
 *
 * @module adapters/opencode
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const OPENCODE_CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode');
const OPENCODE_CONFIG_PATH = path.join(OPENCODE_CONFIG_DIR, 'opencode.json');
const OPENCODE_GLOBAL_PATH = path.join(os.homedir(), '.opencode.json');
const OPENCODE_PROJECT_AGENTS_DIR = '.opencode/agents';

class OpencodeAdapter {
  constructor() {
    this.providerId = 'opencode';
    this.providerName = 'OpenCode';
    this.configPath = OPENCODE_CONFIG_PATH;
  }

  /**
   * Check if OpenCode is installed
   */
  isInstalled() {
    try {
      const { execSync } = require('child_process');
      execSync('which opencode', { encoding: 'utf8' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get OpenCode version
   */
  getVersion() {
    try {
      const { execSync } = require('child_process');
      const version = execSync('opencode --version 2>/dev/null', { encoding: 'utf8' }).trim();
      return version || 'unknown';
    } catch {
      return null;
    }
  }

  /**
   * Load OpenCode configuration
   */
  loadConfig() {
    // Try project config first, then global
    const paths = [
      OPENCODE_CONFIG_PATH,
      OPENCODE_GLOBAL_PATH
    ];

    for (const configPath of paths) {
      try {
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf8');
          return { config: JSON.parse(content), path: configPath };
        }
      } catch (err) {
        console.error(`[OpencodeAdapter] Failed to load ${configPath}:`, err.message);
      }
    }

    return { config: null, path: null };
  }

  /**
   * Save OpenCode configuration
   */
  saveConfig(config, configPath = OPENCODE_CONFIG_PATH) {
    try {
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      return true;
    } catch (err) {
      console.error('[OpencodeAdapter] Failed to save config:', err.message);
      return false;
    }
  }

  /**
   * Get MCP servers configured in OpenCode
   */
  getMcpServers() {
    const { config } = this.loadConfig();
    return config?.mcp || {};
  }

  /**
   * Add an MCP server to OpenCode
   */
  addMcpServer(name, mcpConfig) {
    const { config, path: configPath } = this.loadConfig();
    const newConfig = config || { '$schema': 'https://opencode.ai/config.json' };
    newConfig.mcp = newConfig.mcp || {};

    // Convert to OpenCode format
    newConfig.mcp[name] = {
      type: mcpConfig.type || 'local',
      command: Array.isArray(mcpConfig.command) ? mcpConfig.command : [mcpConfig.command],
      enabled: mcpConfig.enabled !== false,
      environment: mcpConfig.environment || mcpConfig.env || {}
    };

    return this.saveConfig(newConfig, configPath || OPENCODE_CONFIG_PATH);
  }

  /**
   * Parse AGENTS.md file
   */
  parseAgentsMd(filePath) {
    const agents = [];

    try {
      if (!fs.existsSync(filePath)) {
        return agents;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const sections = content.split(/^##\s+/m).slice(1);

      for (const section of sections) {
        const lines = section.split('\n');
        const title = lines[0]?.trim();
        const body = lines.slice(1).join('\n').trim();

        if (title) {
          agents.push({
            type: 'agent',
            name: title,
            description: body.slice(0, 500),
            content: body,
            source: 'opencode',
            path: filePath
          });
        }
      }
    } catch (err) {
      console.error('[OpencodeAdapter] Failed to parse AGENTS.md:', err.message);
    }

    return agents;
  }

  /**
   * Discover agents from OpenCode
   */
  discoverAgents(projectRoot = process.cwd()) {
    const agents = [];

    // Check AGENTS.md in project root
    const agentsMdPath = path.join(projectRoot, 'AGENTS.md');
    agents.push(...this.parseAgentsMd(agentsMdPath));

    // Check .opencode/agents directory
    const agentsDir = path.join(projectRoot, OPENCODE_PROJECT_AGENTS_DIR);
    if (fs.existsSync(agentsDir)) {
      try {
        const files = fs.readdirSync(agentsDir);
        for (const file of files) {
          if (file.endsWith('.md') || file.endsWith('.yaml') || file.endsWith('.json')) {
            const filePath = path.join(agentsDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            agents.push({
              type: 'agent',
              name: file.replace(/\.(md|yaml|json)$/, ''),
              path: filePath,
              content: content.slice(0, 500),
              source: 'opencode'
            });
          }
        }
      } catch (err) {
        console.error('[OpencodeAdapter] Failed to scan agents dir:', err.message);
      }
    }

    return agents;
  }

  /**
   * Get all capabilities
   */
  getCapabilities() {
    return {
      tools: ['file', 'shell', 'browser', 'web_search'],
      agents: ['coder', 'task', 'research'],
      mcp: true,
      tui: true,
      planMode: true,
      buildMode: true
    };
  }

  /**
   * Convert agent to Claude Code skill format
   */
  convertToClaude(agent) {
    const frontmatter = [
      '---',
      `name: ${agent.name}`,
      `description: ${agent.description?.slice(0, 100) || 'Imported from OpenCode'}`,
      '---',
      ''
    ].join('\n');

    return {
      name: agent.name,
      content: frontmatter + (agent.content || agent.instructions || ''),
      convertedFrom: 'opencode'
    };
  }

  /**
   * Get configured providers (API keys, etc.)
   */
  getProviders() {
    const { config } = this.loadConfig();
    return config?.providers || {};
  }

  /**
   * Get configured agents
   */
  getAgentConfig() {
    const { config } = this.loadConfig();
    return config?.agents || {};
  }
}

module.exports = {
  OpencodeAdapter,
  OPENCODE_CONFIG_DIR,
  OPENCODE_CONFIG_PATH,
  OPENCODE_GLOBAL_PATH,
  OPENCODE_PROJECT_AGENTS_DIR
};
