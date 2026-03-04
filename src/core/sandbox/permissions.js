/**
 * Unified Permissions System
 *
 * Abstracts permission checking across Claude Code and OpenCode environments.
 * Provides a unified API for checking, syncing, and managing permissions.
 *
 * @module core/sandbox/permissions
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Permission pattern types
 */
const PermissionType = {
  BASH: 'Bash',
  READ: 'Read',
  EDIT: 'Edit',
  WRITE: 'Write',
  WEB_FETCH: 'WebFetch',
  SKILL: 'Skill',
  MCP: 'MCP'
};

/**
 * Unified permission system that works across Claude Code and OpenCode
 */
class UnifiedPermissions {
  /**
   * @param {Object} config - Configuration options
   * @param {string} [config.claudeSettingsPath] - Path to Claude settings
   * @param {string} [config.opencodeConfigPath] - Path to OpenCode config
   * @param {boolean} [config.autoLoad=false] - Auto-load on construction
   */
  constructor(config = {}) {
    this.claudeSettingsPath = config.claudeSettingsPath ||
      path.join(os.homedir(), '.claude', 'settings.json');
    this.opencodeConfigPath = config.opencodeConfigPath ||
      path.join(os.homedir(), '.config', 'opencode', 'opencode.json');

    this.claudePermissions = null;
    this.opencodePermissions = null;
    this.unified = null;

    if (config.autoLoad) {
      this.load().catch(() => {
        // Silent fail on auto-load
      });
    }
  }

  /**
   * Load permissions from both providers
   * @returns {Promise<void>}
   */
  async load() {
    await Promise.all([
      this.loadClaudePermissions(),
      this.loadOpencodePermissions()
    ]);
    this.unified = this.generateUnified();
  }

  /**
   * Load Claude Code permissions from settings.json
   * @returns {Promise<void>}
   */
  async loadClaudePermissions() {
    try {
      const content = await fs.readFile(this.claudeSettingsPath, 'utf-8');
      const settings = JSON.parse(content);

      this.claudePermissions = {
        allow: settings.permissions?.allow || [],
        deny: settings.permissions?.deny || [],
        defaultMode: settings.permissions?.defaultMode || 'ask'
      };
    } catch (error) {
      // Claude settings not found or invalid - use defaults
      this.claudePermissions = {
        allow: [],
        deny: [],
        defaultMode: 'ask'
      };
    }
  }

  /**
   * Load OpenCode permissions from opencode.json
   * OpenCode uses MCP-level permissions, less granular than Claude
   * @returns {Promise<void>}
   */
  async loadOpencodePermissions() {
    try {
      const content = await fs.readFile(this.opencodeConfigPath, 'utf-8');
      const config = JSON.parse(content);

      // OpenCode doesn't have explicit allow/deny lists
      // Instead, extract enabled MCP servers and infer permissions
      const mcpServers = config.mcp || {};
      const enabledServers = Object.entries(mcpServers)
        .filter(([_, cfg]) => cfg.enabled !== false)
        .map(([name]) => `mcp__${name}__*`);

      this.opencodePermissions = {
        allow: enabledServers,
        deny: [],
        defaultMode: 'allow' // OpenCode is more permissive by default
      };
    } catch (error) {
      // OpenCode config not found - use defaults
      this.opencodePermissions = {
        allow: [],
        deny: [],
        defaultMode: 'allow'
      };
    }
  }

  /**
   * Check if action is allowed by EITHER provider (union)
   * @param {string} action - Action to check (e.g., "Bash(npm run test)")
   * @param {Object} context - Additional context
   * @param {string} [context.provider] - Specific provider to check
   * @returns {boolean} - True if action is allowed
   */
  canExecute(action, context = {}) {
    if (!this.unified) {
      throw new Error('Permissions not loaded. Call load() first.');
    }

    // Check explicit deny first (both providers)
    if (this.unified.deny.some(pattern => this.checkPattern(pattern, action))) {
      return false;
    }

    // Check explicit allow (either provider)
    if (this.unified.allow.some(pattern => this.checkPattern(pattern, action))) {
      return true;
    }

    // Fall back to default mode
    // If EITHER provider defaults to allow, we allow (most permissive)
    return this.unified.defaultMode === 'allow' ||
           this.unified.defaultMode === 'dontAsk';
  }

  /**
   * Check if pattern matches action
   * Supports Claude-style glob patterns:
   * - Bash(npm run:*) matches "Bash(npm run test)"
   * - Read(./src/**) matches "Read(./src/core/index.js)"
   * - /mcp* matches "/mcp-research"
   * - mcp__* matches "mcp__plugin_name__tool"
   *
   * @param {string} pattern - Permission pattern with wildcards
   * @param {string} action - Action to check
   * @returns {boolean} - True if pattern matches action
   */
  checkPattern(pattern, action) {
    // Exact match
    if (pattern === action) {
      return true;
    }

    // Claude uses ":*" as a separator between command and args
    // e.g., "Bash(npm run:*)" should match "Bash(npm run test)"
    // and "Bash(rm -rf :*)" should match "Bash(rm -rf /)"
    // and "Bash(git :*)" should match "Bash(git status)"

    // Convert glob pattern to regex
    let regexPattern = pattern
      .replace(/\./g, '\\.')  // Escape dots
      .replace(/\*\*/g, '§§') // Placeholder for **
      .replace(/\s+:\s*\*/g, '\\s+.*') // " :*" or ":*" becomes space + anything
      .replace(/:\*/g, '\\s+.*') // ":*" (no space before) becomes space + anything
      .replace(/\*/g, '[^/()]*') // * matches non-slash/paren chars
      .replace(/§§/g, '.*')   // ** matches everything
      .replace(/\(/g, '\\(')  // Escape parens
      .replace(/\)/g, '\\)')
      .replace(/-/g, '\\-');  // Escape dashes

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(action);
  }

  /**
   * Generate unified permission set from both providers
   * Union of allows, intersection of denies (most permissive + most restrictive)
   * @returns {Object} - Unified permissions
   */
  generateUnified() {
    if (!this.claudePermissions || !this.opencodePermissions) {
      throw new Error('Permissions not loaded from both providers');
    }

    // Union of allow lists (either provider allows it)
    const allowSet = new Set([
      ...this.claudePermissions.allow,
      ...this.opencodePermissions.allow
    ]);

    // Union of deny lists (either provider denies it)
    const denySet = new Set([
      ...this.claudePermissions.deny,
      ...this.opencodePermissions.deny
    ]);

    // Most permissive default mode
    const defaultMode =
      this.claudePermissions.defaultMode === 'dontAsk' ||
      this.opencodePermissions.defaultMode === 'allow'
        ? 'dontAsk'
        : 'ask';

    return {
      allow: Array.from(allowSet),
      deny: Array.from(denySet),
      defaultMode,
      sources: {
        claude: this.claudePermissions,
        opencode: this.opencodePermissions
      }
    };
  }

  /**
   * Sync permissions from source provider to target provider
   * @param {'claude'|'opencode'} source - Source provider
   * @param {'claude'|'opencode'} target - Target provider
   * @returns {Promise<void>}
   */
  async syncPermissions(source, target) {
    if (!this.unified) {
      throw new Error('Permissions not loaded. Call load() first.');
    }

    const sourcePerms = this.unified.sources[source];
    if (!sourcePerms) {
      throw new Error(`Invalid source provider: ${source}`);
    }

    if (target === 'claude') {
      // Sync to Claude settings
      const settings = JSON.parse(
        await fs.readFile(this.claudeSettingsPath, 'utf-8')
      );

      settings.permissions = {
        ...settings.permissions,
        allow: sourcePerms.allow,
        deny: sourcePerms.deny
      };

      await fs.writeFile(
        this.claudeSettingsPath,
        JSON.stringify(settings, null, 2),
        'utf-8'
      );
    } else if (target === 'opencode') {
      // Sync to OpenCode config
      // Note: OpenCode permissions are less granular
      // We can only enable/disable MCP servers
      const config = JSON.parse(
        await fs.readFile(this.opencodeConfigPath, 'utf-8')
      );

      // Extract MCP server permissions from source
      const mcpPermissions = sourcePerms.allow.filter(p =>
        p.startsWith('mcp__') || p.startsWith('/mcp')
      );

      // Update OpenCode MCP server enabled status
      if (config.mcp) {
        for (const [serverName, serverConfig] of Object.entries(config.mcp)) {
          const mcpPattern = `mcp__${serverName}__*`;
          serverConfig.enabled = mcpPermissions.some(p =>
            this.checkPattern(p, mcpPattern)
          );
        }
      }

      await fs.writeFile(
        this.opencodeConfigPath,
        JSON.stringify(config, null, 2),
        'utf-8'
      );
    } else {
      throw new Error(`Invalid target provider: ${target}`);
    }

    // Reload after sync
    await this.load();
  }

  /**
   * Add permission to both providers
   * @param {string} permission - Permission pattern to add
   * @param {'allow'|'deny'} type - Permission type
   * @returns {Promise<void>}
   */
  async addPermission(permission, type = 'allow') {
    if (!this.unified) {
      throw new Error('Permissions not loaded. Call load() first.');
    }

    // Add to Claude
    try {
      const settings = JSON.parse(
        await fs.readFile(this.claudeSettingsPath, 'utf-8')
      );

      if (!settings.permissions[type].includes(permission)) {
        settings.permissions[type].push(permission);
        await fs.writeFile(
          this.claudeSettingsPath,
          JSON.stringify(settings, null, 2),
          'utf-8'
        );
      }
    } catch (error) {
      // Claude settings not accessible
    }

    // Add to OpenCode (if MCP-related)
    if (permission.startsWith('mcp__') || permission.startsWith('/mcp')) {
      try {
        const config = JSON.parse(
          await fs.readFile(this.opencodeConfigPath, 'utf-8')
        );

        // Extract server name from permission
        const match = permission.match(/mcp__([^_]+)__/);
        if (match && config.mcp?.[match[1]]) {
          config.mcp[match[1]].enabled = type === 'allow';
          await fs.writeFile(
            this.opencodeConfigPath,
            JSON.stringify(config, null, 2),
            'utf-8'
          );
        }
      } catch (error) {
        // OpenCode config not accessible
      }
    }

    // Reload
    await this.load();
  }

  /**
   * Remove permission from both providers
   * @param {string} permission - Permission pattern to remove
   * @param {'allow'|'deny'} type - Permission type
   * @returns {Promise<void>}
   */
  async removePermission(permission, type = 'allow') {
    if (!this.unified) {
      throw new Error('Permissions not loaded. Call load() first.');
    }

    // Remove from Claude
    try {
      const settings = JSON.parse(
        await fs.readFile(this.claudeSettingsPath, 'utf-8')
      );

      settings.permissions[type] = settings.permissions[type].filter(
        p => p !== permission
      );

      await fs.writeFile(
        this.claudeSettingsPath,
        JSON.stringify(settings, null, 2),
        'utf-8'
      );
    } catch (error) {
      // Claude settings not accessible
    }

    // Remove from OpenCode (if MCP-related)
    if (permission.startsWith('mcp__') || permission.startsWith('/mcp')) {
      try {
        const config = JSON.parse(
          await fs.readFile(this.opencodeConfigPath, 'utf-8')
        );

        const match = permission.match(/mcp__([^_]+)__/);
        if (match && config.mcp?.[match[1]]) {
          config.mcp[match[1]].enabled = false;
          await fs.writeFile(
            this.opencodeConfigPath,
            JSON.stringify(config, null, 2),
            'utf-8'
          );
        }
      } catch (error) {
        // OpenCode config not accessible
      }
    }

    // Reload
    await this.load();
  }

  /**
   * Get all allowed actions for a specific type
   * @param {string} type - Permission type (Bash, Read, Edit, etc.)
   * @returns {string[]} - List of allowed patterns
   */
  getAllowedForType(type) {
    if (!this.unified) {
      throw new Error('Permissions not loaded. Call load() first.');
    }

    const prefix = `${type}(`;
    return this.unified.allow.filter(p => p.startsWith(prefix));
  }

  /**
   * Check if provider is available
   * @param {'claude'|'opencode'} provider - Provider name
   * @returns {boolean} - True if provider config exists
   */
  hasProvider(provider) {
    return this.unified?.sources?.[provider]?.allow?.length > 0 ||
           this.unified?.sources?.[provider]?.deny?.length > 0;
  }

  /**
   * Get permission summary
   * @returns {Object} - Summary of permissions
   */
  getSummary() {
    if (!this.unified) {
      return {
        loaded: false,
        error: 'Permissions not loaded'
      };
    }

    return {
      loaded: true,
      unified: {
        allowCount: this.unified.allow.length,
        denyCount: this.unified.deny.length,
        defaultMode: this.unified.defaultMode
      },
      claude: {
        available: this.hasProvider('claude'),
        allowCount: this.unified.sources.claude.allow.length,
        denyCount: this.unified.sources.claude.deny.length
      },
      opencode: {
        available: this.hasProvider('opencode'),
        allowCount: this.unified.sources.opencode.allow.length,
        denyCount: this.unified.sources.opencode.deny.length
      }
    };
  }
}

module.exports = {
  UnifiedPermissions,
  PermissionType
};
