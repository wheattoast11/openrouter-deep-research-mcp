#!/usr/bin/env node
// scripts/pre-commit-check.js
// Quick validation before committing v2.0

console.log('🔍 Pre-commit validation for v2.0.0...\n');

const fs = require('fs');
const path = require('path');

let errors = 0;

// Check critical files exist
const requiredFiles = [
  'src/server/wsTransport.js',
  'src/utils/temporalAgent.js',
  'src/utils/graphManager.js',
  'docs/MIGRATION-v2.0.md',
  'docs/v2.0-ARCHITECTURE.md',
  'docs/QUICKSTART-v2.0.md',
  'docs/RELEASE-v2.0.0.md',
  'CHANGELOG.md',
  'V2.0-FINAL-SUMMARY.md',
  'client/package.json'
];

requiredFiles.forEach(file => {
  if (!fs.existsSync(file)) {
    console.error(`❌ Missing required file: ${file}`);
    errors++;
  } else {
    console.log(`✓ ${file}`);
  }
});

// Check version consistency
const pkg = require('../package.json');
if (pkg.version !== '2.0.0') {
  console.error(`❌ package.json version is ${pkg.version}, expected 2.0.0`);
  errors++;
} else {
  console.log(`✓ package.json version: ${pkg.version}`);
}

// Check dependencies
if (!('ws' in pkg.dependencies)) {
  console.error('❌ ws dependency missing');
  errors++;
} else {
  console.log(`✓ ws dependency: ${pkg.dependencies.ws}`);
}

if (!('node-cron' in pkg.dependencies)) {
  console.error('❌ node-cron dependency missing');
  errors++;
} else {
  console.log(`✓ node-cron dependency: ${pkg.dependencies['node-cron']}`);
}

// Check for syntax errors in new files
try {
  require('../src/server/wsTransport.js');
  console.log('✓ wsTransport.js syntax valid');
} catch (e) {
  console.error('❌ wsTransport.js syntax error:', e.message);
  errors++;
}

try {
  require('../src/utils/temporalAgent.js');
  console.log('✓ temporalAgent.js syntax valid');
} catch (e) {
  console.error('❌ temporalAgent.js syntax error:', e.message);
  errors++;
}

try {
  require('../src/utils/graphManager.js');
  console.log('✓ graphManager.js syntax valid');
} catch (e) {
  console.error('❌ graphManager.js syntax error:', e.message);
  errors++;
}

// Summary
console.log('\n' + '='.repeat(50));
if (errors === 0) {
  console.log('✅ All pre-commit checks passed!');
  console.log('\nReady to commit v2.0.0');
  process.exit(0);
} else {
  console.log(`❌ ${errors} check(s) failed`);
  console.log('\nFix errors before committing');
  process.exit(1);
}

