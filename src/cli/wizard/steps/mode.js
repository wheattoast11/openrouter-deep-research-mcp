/**
 * Step 2: Transport Mode Selection
 *
 * - STDIO mode for MCP client integration (Claude Code, Cursor)
 * - HTTP mode for REST API access
 * - ALL mode for both
 *
 * @module cli/wizard/steps/mode
 */

'use strict';

const modeOptions = [
  {
    value: 'stdio',
    label: 'STDIO (MCP Client)',
    description: 'Best for Claude Code, Cursor, VS Code integration',
    default: true,
    port: null,
  },
  {
    value: 'http',
    label: 'HTTP Server',
    description: 'REST API + SSE streaming at localhost:3002',
    default: false,
    port: 3002,
  },
  {
    value: 'all',
    label: 'Both (STDIO + HTTP)',
    description: 'Full functionality - MCP client + REST API',
    default: false,
    port: 3002,
  },
];

/**
 * Run the mode selection step
 */
async function run(rl, askSelection) {
  console.log('');
  console.log('  Choose how Zero will communicate:');
  console.log('');
  console.log('  STDIO: For MCP-compatible clients (Claude Code, Cursor)');
  console.log('  HTTP:  For REST API and web integration');
  console.log('  Both:  Maximum compatibility');
  console.log('');

  const selected = await askSelection(rl, 'Select transport mode:', modeOptions);

  // If HTTP mode, ask for port
  if (selected.value === 'http' || selected.value === 'all') {
    const readline = require('readline');
    const askPort = (question, defaultValue) => {
      return new Promise((resolve) => {
        rl.question(`  ${question} [${defaultValue}]: `, (answer) => {
          const port = parseInt(answer.trim() || defaultValue, 10);
          resolve(isNaN(port) ? defaultValue : port);
        });
      });
    };

    const port = await askPort('HTTP port', 3002);
    selected.port = port;
    console.log(`\n  Server will run on port ${port}`);
  }

  return selected;
}

module.exports = {
  run,
  modeOptions,
};
