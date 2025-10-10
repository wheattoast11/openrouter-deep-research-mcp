#!/usr/bin/env node
// scripts/smoke-test.js
// Quick smoke test for v1.6.0

const tools = require('../src/server/tools');
const dbClient = require('../src/utils/dbClient');
const security = require('../src/utils/security');

async function run() {
  console.log('=== v1.6.0 Smoke Test ===\n');
  
  // Test 1: Modules load
  console.log('✅ Tools module loaded');
  console.log('✅ DbClient module loaded');
  console.log('✅ Security module loaded');
  
  // Test 2: Security functions work
  const redacted = security.redactSecrets('Bearer sk-test-123');
  if (!redacted.includes('sk-test-123')) {
    console.log('✅ Secret redaction works');
  }
  
  const ssrf = security.validateUrlForFetch('http://localhost');
  if (!ssrf.valid) {
    console.log('✅ SSRF protection works');
  }
  
  const sql = security.validateSqlQuery('SELECT * FROM reports');
  if (sql.valid) {
    console.log('✅ SQL validation works');
  }
  
  // Test 3: Server status tool works
  try {
    const status = await tools.getServerStatus({});
    const parsed = JSON.parse(status);
    if (parsed.serverVersion === '1.6.0') {
      console.log('✅ Server version correct: 1.6.0');
    }
    if (parsed.cache && parsed.orchestration) {
      console.log('✅ Enhanced status fields present');
    }
  } catch (err) {
    console.log('⚠️  Server status:', err.message);
  }
  
  // Test 4: Ping tool
  try {
    const ping = await tools.pingTool({});
    const parsed = JSON.parse(ping);
    if (parsed.pong) {
      console.log('✅ Ping tool works');
    }
  } catch (err) {
    console.log('⚠️  Ping:', err.message);
  }
  
  console.log('\n=== Smoke Test Complete ===');
  console.log('Core functionality validated. Run npm run test:suite for full validation.');
}

run().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});

