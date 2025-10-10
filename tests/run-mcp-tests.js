#!/usr/bin/env node
/**
 * MCP Test Suite Runner
 * Runs all MCP v2.1 compliance tests
 */

const { spawn } = require('child_process');
const path = require('path');

const tests = [
  'mcp-http-streamable.spec.js',
  'mcp-lifecycle-utils.spec.js',
  'mcp-auth-discovery.spec.js',
  'mcp-pagination.spec.js',
  'mcp-completion.spec.js'
];

// Use a stable test port and public URL for consistency
const TEST_PORT = process.env.TEST_MCP_PORT || '3008';
const envOverrides = {
  ALLOW_NO_API_KEY: process.env.ALLOW_NO_API_KEY || 'true',
  SERVER_PORT: TEST_PORT,
  PUBLIC_URL: `http://127.0.0.1:${TEST_PORT}`,
  REQUIRE_HTTPS: 'false'
};

console.log('='.repeat(70));
console.log('MCP v2.1 Test Suite');
console.log('='.repeat(70));
console.log('');

let passed = 0;
let failed = 0;

function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['bin/openrouter-agents-mcp.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, ...envOverrides },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let ready = false;
    const onData = (chunk) => {
      const text = chunk.toString();
      process.stderr.write(text);
      if (!ready && (text.includes(`MCP server listening on port ${TEST_PORT}`) || text.includes('Streamable HTTP v2.1 enabled'))) {
        ready = true;
        resolve(server);
      }
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);

    server.on('exit', (code) => {
      if (!ready) reject(new Error(`Server exited before ready (code ${code})`));
    });

    // Fallback timeout if logs are suppressed
    setTimeout(() => { if (!ready) resolve(server); }, 2500);
  });
}

function stopServer(server) {
  return new Promise((resolve) => {
    if (!server || server.killed) return resolve();
    try { server.kill(); } catch (_) {}
    setTimeout(() => resolve(), 500);
  });
}

async function runTest(testFile) {
  return new Promise((resolve) => {
    console.log(`\nRunning ${testFile}...`);
    const testPath = path.join(__dirname, testFile);
    const child = spawn('node', [testPath], {
      stdio: 'inherit',
      env: { ...process.env, ...envOverrides }
    });

    child.on('close', (code) => {
      if (code === 0) {
        passed++;
        console.log(`✅ ${testFile} PASSED\n`);
      } else {
        failed++;
        console.log(`❌ ${testFile} FAILED\n`);
      }
      resolve(code);
    });
  });
}

async function runAllTests() {
  const server = await startServer();
  try {
    for (const test of tests) {
      await runTest(test);
    }
  } finally {
    await stopServer(server);
  }

  console.log('\n' + '='.repeat(70));
  console.log('Test Suite Summary');
  console.log('='.repeat(70));
  console.log(`Total Tests: ${tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('='.repeat(70));

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests();

