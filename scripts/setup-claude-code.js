#!/usr/bin/env node
/**
 * Interactive setup script for Claude Code integration
 * Usage: npx @terminals-tech/openrouter-agents --setup-claude
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const CLAUDE_SOURCE = path.join(PACKAGE_ROOT, '.claude');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(msg, color = '') {
  console.log(`${color}${msg}${COLORS.reset}`);
}

function copyRecursive(src, dest) {
  const copied = [];

  if (!fs.existsSync(src)) {
    throw new Error(`Source not found: ${src}`);
  }

  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      // Skip settings.local.json (user-specific)
      if (entry === 'settings.local.json') continue;

      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      copied.push(...copyRecursive(srcPath, destPath));
    }
  } else {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
    copied.push(dest);
  }

  return copied;
}

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  log('\n' + '='.repeat(55), COLORS.cyan);
  log('  OpenRouter Agents - Claude Code Setup', COLORS.bright);
  log('='.repeat(55) + '\n', COLORS.cyan);

  log(`Platform: ${os.platform()}`, COLORS.dim);

  // Check source exists
  if (!fs.existsSync(CLAUDE_SOURCE)) {
    log('Error: .claude directory not found in package.', COLORS.red);
    process.exit(1);
  }

  // List what will be installed
  log('This will install:', COLORS.bright);
  log('  - Slash commands (/mcp-status, /mcp-research, etc.)', COLORS.cyan);
  log('  - Tool hints hook', COLORS.cyan);
  log('  - MCP settings.json', COLORS.cyan);
  log('  - Portable .mcp.json configuration\n', COLORS.cyan);

  // Ask installation location
  log('Installation options:', COLORS.bright);
  log('  1. Project directory (./.claude) - team-shared', COLORS.dim);
  log('  2. User directory (~/.claude) - personal', COLORS.dim);
  log('  3. Cancel\n', COLORS.dim);

  const choice = await prompt('Select option [1-3]: ');

  let targetDir;
  const projectTarget = path.join(process.cwd(), '.claude');
  const userTarget = path.join(os.homedir(), '.claude');

  switch (choice) {
    case '1':
      targetDir = projectTarget;
      break;
    case '2':
      targetDir = userTarget;
      break;
    case '3':
    default:
      log('\nSetup cancelled.', COLORS.yellow);
      process.exit(0);
  }

  // Check for existing files
  if (fs.existsSync(targetDir)) {
    const overwrite = await prompt(`\n${targetDir} exists. Merge/overwrite? [y/N]: `);
    if (overwrite.toLowerCase() !== 'y') {
      log('Setup cancelled.', COLORS.yellow);
      process.exit(0);
    }
  }

  // Copy files
  try {
    log(`\nInstalling to ${targetDir}...`, COLORS.cyan);
    const copied = copyRecursive(CLAUDE_SOURCE, targetDir);
    log(`\nSuccess! Installed ${copied.length} files.`, COLORS.green);

    // Create .mcp.json for project install
    if (choice === '1') {
      const mcpJsonPath = path.join(process.cwd(), '.mcp.json');
      const mcpConfig = {
        mcpServers: {
          'openrouter-agents': {
            command: 'npx',
            args: ['@terminals-tech/openrouter-agents', '--stdio'],
            env: {
              OPENROUTER_API_KEY: '${OPENROUTER_API_KEY}',
              INDEXER_ENABLED: 'true',
              MCP_ENABLE_TASKS: 'true'
            }
          }
        }
      };
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2));
      log(`Created ${mcpJsonPath}`, COLORS.green);
    }

    log('\nNext steps:', COLORS.bright);
    log('  1. Set OPENROUTER_API_KEY in your environment', COLORS.cyan);
    log('  2. Restart Claude Code to load new commands', COLORS.cyan);
    log('  3. Type /mcp-status to verify connection\n', COLORS.cyan);

    log('Available slash commands:', COLORS.bright);
    log('  /mcp-status         - Check server health', COLORS.dim);
    log('  /mcp-research       - Run sync research', COLORS.dim);
    log('  /mcp-async-research - Run async research', COLORS.dim);
    log('  /mcp-search         - Search knowledge base', COLORS.dim);
    log('  /mcp-query          - Execute SQL query\n', COLORS.dim);

  } catch (err) {
    log(`\nError: ${err.message}`, COLORS.red);
    process.exit(1);
  }
}

// Handle direct invocation or --setup-claude flag
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { copyRecursive, main };
