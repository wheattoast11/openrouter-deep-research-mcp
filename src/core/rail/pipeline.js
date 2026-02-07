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
const errorTaxonomy = require('../errors');

// Lazy-loaded HVM module
let _hvmModule = null;

function getHVMModule() {
  if (!_hvmModule) {
    try {
      _hvmModule = require('../../machines/hvm');
    } catch (e) {
      _hvmModule = null;
    }
  }
  return _hvmModule;
}

/**
 * Pipeline stage types
 */
const StageType = {
  TRANSFORM: 'transform',   // Map/filter operations
  VALIDATE: 'validate',     // Schema validation
  RATE_LIMIT: 'rate_limit', // Rate limiting
  CACHE: 'cache',           // Result caching
  CIRCUIT: 'circuit',       // Circuit breaker
  OBSERVE: 'observe',       // Observability tap
  HVM_REDUCE: 'hvm_reduce'  // HVM interaction net reduction (L2 bridge)
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
   * Add circuit breaker stage with semantic error classification
   * @param {string} name
   * @param {object} options
   * @param {number} options.failureThreshold - Failures before open
   * @param {number} options.resetTimeoutMs - Time before half-open
   * @param {boolean} options.useSemanticClassification - Use error taxonomy for decisions
   */
  circuitBreaker(name, options = {}) {
    const { failureThreshold = 5, resetTimeoutMs = 120000, useSemanticClassification = true } = options;
    let failures = 0;
    let state = 'closed'; // closed, open, half-open
    let lastFailure = 0;
    let lastError = null;

    // Attach error handler for semantic classification
    const handleError = async (error) => {
      if (useSemanticClassification) {
        const semantic = errorTaxonomy.wrapError(error);
        await errorTaxonomy.recordTrace(semantic, { pipeline: this.name, stage: name });

        // Use semantic trip decision
        const decision = semantic.tripDecision;
        if (decision.decision === errorTaxonomy.TripDecision.TRIP) {
          state = 'open';
          lastFailure = Date.now();
          lastError = semantic;
        } else if (decision.decision === errorTaxonomy.TripDecision.ESCALATE) {
          // Escalate but don't trip - let higher layer handle
          state = 'half-open';
          lastFailure = Date.now();
        }
        // IGNORE and WARN don't affect circuit state
        return semantic;
      } else {
        // Legacy behavior: simple failure counting
        failures++;
        if (failures >= failureThreshold) {
          state = 'open';
          lastFailure = Date.now();
        }
      }
      return error;
    };

    return this.stage(StageType.CIRCUIT, name, async (token, ctx) => {
      const now = Date.now();

      // Check if we should transition from open to half-open
      if (state === 'open' && now - lastFailure > resetTimeoutMs) {
        state = 'half-open';
        failures = Math.floor(failures / 2); // Reduce failure count on reset
      }

      if (state === 'open') {
        const err = new Error(`Circuit breaker open: ${name}`);
        err.lastError = lastError;
        err.circuitState = { state, failures, resetTimeoutMs };
        throw err;
      }

      // Mark as passed through circuit with metadata
      token._circuitName = name;
      token._circuitState = state;

      // Attach error handler to context for downstream stages
      ctx._circuitErrorHandler = handleError;
      ctx._circuitState = { name, state, failures, threshold: failureThreshold };

      // On successful pass in half-open, close the circuit
      if (state === 'half-open') {
        state = 'closed';
        failures = 0;
      }

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
   * Add HVM reduction stage for optimal lambda reduction
   *
   * This stage bridges Rail tokens to HVM interaction nets,
   * enabling optimal parallel reduction of token values.
   *
   * @param {string} name - Stage name
   * @param {object} [options]
   * @param {number} [options.maxReductions=1000] - Maximum reduction steps
   * @param {number} [options.checkIntervalMs=50] - Interval to check convergence
   * @param {number} [options.crystallizationThreshold=0.7] - Early exit threshold
   * @param {boolean} [options.parallel=true] - Enable parallel reduction
   * @returns {Pipeline} this for chaining
   */
  hvmReduce(name, options = {}) {
    const {
      maxReductions = 1000,
      checkIntervalMs = 50,
      crystallizationThreshold = 0.7,
      parallel = true
    } = options;

    return this.stage(StageType.HVM_REDUCE, name, async (token, ctx) => {
      const hvm = getHVMModule();
      if (!hvm) {
        // HVM not available - pass through unchanged
        ctx.hvmSkipped = true;
        return token;
      }

      const { InteractionNet, Interpreter, Parallelizer } = hvm;

      // Convert token to HVM agent
      const agent = token.toHVMAgent();
      if (!agent) {
        ctx.hvmSkipped = true;
        return token;
      }

      // Create interaction net with the token's term
      const net = new InteractionNet();
      const nodeId = agent.addToNet(net);

      // Track reduction metrics
      const metrics = {
        reductions: 0,
        startTime: Date.now(),
        parallelGroups: 0,
        normalFormReached: false
      };

      try {
        if (parallel && Parallelizer) {
          // Parallel reduction using label analysis
          const parallelizer = new Parallelizer(net);

          while (metrics.reductions < maxReductions) {
            const groups = parallelizer.findParallelGroups();

            if (groups.length === 0 || net.isNormalForm()) {
              metrics.normalFormReached = true;
              break;
            }

            metrics.parallelGroups++;

            // Execute parallel reductions
            for (const group of groups) {
              for (const redex of group) {
                net.reduce(redex);
                metrics.reductions++;
              }
            }

            // Check for crystallization-based early exit
            if (token.value?.crystallization >= crystallizationThreshold) {
              metrics.earlyExit = 'crystallization';
              break;
            }

            // Yield to event loop periodically
            if (metrics.reductions % 100 === 0) {
              await new Promise(r => setTimeout(r, 0));
            }
          }
        } else {
          // Sequential reduction using interpreter
          const interpreter = new Interpreter();

          while (metrics.reductions < maxReductions) {
            if (!interpreter.step(net)) {
              metrics.normalFormReached = true;
              break;
            }

            metrics.reductions++;

            // Check for crystallization
            if (token.value?.crystallization >= crystallizationThreshold) {
              metrics.earlyExit = 'crystallization';
              break;
            }
          }
        }

        // Extract result from normalized net
        const resultTerm = net.getRoot();
        const reducedValue = {
          ...token.value,
          hvmReduced: true,
          hvmTerm: resultTerm,
          hvmMetrics: {
            reductions: metrics.reductions,
            parallelGroups: metrics.parallelGroups,
            normalForm: metrics.normalFormReached,
            earlyExit: metrics.earlyExit,
            durationMs: Date.now() - metrics.startTime
          }
        };

        // Store metrics in context for observability
        ctx.hvmMetrics = metrics;
        ctx.hvmNormalForm = metrics.normalFormReached;

        return token.derive(reducedValue, `${name}-hvm`);

      } catch (reduceError) {
        // HVM reduction failed - log and pass through
        ctx.hvmError = reduceError.message;
        ctx.hvmMetrics = metrics;
        return token;
      }
    });
  }

  /**
   * Add HVM reduction with crystallization-aware termination
   * Optimized for research consensus where crystallization indicates convergence
   *
   * @param {string} name - Stage name
   * @param {object} [options]
   * @param {number} [options.crystallizationThreshold=0.6] - Threshold for early exit
   * @returns {Pipeline} this for chaining
   */
  hvmReduceWithCrystallization(name, options = {}) {
    return this.hvmReduce(name, {
      ...options,
      crystallizationThreshold: options.crystallizationThreshold ?? 0.6,
      checkIntervalMs: options.checkIntervalMs ?? 100,
      maxReductions: options.maxReductions ?? 5000
    });
  }

  /**
   * Execute the pipeline
   * @param {*} input - Input value
   * @param {string} [origin='pipeline'] - Token origin
   * @returns {Promise<{ ok: true, value: Token, trace?: Array } | { ok: false, error: Error, semantic?: object }>}
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
              success: true,
              circuitState: ctx._circuitState
            });
          }
        } catch (stageError) {
          // If we have a circuit error handler, use it for semantic classification
          if (ctx._circuitErrorHandler) {
            await ctx._circuitErrorHandler(stageError);
          }

          if (this.traceEnabled) {
            this._trace.push({
              stage: stage.name,
              type: stage.type,
              duration: Date.now() - stageStart,
              success: false,
              error: stageError.message,
              circuitState: ctx._circuitState
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
      // Wrap error with semantic classification for return
      const semantic = errorTaxonomy.wrapError(error);
      const result = { ok: false, error, semantic: semantic.toJSON() };
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
   * Add HVM reduction stage
   * @param {object} [options]
   * @param {number} [options.maxReductions=1000] - Maximum reduction steps
   * @param {boolean} [options.parallel=true] - Enable parallel reduction
   */
  withHVMReduce(options = {}) {
    this._pipeline.hvmReduce('hvm-reduce', options);
    return this;
  }

  /**
   * Add HVM reduction optimized for consensus/crystallization
   * @param {number} [threshold=0.6] - Crystallization threshold for early exit
   */
  withHVMCrystallization(threshold = 0.6) {
    this._pipeline.hvmReduceWithCrystallization('hvm-crystallization', {
      crystallizationThreshold: threshold
    });
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
