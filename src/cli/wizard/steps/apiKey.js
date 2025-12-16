/**
 * Step 1: API Key Configuration
 *
 * - Prompts for OpenRouter API key
 * - Validates the key format
 * - Optionally tests the key with a ping
 *
 * @module cli/wizard/steps/apiKey
 */

'use strict';

const https = require('https');

/**
 * Validate API key format
 */
function validateKeyFormat(key) {
  if (!key || key.length < 10) {
    return { valid: false, reason: 'Key is too short' };
  }
  // OpenRouter keys typically start with 'sk-or-'
  if (key.startsWith('sk-or-')) {
    return { valid: true, type: 'openrouter' };
  }
  // Also accept generic keys
  if (key.startsWith('sk-')) {
    return { valid: true, type: 'generic' };
  }
  return { valid: true, type: 'unknown' };
}

/**
 * Test API key with OpenRouter
 */
async function testApiKey(key) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/models',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve({ success: true, message: 'API key verified successfully' });
      } else if (res.statusCode === 401) {
        resolve({ success: false, message: 'Invalid API key' });
      } else {
        resolve({ success: false, message: `Unexpected response: ${res.statusCode}` });
      }
    });

    req.on('error', (e) => {
      resolve({ success: false, message: `Connection error: ${e.message}` });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, message: 'Request timed out' });
    });

    req.end();
  });
}

/**
 * Run the API key configuration step
 */
async function run(rl, ask, askYesNo) {
  console.log('');
  console.log('  Zero uses OpenRouter to access multiple AI models.');
  console.log('  Get your API key at: https://openrouter.ai/keys');
  console.log('');

  // Check environment variable first
  const envKey = process.env.OPENROUTER_API_KEY;
  if (envKey) {
    console.log('  Found existing OPENROUTER_API_KEY in environment.');
    const useExisting = await askYesNo(rl, 'Use existing key?', true);
    if (useExisting) {
      return envKey;
    }
  }

  // Prompt for key
  let apiKey = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (!apiKey && attempts < maxAttempts) {
    attempts++;
    const input = await ask(rl, 'Enter your OpenRouter API key');

    if (!input) {
      const skipSetup = await askYesNo(rl, 'Skip API key setup? (You can add it later)', false);
      if (skipSetup) {
        console.log('\n  You can set OPENROUTER_API_KEY in your .env file later.');
        return null;
      }
      continue;
    }

    // Validate format
    const validation = validateKeyFormat(input);
    if (!validation.valid) {
      console.log(`\n  \x1b[33mWarning: ${validation.reason}\x1b[0m`);
      const proceed = await askYesNo(rl, 'Use this key anyway?', false);
      if (!proceed) continue;
    }

    // Offer to test the key
    const shouldTest = await askYesNo(rl, 'Test API key now?', true);
    if (shouldTest) {
      console.log('  Testing...');
      const result = await testApiKey(input);
      if (result.success) {
        console.log(`  \x1b[32m${result.message}\x1b[0m`);
        apiKey = input;
      } else {
        console.log(`  \x1b[31m${result.message}\x1b[0m`);
        const useAnyway = await askYesNo(rl, 'Use this key anyway?', false);
        if (useAnyway) apiKey = input;
      }
    } else {
      apiKey = input;
    }
  }

  if (!apiKey) {
    console.log('\n  No valid API key provided after 3 attempts.');
    console.log('  You can set OPENROUTER_API_KEY in your .env file later.');
  }

  return apiKey;
}

module.exports = {
  run,
  validateKeyFormat,
  testApiKey,
};
