// src/server/auth/enterpriseAuth.js
// MCP 2025-11-25 Enterprise-Managed Authorization (SEP-990)
// Cross App Access (XAA) for enterprise SSO integration

const config = require('../../../config');

// Lazy load jose to keep it optional
let jose = null;
async function getJose() {
  if (!jose) {
    jose = await import('jose');
  }
  return jose;
}

class EnterpriseAuthHandler {
  constructor() {
    this.enabled = config.mcp?.auth?.enterpriseAuthEnabled || false;
    this.idpUrl = config.mcp?.auth?.enterpriseIdpUrl || process.env.ENTERPRISE_IDP_URL;
    this.expectedIssuer = process.env.ENTERPRISE_IDP_ISSUER || this.idpUrl;
    this.expectedAudience = process.env.ENTERPRISE_EXPECTED_AUD || 'mcp-server';
    this.jwksCache = null;
    this.jwksCacheTime = 0;
    this.jwksCacheTtl = 3600000; // 1 hour
  }

  /**
   * Check if enterprise auth is configured and enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled && !!this.idpUrl;
  }

  /**
   * Get JWKS (JSON Web Key Set) from enterprise IdP
   * @returns {Function} JWKS getter function for jose
   */
  async getJWKS() {
    const { createRemoteJWKSet } = await getJose();

    // Cache JWKS for performance
    const now = Date.now();
    if (!this.jwksCache || (now - this.jwksCacheTime) > this.jwksCacheTtl) {
      const jwksUrl = new URL('/.well-known/jwks.json', this.idpUrl);
      this.jwksCache = createRemoteJWKSet(jwksUrl);
      this.jwksCacheTime = now;
      process.stderr.write(`[${new Date().toISOString()}] EnterpriseAuth: Refreshed JWKS from ${jwksUrl}\n`);
    }

    return this.jwksCache;
  }

  /**
   * Validate an Identity Assertion Grant (ID-JAG) token
   * RFC 7523 JWT Profile for OAuth 2.0 Authorization Grants
   *
   * @param {string} idJag - The ID-JAG JWT token
   * @returns {Object} Validated token claims
   * @throws {Error} If validation fails
   */
  async validateIdentityAssertionGrant(idJag) {
    if (!this.isEnabled()) {
      throw new Error('Enterprise IdP not configured');
    }

    const { jwtVerify } = await getJose();
    const JWKS = await this.getJWKS();

    let payload;
    try {
      const result = await jwtVerify(idJag, JWKS, {
        issuer: this.expectedIssuer,
        audience: this.expectedAudience
      });
      payload = result.payload;
    } catch (verifyError) {
      process.stderr.write(`[${new Date().toISOString()}] EnterpriseAuth: JWT verification failed: ${verifyError.message}\n`);
      throw new Error(`Invalid ID-JAG: ${verifyError.message}`);
    }

    // Validate required claims
    if (!payload.sub) {
      throw new Error('Invalid ID-JAG: missing subject (sub) claim');
    }

    if (!payload.aud) {
      throw new Error('Invalid ID-JAG: missing audience (aud) claim');
    }

    // Check expiration (jose already validates this, but double-check)
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Invalid ID-JAG: token expired');
    }

    process.stderr.write(`[${new Date().toISOString()}] EnterpriseAuth: Validated ID-JAG for user ${payload.sub}\n`);

    return {
      userId: payload.sub,
      clientId: payload.azp || payload.client_id,
      scope: payload.scope || '',
      expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
      issuedAt: payload.iat ? new Date(payload.iat * 1000) : null,
      issuer: payload.iss,
      claims: payload
    };
  }

  /**
   * Exchange an ID token for an access token via RFC 8693 Token Exchange
   * Used for Cross App Access (XAA) flow
   *
   * @param {string} idToken - User's ID token from SSO
   * @param {string} targetResource - Target MCP server resource identifier
   * @param {string} scope - Requested scopes (optional)
   * @returns {Object} Token exchange response with access_token
   * @throws {Error} If exchange fails
   */
  async exchangeToken(idToken, targetResource, scope = '') {
    if (!this.isEnabled()) {
      throw new Error('Enterprise IdP not configured');
    }

    const tokenEndpoint = new URL('/oauth/token', this.idpUrl).toString();

    process.stderr.write(`[${new Date().toISOString()}] EnterpriseAuth: Initiating token exchange for resource ${targetResource}\n`);

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: idToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
        requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        resource: targetResource,
        scope: scope
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      process.stderr.write(`[${new Date().toISOString()}] EnterpriseAuth: Token exchange failed: ${response.status} ${errorBody}\n`);
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    const tokenResponse = await response.json();

    // Validate response has required fields
    if (!tokenResponse.access_token) {
      throw new Error('Token exchange response missing access_token');
    }

    process.stderr.write(`[${new Date().toISOString()}] EnterpriseAuth: Token exchange successful\n`);

    return {
      accessToken: tokenResponse.access_token,
      tokenType: tokenResponse.token_type || 'Bearer',
      expiresIn: tokenResponse.expires_in,
      scope: tokenResponse.scope,
      issuedTokenType: tokenResponse.issued_token_type
    };
  }

  /**
   * Validate an access token from the authorization server
   * @param {string} accessToken - Access token to validate
   * @returns {Object} Token claims
   */
  async validateAccessToken(accessToken) {
    if (!this.isEnabled()) {
      throw new Error('Enterprise IdP not configured');
    }

    // If JWT, validate signature
    if (accessToken.includes('.')) {
      const { jwtVerify } = await getJose();
      const JWKS = await this.getJWKS();

      try {
        const result = await jwtVerify(accessToken, JWKS, {
          issuer: this.expectedIssuer
        });
        return {
          valid: true,
          claims: result.payload
        };
      } catch (error) {
        return {
          valid: false,
          error: error.message
        };
      }
    }

    // For opaque tokens, use introspection endpoint
    const introspectionEndpoint = new URL('/oauth/introspect', this.idpUrl).toString();

    const response = await fetch(introspectionEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        token: accessToken,
        token_type_hint: 'access_token'
      })
    });

    if (!response.ok) {
      return {
        valid: false,
        error: `Introspection failed: ${response.status}`
      };
    }

    const introspection = await response.json();
    return {
      valid: introspection.active === true,
      claims: introspection.active ? introspection : null
    };
  }

  /**
   * Get enterprise IdP metadata from .well-known endpoint
   * @returns {Object} IdP metadata
   */
  async getIdPMetadata() {
    if (!this.idpUrl) {
      throw new Error('Enterprise IdP URL not configured');
    }

    const metadataUrl = new URL('/.well-known/openid-configuration', this.idpUrl).toString();

    const response = await fetch(metadataUrl, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch IdP metadata: ${response.status}`);
    }

    return response.json();
  }
}

module.exports = new EnterpriseAuthHandler();
