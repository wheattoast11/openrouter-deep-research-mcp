/**
 * OAuth Device Authorization Flow
 *
 * Alternative authentication method for headless/SSH environments where
 * browser-based OAuth is not possible.
 *
 * Flow:
 * 1. Request device code from provider
 * 2. Display verification URL and user code to user
 * 3. Poll token endpoint until user completes authorization
 * 4. Store received tokens
 */

'use strict';

const { getProvider } = require('./providers');
const { saveCredentials } = require('./tokenStore');

/**
 * Start device authorization flow
 */
async function startDeviceFlow(providerName = 'terminals', options = {}) {
  const { onProgress } = options;
  const fetch = require('node-fetch');
  const provider = getProvider(providerName);

  // Check if provider supports device flow
  if (!provider.deviceAuthEndpoint) {
    // Provide helpful alternatives
    const alternatives = [];
    if (provider.type === 'supabase') {
      alternatives.push(
        'Supabase Auth does not support device flow natively.',
        '',
        'Alternative authentication methods:',
        '  1. Use browser-based OAuth (requires display):',
        '     zero login --browser',
        '',
        '  2. Use API key authentication:',
        '     export OPENROUTER_API_KEY=sk-or-v1-...',
        '',
        '  3. Set API key via config:',
        '     zero config set api-key <your-key>',
        '',
        '  4. Generate a token from terminals.tech/dashboard',
        '     and export it as OPENROUTER_API_KEY'
      );
    } else {
      alternatives.push(
        `Provider ${providerName} does not support device flow.`,
        'Try: zero login --browser (if display available)',
        'Or: export OPENROUTER_API_KEY=<your-key>'
      );
    }
    throw new Error(alternatives.join('\n'));
  }

  onProgress?.('Requesting device code...');

  // Request device code
  const deviceCodeResponse = await requestDeviceCode(provider);

  // Display instructions to user
  displayDeviceInstructions(deviceCodeResponse, onProgress);

  // Poll for completion
  onProgress?.('Waiting for authorization...');
  const tokens = await pollForTokens(deviceCodeResponse, provider, onProgress);

  // Save credentials
  saveCredentials(tokens);

  return tokens;
}

/**
 * Request device code from provider
 */
async function requestDeviceCode(provider) {
  const fetch = require('node-fetch');

  const params = new URLSearchParams({
    client_id: provider.clientId,
    scope: provider.scopes.join(' ')
  });

  const response = await fetch(provider.deviceAuthEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'User-Agent': 'ZeroCLI/1.0 (OAuth Device Flow)'
    },
    body: params.toString()
  });

  // Get response as text first to check for HTML
  const responseText = await response.text();

  // Check if we got HTML instead of JSON (common with security checkpoints or 404s)
  if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
    throw new Error(
      `Device flow endpoint not available.\n` +
      `The OAuth server at ${provider.deviceAuthEndpoint} returned an HTML page.\n` +
      `This typically means:\n` +
      `  - The device flow endpoint is not deployed yet\n` +
      `  - A security checkpoint is blocking the request\n\n` +
      `Alternative authentication methods:\n` +
      `  1. Use browser-based OAuth: zero login --browser\n` +
      `  2. Use API key: export OPENROUTER_API_KEY=sk-or-v1-...\n` +
      `  3. Set API key via config: zero config set api-key <key>`
    );
  }

  if (!response.ok) {
    throw new Error(`Device code request failed (${response.status}): ${responseText}`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`Invalid JSON response from device endpoint: ${responseText.slice(0, 200)}...`);
  }

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    verificationUriComplete: data.verification_uri_complete || null,
    expiresIn: data.expires_in || 300,
    interval: data.interval || 5
  };
}

/**
 * Display device flow instructions to user
 */
function displayDeviceInstructions(deviceCodeResponse, onProgress) {
  const boxWidth = 60;
  const line = '═'.repeat(boxWidth);
  const blank = ' '.repeat(boxWidth);

  const messages = [
    '',
    `╔${line}╗`,
    `║${blank}║`,
    `║${center('Device Authorization Required', boxWidth)}║`,
    `║${blank}║`,
    `╟${line}╢`,
    `║${blank}║`,
    `║  1. Visit: ${deviceCodeResponse.verificationUri.padEnd(boxWidth - 13)}║`,
    `║${blank}║`,
    `║  2. Enter code: ${deviceCodeResponse.userCode.padEnd(boxWidth - 19)}║`,
    `║${blank}║`
  ];

  // Add complete URL if available (includes pre-filled code)
  if (deviceCodeResponse.verificationUriComplete) {
    messages.push(
      `║  Or visit directly:${blank.slice(21)}║`,
      `║  ${deviceCodeResponse.verificationUriComplete.padEnd(boxWidth - 3)}║`,
      `║${blank}║`
    );
  }

  messages.push(
    `║  Waiting for authorization...${blank.slice(32)}║`,
    `║${blank}║`,
    `╚${line}╝`,
    ''
  );

  messages.forEach(msg => onProgress?.(msg));
}

/**
 * Center text in a box
 */
function center(text, width) {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text + ' '.repeat(width - padding - text.length);
}

/**
 * Poll for token completion
 */
async function pollForTokens(deviceCodeResponse, provider, onProgress) {
  const fetch = require('node-fetch');
  const startTime = Date.now();
  const timeout = deviceCodeResponse.expiresIn * 1000;
  const interval = (deviceCodeResponse.interval || 5) * 1000;

  while (true) {
    // Check timeout
    if (Date.now() - startTime > timeout) {
      throw new Error('Device authorization timeout - user did not complete authorization');
    }

    // Wait before polling
    await sleep(interval);

    // Poll token endpoint
    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCodeResponse.deviceCode,
      client_id: provider.clientId
    });

    const response = await fetch(provider.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (response.ok) {
      // Success - got tokens
      const data = await response.json();

      const expiresAt = data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null;

      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || null,
        expires_at: expiresAt,
        provider: provider.name,
        token_type: data.token_type || 'Bearer',
        scope: data.scope || provider.scopes.join(' '),
        created_at: new Date().toISOString()
      };
    }

    // Check error response
    const errorData = await response.json().catch(() => ({}));

    if (errorData.error === 'authorization_pending') {
      // User hasn't completed authorization yet, continue polling
      continue;
    }

    if (errorData.error === 'slow_down') {
      // We're polling too fast, increase interval
      await sleep(interval);
      continue;
    }

    if (errorData.error === 'expired_token') {
      throw new Error('Device code expired - please try again');
    }

    if (errorData.error === 'access_denied') {
      throw new Error('User denied authorization');
    }

    // Unknown error
    throw new Error(`Device flow error: ${errorData.error || 'Unknown error'}`);
  }
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  startDeviceFlow,
  requestDeviceCode,
  pollForTokens
};
