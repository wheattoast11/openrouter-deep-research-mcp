#!/usr/bin/env node
// scripts/production-readiness-check.js
// Comprehensive production readiness validation

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const checks = [];

function check(category, name, fn) {
  try {
    const result = fn();
    checks.push({ category, name, status: 'PASS', result });
    console.log(`✅ [${category}] ${name}`);
    return true;
  } catch (err) {
    checks.push({ category, name, status: 'FAIL', error: err.message });
    console.log(`❌ [${category}] ${name}: ${err.message}`);
    return false;
  }
}

console.log('=== Production Readiness Check v2.1.1-beta ===\n');

// 1. File Structure
check('Files', 'Core server exists', () => {
  if (!fs.existsSync('./src/server/mcpServer.js')) throw new Error('Missing');
});

check('Files', 'Tools module exists', () => {
  if (!fs.existsSync('./src/server/tools.js')) throw new Error('Missing');
});

check('Files', 'Security module exists', () => {
  if (!fs.existsSync('./src/utils/security.js')) throw new Error('Missing');
});

check('Files', 'Embeddings adapter exists', () => {
  if (!fs.existsSync('./src/utils/embeddingsAdapter.js')) throw new Error('Missing');
});

check('Files', 'WebSocket transport exists', () => {
  if (!fs.existsSync('./src/server/wsTransport.js')) throw new Error('Missing');
});

check('Files', 'Binary entry points exist', () => {
  if (!fs.existsSync('./bin/openrouter-agents.js')) throw new Error('Missing openrouter-agents.js');
  if (!fs.existsSync('./bin/openrouter-agents-mcp.js')) throw new Error('Missing openrouter-agents-mcp.js');
});

check('Files', 'env.example exists', () => {
  if (!fs.existsSync('./env.example')) throw new Error('Missing');
});

// 2. Test Suites
const testFiles = [
  'mcp-matrix.spec.js',
  'streaming-contract.spec.js',
  'oauth-resource-server.spec.js',
  'dual-embedding-eval.spec.js',
  'perf-bench.js',
  'idempotency-lease.spec.js',
  'cache-invalidation.spec.js',
  'model-routing.spec.js',
  'zod-schema-validation.spec.js',
  'resource-subscription.spec.js',
  'fault-injection.spec.js',
  'security-hardening.spec.js',
  'webcontainer-zero-integration.spec.js',
  'e2e-user-journeys.spec.js',
  'beta-features-isolation.spec.js',
  'mcp-sdk-compatibility.spec.js'
];

testFiles.forEach(file => {
  check('Tests', file, () => {
    if (!fs.existsSync(`./tests/${file}`)) throw new Error('Missing');
  });
});

// 3. Documentation
const docs = [
  'docs/CHANGELOG.md',
  'README.md'
];

docs.forEach(doc => {
  check('Docs', doc, () => {
    if (!fs.existsSync(doc)) throw new Error('Missing');
  });
});

// Beta-specific documentation checks
check('Docs', 'env.example has BETA_FEATURES', () => {
  const envExample = fs.readFileSync('./env.example', 'utf8');
  if (!envExample.includes('BETA_FEATURES')) throw new Error('BETA_FEATURES not documented in env.example');
});

// 4. CI/CD
check('CI/CD', 'GitHub Actions workflow', () => {
  if (!fs.existsSync('.github/workflows/ci-matrix.yml')) throw new Error('Missing');
});

// 5. Package Configuration
check('Package', 'Version is 1.6.0', () => {
  const pkg = require('../package.json');
  if (pkg.version !== '1.6.0') throw new Error(`Version is ${pkg.version}, expected 1.6.0`);
});

check('Package', 'Has test:suite script', () => {
  const pkg = require('../package.json');
  if (!pkg.scripts['test:suite']) throw new Error('Missing test:suite');
});

check('Package', 'Has qa:report script', () => {
  const pkg = require('../package.json');
  if (!pkg.scripts['qa:report']) throw new Error('Missing qa:report');
});

// 6. Module Loading
check('Modules', 'Security module loads', () => {
  const security = require('../src/utils/security');
  if (typeof security.redactSecrets !== 'function') throw new Error('redactSecrets missing');
  if (typeof security.validateUrlForFetch !== 'function') throw new Error('validateUrlForFetch missing');
});

check('Modules', 'Embeddings adapter loads', () => {
  const adapter = require('../src/utils/embeddingsAdapter');
  if (typeof adapter.initializeEmbeddings !== 'function') throw new Error('initializeEmbeddings missing');
});

check('Modules', 'DB migrations module loads', () => {
  const migrations = require('../src/utils/dbMigrations');
  if (typeof migrations.applySqlMigrations !== 'function') throw new Error('applySqlMigrations missing');
});

// 7. Quick Functional Tests
check('Functional', 'Security redaction works', () => {
  const security = require('../src/utils/security');
  const text = 'Bearer sk-or-v1-abc123';
  const redacted = security.redactSecrets(text);
  if (redacted.includes('sk-or-v1-abc123')) throw new Error('Redaction failed');
});

check('Functional', 'SSRF validation blocks localhost', () => {
  const security = require('../src/utils/security');
  const result = security.validateUrlForFetch('http://localhost:3000');
  if (result.valid) throw new Error('Should block localhost');
});

check('Functional', 'SQL validation blocks DROP', () => {
  const security = require('../src/utils/security');
  const result = security.validateSqlQuery('DROP TABLE reports');
  if (result.valid) throw new Error('Should block DROP');
});

// Summary
console.log('\n=== Summary ===');
const passed = checks.filter(c => c.status === 'PASS').length;
const failed = checks.filter(c => c.status === 'FAIL').length;
const total = checks.length;

console.log(`Total Checks: ${total}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.log('\n❌ FAILED CHECKS:');
  checks.filter(c => c.status === 'FAIL').forEach(c => {
    console.log(`  - [${c.category}] ${c.name}: ${c.error}`);
  });
  process.exitCode = 1;
} else {
  console.log('\n✅ ALL CHECKS PASSED - PRODUCTION READY');
}

// 5. Package metadata
check('Package', 'Version is 2.1.1-beta', () => {
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  if (pkg.version !== '2.1.1-beta') throw new Error(`Expected 2.1.1-beta, got ${pkg.version}`);
});

check('Package', 'Bin scripts defined', () => {
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  if (!pkg.bin || !pkg.bin['openrouter-agents']) throw new Error('Missing bin scripts');
});

console.log('\n=== Next Steps ===');
console.log('1. Run: npm run test:all-beta');
console.log('2. Run: node scripts/beta-smoke-test.js');
console.log('3. Review beta documentation');
console.log('4. Test Docker build: docker build -t openrouter-agents:test .');
console.log('5. Push to beta branch!');

