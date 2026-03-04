/**
 * Zero URI Scheme Handler
 *
 * The zero:// URI scheme enables self-referential addressing:
 *
 *   zero://self           → Connect to self (loopback, the fixed point)
 *   zero://peer/{id}      → Connect to a known peer by identity
 *   zero://discover       → Broadcast discovery request
 *   zero://fork/{session} → Fork into a parallel timeline
 *   zero://merge/{a}/{b}  → Merge two timelines
 *   zero://replay/{ts}    → Replay from timestamp
 *
 * The scheme is designed to be protocol-agnostic: the same URI works
 * regardless of whether the underlying transport is stdio, HTTP, WebSocket,
 * postMessage, or BroadcastChannel.
 */

'use strict';

/**
 * Zero URI types
 */
const UriType = {
  SELF: 'self',
  PEER: 'peer',
  DISCOVER: 'discover',
  FORK: 'fork',
  MERGE: 'merge',
  REPLAY: 'replay',
  RESOURCE: 'resource',
  UNKNOWN: 'unknown',
};

/**
 * Parsed Zero URI structure
 */
class ZeroUri {
  constructor(raw) {
    this.raw = raw;
    this.type = UriType.UNKNOWN;
    this.id = null;
    this.params = {};
    this.path = [];

    if (raw) {
      this._parse(raw);
    }
  }

  /**
   * Parse a zero:// URI string
   */
  _parse(uri) {
    // Validate scheme
    if (!uri.startsWith('zero://')) {
      throw new ZeroUriError(`Invalid Zero URI: must start with zero:// - got "${uri}"`);
    }

    // Remove scheme
    const path = uri.slice(7);

    // Handle empty path (zero://)
    if (!path) {
      this.type = UriType.SELF;
      return;
    }

    // Split path and query
    const [pathPart, queryPart] = path.split('?');
    const segments = pathPart.split('/').filter(Boolean);

    if (segments.length === 0) {
      this.type = UriType.SELF;
      return;
    }

    // Parse first segment as type
    const typeSegment = segments[0].toLowerCase();

    switch (typeSegment) {
      case 'self':
        this.type = UriType.SELF;
        // Optional identity after self: zero://self/my-identity
        if (segments[1]) {
          this.id = segments.slice(1).join('/');
        }
        break;

      case 'peer':
        this.type = UriType.PEER;
        if (!segments[1]) {
          throw new ZeroUriError('zero://peer requires an identity: zero://peer/{id}');
        }
        this.id = segments.slice(1).join('/');
        break;

      case 'discover':
        this.type = UriType.DISCOVER;
        // Optional scope: zero://discover/local or zero://discover/global
        if (segments[1]) {
          this.params.scope = segments[1];
        }
        break;

      case 'fork':
        this.type = UriType.FORK;
        if (!segments[1]) {
          throw new ZeroUriError('zero://fork requires a session ID: zero://fork/{session}');
        }
        this.id = segments[1];
        // Optional new identity: zero://fork/{session}/{newId}
        if (segments[2]) {
          this.params.newId = segments[2];
        }
        break;

      case 'merge':
        this.type = UriType.MERGE;
        if (!segments[1] || !segments[2]) {
          throw new ZeroUriError('zero://merge requires two IDs: zero://merge/{a}/{b}');
        }
        this.params.a = segments[1];
        this.params.b = segments[2];
        break;

      case 'replay':
        this.type = UriType.REPLAY;
        if (!segments[1]) {
          throw new ZeroUriError('zero://replay requires a timestamp: zero://replay/{timestamp}');
        }
        this.params.timestamp = segments[1];
        // Validate timestamp format (ISO 8601 or epoch)
        if (!this._isValidTimestamp(this.params.timestamp)) {
          throw new ZeroUriError(`Invalid timestamp: ${this.params.timestamp}`);
        }
        break;

      default:
        // Treat as resource path: zero://resource/path/to/thing
        this.type = UriType.RESOURCE;
        this.path = segments;
        this.id = segments.join('/');
    }

    // Parse query parameters
    if (queryPart) {
      this._parseQuery(queryPart);
    }
  }

  /**
   * Parse query string into params
   */
  _parseQuery(query) {
    const pairs = query.split('&');
    for (const pair of pairs) {
      const [key, value] = pair.split('=').map(decodeURIComponent);
      this.params[key] = value || true;
    }
  }

  /**
   * Validate timestamp format
   */
  _isValidTimestamp(ts) {
    // Accept ISO 8601 or epoch milliseconds
    if (/^\d+$/.test(ts)) {
      return true; // Epoch milliseconds
    }
    const date = new Date(ts);
    return !isNaN(date.getTime());
  }

  /**
   * Check if this URI represents the fixed point (self-connection)
   */
  isSelf() {
    return this.type === UriType.SELF;
  }

  /**
   * Check if this URI is a peer connection
   */
  isPeer() {
    return this.type === UriType.PEER;
  }

  /**
   * Check if this URI requires network discovery
   */
  requiresDiscovery() {
    return this.type === UriType.DISCOVER || this.type === UriType.PEER;
  }

  /**
   * Check if this URI represents a temporal operation
   */
  isTemporal() {
    return this.type === UriType.FORK || this.type === UriType.MERGE || this.type === UriType.REPLAY;
  }

  /**
   * Convert back to string
   */
  toString() {
    let uri = 'zero://';

    switch (this.type) {
      case UriType.SELF:
        uri += 'self';
        if (this.id) uri += `/${this.id}`;
        break;

      case UriType.PEER:
        uri += `peer/${this.id}`;
        break;

      case UriType.DISCOVER:
        uri += 'discover';
        if (this.params.scope) uri += `/${this.params.scope}`;
        break;

      case UriType.FORK:
        uri += `fork/${this.id}`;
        if (this.params.newId) uri += `/${this.params.newId}`;
        break;

      case UriType.MERGE:
        uri += `merge/${this.params.a}/${this.params.b}`;
        break;

      case UriType.REPLAY:
        uri += `replay/${this.params.timestamp}`;
        break;

      case UriType.RESOURCE:
        uri += this.path.join('/');
        break;

      default:
        return this.raw;
    }

    // Add remaining query params
    const queryKeys = Object.keys(this.params).filter(
      (k) => !['scope', 'newId', 'a', 'b', 'timestamp'].includes(k)
    );
    if (queryKeys.length > 0) {
      const query = queryKeys
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(this.params[k])}`)
        .join('&');
      uri += `?${query}`;
    }

    return uri;
  }

  /**
   * Create a JSON representation
   */
  toJSON() {
    return {
      raw: this.raw,
      type: this.type,
      id: this.id,
      params: this.params,
      path: this.path,
    };
  }
}

/**
 * Custom error class for Zero URI errors
 */
class ZeroUriError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ZeroUriError';
  }
}

/**
 * URI Factory Functions
 */

/**
 * Create a self URI
 * @param {string} identity - Optional identity
 */
function self(identity) {
  return new ZeroUri(identity ? `zero://self/${identity}` : 'zero://self');
}

/**
 * Create a peer URI
 * @param {string} id - Peer identity
 */
function peer(id) {
  if (!id) throw new ZeroUriError('Peer ID required');
  return new ZeroUri(`zero://peer/${id}`);
}

/**
 * Create a discover URI
 * @param {string} scope - Optional scope (local, global)
 */
function discover(scope) {
  return new ZeroUri(scope ? `zero://discover/${scope}` : 'zero://discover');
}

/**
 * Create a fork URI
 * @param {string} session - Session to fork
 * @param {string} newId - Optional new identity
 */
function fork(session, newId) {
  if (!session) throw new ZeroUriError('Session ID required');
  const uri = newId ? `zero://fork/${session}/${newId}` : `zero://fork/${session}`;
  return new ZeroUri(uri);
}

/**
 * Create a merge URI
 * @param {string} a - First identity
 * @param {string} b - Second identity
 */
function merge(a, b) {
  if (!a || !b) throw new ZeroUriError('Both IDs required for merge');
  return new ZeroUri(`zero://merge/${a}/${b}`);
}

/**
 * Create a replay URI
 * @param {string|number|Date} timestamp - Timestamp to replay from
 */
function replay(timestamp) {
  if (!timestamp) throw new ZeroUriError('Timestamp required');
  const ts = timestamp instanceof Date ? timestamp.toISOString() : String(timestamp);
  return new ZeroUri(`zero://replay/${ts}`);
}

/**
 * Parse a URI string
 * @param {string} uri - URI string to parse
 */
function parse(uri) {
  return new ZeroUri(uri);
}

/**
 * Check if a string is a valid Zero URI
 * @param {string} uri - String to check
 */
function isZeroUri(uri) {
  if (typeof uri !== 'string') return false;
  if (!uri.startsWith('zero://')) return false;
  try {
    new ZeroUri(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * URI Router - Routes Zero URIs to handlers
 */
class ZeroUriRouter {
  constructor() {
    this.handlers = new Map();
  }

  /**
   * Register a handler for a URI type
   * @param {string} type - URI type (self, peer, discover, fork, merge, replay)
   * @param {Function} handler - Handler function(uri) => Promise
   */
  on(type, handler) {
    this.handlers.set(type, handler);
  }

  /**
   * Route a URI to its handler
   * @param {string|ZeroUri} uri - URI to route
   */
  async route(uri) {
    const parsed = uri instanceof ZeroUri ? uri : new ZeroUri(uri);
    const handler = this.handlers.get(parsed.type);

    if (!handler) {
      throw new ZeroUriError(`No handler for URI type: ${parsed.type}`);
    }

    return handler(parsed);
  }

  /**
   * Check if a handler exists for a URI type
   * @param {string} type - URI type
   */
  has(type) {
    return this.handlers.has(type);
  }
}

module.exports = {
  ZeroUri,
  ZeroUriError,
  ZeroUriRouter,
  UriType,
  // Factory functions
  self,
  peer,
  discover,
  fork,
  merge,
  replay,
  parse,
  isZeroUri,
};
