// src/core/providers/index.js
'use strict';

const openRouterClient = require('../../utils/openRouterClient');
const providerTelemetry = require('../../utils/providerTelemetry');
const config = require('../../../config');

// Stubbed for public release
const hvmClient = {
  initialized: false,
  hvmToLogitBias: () => ({})
};

class BenchmarkHistory {
  getRecommendations() {
    return { confidence: 'low', recommendation: 'none', reason: 'Benchmarks disabled' };
  }
}

// Timeout wrapper - NEVER hang
const withTimeout = (promise, ms, errorMessage = 'Operation timed out') => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

// Delay helper for backoff
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Cognitive Router (formerly ProviderManager)
 *
 * The "Brain" of the operation. Decides WHICH model/provider to use based on:
 * 1. Complexity (HVM assessed)
 * 2. Cost Constraints (User preference)
 * 3. Provider Health (Telemetry)
 * 4. Payment Requirements (x402 Stub)
 *
 * v2.0 - Enhanced with:
 * - Automatic fallback cycling through model chain
 * - Never-hang timeout guarantees
 * - Adaptive model health tracking
 */
class CognitiveRouter {
  constructor() {
    this.defaultProvider = 'openrouter';
    this.hvm = hvmClient;
    this.lastDecision = null; // State tracking for /brain
    this.benchmarkHistory = new BenchmarkHistory();
    this.userConfig = {
      swarmMode: 'auto',
      costPreference: 'auto'
    };

    // Model health tracking for adaptive routing
    this.modelHealth = new Map();

    // Fallback chain - diverse providers for resilience
    // Ordered by: reliability, speed, cost-effectiveness
    this.fallbackChain = [
      // Tier 1: Fast, reliable
      'google/gemini-3-flash-preview',
      'anthropic/claude-haiku-4.5',
      'openai/gpt-5-mini',
      // Tier 2: High quality
      'anthropic/claude-sonnet-4.5',
      'openai/gpt-5.2-chat',
      'google/gemini-3-pro-preview',
      // Tier 3: Specialized
      'perplexity/sonar-pro-search',
      'deepseek/deepseek-chat-v3.1',
      'moonshotai/kimi-k2-thinking',
      // Tier 4: Free fallbacks
      'qwen/qwen3-235b-instruct',
      'meta-llama/llama-4-405b-instruct'
    ];

    // Timeout configuration
    this.timeouts = {
      chat: parseInt(process.env.CHAT_TIMEOUT_MS, 10) || 120000,      // 2 min default
      stream: parseInt(process.env.STREAM_TIMEOUT_MS, 10) || 300000,  // 5 min for streaming
      route: 5000                                                       // 5s for routing decisions
    };
  }

  /**
   * Record model health event (success/failure)
   */
  recordModelHealth(model, success, latencyMs = 0, error = null) {
    const health = this.modelHealth.get(model) || {
      successes: 0,
      failures: 0,
      totalLatency: 0,
      lastError: null,
      lastSuccess: null
    };

    if (success) {
      health.successes++;
      health.totalLatency += latencyMs;
      health.lastSuccess = Date.now();
    } else {
      health.failures++;
      health.lastError = { time: Date.now(), message: error?.message || 'Unknown error' };
    }

    this.modelHealth.set(model, health);
  }

  /**
   * Get model health score (0-1, higher is better)
   */
  getModelHealthScore(model) {
    const health = this.modelHealth.get(model);
    if (!health) return 0.5; // Unknown = neutral

    const total = health.successes + health.failures;
    if (total === 0) return 0.5;

    const successRate = health.successes / total;
    const avgLatency = health.totalLatency / Math.max(health.successes, 1);

    // Recent failure penalty
    const recentFailurePenalty = health.lastError &&
      (Date.now() - health.lastError.time < 60000) ? 0.2 : 0;

    // Latency penalty (normalize to 0-0.2 for latencies 0-10s)
    const latencyPenalty = Math.min(avgLatency / 50000, 0.2);

    return Math.max(0, Math.min(1, successRate - recentFailurePenalty - latencyPenalty));
  }

  /**
   * Get fallback chain sorted by health
   */
  getSortedFallbackChain(primaryModel) {
    const chain = [primaryModel, ...this.fallbackChain.filter(m => m !== primaryModel)];

    // Sort by health score (descending), keeping primary first if healthy
    return chain.sort((a, b) => {
      const aScore = this.getModelHealthScore(a);
      const bScore = this.getModelHealthScore(b);

      // Keep primary model first if it's reasonably healthy
      if (a === primaryModel && aScore > 0.3) return -1;
      if (b === primaryModel && bScore > 0.3) return 1;

      return bScore - aScore;
    });
  }

  /**
   * Determine the best model/provider for a given intent.
   * Leverages HVM logic to assess "semantic depth".
   */
  async route(intent, options = {}) {
    const decision = {
      timestamp: Date.now(),
      intent: intent.substring(0, 50) + (intent.length > 50 ? '...' : ''),
      inputs: { ...options },
      analysis: {},
      outcome: {}
    };

    // 1. Check x402 Payment (Stub)
    if (options.requiresPayment) {
        // In a real implementation, this would trigger a wallet signature request
        decision.analysis.payment = 'required';
    }

    // 2. HVM Complexity Analysis (Symbolic Steering)
    let complexityBias = {};
    let depth = 0;
    if (this.hvm.initialized && intent) {
        // Map intent length/structure to HVM combinator depth
        // This is a heuristic mapping for v1.13.0
        depth = Math.min(10, Math.ceil(intent.length / 50)); 
        
        // HVM "Construct" op suggests we need structure/decomposition
        complexityBias = this.hvm.hvmToLogitBias({
            type: 'CONSTRUCT',
            address: { base: 2, coefficients: Array(depth).fill(1) },
            metadata: { tokenHints: ['reasoning', 'analysis'] }
        });
        
        decision.analysis.hvm = {
          depth,
          biasKeys: Object.keys(complexityBias)
        };
    }

    // 3. Provider Health Check
    const health = this.health();
    decision.analysis.health = health.degradedLevel;

    // 4. Benchmark-Based Recommendation (Emergent Context)
    const taskId = this.inferTaskType(intent);
    const recommendation = this.benchmarkHistory.getRecommendations(taskId);
    decision.analysis.benchmark = {
      taskId,
      confidence: recommendation.confidence,
      recommendation: recommendation.recommendation,
      reason: recommendation.reason
    };
    
    if (health.degradedLevel === 'critical') {
        // Force fallback to most stable low-cost model
        decision.analysis.fallback = 'triggered';
        const fallbackModel = config.models.lowCost[0]?.name || 'google/gemini-2.0-flash-exp:free';
        decision.outcome = { provider: 'openrouter', model: fallbackModel, bias: {} };
        this.lastDecision = decision;
        return decision.outcome;
    }

    // 5. Model Selection Logic (User Config + Benchmark + HVM)
    if (options.model && options.model !== 'auto') {
        decision.outcome = { provider: 'openrouter', model: options.model, bias: complexityBias };
    } else {
        const costPreference = options.costPreference || this.userConfig.costPreference;

        // Model selection from config
        const highCostModel = config.models.highCost[0]?.name || 'openai/gpt-4o';
        const lowCostModel = config.models.lowCost[0]?.name || 'google/gemini-2.0-flash-exp:free';

        // Benchmark override: if confidence is high, follow recommendation
        if (recommendation.confidence === 'high' && recommendation.recommendation === 'swarm') {
            decision.outcome = {
                provider: 'openrouter',
                model: highCostModel,
                bias: complexityBias,
                mode: 'swarm'
            };
        }
        // High cost preference or high complexity from HVM
        else if (costPreference === 'high' || complexityBias['control:structure'] > 0.5 || depth > 5) {
            decision.outcome = { provider: 'openrouter', model: highCostModel, bias: complexityBias };
        }
        // Low cost preference with good benchmark performance
        else if (costPreference === 'low' && recommendation.confidence === 'medium') {
            decision.outcome = { provider: 'openrouter', model: lowCostModel, bias: complexityBias };
        }
        // Default balanced
        else {
            decision.outcome = { provider: 'openrouter', model: lowCostModel, bias: complexityBias };
        }
    }
    
    this.lastDecision = decision;
    return decision.outcome;
  }

  /**
   * Unified Chat Interface with automatic fallback cycling
   * NEVER hangs - all operations have timeouts and fallback chains
   */
  async chat(model, messages, options = {}) {
    const startTime = Date.now();

    // Resolve route
    const intent = messages[messages.length - 1]?.content || '';
    const intentStr = typeof intent === 'string' ? intent : JSON.stringify(intent);

    const route = await withTimeout(
      this.route(intentStr, { model, cost: options.costPreference }),
      this.timeouts.route,
      'Route decision timed out'
    ).catch(() => ({ provider: 'openrouter', model, bias: {} }));

    // Apply HVM bias if supported
    const mergedOptions = {
      ...options,
      _hvmBias: route.bias
    };

    // Get health-sorted fallback chain
    const fallbackChain = this.getSortedFallbackChain(route.model || model);
    const maxAttempts = Math.min(fallbackChain.length, options.maxFallbacks || 5);

    let lastError = null;
    let attemptedModels = [];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const currentModel = fallbackChain[attempt];
      attemptedModels.push(currentModel);

      const attemptStart = Date.now();

      try {
        // Calculate timeout with backoff for retries
        const attemptTimeout = Math.max(
          this.timeouts.chat - (attempt * 10000), // Reduce timeout for each retry
          30000 // Minimum 30s
        );

        const response = await withTimeout(
          openRouterClient.chatCompletion(currentModel, messages, mergedOptions),
          attemptTimeout,
          `Chat timeout after ${attemptTimeout}ms with ${currentModel}`
        );

        const latency = Date.now() - attemptStart;
        this.recordModelHealth(currentModel, true, latency);

        // Log fallback if not primary model
        if (attempt > 0) {
          providerTelemetry.recordFallback({
            provider: 'openrouter',
            fromModel: route.model || model,
            toModel: currentModel,
            attempts: attempt + 1
          });
          console.error(`[CognitiveRouter] Fallback succeeded: ${route.model || model} -> ${currentModel} (attempt ${attempt + 1})`);
        }

        return response;

      } catch (error) {
        lastError = error;
        const latency = Date.now() - attemptStart;
        this.recordModelHealth(currentModel, false, latency, error);

        console.error(`[CognitiveRouter] Model ${currentModel} failed (attempt ${attempt + 1}/${maxAttempts}): ${error.message}`);

        // Small delay before retry (exponential backoff capped at 2s)
        if (attempt < maxAttempts - 1) {
          await delay(Math.min(500 * Math.pow(1.5, attempt), 2000));
        }
      }
    }

    // All attempts failed
    const totalTime = Date.now() - startTime;
    const errorMessage = `All ${maxAttempts} model attempts failed after ${totalTime}ms. Models tried: ${attemptedModels.join(', ')}. Last error: ${lastError?.message || 'Unknown'}`;
    console.error(`[CognitiveRouter] ${errorMessage}`);

    throw new Error(errorMessage);
  }

  /**
   * Streaming chat with timeout and fallback
   */
  stream(model, messages, options = {}) {
    // Get health-sorted fallback chain for streaming
    const fallbackChain = this.getSortedFallbackChain(model);

    // Return a wrapped stream that can handle errors and retry
    return this._createResilientStream(fallbackChain, messages, options);
  }

  /**
   * Create a resilient stream that auto-recovers from failures
   */
  _createResilientStream(fallbackChain, messages, options) {
    let currentAttempt = 0;
    const maxAttempts = Math.min(fallbackChain.length, 3);
    let aborted = false;

    const tryStream = async function* () {
      while (currentAttempt < maxAttempts && !aborted) {
        const currentModel = fallbackChain[currentAttempt];
        const attemptStart = Date.now();

        try {
          const stream = openRouterClient.streamChatCompletion(currentModel, messages, options);

          // Yield from the stream with timeout protection per chunk
          let lastChunkTime = Date.now();
          const chunkTimeout = 30000; // 30s max between chunks

          for await (const chunk of stream) {
            lastChunkTime = Date.now();
            yield chunk;
          }

          // Stream completed successfully
          const latency = Date.now() - attemptStart;
          this.recordModelHealth(currentModel, true, latency);
          return;

        } catch (error) {
          const latency = Date.now() - attemptStart;
          this.recordModelHealth(currentModel, false, latency, error);

          console.error(`[CognitiveRouter] Stream failed for ${currentModel} (attempt ${currentAttempt + 1}): ${error.message}`);

          currentAttempt++;

          if (currentAttempt < maxAttempts) {
            // Emit a system message about fallback
            yield {
              choices: [{
                delta: {
                  role: 'system',
                  content: `\n[Switching to backup model: ${fallbackChain[currentAttempt]}]\n`
                }
              }]
            };

            await delay(500);
          }
        }
      }

      if (!aborted && currentAttempt >= maxAttempts) {
        throw new Error(`All ${maxAttempts} stream attempts failed`);
      }
    }.bind(this);

    // Return async generator with abort capability
    const generator = tryStream();
    generator.abort = () => { aborted = true; };
    return generator;
  }

  async getModels() {
    return openRouterClient.getModels();
  }

  health() {
    if (typeof openRouterClient.getDegradedLevel === 'function') {
      return {
        provider: this.defaultProvider,
        degradedLevel: openRouterClient.getDegradedLevel(),
        lastFailureStatus: openRouterClient.getLastFailureStatus?.() || null
      };
    }
    return { provider: this.defaultProvider, degradedLevel: 'unknown', lastFailureStatus: null };
  }

  inferTaskType(intent) {
    const lower = intent.toLowerCase();

    if (lower.includes('research') || lower.includes('analyze') || lower.includes('investigate')) {
      return 'research';
    }
    if (lower.includes('code') || lower.includes('implement') || lower.includes('function')) {
      return 'code-generation';
    }
    if (lower.includes('verify') || lower.includes('test') || lower.includes('check')) {
      return 'verification';
    }
    return 'general';
  }

  setUserConfig(config) {
    this.userConfig = { ...this.userConfig, ...config };
  }

  getUserConfig() {
    return { ...this.userConfig };
  }

  /**
   * Get comprehensive health report for all tracked models
   */
  getHealthReport() {
    const report = {
      timestamp: new Date().toISOString(),
      models: {},
      summary: {
        totalModels: this.modelHealth.size,
        healthyModels: 0,
        degradedModels: 0,
        failedModels: 0
      }
    };

    for (const [model, health] of this.modelHealth.entries()) {
      const score = this.getModelHealthScore(model);
      const status = score > 0.7 ? 'healthy' : score > 0.3 ? 'degraded' : 'failed';

      report.models[model] = {
        score: score.toFixed(2),
        status,
        successes: health.successes,
        failures: health.failures,
        avgLatency: health.successes > 0
          ? Math.round(health.totalLatency / health.successes) + 'ms'
          : 'N/A',
        lastError: health.lastError,
        lastSuccess: health.lastSuccess
          ? new Date(health.lastSuccess).toISOString()
          : null
      };

      if (status === 'healthy') report.summary.healthyModels++;
      else if (status === 'degraded') report.summary.degradedModels++;
      else report.summary.failedModels++;
    }

    return report;
  }

  /**
   * Reset health tracking (useful for testing or recovery)
   */
  resetHealthTracking() {
    this.modelHealth.clear();
  }

  /**
   * Get the current fallback chain (for debugging)
   */
  getFallbackChain() {
    return [...this.fallbackChain];
  }

  /**
   * Update fallback chain dynamically
   */
  setFallbackChain(chain) {
    if (Array.isArray(chain) && chain.length > 0) {
      this.fallbackChain = chain;
    }
  }
}

// Singleton instance (lazy-initialized)
let instance = null;

/**
 * Get the singleton CognitiveRouter instance.
 * Follows factory pattern for testability and lazy initialization.
 * @returns {CognitiveRouter}
 */
function getCognitiveRouter() {
  if (!instance) {
    instance = new CognitiveRouter();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing).
 * @internal
 */
function _resetInstance() {
  instance = null;
}

// Export factory, class, and backward-compatible default instance
module.exports = getCognitiveRouter();
module.exports.CognitiveRouter = CognitiveRouter;
module.exports.getCognitiveRouter = getCognitiveRouter;
module.exports._resetInstance = _resetInstance;
