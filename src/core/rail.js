/**
 * Rail Protocol: Seamless Inter-Agent Communication
 *
 * A minimal, elegant abstraction for agent-to-agent communication.
 * "A Rail is to SignalBus what a Promise is to a callback"
 *
 * Philosophy:
 * - Isomorphic: Same API for in-process, socket, network
 * - Lazy: Rails only activate when data flows
 * - Observable: Every token knows its origin and transformation history
 * - Railway-Oriented: Errors flow on separate track (no exceptions)
 * - Backpressure-Native: Producers slow when consumers saturate
 *
 * @module core/rail
 */

'use strict';

const crypto = require('crypto');
const { deterministicStringify } = require('../utils/deterministic');

// =============================================================================
// RESULT: Railway-Oriented Error Handling (SDK-Compatible)
// =============================================================================
// NOTE: When @terminals-tech/core exports SDKResult, replace with:
// const { ok, err, isOk, isErr } = require('@terminals-tech/core');

/**
 * Success result - SDK-compatible factory
 * @template T
 * @param {T} value
 * @returns {{ ok: true, value: T }}
 */
const ok = (value) => Object.freeze({ ok: true, value });

/**
 * Error result - SDK-compatible factory
 * @template E
 * @param {E} error
 * @returns {{ ok: false, error: E }}
 */
const err = (error) => Object.freeze({ ok: false, error });

/**
 * Type guard for success result
 * @param {object} result
 * @returns {boolean}
 */
const isOk = (result) => result && result.ok === true;

/**
 * Type guard for error result
 * @param {object} result
 * @returns {boolean}
 */
const isErr = (result) => result && result.ok === false;

// Backward compatibility aliases (deprecated - use lowercase versions)
const Ok = ok;
const Err = err;

/**
 * Backpressure error - indicates rail buffer is saturated
 */
class BackpressureError extends Error {
  /**
   * @param {number} pressure - Current pressure (0-1)
   */
  constructor(pressure) {
    super(`Backpressure at ${(pressure * 100).toFixed(1)}%`);
    this.name = 'BackpressureError';
    this.pressure = pressure;
  }
}

/**
 * Rail closed error
 */
class RailClosedError extends Error {
  constructor() {
    super('Rail is closed');
    this.name = 'RailClosedError';
  }
}

// =============================================================================
// TOKEN: Unit of Data with Provenance
// =============================================================================

/**
 * Token - immutable unit of data flowing through rails
 * Every token knows its origin and transformation history
 */
class Token {
  /**
   * @param {*} value - Payload (Signal or raw data)
   * @param {string} origin - Who created this token
   */
  constructor(value, origin) {
    this.id = crypto.randomUUID();
    this.value = value;
    this.origin = origin;
    this.trace = [origin];
    this.timestamp = Date.now();
    Object.freeze(this);
  }

  /**
   * Layer address for AXON architecture (L3 = Mesh/Transport Layer)
   * Format: L{layer}:{type}:{id}
   * @returns {string} SDKAddress-compatible string
   */
  get address() {
    return `L3:token:${this.id}`;
  }

  /**
   * Derive a new token with transformed value, preserving lineage
   * @param {*} newValue - Transformed value
   * @param {string} transformer - Who transformed it
   * @returns {Token}
   */
  derive(newValue, transformer) {
    const derived = Object.create(Token.prototype);
    derived.id = crypto.randomUUID();
    derived.value = newValue;
    derived.origin = this.origin;
    derived.trace = [...this.trace, transformer];
    derived.timestamp = Date.now();
    return Object.freeze(derived);
  }

  /**
   * Create a token from a value
   * @param {*} value
   * @param {string} [origin='unknown']
   * @returns {Token}
   */
  static from(value, origin = 'unknown') {
    return new Token(value, origin);
  }

  /**
   * Calculate deterministic ShapeHash (L1 Isomorphism)
   */
  get shapeHash() {
    const canonical = deterministicStringify({
      value: this.value,
      origin: this.origin
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Serialize token for transport (MeshEvent compatible)
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      type: 'token',
      value: this.value,
      origin: this.origin,
      trace: this.trace,
      timestamp: this.timestamp,
      shapeHash: this.shapeHash
    };
  }

  /**
   * Convert to MeshEvent (L3 Isomorphism)
   */
  toMeshEvent() {
    return {
      id: this.id,
      type: `mesh:token:${this.origin}`,
      payload: this.value,
      timestamp: this.timestamp,
      metadata: {
        trace: this.trace,
        shapeHash: this.shapeHash,
        protocol: 'rail/1.0'
      }
    };
  }

  /**
   * Deserialize token from transport
   * @param {object} json
   * @returns {Token}
   */
  static fromJSON(json) {
    const token = Object.create(Token.prototype);
    token.id = json.id;
    token.value = json.value;
    token.origin = json.origin;
    token.trace = json.trace || [json.origin];
    token.timestamp = json.timestamp || Date.now();
    return Object.freeze(token);
  }

  /**
   * Returns introspection data for debugging and SDK tooling
   * @returns {object} Explanation object
   */
  explain() {
    return {
      id: this.id,
      layer: 'L3',
      type: 'Token',
      address: this.address,
      capabilities: ['derive', 'toJSON', 'toMeshEvent'],
      state: {
        origin: this.origin,
        traceLength: this.trace?.length ?? 0,
        valueType: typeof this.value,
        timestamp: this.timestamp,
        shapeHash: this.shapeHash
      }
    };
  }
}

// =============================================================================
// RAIL: Lazy Bidirectional Typed Channel
// =============================================================================

/**
 * Rail - lazy bidirectional channel with backpressure
 */
class Rail {
  /**
   * @param {object} [options]
   * @param {number} [options.maxBuffer=100] - Max buffer size before backpressure
   * @param {Function} [options.handshake] - Optional handshake function
   */
  constructor(options = {}) {
    this.id = crypto.randomUUID();
    this._buffer = [];
    this._maxBuffer = options.maxBuffer ?? 100;
    this._paused = false;
    this._closed = false;
    this._observers = [];
    this._waiters = [];
    this._stats = { sent: 0, received: 0, dropped: 0 };
    this._activated = false;
    this._handshake = options.handshake || null;
    this._peer = null;
  }

  /**
   * Layer address for AXON architecture (L3 = Mesh/Transport Layer)
   * Format: L{layer}:{type}:{id}
   * @returns {string} SDKAddress-compatible string
   */
  get address() {
    return `L3:rail:${this.id}`;
  }

  /**
   * Current backpressure (0-1)
   * @returns {number}
   */
  get pressure() {
    return this._buffer.length / this._maxBuffer;
  }

  /**
   * Rail statistics
   * @returns {{ sent: number, received: number, dropped: number, buffered: number }}
   */
  get stats() {
    return { ...this._stats, buffered: this._buffer.length };
  }

  /**
   * Send a token into the rail
   * @param {Token} token
   * @returns {{ ok: true, value: undefined } | { ok: false, error: Error }}
   */
  send(token) {
    if (this._closed) {
      return Err(new RailClosedError());
    }

    // Lazy activation
    if (!this._activated) this._activated = true;

    // Backpressure check
    if (this._buffer.length >= this._maxBuffer) {
      this._stats.dropped++;
      return Err(new BackpressureError(this.pressure));
    }

    // Notify observers (read-only tap)
    for (const obs of this._observers) {
      try {
        obs(token, this);
      } catch (e) {
        // Observers should not throw, but don't let them break the rail
      }
    }

    // If waiters exist and not paused, deliver directly
    if (this._waiters.length > 0 && !this._paused) {
      const waiter = this._waiters.shift();
      waiter.resolve({ value: token, done: false });
      this._stats.sent++;
      return Ok(undefined);
    }

    // Buffer the token
    this._buffer.push(token);
    this._stats.sent++;
    return Ok(undefined);
  }

  /**
   * Receive tokens as an async iterator
   * @returns {AsyncIterator<Token>}
   */
  receive() {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      async next() {
        if (self._closed && self._buffer.length === 0) {
          return { done: true };
        }

        // Lazy activation
        if (!self._activated) self._activated = true;

        // Wait if paused
        while (self._paused && !self._closed) {
          await new Promise(r => setTimeout(r, 10));
        }

        // Return buffered if available
        if (self._buffer.length > 0) {
          self._stats.received++;
          return { value: self._buffer.shift(), done: false };
        }

        // Wait for next token
        return new Promise((resolve) => {
          self._waiters.push({ resolve });
        });
      }
    };
  }

  /**
   * Pause consumption (builds backpressure)
   */
  pause() {
    this._paused = true;
  }

  /**
   * Resume consumption
   */
  resume() {
    this._paused = false;
    this._drainBuffer();
  }

  /**
   * Drain buffer to waiting receivers
   * @private
   */
  _drainBuffer() {
    while (this._buffer.length > 0 && this._waiters.length > 0 && !this._paused) {
      const token = this._buffer.shift();
      const waiter = this._waiters.shift();
      waiter.resolve({ value: token, done: false });
      this._stats.received++;
    }
  }

  /**
   * Close the rail
   * @returns {Promise<void>}
   */
  async close() {
    this._closed = true;
    // Signal all waiters that we're done
    for (const waiter of this._waiters) {
      waiter.resolve({ done: true });
    }
    this._waiters = [];
  }

  // ===========================================================================
  // COMPOSITION
  // ===========================================================================

  /**
   * Transform tokens flowing through the rail
   * @param {Function} fn - Transformation function
   * @returns {Rail}
   */
  map(fn) {
    const mapped = new Rail({ maxBuffer: this._maxBuffer });
    (async () => {
      for await (const token of this.receive()) {
        const newValue = fn(token.value);
        const derived = token.derive(newValue, fn.name || 'map');
        mapped.send(derived);
      }
      await mapped.close();
    })();
    return mapped;
  }

  /**
   * Filter tokens flowing through the rail
   * @param {Function} predicate
   * @returns {Rail}
   */
  filter(predicate) {
    const filtered = new Rail({ maxBuffer: this._maxBuffer });
    (async () => {
      for await (const token of this.receive()) {
        if (predicate(token.value)) {
          filtered.send(token);
        }
      }
      await filtered.close();
    })();
    return filtered;
  }

  /**
   * Merge two rails into one
   * @param {Rail} other
   * @returns {Rail}
   */
  merge(other) {
    const merged = new Rail({ maxBuffer: this._maxBuffer * 2 });
    const forward = async (source) => {
      for await (const token of source.receive()) {
        merged.send(token);
      }
    };
    Promise.all([forward(this), forward(other)]).then(() => merged.close());
    return merged;
  }

  // ===========================================================================
  // OBSERVATION
  // ===========================================================================

  /**
   * Attach a read-only observer
   * @param {Function} observer - (token, rail) => void
   * @returns {Function} Unsubscribe function
   */
  observe(observer) {
    this._observers.push(observer);
    return () => {
      const idx = this._observers.indexOf(observer);
      if (idx >= 0) this._observers.splice(idx, 1);
    };
  }

  /**
   * Returns introspection data for debugging and SDK tooling
   * @returns {object} Explanation object
   */
  explain() {
    return {
      id: this.id,
      layer: 'L3',
      type: 'Rail',
      address: this.address,
      capabilities: ['send', 'receive', 'map', 'filter', 'merge', 'pause', 'resume', 'observe'],
      state: {
        activated: this._activated,
        paused: this._paused,
        closed: this._closed,
        pressure: this.pressure,
        buffered: this._buffer.length,
        maxBuffer: this._maxBuffer,
        observerCount: this._observers.length,
        waiterCount: this._waiters.length,
        hasPeer: !!this._peer,
        stats: this.stats
      }
    };
  }

  // ===========================================================================
  // FACTORY METHODS
  // ===========================================================================

  /**
   * Create a new rail
   * @param {object} [options]
   * @returns {Rail}
   */
  static create(options) {
    return new Rail(options);
  }

  /**
   * Create a connected pair of rails (for in-process communication)
   * @param {object} [options]
   * @returns {[Rail, Rail]}
   */
  static pair(options = {}) {
    const a = new Rail(options);
    const b = new Rail(options);

    // Cross-connect: what goes into a comes out of b, and vice versa
    const originalSendA = a.send.bind(a);
    const originalSendB = b.send.bind(b);

    a.send = (token) => {
      // Notify a's observers
      for (const obs of a._observers) {
        try { obs(token, a); } catch (e) { /* ignore */ }
      }
      a._stats.sent++;
      // Deliver to b
      if (b._waiters.length > 0 && !b._paused) {
        const waiter = b._waiters.shift();
        waiter.resolve({ value: token, done: false });
        b._stats.received++;
        return Ok(undefined);
      }
      if (b._buffer.length >= b._maxBuffer) {
        a._stats.dropped++;
        return Err(new BackpressureError(b.pressure));
      }
      b._buffer.push(token);
      return Ok(undefined);
    };

    b.send = (token) => {
      for (const obs of b._observers) {
        try { obs(token, b); } catch (e) { /* ignore */ }
      }
      b._stats.sent++;
      if (a._waiters.length > 0 && !a._paused) {
        const waiter = a._waiters.shift();
        waiter.resolve({ value: token, done: false });
        a._stats.received++;
        return Ok(undefined);
      }
      if (a._buffer.length >= a._maxBuffer) {
        b._stats.dropped++;
        return Err(new BackpressureError(a.pressure));
      }
      a._buffer.push(token);
      return Ok(undefined);
    };

    a._peer = b;
    b._peer = a;

    return [a, b];
  }

  /**
   * Wrap a socket/stream in a Rail
   * @param {object} socket - Socket with on('data'), write(), on('close')
   * @param {object} [options]
   * @param {object} [options.codec] - { encode, decode } for framing
   * @returns {Rail}
   */
  static fromSocket(socket, options = {}) {
    const rail = new Rail(options);
    const codec = options.codec;

    socket.on('data', (data) => {
      const messages = codec?.decode ? codec.decode(data) : [data];
      for (const msg of messages) {
        if (msg && msg._error) continue; // Skip decode errors
        rail._buffer.push(Token.from(msg, 'socket'));
        rail._stats.received++;
        rail._drainBuffer();
      }
    });

    // Override send to write to socket
    const originalSend = rail.send.bind(rail);
    rail.send = (token) => {
      const result = originalSend(token);
      if (result.ok) {
        const encoded = codec?.encode ? codec.encode(token.value) : JSON.stringify(token.value);
        socket.write(encoded);
      }
      return result;
    };

    socket.on('close', () => rail.close());
    socket.on('error', () => rail.close());

    return rail;
  }

  /**
   * Bridge a SignalBus to a Rail (one-way: bus → rail)
   * @param {object} bus - SignalBus with on(type, handler)
   * @param {string} [type='*'] - Signal type to listen for
   * @returns {Rail}
   */
  static fromBus(bus, type = '*') {
    const rail = new Rail();
    bus.on(type, (signal) => {
      rail.send(Token.from(signal, signal.source || 'bus'));
    });
    return rail;
  }
}

// =============================================================================
// SWITCH: Dynamic Rail Routing
// =============================================================================

/**
 * Switch - routes tokens to rails based on predicates
 */
class Switch {
  constructor() {
    this._routes = new Map();
    this._defaultRail = null;
    this._predicates = [];
  }

  /**
   * Connect an endpoint to a rail
   * @param {string} endpoint - Endpoint identifier
   * @param {Rail} rail
   * @returns {Rail}
   */
  connect(endpoint, rail) {
    this._routes.set(endpoint, rail);
    return rail;
  }

  /**
   * Add a predicate-based route
   * @param {Function} predicate - (token) => boolean
   * @param {Rail} rail
   */
  addRoute(predicate, rail) {
    this._predicates.push({ predicate, rail });
  }

  /**
   * Route a token to the appropriate rail
   * @param {Token} token
   * @returns {Rail|null}
   */
  route(token) {
    // Check predicates first
    for (const { predicate, rail } of this._predicates) {
      if (predicate(token)) {
        return rail;
      }
    }

    // Check by origin
    const byOrigin = this._routes.get(token.origin);
    if (byOrigin) return byOrigin;

    // Check by value type
    if (token.value?.type) {
      const byType = this._routes.get(token.value.type);
      if (byType) return byType;
    }

    return this._defaultRail;
  }

  /**
   * Set the default rail for unrouted tokens
   * @param {Rail} rail
   */
  setDefault(rail) {
    this._defaultRail = rail;
  }

  /**
   * Disconnect an endpoint
   * @param {string} endpoint
   */
  disconnect(endpoint) {
    this._routes.delete(endpoint);
  }
}

// =============================================================================
// SIGNAL INTEGRATION
// =============================================================================

/**
 * Create a Token from a Signal (lazy-loaded to avoid circular deps)
 * @param {object} signal - Signal object
 * @param {string} [origin] - Override origin (defaults to signal.source)
 * @returns {Token}
 */
function tokenFromSignal(signal, origin) {
  return Token.from(signal, origin ?? signal.source ?? 'signal');
}

/**
 * Extract Signal from Token value (if wrapped)
 * @param {Token} token
 * @returns {object|null} Signal or null if not a signal
 */
function signalFromToken(token) {
  const value = token.value;
  if (value && typeof value === 'object' && 'type' in value && 'payload' in value) {
    return value;
  }
  return null;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // SDK-compatible Result types (preferred)
  ok,
  err,
  isOk,
  isErr,

  // Backward compatibility aliases (deprecated)
  Ok,
  Err,

  // Error types
  BackpressureError,
  RailClosedError,

  // Core types
  Token,
  Rail,
  Switch,

  // Signal integration
  tokenFromSignal,
  signalFromToken
};
