/**
 * OAuth Provider Configurations
 *
 * Defines OAuth endpoints and settings for supported providers.
 * Supports:
 * - terminals (primary) - terminals.tech CLI auth with ECDH key exchange
 * - supabase (direct) - Direct Supabase Auth for self-hosted deployments
 *
 * Environment variables:
 * - ZERO_OAUTH_PROVIDER: 'terminals' (default) or 'supabase'
 * - ZERO_OAUTH_CLIENT_ID: OAuth client ID
 * - SUPABASE_URL: Supabase project URL
 * - TERMINALS_BASE_URL: Base URL for terminals.tech (default: https://terminals.tech)
 */

'use strict';

// Get Supabase URL from environment
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

// Terminals.tech base URL
const TERMINALS_BASE_URL = process.env.TERMINALS_BASE_URL || 'https://terminals.tech';

const PROVIDERS = {
  // terminals.tech CLI auth with ECDH key exchange
  // Uses secure device flow: init -> browser auth -> poll status -> decrypt token
  terminals: {
    name: 'Terminals.tech',
    type: 'cli-auth', // Custom CLI auth flow with ECDH
    baseUrl: TERMINALS_BASE_URL,

    // CLI Auth endpoints (see terminals-landing-new/pages/api/auth/cli/)
    cliAuthEndpoints: {
      init: `${TERMINALS_BASE_URL}/api/auth/cli/init`,
      status: `${TERMINALS_BASE_URL}/api/auth/cli/status`, // + /<session_id>
      authPage: `${TERMINALS_BASE_URL}/auth/cli`, // + ?session=<uuid>
    },

    // Fallback OAuth settings (for browser-based flow)
    authorizationEndpoint: `${TERMINALS_BASE_URL}/auth/login`,
    tokenEndpoint: null, // Handled by CLI auth flow
    deviceAuthEndpoint: null, // Uses custom CLI auth instead

    // Settings
    sessionTimeout: 10 * 60 * 1000, // 10 minutes
    pollInterval: 2000, // 2 seconds
    maxPollAttempts: 300, // 10 minutes / 2 seconds
  },

  // Direct Supabase Auth (for self-hosted/custom deployments)
  supabase: {
    name: 'Supabase',
    type: 'supabase',
    authorizationEndpoint: SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/authorize` : null,
    tokenEndpoint: SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/token` : null,
    revokeEndpoint: SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/logout` : null,
    userinfoEndpoint: SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/user` : null,
    clientId: process.env.ZERO_OAUTH_CLIENT_ID || 'zero-cli',
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    scopes: ['openid', 'profile', 'email'],

    // PKCE settings
    codeChallengeMethod: 'S256',

    // Timeouts (Supabase doesn't support device flow natively)
    deviceCodePollInterval: null,
    deviceCodeTimeout: null,

    // Redirect URI for localhost callback
    redirectUri: 'http://localhost:{PORT}/callback',

    // Supabase-specific: supported OAuth providers
    oauthProviders: ['google', 'github', 'azure', 'gitlab', 'bitbucket']
  }
};

/**
 * Get default provider name from environment
 */
function getDefaultProvider() {
  return process.env.ZERO_OAUTH_PROVIDER || 'terminals';
}

/**
 * Get provider configuration
 * @param {string} [name] - Provider name (defaults to ZERO_OAUTH_PROVIDER or 'terminals')
 */
function getProvider(name) {
  const providerName = name || getDefaultProvider();
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${providerName}`);
  }

  // Validate provider is properly configured
  if (providerName === 'supabase' && !provider.authorizationEndpoint) {
    throw new Error('Supabase provider requires SUPABASE_URL environment variable');
  }

  return provider;
}

/**
 * Get provider with dynamic port for redirect URI
 */
function getProviderWithPort(name, port) {
  const provider = getProvider(name);
  return {
    ...provider,
    redirectUri: provider.redirectUri.replace('{PORT}', port)
  };
}

/**
 * Check if a provider supports device code flow
 */
function supportsDeviceFlow(name) {
  const provider = getProvider(name);
  return !!(provider.deviceAuthEndpoint);
}

/**
 * Get list of available providers
 */
function getAvailableProviders() {
  return Object.entries(PROVIDERS)
    .filter(([name, config]) => {
      if (name === 'supabase') {
        return !!config.authorizationEndpoint;
      }
      return true;
    })
    .map(([name, config]) => ({
      name,
      displayName: config.name,
      type: config.type,
      supportsDeviceFlow: !!config.deviceAuthEndpoint
    }));
}

module.exports = {
  PROVIDERS,
  getProvider,
  getProviderWithPort,
  getDefaultProvider,
  supportsDeviceFlow,
  getAvailableProviders
};
