// src/server/auth/clientMetadata.js
// MCP 2025-11-25 Client ID Metadata Documents (SEP-991)
// URL-based client registration replacing Dynamic Client Registration

const fetch = require('node-fetch');
const NodeCache = require('node-cache');
const config = require('../../../config');

// Cache client metadata with configurable TTL (max 24 hours per spec)
const metadataCache = new NodeCache({
  stdTTL: 86400, // 24 hours max
  checkperiod: 3600, // Check every hour
  maxKeys: 1000
});

class ClientMetadataValidator {
  constructor() {
    this.enabled = config.mcp?.auth?.clientMetadataEnabled || false;
    this.allowHttp = process.env.MCP_CIMD_ALLOW_HTTP === 'true'; // For testing only
  }

  /**
   * Check if a client ID is a URL-formatted CIMD identifier
   * @param {string} clientId - Client identifier
   * @returns {boolean} True if URL-formatted
   */
  isUrlClientId(clientId) {
    if (!clientId || typeof clientId !== 'string') return false;
    return clientId.startsWith('https://') || (this.allowHttp && clientId.startsWith('http://'));
  }

  /**
   * Fetch and validate client metadata document
   * @param {string} clientId - Client ID URL (must be HTTPS)
   * @returns {Object} Validated client metadata
   * @throws {Error} If validation fails
   */
  async fetchClientMetadata(clientId) {
    // Validate URL format
    if (!this.isUrlClientId(clientId)) {
      throw new Error('Client ID must be an HTTPS URL for CIMD');
    }

    // Enforce HTTPS in production
    if (!this.allowHttp && !clientId.startsWith('https://')) {
      throw new Error('Client ID must use HTTPS');
    }

    // Check cache first
    const cached = metadataCache.get(clientId);
    if (cached) {
      process.stderr.write(`[${new Date().toISOString()}] CIMD: Cache hit for ${clientId}\n`);
      return cached;
    }

    process.stderr.write(`[${new Date().toISOString()}] CIMD: Fetching metadata from ${clientId}\n`);

    // Fetch metadata document
    let response;
    try {
      response = await fetch(clientId, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'openrouter-agents-mcp/1.4.0'
        },
        timeout: 10000 // 10 second timeout
      });
    } catch (fetchError) {
      throw new Error(`Failed to fetch client metadata: ${fetchError.message}`);
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch client metadata: HTTP ${response.status}`);
    }

    let metadata;
    try {
      metadata = await response.json();
    } catch (parseError) {
      throw new Error('Client metadata is not valid JSON');
    }

    // Validate required fields per OAuth 2.0 Dynamic Client Registration spec
    this.validateMetadata(clientId, metadata);

    // Determine cache TTL from HTTP headers (max 24 hours)
    let ttl = 86400; // Default 24 hours
    const cacheControl = response.headers.get('cache-control');
    if (cacheControl) {
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      if (maxAgeMatch) {
        ttl = Math.min(parseInt(maxAgeMatch[1], 10), 86400);
      }
    }

    // Cache the validated metadata
    metadataCache.set(clientId, metadata, ttl);
    process.stderr.write(`[${new Date().toISOString()}] CIMD: Cached metadata for ${clientId} (TTL: ${ttl}s)\n`);

    return metadata;
  }

  /**
   * Validate client metadata document
   * @param {string} clientId - Expected client ID
   * @param {Object} metadata - Metadata document
   * @throws {Error} If validation fails
   */
  validateMetadata(clientId, metadata) {
    // client_id MUST match the URL exactly
    if (metadata.client_id !== clientId) {
      throw new Error(`Client ID mismatch: document says "${metadata.client_id}", expected "${clientId}"`);
    }

    // Required fields
    const required = ['client_id', 'client_name'];
    for (const field of required) {
      if (!metadata[field]) {
        throw new Error(`Missing required field in client metadata: ${field}`);
      }
    }

    // redirect_uris required for authorization code flow
    if (metadata.grant_types?.includes('authorization_code')) {
      if (!metadata.redirect_uris || !Array.isArray(metadata.redirect_uris) || metadata.redirect_uris.length === 0) {
        throw new Error('redirect_uris required for authorization_code grant type');
      }
    }

    // Validate redirect URIs format if present
    if (metadata.redirect_uris) {
      for (const uri of metadata.redirect_uris) {
        try {
          new URL(uri);
        } catch (_) {
          throw new Error(`Invalid redirect_uri: ${uri}`);
        }
      }
    }
  }

  /**
   * Validate that a redirect URI is registered for the client
   * @param {Object} metadata - Client metadata
   * @param {string} redirectUri - Redirect URI to validate
   * @returns {boolean} True if valid
   */
  validateRedirectUri(metadata, redirectUri) {
    if (!metadata.redirect_uris || !Array.isArray(metadata.redirect_uris)) {
      return false;
    }
    return metadata.redirect_uris.includes(redirectUri);
  }

  /**
   * Get client display information for consent screens
   * @param {Object} metadata - Client metadata
   * @returns {Object} Display info
   */
  getClientDisplayInfo(metadata) {
    return {
      name: metadata.client_name,
      uri: metadata.client_uri || null,
      logoUri: metadata.logo_uri || null,
      tosUri: metadata.tos_uri || null,
      policyUri: metadata.policy_uri || null,
      contacts: metadata.contacts || []
    };
  }

  /**
   * Clear cached metadata for a client
   * @param {string} clientId - Client ID to clear
   */
  clearCache(clientId) {
    if (clientId) {
      metadataCache.del(clientId);
    } else {
      metadataCache.flushAll();
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return metadataCache.getStats();
  }
}

module.exports = new ClientMetadataValidator();
