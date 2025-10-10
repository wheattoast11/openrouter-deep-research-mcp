#!/usr/bin/env node
/**
 * MCP Server Identity and Discovery Tests
 * Verifies the /.well-known/mcp-server and /.well-known/oauth-protected-resource endpoints.
 */

const http = require('http');
const config = require('../config');
const assert = require('assert');

const BASE_URL = `http://localhost:${config.server.port}`;
let testsPassed = 0;
let testsFailed = 0;

function log(message) {
  console.log(`[MCP-Discovery-Test] ${message}`);
}

async function makeRequest(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
    }).on('error', reject);
  });
}

async function runTests() {
  log('Starting MCP Server Identity and Discovery Tests...\n');

  // Test 1: /.well-known/mcp-server
  log('Test 1: Fetch /.well-known/mcp-server');
  try {
    const { statusCode, body } = await makeRequest('/.well-known/mcp-server');
    assert.strictEqual(statusCode, 200, 'mcp-server returns 200');
    assert.strictEqual(body.name, config.server.name, 'Server name is correct');
    assert.ok(body.protocol_versions_supported.length > 0, 'Lists supported protocol versions');
    assert.ok(body.transports.length > 0, 'Lists transports');
    testsPassed++;
  } catch (e) {
    log(`❌ Test 1 failed: ${e.message}`);
    testsFailed++;
  }

  // Test 2: /.well-known/oauth-protected-resource
  log('\nTest 2: Fetch /.well-known/oauth-protected-resource');
  try {
    const { statusCode, body } = await makeRequest('/.well-known/oauth-protected-resource');
    if (config.auth?.discovery?.enabled) {
      assert.strictEqual(statusCode, 200, 'oauth-protected-resource returns 200 when enabled');
      assert.strictEqual(body.issuer, config.auth.issuer, 'Issuer is correct');
      assert.ok(body.scopes_supported.length > 0, 'Lists scopes supported');
    } else {
      assert.strictEqual(statusCode, 404, 'oauth-protected-resource returns 404 when disabled');
    }
    testsPassed++;
  } catch (e) {
    log(`❌ Test 2 failed: ${e.message}`);
    testsFailed++;
  }

  // Summary
  log(`\n${'='.repeat(60)}`);
  log(`Tests Passed: ${testsPassed}`);
  log(`Tests Failed: ${testsFailed}`);
  log(`${'='.repeat(60)}`);

  process.exit(testsFailed > 0 ? 1 : 0);
}

setTimeout(() => {
  runTests().catch(err => {
    log(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}, 2000);
