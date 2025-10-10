#!/usr/bin/env node
/**
 * MCP Pagination Tests
 */

const http = require('http');
const config = require('../config');

const BASE_URL = `http://localhost:${config.server.port}`;

let passed = 0;
let failed = 0;

function log(message) {
  console.log(`[MCP-Pagination] ${message}`);
}

function assert(condition, message) {
  if (condition) {
    log(`✅ ${message}`);
    passed++;
  } else {
    log(`❌ ${message}`);
    failed++;
  }
}

function makeRequest(method, path, headers = {}, body = null) {
  const maybeAuth = process.env.SERVER_API_KEY ? { Authorization: `Bearer ${process.env.SERVER_API_KEY}` } : {};
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...maybeAuth,
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data ? JSON.parse(data) : null
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function initializeSession() {
  const res = await makeRequest('POST', '/mcp', {
    'MCP-Protocol-Version': '2025-03-26'
  }, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'pagination-test', version: '1.0.0' }
    }
  });
  return res.headers['mcp-session-id'];
}

async function notifyInitialized(sessionId) {
  await makeRequest('POST', '/mcp', {
    'MCP-Protocol-Version': '2025-03-26',
    'Mcp-Session-Id': sessionId
  }, {
    jsonrpc: '2.0',
    method: 'notifications/initialized'
  });
}

async function list(method, sessionId, params = {}) {
  const res = await makeRequest('POST', '/mcp', {
    'MCP-Protocol-Version': '2025-03-26',
    'Mcp-Session-Id': sessionId
  }, {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  });
  assert(res.statusCode === 200, `${method} returned 200`);
  assert(res.body.result, `${method} returned result`);
  return res.body.result;
}

async function run() {
  const sessionId = await initializeSession();
  assert(!!sessionId, 'Session created');
  await notifyInitialized(sessionId);

  const targets = [
    { method: 'prompts/list', key: 'prompts' },
    { method: 'resources/list', key: 'resources' },
    { method: 'tools/list', key: 'tools' }
  ];

  for (const target of targets) {
    const first = await list(target.method, sessionId, { limit: 1 });
    const arr = first[target.key];
    assert(Array.isArray(arr), `${target.method} returned array`);
    if (!Array.isArray(arr)) continue;

    if (first.nextCursor) {
      const second = await list(target.method, sessionId, { cursor: first.nextCursor, limit: 1 });
      assert(second[target.key], `${target.method} second page returns array`);
      if (second[target.key] && second[target.key].length) {
        assert(second[target.key][0].name !== arr[0].name, `${target.method} second page yields different item`);
      }
    } else {
      log(`${target.method} returned single page`);
    }
  }

  // resources/templates/list optional
  try {
    await list('resources/templates/list', sessionId, { limit: 1 });
  } catch (e) {
    log('resources/templates/list unavailable, skipping');
  }

  log(`Tests passed: ${passed}, failed: ${failed}`);
  process.exit(failed ? 1 : 0);
}

setTimeout(() => {
  run().catch(err => {
    log(`Fatal: ${err.message}`);
    process.exit(1);
  });
}, 1000);


