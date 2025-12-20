#!/usr/bin/env node
/**
 * Authentication Integration Example
 *
 * Demonstrates how to use the auth module in your application.
 */

'use strict';

const auth = require('../src/cli/auth');
const fetch = require('node-fetch');

async function main() {
  console.log('Authentication Integration Example\n');

  // 1. Check current authentication status
  console.log('1. Checking authentication status...');
  const status = auth.getAuthStatus();
  console.log(`   Authenticated: ${status.authenticated}`);
  if (status.authenticated) {
    console.log(`   Method: ${status.method}`);
  }
  console.log();

  // 2. Ensure authenticated (will throw if not)
  console.log('2. Ensuring authentication...');
  try {
    const { method, token } = await auth.ensureAuthenticated();
    console.log(`   ✓ Authenticated via ${method}`);
    console.log(`   Token: ${token.substring(0, 20)}...`);
  } catch (err) {
    console.log(`   ✗ Not authenticated: ${err.message}`);
    console.log('   Run "zero login" to authenticate');
    process.exit(1);
  }
  console.log();

  // 3. Get auth headers for API calls
  console.log('3. Getting auth headers...');
  const headers = await auth.getAuthHeaders();
  console.log(`   Authorization: ${headers.Authorization.substring(0, 30)}...`);
  console.log();

  // 4. Make authenticated API call
  console.log('4. Making authenticated API call...');
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✓ API call successful`);
      console.log(`   Found ${data.data?.length || 0} models`);
    } else {
      console.log(`   ✗ API call failed: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.log(`   ✗ API call error: ${err.message}`);
  }
  console.log();

  // 5. Demonstrate headless detection
  console.log('5. Environment detection...');
  console.log(`   Headless environment: ${auth.isHeadless()}`);
  console.log(`   Recommended method: ${auth.isHeadless() ? 'device' : 'oauth'}`);
  console.log();

  console.log('Example complete!');
}

// Run example
main().catch(err => {
  console.error('Example failed:', err);
  process.exit(1);
});
