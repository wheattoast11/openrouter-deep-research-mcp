#!/usr/bin/env node
// tests/perf-bench.js
// Performance benchmark suite for key MCP server operations

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');
const { Client } = require('@modelcontextprotocol/sdk/client');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'src', 'server', 'mcpServer.js');

async function measure(fn, label) {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return { label, durationMs: end - start, result };
}

function prettyStats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const p = (q) => {
    const idx = Math.min(sorted.length - 1, Math.floor((q / 100) * sorted.length));
    return sorted[idx];
  };
  return {
    count: sorted.length,
    min: sorted[0] || 0,
    p50: p(50),
    p95: p(95),
    p99: p(99),
    max: sorted[sorted.length - 1] || 0
  };
}

async function startStdIoServer(env = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY, '--stdio'],
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      ...env,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'sk-test',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'sk-test',
      LOG_LEVEL: 'warn'
    }
  });
  const client = new Client({ name: 'perf-bench', version: '0.1.0' }, {
    capabilities: {
      tools: {},
      prompts: { listChanged: true },
      resources: { listChanged: true, subscribe: true }
    }
  });
  await transport.start();
  await client.connect(transport, { timeout: 12000 });
  return {
    client,
    async stop() {
      await client.close().catch(() => {});
      await transport.close().catch(() => {});
    }
  };
}

async function startHttpServer(port, env = {}) {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      ...env,
      SERVER_PORT: String(port),
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'sk-test',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'sk-test',
      SERVER_API_KEY: env.SERVER_API_KEY || 'perf-secret',
      LOG_LEVEL: 'warn'
    },
    stdio: ['ignore', 'ignore', 'inherit']
  });

  const waitForReady = async () => {
    const start = Date.now();
    while (Date.now() - start < 10000) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/about`);
        if (res.ok) return true;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  };

  const ok = await waitForReady();
  if (!ok) {
    child.kill('SIGTERM');
    throw new Error('HTTP server failed to start');
  }

  const transport = new StreamableHTTPClientTransport(`http://127.0.0.1:${port}/mcp`, {
    fetch,
    requestInit: { headers: { Authorization: 'Bearer perf-secret' } }
  });
  const client = new Client({ name: 'perf-bench', version: '0.1.0' }, {
    capabilities: {
      tools: {},
      prompts: { listChanged: true },
      resources: { listChanged: true, subscribe: true }
    }
  });
  await transport.start();
  await client.connect(transport, { timeout: 12000 });

  return {
    client,
    async stop() {
      await client.close().catch(() => {});
      await transport.close().catch(() => {});
      child.kill('SIGTERM');
    }
  };
}

async function runToolCallBench(client, name, args, iterations = 5) {
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const measurement = await measure(() => client.callTool({ name, arguments: args }), `${name}-${i}`);
    samples.push(measurement.durationMs);
  }
  return prettyStats(samples);
}

async function runScenario(label, startServerFn) {
  console.log(`\n=== Scenario: ${label} ===`);
  const server = await startServerFn();
  const stats = {};

  try {
    stats.listTools = await runToolCallBench(server.client, 'list_tools', {}, 5);
    stats.ping = await runToolCallBench(server.client, 'ping', {}, 5);
    const metricsSamples = [];
    for (let i = 0; i < 3; i++) {
      const ttfbStart = performance.now();
      const response = await server.client.callTool({
        name: 'agent',
        arguments: {
          action: 'research',
          query: 'Brief history of the Model Context Protocol',
          async: false,
          includeSources: false
        }
      }, undefined, {
        onprogress(event) {
          if (event?.content && !metricsSamples[i]) {
            metricsSamples[i] = { ttfbMs: performance.now() - ttfbStart };
          }
        }
      });
      const duration = performance.now() - ttfbStart;
      metricsSamples[i] = metricsSamples[i] || {};
      metricsSamples[i].latencyMs = duration;
      metricsSamples[i].tokens = response?.usage?.totals?.total_tokens || 0;
    }
    stats.agent = {
      latencyMs: prettyStats(metricsSamples.map(s => s.latencyMs)),
      ttfbMs: prettyStats(metricsSamples.map(s => s.ttfbMs || s.latencyMs)),
      tokens: prettyStats(metricsSamples.map(s => s.tokens || 0))
    };
  } finally {
    await server.stop();
  }

  return stats;
}

async function main() {
  const scenarios = [
    { label: 'STDIO transport', runner: () => startStdIoServer({ MODE: 'ALL' }) },
    { label: 'Streamable HTTP transport', runner: () => startHttpServer(38421, { MODE: 'ALL' }) }
  ];

  const results = [];
  for (const scenario of scenarios) {
    const stats = await runScenario(scenario.label, scenario.runner);
    results.push({ scenario: scenario.label, stats });
  }

  console.log('\n=== Performance Summary ===');
  console.log(JSON.stringify({
    host: os.hostname(),
    platform: os.platform(),
    cpus: os.cpus().length,
    results
  }, null, 2));
}

main().catch(err => {
  console.error('Performance benchmark failed:', err);
  process.exit(1);
});

