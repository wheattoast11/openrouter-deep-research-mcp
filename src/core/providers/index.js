// src/core/providers/index.js
'use strict';

const openRouterClient = require('../../utils/openRouterClient');
const hvmClient = require('../../machines/hvmClient');
const providerTelemetry = require('../../utils/providerTelemetry');
const { BenchmarkHistory } = require('../../bench/history');
const config = require('../../../config');

/**
 * Cognitive Router (formerly ProviderManager)
 * 
 * The "Brain" of the operation. Decides WHICH model/provider to use based on:
 * 1. Complexity (HVM assessed)
 * 2. Cost Constraints (User preference)
 * 3. Provider Health (Telemetry)
 * 4. Payment Requirements (x402 Stub)
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
   * Unified Chat Interface
   */
  async chat(model, messages, options = {}) {
    // Resolve route
    const intent = messages[messages.length - 1]?.content || '';
    // Normalize complex content (e.g. array with images) to string for routing analysis
    const intentStr = typeof intent === 'string' ? intent : JSON.stringify(intent);
    
    const route = await this.route(intentStr, { model, cost: options.costPreference });

    // Apply HVM bias if supported by provider (OpenRouter supports logit_bias)
    // Note: Most chat models invoke this differently, but we pass it through options
    const mergedOptions = { 
        ...options,
        // In a real scenario, we'd map route.bias to actual logit_bias token IDs
        // For now, we attach it as metadata for the "Machine" layer to see
        _hvmBias: route.bias 
    };

    if (route.provider === 'openrouter') {
        return openRouterClient.chatCompletion(route.model, messages, mergedOptions);
    }
    
    // Future: Handle 'google', 'anthropic', 'local'
    throw new Error(`Provider ${route.provider} not implemented`);
  }

  stream(model, messages, options = {}) {
     // Stream routing is similar but synchronous for setup
     return openRouterClient.streamChatCompletion(model, messages, options);
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
