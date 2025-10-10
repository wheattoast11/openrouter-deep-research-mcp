/**
 * OAuth 2.1 Resource Server Implementation (RFC 9728, RFC 8414)
 * Provides Protected Resource Metadata discovery and WWW-Authenticate challenges
 */

const config = require('../../config');
const { createRemoteJWKSet, jwtVerify } = require('jose');

let JWKS = null;
if (config.auth.jwksUrl) {
  try {
    JWKS = createRemoteJWKSet(new URL(config.auth.jwksUrl));
  } catch (e) {
    console.error(`[Auth] Failed to initialize JWKS from URL: ${config.auth.jwksUrl}`, e);
  }
}

function extractScopes(payload) {
    if (!payload) return [];
    if (typeof payload.scope === 'string') {
      return payload.scope.split(' ');
    }
    if (Array.isArray(payload.scp)) {
      return payload.scp;
    }
    return [];
}

/**
 * Enhanced authenticate middleware with WWW-Authenticate challenges
 */
function createAuthMiddleware() {
  return async (req, res, next) => {
    const allowNoAuth = process.env.ALLOW_NO_API_KEY === 'true';
    const authHeader = req.headers.authorization || '';
    const serverApiKey = config.server.apiKey;
    const jwksUrl = config.auth.jwksUrl;
    const expectedAudience = config.auth.expectedAudience;

    // No auth header
    if (!authHeader.startsWith('Bearer ')) {
      if (allowNoAuth) return next();
      
      const resourceMetadataUrl = `${config.server.publicUrl}/.well-known/oauth-protected-resource`;
      const minimalScopes = config.auth.scopes.minimal.join(' ');
      
      res.setHeader('WWW-Authenticate', 
        `Bearer realm="${config.server.name}", error="invalid_token", error_description="Missing bearer token", resource_metadata="${resourceMetadataUrl}", scope="${minimalScopes}"`
      );
      return res.status(401).json({ error: 'Unauthorized: Missing bearer token' });
    }

    const token = authHeader.split(' ')[1];
    
    // Try JWT validation first
    if (jwksUrl && JWKS) {
      try {
        const { payload } = await jwtVerify(token, JWKS, { audience: expectedAudience });
        
        if (!payload || (expectedAudience && payload.aud !== expectedAudience && 
            !(Array.isArray(payload.aud) && payload.aud.includes(expectedAudience)))) {
          const resourceMetadataUrl = `${config.server.publicUrl}/.well-known/oauth-protected-resource`;
          res.setHeader('WWW-Authenticate', 
            `Bearer error="invalid_token", error_description="Invalid audience", resource_metadata="${resourceMetadataUrl}"`
          );
          return res.status(403).json({ error: 'Forbidden: invalid token audience' });
        }

        req.user = payload;
        req.scopes = extractScopes(payload);
        return next();
      } catch (e) {
        if (!serverApiKey) { // If JWT fails and there's no API key fallback, fail now.
          const resourceMetadataUrl = `${config.server.publicUrl}/.well-known/oauth-protected-resource`;
          res.setHeader('WWW-Authenticate', 
            `Bearer error="invalid_token", error_description="JWT verification failed: ${e.message}", resource_metadata="${resourceMetadataUrl}"`
          );
          return res.status(401).json({ error: 'Unauthorized: JWT verification failed' });
        }
        // Fall through to API key
      }
    }

    // Fallback to API key
    if (serverApiKey && token === serverApiKey) {
      req.user = { sub: 'api-key-user' };
      req.scopes = ['*']; // API key has all scopes
      return next();
    }

    if (allowNoAuth) {
      req.user = { sub: 'anonymous' };
      req.scopes = config.auth.scopes.minimal;
      return next();
    }
    
    const resourceMetadataUrl = `${config.server.publicUrl}/.well-known/oauth-protected-resource`;
    res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", error_description="Invalid token", resource_metadata="${resourceMetadataUrl}"`);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

/**
 * Scope validation middleware factory
 */
function requireScopes(...requiredScopes) {
  const flattened = requiredScopes.flat();
  return (req, res, next) => {
    const userScopes = req.scopes || [];

    if (userScopes.includes('*') || !flattened.length) return next();

    const hasAllScopes = flattened.every(scope => userScopes.includes(scope));

    if (!hasAllScopes) {
      const resourceMetadataUrl = `${config.server.publicUrl}/.well-known/oauth-protected-resource`;
      const scopeStr = flattened.join(' ');

      res.setHeader(
        'WWW-Authenticate',
        `Bearer error="insufficient_scope", scope="${scopeStr}", resource_metadata="${resourceMetadataUrl}"`
      );
      return res.status(403).json({
        error: 'Forbidden: Insufficient scope',
        required_scopes: flattened
      });
    }

    next();
  };
}

/**
 * Get required scopes for a method
 */
function getScopesForMethod(method) {
  return config.auth.scopes.scopeMap[method] || config.auth.scopes.minimal;
}

module.exports = {
  createAuthMiddleware,
  requireScopes,
  getScopesForMethod
};

module.exports = {
  createAuthMiddleware,
  requireScopes,
  getScopesForMethod
};

