// src/server/elicitation.js
// MCP 2025-11-25 URL Mode Elicitation (SEP-1036)
// Secure credential acquisition via browser-based OAuth flows

const { v4: uuidv4 } = require('uuid');
const config = require('../../config');

// Error code for elicitation required
const ELICITATION_REQUIRED_ERROR_CODE = -32042;

class ElicitationHandler {
  constructor() {
    this.pendingElicitations = new Map();
    this.urlModeEnabled = config.mcp?.features?.elicitation?.url !== false;
    this.formModeEnabled = config.mcp?.features?.elicitation?.form !== false;

    // Cleanup old elicitations periodically
    setInterval(() => this.cleanupExpired(), 300000); // Every 5 minutes
  }

  /**
   * Check if URL mode elicitation is enabled
   * @returns {boolean}
   */
  isUrlModeEnabled() {
    return this.urlModeEnabled;
  }

  /**
   * Check if form mode elicitation is enabled
   * @returns {boolean}
   */
  isFormModeEnabled() {
    return this.formModeEnabled;
  }

  /**
   * Create a URL mode elicitation request
   * For OAuth flows, API key collection, or external authorization
   *
   * @param {string} url - The URL to open for the user (must be HTTPS)
   * @param {string} message - Human-readable explanation
   * @param {Object} options - Additional options
   * @returns {Object} Elicitation request object
   */
  createUrlElicitation(url, message, options = {}) {
    if (!this.urlModeEnabled) {
      throw new Error('URL mode elicitation is disabled');
    }

    // Validate HTTPS (except for localhost in dev)
    const isLocalhost = url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
    const isDev = process.env.NODE_ENV === 'development';
    if (!url.startsWith('https://') && !(isDev && isLocalhost)) {
      throw new Error('URL elicitation requires HTTPS URLs');
    }

    const elicitationId = uuidv4();
    const expiresAt = Date.now() + (options.ttlMs || 600000); // 10 minutes default

    const elicitation = {
      mode: 'url',
      elicitationId,
      url,
      message,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      metadata: options.metadata || {}
    };

    this.pendingElicitations.set(elicitationId, elicitation);

    process.stderr.write(`[${new Date().toISOString()}] Elicitation: Created URL elicitation ${elicitationId}\n`);

    return {
      method: 'elicitation/create',
      params: {
        mode: 'url',
        elicitationId,
        url,
        message
      }
    };
  }

  /**
   * Create a form mode elicitation request
   * For collecting structured input from the user
   *
   * @param {Array} schema - JSON Schema for form fields
   * @param {string} message - Human-readable explanation
   * @param {Object} options - Additional options
   * @returns {Object} Elicitation request object
   */
  createFormElicitation(schema, message, options = {}) {
    if (!this.formModeEnabled) {
      throw new Error('Form mode elicitation is disabled');
    }

    const elicitationId = uuidv4();
    const expiresAt = Date.now() + (options.ttlMs || 600000); // 10 minutes default

    const elicitation = {
      mode: 'form',
      elicitationId,
      schema,
      message,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      metadata: options.metadata || {}
    };

    this.pendingElicitations.set(elicitationId, elicitation);

    process.stderr.write(`[${new Date().toISOString()}] Elicitation: Created form elicitation ${elicitationId}\n`);

    return {
      method: 'elicitation/create',
      params: {
        mode: 'form',
        elicitationId,
        schema,
        message
      }
    };
  }

  /**
   * Get an elicitation by ID
   * @param {string} elicitationId - Elicitation ID
   * @returns {Object|null} Elicitation object or null
   */
  getElicitation(elicitationId) {
    return this.pendingElicitations.get(elicitationId) || null;
  }

  /**
   * Handle user response to an elicitation
   * @param {string} elicitationId - Elicitation ID
   * @param {string} action - User action: 'accept', 'decline', 'cancel'
   * @param {Object} data - Response data (for form mode)
   * @returns {Object} Response result
   */
  handleElicitationResponse(elicitationId, action, data = null) {
    const elicitation = this.pendingElicitations.get(elicitationId);
    if (!elicitation) {
      return { success: false, error: 'Unknown elicitation' };
    }

    if (elicitation.status !== 'pending') {
      return { success: false, error: 'Elicitation already processed' };
    }

    // Check expiration
    if (new Date(elicitation.expiresAt) < new Date()) {
      elicitation.status = 'expired';
      return { success: false, error: 'Elicitation expired' };
    }

    // Valid actions
    const validActions = ['accept', 'decline', 'cancel'];
    if (!validActions.includes(action)) {
      return { success: false, error: `Invalid action: ${action}` };
    }

    // Update elicitation status
    elicitation.status = action === 'accept' ? 'completed' : action;
    elicitation.completedAt = new Date().toISOString();

    // Store response data for form mode
    if (action === 'accept' && data) {
      elicitation.responseData = data;
    }

    process.stderr.write(`[${new Date().toISOString()}] Elicitation: ${elicitationId} responded with ${action}\n`);

    return {
      success: true,
      action,
      elicitationId
    };
  }

  /**
   * Complete an elicitation after external process finishes
   * (e.g., OAuth callback received)
   *
   * @param {string} elicitationId - Elicitation ID
   * @param {Object} data - Completion data
   * @returns {Object} Completion result
   */
  completeElicitation(elicitationId, data = {}) {
    const elicitation = this.pendingElicitations.get(elicitationId);
    if (!elicitation) {
      return { success: false, error: 'Unknown elicitation' };
    }

    elicitation.status = 'completed';
    elicitation.completedAt = new Date().toISOString();
    elicitation.responseData = data;

    process.stderr.write(`[${new Date().toISOString()}] Elicitation: ${elicitationId} completed externally\n`);

    // Schedule cleanup - check if still exists and is completed before deleting
    // This prevents race condition with cleanupExpired() interval
    setTimeout(() => {
      const elicit = this.pendingElicitations.get(elicitationId);
      if (elicit && elicit.completedAt) {
        this.pendingElicitations.delete(elicitationId);
      }
    }, 3600000); // Keep for 1 hour for retrieval

    return { success: true, elicitationId };
  }

  /**
   * Create an ElicitationRequired error response
   * Used when an operation requires user input before proceeding
   *
   * @param {Array} elicitations - Array of elicitation requests
   * @returns {Object} JSON-RPC error object
   */
  createElicitationRequiredError(elicitations) {
    return {
      code: ELICITATION_REQUIRED_ERROR_CODE,
      message: 'This request requires additional information from the user.',
      data: {
        elicitations: Array.isArray(elicitations) ? elicitations : [elicitations]
      }
    };
  }

  /**
   * Check if an error is an ElicitationRequired error
   * @param {Object} error - Error object
   * @returns {boolean}
   */
  isElicitationRequiredError(error) {
    return error?.code === ELICITATION_REQUIRED_ERROR_CODE;
  }

  /**
   * Get the result data from a completed elicitation
   * @param {string} elicitationId - Elicitation ID
   * @returns {Object|null} Response data or null
   */
  getElicitationResult(elicitationId) {
    const elicitation = this.pendingElicitations.get(elicitationId);
    if (!elicitation || elicitation.status !== 'completed') {
      return null;
    }
    return elicitation.responseData;
  }

  /**
   * Wait for an elicitation to complete
   * @param {string} elicitationId - Elicitation ID
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<Object>} Elicitation result
   */
  async waitForElicitation(elicitationId, timeoutMs = 300000) {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    while (Date.now() - startTime < timeoutMs) {
      const elicitation = this.pendingElicitations.get(elicitationId);

      if (!elicitation) {
        throw new Error('Elicitation not found');
      }

      if (elicitation.status === 'completed') {
        return {
          success: true,
          data: elicitation.responseData
        };
      }

      if (elicitation.status === 'declined' || elicitation.status === 'cancel') {
        return {
          success: false,
          action: elicitation.status
        };
      }

      if (elicitation.status === 'expired') {
        return {
          success: false,
          error: 'Elicitation expired'
        };
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return {
      success: false,
      error: 'Timeout waiting for elicitation'
    };
  }

  /**
   * Cleanup expired elicitations
   */
  cleanupExpired() {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, elicitation] of this.pendingElicitations) {
      const expiresAt = new Date(elicitation.expiresAt).getTime();
      const completedAt = elicitation.completedAt ? new Date(elicitation.completedAt).getTime() : null;

      // Remove if expired or completed more than 1 hour ago
      if (expiresAt < now || (completedAt && (now - completedAt) > 3600000)) {
        this.pendingElicitations.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      process.stderr.write(`[${new Date().toISOString()}] Elicitation: Cleaned up ${cleaned} expired elicitations\n`);
    }
  }

  /**
   * Get pending elicitation count
   * @returns {number}
   */
  getPendingCount() {
    return Array.from(this.pendingElicitations.values())
      .filter(e => e.status === 'pending').length;
  }

  /**
   * Get all elicitations (for debugging)
   * @returns {Array}
   */
  getAllElicitations() {
    return Array.from(this.pendingElicitations.values());
  }

  // ==========================================
  // terminals.tech Auth Bridge
  // ==========================================

  /**
   * Create a terminals.tech OAuth elicitation for GitHub
   * Leverages existing terminals.tech auth infrastructure
   *
   * @param {string} provider - Auth provider ('github', 'google', etc.)
   * @param {Object} options - Additional options
   * @returns {Object} Elicitation request with auth URL
   */
  createTerminalsAuthElicitation(provider = 'github', options = {}) {
    if (!this.urlModeEnabled) {
      throw new Error('URL mode elicitation is disabled');
    }

    const elicitationId = uuidv4();
    const state = uuidv4(); // CSRF protection
    const serverBaseUrl = config.server?.baseUrl || `http://localhost:${config.server?.port || 3001}`;

    // Build terminals.tech OAuth URL with callback
    const authParams = new URLSearchParams({
      redirect_uri: `${serverBaseUrl}/auth/callback`,
      scope: options.scope || 'repo',
      state: state,
      elicitation_id: elicitationId
    });

    const authUrl = `https://terminals.tech/auth/${provider}?${authParams.toString()}`;

    const message = options.message ||
      `Sign in with ${provider} via terminals.tech to enable git operations and session sync`;

    const elicitation = {
      mode: 'url',
      elicitationId,
      url: authUrl,
      message,
      status: 'pending',
      provider,
      state, // Store state for CSRF validation
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (options.ttlMs || 600000)).toISOString(),
      metadata: {
        ...options.metadata,
        authProvider: provider,
        terminalsAuth: true
      }
    };

    this.pendingElicitations.set(elicitationId, elicitation);

    process.stderr.write(`[${new Date().toISOString()}] Elicitation: Created terminals.tech ${provider} auth elicitation ${elicitationId}\n`);

    return {
      method: 'elicitation/create',
      params: {
        mode: 'url',
        elicitationId,
        url: authUrl,
        message
      },
      state // Return state for callback validation
    };
  }

  /**
   * Handle OAuth callback from terminals.tech
   * Called by Express route /auth/callback
   *
   * @param {string} code - OAuth authorization code
   * @param {string} state - CSRF state parameter
   * @param {string} elicitationId - Elicitation ID from query params
   * @returns {Object} Result with access token or error
   */
  async handleTerminalsAuthCallback(code, state, elicitationId) {
    // Find the matching elicitation
    const elicitation = this.pendingElicitations.get(elicitationId);

    if (!elicitation) {
      return { success: false, error: 'Elicitation not found' };
    }

    // Validate CSRF state
    if (elicitation.state !== state) {
      return { success: false, error: 'Invalid state parameter (CSRF protection)' };
    }

    // Check expiration
    if (new Date(elicitation.expiresAt).getTime() < Date.now()) {
      elicitation.status = 'expired';
      return { success: false, error: 'Elicitation expired' };
    }

    try {
      // Exchange code for token via terminals.tech API
      const tokenResponse = await fetch('https://terminals.tech/api/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code,
          state,
          elicitation_id: elicitationId
        })
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`Token exchange failed: ${errorText}`);
      }

      const tokenData = await tokenResponse.json();

      // Update elicitation with success
      elicitation.status = 'accepted';
      elicitation.completedAt = new Date().toISOString();
      elicitation.data = {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type || 'Bearer',
        scope: tokenData.scope,
        provider: elicitation.provider
      };

      process.stderr.write(`[${new Date().toISOString()}] Elicitation: terminals.tech auth successful for ${elicitationId}\n`);

      return {
        success: true,
        access_token: tokenData.access_token,
        provider: elicitation.provider
      };
    } catch (error) {
      elicitation.status = 'failed';
      elicitation.error = error.message;
      process.stderr.write(`[${new Date().toISOString()}] Elicitation: terminals.tech auth failed: ${error.message}\n`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get stored access token from a completed auth elicitation
   *
   * @param {string} elicitationId - Elicitation ID
   * @returns {string|null} Access token or null
   */
  getAccessToken(elicitationId) {
    const elicitation = this.pendingElicitations.get(elicitationId);
    if (elicitation?.status === 'accepted' && elicitation?.data?.access_token) {
      return elicitation.data.access_token;
    }
    return null;
  }
}

// Export singleton and error code
module.exports = new ElicitationHandler();
module.exports.ELICITATION_REQUIRED_ERROR_CODE = ELICITATION_REQUIRED_ERROR_CODE;
