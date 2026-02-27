'use strict';

const State = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
});

class CircuitOpenError extends Error {
  constructor(name, nextRetryAt) {
    super(`Circuit "${name}" is OPEN. Retry after ${new Date(nextRetryAt).toISOString()}`);
    this.name = 'CircuitOpenError';
    this.circuitName = name;
    this.nextRetryAt = nextRetryAt;
  }
}

class CircuitBreaker {
  /**
   * @param {object} opts
   * @param {string} opts.name - Human-readable circuit name
   * @param {number} [opts.failureThreshold=3] - Failures before tripping OPEN
   * @param {number} [opts.resetTimeoutMs=60000] - Ms to wait before HALF_OPEN probe
   * @param {number} [opts.halfOpenMaxAttempts=1] - Max concurrent probes in HALF_OPEN
   */
  constructor({ name, failureThreshold = 3, resetTimeoutMs = 60000, halfOpenMaxAttempts = 1 } = {}) {
    if (!name || typeof name !== 'string') {
      throw new TypeError('CircuitBreaker requires a non-empty string name');
    }
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.halfOpenMaxAttempts = halfOpenMaxAttempts;

    this.state = State.CLOSED;
    this.failures = 0;
    this.lastFailureTime = 0;
    this.halfOpenAttempts = 0;
    this.stats = { totalCalls: 0, totalFailures: 0, totalSuccesses: 0, trips: 0 };
  }

  /**
   * Execute a function through the circuit breaker.
   * Rejects immediately with CircuitOpenError when OPEN.
   * Transitions OPEN -> HALF_OPEN after resetTimeoutMs.
   *
   * @param {Function} fn - Async or sync function to execute
   * @returns {Promise<*>} Result of fn()
   */
  async execute(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('execute() requires a function argument');
    }

    this.stats.totalCalls++;

    if (this.state === State.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = State.HALF_OPEN;
        this.halfOpenAttempts = 0;
      } else {
        throw new CircuitOpenError(this.name, this.lastFailureTime + this.resetTimeoutMs);
      }
    }

    if (this.state === State.HALF_OPEN) {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts > this.halfOpenMaxAttempts) {
        throw new CircuitOpenError(this.name, this.lastFailureTime + this.resetTimeoutMs);
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure(error);
      throw error;
    }
  }

  /** @private */
  _onSuccess() {
    this.stats.totalSuccesses++;
    this.failures = 0;
    if (this.state === State.HALF_OPEN) {
      this.state = State.CLOSED;
      this.halfOpenAttempts = 0;
    }
  }

  /** @private */
  _onFailure(error) {
    this.stats.totalFailures++;

    // Integrate with semantic error taxonomy if available
    let decision = 'warn';
    try {
      const { classify, shouldTripCircuit } = require('./errors');
      const classification = classify(error);
      const tripResult = shouldTripCircuit(classification);
      decision = tripResult?.decision || 'warn';
    } catch (_) {
      // errors module may not be loaded; default to threshold-based tripping
    }

    if (decision === 'ignore') return;

    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === State.HALF_OPEN) {
      // Any failure in HALF_OPEN immediately reopens
      this.state = State.OPEN;
      this.stats.trips++;
      return;
    }

    if (decision === 'escalate' || decision === 'trip' || this.failures >= this.failureThreshold) {
      this.state = State.OPEN;
      this.stats.trips++;
    }
  }

  /**
   * Return a snapshot of circuit state and statistics.
   * @returns {object}
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      nextRetryAt: this.state === State.OPEN ? this.lastFailureTime + this.resetTimeoutMs : null,
      stats: { ...this.stats }
    };
  }

  /**
   * Force-reset to CLOSED. Use for manual recovery or testing.
   */
  reset() {
    this.state = State.CLOSED;
    this.failures = 0;
    this.lastFailureTime = 0;
    this.halfOpenAttempts = 0;
  }
}

/**
 * Execute a function with retry and optional circuit breaker protection.
 *
 * @param {Function} fn - Function to execute
 * @param {object} [opts]
 * @param {number} [opts.maxRetries=3]
 * @param {number} [opts.baseDelayMs=1000]
 * @param {CircuitBreaker} [opts.circuit] - Optional circuit breaker instance
 * @returns {Promise<*>}
 */
async function withRetry(fn, { maxRetries = 3, baseDelayMs = 1000, circuit = null } = {}) {
  if (typeof fn !== 'function') {
    throw new TypeError('withRetry() requires a function argument');
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return circuit ? await circuit.execute(fn) : await fn();
    } catch (error) {
      // CircuitOpenError means fail-fast, no retry
      if (error instanceof CircuitOpenError) throw error;
      // Last attempt exhausted
      if (attempt === maxRetries) throw error;
      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

module.exports = { CircuitBreaker, CircuitOpenError, State, withRetry };
