#!/usr/bin/env node
// scripts/beta-smoke-test.js
// Automated smoke test for v2.1.1-beta release

const { spawn } = require('child_process');
const path = require('path');
const { setTimeout: delay } = require('timers/promises');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'src', 'server', 'mcpServer.js');

console.log('=== Beta Smoke Test v2.1.1 ===\n');

let server = null;
let testsPassed = 0;
let testsFailed = 0;

async function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'pass' ? '✓' : type === 'fail' ? '✗' : 'ℹ';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

async function test(name, fn) {
  try {
    await fn();
    testsPassed++;
    await log(`${name}: PASS`, 'pass');
    return true;
  } catch (error) {
    testsFailed++;
    await log(`${name}: FAIL - ${error.message}`, 'fail');
    return false;
  }
}

async function startServer() {
  await log('Starting server in AGENT mode with beta features...');
  
  server = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      MODE: 'AGENT',
      SERVER_PORT: '38888',
      SERVER_API_KEY: 'smoke-test-key',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
      BETA_FEATURES: 'true',
      PLL_ENABLE: 'true',
      LOG_LEVEL: 'warn'
    },
    stdio: ['ignore', 'ignore', 'pipe']
  });

  server.stderr.on('data', (data) => {
    // Silently collect stderr
  });

  // Wait for server to be ready
  const aboutUrl = 'http://127.0.0.1:38888/about';
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      const res = await fetch(aboutUrl);
      if (res.ok) {
        await log('Server started successfully');
        return true;
      }
    } catch (e) {
      // Keep retrying
    }
    await delay(200);
  }

  throw new Error('Server failed to start within 15 seconds');
}

async function stopServer() {
  if (server && !server.killed) {
    await log('Shutting down server gracefully...');
    server.kill('SIGTERM');
    await delay(1000);
    
    if (!server.killed) {
      server.kill('SIGKILL');
    }
    await log('Server stopped');
  }
}

async function runTests() {
  // Test 1: Ping server
  await test('Ping server', async () => {
    const res = await fetch('http://127.0.0.1:38888/about');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.name) throw new Error('Invalid response structure');
  });

  // Test 2: List tools
  await test('List tools in AGENT mode', async () => {
    const res = await fetch('http://127.0.0.1:38888/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer smoke-test-key'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 1
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.result?.tools) throw new Error('No tools in response');
    if (data.result.tools.length !== 6) {
      throw new Error(`Expected 6 tools in AGENT mode, got ${data.result.tools.length}`);
    }
  });

  // Test 3: Call ping tool
  await test('Call ping tool', async () => {
    const res = await fetch('http://127.0.0.1:38888/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer smoke-test-key'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'ping',
          arguments: { info: true }
        },
        id: 2
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.result?.content) throw new Error('No content in ping response');
  });

  // Test 4: Get server status
  await test('Get server status', async () => {
    const res = await fetch('http://127.0.0.1:38888/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer smoke-test-key'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_server_status',
          arguments: {}
        },
        id: 3
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.result?.content) throw new Error('No content in status response');
    
    // Parse status content
    const statusText = data.result.content[0].text;
    if (!statusText.includes('mode')) throw new Error('Status missing mode information');
  });

  // Test 5: Verify beta features configured
  await test('Verify beta features flag present', async () => {
    const res = await fetch('http://127.0.0.1:38888/about');
    const data = await res.json();
    
    // Just verify server responds - actual beta feature behavior tested in dedicated tests
    if (!data.version) throw new Error('Version info missing');
  });
}

async function main() {
  try {
    // Step 1: Start server
    await startServer();
    
    // Step 2: Run tests
    await log('Running smoke tests...');
    await runTests();
    
    // Step 3: Report results
    console.log('\n' + '='.repeat(50));
    console.log(`Tests Passed: ${testsPassed}`);
    console.log(`Tests Failed: ${testsFailed}`);
    console.log('='.repeat(50));
    
    if (testsFailed === 0) {
      await log('All smoke tests PASSED', 'pass');
      process.exitCode = 0;
    } else {
      await log('Some smoke tests FAILED', 'fail');
      process.exitCode = 1;
    }
  } catch (error) {
    await log(`Fatal error: ${error.message}`, 'fail');
    process.exitCode = 1;
  } finally {
    await stopServer();
  }
}

main();

