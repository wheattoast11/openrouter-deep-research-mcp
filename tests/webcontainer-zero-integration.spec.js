#!/usr/bin/env node
// tests/webcontainer-zero-integration.spec.js
// Integration tests simulating terminals.tech /zero webcontainer environment

const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');
const { Client } = require('@modelcontextprotocol/sdk/client');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'src', 'server', 'mcpServer.js');

async function testMinimalEnvStartup() {
  console.log('\n[webcontainer] testing minimal env startup (simulates /zero)');
  
  // Minimal env: no API keys, CPU-only, local HF fallback
  const env = {
    PATH: process.env.PATH,
    USERPROFILE: process.env.USERPROFILE,
    TEMP: process.env.TEMP,
    MODE: 'AGENT',
    EMBEDDINGS_PROVIDER: 'huggingface',
    EMBEDDINGS_FALLBACK_LOCAL: 'true',
    PGLITE_DATA_DIR: path.join(PROJECT_ROOT, 'test-webcontainer-db'),
    PGLITE_RELAXED_DURABILITY: 'true',
    LOG_LEVEL: 'warn',
    OPENROUTER_API_KEY: 'sk-test-webcontainer'
  };
  
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY, '--stdio'],
    cwd: PROJECT_ROOT,
    env
  });
  
  const client = new Client({ name: 'webcontainer-test', version: '0.1.0' }, {
    capabilities: {
      tools: {}
    }
  });
  
  await transport.start();
  await client.connect(transport, { timeout: 30000 });
  
  const tools = await client.listTools({});
  assert(tools.tools.length > 0, 'tools should be exposed');
  
  const agentTool = tools.tools.find(t => t.name === 'agent');
  assert(agentTool, 'agent tool should be available in AGENT mode');
  
  const ping = await client.callTool({ name: 'ping', arguments: {} });
  assert(ping.content?.length, 'ping should respond');
  
  await client.close();
  await transport.close();
  
  console.log('[webcontainer] minimal env startup successful');
}

async function testAgentModeSimplicity() {
  console.log('\n[webcontainer] testing AGENT mode simplicity (single tool)');
  
  const env = {
    PATH: process.env.PATH,
    USERPROFILE: process.env.USERPROFILE,
    TEMP: process.env.TEMP,
    MODE: 'AGENT',
    EMBEDDINGS_PROVIDER: 'huggingface',
    PGLITE_DATA_DIR: path.join(PROJECT_ROOT, 'test-webcontainer-db'),
    LOG_LEVEL: 'warn',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'sk-test'
  };
  
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY, '--stdio'],
    cwd: PROJECT_ROOT,
    env
  });
  
  const client = new Client({ name: 'zero-simple', version: '0.1.0' }, {
    capabilities: {
      tools: {},
      prompts: { listChanged: true }
    }
  });
  
  await transport.start();
  await client.connect(transport, { timeout: 30000 });
  
  const tools = await client.listTools({});
  const agentTool = tools.tools.find(t => t.name === 'agent');
  const researchTool = tools.tools.find(t => t.name === 'research');
  
  assert(agentTool, 'agent tool exposed in AGENT mode');
  assert(!researchTool, 'research tool hidden in AGENT mode');
  
  await client.close();
  await transport.close();
  
  console.log('[webcontainer] AGENT mode simplicity validated');
}

async function main() {
  await testMinimalEnvStartup();
  await testAgentModeSimplicity();
  console.log('\nWebcontainer /zero integration tests completed.');
}

main().catch(err => {
  console.error('Webcontainer integration tests failed:', err);
  process.exit(1);
});

