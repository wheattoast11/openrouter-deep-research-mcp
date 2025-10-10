#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const { setTimeout: delay } = require('timers/promises');
const WebSocket = require('ws');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'src', 'server', 'mcpServer.js');

async function spawnServer(env, port) {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      ...env,
      SERVER_PORT: String(port),
      LOG_LEVEL: 'warn'
    },
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

async function testAsyncLifecycleOverHttp() {
  console.log('\n=== Async Lifecycle over HTTP ===');
  const PORT = 38601;
  const server = await spawnServer({
    MODE: 'AGENT',
    SERVER_API_KEY: 'async-test-secret',
    MCP_ENABLE_PROMPTS: 'true',
    MCP_ENABLE_RESOURCES: 'true'
  }, PORT);

  try {
    const streamable = require('@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');
    const { Client } = require('@modelcontextprotocol/sdk/dist/cjs/client/client.js');
    const { StreamableHTTPClientTransport } = streamable;

    const transport = new StreamableHTTPClientTransport(`http://127.0.0.1:${PORT}/mcp`, {
      fetch,
      requestInit: {
        headers: {
          Authorization: 'Bearer async-test-secret'
        }
      }
    });

    const client = new Client({ name: 'async-http-test', version: '1.0.0' }, { capabilities: { tools: {} } });
    await transport.start();
    await client.connect(transport, { timeout: 15000 });

    const submit = await client.callTool({
      name: 'submit_research',
      arguments: {
        query: 'test async lifecycle http',
        async: true
      }
    });

    assert(submit.structuredContent?.job_id, 'submit_research must return job_id');
    const jobId = submit.structuredContent.job_id;
    console.log(`✓ Submitted job ${jobId}`);

    let status;
    for (let i = 0; i < 20; i++) {
      status = await client.callTool({
        name: 'get_job_status',
        arguments: { job_id: jobId }
      });
      const payload = status.structuredContent || {};
      console.log(`   status: ${payload.status}`);
      if (payload.status === 'succeeded' || payload.status === 'failed') break;
      await delay(500);
    }

    assert(status.structuredContent, 'status should return structured content');
    assert(status.structuredContent.status, 'status should include status field');

    if (status.structuredContent.status !== 'succeeded') {
      console.warn(`⚠️ Job ${jobId} ended with status ${status.structuredContent.status}`);
    }

    const result = await client.callTool({
      name: 'get_job_result',
      arguments: { job_id: jobId }
    });

    assert(result.structuredContent, 'result should include structuredContent');
    console.log('✓ Retrieved final result');

    const cancel = await client.callTool({
      name: 'cancel_job',
      arguments: { job_id: jobId }
    });
    assert(cancel.structuredContent?.accepted !== undefined, 'cancel job should respond even if job already finished');
    console.log('✓ Cancel operation acknowledged');

    await transport.close();
  } finally {
    await server.stop();
  }
}

async function testAsyncLifecycleOverWebSocket() {
  console.log('\n=== Async Lifecycle over WebSocket ===');
  const PORT = 38602;
  const server = await spawnServer({
    MODE: 'AGENT',
    SERVER_API_KEY: 'async-ws-secret'
  }, PORT);

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/mcp/ws?token=async-ws-secret`);

    await new Promise((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    function sendRpc(payload) {
      const id = payload.id ?? Math.floor(Math.random() * 1e9);
      const message = { jsonrpc: '2.0', id, ...payload };
      ws.send(JSON.stringify(message));
      return id;
    }

    async function call(method, params) {
      return new Promise((resolve, reject) => {
        const id = sendRpc({ method, params });
        const listener = (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.id === id) {
            ws.off('message', listener);
            if (msg.error) return reject(new Error(msg.error.message));
            resolve(msg.result);
          }
        };
        ws.on('message', listener);
      });
    }

    const init = await call('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} }
    });
    assert(init.capabilities?.tools !== undefined, 'initialize response should include capabilities');

    const submit = await call('tools/call', {
      name: 'submit_research',
      arguments: { query: 'test async ws flow', async: true }
    });
    assert(submit.structuredContent?.job_id, 'submit_research must return job_id via WS');
    const jobId = submit.structuredContent.job_id;

    const events = [];
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type?.startsWith('job.')) {
          events.push(msg);
        }
      } catch (_) {}
    });

    let finalStatus;
    for (let i = 0; i < 20; i++) {
      finalStatus = await call('tools/call', {
        name: 'get_job_status',
        arguments: { job_id: jobId }
      });
      const status = finalStatus.structuredContent?.status;
      if (status === 'succeeded' || status === 'failed') break;
      await delay(500);
    }

    assert(events.length > 0, 'Should receive job events over WS');
    console.log(`✓ Received ${events.length} job events over WS`);

    const result = await call('tools/call', {
      name: 'get_job_result',
      arguments: { job_id: jobId }
    });
    assert(result.structuredContent, 'Result should include structured content via WS');

    await call('tools/call', {
      name: 'cancel_job',
      arguments: { job_id: jobId }
    });

    ws.close();
  } finally {
    await server.stop();
  }
}

(async () => {
  try {
    await testAsyncLifecycleOverHttp();
    await testAsyncLifecycleOverWebSocket();
    console.log('\n✅ Async lifecycle tests passed');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Async lifecycle tests failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
