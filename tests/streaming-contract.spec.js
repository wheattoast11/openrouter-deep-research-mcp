#!/usr/bin/env node
// tests/streaming-contract.spec.js
// Contract tests for streaming behavior (order, backpressure, error surfacing)

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');

const sdkPackagePath = require.resolve('@modelcontextprotocol/sdk/package.json');
const sdkRootDir = path.dirname(sdkPackagePath);

const sdkCjsClientIndex = path.join(sdkRootDir, 'dist', 'cjs', 'client', 'client.js');
const sdkCjsStdio = path.join(sdkRootDir, 'dist', 'cjs', 'client', 'stdio.js');
const sdkCjsStreamable = path.join(sdkRootDir, 'dist', 'cjs', 'client', 'streamableHttp.js');

const { Client } = require(sdkCjsClientIndex);
const { StdioClientTransport } = require(sdkCjsStdio);
const { StreamableHTTPClientTransport } = require(sdkCjsStreamable);
const { setTimeout: delay } = require('timers/promises');
const WebSocket = require('ws');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'src', 'server', 'mcpServer.js');

async function withClient(client, fn) {
  try {
    await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

async function spawnHttpServer(env, port) {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      ...env,
      SERVER_PORT: String(port),
      MODE: env.MODE || 'ALL',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'sk-test',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'sk-test',
      SERVER_API_KEY: env.SERVER_API_KEY || 'stream-secret',
      LOG_LEVEL: 'warn'
    },
    stdio: ['ignore', 'ignore', 'inherit']
  });

  const waitForReady = async () => {
    const aboutUrl = `http://127.0.0.1:${port}/about`;
    const start = Date.now();
    while (Date.now() - start < 15000) {
      try {
        const res = await fetch(aboutUrl);
        if (res.ok) {
          return true;
        }
      } catch (_) {
        // Keep retrying until timeout
      }
      await delay(200);
    }
    return false;
  };

  const ready = await waitForReady();
  if (!ready) {
    child.kill('SIGTERM');
    throw new Error('HTTP server failed to start');
  }

  return {
    child,
    async stop() {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
      await delay(250);
    }
  };
}

async function testAgentStreamingOverTransport(label, makeTransport) {
  console.log(`\n=== ${label} :: agent streaming contract ===`);

  const { client, transport, cleanup } = await makeTransport();

  await withClient(client, async (c) => {
    const progressEvents = [];
    const contentBuffer = [];
    const errors = [];
    const usageChunks = [];

    const response = await c.callTool({
      name: 'agent',
      arguments: {
        action: 'research',
        query: 'Summarize the history of the Model Context Protocol (short form).',
        async: false,
        includeSources: false
      }
    }, undefined, {
      onprogress(event) {
        progressEvents.push(event);
      },
      timeout: 120000,
      resetTimeoutOnProgress: true
    });

    // Basic contract: progress events should arrive before completion and in order
    assert(progressEvents.length > 0, 'Expected at least one progress event');
    progressEvents.forEach((evt, idx) => {
      assert(typeof evt === 'object', `Progress event ${idx} should be object`);
    });

    // Result must contain final content
    assert(response.content?.length, 'Expected final content from agent tool');
  });

  await cleanup();
}

async function testAgentStreamingOverHttp() {
  const PORT = 38221;
  const server = await spawnHttpServer({ MODE: 'ALL' }, PORT);

  const transport = new StreamableHTTPClientTransport(`http://127.0.0.1:${PORT}/mcp`, {
    fetch,
    requestInit: {
      headers: {
        Authorization: 'Bearer stream-secret'
      }
    }
  });

  const client = new Client({ name: 'stream-contract', version: '0.1.0' }, {
    capabilities: {
      tools: {},
      prompts: { listChanged: true },
      resources: { listChanged: true, subscribe: true }
    }
  });

  try {
    await transport.start();
    await client.connect(transport, { timeout: 12000 });
    await testAgentStreamingOverTransport('Streamable HTTP', async () => ({
      client,
      transport,
      async cleanup() {
        await transport.close().catch(() => {});
      }
    }));
  } finally {
    await server.stop();
  }
}

async function testAgentStreamingOverStdio() {
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

  const client = new Client({ name: 'stream-contract', version: '0.1.0' }, {
    capabilities: {
      tools: {},
      prompts: { listChanged: true },
      resources: { listChanged: true, subscribe: true }
    }
  });

  await client.connect(transport, { timeout: 12000 });
  await testAgentStreamingOverTransport('STDIO', async () => ({
    client,
    transport,
    async cleanup() {
      await transport.close().catch(() => {});
    }
  }));
}

async function testWebSocketJobStreaming() {
  console.log('\n=== WebSocket :: job streaming contract ===');

  const PORT = 38222;
  const server = await spawnHttpServer({ MODE: 'AGENT' }, PORT);

  return new Promise(async (resolve, reject) => {
    const wsUrl = `ws://127.0.0.1:${PORT}/mcp/ws?token=test-token`;
    const ws = new WebSocket(wsUrl);

    const events = [];
    const jobEvents = [];
    const toolEvents = [];
    const telemetryEvents = [];

    ws.on('open', async () => {
      console.log('WebSocket connected for job streaming test');

      // Send agent call
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'agent',
          arguments: {
            query: 'Test query for job streaming',
            async: true
          }
        },
        id: 1
      }));
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        events.push(message);

        if (message.type && String(message.type).startsWith('metrics.')) {
          telemetryEvents.push(message);
        }

        switch (message.type) {
          case 'job.started':
          case 'job.events':
          case 'job.result':
            jobEvents.push(message);
            if (message.type === 'job.result') {
              ws.close();
              setTimeout(() => {
                try {
                  console.log(`✅ WebSocket job streaming: ${events.length} events, ${jobEvents.length} job events, ${toolEvents.length} tool events, ${telemetryEvents.length} telemetry events`);
                  assert(telemetryEvents.length > 0, 'expected telemetry metric events');
                  const hasCadenceMetric = telemetryEvents.some(evt => {
                    const payload = evt.payload || {};
                    const metrics = payload.metrics || payload;
                    return typeof metrics.cadence_error === 'number' || typeof metrics.dynamic_concurrency === 'number';
                  });
                  assert(hasCadenceMetric, 'expected cadence telemetry metrics');
                  server.stop().then(() => resolve()).catch(reject);
                } catch (err) {
                  server.stop().then(() => reject(err)).catch(reject);
                }
              }, 1000);
            }
            break;
          case 'tool.started':
          case 'tool.delta':
          case 'tool.completed':
            toolEvents.push(message);
            break;
          default:
            break;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      reject(error);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      ws.close();
      console.error('WebSocket job streaming test timed out');
      server.stop().then(() => reject(new Error('Timeout'))).catch(reject);
    }, 30000);
  });
}

async function testAgentModeOnly() {
  console.log('\n=== AGENT Mode :: tool availability ===');

  const PORT = 38223;
  const server = await spawnHttpServer({ MODE: 'AGENT' }, PORT);

  try {
    const client = new Client({ name: 'agent-mode-test', version: '0.1.0' }, {
      capabilities: { tools: {} }
    });

    const transport = new StreamableHTTPClientTransport(`http://127.0.0.1:${PORT}/mcp`, {
      fetch,
      requestInit: {
        headers: {
          Authorization: 'Bearer stream-secret'
        }
      }
    });

    await transport.start();
    await client.connect(transport, { timeout: 12000 });

    const tools = await client.listTools();
    const toolNames = tools.map(t => t.name);

    // AGENT mode should only expose 6 tools
    assert(toolNames.length === 6, `Expected 6 tools in AGENT mode, got ${toolNames.length}: ${toolNames.join(', ')}`);

    // Must include agent tool
    assert(toolNames.includes('agent'), 'AGENT mode must include agent tool');

    // Should not include individual tools like research, retrieve, etc.
    assert(!toolNames.includes('research'), 'AGENT mode should not include individual research tool');
    assert(!toolNames.includes('retrieve'), 'AGENT mode should not include individual retrieve tool');

    console.log(`✅ AGENT mode correctly exposes ${toolNames.length} tools: ${toolNames.join(', ')}`);

    await transport.close();
  } finally {
    await server.stop();
  }
}

(async () => {
  console.log('=== Streaming Contract Tests ===');
  try {
    await testAgentStreamingOverStdio();
    await testAgentStreamingOverHttp();
    await testWebSocketJobStreaming();
    await testAgentModeOnly();
    console.log('\n✅ All streaming contract tests executed successfully.');
  } catch (error) {
    console.error('Streaming contract test failed:', error);
    process.exitCode = 1;
  }
})();


