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

    // First Research wizard
    await runFirstResearchWizard();

  } catch (err) {
    log(`\nError: ${err.message}`, COLORS.red);
    process.exit(1);
  }
}

/**
 * First Research Wizard - helps new users run their first query
 */
async function runFirstResearchWizard() {
  log('='.repeat(55), COLORS.cyan);
  log('  First Research Wizard', COLORS.bright);
  log('='.repeat(55) + '\n', COLORS.cyan);

  // Check if API key is set
  if (!process.env.OPENROUTER_API_KEY) {
    log('Note: OPENROUTER_API_KEY not set in current shell.', COLORS.yellow);
    log('You can still complete setup, but research requires the key.\n', COLORS.dim);
  }

  const tryFirst = await prompt('Would you like to run a test research query? [y/N]: ');

  if (tryFirst.toLowerCase() !== 'y') {
    log('\nSetup complete! Run /mcp-status in Claude Code to verify.\n', COLORS.green);
    return;
  }

  // Example queries
  log('\nExample queries:', COLORS.bright);
  log('  1. What is the MCP (Model Context Protocol)?', COLORS.dim);
  log('  2. Latest developments in AI agents', COLORS.dim);
  log('  3. Best practices for prompt engineering', COLORS.dim);
  log('  4. Custom query\n', COLORS.dim);

  const queryChoice = await prompt('Select [1-4]: ');

  const queries = {
    '1': 'What is the MCP (Model Context Protocol) and how does it work?',
    '2': 'What are the latest developments in AI agents and multi-agent systems?',
    '3': 'What are best practices for prompt engineering in 2025?'
  };

  let query;
  if (queryChoice === '4') {
    query = await prompt('Enter your query: ');
    if (!query.trim()) {
      log('\nNo query entered. Setup complete!', COLORS.yellow);
      return;
    }
  } else {
    query = queries[queryChoice] || queries['1'];
  }

  log(`\nRunning research: "${query}"`, COLORS.cyan);
  log('This may take 30-60 seconds...\n', COLORS.dim);

  // Run the research using the ping tool first to verify connection
  try {
    const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
    const tools = require('../src/server/tools');
    const dbClient = require('../src/utils/dbClient');

    // Initialize database
    log('Initializing database...', COLORS.dim);
    await dbClient.initDB();

    // Run a quick ping
    log('Checking server connection...', COLORS.dim);
    const pingResult = await tools.pingTool({});
    if (pingResult) {
      log('[OK] Server responding', COLORS.green);
    }

    // Check if API key exists for research
    if (!process.env.OPENROUTER_API_KEY) {
      log('\n[!] Skipping research - OPENROUTER_API_KEY not set', COLORS.yellow);
      log('    Set the key and try: /mcp-research "' + query.substring(0, 40) + '..."\n', COLORS.dim);
      return;
    }

    // Run quick research
    log('Running research...', COLORS.dim);
    const result = await tools.conductResearch({
      query,
      costPreference: 'low',
      outputFormat: 'bullet_points'
    });

    if (result && result.content && result.content[0]) {
      const text = result.content[0].text || JSON.stringify(result.content[0]);
      log('\n' + '='.repeat(55), COLORS.green);
      log('  Research Complete!', COLORS.bright);
      log('='.repeat(55) + '\n', COLORS.green);

      // Show abbreviated result
      const lines = text.split('\n').slice(0, 15);
      for (const line of lines) {
        log(line, COLORS.dim);
      }
      if (text.split('\n').length > 15) {
        log('\n... (truncated, see full report in research_outputs/)\n', COLORS.dim);
      }
    }

    log('\nFirst research successful! Your server is ready.', COLORS.green);
    log('Use /mcp-research in Claude Code for more queries.\n', COLORS.cyan);

  } catch (err) {
    log(`\nResearch test failed: ${err.message}`, COLORS.yellow);
    log('This is OK - you can still use /mcp-research in Claude Code.', COLORS.dim);
    log('Make sure OPENROUTER_API_KEY is set in your environment.\n', COLORS.dim);
  }
}

// Handle direct invocation or --setup-claude flag
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { copyRecursive, main };
