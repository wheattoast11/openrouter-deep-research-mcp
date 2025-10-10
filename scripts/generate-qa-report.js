#!/usr/bin/env node
// scripts/generate-qa-report.js
// Auto-generates QA summary from test results

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TESTS_DIR = path.resolve(__dirname, '../tests');
const DOCS_DIR = path.resolve(__dirname, '../docs');

const TEST_SUITES = [
  { name: 'MCP Matrix', file: 'mcp-matrix.spec.js', critical: true },
  { name: 'Streaming Contract', file: 'streaming-contract.spec.js', critical: true },
  { name: 'OAuth Resource Server', file: 'oauth-resource-server.spec.js', critical: true },
  { name: 'Dual Embedding Eval', file: 'dual-embedding-eval.spec.js', critical: false },
  { name: 'Performance Benchmark', file: 'perf-bench.js', critical: false },
  { name: 'Idempotency Lease', file: 'idempotency-lease.spec.js', critical: true },
  { name: 'Cache Invalidation', file: 'cache-invalidation.spec.js', critical: true },
  { name: 'Model Routing', file: 'model-routing.spec.js', critical: true },
  { name: 'Zod Schema Validation', file: 'zod-schema-validation.spec.js', critical: true },
  { name: 'Resource Subscription', file: 'resource-subscription.spec.js', critical: false },
  { name: 'Fault Injection', file: 'fault-injection.spec.js', critical: true },
  { name: 'Security Hardening', file: 'security-hardening.spec.js', critical: true },
  { name: 'Webcontainer /Zero', file: 'webcontainer-zero-integration.spec.js', critical: false }
];

function runTest(suite) {
  const testPath = path.join(TESTS_DIR, suite.file);
  if (!fs.existsSync(testPath)) {
    return { name: suite.name, status: 'SKIP', reason: 'File not found' };
  }
  
  try {
    console.log(`Running: ${suite.name}`);
    execSync(`node "${testPath}"`, {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'pipe',
      timeout: 120000
    });
    return { name: suite.name, status: 'PASS', critical: suite.critical };
  } catch (err) {
    return {
      name: suite.name,
      status: 'FAIL',
      critical: suite.critical,
      error: err.message
    };
  }
}

function generateReport(results) {
  const timestamp = new Date().toISOString();
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  const criticalFailed = results.filter(r => r.status === 'FAIL' && r.critical).length;
  
  let report = `# QA Test Report\n\n`;
  report += `**Generated:** ${timestamp}\n\n`;
  report += `**Summary:** ${passed}/${total} passed, ${failed} failed, ${skipped} skipped\n\n`;
  report += `**Critical Failures:** ${criticalFailed}\n\n`;
  
  report += `## Test Results\n\n`;
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    const critical = r.critical ? ' [CRITICAL]' : '';
    report += `${icon} **${r.name}**${critical}: ${r.status}\n`;
    if (r.error) {
      report += `   - Error: ${r.error}\n`;
    }
    if (r.reason) {
      report += `   - ${r.reason}\n`;
    }
  }
  
  report += `\n## Recommendation\n\n`;
  if (criticalFailed === 0 && failed === 0) {
    report += `All tests passed. Ready for release.\n`;
  } else if (criticalFailed > 0) {
    report += `${criticalFailed} critical test(s) failed. **Do not release** until resolved.\n`;
  } else {
    report += `Non-critical failures only. Review before release.\n`;
  }
  
  return report;
}

function main() {
  console.log('=== Automated QA Report Generation ===\n');
  const results = TEST_SUITES.map(runTest);
  const report = generateReport(results);
  
  const outputPath = path.join(DOCS_DIR, 'qa-automated-report.md');
  fs.writeFileSync(outputPath, report, 'utf8');
  
  console.log(`\nReport written to: ${outputPath}`);
  console.log(report);
  
  const criticalFailed = results.filter(r => r.status === 'FAIL' && r.critical).length;
  if (criticalFailed > 0) {
    process.exitCode = 1;
  }
}

main();

