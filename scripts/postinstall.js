#!/usr/bin/env node
/**
 * Postinstall script for @terminals-tech/openrouter-agents
 * Supports: --verify flag to validate installation readiness
 */

const path = require('path');
const fs = require('fs');

// ANSI colors
const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m'
};

/**
 * Run verification checks
 */
async function runVerify() {
  const { cyan, green, red, yellow, reset, bright, dim } = colors;

  console.log(`\n${cyan}=== OpenRouter Agents - Installation Verification ===${reset}\n`);

  const checks = [];
  let hasErrors = false;
  let hasWarnings = false;

  // Check 1: Node version
  const nodeVersion = process.versions.node;
  const [major] = nodeVersion.split('.').map(Number);
  if (major >= 18) {
    checks.push({ name: 'Node.js version', status: 'pass', message: `v${nodeVersion}` });
  } else {
    checks.push({ name: 'Node.js version', status: 'fail', message: `v${nodeVersion} (requires 18+)` });
    hasErrors = true;
  }

  // Check 2: OpenRouter API key
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey && apiKey.startsWith('sk-or-') && apiKey.length >= 20) {
    checks.push({ name: 'OPENROUTER_API_KEY', status: 'pass', message: 'Configured' });
  } else if (apiKey) {
    checks.push({ name: 'OPENROUTER_API_KEY', status: 'fail', message: 'Invalid format (should start with sk-or-)' });
    hasErrors = true;
  } else {
    checks.push({ name: 'OPENROUTER_API_KEY', status: 'warn', message: 'Not set (required for research)' });
    hasWarnings = true;
  }

  // Check 3: Server API key (for HTTP mode)
  const serverKey = process.env.SERVER_API_KEY;
  if (serverKey && serverKey.length >= 6) {
    checks.push({ name: 'SERVER_API_KEY', status: 'pass', message: 'Configured' });
  } else {
    checks.push({ name: 'SERVER_API_KEY', status: 'warn', message: 'Not set (needed for HTTP mode)' });
    hasWarnings = true;
  }

  // Check 4: Data directory writable
  const dataDir = process.env.PGLITE_DATA_DIR || './researchAgentDB';
  try {
    const testDir = path.resolve(dataDir);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    const testFile = path.join(testDir, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    checks.push({ name: 'Data directory', status: 'pass', message: `${dataDir} writable` });
  } catch (e) {
    checks.push({ name: 'Data directory', status: 'fail', message: `${dataDir} not writable: ${e.message}` });
    hasErrors = true;
  }

  // Check 5: Required files exist
  const pkgRoot = path.resolve(__dirname, '..');
  const requiredFiles = ['src/server/mcpServer.js', 'config.js'];
  for (const file of requiredFiles) {
    const filePath = path.join(pkgRoot, file);
    if (fs.existsSync(filePath)) {
      checks.push({ name: `File: ${file}`, status: 'pass', message: 'Found' });
    } else {
      checks.push({ name: `File: ${file}`, status: 'fail', message: 'Missing' });
      hasErrors = true;
    }
  }

  // Print results
  console.log(`${bright}Verification Results:${reset}\n`);

  for (const check of checks) {
    let icon, color;
    switch (check.status) {
      case 'pass': icon = '[OK]'; color = green; break;
      case 'fail': icon = '[X]'; color = red; break;
      case 'warn': icon = '[!]'; color = yellow; break;
      default: icon = '[?]'; color = dim;
    }
    console.log(`  ${color}${icon}${reset} ${check.name}: ${dim}${check.message}${reset}`);
  }

  // Summary
  console.log('');
  if (hasErrors) {
    console.log(`${red}${bright}Verification failed${reset}`);
    console.log(`${dim}  Fix the errors above before proceeding.${reset}\n`);
    process.exit(1);
  } else if (hasWarnings) {
    console.log(`${yellow}${bright}Verification passed with warnings${reset}`);
    console.log(`${dim}  Server can start, but some features may be limited.${reset}`);
  } else {
    console.log(`${green}${bright}All checks passed!${reset}`);
  }

  // Next steps
  console.log(`\n${bright}Next steps:${reset}`);
  if (!apiKey) {
    console.log(`  1. Set your API key: ${cyan}export OPENROUTER_API_KEY="sk-or-..."${reset}`);
    console.log(`  2. Start the server: ${cyan}npx @terminals-tech/openrouter-agents --stdio${reset}`);
  } else {
    console.log(`  ${cyan}npx @terminals-tech/openrouter-agents --stdio${reset}`);
  }
  console.log('');
}

/**
 * Show postinstall banner (during npm install)
 */
function showBanner() {
  const { cyan, reset, bright } = colors;

  console.log(`
${cyan}================================================================${reset}
  ${bright}OpenRouter Agents MCP Server${reset}
${cyan}================================================================${reset}

  ${bright}Quick setup:${reset}
  claude mcp add openrouter-agents -- \\
    npx @terminals-tech/openrouter-agents --stdio

  ${bright}Verify installation:${reset}
  npx @terminals-tech/openrouter-agents --verify

  ${bright}Interactive setup:${reset}
  npx @terminals-tech/openrouter-agents --setup-claude

${cyan}================================================================${reset}
`);
}

// Main execution
if (process.argv.includes('--verify')) {
  runVerify().catch(err => {
    console.error('Verification error:', err.message);
    process.exit(1);
  });
} else if (process.env.npm_lifecycle_event === 'postinstall') {
  showBanner();
}
