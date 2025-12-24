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

/**
 * Get OAuth provider configurations
 * Evaluated dynamically to pick up environment variables
 */
function getProviders() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const TERMINALS_BASE_URL = process.env.TERMINALS_BASE_URL || 'https://terminals.tech';

  return {
    // terminals.tech standard OAuth 2.1 PKCE
    terminals: {
      name: 'Terminals.tech',
      type: 'supabase',
      baseUrl: TERMINALS_BASE_URL,
      authorizationEndpoint: SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/authorize` : null,
      tokenEndpoint: SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/token` : null,
      revokeEndpoint: SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/logout` : null,
      userinfoEndpoint: SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/user` : null,
      clientId: process.env.ZERO_OAUTH_CLIENT_ID || 'zero-cli',
      anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      scopes: ['openid', 'profile', 'email', 'models', 'training', 'chat'],
      codeChallengeMethod: 'S256',
      redirectUri: 'http://localhost:{PORT}/oauth/callback',
      oauthProviders: ['google', 'github']
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
      codeChallengeMethod: 'S256',
      deviceCodePollInterval: null,
      deviceCodeTimeout: null,
      redirectUri: 'http://localhost:{PORT}/callback',
      oauthProviders: ['google', 'github', 'azure', 'gitlab', 'bitbucket']
    }
  };
}

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
  const providers = getProviders();
  const provider = providers[providerName];
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
  return Object.entries(getProviders())
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
  getProviders,
  getProvider,
  getProviderWithPort,
  getDefaultProvider,
  supportsDeviceFlow,
  getAvailableProviders
};
