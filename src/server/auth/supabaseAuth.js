// src/server/auth/supabaseAuth.js
// Supabase JWT validation for terminals.tech OAuth (Google/GitHub via Supabase)
// Simplest integration: validate Supabase JWTs on MCP requests

const config = require('../../../config');

// Lazy load jose for JWT validation
let jose = null;
async function getJose() {
  if (!jose) {
    jose = await import('jose');
  }
  return jose;
}

class SupabaseAuthHandler {
  constructor() {
    // Supabase project configuration
    this.supabaseUrl = process.env.SUPABASE_URL || config.mcp?.auth?.supabaseUrl;
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY || config.mcp?.auth?.supabaseAnonKey;
    this.supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET || config.mcp?.auth?.supabaseJwtSecret;

    // Derived values
    this.projectRef = this.supabaseUrl ? new URL(this.supabaseUrl).hostname.split('.')[0] : null;
    this.issuer = this.supabaseUrl ? `${this.supabaseUrl}/auth/v1` : null;

    // Enable if configured
    this.enabled = !!(this.supabaseUrl && this.supabaseJwtSecret);

    if (this.enabled) {
      process.stderr.write(`[${new Date().toISOString()}] SupabaseAuth: Enabled for project ${this.projectRef}\n`);
    }
  }

  /**
   * Check if Supabase auth is configured
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Validate a Supabase JWT access token
   * @param {string} token - JWT from Supabase (access_token from session)
   * @returns {Object} Validated user claims
   * @throws {Error} If validation fails
   */
  async validateToken(token) {
    if (!this.enabled) {
      throw new Error('Supabase auth not configured');
    }

    if (!token) {
      throw new Error('No token provided');
    }

    // Remove 'Bearer ' prefix if present
    const jwt = token.startsWith('Bearer ') ? token.slice(7) : token;

    const { jwtVerify } = await getJose();

    // Supabase uses HS256 with the JWT secret
    const secret = new TextEncoder().encode(this.supabaseJwtSecret);

    try {
      const { payload } = await jwtVerify(jwt, secret, {
        issuer: this.issuer,
        audience: 'authenticated'
      });

      // Validate required claims
      if (!payload.sub) {
        throw new Error('Missing subject (sub) claim');
      }

      // Check role is authenticated (not anon)
      if (payload.role !== 'authenticated') {
        throw new Error('Token is not for authenticated user');
      }

      process.stderr.write(`[${new Date().toISOString()}] SupabaseAuth: Validated token for user ${payload.sub}\n`);

      return {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        provider: payload.app_metadata?.provider,
        providers: payload.app_metadata?.providers || [],
        userMetadata: payload.user_metadata || {},
        expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
        issuedAt: payload.iat ? new Date(payload.iat * 1000) : null,
        sessionId: payload.session_id,
        claims: payload
      };
    } catch (error) {
      process.stderr.write(`[${new Date().toISOString()}] SupabaseAuth: Token validation failed: ${error.message}\n`);
      throw new Error(`Invalid token: ${error.message}`);
    }
  }

  /**
   * Express/Connect middleware for protecting routes
   * @param {Object} options - Middleware options
   * @param {boolean} options.required - If true, reject unauthenticated requests (default: true)
   * @returns {Function} Middleware function
   */
  middleware(options = {}) {
    const { required = true } = options;

    return async (req, res, next) => {
      // Skip auth if not enabled
      if (!this.enabled) {
        if (required) {
          return res.status(503).json({ error: 'Authentication not configured' });
        }
        return next();
      }

      // Get token from Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        if (required) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing Authorization header. Use: Authorization: Bearer <supabase_access_token>'
          });
        }
        return next();
      }

      try {
        const user = await this.validateToken(authHeader);
        req.user = user;
        req.userId = user.userId;
        next();
      } catch (error) {
        if (required) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: error.message
          });
        }
        next();
      }
    };
  }

  /**
   * Validate token from MCP request params or headers
   * For use in MCP tool handlers
   * @param {Object} context - Request context with headers
   * @returns {Object|null} User info or null if not authenticated
   */
  async validateMcpRequest(context) {
    if (!this.enabled) {
      return null;
    }

    // Try Authorization header first
    const authHeader = context.headers?.authorization ||
                       context.headers?.Authorization ||
                       context.meta?.authorization;

    if (authHeader) {
      try {
        return await this.validateToken(authHeader);
      } catch (error) {
        process.stderr.write(`[${new Date().toISOString()}] SupabaseAuth: MCP request auth failed: ${error.message}\n`);
        return null;
      }
    }

    return null;
  }

  /**
   * Generate OAuth login URL for terminals.tech
   * @param {string} provider - 'google' or 'github'
   * @param {string} redirectTo - URL to redirect after login
   * @returns {string} OAuth login URL
   */
  getOAuthUrl(provider, redirectTo) {
    if (!this.supabaseUrl) {
      throw new Error('Supabase URL not configured');
    }

    const url = new URL(`${this.supabaseUrl}/auth/v1/authorize`);
    url.searchParams.set('provider', provider);

    if (redirectTo) {
      url.searchParams.set('redirect_to', redirectTo);
    }

    return url.toString();
  }

  /**
   * Get server auth configuration for MCP clients
   * Returns info needed for clients to authenticate
   */
  getAuthConfig() {
    return {
      enabled: this.enabled,
      type: 'supabase',
      supabaseUrl: this.supabaseUrl,
      providers: ['google', 'github'],
      loginUrl: this.supabaseUrl ? `${this.supabaseUrl}/auth/v1/authorize` : null,
      instructions: this.enabled ?
        'Authenticate via terminals.tech, then include your Supabase access_token in the Authorization header' :
        'Authentication not configured on this server'
    };
  }
}

// Singleton instance
const supabaseAuth = new SupabaseAuthHandler();

module.exports = supabaseAuth;
module.exports.SupabaseAuthHandler = SupabaseAuthHandler;
