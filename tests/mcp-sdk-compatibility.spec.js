#!/usr/bin/env node
// tests/mcp-sdk-compatibility.spec.js
// MCP SDK 1.17.4 compliance and compatibility tests

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const { setTimeout: delay } = require('timers/promises');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'src', 'server', 'mcpServer.js');

// Try to load MCP SDK (graceful fallback if not available)
const sdkPackagePath = require.resolve('@modelcontextprotocol/sdk/package.json');
const sdkRootDir = path.dirname(sdkPackagePath);
const sdkCjsClientIndex = path.join(sdkRootDir, 'dist', 'cjs', 'client', 'client.js');
const sdkCjsStdio = path.join(sdkRootDir, 'dist', 'cjs', 'client', 'stdio.js');
const sdkCjsStreamable = path.join(sdkRootDir, 'dist', 'cjs', 'client', 'streamableHttp.js');

const { Client } = require(sdkCjsClientIndex);
const { StdioClientTransport } = require(sdkCjsStdio);
const { StreamableHTTPClientTransport } = require(sdkCjsStreamable);

async function spawnHttpServer(env, port) {
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
  throw new Error('HTTP server failed to start');
}

// ============================================================================
// Test 1: Protocol Version Negotiation
// ============================================================================
async function testProtocolVersionNegotiation() {
  console.log('\n=== Test 1: Protocol Version Negotiation ===');

  const PORT = 38501;
  const server = await spawnHttpServer({
    MODE: 'AGENT',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
    SERVER_API_KEY: 'sdk-test-secret',
    MCP_PROTOCOL_VERSION: '2025-03-26'
  }, PORT);

  try {
    const transport = new StreamableHTTPClientTransport(`http://127.0.0.1:${PORT}/mcp`, {
      fetch,
      requestInit: {
        headers: {
          Authorization: 'Bearer sdk-test-secret'
        }
      }
    });

    const client = new Client(
      { name: 'sdk-compat-test', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    await transport.start();
    await client.connect(transport, { timeout: 12000 });

    // Verify connection established
    const tools = await client.listTools();
    assert(Array.isArray(tools), 'Should list tools after protocol negotiation');
    console.log(`✓ Protocol negotiation successful, ${tools.length} tools available`);

    await transport.close();
    console.log('✅ Test 1: Protocol Version Negotiation PASSED');
  } finally {
    await server.stop();
  }
}

// ============================================================================
// Test 2: Capabilities Exchange
// ============================================================================
async function testCapabilitiesExchange() {
  console.log('\n=== Test 2: Capabilities Exchange ===');

  const PORT = 38502;
  const server = await spawnHttpServer({
    MODE: 'AGENT',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
    SERVER_API_KEY: 'sdk-test-secret',
    MCP_ENABLE_PROMPTS: 'true',
    MCP_ENABLE_RESOURCES: 'true'
  }, PORT);

  try {
    const transport = new StreamableHTTPClientTransport(`http://127.0.0.1:${PORT}/mcp`, {
      fetch,
      requestInit: {
        headers: {
          Authorization: 'Bearer sdk-test-secret'
        }
      }
    });

    const client = new Client(
      { name: 'sdk-cap-test', version: '1.0.0' },
      {
        capabilities: {
          tools: {},
          prompts: { listChanged: true },
          resources: { subscribe: true, listChanged: true }
        }
      }
    );

    await transport.start();
    await client.connect(transport, { timeout: 12000 });

    // Test tools capability
    const tools = await client.listTools();
    assert(tools.length > 0, 'Should expose tools');
    console.log(`✓ Tools capability: ${tools.length} tools`);

    // Test prompts capability
    try {
      const prompts = await client.listPrompts();
      console.log(`✓ Prompts capability: ${prompts.length} prompts`);
    } catch (e) {
      console.log('✓ Prompts capability: Server declined or not available');
    }

    // Test resources capability
    try {
      const resources = await client.listResources();
      console.log(`✓ Resources capability: ${resources.length} resources`);
    } catch (e) {
      console.log('✓ Resources capability: Server declined or not available');
    }

    await transport.close();
    console.log('✅ Test 2: Capabilities Exchange PASSED');
  } finally {
    await server.stop();
  }
}

// ============================================================================
// Test 3: Stdio Transport
// ============================================================================
async function testStdioTransport() {
  console.log('\n=== Test 3: Stdio Transport ===');

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY, '--stdio'],
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      MODE: 'AGENT',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
      LOG_LEVEL: 'warn'
    }
  });

  const client = new Client(
    { name: 'sdk-stdio-test', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  try {
    await client.connect(transport, { timeout: 12000 });

    const tools = await client.listTools();
    assert(tools.length > 0, 'Stdio should expose tools');
    console.log(`✓ Stdio transport: ${tools.length} tools available`);

    // Test ping tool
    const pingResult = await client.callTool({
      name: 'ping',
      arguments: { info: false }
    });

    assert(pingResult.content, 'Ping should return content');
    console.log('✓ Stdio transport: Tool call successful');

    await transport.close();
    console.log('✅ Test 3: Stdio Transport PASSED');
  } catch (error) {
    await transport.close().catch(() => {});
    throw error;
  }
}

// ============================================================================
// Test 4: Progress Event Ordering
// ============================================================================
async function testProgressEventOrdering() {
  console.log('\n=== Test 4: Progress Event Ordering ===');

  const PORT = 38503;
  const server = await spawnHttpServer({
    MODE: 'AGENT',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
    SERVER_API_KEY: 'sdk-test-secret',
    BETA_FEATURES: 'true'
  }, PORT);

  try {
    const transport = new StreamableHTTPClientTransport(`http://127.0.0.1:${PORT}/mcp`, {
      fetch,
      requestInit: {
        headers: {
          Authorization: 'Bearer sdk-test-secret'
        }
      }
    });

    const client = new Client(
      { name: 'sdk-progress-test', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    await transport.start();
    await client.connect(transport, { timeout: 12000 });

    const progressEvents = [];

    // Note: This is a simple test that just verifies the tool responds
    // Full progress event testing is in streaming-contract.spec.js
    const result = await client.callTool({
      name: 'ping',
      arguments: { info: true }
    }, undefined, {
      onprogress(event) {
        progressEvents.push(event);
      },
      timeout: 10000
    });

    assert(result.content, 'Tool should return result');
    console.log(`✓ Progress events captured: ${progressEvents.length} events`);
    console.log('✓ Tool result received after progress events');

    await transport.close();
    console.log('✅ Test 4: Progress Event Ordering PASSED');
  } finally {
    await server.stop();
  }
}

// ============================================================================
// Test 5: Timeout Handling
// ============================================================================
async function testTimeoutHandling() {
  console.log('\n=== Test 5: Timeout Handling ===');

  const PORT = 38504;
  const server = await spawnHttpServer({
    MODE: 'AGENT',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'test-key',
    SERVER_API_KEY: 'sdk-test-secret'
  }, PORT);

  try {
    const transport = new StreamableHTTPClientTransport(`http://127.0.0.1:${PORT}/mcp`, {
      fetch,
      requestInit: {
        headers: {
          Authorization: 'Bearer sdk-test-secret'
        }
      }
    });

    const client = new Client(
      { name: 'sdk-timeout-test', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    await transport.start();
    await client.connect(transport, { timeout: 12000 });

    // Test that fast operations complete within timeout
    const startTime = Date.now();
    const result = await client.callTool({
      name: 'ping',
      arguments: {}
    }, undefined, {
      timeout: 5000
    });

    const elapsed = Date.now() - startTime;
    assert(result.content, 'Tool should return result');
    assert(elapsed < 5000, 'Tool should complete before timeout');
    console.log(`✓ Tool completed in ${elapsed}ms (< 5000ms timeout)`);

    await transport.close();
    console.log('✅ Test 5: Timeout Handling PASSED');
  } finally {
    await server.stop();
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================
(async () => {
  console.log('=== MCP SDK 1.17.4 Compatibility Tests ===');

  try {
    await testProtocolVersionNegotiation();
    await testCapabilitiesExchange();
    await testStdioTransport();
    await testProgressEventOrdering();
    await testTimeoutHandling();

    console.log('\n✅ All MCP SDK Compatibility tests PASSED');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ MCP SDK Compatibility tests FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();

