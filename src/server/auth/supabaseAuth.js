// src/server/auth/supabaseAuth.js
// Supabase JWT validation for terminals.tech OAuth (Google/GitHub)
// Works with CLI auth tokens obtained via PKCE or device flow

'use strict';

/**
 * Supabase Auth Handler
 *
 * Validates JWT tokens issued by Supabase Auth when users log in via:
 * - terminals.tech OAuth (browser PKCE flow)
 * - Device code flow (headless/SSH)
 * - Google/GitHub SSO pass-through
 *
 * Token validation uses the SUPABASE_JWT_SECRET for HS256 signatures
 * or SUPABASE_JWKS_URL for RS256 asymmetric verification.
 */

// Lazy load jose for JWT verification
let jose = null;
async function getJose() {
  if (!jose) {
    jose = await import('jose');
  }
  return jose;
}

class SupabaseAuthHandler {
  constructor() {
    // Configuration from environment
    this.jwtSecret = process.env.SUPABASE_JWT_SECRET;
    this.projectUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    this.jwksUrl = process.env.SUPABASE_JWKS_URL;

    // Derived values
    this.expectedIssuer = this.projectUrl ? `${this.projectUrl}/auth/v1` : null;
    this.expectedAudience = process.env.SUPABASE_JWT_AUDIENCE || 'authenticated';

    // JWKS cache
    this.jwksCache = null;
    this.jwksCacheTime = 0;
    this.jwksCacheTtl = 3600000; // 1 hour

    // Secret key cache for HS256
    this.secretKey = null;
  }

  /**
   * Check if Supabase auth is configured
   * @returns {boolean}
   */
  isEnabled() {
    return !!(this.jwtSecret || this.jwksUrl);
  }

  /**
   * Get the secret key for HS256 verification
   * @returns {Uint8Array}
   */
  async getSecretKey() {
    if (!this.secretKey && this.jwtSecret) {
      const encoder = new TextEncoder();
      this.secretKey = encoder.encode(this.jwtSecret);
    }
    return this.secretKey;
  }

  /**
   * Get JWKS for RS256 verification (if configured)
   * @returns {Function} JWKS getter function
   */
  async getJWKS() {
    if (!this.jwksUrl) {
      throw new Error('JWKS URL not configured');
    }

    const { createRemoteJWKSet } = await getJose();
    const now = Date.now();

    if (!this.jwksCache || (now - this.jwksCacheTime) > this.jwksCacheTtl) {
      this.jwksCache = createRemoteJWKSet(new URL(this.jwksUrl));
      this.jwksCacheTime = now;
    }

    return this.jwksCache;
  }

  /**
   * Validate a Supabase JWT token
   *
   * @param {string} token - JWT access token from Supabase
   * @returns {Object} Validated user info
   * @throws {Error} If validation fails
   */
  async validateToken(token) {
    if (!this.isEnabled()) {
      throw new Error('Supabase auth not configured');
    }

    const { jwtVerify, decodeJwt } = await getJose();

    // Validate JWT format
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format: expected 3 parts');
    }

    let header;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    } catch (e) {
      throw new Error('Invalid JWT header encoding');
    }

    if (!header.alg) {
      throw new Error('Missing algorithm in JWT header');
    }

    let payload;

    if (header.alg === 'HS256' && this.jwtSecret) {
      // Symmetric verification with secret
      const secretKey = await this.getSecretKey();
      const result = await jwtVerify(token, secretKey, {
        issuer: this.expectedIssuer,
        audience: this.expectedAudience
      });
      payload = result.payload;
    } else if (header.alg === 'RS256' && this.jwksUrl) {
      // Asymmetric verification with JWKS
      const JWKS = await this.getJWKS();
      const result = await jwtVerify(token, JWKS, {
        issuer: this.expectedIssuer,
        audience: this.expectedAudience
      });
      payload = result.payload;
    } else {
      throw new Error(`Unsupported algorithm: ${header.alg}`);
    }

    // Validate required claims
    if (!payload.sub) {
      throw new Error('Missing subject claim');
    }

    // Extract user metadata from Supabase token structure
    const userMetadata = payload.user_metadata || {};
    const appMetadata = payload.app_metadata || {};

    return {
      userId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_confirmed_at != null,
      role: payload.role || appMetadata.role || 'authenticated',
      provider: appMetadata.provider || 'unknown',
      providers: appMetadata.providers || [],
      name: userMetadata.full_name || userMetadata.name,
      avatarUrl: userMetadata.avatar_url,
      expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
      issuedAt: payload.iat ? new Date(payload.iat * 1000) : null,
      claims: payload
    };
  }

  /**
   * Validate a refresh token by calling Supabase API
   * Used for token refresh in long-running CLI sessions
   *
   * @param {string} refreshToken - Refresh token
   * @returns {Object} New tokens
   */
  async refreshAccessToken(refreshToken) {
    if (!this.projectUrl) {
      throw new Error('SUPABASE_URL not configured');
    }

    const response = await fetch(`${this.projectUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_ANON_KEY || ''
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const tokens = await response.json();

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      expiresAt: tokens.expires_at,
      tokenType: tokens.token_type || 'Bearer'
    };
  }

  /**
   * Get user by ID from Supabase Admin API
   * Requires service role key
   *
   * @param {string} userId - User UUID
   * @returns {Object} User data
   */
  async getUserById(userId) {
    if (!this.projectUrl) {
      throw new Error('SUPABASE_URL not configured');
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY required for admin operations');
    }

    const response = await fetch(`${this.projectUrl}/auth/v1/admin/users/${userId}`, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get user: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Revoke a user's sessions (sign out everywhere)
   * Requires service role key
   *
   * @param {string} userId - User UUID
   */
  async revokeUserSessions(userId) {
    if (!this.projectUrl) {
      throw new Error('SUPABASE_URL not configured');
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY required for admin operations');
    }

    const response = await fetch(`${this.projectUrl}/auth/v1/admin/users/${userId}/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to revoke sessions: ${response.status}`);
    }
  }

  /**
   * Get OpenID Connect discovery document
   * @returns {Object} OIDC configuration
   */
  async getOIDCConfig() {
    if (!this.projectUrl) {
      throw new Error('SUPABASE_URL not configured');
    }

    const response = await fetch(`${this.projectUrl}/auth/v1/.well-known/openid-configuration`);

    if (!response.ok) {
      throw new Error(`Failed to fetch OIDC config: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Create middleware for Express
   * @param {Object} options - Middleware options
   * @returns {Function} Express middleware
   */
  middleware(options = {}) {
    const { required = true, extractUser = true } = options;

    return async (req, res, next) => {
      const authHeader = req.headers.authorization || '';

      if (!authHeader.startsWith('Bearer ')) {
        if (required) {
          return res.status(401).json({ error: 'Missing authorization header' });
        }
        return next();
      }

      const token = authHeader.slice(7);

      try {
        const user = await this.validateToken(token);
        if (extractUser) {
          req.user = user;
          req.userId = user.userId;
        }
        next();
      } catch (error) {
        if (required) {
          return res.status(401).json({ error: `Invalid token: ${error.message}` });
        }
        next();
      }
    };
  }
}

// Export singleton instance
module.exports = new SupabaseAuthHandler();
