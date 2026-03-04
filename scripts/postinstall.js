#!/usr/bin/env node
/**
 * Postinstall script for @terminals-tech/openrouter-agents (Zero CLI)
 * Supports:
 *   --verify: Validate installation readiness
 *   --detect-providers: Detect installed providers (Claude Code, OpenCode)
 *   --sync-config: Sync MCP configuration between providers
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

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

/**
 * Detect installed providers (Claude Code, OpenCode)
 * Uses the unified ProviderRegistry from src/adapters
 */
async function detectProviders() {
  const { cyan, green, yellow, reset, bright, dim } = colors;

  console.log(`\n${cyan}=== Provider Detection ===${reset}\n`);

  let providers = [];

  // Use ProviderRegistry for detection (consolidated approach)
  try {
    const { getProviderRegistry } = require('../src/adapters');
    providers = getProviderRegistry().detectInstalled();

    // Display detected providers
    for (const provider of providers) {
      console.log(`  ${green}✓${reset} ${provider.name}: ${dim}${provider.version}${reset}`);
    }

    // Show non-installed providers
    const allProviderIds = ['claude-code', 'opencode'];
    const installedIds = providers.map(p => p.id);
    for (const id of allProviderIds) {
      if (!installedIds.includes(id)) {
        const name = id === 'claude-code' ? 'Claude Code' : 'OpenCode';
        console.log(`  ${dim}○ ${name}: not installed${reset}`);
      }
    }
  } catch (err) {
    // Fallback to legacy detection if adapters not available
    console.log(`  ${dim}(Using legacy detection: ${err.message})${reset}`);

    // Check Claude Code
    const claudeConfigDir = path.join(os.homedir(), '.claude');
    if (fs.existsSync(claudeConfigDir)) {
      let version = 'installed';
      try {
        const { execSync } = require('child_process');
        version = execSync('claude --version 2>/dev/null', { encoding: 'utf8' }).trim();
      } catch {}
      providers.push({
        id: 'claude-code',
        name: 'Claude Code',
        version,
        configPath: path.join(claudeConfigDir, 'settings.json')
      });
      console.log(`  ${green}✓${reset} Claude Code: ${dim}${version}${reset}`);
    } else {
      console.log(`  ${dim}○ Claude Code: not installed${reset}`);
    }

    // Check OpenCode
    try {
      const { execSync } = require('child_process');
      const opencodeVersion = execSync('opencode --version 2>/dev/null', { encoding: 'utf8' }).trim();
      const configPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
      providers.push({
        id: 'opencode',
        name: 'OpenCode',
        version: opencodeVersion,
        configPath
      });
      console.log(`  ${green}✓${reset} OpenCode: ${dim}${opencodeVersion}${reset}`);
    } catch {
      console.log(`  ${dim}○ OpenCode: not installed${reset}`);
    }
  }

  // Summary
  console.log('');
  if (providers.length > 1) {
    console.log(`${bright}Multiple providers detected!${reset}`);
    console.log(`${dim}Run with --sync-config to sync MCP configuration.${reset}`);
  } else if (providers.length === 1) {
    console.log(`${bright}${providers[0].name} detected.${reset}`);
    console.log(`${dim}Zero CLI will integrate with ${providers[0].name}.${reset}`);
  } else {
    console.log(`${yellow}No providers detected.${reset}`);
    console.log(`${dim}Install Claude Code or OpenCode for enhanced features.${reset}`);
  }

  return providers;
}

/**
 * Sync MCP configuration between providers
 */
async function syncConfig() {
  const { cyan, green, yellow, red, reset, bright, dim } = colors;

  console.log(`\n${cyan}=== Configuration Sync ===${reset}\n`);

  const providers = await detectProviders();

  if (providers.length < 2) {
    console.log(`\n${yellow}Need at least 2 providers to sync.${reset}`);
    return;
  }

  // Load templates
  const templatesDir = path.join(__dirname, '..', 'templates');

  // Sync to Claude Code
  const claudeProvider = providers.find(p => p.id === 'claude-code');
  if (claudeProvider) {
    const templatePath = path.join(templatesDir, 'claude-settings.json');
    if (fs.existsSync(templatePath)) {
      const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

      // Check if settings exist
      if (fs.existsSync(claudeProvider.configPath)) {
        const existing = JSON.parse(fs.readFileSync(claudeProvider.configPath, 'utf8'));

        // Merge MCP servers
        if (!existing.mcpServers?.['openrouter-research']) {
          existing.mcpServers = existing.mcpServers || {};
          existing.mcpServers['openrouter-research'] = template.mcpServers['openrouter-research'];
          fs.writeFileSync(claudeProvider.configPath, JSON.stringify(existing, null, 2));
          console.log(`  ${green}✓${reset} Added openrouter-research to Claude Code`);
        } else {
          console.log(`  ${dim}○ openrouter-research already in Claude Code${reset}`);
        }
      }
    }
  }

  // Sync to OpenCode
  const opencodeProvider = providers.find(p => p.id === 'opencode');
  if (opencodeProvider) {
    const templatePath = path.join(templatesDir, 'opencode.json');
    if (fs.existsSync(templatePath)) {
      const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

      // Check if config exists
      const configDir = path.dirname(opencodeProvider.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      if (fs.existsSync(opencodeProvider.configPath)) {
        const existing = JSON.parse(fs.readFileSync(opencodeProvider.configPath, 'utf8'));

        // Merge MCP servers
        if (!existing.mcp?.['openrouter-research']) {
          existing.mcp = existing.mcp || {};
          existing.mcp['openrouter-research'] = template.mcp['openrouter-research'];
          fs.writeFileSync(opencodeProvider.configPath, JSON.stringify(existing, null, 2));
          console.log(`  ${green}✓${reset} Added openrouter-research to OpenCode`);
        } else {
          console.log(`  ${dim}○ openrouter-research already in OpenCode${reset}`);
        }
      } else {
        // Create new config with MCP server
        fs.writeFileSync(opencodeProvider.configPath, JSON.stringify({
          '$schema': 'https://opencode.ai/config.json',
          mcp: template.mcp
        }, null, 2));
        console.log(`  ${green}✓${reset} Created OpenCode config with openrouter-research`);
      }
    }
  }

  console.log(`\n${bright}Sync complete!${reset}`);
  console.log(`${dim}Both providers now have access to the research MCP server.${reset}\n`);
}

// Main execution
if (process.argv.includes('--verify')) {
  runVerify().catch(err => {
    console.error('Verification error:', err.message);
    process.exit(1);
  });
} else if (process.argv.includes('--detect-providers')) {
  detectProviders().catch(err => {
    console.error('Detection error:', err.message);
    process.exit(1);
  });
} else if (process.argv.includes('--sync-config')) {
  syncConfig().catch(err => {
    console.error('Sync error:', err.message);
    process.exit(1);
  });
} else if (process.env.npm_lifecycle_event === 'postinstall') {
  // During npm install, detect providers and show relevant setup info
  (async () => {
    showBanner();
    const providers = await detectProviders();

    // Auto-sync if multiple providers detected
    if (providers.length > 1) {
      console.log('\nSyncing configuration to detected providers...\n');
      await syncConfig();
    }
  })().catch(err => {
    // Non-fatal during postinstall
    console.error('Warning:', err.message);
  });
}
