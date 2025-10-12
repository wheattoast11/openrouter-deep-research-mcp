/**
 * Research Core - The Pure Research Loop
 * 
 * Everything is research. This is the fundamental primitive.
 * 
 * Zero dependencies on MCP, HTTP, or specific databases.
 * Pure functional core. Fully testable. Infinitely composable.
 * 
 * @module intelligence/researchCore
 */

const { EventEmitter } = require('events');

/**
 * The singular abstraction: research(query, context) → insights
 * 
 * @param {string} query - The research question
 * @param {Object} context - Execution context
 * @param {Object} deps - Injectable dependencies (for testing)
 * @returns {AsyncIterator<Insight>} Stream of insights
 */
async function* research(query, context = {}, deps = null) {
  // Inject dependencies or use defaults
  const {
    parseIntent = defaultParseIntent,
    queryMemory = defaultQueryMemory,
    selectPolicy = defaultSelectPolicy,
    executePolicy = defaultExecutePolicy,
    updateMemory = defaultUpdateMemory
  } = deps || await loadDefaultDependencies();
  
  // Validate input
  if (!query || typeof query !== 'string') {
    throw new Error('Query must be a non-empty string');
  }
  
  // Create research session
  const session = {
    id: `research_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    query,
    context: normalizeContext(context),
    startTime: Date.now(),
    insights: [],
    emitter: new EventEmitter()
  };
  
  try {
    // Phase 1: Parse Intent (local model, <50ms)
    session.emitter.emit('phase', { phase: 'parse', status: 'starting' });
    const intent = await parseIntent(query, session.context);
    session.intent = intent;
    session.emitter.emit('phase', { phase: 'parse', status: 'complete', intent });
    
    yield {
      type: 'intent',
      data: intent,
      timestamp: Date.now() - session.startTime
    };
    
    // Phase 2: Query Living Memory (vector + graph)
    session.emitter.emit('phase', { phase: 'memory', status: 'starting' });
    const memory = await queryMemory(intent, session.context);
    session.memory = memory;
    session.emitter.emit('phase', { phase: 'memory', status: 'complete', memory });
    
    yield {
      type: 'memory',
      data: {
        relevantCount: memory.results?.length || 0,
        maxConfidence: memory.confidence || 0,
        cachedAnswer: memory.cachedAnswer || null
      },
      timestamp: Date.now() - session.startTime
    };
    
    // Phase 3: Select Execution Policy (adaptive)
    session.emitter.emit('phase', { phase: 'policy', status: 'starting' });
    const policy = await selectPolicy(intent, memory, session.context);
    session.policy = policy;
    session.emitter.emit('phase', { phase: 'policy', status: 'complete', policy });
    
    yield {
      type: 'policy',
      data: policy,
      timestamp: Date.now() - session.startTime
    };
    
    // Phase 4: Execute Research (parallel/sequential/hybrid)
    session.emitter.emit('phase', { phase: 'execute', status: 'starting' });
    
    for await (const insight of executePolicy(policy, session)) {
      session.insights.push(insight);
      session.emitter.emit('insight', insight);
      
      yield {
        type: 'insight',
        data: insight,
        timestamp: Date.now() - session.startTime
      };
    }
    
    session.emitter.emit('phase', { phase: 'execute', status: 'complete' });
    
    // Phase 5: Update Living Memory (async, non-blocking)
    // Don't await - let this run in background
    setImmediate(() => {
      updateMemory(intent, session.insights, session.context, memory)
        .catch(err => {
          console.error('[ResearchCore] Memory update failed:', err);
          session.emitter.emit('error', { phase: 'memory-update', error: err });
        });
    });
    
    // Final synthesis
    yield {
      type: 'complete',
      data: {
        sessionId: session.id,
        insightCount: session.insights.length,
        duration: Date.now() - session.startTime,
        policy: policy.type,
        cost: policy.actualCost || policy.estimatedCost,
        confidence: calculateOverallConfidence(session.insights)
      },
      timestamp: Date.now() - session.startTime
    };
    
  } catch (error) {
    session.emitter.emit('error', { phase: 'unknown', error });
    
    yield {
      type: 'error',
      data: {
        message: error.message,
        stack: error.stack,
        phase: session.currentPhase || 'unknown'
      },
      timestamp: Date.now() - session.startTime
    };
    
    throw error;
  }
}

/**
 * Normalize context object with defaults
 */
function normalizeContext(context) {
  return {
    // Execution Control
    policy: context.policy || 'auto',
    budget: {
      dollars: context.budget?.dollars || 2.50,
      tokens: context.budget?.tokens || 100000,
      timeout: context.budget?.timeout || 30000
    },
    
    // Privacy & Sovereignty
    privacy: context.privacy || 'hybrid',
    dataRetention: context.dataRetention || 'anonymized',
    
    // Streaming & Interaction
    stream: context.stream !== false,
    interactive: context.interactive || false,
    
    // Context & Memory
    domain: context.domain || 'general',
    audience: context.audience || 'intermediate',
    cognitiveFingerprint: context.cognitiveFingerprint || null,
    
    // Quality Control
    minConfidence: context.minConfidence || 0.7,
    includeSources: context.includeSources !== false,
    synthesisStyle: context.synthesisStyle || 'conversational',
    
    // Internal
    requestId: context.requestId || `req_${Date.now()}`,
    userId: context.userId || 'anonymous'
  };
}

/**
 * Calculate overall confidence from insights
 */
function calculateOverallConfidence(insights) {
  if (!insights || insights.length === 0) return 0;
  
  const confidences = insights
    .map(i => i.confidence || 0)
    .filter(c => c > 0);
  
  if (confidences.length === 0) return 0;
  
  // Weighted average with more recent insights weighted higher
  const weights = confidences.map((_, idx) => Math.pow(1.1, idx));
  const weightedSum = confidences.reduce((sum, conf, idx) => sum + conf * weights[idx], 0);
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  
  return weightedSum / weightSum;
}

/**
 * Load default dependencies (lazy)
 */
let defaultDeps = null;
async function loadDefaultDependencies() {
  if (defaultDeps) return defaultDeps;
  
  // Lazy load to avoid circular deps
  const intentParser = require('./intentParser');
  const memoryQuerier = require('./memoryQuerier');
  const policySelector = require('./policySelector');
  const policyExecutor = require('./policyExecutor');
  const memoryUpdater = require('./memoryUpdater');
  
  defaultDeps = {
    parseIntent: intentParser.parse,
    queryMemory: memoryQuerier.query,
    selectPolicy: policySelector.select,
    executePolicy: policyExecutor.execute,
    updateMemory: memoryUpdater.update
  };
  
  return defaultDeps;
}

/**
 * Fallback implementations (for testing)
 */
async function defaultParseIntent(query, context) {
  return {
    query,
    normalized: query.toLowerCase().trim(),
    complexity: estimateComplexity(query),
    domain: context.domain,
    intent: 'research' // research | lookup | analyze | compare
  };
}

async function defaultQueryMemory(intent, context) {
  return {
    results: [],
    confidence: 0,
    cachedAnswer: null
  };
}

async function defaultSelectPolicy(intent, memory, context) {
  // Simple heuristic
  if (memory.confidence > 0.9 && intent.complexity < 0.3) {
    return {
      type: 'quick-lookup',
      estimatedCost: 0,
      estimatedTime: 50,
      agents: 0
    };
  }
  
  if (context.policy === 'fast' || context.privacy === 'local-only') {
    return {
      type: 'local-hybrid',
      estimatedCost: 0.01,
      estimatedTime: 2000,
      agents: 1
    };
  }
  
  return {
    type: 'cloud-parallel',
    estimatedCost: 0.10,
    estimatedTime: 5000,
    agents: intent.complexity > 0.7 ? 5 : 3
  };
}

async function* defaultExecutePolicy(policy, session) {
  // Fallback: return memory or simple response
  if (session.memory.cachedAnswer) {
    yield {
      content: session.memory.cachedAnswer,
      confidence: session.memory.confidence,
      source: 'cache'
    };
  } else {
    yield {
      content: `Research in progress for: "${session.query}"`,
      confidence: 0.5,
      source: 'placeholder'
    };
  }
}

async function defaultUpdateMemory(intent, insights, context, memory) {
  // No-op in fallback
  return;
}

/**
 * Estimate query complexity (0.0 - 1.0)
 */
function estimateComplexity(query) {
  let score = 0;
  
  // Length factor
  const words = query.split(/\s+/).length;
  score += Math.min(words / 50, 0.3);
  
  // Question words
  const questionWords = ['how', 'why', 'what', 'compare', 'analyze', 'explain'];
  const hasComplex = questionWords.some(w => query.toLowerCase().includes(w));
  if (hasComplex) score += 0.3;
  
  // Multiple sentences
  const sentences = query.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  if (sentences > 1) score += 0.2;
  
  // Technical terms (basic heuristic)
  const technicalPattern = /[A-Z]{2,}|[a-z]+[A-Z][a-z]+|[0-9]+\.[0-9]+/;
  if (technicalPattern.test(query)) score += 0.2;
  
  return Math.min(score, 1.0);
}

module.exports = {
  research,
  normalizeContext,
  calculateOverallConfidence,
  estimateComplexity
};

