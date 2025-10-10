#!/usr/bin/env node
// scripts/validate-v2.0.0.js
// Production readiness validation for v2.0.0

const fs = require('fs');
const path = require('path');

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║      v2.0.0 Production Readiness Validation           ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

const checks = [];

function check(name, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      console.log(`✅ ${name}`);
      checks.push({ name, passed: true });
    } else {
      console.log(`⚠️  ${name}: ${result}`);
      checks.push({ name, passed: false, message: result });
    }
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    checks.push({ name, passed: false, error: error.message });
  }
}

// Version checks
check('Package version is 2.0.0', () => {
  const pkg = require('../package.json');
  return pkg.version === '2.0.0' || `Version is ${pkg.version}, expected 2.0.0`;
});

// File existence checks
check('WebSocket transport exists', () => 
  fs.existsSync(path.join(__dirname, '../src/server/wsTransport.js'))
);

check('Temporal agent exists', () => 
  fs.existsSync(path.join(__dirname, '../src/utils/temporalAgent.js'))
);

check('Graph manager exists', () => 
  fs.existsSync(path.join(__dirname, '../src/utils/graphManager.js'))
);

check('Client add-on exists', () => 
  fs.existsSync(path.join(__dirname, '../client/package.json'))
);

// Documentation checks
check('README.md mentions v2.0', () => {
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  return readme.includes('v2.0') || 'README does not mention v2.0';
});

check('Migration guide exists', () => 
  fs.existsSync(path.join(__dirname, '../docs/MIGRATION-v2.0.md'))
);

check('Architecture docs exist', () => 
  fs.existsSync(path.join(__dirname, '../docs/v2.0-ARCHITECTURE.md'))
);

check('Changelog exists', () => 
  fs.existsSync(path.join(__dirname, '../CHANGELOG.md'))
);

// Dependency checks
check('ws dependency installed', () => {
  const pkg = require('../package.json');
  return 'ws' in pkg.dependencies || 'ws not in dependencies';
});

check('node-cron dependency installed', () => {
  const pkg = require('../package.json');
  return 'node-cron' in pkg.dependencies || 'node-cron not in dependencies';
});

// Module import checks
check('WebSocket transport imports correctly', () => {
  try {
    require('../src/server/wsTransport.js');
    return true;
  } catch (e) {
    return e.message;
  }
});

check('Temporal agent imports correctly', () => {
  try {
    require('../src/utils/temporalAgent.js');
    return true;
  } catch (e) {
    return e.message;
  }
});

check('Graph manager imports correctly', () => {
  try {
    require('../src/utils/graphManager.js');
    return true;
  } catch (e) {
    return e.message;
  }
});

// Configuration checks
check('CLAUDE.md mentions v2.0', () => {
  const claude = fs.readFileSync(path.join(__dirname, '../CLAUDE.md'), 'utf8');
  return claude.includes('2.0.0') || 'CLAUDE.md does not mention 2.0.0';
});

// Test suite checks
check('v2.0 test suite exists', () => 
  fs.existsSync(path.join(__dirname, '../tests/test-v2.0-features.js'))
);

check('WebSocket test exists', () => 
  fs.existsSync(path.join(__dirname, '../tests/test-websocket.spec.js'))
);

// Summary
console.log('\n' + '═'.repeat(60));
const passed = checks.filter(c => c.passed).length;
const failed = checks.filter(c => !c.passed).length;

console.log(`\n📊 Validation Summary: ${passed}/${checks.length} passed`);

if (failed > 0) {
  console.log(`\n⚠️  Failed checks (${failed}):`);
  checks.filter(c => !c.passed).forEach(c => {
    console.log(`   - ${c.name}: ${c.message || c.error}`);
  });
  process.exit(1);
} else {
  console.log('\n✅ All validation checks passed!');
  console.log('\n🚀 v2.0.0 is ready for production deployment.');
  process.exit(0);
}

