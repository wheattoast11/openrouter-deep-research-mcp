#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const { setTimeout: delay } = require('timers/promises');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'src', 'server', 'mcpServer.js');

async function spawnServer(env, port) {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...env, SERVER_PORT: String(port), LOG_LEVEL: 'warn' },
    stdio: ['ignore', 'ignore', 'inherit']
  });

  const url = `http://127.0.0.1:${port}/about`;
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return {
          child,
          async stop() {
            if (!child.killed) child.kill('SIGTERM');
            await delay(200);
          }
        };
      }
    } catch (_) {}
    await delay(200);
  }

  child.kill('SIGTERM');
  throw new Error('Server failed to start');
}

(async () => {
  console.log('=== Structured Output & Resource Links ===');

  const PORT = 38801;
  const server = await spawnServer({
    MODE: 'AGENT',
    SERVER_API_KEY: 'struct-test-secret',
    MCP_ENABLE_RESOURCES: 'true'
  }, PORT);

  try {
    const { Client } = require('@modelcontextprotocol/sdk/dist/cjs/client/client.js');
    const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');

    const transport = new StreamableHTTPClientTransport(`http://127.0.0.1:${PORT}/mcp`, {
      fetch,
      requestInit: {
        headers: {
          Authorization: 'Bearer struct-test-secret'
        }
      }
    });

    const client = new Client({ name: 'structured-output', version: '1.0.0' }, { capabilities: { tools: {} } });

    await transport.start();
    await client.connect(transport, { timeout: 12000 });

    const ping = await client.callTool({ name: 'ping', arguments: { info: true } });
    assert(Array.isArray(ping.content), 'Ping should return content array');
    assert(ping.structuredContent, 'Ping should return structuredContent payload');
    console.log('✓ Ping returns structured content');

    const research = await client.callTool({
      name: 'conduct_research',
      arguments: { query: 'structured output test', async: false }
    });
    assert(research.structuredContent, 'Research should return structured content');
    if (research.structuredContent.resources) {
      assert(Array.isArray(research.structuredContent.resources), 'Resources should be array');
      console.log(`✓ Research returned ${research.structuredContent.resources.length} resource links`);
    }

    const resources = await client.listResources();
    assert(Array.isArray(resources), 'listResources should return array');
    console.log(`✓ ${resources.length} resources exposed`);

    await transport.close();
  } finally {
    await server.stop();
  }

  console.log('\n✅ Structured output/resource tests passed');
})();
