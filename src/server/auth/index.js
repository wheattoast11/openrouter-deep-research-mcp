// src/server/auth/index.js
// Unified authentication module for MCP server
//
// Authentication layers (in priority order):
// 1. Supabase Auth - terminals.tech OAuth (Google/GitHub/SAML)
// 2. Enterprise Auth - SEP-990 corporate JWKS/SSO
// 3. API Key - Simple bearer token fallback
//
// CLI tokens obtained via src/cli/auth/ are validated here.

'use strict';

const crypto = require('crypto');

function timingSafeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still compare to prevent length-based timing leak
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

const supabaseAuth = require('./supabaseAuth');
const enterpriseAuth = require('./enterpriseAuth');
const clientMetadata = require('./clientMetadata');

/**
 * Unified authentication result
 * @typedef {Object} AuthResult
 * @property {boolean} authenticated - Whether auth succeeded
 * @property {string} method - Auth method used (supabase|enterprise|apikey|none)
 * @property {Object} [user] - User info if authenticated
 * @property {string} [error] - Error message if failed
 */

/**
 * Authenticate a request using all configured methods
 *
 * @param {string} token - Bearer token from Authorization header
 * @param {Object} [options] - Authentication options
 * @param {string} [options.apiKey] - Server API key for fallback
 * @param {boolean} [options.allowAnonymous] - Allow unauthenticated requests
 * @returns {Promise<AuthResult>} Authentication result
 */
async function authenticate(token, options = {}) {
  const { apiKey, allowAnonymous = false } = options;

  if (!token) {
    if (allowAnonymous) {
      return { authenticated: false, method: 'none', user: null };
    }
    return { authenticated: false, method: 'none', error: 'No token provided' };
  }

  // 1. Try Supabase auth (terminals.tech OAuth)
  if (supabaseAuth.isEnabled()) {
    try {
      const user = await supabaseAuth.validateToken(token);
      return {
        authenticated: true,
        method: 'supabase',
        user
      };
    } catch (e) {
      // Fall through to other methods
    }
  }

  // 2. Try Enterprise JWKS auth (SEP-990)
  if (enterpriseAuth.isEnabled()) {
    try {
      const result = await enterpriseAuth.validateAccessToken(token);
      if (result.valid) {
        return {
          authenticated: true,
          method: 'enterprise',
          user: {
            userId: result.claims.sub,
            claims: result.claims
          }
        };
      }
    } catch (e) {
      // Fall through to API key
    }
  }

  // 3. Try API key auth
  if (apiKey && timingSafeCompare(token, apiKey)) {
    return {
      authenticated: true,
      method: 'apikey',
      user: { userId: 'api-key-user', role: 'service' }
    };
  }

  // No auth method succeeded
  if (allowAnonymous) {
    return { authenticated: false, method: 'none', user: null };
  }

  return {
    authenticated: false,
    method: 'none',
    error: 'Authentication failed'
  };
}

/**
 * Get authentication status summary
 * @returns {Object} Status of each auth method
 */
function getAuthStatus() {
  return {
    supabase: {
      enabled: supabaseAuth.isEnabled(),
      projectUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null
    },
    enterprise: {
      enabled: enterpriseAuth.isEnabled(),
      idpUrl: process.env.ENTERPRISE_IDP_URL || null
    },
    clientMetadata: {
      enabled: clientMetadata.enabled,
      cacheStats: clientMetadata.getCacheStats()
    },
    apiKey: {
      configured: !!(process.env.SERVER_API_KEY || process.env.API_KEY)
    },
    allowAnonymous: process.env.ALLOW_NO_API_KEY === 'true'
  };
}

/**
 * Create Express middleware for authentication
 *
 * @param {Object} options - Middleware options
 * @param {boolean} [options.required=true] - Require authentication
 * @param {string} [options.apiKey] - API key for fallback
 * @returns {Function} Express middleware
 */
function createMiddleware(options = {}) {
  const { required = true, apiKey = process.env.SERVER_API_KEY } = options;

  return async (req, res, next) => {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      if (!required) return next();
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.slice(7);
    const result = await authenticate(token, {
      apiKey,
      allowAnonymous: !required
    });

    if (result.authenticated) {
      req.user = result.user;
      req.userId = result.user?.userId;
      req.authMethod = result.method;
      return next();
    }

    if (!required) return next();
    return res.status(401).json({ error: result.error || 'Unauthorized' });
  };
}

module.exports = {
  // Unified auth
  authenticate,
  getAuthStatus,
  createMiddleware,

  // Individual handlers (for direct access)
  supabaseAuth,
  enterpriseAuth,
  clientMetadata
};
