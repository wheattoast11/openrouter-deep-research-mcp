/**
 * Claude Code Adapter
 * Provider-specific integration for Claude Code CLI
 *
 * @module adapters/claude-code
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_CONFIG_DIR = path.join(os.homedir(), '.claude');
const CLAUDE_SETTINGS_PATH = path.join(CLAUDE_CONFIG_DIR, 'settings.json');
const CLAUDE_SKILLS_DIR = path.join(CLAUDE_CONFIG_DIR, 'skills');
const CLAUDE_AGENTS_DIR = path.join(CLAUDE_CONFIG_DIR, 'agents');
const CLAUDE_COMMANDS_DIR = path.join(CLAUDE_CONFIG_DIR, 'commands');

class ClaudeCodeAdapter {
  constructor() {
    this.providerId = 'claude-code';
    this.providerName = 'Claude Code';
    this.configPath = CLAUDE_SETTINGS_PATH;
  }

  /**
   * Check if Claude Code is installed
   */
  isInstalled() {
    return fs.existsSync(CLAUDE_CONFIG_DIR);
  }

  /**
   * Get Claude Code version from config
   */
  getVersion() {
    try {
      // Check for claude binary
      const { execSync } = require('child_process');
      const version = execSync('claude --version 2>/dev/null', { encoding: 'utf8' }).trim();
      return version || 'unknown';
    } catch {
      return null;
    }
  }

  /**
   * Load Claude Code settings
   */
  loadSettings() {
    try {
      if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
        const content = fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf8');
        return JSON.parse(content);
      }
    } catch (err) {
      console.error('[ClaudeCodeAdapter] Failed to load settings:', err.message);
    }
    return null;
  }

  /**
   * Save Claude Code settings
   */
  saveSettings(settings) {
    try {
      if (!fs.existsSync(CLAUDE_CONFIG_DIR)) {
        fs.mkdirSync(CLAUDE_CONFIG_DIR, { recursive: true });
      }
      fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2));
      return true;
    } catch (err) {
      console.error('[ClaudeCodeAdapter] Failed to save settings:', err.message);
      return false;
    }
  }

  /**
   * Get MCP servers configured in Claude Code
   */
  getMcpServers() {
    const settings = this.loadSettings();
    return settings?.mcpServers || {};
  }

  /**
   * Add an MCP server to Claude Code
   */
  addMcpServer(name, config) {
    const settings = this.loadSettings() || {};
    settings.mcpServers = settings.mcpServers || {};
    settings.mcpServers[name] = config;
    return this.saveSettings(settings);
  }

  /**
   * Get permissions configured in Claude Code
   */
  getPermissions() {
    const settings = this.loadSettings();
    return settings?.permissions || {};
  }

  /**
   * Get hooks configured in Claude Code
   */
  getHooks() {
    const settings = this.loadSettings();
    return settings?.hooks || [];
  }

  /**
   * Add a hook to Claude Code
   */
  addHook(hook) {
    const settings = this.loadSettings() || {};
    settings.hooks = settings.hooks || [];

    // Check for duplicate
    const exists = settings.hooks.some(h =>
      h.event === hook.event &&
      JSON.stringify(h.command) === JSON.stringify(hook.command)
    );

    if (!exists) {
      settings.hooks.push(hook);
      return this.saveSettings(settings);
    }
    return true;
  }

  /**
   * Discover skills from Claude Code
   */
  discoverSkills() {
    const skills = [];

    // Scan skills directory
    if (fs.existsSync(CLAUDE_SKILLS_DIR)) {
      try {
        const files = fs.readdirSync(CLAUDE_SKILLS_DIR);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const filePath = path.join(CLAUDE_SKILLS_DIR, file);
            const content = fs.readFileSync(filePath, 'utf8');
            skills.push({
              type: 'skill',
              name: file.replace('.md', ''),
              path: filePath,
              content: content.slice(0, 500),
              source: 'claude-code'
            });
          }
        }
      } catch (err) {
        console.error('[ClaudeCodeAdapter] Failed to scan skills:', err.message);
      }
    }

    return skills;
  }

  /**
   * Discover agents from Claude Code
   */
  discoverAgents() {
    const agents = [];

    if (fs.existsSync(CLAUDE_AGENTS_DIR)) {
      try {
        const files = fs.readdirSync(CLAUDE_AGENTS_DIR);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const filePath = path.join(CLAUDE_AGENTS_DIR, file);
            const content = fs.readFileSync(filePath, 'utf8');
            agents.push({
              type: 'agent',
              name: file.replace('.md', ''),
              path: filePath,
              content: content.slice(0, 500),
              source: 'claude-code'
            });
          }
        }
      } catch (err) {
        console.error('[ClaudeCodeAdapter] Failed to scan agents:', err.message);
      }
    }

    return agents;
  }

  /**
   * Discover slash commands from Claude Code
   */
  discoverCommands() {
    const commands = [];

    if (fs.existsSync(CLAUDE_COMMANDS_DIR)) {
      try {
        const files = fs.readdirSync(CLAUDE_COMMANDS_DIR);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const filePath = path.join(CLAUDE_COMMANDS_DIR, file);
            const content = fs.readFileSync(filePath, 'utf8');
            commands.push({
              type: 'command',
              name: file.replace('.md', ''),
              path: filePath,
              content: content.slice(0, 500),
              source: 'claude-code'
            });
          }
        }
      } catch (err) {
        console.error('[ClaudeCodeAdapter] Failed to scan commands:', err.message);
      }
    }

    return commands;
  }

  /**
   * Get all capabilities
   */
  getCapabilities() {
    return {
      tools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Task', 'WebFetch', 'WebSearch'],
      hooks: ['PreToolUse', 'PostToolUse', 'SessionStart', 'SessionEnd', 'SubagentStop', 'UserPromptSubmit'],
      skills: true,
      subagents: true,
      commands: true,
      mcp: true
    };
  }

  /**
   * Convert skill to OpenCode agent format
   */
  convertToOpencode(skill) {
    return {
      name: skill.name,
      description: this._extractDescription(skill.content),
      instructions: skill.content,
      model: 'anthropic/claude-sonnet-4',
      convertedFrom: 'claude-code'
    };
  }

  /**
   * Extract description from skill content
   */
  _extractDescription(content) {
    // Look for frontmatter description
    const descMatch = content.match(/description:\s*(.+)/i);
    if (descMatch) {
      return descMatch[1].trim();
    }

    // Use first paragraph
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
    return lines[0]?.slice(0, 200) || '';
  }
}

module.exports = {
  ClaudeCodeAdapter,
  CLAUDE_CONFIG_DIR,
  CLAUDE_SETTINGS_PATH,
  CLAUDE_SKILLS_DIR,
  CLAUDE_AGENTS_DIR,
  CLAUDE_COMMANDS_DIR
};
