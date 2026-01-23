/**
 * Zero Extension - Bridge Script
 *
 * Injected into pages that need direct Zero API access.
 * Provides a clean interface for web apps to communicate with Zero.
 *
 * Usage from page:
 *   const zero = await window.Zero.connect();
 *   const result = await zero.request('zero/echo', { test: 'data' });
 */

(function() {
  'use strict';

  // Protocol constants
  const ZERO_PROTOCOL = 'zero';
  const ZERO_VERSION = '1.10.0';

  /**
   * Zero Bridge - Web API for Zero Protocol
   */
  class ZeroBridge {
    constructor() {
      this.connected = false;
      this.identity = null;
      this.pendingRequests = new Map();
      this._setupListeners();
    }

    /**
     * Set up message listeners
     */
    _setupListeners() {
      window.addEventListener('message', (event) => {
        // Only accept messages from same origin
        if (event.origin !== window.location.origin) return;

        const message = event.data;
        if (!message || message.protocol !== ZERO_PROTOCOL) return;

        if (message.type === 'ZERO_RESPONSE') {
          this._handleResponse(message);
        } else if (message.type === 'ZERO_HANDSHAKE_RESPONSE') {
          this._handleHandshakeResponse(message);
        }
      });
    }

    /**
     * Handle response from extension
     */
    _handleResponse(message) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.result);
        }
      }
    }

    /**
     * Handle handshake response
     */
    _handleHandshakeResponse(message) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.verified) {
          this.connected = true;
          this.identity = message.result?.identity;
          pending.resolve(message.result);
        } else {
          pending.reject(new Error(message.error || 'Handshake failed'));
        }
      }
    }

    /**
     * Connect to Zero (perform handshake)
     */
    async connect() {
      const id = crypto.randomUUID();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(new Error('Connection timeout - is Zero extension installed?'));
        }, 10000);

        this.pendingRequests.set(id, {
          resolve: (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          }
        });

        window.postMessage({
          protocol: ZERO_PROTOCOL,
          type: 'ZERO_HANDSHAKE',
          id
        }, window.location.origin);
      });
    }

    /**
     * Send request to Zero
     */
    async request(method, params = {}) {
      if (!this.connected) {
        throw new Error('Not connected. Call connect() first.');
      }

      const id = crypto.randomUUID();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }, 30000);

        this.pendingRequests.set(id, {
          resolve: (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          }
        });

        window.postMessage({
          protocol: ZERO_PROTOCOL,
          type: 'ZERO_REQUEST',
          id,
          method,
          params
        }, window.location.origin);
      });
    }

    /**
     * Echo test
     */
    async echo(data) {
      return this.request('zero/echo', data);
    }

    /**
     * Get Zero capabilities
     */
    async capabilities() {
      return this.request('zero/capabilities');
    }

    /**
     * Introspect Zero state
     */
    async introspect() {
      return this.request('zero/introspect');
    }

    /**
     * Get page context
     */
    async pageContext() {
      return this.request('zero/page-context');
    }
  }

  // Create global instance
  const zeroBridge = new ZeroBridge();

  // Expose API
  window.ZeroBridge = zeroBridge;

  // Also expose as window.Zero if not already defined by content script
  if (!window.Zero) {
    window.Zero = {
      version: ZERO_VERSION,
      connect: () => zeroBridge.connect(),
      request: (method, params) => zeroBridge.request(method, params),
      echo: (data) => zeroBridge.echo(data),
      capabilities: () => zeroBridge.capabilities(),
      introspect: () => zeroBridge.introspect(),
      pageContext: () => zeroBridge.pageContext(),
      isConnected: () => zeroBridge.connected,
      getIdentity: () => zeroBridge.identity
    };
  }

  console.log('[Zero Bridge] Initialized. Use window.Zero.connect() to start.');

})();
