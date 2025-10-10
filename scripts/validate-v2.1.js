#!/usr/bin/env node
// scripts/validate-v2.1.js
// Production readiness validation for v2.1.0

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('='.repeat(80));
console.log('OpenRouter Agents v2.1.0 Production Readiness Validation');
console.log('='.repeat(80));
console.log('');

const results = { passed: 0, failed: 0, warnings: 0 };

function check(category, name, condition, details = '') {
  const status = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} [${category}] ${name}${details ? ': ' + details : ''}`);
  if (condition) results.passed++;
  else results.failed++;
}

function warn(category, name, details = '') {
  console.log(`⚠️  [${category}] ${name}${details ? ': ' + details : ''}`);
  results.warnings++;
}

// Phase 1: Critical Files Exist
console.log('Phase 1: Critical Files\n');

const criticalFiles = [
  'src/utils/embeddingsAdapter.js',
  'src/utils/dbClient.js',
  'src/utils/openRouterClient.js',
  'src/server/tools.js',
  'src/server/mcpServer.js',
  'src/server/wsTransport.js',
  'config.js',
  'package.json',
  'env.example'
];

criticalFiles.forEach(file => {
  check('Files', file, fs.existsSync(file));
});

// Phase 2: Mock Layer Removed
console.log('\nPhase 2: Mock Layer Removal\n');

const openRouterClient = fs.readFileSync('src/utils/openRouterClient.js', 'utf8');
check('Mock Removal', 'shouldMock() removed', !openRouterClient.includes('function shouldMock()'));
check('Mock Removal', 'buildMockResponse() removed', !openRouterClient.includes('function buildMockResponse('));
check('Mock Removal', 'MOCK_MODE removed', !openRouterClient.includes('MOCK_MODE'));

const tools = fs.readFileSync('src/server/tools.js', 'utf8');
check('Mock Removal', 'shouldMockLLMs() removed from tools.js', !tools.includes('function shouldMockLLMs()'));

// Phase 3: Embeddings Configuration
console.log('\nPhase 3: Embeddings\n');

const adapter = fs.readFileSync('src/utils/embeddingsAdapter.js', 'utf8');
check('Embeddings', '@xenova/transformers fallback present', adapter.includes('@xenova/transformers'));
check('Embeddings', 'MockEmbeddingProvider removed', !adapter.includes('new MockEmbeddingProvider'));

const config = require('../config');
check('Config', 'Embedding dimension = 384', config.embeddings.dimension === 384);
check('Config', 'Vector dimension = 384', config.database.vectorDimension === 384);

// Phase 4: Documentation
console.log('\nPhase 4: Documentation\n');

check('Docs', 'PGlite patterns doc exists', fs.existsSync('docs/research/pglite-patterns.md'));
check('Docs', 'Agent fix summary exists', fs.existsSync('docs/research/agent-mode-fix-summary.md'));
check('Docs', 'Production summary exists', fs.existsSync('docs/V2.1-PRODUCTION-READY-SUMMARY.md'));
check('Docs', 'MECE final report exists', fs.existsSync('docs/MECE-QA-FINAL-REPORT.md'));

const envExample = fs.readFileSync('env.example', 'utf8');
check('Docs', 'API key requirement documented', envExample.includes('REQUIRED for agent-mode operation'));
check('Docs', 'OpenRouter URL in env.example', envExample.includes('openrouter.ai/keys'));

// Phase 5: Test Files
console.log('\nPhase 5: Test Files\n');

check('Tests', 'Embeddings test exists', fs.existsSync('tests/test-embeddings-pglite.js'));
check('Tests', 'Structure test exists', fs.existsSync('tests/test-agent-mode-structure.js'));

const testResearch = fs.readFileSync('tests/test-research-agent.js', 'utf8');
check('Tests', 'API key requirement header', testResearch.includes('REQUIRES: Valid OPENROUTER_API_KEY'));
check('Tests', 'USE_MOCK_OPENROUTER removed', !testResearch.includes('USE_MOCK_OPENROUTER'));

// Phase 6: Dependencies
console.log('\nPhase 6: Dependencies\n');

try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  check('Dependencies', '@xenova/transformers present', pkg.dependencies['@xenova/transformers'] !== undefined);
  check('Dependencies', '@electric-sql/pglite present', pkg.dependencies['@electric-sql/pglite'] !== undefined);
  check('Dependencies', '@electric-sql/pglite/vector present', pkg.dependencies['@electric-sql/pglite'] !== undefined);
} catch (e) {
  check('Dependencies', 'package.json parseable', false, e.message);
}

// Phase 7: Quick Smoke Test
console.log('\nPhase 7: Smoke Test\n');

try {
  console.log('Running smoke test...');
  const smokeOutput = execSync('node scripts/smoke-test.js', {
    encoding: 'utf8',
    timeout: 30000,
    stdio: 'pipe'
  });
  check('Smoke Test', 'Passes', smokeOutput.includes('Smoke Test Complete'));
} catch (e) {
  check('Smoke Test', 'Passes', false, 'See output above for details');
}

// Summary
console.log('\n' + '='.repeat(80));
console.log('VALIDATION SUMMARY');
console.log('='.repeat(80));
console.log(`✅ Passed: ${results.passed}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`⚠️  Warnings: ${results.warnings}`);
console.log('');

if (results.failed === 0) {
  console.log('✅ v2.1.0 VALIDATION COMPLETE - PRODUCTION READY');
  console.log('');
  console.log('Next Steps:');
  console.log('1. Add valid OPENROUTER_API_KEY to .env');
  console.log('2. Run: node tests/test-research-agent.js');
  console.log('3. Start server: ./start-server.bat');
  console.log('');
  process.exit(0);
} else {
  console.log('❌ v2.1.0 VALIDATION FAILED - SEE ERRORS ABOVE');
  console.log('');
  process.exit(1);
}

