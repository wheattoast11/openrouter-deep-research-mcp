/**
 * Authentication Module
 *
 * Main entry point for all authentication methods:
 * - OAuth PKCE flow (browser-based)
 * - Device authorization flow (headless/SSH)
 * - API key fallback
 *
 * Automatically selects best method and handles credential lifecycle.
 */

'use strict';

const { startOAuthFlow, refreshToken, revokeToken } = require('./oauth');
const { startDeviceFlow } = require('./deviceFlow');
const { getApiKey, saveApiKey, clearApiKey } = require('./apiKey');
const {
  loadCredentials,
  saveCredentials,
  clearCredentials,
  getAccessToken,
  isTokenExpired,
  getCredsPath
} = require('./tokenStore');
const { getProvider } = require('./providers');

/**
 * Authentication strategy priority
 */
const AUTH_STRATEGIES = {
  OAUTH: 'oauth',
  DEVICE: 'device',
  API_KEY: 'api_key'
};

/**
 * Detect if running in headless environment (SSH, no display)
 */
function isHeadless() {
  // Check if SSH session (most reliable indicator)
  if (process.env.SSH_CONNECTION || process.env.SSH_CLIENT || process.env.SSH_TTY) {
    return true;
  }

  // Check for CI/CD environments
  if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI) {
    return true;
  }

  // Check for explicit headless flag
  if (process.env.ZERO_HEADLESS === 'true' || process.env.ZERO_HEADLESS === '1') {
    return true;
  }

  // macOS: Check if we can access the window server
  if (process.platform === 'darwin') {
    // If DISPLAY is explicitly set, honor it (mostly for tests)
    if (process.env.DISPLAY) {
      return false;
    }

    // On macOS, DISPLAY is not usually used (no X11 by default)
    // Check if we're in a login session with window server access
    try {
      const { execSync } = require('child_process');
      // This returns 0 if we have window server access
      execSync('osascript -e "tell application \\"System Events\\" to return 1"', {
        stdio: 'pipe',
        timeout: 2000
      });
      return false; // We have GUI access
    } catch {
      return true; // No GUI access (SSH, cron, etc.)
    }
  }

  // Linux/other Unix: Check for DISPLAY (X11) or WAYLAND_DISPLAY
  if (process.platform !== 'win32') {
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      return true;
    }
  }

  return false;
}

/**
 * Get current authentication status
 */
function getAuthStatus() {
  // Check OAuth credentials
  const oauthCreds = loadCredentials();
  if (oauthCreds) {
    const expired = isTokenExpired(oauthCreds);
    return {
      method: 'oauth',
      authenticated: !expired || !!oauthCreds.refresh_token,
      provider: oauthCreds.provider,
      expired,
      hasRefreshToken: !!oauthCreds.refresh_token,
      expiresAt: oauthCreds.expires_at,
      credsPath: getCredsPath()
    };
  }

  // Check API key
  const apiKey = getApiKey();
  if (apiKey) {
    return {
      method: 'api_key',
      authenticated: true,
      source: process.env.OPENROUTER_API_KEY ? 'environment' : 'file'
    };
  }

  return {
    method: null,
    authenticated: false
  };
}

/**
 * Perform login with appropriate method
 */
async function login(options = {}) {
  const {
    strategy = null, // AUTO, OAUTH, DEVICE, API_KEY
    provider = 'terminals',
    onProgress = null,
    forceBrowser = false, // --browser flag to force OAuth even in headless
    oauthProvider = 'google' // google, github for Supabase OAuth
  } = options;

  // Get provider config to check capabilities
  const providerConfig = getProvider(provider);

  // Auto-detect strategy if not specified
  let selectedStrategy = strategy;
  if (!selectedStrategy) {
    // Check if we should use OAuth or device flow
    const headless = isHeadless();

    if (forceBrowser || !headless) {
      // Use OAuth flow
      selectedStrategy = AUTH_STRATEGIES.OAUTH;
    } else if (providerConfig.deviceAuthEndpoint) {
      // Use device flow if available
      selectedStrategy = AUTH_STRATEGIES.DEVICE;
    } else {
      // Headless but no device flow support - inform user
      onProgress?.('Running in headless mode but provider does not support device flow.');
      onProgress?.('');
      if (providerConfig.type === 'supabase') {
        onProgress?.('Options:');
        onProgress?.('  1. Set OPENROUTER_API_KEY environment variable');
        onProgress?.('  2. Run with display: zero login --browser');
        onProgress?.('  3. Get API key from terminals.tech/dashboard');
      }
      return {
        success: false,
        method: 'none',
        error: 'Headless environment requires API key authentication'
      };
    }
  }

  switch (selectedStrategy.toLowerCase()) {
    case AUTH_STRATEGIES.OAUTH:
      return loginWithOAuth(provider, onProgress, { oauthProvider });

    case AUTH_STRATEGIES.DEVICE:
      return loginWithDevice(provider, onProgress);

    case AUTH_STRATEGIES.API_KEY:
      return loginWithApiKey(onProgress);

    default:
      throw new Error(`Unknown authentication strategy: ${selectedStrategy}`);
  }
}

/**
 * Login with OAuth PKCE flow or CLI auth flow based on provider type
 */
async function loginWithOAuth(providerName, onProgress, options = {}) {
  try {
    const providerConfig = getProvider(providerName);

    // Use standard OAuth PKCE flow
    const credentials = await startOAuthFlow(providerName, {
      onProgress,
      oauthProvider: options.oauthProvider || 'google'
    });
    onProgress?.('Authentication successful');
    return {
      success: true,
      method: 'oauth',
      credentials
    };
  } catch (err) {
    return {
      success: false,
      method: 'oauth',
      error: err.message
    };
  }
}

/**
 * Login with device authorization flow
 */
async function loginWithDevice(provider, onProgress) {
  try {
    const credentials = await startDeviceFlow(provider, { onProgress });
    onProgress?.('Authentication successful');
    return {
      success: true,
      method: 'device',
      credentials
    };
  } catch (err) {
    return {
      success: false,
      method: 'device',
      error: err.message
    };
  }
}

/**
 * Login with API key (interactive prompt)
 */
async function loginWithApiKey(onProgress) {
  // This would need integration with micro-prompt for interactive input
  // For now, return instructions
  onProgress?.('To use API key authentication:');
  onProgress?.('1. Set OPENROUTER_API_KEY environment variable');
  onProgress?.('2. Or use: zero config set api-key <your-key>');

  return {
    success: false,
    method: 'api_key',
    error: 'API key not configured'
  };
}

/**
 * Logout and clear credentials
 */
async function logout(options = {}) {
  const { revokeTokens = true } = options;

  // Get current credentials
  const creds = loadCredentials();

  // Revoke tokens if requested and available
  if (revokeTokens && creds && creds.access_token) {
    try {
      await revokeToken(creds.access_token, creds.provider);
    } catch (err) {
      // Ignore revocation errors
    }
  }

  // Clear stored credentials
  const clearedOAuth = clearCredentials();
  const clearedApiKey = clearApiKey();

  return {
    success: clearedOAuth || clearedApiKey,
    cleared: {
      oauth: clearedOAuth,
      apiKey: clearedApiKey
    }
  };
}

/**
 * Ensure authenticated - main function for API calls
 *
 * Returns valid access token or API key, refreshing if needed.
 * Throws if not authenticated.
 */
async function ensureAuthenticated() {
  // Try OAuth first
  const accessToken = await getAccessToken();
  if (accessToken) {
    return {
      method: 'oauth',
      token: accessToken
    };
  }

  // Fall back to API key
  const apiKey = getApiKey();
  if (apiKey) {
    return {
      method: 'api_key',
      token: apiKey
    };
  }

  throw new Error('Not authenticated. Run "zero login" to authenticate.');
}

/**
 * Get auth headers for API requests
 */
async function getAuthHeaders() {
  const auth = await ensureAuthenticated();

  return {
    'Authorization': `Bearer ${auth.token}`
  };
}

module.exports = {
  // Main functions
  login,
  logout,
  getAuthStatus,
  ensureAuthenticated,
  getAuthHeaders,

  // Strategy detection
  isHeadless,
  AUTH_STRATEGIES,

  // Direct access to sub-modules (for advanced usage)
  oauth: require('./oauth'),
  deviceFlow: require('./deviceFlow'),
  cliAuth: require('./cliAuth'),
  apiKey: require('./apiKey'),
  tokenStore: require('./tokenStore'),
  providers: require('./providers')
};
