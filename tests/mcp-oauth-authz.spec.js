#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const { setTimeout: delay } = require('timers/promises');
const { createSign } = require('crypto');
const fetch = global.fetch || require('node-fetch');

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
            if (!child.killed) child.kill('SIGTERM');
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

function createFakeJwt({ keyId = 'kid-1', audience = 'mcp-server', scopes = ['mcp:tools:list'], expiresIn = 60 } = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: keyId, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://auth.example.com/',
    aud: audience,
    scope: scopes.join(' '),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    sub: 'user-123'
  })).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  sign.end();

  const privateKey = `-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCoVi//aPZq2Z4C\nYB9hDDbPuPn+7VsA7twhMt5AQLlKZO+EYXspgoKqSA3w8EMXwqyI51Onx5O20+wN\nfc1VG8k+VVfnhZV0dA0rqkejJ9/kE+XGYoqo/mzCz3GtHLiQsl4/BD4CIWy9kHQh\ntjszeZo3XPqVU45Sc4MrFwmhkj8f601HU6S6xykLPZaekv1aQwIhINsyC2Y9VPpP\noXfY+KYpFiR2yW4qFj+a7bjtwM7ECraFQesRfSCql4PyxWLB4ECp3vhgnG16pBi4\nTIA+qqeFC8uIbIOfY6MuAieIB0Lmp0lY0gA/94HfrfaLOHwhRx/6KOTkUkUpPBPk\n7ncdUtr/AgMBAAECggEAD9Loxqb6KQLVQzMI5gSdiW7I2SgiQmCrw9bH55QoAgI+\nYf1ot0MgXF6QW6OqgDPYF4qFT7pfpWtTLVjYb68cWSIfTqotApVjFxy3ll4TTp19\ncDu3y4p92jMvdSYWi0K6lo3L5I1gaDlraOMC43XHgM7HbtAPY82ct3/klVN56NNV\nMjZy9NR3Z4Sw0YYW2el+1pxWm3xbH9SX8VnYKCEvwsWKW2S0rPb5YARdUNR1Homy\n0v4F4kYD+M1u43BmkwMNXkFxrxl6VAU7w/I8+5C9weMbTDcFeNqiMBa00VMWSCLu\n1I+fMuCDIYzCnPMFKBg1ywWlhHH7R3PGmChCtiMJbQKBgQDUNV2XfqO6SxJ2QxLR\nRzQjesrdWYDPuFXVeVtERHa7WioQFqIsZ8yWb/PV4AFfacAG9Z9_ILCDXRKQazoS\nCSgPvM3Xl1quE5/Xy4nJT+rfdGQWnX/X+cjvJ1dIBSCywlUZYkaoFYaYHLaR1E4W\n/kDkbo5imVmb3MEnIfGNoKUsuQKBgQDGifQHJ4RcMjabksHqCgWpdFAN+RSTt6ob\nSW83d285LpwCD0pG/XpyOUPmRz99Upgi8ksZc+QYDdvlLil6uMmY2ZK2NQdD9Xwq\nPwSmssA9NHmVDKMdHtJQ/oqRN9TFyN/JWfkEducCM90XC2ceCMxPsfNXKTZC1Vig\n8XbmMWXywQKBgQCNrYsvBi3UITGi6X6hnlbr59SYnxsYqb21HNXJ4IU5wEmOnocs\n4b0RdSxal1SutyxAzKM0EnFDnB69uO4kyLGHHSH5n6uJ3VaMJ94TJmSusmBsszQ+\n/UDbzz6UpEUxvBmn8DAIlAzlUR0hSc5WKbS7ohm8ORMfGbAUoelaoQIp1QKBgQCc\nHe+jAUFm7cbTnLa3nMuJ0d9KRtrs91LivU4JtNQ2g0BPjWFRtROEod8YFKWSH1hn\nBXNwZ9wX8yZlt8GFnP1M5hVTfCHUWdaP4Z0Pcb1jP1Xx708Ymdp2jfd7fisi07c4\nzrCY4fSdyYdCqqZaJd1Pt6FV59idCeKzE9AxrqT6oQKBgQDAdEuUIIA5ZyFISYcG\nEvU+VwNwDeaEpVNTHphFzsvpV8mfjRgDCQtnnC0bzxNpYkOlkjBTY1bb/wK98p0n\npYgDeAYaxzKqp32kSwtztI0rGCAbCkAHZavvBJM7N1k/kKE485qr0nHzurspBqVp\ndUiNHo+ui1v1F8Lo06aF+B+uTw==\n-----END PRIVATE KEY-----`;

  const signature = sign.sign(privateKey, 'base64url');
  return `${header}.${payload}.${signature}`;
}

(async () => {
  console.log('=== OAuth/JWT Authorization Tests ===');

  const JWKS_RESPONSE = {
    keys: [
      {
        kty: 'RSA',
        kid: 'kid-1',
        use: 'sig',
        alg: 'RS256',
        n: 'qFYv_2j2atmeAmAfYQw2z7j5_u1bAO7cITLeQEC5SmTvhGF7KYKCqkgN8PBD F8KsiOdTp8eTttPsDX3NVRvJPlVX54WVdHQNO6pHoya f5BP lxmKKqP5sws9xrRy4kLJePwQ- AiFsv ZB0IbY7M3maN1z6lV OUnODKxcJoZI_H-tNR1Oku scpCz2WnpL9WkMCI SDbMgtmPVT6T6F32PimKRYkdstuKhY_mu247cDOxAq2hUHrEX0gqpeD8sViw eBAqd74YJxt eqQYuEyAPqqnhQvLiGyDn2OjLgIn iAdC5qdJWNIA P_eB3632iz h8I Ucf ijk5FJFKTwT5O53HVLa_w',
        e: 'AQAB'
      }
    ]
  };

  const originalFetch = global.fetch;
  global.fetch = async function(url, options) {
    if (typeof url === 'string' && url.endsWith('/.well-known/jwks.json')) {
      return new Response(JSON.stringify(JWKS_RESPONSE), { status: 200 });
    }
    return originalFetch(url, options);
  };

  const PORT = 38701;
  const server = await spawnServer({
    MODE: 'AGENT',
    AUTH_JWKS_URL: `http://127.0.0.1:${PORT}/.well-known/jwks.json`,
    AUTH_EXPECTED_AUD: 'mcp-server',
    AUTH_SCOPES_MINIMAL: 'mcp:tools:list,mcp:tools:call',
    MCP_ENABLE_PROMPTS: 'true',
    MCP_ENABLE_RESOURCES: 'true'
  }, PORT);

  try {
    const validToken = createFakeJwt();

    const listRes = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validToken}`,
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-03-26'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 })
    });
    assert.strictEqual(listRes.status, 200, 'Valid token should be accepted');
    console.log('✓ Valid JWT accepted');

    const badAudToken = createFakeJwt({ audience: 'other-aud' });
    const badAudRes = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${badAudToken}`,
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-03-26'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 2 })
    });
    assert.strictEqual(badAudRes.status, 403, 'Invalid audience should be forbidden');
    console.log('✓ Invalid audience rejected');

    const limitedScopeToken = createFakeJwt({ scopes: ['mcp:tools:list'] });
    const callRes = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${limitedScopeToken}`,
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-03-26'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'ping', arguments: {} },
        id: 3
      })
    });
    assert.strictEqual(callRes.status, 403, 'Insufficient scope should be forbidden');
    console.log('✓ Insufficient scope rejected');

    const expiredToken = createFakeJwt({ expiresIn: -10 });
    const expiredRes = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${expiredToken}`,
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-03-26'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 4 })
    });
    assert.strictEqual(expiredRes.status, 401, 'Expired token should be unauthorized');
    console.log('✓ Expired token rejected');

    const apiKeyRes = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer not-the-key',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-03-26'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 5 })
    });
    assert.strictEqual(apiKeyRes.status, 401, 'Random token should not match API key fallback');
    console.log('✓ Random Bearer rejected when no API key match');

    const ws = new (require('ws'))(`ws://127.0.0.1:${PORT}/mcp/ws?token=${validToken}`);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 6,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: { tools: {} } }
    }));
    ws.close();
    console.log('✓ WebSocket accepted valid JWT');
  } finally {
    await server.stop();
    global.fetch = originalFetch;
  }

  console.log('\n✅ OAuth/JWT authorization tests passed');
})();
