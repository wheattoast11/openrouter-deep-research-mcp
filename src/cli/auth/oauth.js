/**
 * OAuth PKCE Flow Implementation
 *
 * Implements OAuth 2.0 Authorization Code flow with PKCE (Proof Key for Code Exchange)
 * for secure authentication without client secrets.
 *
 * Flow:
 * 1. Generate code verifier and S256 challenge
 * 2. Start localhost HTTP server on dynamic port
 * 3. Open browser to provider's authorization URL
 * 4. Capture authorization code from callback
 * 5. Exchange code for access/refresh tokens
 * 6. Store tokens securely
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const { exec } = require('child_process');
const { getProviderWithPort } = require('./providers');
const { saveCredentials } = require('./tokenStore');

/**
 * Generate random code verifier for PKCE (43-128 chars)
 */
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate S256 code challenge from verifier
 */
function generateCodeChallenge(verifier) {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

/**
 * Generate random state for CSRF protection
 */
function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Find an available port for localhost callback server
 */
function findAvailablePort(startPort = 8080) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();

    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port in use, try next
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Open URL in default browser
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
 * Start OAuth flow with PKCE
 */
async function startOAuthFlow(providerName = 'terminals', options = {}) {
  const { onProgress, oauthProvider = 'google' } = options;

  // Find available port for callback
  const port = await findAvailablePort(8080);
  const provider = getProviderWithPort(providerName, port);

  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  onProgress?.('Generating PKCE challenge...');

  // Build authorization URL
  const authUrl = new URL(provider.authorizationEndpoint);

  // Supabase OAuth requires provider parameter and uses redirect_to instead of redirect_uri
  if (provider.type === 'supabase') {
    authUrl.searchParams.set('provider', oauthProvider); // google, github, etc.
    authUrl.searchParams.set('redirect_to', provider.redirectUri);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', provider.codeChallengeMethod);
    // Supabase uses state for CSRF but doesn't require client_id/scope in authz URL
    // These are configured in Supabase dashboard
  } else {
    // Standard OAuth2 parameters
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', provider.clientId);
    authUrl.searchParams.set('redirect_uri', provider.redirectUri);
    authUrl.searchParams.set('scope', provider.scopes.join(' '));
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', provider.codeChallengeMethod);
  }

  // Always include state for CSRF protection
  authUrl.searchParams.set('state', state);

  // Create promise to track authorization
  const authPromise = new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        // Get code from query params (PKCE flow)
        let code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        // Send response to browser
        if (error) {
          const errorMsg = errorDescription || error;
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 2rem; text-align: center;">
                <h1>❌ Authentication Failed</h1>
                <p>Error: ${errorMsg}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(`OAuth error: ${errorMsg}`));
          return;
        }

        // Always validate state for CSRF protection
        if (!returnedState || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 2rem; text-align: center;">
                <h1>❌ Security Error</h1>
                <p>Invalid or missing state parameter.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error('State validation failed - possible CSRF attack'));
          return;
        }

        // If no code in query params, send a page that extracts from hash fragment
        // (Some OAuth flows return tokens in hash for implicit grant)
        if (!code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 2rem; text-align: center;">
                <h1>Processing Authentication...</h1>
                <p id="status">Checking for authorization code...</p>
                <script>
                  // Check if code is in hash fragment
                  const hash = window.location.hash.substring(1);
                  const params = new URLSearchParams(hash);
                  const code = params.get('code') || params.get('access_token');

                  if (code) {
                    // Redirect to callback with code in query string
                    window.location.href = '/callback?code=' + encodeURIComponent(code);
                  } else {
                    document.getElementById('status').innerHTML =
                      '❌ Authorization code not received.<br>You can close this window.';
                  }
                </script>
              </body>
            </html>
          `);
          return;
        }

        // Success response
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 2rem; text-align: center;">
              <h1>✅ Authentication Successful</h1>
              <p>You can close this window and return to the CLI.</p>
            </body>
          </html>
        `);

        server.close();

        onProgress?.('Exchanging code for tokens...');

        // Exchange code for tokens
        try {
          const tokens = await exchangeCodeForTokens(
            code,
            codeVerifier,
            provider
          );
          resolve(tokens);
        } catch (err) {
          reject(err);
        }
      }
    });

    // Start server
    server.listen(port, () => {
      onProgress?.(`Started callback server on port ${port}`);
      onProgress?.('Opening browser for authentication...');

      // Open browser
      openBrowser(authUrl.toString());

      // Also print URL for manual copy
      onProgress?.(`\nIf browser doesn't open, visit:\n${authUrl.toString()}\n`);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timeout - no response received'));
    }, 300000);
  });

  return authPromise;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code, codeVerifier, provider) {
  const fetch = require('node-fetch');

  // Build request based on provider type
  let requestBody;
  let headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json'
  };

  if (provider.type === 'supabase') {
    // Supabase uses JSON body for token exchange
    headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    // Add apikey header if available (required for some Supabase setups)
    if (provider.anonKey) {
      headers['apikey'] = provider.anonKey;
    }

    requestBody = JSON.stringify({
      grant_type: 'pkce',
      auth_code: code,
      code_verifier: codeVerifier
    });
  } else {
    // Standard OAuth2 form-encoded
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: provider.clientId,
      redirect_uri: provider.redirectUri,
      code_verifier: codeVerifier
    });
    requestBody = params.toString();
  }

  const tokenUrl = provider.type === 'supabase'
    ? `${provider.supabaseUrl}/auth/v1/token?grant_type=pkce`
    : provider.tokenEndpoint;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: requestBody
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();

  // Calculate expiration time
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : data.expires_at // Supabase may return expires_at directly
    ? new Date(data.expires_at * 1000).toISOString()
    : null;

  const credentials = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    expires_at: expiresAt,
    provider: provider.name,
    token_type: data.token_type || 'Bearer',
    scope: data.scope || provider.scopes?.join(' ') || '',
    created_at: new Date().toISOString(),
    // Store user info if Supabase returns it
    user: data.user || null
  };

  // Save credentials
  saveCredentials(credentials);

  return credentials;
}

/**
 * Refresh access token using refresh token
 */
async function refreshToken(refreshToken, providerName = 'terminals') {
  const fetch = require('node-fetch');
  const { getProvider } = require('./providers');
  const provider = getProvider(providerName);

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
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

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();

  // Calculate expiration time
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null;

  const credentials = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken, // Use new or keep old
    expires_at: expiresAt,
    provider: provider.name,
    token_type: data.token_type || 'Bearer',
    scope: data.scope || provider.scopes.join(' '),
    created_at: new Date().toISOString()
  };

  // Save updated credentials
  saveCredentials(credentials);

  return credentials;
}

/**
 * Revoke access token
 */
async function revokeToken(token, providerName = 'terminals') {
  const fetch = require('node-fetch');
  const { getProvider } = require('./providers');
  const provider = getProvider(providerName);

  if (!provider.revokeEndpoint) {
    // Provider doesn't support revocation
    return;
  }

  const params = new URLSearchParams({
    token,
    client_id: provider.clientId
  });

  await fetch(provider.revokeEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
}

module.exports = {
  startOAuthFlow,
  exchangeCodeForTokens,
  refreshToken,
  revokeToken,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState
};
