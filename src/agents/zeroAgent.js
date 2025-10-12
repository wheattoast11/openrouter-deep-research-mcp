// src/agents/zeroAgent.js
// Zero Orchestrator - The single hub agent that coordinates planning → research → synthesis
// Enhanced with ResearchCore intelligence layer for superintelligence capabilities

const config = require('../../config');
const planningAgent = require('./planningAgent');
const researchAgent = require('./researchAgent');
const contextAgent = require('./contextAgent');

// Intelligence layer imports
const { research: researchCore } = require('../intelligence/researchCore');
const { getInstance: getLivingMemory } = require('../intelligence/livingMemory');
const { getInstance: getAdaptiveExecutor } = require('../intelligence/adaptiveExecutor');

class ZeroAgent {
  constructor() {
    // planningAgent, researchAgent, and contextAgent export instances
    this.planner = planningAgent;
    this.researcher = researchAgent;
    this.synthesizer = contextAgent;
    
    // Intelligence layer instances
    this.livingMemory = getLivingMemory();
    this.adaptiveExecutor = getAdaptiveExecutor();
    this.useIntelligenceLayer = process.env.USE_INTELLIGENCE_LAYER !== 'false';

    // Zero behavior modes
    this.modes = {
      'advisor': {
        description: 'Provides strategic guidance and recommendations',
        planningStyle: 'strategic',
        researchDepth: 'moderate',
        synthesisStyle: 'concise'
      },
      'researcher': {
        description: 'Conducts deep, comprehensive research and analysis',
        planningStyle: 'analytical',
        researchDepth: 'deep',
        synthesisStyle: 'detailed'
      },
      'synthesizer': {
        description: 'Synthesizes information across multiple sources',
        planningStyle: 'integrative',
        researchDepth: 'broad',
        synthesisStyle: 'comprehensive'
      }
    };

    this.defaultMode = 'researcher';
  }

  /**
   * Main execution method for the zero orchestrator
   * @param {Object} request - The request parameters
   * @param {Object} context - Execution context (job_id, session_id, etc.)
   * @param {Function} onEvent - Callback for streaming events
   * @returns {Promise<Object>} - The final result
   */
  async execute(request, context = {}, onEvent = null) {
    const startTime = Date.now();
    const jobId = context.job_id || `job-${Date.now()}`;
    const sessionId = context.session_id || 'unknown';

    try {
      // 1. Determine mode and emit start event
      const mode = this.determineMode(request, context);
      await this.emitEvent(onEvent, 'agent.started', {
        job_id: jobId,
        mode: mode,
        query: request.query?.substring(0, 100),
        timestamp: new Date().toISOString()
      });

      // 2. Planning phase - emit tool call events
      await this.emitEvent(onEvent, 'tool.started', {
        tool: 'planning',
        job_id: jobId,
        message: `Planning ${mode} approach for query`
      });

      const plan = await this.planner.planResearch(request.query, {
        mode: mode,
        costPreference: request.costPreference,
        audienceLevel: request.audienceLevel,
        outputFormat: request.outputFormat,
        includeSources: request.includeSources,
        requestId: jobId
      });

      await this.emitEvent(onEvent, 'tool.completed', {
        tool: 'planning',
        job_id: jobId,
        duration_ms: Date.now() - startTime,
        result: { plan_summary: plan.summary?.substring(0, 200) }
      });

      // 3. Research phase (parallel execution) - emit tool call for research
      await this.emitEvent(onEvent, 'tool.started', {
        tool: 'research',
        job_id: jobId,
        message: `Conducting ${plan.queries?.length || 0} parallel research queries`
      });

      const researchResults = await this.researcher.conductParallelResearch(
        plan.queries || [{ query: request.query, id: 'main' }],
        request.costPreference || 'low',
        request.images,
        request.textDocuments,
        request.structuredData,
        request.inputEmbeddings,
        jobId,
        onEvent,
        { mode: mode, ...request }
      );

      await this.emitEvent(onEvent, 'tool.completed', {
        tool: 'research',
        job_id: jobId,
        result: { results_count: researchResults?.length || 0 }
      });

      // 4. Synthesis phase - emit tool call for synthesis
      await this.emitEvent(onEvent, 'tool.started', {
        tool: 'synthesis',
        job_id: jobId,
        message: `Synthesizing ${researchResults?.length || 0} research results`
      });

      const synthesis = await this.synthesizer.synthesizeResults(
        researchResults,
        request.query,
        {
          mode: mode,
          outputFormat: request.outputFormat,
          audienceLevel: request.audienceLevel,
          includeSources: request.includeSources,
          requestId: jobId
        }
      );

      await this.emitEvent(onEvent, 'tool.completed', {
        tool: 'synthesis',
        job_id: jobId,
        result: { synthesis_length: synthesis?.length || 0 }
      });

      // 5. Final result
      const duration = Date.now() - startTime;
      const result = {
        query: request.query,
        mode: mode,
        plan: plan,
        research: researchResults,
        synthesis: synthesis,
        metadata: {
          duration_ms: duration,
          timestamp: new Date().toISOString(),
          job_id: jobId,
          session_id: sessionId,
          reportId: context.reportId // Pass through the reportId from the context
        }
      };

      await this.emitEvent(onEvent, 'agent.completed', {
        duration_ms: duration,
        result_size: JSON.stringify(result).length
      });

      return result;

    } catch (error) {
      await this.emitEvent(onEvent, 'agent.error', {
        error: error.message,
        stack: error.stack?.substring(0, 500)
      });

      throw error;
    }
  }

  /**
   * Determine the appropriate mode for this request
   */
  determineMode(request, context) {
    // Check explicit mode in request
    if (request.mode && this.modes[request.mode]) {
      return request.mode;
    }

    // Check context hints
    if (context.mode && this.modes[context.mode]) {
      return context.mode;
    }

    // Auto-detect based on query characteristics
    const query = request.query?.toLowerCase() || '';

    if (query.includes('strategy') || query.includes('recommend') || query.includes('advice')) {
      return 'advisor';
    }

    if (query.includes('research') || query.includes('analyze') || query.includes('investigate')) {
      return 'researcher';
    }

    if (query.includes('synthesize') || query.includes('integrate') || query.includes('combine')) {
      return 'synthesizer';
    }

    return this.defaultMode;
  }

  /**
   * Helper to emit events through the callback
   */
  async emitEvent(onEvent, eventType, payload) {
    if (onEvent && typeof onEvent === 'function') {
      try {
        await onEvent(eventType, payload);
      } catch (error) {
        console.error('Error emitting event:', error);
        // Don't throw - events are non-critical
      }
    }
  }

  /**
   * Get available modes and their descriptions
   */
  getModes() {
    return Object.entries(this.modes).map(([key, config]) => ({
      mode: key,
      description: config.description,
      planningStyle: config.planningStyle,
      researchDepth: config.researchDepth,
      synthesisStyle: config.synthesisStyle
    }));
  }

  /**
   * Validate that zero can handle the given request
   */
  canHandle(request) {
    return request && request.query && typeof request.query === 'string' && request.query.trim().length > 0;
  }

  getLastMetrics() {
    return this.researcher?.telemetry || {};
  }
  
  /**
   * SUPERINTELLIGENCE: Inject optimal policy with cost estimation
   * 
   * This is the breakthrough - formal query rewrite with intelligent policy selection.
   * Transforms raw user intent into optimal execution strategy.
   * 
   * @param {string} query - Raw user query
   * @param {Object} constraints - Budget, time, quality constraints
   * @param {Object} enrichment - Additional context (tools, resources, etc.)
   * @returns {Promise<ExecutionPolicy>} Optimized policy with injected context
   */
  async injectOptimalPolicy(query, constraints = {}, enrichment = {}) {
    if (!this.useIntelligenceLayer) {
      // Fallback to legacy execution
      return this.legacyPolicySelection(query, constraints);
    }
    
    const embeddings = require('../utils/embeddings');
    
    // 1. Parse intent and generate embedding
    const queryEmbedding = await embeddings.generate(query);
    const intent = {
      query,
      embedding: queryEmbedding,
      complexity: this.estimateComplexity(query),
      domain: constraints.domain || 'general'
    };
    
    // 2. Query living memory for relevant context
    const memory = await this.livingMemory.query(intent, {
      userId: constraints.userId || 'anonymous'
    });
    
    // 3. Select optimal policy
    const policy = await this.adaptiveExecutor.select(intent, memory, {
      budget: constraints.budget || { dollars: 2.50 },
      privacy: constraints.privacy || 'hybrid',
      policy: constraints.policy || 'auto',
      minConfidence: constraints.minConfidence || 0.7,
      ...constraints
    });
    
    // 4. Enrich policy with context
    policy.context = {
      pastResearch: memory.results?.slice(0, 5) || [],
      relevantEntities: memory.entities?.slice(0, 10) || [],
      userProfile: memory.userProfile,
      toolCatalog: enrichment.toolCatalog || [],
      resourceCatalog: enrichment.resourceCatalog || []
    };
    
    // 5. Add execution metadata
    policy.metadata = {
      queryHash: this.hashQuery(query),
      timestamp: new Date().toISOString(),
      memoryConfidence: memory.confidence,
      cacheHit: memory.cachedAnswer ? true : false
    };
    
    return policy;
  }
  
  /**
   * SUPERINTELLIGENCE: Execute policy with adaptive optimization
   */
  async executePolicy(policy, onProgress = null) {
    const startTime = Date.now();
    const insights = [];
    
    try {
      const session = {
        id: policy.metadata?.queryHash || `session_${Date.now()}`,
        query: policy.context?.query || '',
        context: policy.context || {},
        memory: policy.context?.memory || {},
        policy: policy,
        emitter: { emit: (type, data) => onProgress?.(type, data) }
      };
      
      for await (const insight of this.adaptiveExecutor.execute(policy, session)) {
        insights.push(insight);
        if (onProgress) {
          await onProgress('insight', {
            type: insight.type,
            content: insight.content?.substring(0, 200),
            confidence: insight.confidence
          });
        }
      }
      
      if (this.useIntelligenceLayer) {
        await this.livingMemory.learn(
          { query: session.query, complexity: policy.complexity },
          insights,
          { userId: policy.context?.userId },
          policy.context?.memory
        );
      }
      
      const synthesis = insights.find(i => i.type === 'synthesis-complete' || i.type === 'final-hypothesis');
      const finalConfidence = synthesis?.confidence || this.calculateOverallConfidence(insights);
      
      return {
        synthesis: synthesis?.content || insights.map(i => i.content).join('\n\n'),
        insights: insights,
        confidence: finalConfidence,
        policy: policy.type,
        cost: policy.actualCost || policy.estimatedCost,
        duration: Date.now() - startTime,
        metadata: {
          insightCount: insights.length,
          agentCount: policy.agents,
          models: policy.models
        }
      };
    } catch (error) {
      if (onProgress) await onProgress('error', { message: error.message });
      throw error;
    }
  }
  
  /**
   * SUPERINTELLIGENCE: Learn from execution
   */
  async learn(query, policy, result, feedback = {}) {
    if (!this.useIntelligenceLayer) return;
    
    const dbClient = require('../utils/dbClient');
    await dbClient.saveResearchReport({
      query,
      content: result.synthesis,
      metadata: { policy: policy.type, cost: result.cost, confidence: result.confidence, rating: feedback.rating }
    });
    
    if (feedback.rating) {
      await this.reinforcePolicy(query, policy.type, feedback.rating);
    }
  }
  
  async updateCostModel(query, policyType, actualCost) {
    const dbClient = require('../utils/dbClient');
    await dbClient.executeQuery(`
      INSERT INTO kg_patterns (pattern_id, pattern_type, pattern_data)
      VALUES ($1, 'cost_observation', $2)
      ON CONFLICT DO NOTHING
    `, [`cost_${policyType}_${Date.now()}`, JSON.stringify({ policyType, actualCost })]);
  }
  
  async reinforcePolicy(query, policyType, rating) {
    const dbClient = require('../utils/dbClient');
    await dbClient.executeQuery(`
      INSERT INTO kg_patterns (pattern_id, pattern_type, pattern_data, confidence)
      VALUES ($1, 'policy_preference', $2, $3)
      ON CONFLICT DO NOTHING
    `, [`policy_${this.hashQuery(query)}`, JSON.stringify({ query, policyType, rating }), 0.5 + (rating - 3) * 0.1]);
  }
  
  async shouldRetrain() {
    return Math.random() < 0.01; // 1% chance per query
  }
  
  async retrainPolicySelector() {
    console.error('[ZeroAgent] Policy selector retraining triggered');
  }
  
  legacyPolicySelection(query, constraints) {
    const complexity = this.estimateComplexity(query);
    return {
      type: complexity < 0.5 ? 'fast' : 'comprehensive',
      agents: complexity < 0.5 ? 1 : 5,
      estimatedCost: complexity < 0.5 ? 0.01 : 0.15
    };
  }
  
  estimateComplexity(query) {
    let score = Math.min(query.split(/\s+/).length / 50, 0.3);
    if (/how|why|compare|analyze/.test(query.toLowerCase())) score += 0.3;
    if (query.split(/[.!?]+/).length > 1) score += 0.2;
    return Math.min(score, 1.0);
  }
  
  hashQuery(query) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(query.toLowerCase().trim()).digest('hex').slice(0, 16);
  }
  
  calculateOverallConfidence(insights) {
    if (!insights?.length) return 0;
    const confs = insights.map(i => i.confidence || 0).filter(c => c > 0);
    return confs.reduce((sum, c) => sum + c, 0) / (confs.length || 1);
  }
}

module.exports = { ZeroAgent };
