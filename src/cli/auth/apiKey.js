/**
 * API Key Management
 *
 * Fallback authentication method using direct API keys.
 * Supports environment variables and secure file storage.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { ZERO_DIR } = require('./tokenStore');

const API_KEY_FILE = path.join(ZERO_DIR, 'api_key');

/**
 * Get API key from environment or file
 */
function getApiKey() {
  // Try environment first
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }

  // Try file storage
  return loadApiKeyFromFile();
}

/**
 * Load API key from secure file
 */
function loadApiKeyFromFile() {
  try {
    if (!fs.existsSync(API_KEY_FILE)) {
      return null;
    }

    const key = fs.readFileSync(API_KEY_FILE, 'utf8').trim();
    return key || null;
  } catch (err) {
    return null;
  }
}

/**
 * Save API key to secure file
 */
function saveApiKey(apiKey) {
  if (!fs.existsSync(ZERO_DIR)) {
    fs.mkdirSync(ZERO_DIR, { mode: 0o700, recursive: true });
  }

  fs.writeFileSync(API_KEY_FILE, apiKey.trim(), {
    mode: 0o600,
    encoding: 'utf8'
  });

  // Verify permissions
  const stat = fs.statSync(API_KEY_FILE);
  const mode = stat.mode & 0o777;
  if (mode !== 0o600) {
    fs.chmodSync(API_KEY_FILE, 0o600);
  }
}

/**
 * Clear stored API key
 */
function clearApiKey() {
  if (fs.existsSync(API_KEY_FILE)) {
    fs.unlinkSync(API_KEY_FILE);
    return true;
  }
  return false;
}

/**
 * Validate API key format (basic check)
 */
function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // OpenRouter API keys typically start with 'sk-or-'
  // But accept any non-empty string for flexibility
  return apiKey.trim().length > 0;
}

module.exports = {
  getApiKey,
  loadApiKeyFromFile,
  saveApiKey,
  clearApiKey,
  validateApiKey,
  API_KEY_FILE
};
