/**
 * CLI Authentication Flow for terminals.tech
 *
 * Implements secure CLI authentication using ECDH key exchange:
 * 1. Generate ECDH keypair (prime256v1)
 * 2. Generate UUID session ID
 * 3. Call /api/auth/cli/init with session_id and public_key
 * 4. Open browser to auth URL
 * 5. Poll /api/auth/cli/status/<session_id> for completion
 * 6. Decrypt token using ECDH shared secret
 */

'use strict';

const crypto = require('crypto');
const { exec } = require('child_process');
const { getProvider } = require('./providers');
const { saveCredentials } = require('./tokenStore');

/**
 * Generate ECDH keypair for secure token exchange
 * @returns {{ privateKey: Buffer, publicKeyPEM: string }}
 */
function generateKeyPair() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();

  // Get raw public key (65 bytes: 0x04 + 32 bytes X + 32 bytes Y)
  const publicKey = ecdh.getPublicKey();

  // Convert to SPKI/PEM format for transmission
  // SPKI header for prime256v1 public key
  const spkiHeader = Buffer.from([
    0x30, 0x59, // SEQUENCE, 89 bytes
    0x30, 0x13, // SEQUENCE, 19 bytes (algorithm identifier)
    0x06, 0x07, // OID, 7 bytes
    0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // 1.2.840.10045.2.1 (ecPublicKey)
    0x06, 0x08, // OID, 8 bytes
    0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // 1.2.840.10045.3.1.7 (prime256v1)
    0x03, 0x42, // BIT STRING, 66 bytes
    0x00, // unused bits
  ]);

  const spkiPublicKey = Buffer.concat([spkiHeader, publicKey]);
  const publicKeyBase64 = spkiPublicKey.toString('base64');

  // Format as PEM
  const publicKeyPEM = [
    '-----BEGIN PUBLIC KEY-----',
    publicKeyBase64.match(/.{1,64}/g).join('\n'),
    '-----END PUBLIC KEY-----'
  ].join('\n');

  return {
    ecdh, // Keep ECDH object for computing shared secret later
    privateKey: ecdh.getPrivateKey(),
    publicKeyPEM
  };
}

/**
 * Generate UUID v4 for session ID
 * @returns {string}
 */
function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * Open URL in default browser
 * @param {string} url
 */
function openBrowser(url) {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open'
    : platform === 'win32' ? 'start'
    : 'xdg-open';

  exec(`${command} "${url}"`, (err) => {
    if (err) {
      // Silently fail - user can copy URL manually
    }
  });
}

/**
 * Decrypt token received from server using ECDH shared secret
 * @param {string} encryptedToken - Base64 encoded IV + ciphertext + authTag
 * @param {string} serverPublicKeyBase64 - Server's ECDH public key
 * @param {crypto.ECDH} ecdh - Client's ECDH object
 * @returns {string} Decrypted API token
 */
function decryptToken(encryptedToken, serverPublicKeyBase64, ecdh) {
  // Decode server's public key
  const serverPublicKey = Buffer.from(serverPublicKeyBase64, 'base64');

  // Compute shared secret
  const sharedSecret = ecdh.computeSecret(serverPublicKey);

  // Derive encryption key using same HKDF-like approach as server
  const salt = Buffer.from('s4-cli-auth', 'utf8');
  const info = Buffer.from('handshake data', 'utf8');
  const derivedKey = crypto.createHmac('sha256', salt)
    .update(sharedSecret)
    .update(info)
    .digest();

  // Decode encrypted data (IV + ciphertext + authTag)
  const encryptedData = Buffer.from(encryptedToken, 'base64');

  // Extract components
  const iv = encryptedData.slice(0, 12); // 96-bit IV
  const authTag = encryptedData.slice(-16); // 128-bit auth tag
  const ciphertext = encryptedData.slice(12, -16);

  // Decrypt
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

/**
 * Start CLI authentication flow
 * @param {string} providerName - Provider name (default: 'terminals')
 * @param {Object} options - Options
 * @param {Function} [options.onProgress] - Progress callback
 * @returns {Promise<Object>} Credentials
 */
async function startCliAuth(providerName = 'terminals', options = {}) {
  const { onProgress } = options;
  const fetch = require('node-fetch');
  const provider = getProvider(providerName);

  if (provider.type !== 'cli-auth') {
    throw new Error(`Provider ${providerName} does not support CLI auth flow`);
  }

  onProgress?.('Generating secure keypair...');

  // Step 1: Generate ECDH keypair and session ID
  const { ecdh, publicKeyPEM } = generateKeyPair();
  const sessionId = generateSessionId();

  onProgress?.('Initializing authentication session...');

  // Step 2: Initialize session with server
  const initResponse = await fetch(provider.cliAuthEndpoints.init, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'ZeroCLI/1.0'
    },
    body: JSON.stringify({
      session_id: sessionId,
      public_key: publicKeyPEM,
      device_info: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      }
    })
  });

  if (!initResponse.ok) {
    const error = await initResponse.text();
    throw new Error(`Failed to initialize auth session: ${error}`);
  }

  const initData = await initResponse.json();
  const authUrl = initData.auth_url;

  // Step 3: Display instructions and open browser
  const boxWidth = 60;
  const line = '═'.repeat(boxWidth);

  onProgress?.('');
  onProgress?.(`╔${line}╗`);
  onProgress?.(`║${' '.repeat(boxWidth)}║`);
  onProgress?.(`║${center('CLI Authentication', boxWidth)}║`);
  onProgress?.(`║${' '.repeat(boxWidth)}║`);
  onProgress?.(`╟${'─'.repeat(boxWidth)}╢`);
  onProgress?.(`║${' '.repeat(boxWidth)}║`);
  onProgress?.(`║  Opening browser for authentication...${' '.repeat(boxWidth - 41)}║`);
  onProgress?.(`║${' '.repeat(boxWidth)}║`);
  onProgress?.(`║  If browser doesn't open, visit:${' '.repeat(boxWidth - 35)}║`);
  onProgress?.(`║  ${authUrl.substring(0, boxWidth - 4).padEnd(boxWidth - 3)}║`);
  onProgress?.(`║${' '.repeat(boxWidth)}║`);
  onProgress?.(`║  Waiting for you to sign in...${' '.repeat(boxWidth - 33)}║`);
  onProgress?.(`║${' '.repeat(boxWidth)}║`);
  onProgress?.(`╚${line}╝`);
  onProgress?.('');

  // Open browser
  openBrowser(authUrl);

  // Step 4: Poll for completion
  onProgress?.('Waiting for authentication...');

  const credentials = await pollForCompletion(
    sessionId,
    ecdh,
    provider,
    onProgress
  );

  // Step 5: Save credentials
  saveCredentials(credentials);

  onProgress?.('Authentication successful!');

  return credentials;
}

/**
 * Poll for session completion
 * @param {string} sessionId
 * @param {crypto.ECDH} ecdh
 * @param {Object} provider
 * @param {Function} onProgress
 * @returns {Promise<Object>}
 */
async function pollForCompletion(sessionId, ecdh, provider, onProgress) {
  const fetch = require('node-fetch');
  const statusUrl = `${provider.cliAuthEndpoints.status}/${sessionId}`;
  const maxAttempts = provider.maxPollAttempts || 300;
  const pollInterval = provider.pollInterval || 2000;

  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    try {
      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'ZeroCLI/1.0'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Session not found or expired');
        }
        // Continue polling on other errors
        await sleep(pollInterval);
        continue;
      }

      const data = await response.json();

      switch (data.status) {
        case 'completed':
          // Decrypt the token
          if (!data.encrypted_token || !data.server_public_key) {
            throw new Error('Invalid completion response - missing token data');
          }

          const token = decryptToken(
            data.encrypted_token,
            data.server_public_key,
            ecdh
          );

          return {
            access_token: token,
            refresh_token: null, // CLI tokens don't use refresh
            expires_at: data.expires_at || null,
            provider: provider.name,
            token_type: 'Bearer',
            scope: 'models training chat',
            created_at: new Date().toISOString(),
            session_id: sessionId
          };

        case 'failed':
          throw new Error(data.error || 'Authentication failed');

        case 'pending':
        default:
          // Continue polling
          await sleep(pollInterval);
          break;
      }
    } catch (err) {
      if (err.message.includes('Session not found') ||
          err.message.includes('Authentication failed')) {
        throw err;
      }
      // Network errors - continue polling
      await sleep(pollInterval);
    }
  }

  throw new Error('Authentication timeout - please try again');
}

/**
 * Center text in a box
 * @param {string} text
 * @param {number} width
 * @returns {string}
 */
function center(text, width) {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text + ' '.repeat(width - padding - text.length);
}

/**
 * Sleep helper
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  startCliAuth,
  generateKeyPair,
  generateSessionId,
  decryptToken
};
