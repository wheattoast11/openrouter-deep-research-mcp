#!/usr/bin/env node
// tests/beta-features-isolation.spec.js
// Feature isolation tests for beta toggles (PLL, compression, idempotency)

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

  const aboutUrl = `http://127.0.0.1:${port}/about`;
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      const res = await fetch(aboutUrl);
      if (res.ok) {
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
    } catch (_) {}
    await delay(200);
  }

  child.kill('SIGTERM');
  throw new Error('Server failed to start');
}

// ============================================================================
// Test 1: PLL Toggle
// ============================================================================
async function testPllToggle() {
  console.log('\n=== Test 1: PLL Toggle ===');

  // Test 1a: PLL_ENABLE=false
  {
    const PORT = 38401;
    const server = await spawnServer({
      MODE: 'AGENT',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
      SERVER_API_KEY: 'test-secret',
      BETA_FEATURES: 'true',
      PLL_ENABLE: 'false'
    }, PORT);

    try {
      return new Promise(async (resolve, reject) => {
        const wsUrl = `ws://127.0.0.1:${PORT}/mcp/ws?token=test-secret`;
        const ws = new WebSocket(wsUrl);
        const telemetryEvents = [];

        ws.on('open', () => {
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'ping',
              arguments: {}
            },
            id: 1
          }));
        });

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.type && String(message.type).startsWith('metrics.')) {
              telemetryEvents.push(message);
            }
          } catch (e) {
            // Ignore parse errors
          }
        });

        setTimeout(() => {
          ws.close();
          try {
            assert(telemetryEvents.length === 0, 'PLL_ENABLE=false should emit no telemetry events');
            console.log('✓ PLL_ENABLE=false: No telemetry events emitted');
            server.stop().then(resolve).catch(reject);
          } catch (error) {
            server.stop().then(() => reject(error)).catch(reject);
          }
        }, 3000);
      });
    } finally {
      await server.stop();
    }
  }

  // Test 1b: PLL_ENABLE=true
  {
    const PORT = 38402;
    const server = await spawnServer({
      MODE: 'AGENT',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
      SERVER_API_KEY: 'test-secret',
      BETA_FEATURES: 'true',
      PLL_ENABLE: 'true'
    }, PORT);

    try {
      // For this test, we just verify server starts correctly with PLL enabled
      // Full telemetry validation is done in streaming-contract.spec.js
      const statusRes = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-secret'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'get_server_status',
            arguments: {}
          },
          id: 1
        })
      });

      assert(statusRes.ok, 'Server should respond with PLL enabled');
      console.log('✓ PLL_ENABLE=true: Server operational');
    } finally {
      await server.stop();
    }
  }

  console.log('✅ Test 1: PLL Toggle PASSED');
}

// ============================================================================
// Test 2: Compression Toggle
// ============================================================================
async function testCompressionToggle() {
  console.log('\n=== Test 2: Compression Toggle ===');

  // We test that compression flag doesn't break core functionality
  // Actual compression behavior is tested in context agent integration tests

  const modes = [
    { COMPRESSION_ENABLE: 'false', label: 'disabled' },
    { COMPRESSION_ENABLE: 'true', label: 'enabled' }
  ];

  for (const mode of modes) {
    const PORT = 38403 + modes.indexOf(mode);
    const server = await spawnServer({
      MODE: 'AGENT',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
      SERVER_API_KEY: 'test-secret',
      BETA_FEATURES: 'true',
      ...mode
    }, PORT);

    try {
      const statusRes = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-secret'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'ping',
            arguments: {}
          },
          id: 1
        })
      });

      assert(statusRes.ok, `Server should work with compression ${mode.label}`);
      console.log(`✓ COMPRESSION_ENABLE=${mode.COMPRESSION_ENABLE}: Server operational`);
    } finally {
      await server.stop();
    }
  }

  console.log('✅ Test 2: Compression Toggle PASSED');
}

// ============================================================================
// Test 3: Idempotency Toggle
// ============================================================================
async function testIdempotencyToggle() {
  console.log('\n=== Test 3: Idempotency Toggle ===');

  // Basic test that idempotency flag doesn't break server startup
  // Full idempotency behavior is tested in idempotency-lease.spec.js

  const modes = [
    { IDEMPOTENCY_ENABLED: 'false', label: 'disabled' },
    { IDEMPOTENCY_ENABLED: 'true', label: 'enabled' }
  ];

  for (const mode of modes) {
    const PORT = 38405 + modes.indexOf(mode);
    const server = await spawnServer({
      MODE: 'AGENT',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
      SERVER_API_KEY: 'test-secret',
      ...mode
    }, PORT);

    try {
      const aboutRes = await fetch(`http://127.0.0.1:${PORT}/about`);
      assert(aboutRes.ok, `Server should start with idempotency ${mode.label}`);
      console.log(`✓ IDEMPOTENCY_ENABLED=${mode.IDEMPOTENCY_ENABLED}: Server starts successfully`);
    } finally {
      await server.stop();
    }
  }

  console.log('✅ Test 3: Idempotency Toggle PASSED');
}

// ============================================================================
// Test 4: Circuit Breaker
// ============================================================================
async function testCircuitBreaker() {
  console.log('\n=== Test 4: Circuit Breaker ===');

  // Test that circuit breaker logic doesn't crash server
  // Full circuit breaker behavior tested in streaming-contract.spec.js

  const PORT = 38407;
  const server = await spawnServer({
    MODE: 'AGENT',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
    SERVER_API_KEY: 'test-secret',
    BETA_FEATURES: 'true',
    PLL_ENABLE: 'true',
    PLL_CIRCUIT_BREAKER_THRESHOLD: '3'
  }, PORT);

  try {
    const statusRes = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-secret'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'ping',
          arguments: {}
        },
        id: 1
      })
    });

    assert(statusRes.ok, 'Server should work with circuit breaker configured');
    console.log('✓ Circuit breaker configuration accepted');
    console.log('✅ Test 4: Circuit Breaker PASSED');
  } finally {
    await server.stop();
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================
(async () => {
  console.log('=== Beta Features Isolation Tests ===');

  try {
    await testPllToggle();
    await testCompressionToggle();
    await testIdempotencyToggle();
    await testCircuitBreaker();

    console.log('\n✅ All Beta Features Isolation tests PASSED');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Beta Features Isolation tests FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();

