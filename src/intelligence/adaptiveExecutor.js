/**
 * Adaptive Executor - Intelligent Policy Selection & Execution
 * 
 * Scales compute based on confidence and complexity.
 * The system knows when it needs to think harder.
 * 
 * @module intelligence/adaptiveExecutor
 */

// Polyfill: @terminals-tech/core@0.1.1 doesn't export BoundedExecutor yet
const { BoundedExecutor } = require('../utils/BoundedExecutor');
const config = require('../../config');

class AdaptiveExecutor {
  constructor(options = {}) {
    this.maxParallelism = options.maxParallelism || 10;
    this.executor = new BoundedExecutor({ maxConcurrency: this.maxParallelism });
    this.costTracking = { total: 0, byPolicy: {} };
  }
  
  /**
   * Select optimal execution policy
   * 
   * @param {Object} intent - Parsed query intent
   * @param {Object} memory - Results from living memory
   * @param {Object} context - User context and constraints
   * @returns {Promise<ExecutionPolicy>}
   */
  async select(intent, memory, context) {
    const complexity = intent.complexity || 0.5;
    const confidence = memory.confidence || 0;
    const budget = context.budget || { dollars: 2.50, tokens: 100000 };
    const privacy = context.privacy || 'hybrid';
    const userPolicy = context.policy || 'auto';
    
    // Override: user explicitly selected a policy
    if (userPolicy !== 'auto') {
      return this.getPolicyByName(userPolicy, intent, context);
    }
    
    // Strategy 1: Quick Lookup (0ms, $0)
    // High confidence cache hit, simple query
    if (confidence > 0.90 && complexity < 0.3 && memory.cachedAnswer) {
      return {
        type: 'quick-lookup',
        strategy: 'Return cached answer with freshness check',
        agents: 0,
        models: [],
        estimatedCost: 0,
        estimatedTime: 50,
        estimatedTokens: 0,
        confidence: confidence,
        reasoning: `Cache hit (${Math.round(confidence * 100)}% conf, age ${Math.round(memory.cachedAnswer.age)}h)`
      };
    }
    
    // Strategy 2: Local Browser Inference (<500ms, $0)
    // Privacy mode or simple query with local inference enabled
    if (privacy === 'local-only' || (complexity < 0.4 && config.localInference?.enabled)) {
      return {
        type: 'local-browser-inference',
        strategy: 'Use local browser model for quick inference',
        agents: 1,
        models: [config.localInference?.defaultModel || 'qwen3-4b', 'utopia-atomic'],
        estimatedCost: 0,
        estimatedTime: 500,
        estimatedTokens: 2000,
        confidence: 0.65,
        device: config.localInference?.device || 'webgpu',
        reasoning: `Local inference (privacy: ${privacy}, complexity: ${Math.round(complexity * 100)}%)`
      };
    }
    
    // Strategy 2b: Local-Only Fallback (when local inference available but not forced)
    // Simple queries that don't need cloud resources
    if (complexity < 0.3 && config.localInference?.enabled) {
      return {
        type: 'local-browser-inference',
        strategy: 'Use local browser model for simple query',
        agents: 1,
        models: [config.localInference?.defaultModel || 'qwen3-4b'],
        estimatedCost: 0,
        estimatedTime: 800,
        estimatedTokens: 1500,
        confidence: 0.60,
        device: config.localInference?.device || 'webgpu',
        reasoning: `Simple query, use local model (complexity: ${Math.round(complexity * 100)}%)`
      };
    }
    
    // Strategy 3: Hybrid Fast (~2s, $0.01-0.03)
    // Moderate complexity, balanced mode
    if (complexity < 0.6 && budget.dollars > 0.02) {
      return {
        type: 'hybrid-fast',
        strategy: 'Local model for parsing + 1-2 cloud agents for depth',
        agents: 2,
        models: ['local', 'gemini-flash', 'grok-beta'],
        estimatedCost: 0.02,
        estimatedTime: 2000,
        estimatedTokens: 8000,
        confidence: 0.75,
        reasoning: `Balanced approach (complexity: ${Math.round(complexity * 100)}%, budget OK)`
      };
    }
    
    // Strategy 4: Cloud Parallel (~5s, $0.10-0.20)
    // High complexity, needs multiple perspectives
    if (complexity < 0.8 && budget.dollars > 0.10) {
      const agentCount = Math.min(5, Math.ceil(complexity * 7));
      return {
        type: 'cloud-parallel',
        strategy: `Parallel ensemble with ${agentCount} specialized agents`,
        agents: agentCount,
        models: [
          'anthropic/claude-3.5-sonnet',
          'google/gemini-pro-1.5',
          'openai/gpt-4o',
          'perplexity/llama-3.1-sonar-huge-128k-online',
          'meta-llama/llama-3.3-70b-instruct'
        ].slice(0, agentCount),
        estimatedCost: 0.15,
        estimatedTime: 5000,
        estimatedTokens: 40000,
        confidence: 0.85,
        reasoning: `High complexity (${Math.round(complexity * 100)}%) needs diverse perspectives`
      };
    }
    
    // Strategy 5: Deep Exploration (~15-30s, $0.30-0.60)
    // Maximum complexity, iterative hypothesis refinement
    if (budget.dollars > 0.30) {
      return {
        type: 'deep-exploration',
        strategy: 'Iterative hypothesis generation with reasoning models',
        agents: 10,
        models: [
          'deepseek/deepseek-r1',
          'anthropic/claude-3.5-sonnet',
          'google/gemini-pro-1.5-thinking',
          'openai/o1',
          'perplexity/llama-3.1-sonar-huge-128k-online'
        ],
        iterations: 3,
        estimatedCost: 0.50,
        estimatedTime: 15000,
        estimatedTokens: 100000,
        confidence: 0.92,
        reasoning: `Maximum depth for complex query (complexity: ${Math.round(complexity * 100)}%)`
      };
    }
    
    // Fallback: Budget-constrained best-effort
    return {
      type: 'best-effort',
      strategy: 'Single cloud model within budget',
      agents: 1,
      models: ['gemini-flash'],
      estimatedCost: budget.dollars,
      estimatedTime: 3000,
      estimatedTokens: 5000,
      confidence: 0.60,
      reasoning: `Budget limited (${budget.dollars} remaining)`
    };
  }
  
  /**
   * Get policy by explicit name
   */
  getPolicyByName(name, intent, context) {
    const policies = {
      fast: {
        type: 'hybrid-fast',
        agents: 1,
        models: ['local', 'gemini-flash'],
        estimatedCost: 0.01,
        estimatedTime: 1000
      },
      comprehensive: {
        type: 'cloud-parallel',
        agents: 5,
        models: ['claude-3.5-sonnet', 'gemini-pro', 'gpt-4o'],
        estimatedCost: 0.15,
        estimatedTime: 5000
      },
      deep: {
        type: 'deep-exploration',
        agents: 10,
        iterations: 3,
        estimatedCost: 0.50,
        estimatedTime: 15000
      }
    };
    
    return policies[name] || policies.fast;
  }
  
  /**
   * Execute policy with adaptive compute allocation
   * 
   * @param {ExecutionPolicy} policy - Selected policy
   * @param {Object} session - Research session
   * @returns {AsyncIterator<Insight>} Stream of insights
   */
  async *execute(policy, session) {
    const startTime = Date.now();
    
    try {
      switch (policy.type) {
        case 'quick-lookup':
          yield* this.quickLookup(policy, session);
          break;
        
        case 'local-only':
          yield* this.localOnly(policy, session);
          break;
        
        case 'hybrid-fast':
          yield* this.hybridFast(policy, session);
          break;
        
        case 'cloud-parallel':
          yield* this.cloudParallel(policy, session);
          break;
        
        case 'deep-exploration':
          yield* this.deepExploration(policy, session);
          break;
        
        case 'best-effort':
          yield* this.bestEffort(policy, session);
          break;
        
        default:
          throw new Error(`Unknown policy type: ${policy.type}`);
      }
      
      // Track actual cost
      const actualCost = (Date.now() - startTime) / 1000 * 0.001; // Rough estimate
      policy.actualCost = actualCost;
      this.costTracking.total += actualCost;
      this.costTracking.byPolicy[policy.type] = 
        (this.costTracking.byPolicy[policy.type] || 0) + actualCost;
      
    } catch (error) {
      yield {
        type: 'error',
        content: error.message,
        confidence: 0,
        source: 'executor'
      };
      throw error;
    }
  }
  
  /**
   * Quick Lookup: Return cached answer
   */
  async *quickLookup(policy, session) {
    const cached = session.memory.cachedAnswer;
    
    yield {
      content: cached.content,
      confidence: cached.confidence,
      source: 'cache',
      reportId: cached.reportId,
      metadata: {
        cacheAge: cached.age,
        policy: 'quick-lookup'
      }
    };
  }
  
  /**
   * Local Only: Browser model inference
   */
  async *localOnly(policy, session) {
    // Delegate to local model manager
    const localModels = require('../utils/localModelManager');
    
    try {
      await localModels.initialize();
      
      const result = await localModels.infer(
        policy.models[0],
        session.query,
        { maxTokens: 500 }
      );
      
      yield {
        content: result.text,
        confidence: 0.65, // Local models lower confidence
        source: 'local',
        model: policy.models[0],
        metadata: { policy: 'local-only', tokens: result.tokens }
      };
    } catch (error) {
      // Fallback to cloud if local fails
      yield* this.hybridFast(policy, session);
    }
  }
  
  /**
   * Hybrid Fast: Local parsing + single cloud agent
   */
  async *hybridFast(policy, session) {
    // Local model parses and rewrites query (fast)
    let refinedQuery = session.query;
    
    try {
      const localModels = require('../utils/localModelManager');
      await localModels.initialize();
      
      const rewrite = await localModels.infer(
        'qwen3-4b',
        `Rewrite this query for optimal search: "${session.query}"`,
        { maxTokens: 100 }
      );
      
      refinedQuery = rewrite.text || session.query;
      
      yield {
        type: 'refinement',
        content: `Query refined: "${refinedQuery}"`,
        confidence: 0.7,
        source: 'local'
      };
    } catch (err) {
      // Local failed, continue with original query
    }
    
    // Cloud agent does deep research
    const researchAgent = require('../agents/researchAgent');
    const results = await researchAgent.researchQuery(
      refinedQuery,
      session.context.costPreference || 'low',
      null, null, null, null,
      session.id
    );
    
    yield {
      content: results.text,
      confidence: 0.75,
      source: 'cloud-hybrid',
      model: results.model,
      metadata: {
        policy: 'hybrid-fast',
        tokens: results.tokens,
        cost: results.cost
      }
    };
  }
  
  /**
   * Cloud Parallel: Multi-agent ensemble
   */
  async *cloudParallel(policy, session) {
    const planningAgent = require('../agents/planningAgent');
    const researchAgent = require('../agents/researchAgent');
    const contextAgent = require('../agents/contextAgent');
    
    // 1. Planning phase
    const plan = await planningAgent.planResearch(
      session.query,
      { domain: session.context.domain, maxAgents: policy.agents },
      null,
      session.id
    );
    
    yield {
      type: 'plan',
      content: `Research plan: ${plan.sub_queries?.length || 0} sub-queries`,
      confidence: 0.8,
      source: 'planning',
      metadata: { subQueries: plan.sub_queries }
    };
    
    // 2. Parallel research
    const subQueries = plan.sub_queries || [session.query];
    const results = await researchAgent.conductParallelResearch(
      subQueries,
      session.context.costPreference || 'low',
      null, null, null, null,
      session.id,
      (type, payload) => {
        // Event callback for progress
        session.emitter?.emit('research-event', { type, payload });
      }
    );
    
    // Stream individual results
    for (let i = 0; i < results.length; i++) {
      yield {
        type: 'intermediate',
        content: results[i].text,
        confidence: 0.80,
        source: `agent-${i + 1}`,
        model: results[i].model,
        metadata: { subQuery: subQueries[i] }
      };
    }
    
    // 3. Synthesis
    let synthesis = '';
    for await (const chunk of contextAgent.contextualizeResultsStream(
      session.query,
      results,
      [],
      {
        includeSources: session.context.includeSources,
        outputFormat: session.context.synthesisStyle,
        audienceLevel: session.context.audience
      },
      session.id
    )) {
      if (chunk.content) {
        synthesis += chunk.content;
        
        yield {
          type: 'synthesis-chunk',
          content: chunk.content,
          confidence: 0.85,
          source: 'synthesis'
        };
      }
    }
    
    // Final synthesized result
    yield {
      type: 'synthesis-complete',
      content: synthesis,
      confidence: 0.85,
      source: 'synthesis',
      metadata: {
        policy: 'cloud-parallel',
        agentCount: results.length,
        totalTokens: results.reduce((sum, r) => sum + (r.tokens || 0), 0),
        totalCost: results.reduce((sum, r) => sum + (r.cost || 0), 0)
      }
    };
  }
  
  /**
   * Deep Exploration: Iterative hypothesis generation
   */
  async *deepExploration(policy, session) {
    const researchAgent = require('../agents/researchAgent');
    const contextAgent = require('../agents/contextAgent');
    
    // Initialize hypothesis
    let hypothesis = {
      statement: `Initial hypothesis about: "${session.query}"`,
      confidence: 0.5,
      supporting: [],
      refuting: [],
      iteration: 0
    };
    
    yield {
      type: 'hypothesis',
      content: hypothesis.statement,
      confidence: hypothesis.confidence,
      iteration: 0,
      source: 'initial-hypothesis'
    };
    
    const maxIterations = policy.iterations || 3;
    
    for (let iter = 0; iter < maxIterations; iter++) {
      // Generate research questions to test hypothesis
      const testQueries = await this.generateTestQueries(hypothesis, session.query);
      
      // Parallel research to test hypothesis
      const results = await researchAgent.conductParallelResearch(
        testQueries,
        'high', // Deep exploration uses premium models
        null, null, null, null,
        `${session.id}_iter${iter}`,
        (type, payload) => {
          session.emitter?.emit('deep-research-event', { 
            iteration: iter,
            type,
            payload
          });
        }
      );
      
      // Stream iteration results
      for (const result of results) {
        yield {
          type: 'test-result',
          content: result.text,
          confidence: result.confidence || 0.75,
          iteration: iter + 1,
          source: `iteration-${iter + 1}`,
          metadata: { hypothesis: hypothesis.statement }
        };
      }
      
      // Refine hypothesis based on results
      let synthesis = '';
      for await (const chunk of contextAgent.contextualizeResultsStream(
        `Refine hypothesis: ${hypothesis.statement}`,
        results,
        [],
        { outputFormat: 'analysis', audienceLevel: 'expert' },
        `${session.id}_synth${iter}`
      )) {
        if (chunk.content) synthesis += chunk.content;
      }
      
      // Update hypothesis
      const newConfidence = this.calculateHypothesisConfidence(results, hypothesis);
      hypothesis = {
        statement: synthesis.substring(0, 500),
        confidence: newConfidence,
        supporting: results.filter(r => this.supportsHypothesis(r, hypothesis)),
        refuting: results.filter(r => !this.supportsHypothesis(r, hypothesis)),
        iteration: iter + 1
      };
      
      yield {
        type: 'hypothesis',
        content: hypothesis.statement,
        confidence: hypothesis.confidence,
        iteration: iter + 1,
        source: 'refined-hypothesis',
        metadata: {
          supporting: hypothesis.supporting.length,
          refuting: hypothesis.refuting.length
        }
      };
      
      // Early exit if high confidence reached
      if (hypothesis.confidence > 0.90) {
        yield {
          type: 'convergence',
          content: `High confidence reached (${Math.round(hypothesis.confidence * 100)}%) after ${iter + 1} iterations`,
          confidence: hypothesis.confidence,
          source: 'early-exit'
        };
        break;
      }
    }
    
    // Final hypothesis
    yield {
      type: 'final-hypothesis',
      content: hypothesis.statement,
      confidence: hypothesis.confidence,
      iteration: hypothesis.iteration,
      source: 'deep-exploration',
      metadata: {
        iterations: hypothesis.iteration,
        policy: 'deep-exploration'
      }
    };
  }
  
  /**
   * Generate test queries for hypothesis validation
   */
  async generateTestQueries(hypothesis, originalQuery) {
    // Simple version: generate questions that would confirm/refute hypothesis
    return [
      `Evidence supporting: ${hypothesis.statement}`,
      `Counterarguments to: ${hypothesis.statement}`,
      `Alternative perspectives on: ${originalQuery}`,
      `Recent developments related to: ${originalQuery}`
    ];
  }
  
  /**
   * Calculate hypothesis confidence from results
   */
  calculateHypothesisConfidence(results, hypothesis) {
    if (!results || results.length === 0) return hypothesis.confidence;
    
    const supporting = results.filter(r => this.supportsHypothesis(r, hypothesis)).length;
    const total = results.length;
    const support_ratio = supporting / total;
    
    // Bayesian update: combine prior confidence with new evidence
    const prior = hypothesis.confidence;
    const likelihood = support_ratio;
    const posterior = (prior * likelihood) / ((prior * likelihood) + ((1 - prior) * (1 - likelihood)));
    
    return posterior;
  }
  
  /**
   * Check if result supports hypothesis (simple heuristic)
   */
  supportsHypothesis(result, hypothesis) {
    // Simple keyword matching (can be enhanced with semantic similarity)
    const resultText = (result.text || '').toLowerCase();
    const hypothesisWords = hypothesis.statement.toLowerCase().split(/\s+/);
    
    const matches = hypothesisWords.filter(word => 
      word.length > 3 && resultText.includes(word)
    );
    
    return matches.length > hypothesisWords.length * 0.3;
  }
  
  /**
   * Best-Effort: Single model, budget-constrained
   */
  async *bestEffort(policy, session) {
    const researchAgent = require('../agents/researchAgent');
    
    const result = await researchAgent.researchQuery(
      session.query,
      'low',
      null, null, null, null,
      session.id
    );
    
    yield {
      content: result.text,
      confidence: 0.60,
      source: 'best-effort',
      model: result.model,
      metadata: {
        policy: 'best-effort',
        budgetLimited: true
      }
    };
  }
  
  /**
   * Adaptive re-allocation: Increase compute if confidence is low
   * 
   * Call this mid-execution if initial results show low confidence
   */
  async shouldScaleUp(currentResults, policy, context) {
    const avgConfidence = currentResults.reduce((sum, r) => sum + (r.confidence || 0), 0) / currentResults.length;
    
    // Low confidence + budget remaining → scale up
    if (avgConfidence < context.minConfidence && context.budget.dollars > policy.estimatedCost * 2) {
      return {
        shouldScale: true,
        recommendation: 'deep-exploration',
        reasoning: `Confidence ${Math.round(avgConfidence * 100)}% below threshold ${Math.round(context.minConfidence * 100)}%`
      };
    }
    
    return { shouldScale: false };
  }
  
  /**
   * Get execution statistics
   */
  getStats() {
    return {
      totalCost: this.costTracking.total,
      byPolicy: this.costTracking.byPolicy,
      averageCost: this.costTracking.total / Object.values(this.costTracking.byPolicy).reduce((sum, count) => sum + count, 0) || 0
    };
  }
}

// Singleton
let instance = null;

function getInstance(options) {
  if (!instance) {
    instance = new AdaptiveExecutor(options);
  }
  return instance;
}

module.exports = {
  AdaptiveExecutor,
  getInstance,
  get instance() { return instance; }
};

