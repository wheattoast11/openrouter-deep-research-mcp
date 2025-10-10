#!/usr/bin/env node
/**
 * MCP Lifecycle and Utilities Tests
 * Tests initialize → initialized gating, ping, cancellation, progress, logging
 */

const http = require('http');
const config = require('../config');

const BASE_URL = `http://localhost:${config.server.port}`;

let testsPassed = 0;
let testsFailed = 0;

function log(message) {
  console.log(`[MCP-Lifecycle-Test] ${message}`);
}

function assert(condition, message) {
  if (condition) {
    log(`✅ PASS: ${message}`);
    testsPassed++;
  } else {
    log(`❌ FAIL: ${message}`);
    testsFailed++;
  }
}

async function makeRequest(method, path, headers = {}, body = null) {
  const maybeAuth = process.env.SERVER_API_KEY ? { Authorization: `Bearer ${process.env.SERVER_API_KEY}` } : {};
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...maybeAuth,
        ...headers
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data ? (res.headers['content-type']?.includes('json') ? JSON.parse(data) : data) : null
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createSession() {
  const res = await makeRequest('POST', '/mcp', {
    'MCP-Protocol-Version': '2025-03-26'
  }, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  });
  return res.headers['mcp-session-id'];
}

async function runTests() {
  log('Starting MCP Lifecycle and Utilities Tests...\n');

  // Test 1: Ping works before initialization
  log('Test 1: Ping allowed before notifications/initialized');
  try {
    const sessionId = await createSession();
    
    const res = await makeRequest('POST', '/mcp', {
      'MCP-Protocol-Version': '2025-03-26',
      'Mcp-Session-Id': sessionId
    }, {
      jsonrpc: '2.0',
      id: 2,
      method: 'ping'
    });

    assert(res.statusCode === 200, 'Ping before initialized returns 200');
    assert(res.body.result !== undefined, 'Ping result present');
  } catch (e) {
    log(`❌ Test 1 failed: ${e.message}`);
    testsFailed++;
  }

  // Test 2: Other methods gated before initialization
  log('\nTest 2: tools/list gated before notifications/initialized');
  try {
    const sessionId = await createSession();
    
    const res = await makeRequest('POST', '/mcp', {
      'MCP-Protocol-Version': '2025-03-26',
      'Mcp-Session-Id': sessionId
    }, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list'
    });

    assert(res.statusCode === 400, 'tools/list before initialized returns 400');
    assert(res.body.error?.message.includes('initialized'), 'Error mentions initialization requirement');
  } catch (e) {
    log(`❌ Test 2 failed: ${e.message}`);
    testsFailed++;
  }

  // Test 3: After notifications/initialized, methods work
  log('\nTest 3: After notifications/initialized, tools/list works');
  try {
    const sessionId = await createSession();
    
    // Send initialized notification
    await makeRequest('POST', '/mcp', {
      'MCP-Protocol-Version': '2025-03-26',
      'Mcp-Session-Id': sessionId
    }, {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });

    // Now try tools/list
    const res = await makeRequest('POST', '/mcp', {
      'MCP-Protocol-Version': '2025-03-26',
      'Mcp-Session-Id': sessionId
    }, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list'
    });

    assert(res.statusCode === 200, 'tools/list after initialized returns 200');
    assert(res.body.result?.tools !== undefined, 'tools array present');
  } catch (e) {
    log(`❌ Test 3 failed: ${e.message}`);
    testsFailed++;
  }

  // Test 4: notifications/cancelled acknowledged
  log('\nTest 4: notifications/cancelled returns 202');
  try {
    const sessionId = await createSession();
    
    await makeRequest('POST', '/mcp', {
      'MCP-Protocol-Version': '2025-03-26',
      'Mcp-Session-Id': sessionId
    }, {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });

    const res = await makeRequest('POST', '/mcp', {
      'MCP-Protocol-Version': '2025-03-26',
      'Mcp-Session-Id': sessionId
    }, {
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { requestId: 'test-req-123', reason: 'User cancelled' }
    });

    assert(res.statusCode === 202, 'notifications/cancelled returns 202 Accepted');
  } catch (e) {
    log(`❌ Test 4 failed: ${e.message}`);
    testsFailed++;
  }

  // Test 5: logging/setLevel
  log('\nTest 5: logging/setLevel works');
  try {
    const sessionId = await createSession();
    
    await makeRequest('POST', '/mcp', {
      'MCP-Protocol-Version': '2025-03-26',
      'Mcp-Session-Id': sessionId
    }, {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });

    const res = await makeRequest('POST', '/mcp', {
      'MCP-Protocol-Version': '2025-03-26',
      'Mcp-Session-Id': sessionId
    }, {
      jsonrpc: '2.0',
      id: 5,
      method: 'logging/setLevel',
      params: { level: 'debug' }
    });

    assert(res.statusCode === 200, 'logging/setLevel returns 200');
    assert(res.body.result !== undefined, 'Result present');
  } catch (e) {
    log(`❌ Test 5 failed: ${e.message}`);
    testsFailed++;
  }

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

