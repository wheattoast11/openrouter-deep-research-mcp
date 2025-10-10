#!/usr/bin/env node
/**
 * MCP Async Job Lifecycle Tests
 * Tests submitting a job, polling status, and retrieving results.
 */

const http = require('http');
const config = require('../config');
const assert = require('assert');

const BASE_URL = `http://localhost:${config.server.port}`;
let sessionId = null;
let testsPassed = 0;
let testsFailed = 0;

function log(message) {
  console.log(`[MCP-Jobs-Test] ${message}`);
}

async function makeRequest(method, path, headers = {}, body = null) {
  const maybeAuth = process.env.SERVER_API_KEY ? { Authorization: `Bearer ${process.env.SERVER_API_KEY}` } : {};
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...maybeAuth, ...headers },
    };
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: data ? JSON.parse(data) : null
      }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function initializeSession() {
  const initRes = await makeRequest('POST', '/mcp', { 'MCP-Protocol-Version': '2025-03-26' }, {
    jsonrpc: '2.0',
    id: 'init-1',
    method: 'initialize',
    params: { protocolVersion: '2025-03-26' }
  });
  sessionId = initRes.headers['mcp-session-id'];
  await makeRequest('POST', '/mcp', { 'MCP-Protocol-Version': '2025-03-26', 'Mcp-Session-Id': sessionId }, {
    jsonrpc: '2.0',
    method: 'notifications/initialized'
  });
  log(`Initialized session: ${sessionId}`);
}

async function waitForJob(jobId, timeout = 20000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const res = await makeRequest('POST', '/mcp', {
      'MCP-Protocol-Version': '2025-03-26',
      'Mcp-Session-Id': sessionId
    }, {
      jsonrpc: '2.0',
      id: `poll-${jobId}-${Date.now()}`,
      method: 'job_status',
      params: { job_id: jobId, format: 'summary' }
    });
    const { result } = res.body;
    const jobStatus = JSON.parse(result.content[0].text);
    if (['succeeded', 'failed', 'canceled'].includes(jobStatus.status)) {
      return jobStatus;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Job ${jobId} timed out.`);
}

async function runTests() {
  log('Starting MCP Async Job Lifecycle Tests...\n');
  await initializeSession();
  
  // Test 1: Get result for a non-existent job
  log('Test 1: get_job_result for non-existent job');
  try {
    const res = await makeRequest('POST', '/mcp', { 'Mcp-Session-Id': sessionId }, {
      jsonrpc: '2.0', id: 'test-1', method: 'get_job_result', params: { job_id: 'job-does-not-exist' }
    });
    const result = JSON.parse(res.body.result.content[0].text);
    assert.strictEqual(result.status, 'not_found', 'Status is not_found');
    testsPassed++;
  } catch (e) {
    log(`❌ Test 1 failed: ${e.message}`);
    testsFailed++;
  }

  // Test 2: Submit a job and test get_job_result on a running job
  log('\nTest 2: Submit job and check result for running job');
  let jobId;
  try {
    const submitRes = await makeRequest('POST', '/jobs', {}, { query: 'test query for job result' });
    jobId = submitRes.body.job_id;
    assert.ok(jobId, 'Job submission returned a job_id');
    
    const res = await makeRequest('POST', '/mcp', { 'Mcp-Session-Id': sessionId }, {
      jsonrpc: '2.0', id: 'test-2', method: 'get_job_result', params: { job_id: jobId }
    });
    const result = JSON.parse(res.body.result.content[0].text);
    assert.notStrictEqual(result.status, 'succeeded', 'Status is not succeeded');
    assert.ok(result.error, 'Error message is present for non-succeeded job');
    testsPassed++;
  } catch (e) {
    log(`❌ Test 2 failed: ${e.message}`);
    testsFailed++;
  }

  // Test 3: Submit_research returns resource links
  log('\nTest 3: submit_research returns resource links');
  try {
    const res = await makeRequest('POST', '/mcp', { 'Mcp-Session-Id': sessionId }, {
      jsonrpc: '2.0', id: 'test-3', method: 'submit_research', params: { query: 'test for resource links' }
    });
    const result = JSON.parse(res.body.result.content[0].text);
    assert.ok(result.resources, 'Result contains resources array');
    assert.strictEqual(result.resources.length, 3, 'Resources array has 3 links');
    assert.ok(result.resources.find(r => r.rel === 'monitor'), 'Monitor link is present');
    testsPassed++;
    jobId = result.job_id; // Use this job for the next test
  } catch (e) {
    log(`❌ Test 3 failed: ${e.message}`);
    testsFailed++;
  }

  // Test 4: Wait for job to succeed and get result
  log('\nTest 4: Wait for job to succeed and get result');
  try {
    const finalStatus = await waitForJob(jobId);
    assert.strictEqual(finalStatus.status, 'succeeded', 'Job status is succeeded');

    const res = await makeRequest('POST', '/mcp', { 'Mcp-Session-Id': sessionId }, {
      jsonrpc: '2.0', id: 'test-3', method: 'get_job_result', params: { job_id: jobId }
    });
    const result = JSON.parse(res.body.result.content[0].text);
    assert.ok(result.message, 'Result object has a message');
    assert.ok(result.message.includes('test for resource links'), 'Result message is plausible');
    testsPassed++;
  } catch (e) {
    log(`❌ Test 4 failed: ${e.message}`);
    testsFailed++;
  }

  // Test 5: job_id parameter normalization
  log('\nTest 5: job_id parameter normalization for job_status');
  try {
    const resWithJobId = await makeRequest('POST', '/mcp', { 'Mcp-Session-Id': sessionId }, {
      jsonrpc: '2.0', id: 'test-5a', method: 'job_status', params: { jobId: jobId }
    });
    const result1 = JSON.parse(resWithJobId.body.result.content[0].text);
    assert.strictEqual(result1.id, jobId, 'job_status with { jobId } works');

    const resWithId = await makeRequest('POST', '/mcp', { 'Mcp-Session-Id': sessionId }, {
      jsonrpc: '2.0', id: 'test-5b', method: 'job_status', params: { id: jobId }
    });
    const result2 = JSON.parse(resWithId.body.result.content[0].text);
    assert.strictEqual(result2.id, jobId, 'job_status with { id } works');
    testsPassed++;
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

setTimeout(() => {
  runTests().catch(err => {
    log(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}, 2000);
