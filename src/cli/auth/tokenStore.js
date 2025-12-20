/**
 * Secure Token Storage
 *
 * Manages OAuth credentials in ~/.zero/oauth_creds.json with proper
 * file permissions (0o600) to prevent unauthorized access.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Storage paths
const ZERO_DIR = path.join(os.homedir(), '.zero');
const CREDS_FILE = path.join(ZERO_DIR, 'oauth_creds.json');

/**
 * Ensure .zero directory exists with secure permissions
 */
function ensureZeroDir() {
  if (!fs.existsSync(ZERO_DIR)) {
    fs.mkdirSync(ZERO_DIR, { mode: 0o700, recursive: true });
  }
}

/**
 * Load credentials from disk
 */
function loadCredentials() {
  try {
    ensureZeroDir();

    if (!fs.existsSync(CREDS_FILE)) {
      return null;
    }

    const content = fs.readFileSync(CREDS_FILE, 'utf8');
    const creds = JSON.parse(content);

    // Validate structure
    if (!creds.access_token || !creds.provider) {
      return null;
    }

    return creds;
  } catch (err) {
    // Corrupt or invalid credentials file
    return null;
  }
}

/**
 * Save credentials to disk with secure permissions
 */
function saveCredentials(credentials) {
  ensureZeroDir();

  const data = {
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token || null,
    expires_at: credentials.expires_at || null,
    provider: credentials.provider || 'terminals',
    token_type: credentials.token_type || 'Bearer',
    scope: credentials.scope || null,
    created_at: credentials.created_at || new Date().toISOString()
  };

  // Write with secure permissions
  fs.writeFileSync(CREDS_FILE, JSON.stringify(data, null, 2), {
    mode: 0o600,
    encoding: 'utf8'
  });

  // Verify permissions were set correctly
  const stat = fs.statSync(CREDS_FILE);
  const mode = stat.mode & 0o777;
  if (mode !== 0o600) {
    // On some systems, mode may not be respected during write
    fs.chmodSync(CREDS_FILE, 0o600);
  }
}

/**
 * Clear stored credentials
 */
function clearCredentials() {
  if (fs.existsSync(CREDS_FILE)) {
    fs.unlinkSync(CREDS_FILE);
    return true;
  }
  return false;
}

/**
 * Check if token is expired (with buffer)
 */
function isTokenExpired(credentials, bufferSeconds = 30) {
  if (!credentials || !credentials.expires_at) {
    return false; // Can't determine, assume valid
  }

  const expiresAt = new Date(credentials.expires_at).getTime();
  const now = Date.now();
  const buffer = bufferSeconds * 1000;

  return now >= (expiresAt - buffer);
}

/**
 * Get access token with automatic refresh
 */
async function getAccessToken() {
  const creds = loadCredentials();

  if (!creds) {
    return null;
  }

  // Check if expired and refresh is available
  if (isTokenExpired(creds) && creds.refresh_token) {
    const { refreshToken } = require('./oauth');
    try {
      const newCreds = await refreshToken(creds.refresh_token, creds.provider);
      return newCreds.access_token;
    } catch (err) {
      // Refresh failed, credentials invalid
      clearCredentials();
      return null;
    }
  }

  return creds.access_token;
}

/**
 * Get credentials file path (for debugging)
 */
function getCredsPath() {
  return CREDS_FILE;
}

module.exports = {
  loadCredentials,
  saveCredentials,
  clearCredentials,
  isTokenExpired,
  getAccessToken,
  getCredsPath,
  ZERO_DIR,
  CREDS_FILE
};
