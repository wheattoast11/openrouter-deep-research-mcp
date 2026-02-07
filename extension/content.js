/**
 * Zero Extension - Content Script
 *
 * Injected into web pages to enable Zero protocol communication.
 * Uses postMessage bridge for secure cross-origin messaging.
 *
 * f(x) = x -> Zero in every page
 */

(function() {
  'use strict';

  // Avoid double injection
  if (window.__ZERO_CONTENT_SCRIPT_LOADED__) {
    return;
  }
  window.__ZERO_CONTENT_SCRIPT_LOADED__ = true;

  const ZERO_PROTOCOL_VERSION = '1.10.0';

  /**
   * Zero Content Script State
   */
  const ContentState = {
    connected: false,
    pageContext: null,
    pendingMessages: new Map()
  };

  /**
   * Initialize content script
   */
  function initialize() {
    console.log('[Zero Content] Initializing on:', window.location.href);

    // Capture page context
    ContentState.pageContext = {
      url: window.location.href,
      title: document.title,
      domain: window.location.hostname,
      timestamp: Date.now()
    };

    // Set up message listener for page <-> extension communication
    window.addEventListener('message', handlePageMessage);

    // Set up listener for extension messages
    chrome.runtime.onMessage.addListener(handleExtensionMessage);

    // Notify extension that content script is ready
    notifyReady();

    ContentState.connected = true;
    console.log('[Zero Content] Ready');
  }

  /**
   * Notify extension that content script is ready
   */
  function notifyReady() {
    try {
      chrome.runtime.sendMessage({
        type: 'ZERO_CONTENT_READY',
        pageContext: ContentState.pageContext
      });
    } catch (e) {
      // Extension context may be invalidated
      console.warn('[Zero Content] Could not notify extension:', e.message);
    }
  }

  /**
   * Handle messages from the page
   */
  function handlePageMessage(event) {
    // Only accept messages from same origin
    if (event.origin !== window.location.origin) {
      return;
    }

    // Only process Zero protocol messages
    const message = event.data;
    if (!message || message.protocol !== 'zero') {
      return;
    }

    console.log('[Zero Content] Page message:', message.type);

    // Forward to extension
    if (message.type === 'ZERO_REQUEST') {
      forwardToExtension(message);
    } else if (message.type === 'ZERO_HANDSHAKE') {
      performPageHandshake(message);
    }
  }

  /**
   * Handle messages from extension
   */
  function handleExtensionMessage(message, sender, sendResponse) {
    console.log('[Zero Content] Extension message:', message.type);

    if (message.type === 'ZERO_TO_PAGE') {
      // Forward to page
      window.postMessage({
        protocol: 'zero',
        type: 'ZERO_RESPONSE',
        id: message.id,
        result: message.result,
        error: message.error
      }, window.location.origin);
      sendResponse({ received: true });
    } else if (message.type === 'ZERO_EXTRACT_CONTEXT') {
      // Extract page context for research
      const context = extractPageContext();
      sendResponse({ success: true, context });
    } else if (message.type === 'ZERO_INJECT_OVERLAY') {
      // Inject Zero overlay UI
      injectOverlay(message.config);
      sendResponse({ success: true });
    }

    return true;
  }

  /**
   * Forward message to extension
   */
  async function forwardToExtension(message) {
    const id = message.id || crypto.randomUUID();

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ZERO_REQUEST',
        method: message.method,
        params: message.params
      });

      // Send response back to page
      window.postMessage({
        protocol: 'zero',
        type: 'ZERO_RESPONSE',
        id: id,
        result: response.result,
        error: response.error
      }, window.location.origin);

    } catch (error) {
      window.postMessage({
        protocol: 'zero',
        type: 'ZERO_RESPONSE',
        id: id,
        error: error.message
      }, window.location.origin);
    }
  }

  /**
   * Perform handshake between page and Zero
   */
  async function performPageHandshake(message) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ZERO_HANDSHAKE'
      });

      window.postMessage({
        protocol: 'zero',
        type: 'ZERO_HANDSHAKE_RESPONSE',
        id: message.id,
        result: response.result,
        verified: response.success
      }, window.location.origin);

    } catch (error) {
      window.postMessage({
        protocol: 'zero',
        type: 'ZERO_HANDSHAKE_RESPONSE',
        id: message.id,
        error: error.message,
        verified: false
      }, window.location.origin);
    }
  }

  /**
   * Extract rich context from the page for research
   */
  function extractPageContext() {
    const context = {
      url: window.location.href,
      title: document.title,
      domain: window.location.hostname,
      timestamp: Date.now(),
      meta: {},
      content: {}
    };

    // Extract meta tags
    const metaTags = document.querySelectorAll('meta');
    metaTags.forEach(meta => {
      const name = meta.getAttribute('name') || meta.getAttribute('property');
      const content = meta.getAttribute('content');
      if (name && content) {
        context.meta[name] = content;
      }
    });

    // Extract main content (heuristic)
    const mainContent = document.querySelector('main, article, [role="main"], .content, #content');
    if (mainContent) {
      context.content.main = mainContent.innerText.slice(0, 10000);
    }

    // Extract headings
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
    context.content.headings = headings.map(h => ({
      level: parseInt(h.tagName[1]),
      text: h.innerText.trim()
    })).slice(0, 20);

    // Extract links
    const links = Array.from(document.querySelectorAll('a[href]'));
    context.content.links = links
      .filter(a => a.href && !a.href.startsWith('javascript:'))
      .map(a => ({
        text: a.innerText.trim().slice(0, 100),
        href: a.href
      }))
      .slice(0, 50);

    // Extract structured data
    const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
    context.structuredData = [];
    jsonLd.forEach(script => {
      try {
        context.structuredData.push(JSON.parse(script.textContent));
      } catch (e) {
        // Invalid JSON-LD
      }
    });

    return context;
  }

  /**
   * Inject Zero overlay UI into the page
   */
  function injectOverlay(config = {}) {
    // Remove existing overlay
    const existing = document.getElementById('zero-overlay');
    if (existing) {
      existing.remove();
    }

    // Create overlay container
    const overlay = document.createElement('div');
    overlay.id = 'zero-overlay';
    overlay.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 360px;
      max-height: 500px;
      background: rgba(15, 15, 15, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #fff;
      backdrop-filter: blur(10px);
      display: ${config.visible !== false ? 'flex' : 'none'};
      flex-direction: column;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">Zero</span>
        <span style="font-size: 10px; opacity: 0.6;">f(x) = x</span>
      </div>
      <button id="zero-close" style="background: none; border: none; color: #fff; cursor: pointer; font-size: 18px; padding: 4px;">&times;</button>
    `;
    overlay.appendChild(header);

    // Content area
    const content = document.createElement('div');
    content.id = 'zero-content';
    content.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      font-size: 13px;
    `;
    content.innerHTML = `
      <div style="opacity: 0.7; text-align: center; padding: 20px;">
        <div style="margin-bottom: 8px;">The fixed point has been reached.</div>
        <div style="font-size: 11px; font-family: monospace;">identity: connecting...</div>
      </div>
    `;
    overlay.appendChild(content);

    // Input area
    const inputArea = document.createElement('div');
    inputArea.style.cssText = `
      padding: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    `;
    inputArea.innerHTML = `
      <input id="zero-input" type="text" placeholder="Ask Zero..." style="
        width: 100%;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        padding: 10px 12px;
        color: #fff;
        font-size: 13px;
        outline: none;
        box-sizing: border-box;
      " />
    `;
    overlay.appendChild(inputArea);

    document.body.appendChild(overlay);

    // Event handlers
    document.getElementById('zero-close').addEventListener('click', () => {
      overlay.style.display = 'none';
    });

    document.getElementById('zero-input').addEventListener('keypress', async (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        const query = e.target.value.trim();
        e.target.value = '';

        // Show loading state
        content.innerHTML = `
          <div style="opacity: 0.7; text-align: center; padding: 20px;">
            Processing...
          </div>
        `;

        // Send to Zero
        window.postMessage({
          protocol: 'zero',
          type: 'ZERO_REQUEST',
          id: crypto.randomUUID(),
          method: 'zero/echo',
          params: { query }
        }, window.location.origin);
      }
    });

    // Update status from extension
    chrome.runtime.sendMessage({ type: 'ZERO_STATUS' }, (response) => {
      if (response && response.success) {
        const statusEl = content.querySelector('div[style*="font-family: monospace"]');
        if (statusEl) {
          statusEl.textContent = `identity: ${response.result.identity.slice(0, 8)}...`;
        }
      }
    });

    console.log('[Zero Content] Overlay injected');
  }

  /**
   * Listen for keyboard shortcut to toggle overlay
   */
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Shift + Z
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      const overlay = document.getElementById('zero-overlay');
      if (overlay) {
        overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
      } else {
        injectOverlay({ visible: true });
      }
    }
  });

  /**
   * Expose Zero API to page
   */
  window.Zero = {
    version: ZERO_PROTOCOL_VERSION,

    async request(method, params) {
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();

        const handler = (event) => {
          if (event.data?.protocol === 'zero' && event.data?.type === 'ZERO_RESPONSE' && event.data?.id === id) {
            window.removeEventListener('message', handler);
            if (event.data.error) {
              reject(new Error(event.data.error));
            } else {
              resolve(event.data.result);
            }
          }
        };

        window.addEventListener('message', handler);

        window.postMessage({
          protocol: 'zero',
          type: 'ZERO_REQUEST',
          id,
          method,
          params
        }, window.location.origin);

        // Timeout
        setTimeout(() => {
          window.removeEventListener('message', handler);
          reject(new Error('Request timeout'));
        }, 30000);
      });
    },

    async handshake() {
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();

        const handler = (event) => {
          if (event.data?.protocol === 'zero' && event.data?.type === 'ZERO_HANDSHAKE_RESPONSE' && event.data?.id === id) {
            window.removeEventListener('message', handler);
            if (event.data.verified) {
              resolve(event.data.result);
            } else {
              reject(new Error(event.data.error || 'Handshake failed'));
            }
          }
        };

        window.addEventListener('message', handler);

        window.postMessage({
          protocol: 'zero',
          type: 'ZERO_HANDSHAKE',
          id
        }, window.location.origin);

        setTimeout(() => {
          window.removeEventListener('message', handler);
          reject(new Error('Handshake timeout'));
        }, 10000);
      });
    },

    showOverlay() {
      injectOverlay({ visible: true });
    },

    hideOverlay() {
      const overlay = document.getElementById('zero-overlay');
      if (overlay) {
        overlay.style.display = 'none';
      }
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
