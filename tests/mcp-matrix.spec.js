#!/usr/bin/env node
// tests/mcp-matrix.spec.js
// Transport/Auth/Mode matrix tests for the openrouter-agents MCP server

const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');
const { Client } = require('@modelcontextprotocol/sdk/client');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp');
const { setTimeout: delay } = require('timers/promises');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'src', 'server', 'mcpServer.js');

function stepLog(id, message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${id}] ${message}`);
}

async function waitForHttp(url, timeoutMs = 15000, intervalMs = 250) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return true;
    } catch (_) {
      // Ignore until timeout
    }
    await delay(intervalMs);
  }
  return false;
}

async function runWithClient(id, client, testFn) {
  try {
    await testFn(client);
  } finally {
    try {
      await client.close();
    } catch (_) {
      // Swallow close errors – transport already gone
    }
  }
}

function parseToolText(result) {
  const content = Array.isArray(result?.content)
    ? result.content.find((c) => c?.type === 'text')?.text
    : null;
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch (_) {
    return null;
  }
}

async function executeMatrixScenario(scenario) {
  const { id, mode, transport, httpAuth, expectedToolNames } = scenario;
  stepLog(id, `Starting scenario (${transport.toUpperCase()} | MODE=${mode})`);

  if (transport === 'stdio') {
    const env = {
      ...process.env,
      MODE: mode,
      NODE_NO_WARNINGS: '1',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'sk-test',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'sk-test',
      LOG_LEVEL: 'warn'
    };

    const transportInstance = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER_ENTRY, '--stdio'],
      cwd: PROJECT_ROOT,
      env
    });

    const client = new Client({
      name: 'matrix-runner',
      version: '0.1.0'
    }, {
      capabilities: {
        tools: {},
        prompts: { listChanged: true },
        resources: { listChanged: true, subscribe: true }
      }
    });

    await transportInstance.start();
    await client.connect(transportInstance);

    await runMatrixAssertions(id, client, expectedToolNames);

    return;
  }

  if (transport === 'streamable-http') {
    const port = scenario.port;
    const env = {
      ...process.env,
      MODE: mode,
      SERVER_PORT: String(port),
      SERVER_API_KEY: httpAuth?.apiKey || '',
      ALLOW_NO_API_KEY: httpAuth?.allowNoAuth ? 'true' : 'false',
      AUTH_JWKS_URL: httpAuth?.jwksUrl || '',
      AUTH_EXPECTED_AUD: httpAuth?.expectedAudience || 'mcp-server',
      NODE_NO_WARNINGS: '1',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'sk-test',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'sk-test',
      LOG_LEVEL: 'warn'
    };

    const serverProc = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: PROJECT_ROOT,
      env,
      stdio: ['ignore', 'ignore', 'inherit']
    });

    const cleanup = async () => {
      if (!serverProc.killed) {
        serverProc.kill('SIGTERM');
      }
      await delay(250);
    };

    const ready = await waitForHttp(`http://127.0.0.1:${port}/about`);
    assert(ready, `${id}: Server did not become ready on port ${port}`);

    const headers = {};
    if (httpAuth?.apiKey) {
      headers['Authorization'] = `Bearer ${httpAuth.apiKey}`;
    } else if (httpAuth?.bearerToken) {
      headers['Authorization'] = `Bearer ${httpAuth.bearerToken}`;
    }

    const transportInstance = new StreamableHTTPClientTransport(`http://127.0.0.1:${port}/mcp`, {
      requestInit: { headers },
      fetch
    });

    const client = new Client({
      name: 'matrix-runner',
      version: '0.1.0'
    }, {
      capabilities: {
        tools: {},
        prompts: { listChanged: true },
        resources: { listChanged: true, subscribe: true }
      }
    });

    try {
      await transportInstance.start();
      await client.connect(transportInstance, { timeout: 12000 });
      await runMatrixAssertions(id, client, expectedToolNames);
    } finally {
      await cleanup();
    }

    return;
  }

  throw new Error(`Unknown transport: ${transport}`);
}

async function runMatrixAssertions(id, client, expectedToolNames) {
  stepLog(id, 'Fetching tool catalog');
  const listResult = await client.listTools({});
  const serverToolNames = new Set(listResult.tools.map((t) => t.name));

  for (const name of expectedToolNames.includes) {
    assert(serverToolNames.has(name), `${id}: Expected tool "${name}" to be exposed`);
  }

  for (const name of expectedToolNames.excludes) {
    assert(!serverToolNames.has(name), `${id}: Tool "${name}" should be hidden in MODE=${expectedToolNames.mode}`);
  }

  stepLog(id, 'Calling ping tool');
  const pingResult = await client.callTool({
    name: 'ping',
    arguments: {}
  });
  assert(pingResult?.content?.length, `${id}: ping returned empty content`);

  stepLog(id, 'Calling list_tools tool for normalization check');
  const listToolsToolResult = await client.callTool({
    name: 'list_tools',
    arguments: {}
  });
  const parsedList = parseToolText(listToolsToolResult?.result || listToolsToolResult);
  assert(parsedList !== null, `${id}: list_tools result should be valid JSON`);

  stepLog(id, 'Skipping agent call check for now (async heavy)');
}

const MATRIX = [
  {
    id: 'stdio-all',
    mode: 'ALL',
    transport: 'stdio',
    expectedToolNames: {
      includes: ['agent', 'ping', 'list_tools', 'search_tools', 'cancel_job'],
      excludes: [],
      mode: 'ALL'
    }
  },
  {
    id: 'stdio-agent-mode',
    mode: 'AGENT',
    transport: 'stdio',
    expectedToolNames: {
      includes: ['agent', 'ping', 'list_tools', 'search_tools'],
      excludes: ['research', 'retrieve', 'conduct_research'],
      mode: 'AGENT'
    }
  },
  {
    id: 'http-all-apikey',
    mode: 'ALL',
    transport: 'streamable-http',
    port: 38111,
    httpAuth: { apiKey: 'matrix-secret' },
    expectedToolNames: {
      includes: ['agent', 'ping', 'list_tools', 'search_tools'],
      excludes: [],
      mode: 'ALL'
    }
  },
  {
    id: 'http-manual-noauth',
    mode: 'MANUAL',
    transport: 'streamable-http',
    port: 38112,
    httpAuth: { allowNoAuth: true },
    expectedToolNames: {
      includes: ['research', 'conduct_research', 'retrieve', 'ping'],
      excludes: ['agent'],
      mode: 'MANUAL'
    }
  }
];

(async () => {
  console.log('=== MCP Transport/Auth/Mode Matrix Tests ===');
  const results = [];

  for (const scenario of MATRIX) {
    try {
      await executeMatrixScenario(scenario);
      results.push({ id: scenario.id, status: 'PASS' });
      stepLog(scenario.id, '✅ PASS');
    } catch (error) {
      results.push({ id: scenario.id, status: 'FAIL', error });
      stepLog(scenario.id, `❌ FAIL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log('\n=== Summary ===');
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.length - passCount;
  for (const r of results) {
    console.log(`${r.status === 'PASS' ? '✅' : '❌'} ${r.id}`);
    if (r.status === 'FAIL') {
      console.error(r.error);
    }
  }

  if (failCount > 0) {
    console.log(`\n${failCount} scenario(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('\nAll scenarios passed.');
  }
})();


