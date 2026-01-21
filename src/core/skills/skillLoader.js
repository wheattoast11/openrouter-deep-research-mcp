const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('../../utils/logger').child('SkillLoader');

/**
 * Skill Loader - reads, converts, and syncs skills between
 * Claude Code and OpenCode formats.
 *
 * Supports:
 * - Claude Code skills (.claude/skills/ with YAML frontmatter)
 * - Claude Code agents (.claude/agents/ with YAML frontmatter)
 * - Claude Code commands (.claude/commands/)
 * - OpenCode agents (AGENTS.md or .opencode/agents/)
 */
class SkillLoader {
  constructor(config = {}) {
    this.claudeSkillsPath = config.claudeSkillsPath || path.join(os.homedir(), '.claude', 'skills');
    this.claudeAgentsPath = config.claudeAgentsPath || path.join(os.homedir(), '.claude', 'agents');
    this.claudeCommandsPath = config.claudeCommandsPath || path.join(os.homedir(), '.claude', 'commands');
    this.opencodeAgentsPath = config.opencodeAgentsPath || '.opencode/agents';
    this.agentsMdPath = config.agentsMdPath || 'AGENTS.md';
  }

  /**
   * Parse YAML frontmatter from markdown content
   * Simple YAML parser for basic key-value pairs
   * @param {string} content - Markdown content with optional frontmatter
   * @returns {Object} - { frontmatter, body }
   */
  parseFrontmatter(content) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (match) {
      try {
        const frontmatter = this.parseSimpleYaml(match[1]);
        const body = match[2].trim();
        return { frontmatter, body };
      } catch (err) {
        // Invalid YAML, treat as plain markdown
        return { frontmatter: {}, body: content.trim() };
      }
    }

    return { frontmatter: {}, body: content.trim() };
  }

  /**
   * Simple YAML parser for basic key-value pairs
   * Handles strings, numbers, booleans, and basic multiline strings
   * @param {string} yamlContent - YAML content
   * @returns {Object} - Parsed object
   */
  parseSimpleYaml(yamlContent) {
    const result = {};
    const lines = yamlContent.split('\n');
    let currentKey = null;
    let multilineValue = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Check for key-value pair
      const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);

      if (kvMatch) {
        // Save previous multiline value if exists
        if (currentKey && multilineValue.length > 0) {
          result[currentKey] = multilineValue.join('\n').trim();
          multilineValue = [];
        }

        const [, key, value] = kvMatch;
        currentKey = key;

        if (value) {
          // Parse value
          result[key] = this.parseYamlValue(value);
          currentKey = null;
        }
      } else if (currentKey) {
        // Continuation of multiline value
        multilineValue.push(line);
      }
    }

    // Save last multiline value if exists
    if (currentKey && multilineValue.length > 0) {
      result[currentKey] = multilineValue.join('\n').trim();
    }

    return result;
  }

  /**
   * Parse a YAML value (string, number, boolean)
   * @param {string} value - YAML value string
   * @returns {any} - Parsed value
   */
  parseYamlValue(value) {
    const trimmed = value.trim();

    // Boolean
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;

    // Null/undefined
    if (trimmed === 'null' || trimmed === '~') return null;

    // Number
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return parseFloat(trimmed);
    }

    // String (remove quotes if present)
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }

    // Plain string
    return trimmed;
  }

  /**
   * Load from Claude Code skill format (.claude/skills/skill-name/)
   * Skills can be in subdirectories with markdown files
   * @param {string} skillPath - Path to skill directory or file
   * @returns {Object} - Parsed skill object
   */
  async loadClaudeSkill(skillPath) {
    const stat = await fs.stat(skillPath);

    if (stat.isDirectory()) {
      // Find primary markdown file in directory
      const files = await fs.readdir(skillPath);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      if (mdFiles.length === 0) {
        throw new Error(`No markdown files found in skill directory: ${skillPath}`);
      }

      // Use first markdown file (convention: skill-name.md or index.md)
      const primaryFile = mdFiles.find(f => f === 'index.md') || mdFiles[0];
      const fullPath = path.join(skillPath, primaryFile);
      const content = await fs.readFile(fullPath, 'utf-8');
      const { frontmatter, body } = this.parseFrontmatter(content);

      return {
        type: 'claude-skill',
        name: frontmatter.name || path.basename(skillPath),
        description: frontmatter.description || '',
        model: frontmatter.model,
        instructions: body,
        metadata: frontmatter,
        sourcePath: fullPath
      };
    } else {
      // Single markdown file
      const content = await fs.readFile(skillPath, 'utf-8');
      const { frontmatter, body } = this.parseFrontmatter(content);

      return {
        type: 'claude-skill',
        name: frontmatter.name || path.basename(skillPath, '.md'),
        description: frontmatter.description || '',
        model: frontmatter.model,
        instructions: body,
        metadata: frontmatter,
        sourcePath: skillPath
      };
    }
  }

  /**
   * Load from Claude Code agent format (.claude/agents/agent-name.md)
   * Agents have YAML frontmatter with name, description, model
   * @param {string} agentPath - Path to agent file
   * @returns {Object} - Parsed agent object
   */
  async loadClaudeAgent(agentPath) {
    const content = await fs.readFile(agentPath, 'utf-8');
    const { frontmatter, body } = this.parseFrontmatter(content);

    return {
      type: 'claude-agent',
      name: frontmatter.name || path.basename(agentPath, '.md'),
      description: frontmatter.description || '',
      model: frontmatter.model,
      instructions: body,
      metadata: frontmatter,
      sourcePath: agentPath
    };
  }

  /**
   * Load from Claude Code commands (.claude/commands/)
   * Commands are typically shell scripts or markdown with instructions
   * @param {string} commandPath - Path to command file
   * @returns {Object} - Parsed command object
   */
  async loadClaudeCommand(commandPath) {
    const content = await fs.readFile(commandPath, 'utf-8');
    const ext = path.extname(commandPath);
    const basename = path.basename(commandPath, ext);

    // Try to parse frontmatter if markdown
    if (ext === '.md') {
      const { frontmatter, body } = this.parseFrontmatter(content);

      return {
        type: 'claude-command',
        name: frontmatter.name || basename,
        description: frontmatter.description || '',
        instructions: body,
        metadata: frontmatter,
        sourcePath: commandPath
      };
    }

    // Shell script or other format
    return {
      type: 'claude-command',
      name: basename,
      description: `Command: ${basename}`,
      instructions: content,
      metadata: {},
      sourcePath: commandPath
    };
  }

  /**
   * Load from OpenCode format (AGENTS.md sections or .opencode/agents/)
   * OpenCode uses markdown headers (##) to denote agents
   * @param {string} agentPath - Path to AGENTS.md or agent file
   * @returns {Array<Object>} - Array of parsed agent objects
   */
  async loadOpencodeAgents(agentPath) {
    const content = await fs.readFile(agentPath, 'utf-8');
    const agents = [];

    // Parse markdown sections starting with ## (agent headers)
    const agentRegex = /^## (.+?)$/gm;
    const matches = [...content.matchAll(agentRegex)];

    if (matches.length === 0) {
      // Single agent file without headers
      return [{
        type: 'opencode-agent',
        name: path.basename(agentPath, '.md'),
        description: content.split('\n')[0] || '',
        instructions: content.trim(),
        metadata: {},
        sourcePath: agentPath
      }];
    }

    // Extract each agent section
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const agentName = match[1].trim();
      const startIndex = match.index + match[0].length;
      const endIndex = i < matches.length - 1 ? matches[i + 1].index : content.length;
      const agentContent = content.substring(startIndex, endIndex).trim();

      // Extract description (first paragraph) and instructions
      const lines = agentContent.split('\n').filter(l => l.trim());
      const description = lines[0] || '';
      const instructions = lines.slice(1).join('\n').trim();

      agents.push({
        type: 'opencode-agent',
        name: agentName,
        description,
        instructions,
        metadata: {},
        sourcePath: agentPath
      });
    }

    return agents;
  }

  /**
   * Convert Claude skill/agent to OpenCode agent format
   * @param {Object} claudeSkill - Claude skill or agent object
   * @returns {string} - OpenCode markdown format
   */
  convertToOpencode(claudeSkill) {
    const { name, description, instructions } = claudeSkill;

    let output = `## ${name}\n\n`;

    if (description) {
      output += `${description}\n\n`;
    }

    if (instructions) {
      output += `${instructions}\n`;
    }

    return output;
  }

  /**
   * Convert OpenCode agent to Claude skill format
   * @param {Object} opencodeAgent - OpenCode agent object
   * @returns {string} - Claude markdown with YAML frontmatter
   */
  convertToClaude(opencodeAgent) {
    const { name, description, instructions, metadata = {} } = opencodeAgent;

    const frontmatter = {
      name,
      description: description || '',
      ...metadata
    };

    const yamlFrontmatter = this.stringifySimpleYaml(frontmatter);

    return `---\n${yamlFrontmatter}---\n\n${instructions || ''}`;
  }

  /**
   * Simple YAML stringifier for basic key-value pairs
   * @param {Object} obj - Object to stringify
   * @returns {string} - YAML string
   */
  stringifySimpleYaml(obj) {
    const lines = [];

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'string') {
        // Multiline strings
        if (value.includes('\n')) {
          lines.push(`${key}: |`);
          value.split('\n').forEach(line => {
            lines.push(`  ${line}`);
          });
        } else {
          lines.push(`${key}: ${value}`);
        }
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        lines.push(`${key}: ${value}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Discover all skills from both platforms
   * @returns {Object} - { claude: [...], opencode: [...] }
   */
  async discoverSkills() {
    const discovered = {
      claude: {
        skills: [],
        agents: [],
        commands: []
      },
      opencode: []
    };

    // Discover Claude skills
    try {
      const skillsExist = await fs.access(this.claudeSkillsPath)
        .then(() => true)
        .catch(() => false);

      if (skillsExist) {
        const skillDirs = await fs.readdir(this.claudeSkillsPath);

        for (const dir of skillDirs) {
          const fullPath = path.join(this.claudeSkillsPath, dir);
          try {
            const skill = await this.loadClaudeSkill(fullPath);
            discovered.claude.skills.push(skill);
          } catch (err) {
            // Skip invalid skills
            logger.warn(`Failed to load skill ${dir}:`, err.message);
          }
        }
      }
    } catch (err) {
      // Skills directory doesn't exist
    }

    // Discover Claude agents
    try {
      const agentsExist = await fs.access(this.claudeAgentsPath)
        .then(() => true)
        .catch(() => false);

      if (agentsExist) {
        const agentFiles = await fs.readdir(this.claudeAgentsPath);

        for (const file of agentFiles) {
          if (file.endsWith('.md')) {
            const fullPath = path.join(this.claudeAgentsPath, file);
            try {
              const agent = await this.loadClaudeAgent(fullPath);
              discovered.claude.agents.push(agent);
            } catch (err) {
              logger.warn(`Failed to load agent ${file}:`, err.message);
            }
          }
        }
      }
    } catch (err) {
      // Agents directory doesn't exist
    }

    // Discover Claude commands
    try {
      const commandsExist = await fs.access(this.claudeCommandsPath)
        .then(() => true)
        .catch(() => false);

      if (commandsExist) {
        const commandFiles = await fs.readdir(this.claudeCommandsPath);

        for (const file of commandFiles) {
          const fullPath = path.join(this.claudeCommandsPath, file);
          const stat = await fs.stat(fullPath);

          if (stat.isFile()) {
            try {
              const command = await this.loadClaudeCommand(fullPath);
              discovered.claude.commands.push(command);
            } catch (err) {
              logger.warn(`Failed to load command ${file}:`, err.message);
            }
          }
        }
      }
    } catch (err) {
      // Commands directory doesn't exist
    }

    // Discover OpenCode agents (AGENTS.md)
    try {
      const agentsMdExists = await fs.access(this.agentsMdPath)
        .then(() => true)
        .catch(() => false);

      if (agentsMdExists) {
        const agents = await this.loadOpencodeAgents(this.agentsMdPath);
        discovered.opencode.push(...agents);
      }
    } catch (err) {
      // AGENTS.md doesn't exist
    }

    // Discover OpenCode agents directory
    try {
      const opencodeExists = await fs.access(this.opencodeAgentsPath)
        .then(() => true)
        .catch(() => false);

      if (opencodeExists) {
        const agentFiles = await fs.readdir(this.opencodeAgentsPath);

        for (const file of agentFiles) {
          if (file.endsWith('.md')) {
            const fullPath = path.join(this.opencodeAgentsPath, file);
            try {
              const agents = await this.loadOpencodeAgents(fullPath);
              discovered.opencode.push(...agents);
            } catch (err) {
              logger.warn(`Failed to load OpenCode agent ${file}:`, err.message);
            }
          }
        }
      }
    } catch (err) {
      // OpenCode directory doesn't exist
    }

    return discovered;
  }

  /**
   * Sync skills between platforms
   * @param {Object} options - { from: 'claude'|'opencode', to: 'claude'|'opencode', dryRun: false }
   * @returns {Object} - { synced: [...], errors: [...] }
   */
  async syncSkills(options = {}) {
    const { from = 'claude', to = 'opencode', dryRun = false } = options;
    const result = { synced: [], errors: [] };

    const discovered = await this.discoverSkills();

    if (from === 'claude' && to === 'opencode') {
      // Sync Claude → OpenCode
      const allClaude = [
        ...discovered.claude.skills,
        ...discovered.claude.agents,
        ...discovered.claude.commands
      ];

      let agentsMdContent = '# AGENTS.md\n\n';
      agentsMdContent += 'Last verified: ' + new Date().toISOString().split('T')[0] + '\n\n';

      for (const skill of allClaude) {
        try {
          const opencodeFormat = this.convertToOpencode(skill);
          agentsMdContent += opencodeFormat + '\n\n';
          result.synced.push(skill.name);
        } catch (err) {
          result.errors.push({ skill: skill.name, error: err.message });
        }
      }

      if (!dryRun) {
        await fs.writeFile(this.agentsMdPath, agentsMdContent, 'utf-8');
      }
    } else if (from === 'opencode' && to === 'claude') {
      // Sync OpenCode → Claude
      const targetDir = this.claudeAgentsPath;

      // Ensure target directory exists
      if (!dryRun) {
        await fs.mkdir(targetDir, { recursive: true });
      }

      for (const agent of discovered.opencode) {
        try {
          const claudeFormat = this.convertToClaude(agent);
          const targetPath = path.join(targetDir, `${agent.name}.md`);

          if (!dryRun) {
            await fs.writeFile(targetPath, claudeFormat, 'utf-8');
          }

          result.synced.push(agent.name);
        } catch (err) {
          result.errors.push({ agent: agent.name, error: err.message });
        }
      }
    } else {
      throw new Error(`Unsupported sync direction: ${from} → ${to}`);
    }

    return result;
  }
}

module.exports = { SkillLoader };
