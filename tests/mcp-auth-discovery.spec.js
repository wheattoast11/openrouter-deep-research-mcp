#!/usr/bin/env node
/**
 * MCP OAuth 2.1 Resource Server Discovery Tests
 * Tests Protected Resource Metadata, WWW-Authenticate challenges, and scope validation
 */

const http = require('http');
const config = require('../config');

const BASE_URL = `http://localhost:${config.server.port}`;

let testsPassed = 0;
let testsFailed = 0;

function log(message) {
  console.log(`[MCP-Auth-Test] ${message}`);
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

async function runTests() {
  log('Starting MCP OAuth 2.1 Resource Server Discovery Tests...\n');

  // Test 1: Protected Resource Metadata endpoint exists
  log('Test 1: /.well-known/oauth-protected-resource returns metadata');
  try {
    const res = await makeRequest('GET', '/.well-known/oauth-protected-resource');

    assert(res.statusCode === 200, 'Protected resource metadata returns 200');
    assert(res.body.resource, 'resource field present');
    assert(res.body.authorization_servers, 'authorization_servers field present');
    assert(res.body.scopes_supported, 'scopes_supported field present');
    assert(res.body.bearer_methods_supported, 'bearer_methods_supported field present');
    
    log(`  Resource: ${res.body.resource}`);
    log(`  Scopes: ${res.body.scopes_supported?.slice(0, 3).join(', ')}...`);
  } catch (e) {
    log(`❌ Test 1 failed: ${e.message}`);
    testsFailed++;
  }

  // Test 2: Path-aware metadata endpoint
  log('\nTest 2: /.well-known/oauth-protected-resource/mcp returns metadata');
  try {
    const res = await makeRequest('GET', '/.well-known/oauth-protected-resource/mcp');

    assert(res.statusCode === 200, 'Path-aware metadata returns 200');
    assert(res.body.resource, 'resource field present');
  } catch (e) {
    log(`❌ Test 2 failed: ${e.message}`);
    testsFailed++;
  }

  // Test 3: 401 response includes WWW-Authenticate header (if auth required)
  log('\nTest 3: Unauthorized request returns WWW-Authenticate header');
  try {
    // Only test if auth is enforced (not in dev bypass mode)
    if (process.env.ALLOW_NO_API_KEY !== 'true') {
      const res = await makeRequest('POST', '/mcp', {
        'MCP-Protocol-Version': '2025-03-26'
      }, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } }
      });

      assert(res.statusCode === 401, 'Unauthorized returns 401');
      assert(res.headers['www-authenticate'], 'WWW-Authenticate header present');
      assert(res.headers['www-authenticate'].includes('resource_metadata'), 'WWW-Authenticate includes resource_metadata');
      
      log(`  WWW-Authenticate: ${res.headers['www-authenticate']}`);
    } else {
      log('  (Skipped: ALLOW_NO_API_KEY=true)');
      testsPassed++;
    }
  } catch (e) {
    log(`❌ Test 3 failed: ${e.message}`);
    testsFailed++;
  }

  // Test 4: Legacy discovery endpoint still works
  log('\nTest 4: /.well-known/mcp.json returns server discovery');
  try {
    const res = await makeRequest('GET', '/.well-known/mcp.json');

    assert(res.statusCode === 200, 'MCP discovery returns 200');
    assert(res.body.name, 'name field present');
    assert(res.body.version, 'version field present');
    assert(res.body.capabilities, 'capabilities field present');
    assert(res.body.transports, 'transports field present');
  } catch (e) {
    log(`❌ Test 4 failed: ${e.message}`);
    testsFailed++;
  }

  // Test 5: Scopes in discovery include minimal + mapped scopes
  log('\nTest 5: scopes_supported includes minimal and operation scopes');
  try {
    const res = await makeRequest('GET', '/.well-known/oauth-protected-resource');

    const scopes = res.body.scopes_supported || [];
    assert(scopes.includes('mcp:read'), 'mcp:read scope present');
    assert(scopes.includes('mcp:tools:list'), 'mcp:tools:list scope present');
    assert(scopes.some(s => s.includes('tools:call') || s.includes('resources:read')), 'Operation-specific scopes present');
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

