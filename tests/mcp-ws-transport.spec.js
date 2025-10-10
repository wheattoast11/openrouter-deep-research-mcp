#!/usr/bin/env node
/**
 * MCP WebSocket Transport Tests
 * Tests WS connection, initialization, and protocol rules like batch rejection.
 */

const WebSocket = require('ws');
const config = require('../config');
const assert = require('assert');

const BASE_URL = `ws://localhost:${config.server.port}`;
const MCP_ENDPOINT = `${BASE_URL}/mcp/ws`;

let testsPassed = 0;
let testsFailed = 0;

function log(message) {
  console.log(`[MCP-WS-Test] ${message}`);
}

function test(name, fn) {
    log(`Running test: ${name}`);
    try {
        fn();
        testsPassed++;
        log(`✅ PASS: ${name}`);
    } catch (e) {
        testsFailed++;
        log(`❌ FAIL: ${name}`);
        console.error(e);
    }
}

async function runTests() {
  log('Starting MCP WebSocket Transport Tests...\n');

  const ws = new WebSocket(MCP_ENDPOINT);

  const waitForOpen = new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  log('Attempting to connect to WebSocket server...');
  try {
    await waitForOpen;
    log('✅ PASS: WebSocket connection opened');
    testsPassed++;
  } catch(e) {
    log('❌ FAIL: WebSocket connection failed');
    console.error(e);
    testsFailed++;
    process.exit(1);
  }

  const waitForMessage = () => new Promise(resolve => ws.once('message', data => resolve(JSON.parse(data.toString()))));

  // Test 1: Initialize
  log('\nTest 1: Send initialize and receive success response');
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26'
    }
  }));

  const initResponse = await waitForMessage();
  try {
    assert.strictEqual(initResponse.id, 1, 'Initialize response ID matches');
    assert.ok(initResponse.result, 'Initialize response has a result');
    assert.strictEqual(initResponse.result.protocolVersion, '2025-03-26', 'Protocol version is correct');
    log('✅ PASS: Initialization successful');
    testsPassed++;
  } catch(e) {
    log('❌ FAIL: Initialization failed');
    console.error(e);
    testsFailed++;
  }
  
  // Test 2: Reject batch request
  log('\nTest 2: Send batch request and receive error');
  ws.send(JSON.stringify([
    { jsonrpc: '2.0', id: 2, method: 'ping' },
    { jsonrpc: '2.0', id: 3, method: 'ping' }
  ]));

  const batchResponse = await waitForMessage();
  try {
    assert.ok(batchResponse.error, 'Batch response is an error');
    assert.strictEqual(batchResponse.error.code, -32600, 'Error code is -32600');
    assert.match(batchResponse.error.message, /Batch requests are not supported/, 'Error message is correct');
    log('✅ PASS: Batch request rejected correctly');
    testsPassed++;
  } catch(e) {
    log('❌ FAIL: Batch request rejection failed');
    console.error(e);
    testsFailed++;
  }

  ws.close();

  // Summary
  log(`\n${'='.repeat(60)}`);
  log(`Tests Passed: ${testsPassed}`);
  log(`Tests Failed: ${testsFailed}`);
  log(`${'='.repeat(60)}`);

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Wait for server to be ready
setTimeout(() => {
  runTests().catch(err => {
    log(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}, 1000);
