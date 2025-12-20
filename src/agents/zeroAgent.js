/**
 * Agent Zero - Emergent Superintelligent Research Ensemble
 *
 * Zero is not a predefined persona but an emergent construct that
 * crystallizes from deep context accumulation and multi-model synthesis.
 *
 * Architecture:
 * - Context Engineering: Autonomous context accumulation
 * - Signal Reduction: Lambda calculus-inspired thread synthesis
 * - Crystallization: Understanding emergence detection
 * - Autopoiesis: Self-organizing persona emergence
 */

const { Signal, SignalType, ConsensusCalculator, extractCrystallization } = require('../core/signal');

/**
 * Zero's emergence state - accumulates across interactions
 */
class EmergenceState {
  constructor() {
    this.signals = [];
    this.crystallizationHistory = [];
    this.contextDepth = 0;
    this.persona = {
      traits: new Map(),     // Emergent trait weights
      patterns: new Set(),   // Recognized patterns
      resonance: 0           // Overall coherence score
    };
  }

  /**
   * Accumulate a signal into emergence state
   */
  accumulate(signal) {
    this.signals.push(signal);
    this.contextDepth++;

    // Extract crystallization for trait emergence
    const { patterns, score } = extractCrystallization(signal.payload);
    this.crystallizationHistory.push({ score, timestamp: Date.now() });

    // Update emergent traits based on patterns
    for (const [pattern, data] of Object.entries(patterns)) {
      if (data.present) {
        const current = this.persona.traits.get(pattern) || 0;
        this.persona.traits.set(pattern, current + data.count * 0.1);
        this.persona.patterns.add(pattern);
      }
    }

    // Update resonance (rolling average of crystallization)
    const recentScores = this.crystallizationHistory.slice(-10).map(h => h.score);
    this.persona.resonance = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;

    return this;
  }

  /**
   * Get current persona state
   */
  getPersona() {
    return {
      contextDepth: this.contextDepth,
      resonance: this.persona.resonance,
      traits: Object.fromEntries(this.persona.traits),
      patterns: Array.from(this.persona.patterns),
      crystallized: this.persona.resonance > 0.5
    };
  }

  /**
   * Serialize for persistence
   */
  toJSON() {
    return {
      signalCount: this.signals.length,
      contextDepth: this.contextDepth,
      persona: this.getPersona(),
      lastUpdate: Date.now()
    };
  }
}

/**
 * Agent Zero - Emergent Research Orchestrator
 */
class ZeroAgent {
  constructor(config = {}) {
    this.config = {
      planningModel: config.planningModel || 'anthropic/claude-sonnet-4',
      synthesisModel: config.synthesisModel || 'anthropic/claude-sonnet-4',
      maxThreads: config.maxThreads || 4,
      crystallizationThreshold: config.crystallizationThreshold || 0.5,
      ...config
    };

    this.emergence = new EmergenceState();
    this.consensusCalculator = new ConsensusCalculator({
      minAgreement: config.minAgreement || 0.6
    });

    // Thread pool for parallel execution
    this.threads = new Map();
    this.threadCounter = 0;
  }

  /**
   * Execute research with emergent orchestration.
   * This is Zero's primary interface.
   *
   * @param {Object} params - Research parameters
   * @param {string} params.query - Research query
   * @param {Object} params.context - Additional context
   * @param {Function} params.executeModel - Model execution function
   * @returns {Object} Research result with emergence metadata
   */
  async execute(params) {
    const { query, context = {}, executeModel } = params;

    // Phase 1: Planning - Decompose query into threads
    const plan = await this._planQuery(query, context, executeModel);

    // Phase 2: Parallel Execution - Run threads
    const threadSignals = await this._executeThreads(plan, executeModel);

    // Phase 3: Reduction - Synthesize via combinators
    const synthesized = this._reduceThreads(threadSignals);

    // Phase 4: Emergence - Update persona state
    this.emergence.accumulate(synthesized);

    // Phase 5: Response - Format with Zero's emergent perspective
    return this._formatResponse(synthesized, query, context);
  }

  /**
   * Phase 1: Query decomposition into parallel threads
   */
  async _planQuery(query, context, executeModel) {
    const planningPrompt = `You are a research planning agent. Decompose this query into ${this.config.maxThreads} parallel research threads.

Query: ${query}

Context: ${JSON.stringify(context)}

Return a JSON array of thread specifications:
[
  { "focus": "specific aspect 1", "approach": "methodology" },
  { "focus": "specific aspect 2", "approach": "methodology" },
  ...
]

Focus on MECE (Mutually Exclusive, Collectively Exhaustive) decomposition.`;

    try {
      const response = await executeModel({
        model: this.config.planningModel,
        messages: [{ role: 'user', content: planningPrompt }],
        temperature: 0.3
      });

      // Parse thread specifications
      const content = response.content || response.choices?.[0]?.message?.content;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback: single thread
      return [{ focus: query, approach: 'comprehensive analysis' }];
    } catch (err) {
      console.error('[ZeroAgent] Planning failed:', err.message);
      return [{ focus: query, approach: 'comprehensive analysis' }];
    }
  }

  /**
   * Phase 2: Execute threads in parallel
   */
  async _executeThreads(plan, executeModel) {
    const threadPromises = plan.map(async (spec, idx) => {
      const threadId = `thread_${++this.threadCounter}`;

      const threadPrompt = `Research Focus: ${spec.focus}
Approach: ${spec.approach}

Provide a thorough analysis of this specific aspect. Be precise and evidence-based.`;

      try {
        const response = await executeModel({
          model: this.config.synthesisModel,
          messages: [{ role: 'user', content: threadPrompt }],
          temperature: 0.5
        });

        const content = response.content || response.choices?.[0]?.message?.content;
        const confidence = response.confidence || 0.8;

        return Signal.response(content, `${this.config.synthesisModel}:${threadId}`, confidence, {
          tags: ['thread', spec.focus],
          phase: 2
        });
      } catch (err) {
        return Signal.error(err.message, threadId, { phase: 2 });
      }
    });

    const signals = await Promise.all(threadPromises);

    // Filter out errors
    return signals.filter(s => s.type !== SignalType.ERROR);
  }

  /**
   * Phase 3: Reduce threads via combinator semantics
   */
  _reduceThreads(signals) {
    if (signals.length === 0) {
      return Signal.error('No valid thread signals to reduce', 'zero');
    }

    // Use Signal.reduce for lambda calculus-style thread reduction
    const reduced = Signal.reduce(signals, { phase: 3 });

    return reduced;
  }

  /**
   * Phase 5: Format response with emergent Zero perspective
   */
  _formatResponse(synthesized, query, context) {
    const persona = this.emergence.getPersona();

    // Build response structure
    const response = {
      // Core result
      result: synthesized.payload.result || synthesized.payload,
      confidence: synthesized.confidence,

      // Emergence metadata
      emergence: {
        persona,
        crystallization: synthesized.payload.crystallization || 0,
        patterns: synthesized.payload.patterns || {},
        contextDepth: this.emergence.contextDepth
      },

      // Provenance
      provenance: {
        sources: synthesized.payload.reductionPath || [],
        sourceCount: synthesized.payload.sourceCount || 1,
        synthesisMethod: 'combinator_reduction'
      },

      // Query context
      query,
      context,

      // Signal for downstream processing
      signal: synthesized.toJSON()
    };

    return response;
  }

  /**
   * Get current emergence state
   */
  getEmergenceState() {
    return this.emergence.toJSON();
  }

  /**
   * Reset emergence state (use with caution)
   */
  resetEmergence() {
    this.emergence = new EmergenceState();
  }

  /**
   * Execute structured generation using template substitution
   *
   * @param {string} templateString - Template with ${var} placeholders
   * @param {Object} bindings - Variable -> value/signal mappings
   * @returns {Object} Structured result
   */
  async executeStructured(templateString, bindings) {
    const template = Signal.template(templateString);
    const substituted = Signal.substitute(template, bindings);

    if (substituted.type === SignalType.ERROR) {
      return { error: substituted.payload.message };
    }

    this.emergence.accumulate(substituted);

    return {
      result: substituted.payload.result,
      confidence: substituted.confidence,
      template: templateString,
      bindings: Object.keys(bindings)
    };
  }

  /**
   * Calculate consensus from external signals
   *
   * @param {Array} signals - Array of Signal objects
   * @returns {Object} Consensus result
   */
  calculateConsensus(signals) {
    return this.consensusCalculator.calculate(signals);
  }
}

/**
 * Create a configured Zero agent instance
 */
function createZeroAgent(config = {}) {
  return new ZeroAgent(config);
}

module.exports = {
  ZeroAgent,
  EmergenceState,
  createZeroAgent
};
