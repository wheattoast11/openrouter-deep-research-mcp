#!/usr/bin/env node
// tests/oauth-resource-server.spec.js
// Validates OAuth2 resource server flows (positive/negative) for Streamable HTTP transport

const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');
const { Client } = require('@modelcontextprotocol/sdk/client');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp');
const { setTimeout: delay } = require('timers/promises');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'src', 'server', 'mcpServer.js');

const JWKS_JSON = {
  keys: [
    {
      kty: 'RSA',
      e: 'AQAB',
      use: 'sig',
      kid: 'test-key',
      n: 'v1JZ5_9WFs2K8JV59u9dZXvE-9pK9BjUY9cRjhijML8kPEuQNo2n2VZQ__vEXbBpEMJhhcqs2sX210oJ_K0rQ48Jt9xSg5ZwWE2mDEMNA0fswiHmpu-3BGguvTyop-VMdxeiShXkcQY0VWk7vi065LsKoU1L7Y9S6iXoWVaM34dnFlzkZIFKqsMJ9jlzP0nAFR1Gn4TfHMe3-y7bS6b1tOvfEAAmZHlCKn9uCm9b939a4Bg7U7JlOg0a3Yo6bNcvbvZ6iFfLTChscesSW0lvtZJd5Db9bePcXdy8a9Wnp3V0gpiQ3wkqL6gI9Cu7jVvQtf-5wIh1-YZy5xfR2Rw'
    }
  ]
};

const PRIVATE_KEY_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAuZ+353hwzarNPLEXfsh7f+c6FHjLQoA6RE0dKN8f5+ygmsyP
SHxX8d47AIsQGOd3mOPJvz8ysGXul9KYzg95i8UNJoinWTShJUi5dr049gvbrDzX
iTL+mfyJ1dkIBoURP0q+49g0u7hk9nSrvz3jdVuvxEkHjFdaE+KhGEEQg+VdkV4/
FNVFheyT0jgV6u4nn+bRDpEEF3UM1Vg9hlcyCdb/AdQqqP+w2rXi2aAdmIZDiD9b
nMANy21CFFRjLIROVU2XEx+zBo2Q7WnN9MWipyJwK63yUvN/BqhrIwB2MXl+9l+j
Ok2xZx1C6Q5Bo86zOSg54FQsFGPkPbfvZP/D5wIDAQABAoIBAF7966yw8c9pERsO
pYwBs1L0AZib4k9jWPd0gl/BvVGK7pbEMFTl9A0EdkIDg2ddfKSlTgmp3QHcekC3
PoNZPxR8AENYDsIjOH6qhlAFwukkbm/NimQ4JQKRyUEpnMeud2guT83GlwSGiaTY
E3VV03eMCdUOZHjE7B0SE9Ymqftoua3F3LOJN00Pj1JAwDaOQSKZpyeFiVCPjJxn
4rGheM/VSZBnTHjVKQYftNacrA1T+vx21Kksmg8hB5T5nQyIOjTy6w0xxrsSmkwJ
tecKmE7AY6o2ZtbFiIB13jL8n/HgCCY2dw5jWDLpHfykRLzlp8kEtyEwz2VQgDtT
8pczrECgYEA9zxD1Qe5F3OeD9kVoxAKQC67ysMxE5pBzkGB0ta8P3g51YUcVHE6p
zJhNwR4uUH1BGA0kKaVOAXhFfYCrYs909rfSsTNN20wCyF6o6h+cAmsJAGexP/4t
iN81o26+Nk4EWLo1xQDPS1+vzAQGeNpw6G11OcF1lX6Yy0db7jNvn8CgYEAxB7W8
anuczq1l46bYNPaw4Bo/9ynFrUUTxXopXgh6tRCtwranpXx1X9AwVDJjHxSI8x+3
b7YbpWQ9aw5kp+JECfvWX9oph81UEDw1EbRVOQSRzk3+TgHcecKdp3b9tFzO0ik6
rzH93ku0d0W0334e5gTiM1+r4mGduXM0HgIP7xsCgYAImAA2gMleVnE3/1xZC5Kg
Q9MWYzEhTcyjLOkwD6z8Ly6oMxRgmuPUft9czjtHUUQFSQGMBXm92XzIOmaeS0/x
A5NwVf5l5QdqawE4oiljXc7FIynzLLzCReRH3v+/7liT816dyJ6H+MOhONqFbBp4
vupZst/QkZ53HdqRePUTPQKBgQCd86M566rQ1C2U08g4HBSmXz0vVUracfQ72FK/
k7v3cR55KQruAsb6GfrDFSFY1SiOeVtDsKJOhWf99ZadDcNXD6Q40iXW2PV6EnIF
TJVxpHZVLc0EIwvn9AvBoTGhSgqtPXTPSmJ/Imtx28eg3rZZDrSHjfZigEy4Z+oy
dojGwKBgQCLQJXSoXW2YJ0cj7qn/9n10ZpcryLDyC631G8zThh6Y9I0QvdSTv41Q
fdAmckewjxjgnN2Q/BROfS8j5kyrZeKnPMT/ewB04gc63jT6pM4e0xgqtvwBYTgD
i68WiIBTFqSKJLn5g9o0Rc4U74bngSdCB+RQy/yGkbIrz1RqcLoCAg==
-----END RSA PRIVATE KEY-----`;

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuZ+353hwzarNPLEXfsh7
f+c6FHjLQoA6RE0dKN8f5+ygmsyPSHxX8d47AIsQGOd3mOPJvz8ysGXul9KYzg95
i8UNJoinWTShJUi5dr049gvbrDzXiTL+mfyJ1dkIBoURP0q+49g0u7hk9nSrvz3j
dVuvxEkHjFdaE+KhGEEQg+VdkV4/FNVFheyT0jgV6u4nn+bRDpEEF3UM1Vg9hlcy
Cdb/AdQqqP+w2rXi2aAdmIZDiD9bnMANy21CFFRjLIROVU2XEx+zBo2Q7WnN9MWi
pyJwK63yUvN/BqhrIwB2MXl+9l+jOk2xZx1C6Q5Bo86zOSg54FQsFGPkPbfvZP/D
5wIDAQAB
-----END PUBLIC KEY-----`;

function spawnProcess(command, args, options) {
  const child = spawn(command, args, options);
  const exits = new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal }));
  });
  return { child, exits };
}

function startMockJwksServer(port) {
  const jwksServer = spawnProcess(process.execPath, [
    '-e',
    `const http=require('http');const data=${JSON.stringify(JWKS_JSON)};http.createServer((req,res)=>{res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(data));}).listen(${port});setInterval(()=>{},1000);`
  ], {
    env: { ...process.env },
    stdio: ['ignore', 'ignore', 'inherit']
  });

  const waitForListen = async () => {
    const start = Date.now();
    while (Date.now() - start < 5000) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        if (res.ok) return true;
      } catch (_) {}
      await delay(100);
    }
    return false;
  };

  return {
    async ready() {
      const ok = await waitForListen();
      if (!ok) {
        jwksServer.child.kill('SIGTERM');
        throw new Error('JWKS server failed to start');
      }
    },
    async stop() {
      jwksServer.child.kill('SIGTERM');
      await jwksServer.exits;
    }
  };
}

function createJwt({ iss, aud, sub, expSeconds = 600 }) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss, aud, sub, exp: Math.floor(Date.now() / 1000) + expSeconds })).toString('base64url');
  const crypto = require('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(PRIVATE_KEY_PEM, 'base64url');
  return `${header}.${payload}.${signature}`;
}

async function waitForServer(port) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/about`);
      if (res.ok) {
        return true;
      }
    } catch (_) {}
    await delay(200);
  }
  return false;
}

async function startMcpServer(envOverrides) {
  const port = envOverrides.SERVER_PORT;
  const proc = spawnProcess(process.execPath, [SERVER_ENTRY], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'sk-test',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'sk-test',
      LOG_LEVEL: 'warn',
      ...envOverrides
    },
    stdio: ['ignore', 'ignore', 'inherit']
  });

  const ready = await waitForServer(port);
  if (!ready) {
    proc.child.kill('SIGTERM');
    throw new Error('MCP server failed to start');
  }

  return {
    async stop() {
      proc.child.kill('SIGTERM');
      await proc.exits;
    }
  };
}

async function createClient(baseUrl, token) {
  const transport = new StreamableHTTPClientTransport(`${baseUrl}/mcp`, {
    fetch,
    requestInit: {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }
  });

  const client = new Client({ name: 'oauth-spec', version: '0.1.0' }, {
    capabilities: {
      tools: {},
      prompts: { listChanged: true },
      resources: { listChanged: true, subscribe: true }
    }
  });

  await transport.start();
  await client.connect(transport, { timeout: 12000 });

  return {
    client,
    async close() {
      await client.close().catch(() => {});
      await transport.close().catch(() => {});
    }
  };
}

async function testPositiveJwtFlow() {
  console.log('\n=== OAuth Positive JWT Flow ===');
  const jwksPort = 38231;
  const serverPort = 38232;
  const audience = 'mcp-server';
  const issuer = `http://127.0.0.1:${jwksPort}`;

  const jwks = startMockJwksServer(jwksPort);
  await jwks.ready();

  const server = await startMcpServer({
    SERVER_PORT: serverPort,
    MODE: 'ALL',
    AUTH_JWKS_URL: `http://127.0.0.1:${jwksPort}`,
    AUTH_EXPECTED_AUD: audience,
    SERVER_API_KEY: ''
  });

  try {
    const token = createJwt({ iss: issuer, aud: audience, sub: 'tester' });
    const { client, close } = await createClient(`http://127.0.0.1:${serverPort}`, token);

    const tools = await client.listTools({});
    assert(Array.isArray(tools.tools), 'Expected tools array');
    await close();
  } finally {
    await server.stop();
    await jwks.stop();
  }
}

async function expectHttpFailure(baseUrl, token, expectedStatus) {
  try {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    });
    assert.strictEqual(res.status, expectedStatus, `Expected HTTP ${expectedStatus}, got ${res.status}`);
  } catch (error) {
    throw new Error(`Expected HTTP ${expectedStatus} but request failed early: ${error.message}`);
  }
}

async function testNegativeCases() {
  console.log('\n=== OAuth Negative Cases ===');
  const jwksPort = 38233;
  const serverPort = 38234;
  const audience = 'mcp-server';
  const issuer = `http://127.0.0.1:${jwksPort}`;

  const jwks = startMockJwksServer(jwksPort);
  await jwks.ready();

  const server = await startMcpServer({
    SERVER_PORT: serverPort,
    MODE: 'ALL',
    AUTH_JWKS_URL: `http://127.0.0.1:${jwksPort}`,
    AUTH_EXPECTED_AUD: audience,
    SERVER_API_KEY: ''
  });

  try {
    const baseUrl = `http://127.0.0.1:${serverPort}`;

    // Missing token
    await expectHttpFailure(baseUrl, null, 401);

    // Wrong audience
    const wrongAudToken = createJwt({ iss: issuer, aud: 'wrong-aud', sub: 'tester' });
    await expectHttpFailure(baseUrl, wrongAudToken, 403);

    // Expired token
    const expiredToken = createJwt({ iss: issuer, aud: audience, sub: 'tester', expSeconds: -10 });
    await expectHttpFailure(baseUrl, expiredToken, 403);
  } finally {
    await server.stop();
    await jwks.stop();
  }
}

async function testRateLimiting() {
  console.log('\n=== Rate Limiting Tests ===');
  const serverPort = 38235;

  const server = await startMcpServer({
    SERVER_PORT: serverPort,
    MODE: 'ALL',
    // Disable auth to test rate limiting specifically
    SERVER_API_KEY: '',
    ALLOW_NO_API_KEY: 'true'
  });

  try {
    const baseUrl = `http://127.0.0.1:${serverPort}`;

    // Test 1: Normal requests should work
    const response1 = await fetch(`${baseUrl}/about`);
    assert.strictEqual(response1.status, 200, 'First request should succeed');

    // Test 2: Multiple requests should work within limit
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(fetch(`${baseUrl}/about`));
    }
    const responses = await Promise.all(promises);
    const successCount = responses.filter(r => r.status === 200).length;
    assert(successCount >= 9, `Expected at least 9 successful requests, got ${successCount}`);

    // Test 3: Check rate limit headers are present
    const rateLimitResponse = await fetch(`${baseUrl}/about`);
    assert(rateLimitResponse.headers.has('X-RateLimit-Limit'), 'Rate limit headers should be present');
    assert(rateLimitResponse.headers.has('X-RateLimit-Remaining'), 'Rate limit remaining header should be present');

  } finally {
    await server.stop();
  }
}

(async () => {
  try {
    await testPositiveJwtFlow();
    await testNegativeCases();
    await testRateLimiting();
    console.log('\n✅ OAuth resource server and rate limiting tests completed.');
  } catch (error) {
    console.error('OAuth resource server tests failed:', error);
    process.exitCode = 1;
  }
})();


