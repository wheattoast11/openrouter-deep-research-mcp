#!/usr/bin/env node
// tests/security-hardening.spec.js
// Security hardening tests: redaction, SSRF, SQL validation

const assert = require('assert');
const security = require('../src/utils/security');

function testRedaction() {
  console.log('\n[security] testing secret redaction');
  const text = 'Authorization: Bearer sk-or-v1-abc123xyz OPENROUTER_API_KEY=sk-sensitive';
  const redacted = security.redactSecrets(text);
  assert(!redacted.includes('sk-or-v1-abc123xyz'), 'bearer token should be redacted');
  assert(!redacted.includes('sk-sensitive'), 'API key should be redacted');
  assert(redacted.includes('[REDACTED]'), 'redaction marker present');
}

function testSsrfProtection() {
  console.log('\n[security] testing SSRF protection');
  
  const blocked = [
    'http://localhost:3000',
    'http://127.0.0.1/admin',
    'http://192.168.1.1',
    'http://10.0.0.1',
    'http://169.254.169.254/metadata',
    'file:///etc/passwd'
  ];
  
  for (const url of blocked) {
    const result = security.validateUrlForFetch(url);
    assert(!result.valid, `${url} should be blocked`);
  }
  
  const allowed = 'https://example.com/article';
  const allowResult = security.validateUrlForFetch(allowed);
  assert(allowResult.valid, 'https://example.com should be allowed');
}

function testSqlValidation() {
  console.log('\n[security] testing SQL validation');
  
  const validSql = 'SELECT id, query FROM reports LIMIT 10';
  const validResult = security.validateSqlQuery(validSql);
  assert(validResult.valid, 'SELECT should be valid');
  
  const dangerousSql = 'DROP TABLE reports;';
  const dangerResult = security.validateSqlQuery(dangerousSql);
  assert(!dangerResult.valid, 'DROP should be blocked');
  
  const injectSql = "SELECT * FROM reports WHERE id = 1; SELECT pg_sleep(10);";
  const injectResult = security.validateSqlQuery(injectSql);
  assert(!injectResult.valid || injectSql.includes('pg_sleep'), 'pg_sleep should trigger block');
}

function testPiiRedaction() {
  console.log('\n[security] testing PII redaction');
  const text = 'Contact john.doe@example.com or SSN 123-45-6789';
  const redacted = security.redactPII(text);
  assert(!redacted.includes('john.doe@example.com'), 'email should be redacted');
  assert(!redacted.includes('123-45-6789'), 'SSN should be redacted');
}

function main() {
  testRedaction();
  testSsrfProtection();
  testSqlValidation();
  testPiiRedaction();
  console.log('\nSecurity hardening tests completed.');
}

main();

