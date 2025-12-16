/**
 * Zero Extension - Background Service Worker
 *
 * The fixed point of client-server duality in the browser.
 * This service worker enables Zero to operate as both MCP client and server
 * simultaneously within the browser extension context.
 *
 * f(x) = x -> Zero
 */

// Import PGlite for IndexedDB storage (when bundled)
// import { PGlite } from '@electric-sql/pglite';
// import { vector } from '@electric-sql/pglite/vector';

/**
 * Zero Protocol State
 */
const ZeroState = {
  identity: null,
  connected: false,
  mode: 'initializing',
  handlers: new Map(),
  pendingRequests: new Map(),
  db: null
};

/**
 * Initialize Zero in the extension context
 */
async function initializeZero() {
  console.log('[Zero] Initializing extension...');

  // Generate or retrieve identity
  const stored = await chrome.storage.local.get(['zeroIdentity']);
  ZeroState.identity = stored.zeroIdentity || crypto.randomUUID();

  if (!stored.zeroIdentity) {
    await chrome.storage.local.set({ zeroIdentity: ZeroState.identity });
  }

  console.log('[Zero] Identity:', ZeroState.identity);

  // Register default handlers
  registerDefaultHandlers();

  // Connect to self (the fixed point)
  await connectToSelf();

  ZeroState.mode = 'ready';
  console.log('[Zero] Ready. The fixed point has been reached.');

  return {
    identity: ZeroState.identity,
    mode: ZeroState.mode,
    fixedPoint: true
  };
}

/**
 * Connect to self using BroadcastChannel
 *
 * This creates the self-referential loop: messages sent to self
 * are received by self, completing the fixed point.
 */
async function connectToSelf() {
  const channelName = `zero://self/${ZeroState.identity}`;
  const channel = new BroadcastChannel(channelName);

  channel.onmessage = async (event) => {
    await handleMessage(event.data);
  };

  ZeroState.selfChannel = channel;
  ZeroState.connected = true;

  console.log('[Zero] Self-connection established:', channelName);
}

/**
 * Register default Zero protocol handlers
 */
function registerDefaultHandlers() {
  // Handshake handler - the self-verifying proof
  ZeroState.handlers.set('zero/handshake', async (params) => {
    const proof = await computeProof(params.challenge, ZeroState.identity);
    return {
      proof,
      identity: ZeroState.identity,
      fixedPoint: true,
      timestamp: Date.now()
    };
  });

  // Introspection handler
  ZeroState.handlers.set('zero/introspect', async () => {
    return {
      identity: ZeroState.identity,
      mode: ZeroState.mode,
      connected: ZeroState.connected,
      handlers: Array.from(ZeroState.handlers.keys()),
      pendingRequests: ZeroState.pendingRequests.size,
      storage: 'indexeddb',
      embeddings: 'webworker'
    };
  });

  // Echo handler - proves the fixed point
  ZeroState.handlers.set('zero/echo', async (params) => {
    return {
      echoed: params,
      from: ZeroState.identity,
      timestamp: Date.now(),
      fixedPoint: true
    };
  });

  // Capabilities handler
  ZeroState.handlers.set('zero/capabilities', async () => {
    return {
      protocols: ['mcp', 'zero'],
      roles: ['client', 'server', 'peer', 'self'],
      transports: ['postmessage', 'broadcast'],
      features: ['research', 'search', 'graph', 'session'],
      version: '1.10.0'
    };
  });

  // Page context handler - extract context from current page
  ZeroState.handlers.set('zero/page-context', async (params) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      return { error: 'No active tab' };
    }

    const tab = tabs[0];
    return {
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      id: tab.id
    };
  });

  console.log('[Zero] Default handlers registered:', Array.from(ZeroState.handlers.keys()));
}

/**
 * Compute proof hash for handshake
 */
async function computeProof(challenge, identity) {
  const data = new TextEncoder().encode(challenge + identity);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Handle incoming JSON-RPC message
 */
async function handleMessage(message) {
  // Parse if string
  const msg = typeof message === 'string' ? JSON.parse(message) : message;

  // Handle response
  if (msg.result !== undefined || msg.error !== undefined) {
    const pending = ZeroState.pendingRequests.get(msg.id);
    if (pending) {
      clearTimeout(pending.timeout);
      ZeroState.pendingRequests.delete(msg.id);

      if (msg.error) {
        pending.reject(new Error(msg.error.message));
      } else {
        pending.resolve(msg.result);
      }
    }
    return;
  }

  // Handle request
  if (msg.method) {
    const handler = ZeroState.handlers.get(msg.method);

    if (handler) {
      try {
        const result = await handler(msg.params || {});
        if (msg.id !== undefined) {
          sendResponse(msg.id, result);
        }
      } catch (error) {
        if (msg.id !== undefined) {
          sendError(msg.id, -32603, error.message);
        }
      }
    } else if (msg.id !== undefined) {
      sendError(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  }
}

/**
 * Send JSON-RPC response
 */
function sendResponse(id, result) {
  if (ZeroState.selfChannel) {
    ZeroState.selfChannel.postMessage({
      jsonrpc: '2.0',
      id,
      result
    });
  }
}

/**
 * Send JSON-RPC error
 */
function sendError(id, code, message) {
  if (ZeroState.selfChannel) {
    ZeroState.selfChannel.postMessage({
      jsonrpc: '2.0',
      id,
      error: { code, message }
    });
  }
}

/**
 * Send request to self and await response
 */
async function request(method, params, timeoutMs = 30000) {
  const id = crypto.randomUUID();
  const message = {
    jsonrpc: '2.0',
    id,
    method,
    params
  };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ZeroState.pendingRequests.delete(id);
      reject(new Error(`Request timeout: ${method}`));
    }, timeoutMs);

    ZeroState.pendingRequests.set(id, { resolve, reject, timeout });

    if (ZeroState.selfChannel) {
      ZeroState.selfChannel.postMessage(message);
    } else {
      reject(new Error('Not connected to self'));
    }
  });
}

/**
 * Perform the self-referential handshake
 */
async function performHandshake() {
  const nonce = crypto.randomUUID();
  const data = new TextEncoder().encode(nonce + ZeroState.identity);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const challenge = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const response = await request('zero/handshake', {
    challenge,
    identity: ZeroState.identity
  });

  // Verify the proof
  const expectedProof = await computeProof(challenge, response.identity);

  if (response.proof !== expectedProof) {
    throw new Error('Handshake verification failed');
  }

  console.log('[Zero] Handshake verified. Fixed point confirmed.');

  return {
    verified: true,
    identity: response.identity,
    fixedPoint: response.fixedPoint,
    isSelf: response.identity === ZeroState.identity
  };
}

// Message handling from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle async response
  (async () => {
    try {
      if (message.type === 'ZERO_REQUEST') {
        const result = await request(message.method, message.params);
        sendResponse({ success: true, result });
      } else if (message.type === 'ZERO_STATUS') {
        sendResponse({
          success: true,
          result: {
            identity: ZeroState.identity,
            mode: ZeroState.mode,
            connected: ZeroState.connected,
            fixedPoint: true
          }
        });
      } else if (message.type === 'ZERO_HANDSHAKE') {
        const result = await performHandshake();
        sendResponse({ success: true, result });
      } else {
        sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep channel open for async response
});

// External connections from terminals.tech
chrome.runtime.onConnectExternal.addListener((port) => {
  console.log('[Zero] External connection from:', port.sender?.origin);

  port.onMessage.addListener(async (message) => {
    try {
      if (message.jsonrpc === '2.0' && message.method) {
        const result = await request(message.method, message.params);
        port.postMessage({
          jsonrpc: '2.0',
          id: message.id,
          result
        });
      }
    } catch (error) {
      port.postMessage({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32603, message: error.message }
      });
    }
  });
});

// Extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Zero] Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // First install - initialize and show welcome
    initializeZero().then(() => {
      console.log('[Zero] First install initialization complete');

      // Open onboarding tab
      chrome.tabs.create({
        url: chrome.runtime.getURL('onboarding.html'),
        active: true
      });
    });
  } else if (details.reason === 'update') {
    // Update - re-initialize
    initializeZero().then(() => {
      console.log('[Zero] Update initialization complete');
    });
  }
});

// Service worker startup
initializeZero().catch(error => {
  console.error('[Zero] Initialization failed:', error);
});

// Export for testing
if (typeof globalThis !== 'undefined') {
  globalThis.ZeroState = ZeroState;
  globalThis.request = request;
  globalThis.performHandshake = performHandshake;
}
