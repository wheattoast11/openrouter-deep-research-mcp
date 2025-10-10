#!/usr/bin/env node
/**
 * MCP Completion Utility Tests
 */

const http = require('http');
const config = require('../config');

const BASE_URL = `http://localhost:${config.server.port}`;

let passed = 0;
let failed = 0;

function log(message) {
  console.log(`[MCP-Completion] ${message}`);
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

function makeRequest(method, path, headers = {}, body = null, raw = false) {
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
          body: raw ? data : (data ? JSON.parse(data) : null)
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
      clientInfo: { name: 'completion-test', version: '1.0.0' }
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

async function completion(params, sessionId) {
  const res = await makeRequest('POST', '/mcp', {
    'MCP-Protocol-Version': '2025-03-26',
    'Mcp-Session-Id': sessionId
  }, {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'completion/complete',
    params
  });
  assert(res.statusCode === 200, 'completion/complete returned 200');
  assert(res.body.result?.completion, 'completion payload present');
  return res.body.result.completion;
}

async function run() {
  const sessionId = await initializeSession();
  assert(!!sessionId, 'Session created');
  await notifyInitialized(sessionId);

  const base = await completion({
    kind: 'promptArgument',
    dataset: 'default',
    attribute: 'outputFormat',
    limit: 2
  }, sessionId);
  assert(Array.isArray(base.values), 'values array present');
  assert(base.total >= base.values.length, 'total >= length');
  if (base.nextCursor) {
    const next = await completion({
      kind: 'promptArgument',
      dataset: 'default',
      attribute: 'outputFormat',
      cursor: base.nextCursor,
      limit: 2
    }, sessionId);
    assert(next.values.length >= 0, 'next page returns values');
    assert(next.hasMore === Boolean(next.nextCursor), 'hasMore matches nextCursor');
  }

  const filtered = await completion({
    kind: 'promptArgument',
    dataset: 'default',
    attribute: 'outputFormat',
    input: 're',
    limit: 5
  }, sessionId);
  assert(filtered.values.every(v => v.toLowerCase().includes('re')), 'filtered values match input');

  const generic = await completion({
    kind: 'generic',
    attribute: 'query',
    limit: 3
  }, sessionId);
  assert(Array.isArray(generic.values), 'generic returns values');

  log(`Tests passed: ${passed}, failed: ${failed}`);
  process.exit(failed ? 1 : 0);
}

setTimeout(() => {
  run().catch(err => {
    log(`Fatal: ${err.message}`);
    process.exit(1);
  });
}, 1000);


