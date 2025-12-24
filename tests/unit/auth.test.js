/**
 * Authentication Module Unit Tests
 *
 * Tests for OAuth PKCE flow, device flow, token storage, and API key management.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Import auth modules
const { generateCodeVerifier, generateCodeChallenge, generateState } = require('../../src/cli/auth/oauth');
const { getProvider, getProviderWithPort } = require('../../src/cli/auth/providers');
const tokenStore = require('../../src/cli/auth/tokenStore');
const apiKey = require('../../src/cli/auth/apiKey');
const auth = require('../../src/cli/auth');

// Test data
const TEST_ZERO_DIR = path.join(os.tmpdir(), '.zero-test-' + Date.now());
const TEST_CREDS_FILE = path.join(TEST_ZERO_DIR, 'oauth_creds.json');
const TEST_API_KEY_FILE = path.join(TEST_ZERO_DIR, 'api_key');

/**
 * Test suite runner
 */
async function runTests() {
  console.log('Running authentication module tests...\n');

  let passed = 0;
  let failed = 0;

  const tests = [
    testCodeVerifierGeneration,
    testCodeChallengeGeneration,
    testStateGeneration,
    testProviderConfiguration,
    testProviderWithPort,
    testTokenStorage,
    testTokenExpiry,
    testApiKeyStorage,
    testHeadlessDetection,
    testAuthStatus
  ];

  for (const test of tests) {
    try {
      await test();
      console.log(`✓ ${test.name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${test.name}`);
      console.error(`  ${err.message}`);
      if (process.env.DEBUG) {
        console.error(err.stack);
      }
      failed++;
    }
  }

  // Cleanup
  cleanup();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

/**
 * Cleanup test files
 */
function cleanup() {
  if (fs.existsSync(TEST_ZERO_DIR)) {
    fs.rmSync(TEST_ZERO_DIR, { recursive: true, force: true });
  }
}

/**
 * Test code verifier generation
 */
function testCodeVerifierGeneration() {
  const verifier = generateCodeVerifier();

  assert(typeof verifier === 'string', 'Verifier should be string');
  assert(verifier.length >= 43 && verifier.length <= 128, 'Verifier should be 43-128 chars');
  assert(/^[A-Za-z0-9_-]+$/.test(verifier), 'Verifier should be base64url');

  // Should be unique
  const verifier2 = generateCodeVerifier();
  assert(verifier !== verifier2, 'Verifiers should be unique');
}

/**
 * Test code challenge generation
 */
function testCodeChallengeGeneration() {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);

  assert(typeof challenge === 'string', 'Challenge should be string');
  assert(challenge.length === 43, 'Challenge should be 43 chars (base64url SHA-256)');
  assert(/^[A-Za-z0-9_-]+$/.test(challenge), 'Challenge should be base64url');

  // Same verifier should produce same challenge
  const challenge2 = generateCodeChallenge(verifier);
  assert(challenge === challenge2, 'Challenge should be deterministic');

  // Different verifiers should produce different challenges
  const verifier3 = generateCodeVerifier();
  const challenge3 = generateCodeChallenge(verifier3);
  assert(challenge !== challenge3, 'Different verifiers should produce different challenges');
}

/**
 * Test state generation
 */
function testStateGeneration() {
  const state = generateState();

  assert(typeof state === 'string', 'State should be string');
  assert(state.length === 32, 'State should be 32 hex chars');
  assert(/^[a-f0-9]+$/.test(state), 'State should be hex');

  // Should be unique
  const state2 = generateState();
  assert(state !== state2, 'States should be unique');
}

/**
 * Test provider configuration
 */
async function testProviderConfiguration() {
  // Set dummy Supabase URL for testing
  const originalUrl = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  
  try {
    const provider = getProvider('terminals');

    assert(provider.name === 'Terminals.tech', 'Provider name should match');
    assert(provider.authorizationEndpoint, 'Should have authorization endpoint');
    assert(provider.tokenEndpoint, 'Should have token endpoint');
    assert(provider.clientId, 'Should have client ID');
    assert(Array.isArray(provider.scopes), 'Scopes should be array');
    assert(provider.codeChallengeMethod === 'S256', 'Should use S256');

    // Unknown provider should throw
    try {
      getProvider('unknown');
      throw new Error('Should throw for unknown provider');
    } catch (err) {
      assert(err.message.includes('Unknown OAuth provider'), 'Should throw for unknown provider');
    }
  } finally {
    process.env.SUPABASE_URL = originalUrl;
  }
}

/**
 * Test provider with port substitution
 */
function testProviderWithPort() {
  // Set dummy Supabase URL for testing
  const originalUrl = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = 'https://test.supabase.co';

  try {
    const provider = getProviderWithPort('terminals', 8080);

    assert(provider.redirectUri === 'http://localhost:8080/oauth/callback', 'Port should be substituted');

    const provider2 = getProviderWithPort('terminals', 9000);
    assert(provider2.redirectUri === 'http://localhost:9000/oauth/callback', 'Different port should be substituted');
  } finally {
    process.env.SUPABASE_URL = originalUrl;
  }
}

/**
 * Test token storage
 */
function testTokenStorage() {
  // Create test directory
  if (!fs.existsSync(TEST_ZERO_DIR)) {
    fs.mkdirSync(TEST_ZERO_DIR, { recursive: true, mode: 0o700 });
  }

  const testCreds = {
    access_token: 'test_access_token',
    refresh_token: 'test_refresh_token',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    provider: 'terminals',
    token_type: 'Bearer',
    scope: 'openid profile api'
  };

  // Manually write test credentials
  fs.writeFileSync(TEST_CREDS_FILE, JSON.stringify(testCreds, null, 2), {
    mode: 0o600,
    encoding: 'utf8'
  });

  // Verify file exists
  assert(fs.existsSync(TEST_CREDS_FILE), 'Credentials file should exist');

  // Verify permissions
  const stat = fs.statSync(TEST_CREDS_FILE);
  const mode = stat.mode & 0o777;
  assert(mode === 0o600, `Credentials file should have 0o600 permissions, got ${mode.toString(8)}`);

  // Test structure validation
  const content = JSON.parse(fs.readFileSync(TEST_CREDS_FILE, 'utf8'));
  assert(content.access_token === testCreds.access_token, 'Access token should match');
  assert(content.refresh_token === testCreds.refresh_token, 'Refresh token should match');
  assert(content.provider === testCreds.provider, 'Provider should match');
}

/**
 * Test token expiry checking
 */
function testTokenExpiry() {
  // Expired token
  const expiredCreds = {
    access_token: 'expired',
    expires_at: new Date(Date.now() - 1000).toISOString()
  };
  assert(tokenStore.isTokenExpired(expiredCreds), 'Should detect expired token');

  // Valid token
  const validCreds = {
    access_token: 'valid',
    expires_at: new Date(Date.now() + 3600000).toISOString()
  };
  assert(!tokenStore.isTokenExpired(validCreds), 'Should not mark valid token as expired');

  // Token expiring within buffer (30s default)
  const expiringCreds = {
    access_token: 'expiring',
    expires_at: new Date(Date.now() + 20000).toISOString()
  };
  assert(tokenStore.isTokenExpired(expiringCreds, 30), 'Should detect token expiring within buffer');

  // No expiry time (assume valid)
  const noExpiryCreds = {
    access_token: 'no_expiry'
  };
  assert(!tokenStore.isTokenExpired(noExpiryCreds), 'Should assume valid when no expiry');
}

/**
 * Test API key storage
 */
function testApiKeyStorage() {
  const testKey = 'sk-or-v1-test-api-key';

  // Ensure directory exists
  if (!fs.existsSync(TEST_ZERO_DIR)) {
    fs.mkdirSync(TEST_ZERO_DIR, { recursive: true, mode: 0o700 });
  }

  // Manually write test API key
  fs.writeFileSync(TEST_API_KEY_FILE, testKey, {
    mode: 0o600,
    encoding: 'utf8'
  });

  // Verify file exists
  assert(fs.existsSync(TEST_API_KEY_FILE), 'API key file should exist');

  // Verify permissions
  const stat = fs.statSync(TEST_API_KEY_FILE);
  const mode = stat.mode & 0o777;
  assert(mode === 0o600, `API key file should have 0o600 permissions, got ${mode.toString(8)}`);

  // Verify content
  const content = fs.readFileSync(TEST_API_KEY_FILE, 'utf8').trim();
  assert(content === testKey, 'API key should match');

  // Test validation
  assert(apiKey.validateApiKey(testKey), 'Should validate correct key');
  assert(!apiKey.validateApiKey(''), 'Should not validate empty key');
  assert(!apiKey.validateApiKey(null), 'Should not validate null');
}

/**
 * Test headless environment detection
 */
function testHeadlessDetection() {
  const originalEnv = { ...process.env };

  // Desktop environment
  process.env.DISPLAY = ':0';
  delete process.env.SSH_CONNECTION;
  delete process.env.SSH_CLIENT;
  assert(!auth.isHeadless(), 'Should not be headless with DISPLAY');

  // SSH environment
  delete process.env.DISPLAY;
  process.env.SSH_CONNECTION = 'client-ip client-port server-ip server-port';
  assert(auth.isHeadless(), 'Should be headless with SSH_CONNECTION');

  // Restore environment
  process.env = originalEnv;
}

/**
 * Test auth status
 */
function testAuthStatus() {
  // Test with no authentication (should use real credentials if they exist)
  const status = auth.getAuthStatus();

  assert(typeof status === 'object', 'Should return status object');
  assert(typeof status.authenticated === 'boolean', 'Should have authenticated boolean');
  assert(status.method === null || typeof status.method === 'string', 'Should have method or null');

  // If authenticated, verify structure
  if (status.authenticated) {
    assert(['oauth', 'api_key'].includes(status.method), 'Method should be oauth or api_key');

    if (status.method === 'oauth') {
      assert(typeof status.provider === 'string', 'OAuth should have provider');
      assert(typeof status.expired === 'boolean', 'OAuth should have expired flag');
    } else if (status.method === 'api_key') {
      assert(typeof status.source === 'string', 'API key should have source');
    }
  }
}

// Run tests
runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
