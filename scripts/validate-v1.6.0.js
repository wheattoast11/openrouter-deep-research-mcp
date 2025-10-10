#!/usr/bin/env node
// scripts/validate-v1.6.0.js
// Validates all v1.6.0 deliverables are in place

const fs = require('fs');
const path = require('path');

const REQUIRED_FILES = [
  // Test suites
  'tests/mcp-matrix.spec.js',
  'tests/streaming-contract.spec.js',
  'tests/oauth-resource-server.spec.js',
  'tests/dual-embedding-eval.spec.js',
  'tests/perf-bench.js',
  'tests/idempotency-lease.spec.js',
  'tests/cache-invalidation.spec.js',
  'tests/model-routing.spec.js',
  'tests/zod-schema-validation.spec.js',
  'tests/resource-subscription.spec.js',
  'tests/fault-injection.spec.js',
  'tests/security-hardening.spec.js',
  'tests/webcontainer-zero-integration.spec.js',
  
  // Utilities
  'src/utils/security.js',
  'src/utils/dbMigrations.js',
  'src/utils/embeddingsAdapter.js',
  
  // Migrations
  'sql/migrations/20241007_add_alt_embeddings.sql',
  
  // Scripts
  'scripts/generate-qa-report.js',
  
  // Docs
  'docs/UPGRADE-v1.6.0.md',
  'docs/RELEASE-v1.6.0.md',
  'docs/CHANGELOG.md',
  'docs/test-architecture.mmd',
  'PRODUCTION-HARDENING-COMPLETE.md',
  'IMPLEMENTATION-SUMMARY-v1.6.0.md',
  
  // CI/CD
  '.github/workflows/ci-matrix.yml'
];

const ROOT = path.resolve(__dirname, '..');

function check() {
  let missing = 0;
  let found = 0;
  
  for (const file of REQUIRED_FILES) {
    const fullPath = path.join(ROOT, file);
    if (fs.existsSync(fullPath)) {
      console.log(`✅ ${file}`);
      found++;
    } else {
      console.log(`❌ MISSING: ${file}`);
      missing++;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Found: ${found}/${REQUIRED_FILES.length}`);
  console.log(`Missing: ${missing}`);
  
  if (missing === 0) {
    console.log('\n✅ All v1.6.0 deliverables present.');
  } else {
    console.log(`\n❌ ${missing} file(s) missing.`);
    process.exitCode = 1;
  }
}

check();

