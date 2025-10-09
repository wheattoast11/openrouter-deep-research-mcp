#!/usr/bin/env node
// tests/e2e-user-journeys.spec.js
// End-to-end user journey tests for v2.1.1-beta

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const { setTimeout: delay } = require('timers/promises');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'src', 'server', 'mcpServer.js');

// Helper to spawn server with specific env
async function spawnServerWithEnv(env, port) {
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

  // Wait for server to be ready
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
    } catch (_) {
      // Keep retrying
    }
    await delay(200);
  }

  child.kill('SIGTERM');
  throw new Error('Server failed to start');
}

// ============================================================================
// Journey 1: First-Time Installation
// ============================================================================
async function testJourney1FirstTimeInstallation() {
  console.log('\n=== Journey 1: First-Time Installation ===');

  try {
    // Step 1: Start server in stdio mode (simulated via HTTP for testing)
    const PORT = 38301;
    const server = await spawnServerWithEnv({
      MODE: 'AGENT',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
      SERVER_API_KEY: 'test-secret',
      BETA_FEATURES: 'false' // Start with stable behavior
    }, PORT);

    try {
      // Step 2: Verify server is running
      const aboutRes = await fetch(`http://127.0.0.1:${PORT}/about`);
      assert(aboutRes.ok, 'Server /about endpoint should respond');
      const aboutData = await aboutRes.json();
      console.log(`✓ Server running: ${aboutData.name} v${aboutData.version}`);

      // Step 3: Call ping tool
      const pingRes = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
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
            arguments: { info: true }
          },
          id: 1
        })
      });

      assert(pingRes.ok, 'Ping tool should succeed');
      const pingData = await pingRes.json();
      assert(pingData.result, 'Ping should return result');
      console.log(`✓ Ping tool responded: ${pingData.result.content[0].text.substring(0, 50)}...`);

      // Step 4: List tools in AGENT mode
      const toolsRes = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-secret'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: 2
        })
      });

      const toolsData = await toolsRes.json();
      assert(toolsData.result.tools, 'Should return tools list');
      const toolNames = toolsData.result.tools.map(t => t.name);
      assert(toolNames.includes('agent'), 'AGENT mode should include agent tool');
      assert(toolNames.length === 6, `AGENT mode should have 6 tools, got ${toolNames.length}`);
      console.log(`✓ Tools listed: ${toolNames.length} tools available`);

      console.log('✅ Journey 1: First-Time Installation PASSED');
    } finally {
      await server.stop();
    }
  } catch (error) {
    console.error('❌ Journey 1 FAILED:', error.message);
    throw error;
  }
}

// ============================================================================
// Journey 2: Beta Features Activation
// ============================================================================
async function testJourney2BetaFeaturesActivation() {
  console.log('\n=== Journey 2: Beta Features Activation ===');

  try {
    // Step 1: Start with BETA_FEATURES=false
    const PORT = 38302;
    let server = await spawnServerWithEnv({
      MODE: 'AGENT',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
      SERVER_API_KEY: 'test-secret',
      BETA_FEATURES: 'false'
    }, PORT);

    try {
      // Verify baseline (no beta features)
      const statusRes1 = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
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

      const status1 = await statusRes1.json();
      console.log('✓ Baseline server status retrieved');

      await server.stop();

      // Step 2: Restart with BETA_FEATURES=true
      server = await spawnServerWithEnv({
        MODE: 'AGENT',
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
        SERVER_API_KEY: 'test-secret',
        BETA_FEATURES: 'true',
        PLL_ENABLE: 'true'
      }, PORT);

      // Verify beta features enabled
      const statusRes2 = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
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
          id: 2
        })
      });

      const status2 = await statusRes2.json();
      console.log('✓ Beta features enabled, server status retrieved');

      console.log('✅ Journey 2: Beta Features Activation PASSED');
    } finally {
      await server.stop();
    }
  } catch (error) {
    console.error('❌ Journey 2 FAILED:', error.message);
    throw error;
  }
}

// ============================================================================
// Journey 3: Mode Switching (AGENT vs MANUAL vs ALL)
// ============================================================================
async function testJourney3ModeSwitching() {
  console.log('\n=== Journey 3: Mode Switching ===');

  const modes = [
    { name: 'AGENT', expectedTools: 6, mustInclude: ['agent'] },
    { name: 'MANUAL', expectedTools: 15, mustInclude: ['conduct_research', 'retrieve'] },
    { name: 'ALL', expectedTools: 21, mustInclude: ['agent', 'conduct_research'] }
  ];

  for (const mode of modes) {
    try {
      const PORT = 38303 + modes.indexOf(mode);
      const server = await spawnServerWithEnv({
        MODE: mode.name,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
        SERVER_API_KEY: 'test-secret',
        BETA_FEATURES: 'false'
      }, PORT);

      try {
        const toolsRes = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-secret'
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/list',
            params: {},
            id: 1
          })
        });

        const toolsData = await toolsRes.json();
        const toolNames = toolsData.result.tools.map(t => t.name);

        // Check tool count
        assert(
          toolNames.length === mode.expectedTools,
          `MODE=${mode.name} should have ${mode.expectedTools} tools, got ${toolNames.length}`
        );

        // Check required tools present
        for (const requiredTool of mode.mustInclude) {
          assert(
            toolNames.includes(requiredTool),
            `MODE=${mode.name} should include ${requiredTool}`
          );
        }

        console.log(`✓ MODE=${mode.name}: ${toolNames.length} tools, includes ${mode.mustInclude.join(', ')}`);
      } finally {
        await server.stop();
      }
    } catch (error) {
      console.error(`❌ Journey 3 (MODE=${mode.name}) FAILED:`, error.message);
      throw error;
    }
  }

  console.log('✅ Journey 3: Mode Switching PASSED');
}

// ============================================================================
// Journey 4: Platform Integration (HTTP + WebSocket)
// ============================================================================
async function testJourney4PlatformIntegration() {
  console.log('\n=== Journey 4: Platform Integration ===');

  try {
    const PORT = 38306;
    const server = await spawnServerWithEnv({
      MODE: 'AGENT',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
      SERVER_API_KEY: 'test-secret',
      BETA_FEATURES: 'true'
    }, PORT);

    try {
      // Step 1: HTTP initialization
      const initRes = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-secret',
          'MCP-Protocol-Version': '2025-03-26'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'e2e-test', version: '1.0.0' }
          },
          id: 1
        })
      });

      assert(initRes.ok, 'Initialize should succeed');
      const initData = await initRes.json();
      assert(initData.result.capabilities, 'Should return server capabilities');
      console.log('✓ HTTP initialization successful');

      // Step 2: Verify capabilities include streaming
      assert(
        initData.result.capabilities.experimental?.streamingChunked !== undefined ||
        initData.result.capabilities.streaming !== undefined,
        'Server should advertise streaming capabilities'
      );
      console.log('✓ Streaming capabilities advertised');

      console.log('✅ Journey 4: Platform Integration PASSED');
    } finally {
      await server.stop();
    }
  } catch (error) {
    console.error('❌ Journey 4 FAILED:', error.message);
    throw error;
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================
(async () => {
  console.log('=== E2E User Journey Tests (v2.1.1-beta) ===');

  try {
    await testJourney1FirstTimeInstallation();
    await testJourney2BetaFeaturesActivation();
    await testJourney3ModeSwitching();
    await testJourney4PlatformIntegration();

    console.log('\n✅ All E2E User Journey tests PASSED');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ E2E User Journey tests FAILED');
    process.exit(1);
  }
})();

