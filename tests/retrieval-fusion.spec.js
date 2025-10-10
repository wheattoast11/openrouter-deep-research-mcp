#!/usr/bin/env node
// tests/retrieval-fusion.spec.js
// Tests for retrieval fusion (graph + vector + BM25) and graph expansion

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const { Client } = require('@modelcontextprotocol/sdk/client');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp');
const { setTimeout: delay } = require('timers/promises');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'src', 'server', 'mcpServer.js');

async function withClient(client, fn) {
  try {
    await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

async function startServer(port) {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      SERVER_PORT: String(port),
      MODE: 'AGENT',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'sk-test',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'sk-test',
      ALLOW_NO_API_KEY: 'true',
      LOG_LEVEL: 'warn'
    },
    stdio: ['ignore', 'ignore', 'inherit']
  });

  const waitForReady = async () => {
    const start = Date.now();
    while (Date.now() - start < 15000) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/about`);
        if (res.ok) return true;
      } catch (_) {}
      await delay(200);
    }
    return false;
  };

  const ready = await waitForReady();
  if (!ready) {
    child.kill('SIGTERM');
    throw new Error('Server failed to start');
  }

  return {
    child,
    async stop() {
      child.kill('SIGTERM');
      await delay(250);
    }
  };
}

async function testGraphExpansion() {
  console.log('\n=== Graph Expansion Test ===');

  const PORT = 38240;
  const server = await startServer(PORT);

  try {
    const client = new Client({ name: 'fusion-test', version: '0.1.0' }, {
      capabilities: { tools: {} }
    });

    const transport = new StreamableHTTPClientTransport(`http://127.0.0.1:${PORT}/mcp`, {
      fetch,
      requestInit: {
        headers: {
          Authorization: 'Bearer test-token'
        }
      }
    });

    await transport.start();
    await client.connect(transport, { timeout: 12000 });

    // Test retrieval with graph enrichment
    const result = await client.callTool({
      name: 'retrieve',
      arguments: {
        query: 'machine learning',
        k: 5,
        mode: 'index'
      }
    });

    // Check that result includes graph enrichment metadata
    assert(result.content, 'Expected result content');
    const parsed = JSON.parse(result.content);

    // Should include metadata about graph expansion
    assert(typeof parsed.graph_enhanced === 'boolean', 'Should include graph_enhanced flag');
    assert(Array.isArray(parsed.expanded_queries), 'Should include expanded_queries array');
    assert(Array.isArray(parsed.results), 'Should include results array');
    assert(typeof parsed.total_results === 'number', 'Should include total_results count');

    console.log(`✅ Graph expansion working: ${parsed.expanded_queries.length} queries, ${parsed.total_results} results, graph_enhanced: ${parsed.graph_enhanced}`);

    await transport.close();
  } finally {
    await server.stop();
  }
}

async function testRetrievalFusion() {
  console.log('\n=== Retrieval Fusion Test ===');

  const PORT = 38241;
  const server = await startServer(PORT);

  try {
    const client = new Client({ name: 'fusion-test', version: '0.1.0' }, {
      capabilities: { tools: {} }
    });

    const transport = new StreamableHTTPClientTransport(`http://127.0.0.1:${PORT}/mcp`, {
      fetch,
      requestInit: {
        headers: {
          Authorization: 'Bearer test-token'
        }
      }
    });

    await transport.start();
    await client.connect(transport, { timeout: 12000 });

    // Test retrieval without graph enrichment (should still work)
    const result = await client.callTool({
      name: 'retrieve',
      arguments: {
        query: 'artificial intelligence',
        k: 3,
        mode: 'index',
        scope: 'reports'
      }
    });

    assert(result.content, 'Expected result content');
    const parsed = JSON.parse(result.content);

    // Should have results with combined scoring
    assert(Array.isArray(parsed.results), 'Should have results array');
    assert(parsed.results.length > 0, 'Should have at least one result');

    // Check that results have combined_score
    const firstResult = parsed.results[0];
    assert(typeof firstResult.combined_score === 'number', 'Results should have combined_score');

    console.log(`✅ Retrieval fusion working: ${parsed.results.length} results with combined scoring`);

    await transport.close();
  } finally {
    await server.stop();
  }
}

async function testReranking() {
  console.log('\n=== Reranking Test ===');

  const PORT = 38242;
  const server = await startServer(PORT);

  try {
    const client = new Client({ name: 'fusion-test', version: '0.1.0' }, {
      capabilities: { tools: {} }
    });

    const transport = new StreamableHTTPClientTransport(`http://127.0.0.1:${PORT}/mcp`, {
      fetch,
      requestInit: {
        headers: {
          Authorization: 'Bearer test-token'
        }
      }
    });

    await transport.start();
    await client.connect(transport, { timeout: 12000 });

    // Test retrieval with reranking
    const result = await client.callTool({
      name: 'retrieve',
      arguments: {
        query: 'neural networks',
        k: 5,
        mode: 'index',
        rerank: true
      }
    });

    assert(result.content, 'Expected result content');
    const parsed = JSON.parse(result.content);

    // Results should be reranked by combined score
    assert(Array.isArray(parsed.results), 'Should have results array');
    assert(parsed.results.length > 1, 'Should have multiple results to test reranking');

    // Check that results are sorted by combined_score (descending)
    for (let i = 1; i < parsed.results.length; i++) {
      assert(
        parsed.results[i-1].combined_score >= parsed.results[i].combined_score,
        'Results should be sorted by combined_score descending'
      );
    }

    console.log(`✅ Reranking working: results sorted by combined score`);

    await transport.close();
  } finally {
    await server.stop();
  }
}

(async () => {
  console.log('=== Retrieval Fusion Tests ===');
  try {
    await testGraphExpansion();
    await testRetrievalFusion();
    await testReranking();
    console.log('\n✅ All retrieval fusion tests completed successfully.');
  } catch (error) {
    console.error('Retrieval fusion test failed:', error);
    process.exitCode = 1;
  }
})();
