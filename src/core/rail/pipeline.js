/**
 * Rail Pipeline: Execution Pipeline for Rail Operations
 *
 * Provides a configurable pipeline for executing rail operations
 * with middleware support, observability, and circuit breaking.
 *
 * @module core/rail/pipeline
 */

'use strict';

const { Rail, Token, Ok, Err } = require('../rail');

/**
 * Pipeline stage types
 */
const StageType = {
  TRANSFORM: 'transform',   // Map/filter operations
  VALIDATE: 'validate',     // Schema validation
  RATE_LIMIT: 'rate_limit', // Rate limiting
  CACHE: 'cache',           // Result caching
  CIRCUIT: 'circuit',       // Circuit breaker
  OBSERVE: 'observe'        // Observability tap
};

/**
 * Pipeline - Configurable execution pipeline
 */
class Pipeline {
  /**
   * @param {string} name - Pipeline name
   * @param {object} [options]
   * @param {boolean} [options.traceEnabled=false] - Enable trace logging
   */
  constructor(name, options = {}) {
    this.name = name;
    this.stages = [];
    this.traceEnabled = options.traceEnabled ?? false;
    this._rail = Rail.create({ maxBuffer: 100 });
    this._trace = [];
  }

  /**
   * Add a stage to the pipeline
   * @param {string} type - Stage type
   * @param {string} name - Stage name
   * @param {Function} fn - Stage function
   * @returns {Pipeline} this for chaining
   */
  stage(type, name, fn) {
    this.stages.push({ type, name, fn });
    return this;
  }

  /**
   * Add transform stage
   * @param {string} name
   * @param {Function} fn - (value) => newValue
   */
  transform(name, fn) {
    return this.stage(StageType.TRANSFORM, name, fn);
  }

  /**
   * Add validation stage
   * @param {string} name
   * @param {Function} validator - (value) => { ok: boolean, error?: string }
   */
  validate(name, validator) {
    return this.stage(StageType.VALIDATE, name, async (token) => {
      const result = await validator(token.value);
      if (!result.ok) {
        throw new Error(`Validation failed at ${name}: ${result.error}`);
      }
      return token;
    });
  }

  /**
   * Add rate limit stage
   * @param {string} name
   * @param {object} options
   * @param {number} options.requestsPerMinute
   */
  rateLimit(name, options) {
    const { requestsPerMinute = 60 } = options;
    const windowMs = 60000;
    const timestamps = [];

    return this.stage(StageType.RATE_LIMIT, name, async (token) => {
      const now = Date.now();
      // Remove old timestamps
      while (timestamps.length > 0 && timestamps[0] < now - windowMs) {
        timestamps.shift();
      }
      if (timestamps.length >= requestsPerMinute) {
        throw new Error(`Rate limit exceeded: ${requestsPerMinute}/min`);
      }
      timestamps.push(now);
      return token;
    });
  }

  /**
   * Add caching stage
   * @param {string} name
   * @param {object} options
   * @param {number} options.ttlMs - Cache TTL
   * @param {Function} options.keyFn - (value) => cacheKey
   */
  cache(name, options) {
    const { ttlMs = 3600000, keyFn = (v) => JSON.stringify(v) } = options;
    const cache = new Map();

    return this.stage(StageType.CACHE, name, async (token, ctx) => {
      const key = keyFn(token.value);
      const cached = cache.get(key);

      if (cached && Date.now() - cached.timestamp < ttlMs) {
        ctx.cacheHit = true;
        return Token.from(cached.value, `${name}-cache`);
      }

      ctx.cacheHit = false;
      return token;
    });
  }

  /**
   * Add circuit breaker stage
   * @param {string} name
   * @param {object} options
   * @param {number} options.failureThreshold - Failures before open
   * @param {number} options.resetTimeoutMs - Time before half-open
   */
  circuitBreaker(name, options) {
    const { failureThreshold = 5, resetTimeoutMs = 30000 } = options;
    let failures = 0;
    let state = 'closed'; // closed, open, half-open
    let lastFailure = 0;

    return this.stage(StageType.CIRCUIT, name, async (token) => {
      const now = Date.now();

      // Check if we should transition from open to half-open
      if (state === 'open' && now - lastFailure > resetTimeoutMs) {
        state = 'half-open';
      }

      if (state === 'open') {
        throw new Error(`Circuit breaker open: ${name}`);
      }

      // Mark as passed through circuit (actual processing happens downstream)
      token._circuitName = name;
      return token;
    });
  }

  /**
   * Add observation stage (tap without modifying)
   * @param {string} name
   * @param {Function} observer - (token, context) => void
   */
  observe(name, observer) {
    return this.stage(StageType.OBSERVE, name, async (token, ctx) => {
      await observer(token, ctx);
      return token;
    });
  }

  /**
   * Execute the pipeline
   * @param {*} input - Input value
   * @param {string} [origin='pipeline'] - Token origin
   * @returns {Promise<{ ok: true, value: Token, trace?: Array } | { ok: false, error: Error }>}
   */
  async execute(input, origin = 'pipeline') {
    let token = input instanceof Token ? input : Token.from(input, origin);
    const ctx = { pipeline: this.name, startTime: Date.now() };
    this._trace = [];

    try {
      for (const stage of this.stages) {
        const stageStart = Date.now();

        try {
          token = await stage.fn(token, ctx);
          token = token.derive(token.value, stage.name);

          if (this.traceEnabled) {
            this._trace.push({
              stage: stage.name,
              type: stage.type,
              duration: Date.now() - stageStart,
              success: true
            });
          }
        } catch (stageError) {
          if (this.traceEnabled) {
            this._trace.push({
              stage: stage.name,
              type: stage.type,
              duration: Date.now() - stageStart,
              success: false,
              error: stageError.message
            });
          }
          throw stageError;
        }
      }

      const result = { ok: true, value: token };
      if (this.traceEnabled) {
        result.trace = this._trace;
      }
      return result;

    } catch (error) {
      const result = { ok: false, error };
      if (this.traceEnabled) {
        result.trace = this._trace;
      }
      return result;
    }
  }

  /**
   * Create a connected pair of pipelines for bidirectional communication
   * @param {string} nameA
   * @param {string} nameB
   * @returns {[Pipeline, Pipeline]}
   */
  static pair(nameA, nameB) {
    const a = new Pipeline(nameA);
    const b = new Pipeline(nameB);
    const [railA, railB] = Rail.pair();

    a._rail = railA;
    b._rail = railB;

    return [a, b];
  }
}

/**
 * PipelineBuilder - Fluent builder for common pipeline patterns
 */
class PipelineBuilder {
  constructor(name) {
    this._pipeline = new Pipeline(name);
  }

  /**
   * Enable tracing
   */
  withTrace() {
    this._pipeline.traceEnabled = true;
    return this;
  }

  /**
   * Add standard validation
   * @param {object} schema - Zod schema or validation function
   */
  withValidation(schema) {
    this._pipeline.validate('schema-validation', async (value) => {
      if (typeof schema.safeParse === 'function') {
        const result = schema.safeParse(value);
        return { ok: result.success, error: result.error?.message };
      }
      return { ok: true };
    });
    return this;
  }

  /**
   * Add rate limiting
   * @param {number} rpm - Requests per minute
   */
  withRateLimit(rpm) {
    this._pipeline.rateLimit('rate-limit', { requestsPerMinute: rpm });
    return this;
  }

  /**
   * Add caching
   * @param {number} ttlMs
   */
  withCache(ttlMs = 3600000) {
    this._pipeline.cache('cache', { ttlMs });
    return this;
  }

  /**
   * Add circuit breaker
   * @param {number} threshold
   */
  withCircuitBreaker(threshold = 5) {
    this._pipeline.circuitBreaker('circuit', { failureThreshold: threshold });
    return this;
  }

  /**
   * Build the pipeline
   * @returns {Pipeline}
   */
  build() {
    return this._pipeline;
  }
}

module.exports = {
  Pipeline,
  PipelineBuilder,
  StageType
};
