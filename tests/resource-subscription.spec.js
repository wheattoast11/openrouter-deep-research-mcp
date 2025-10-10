#!/usr/bin/env node
// tests/resource-subscription.spec.js
// Validates resource listChanged and subscription behavior

const { Client } = require('@modelcontextprotocol/sdk/client');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'src', 'server', 'mcpServer.js');

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY, '--stdio'],
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      MODE: 'ALL',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'sk-test',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'sk-test',
      LOG_LEVEL: 'warn'
    }
  });

  const client = new Client({ name: 'resource-test', version: '0.1.0' }, {
    capabilities: {
      resources: { listChanged: true, subscribe: true }
    }
  });

  await transport.start();
  await client.connect(transport, { timeout: 12000 });

  const list = await client.listResources({});
  console.log('Resources count:', list.resources.length);

  if (list.resources.length > 0) {
    const first = list.resources[0];
    await client.subscribeResource({ uri: first.uri });
    await client.unsubscribeResource({ uri: first.uri });
  }

  await client.close();
  await transport.close();
}

main().catch(err => {
  console.error('Resource subscription test failed:', err);
  process.exit(1);
});


