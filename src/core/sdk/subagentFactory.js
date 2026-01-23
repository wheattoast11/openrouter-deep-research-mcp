/**
 * Subagent Factory
 *
 * HVM-steered subagent instantiation.
 * Creates specialized subagents with combinator-based steering for task execution.
 *
 * @module core/sdk/subagentFactory
 */

'use strict';

const { EventEmitter } = require('events');

/**
 * Combinator types from HVM
 */
const Combinators = {
  CONSTRUCT: 'CONSTRUCT',
  DUPLICATE: 'DUPLICATE',
  ERASE: 'ERASE'
};

/**
 * Subagent complexity levels
 */
const ComplexityLevel = {
  SIMPLE: 1,    // Single-step tasks
  MODERATE: 2,  // Multi-step with some branching
  COMPLEX: 3    // Complex orchestration needed
};

/**
 * Subagent role types
 */
const SubagentRole = {
  RESEARCHER: 'researcher',
  ANALYST: 'analyst',
  SYNTHESIZER: 'synthesizer',
  VERIFIER: 'verifier',
  EXECUTOR: 'executor'
};

/**
 * Model hints based on role
 */
const RoleModelHints = {
  [SubagentRole.RESEARCHER]: {
    preferredCapabilities: ['web_search', 'document_analysis'],
    costProfile: 'low',
    model: 'deepseek/deepseek-chat-v3.1'
  },
  [SubagentRole.ANALYST]: {
    preferredCapabilities: ['reasoning', 'code_analysis'],
    costProfile: 'low',
    model: 'google/gemini-3-flash-preview'
  },
  [SubagentRole.SYNTHESIZER]: {
    preferredCapabilities: ['summarization', 'creative_writing'],
    costProfile: 'high',
    model: 'anthropic/claude-sonnet-4'
  },
  [SubagentRole.VERIFIER]: {
    preferredCapabilities: ['fact_checking', 'validation'],
    costProfile: 'low',
    model: 'openai/gpt-5-mini'
  },
  [SubagentRole.EXECUTOR]: {
    preferredCapabilities: ['code_generation', 'tool_use'],
    costProfile: 'high',
    model: 'anthropic/claude-sonnet-4'
  }
};

/**
 * Created Subagent
 */
class Subagent {
  constructor(config) {
    this.id = config.id || `subagent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.description = config.description;
    this.role = config.role || SubagentRole.RESEARCHER;
    this.complexity = config.complexity || ComplexityLevel.SIMPLE;
    this.model = config.model;
    this.logitBias = config.logitBias || {};
    this.hvmTrace = config.hvmTrace || null;
    this.parentId = config.parentId || null;
    this.tools = config.tools || [];
    this.created = Date.now();
    this.state = 'idle';
    this.results = [];
  }

  /**
   * Execute the subagent's task
   *
   * @param {string} input - Task input
   * @param {Object} [context] - Execution context
   * @returns {Promise<Object>}
   */
  async execute(input, context = {}) {
    this.state = 'executing';
    const startTime = Date.now();

    try {
      // If an executor is provided in context, use it
      if (context.executor) {
        const result = await context.executor(input, {
          model: this.model,
          logitBias: this.logitBias,
          tools: this.tools,
          subagentId: this.id
        });

        this.results.push({
          input,
          result,
          duration: Date.now() - startTime,
          timestamp: Date.now()
        });

        this.state = 'complete';
        return {
          success: true,
          result,
          subagentId: this.id,
          duration: Date.now() - startTime
        };
      }

      // No executor - return configuration for external execution
      this.state = 'ready';
      return {
        success: true,
        subagentId: this.id,
        config: {
          model: this.model,
          logitBias: this.logitBias,
          tools: this.tools,
          input
        }
      };

    } catch (error) {
      this.state = 'error';
      return {
        success: false,
        error: error.message,
        subagentId: this.id,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Get subagent state
   *
   * @returns {Object}
   */
  getState() {
    return {
      id: this.id,
      description: this.description,
      role: this.role,
      complexity: this.complexity,
      model: this.model,
      state: this.state,
      hasHvmBias: Object.keys(this.logitBias).length > 0,
      resultCount: this.results.length,
      uptime: Date.now() - this.created
    };
  }
}

/**
 * Subagent Factory
 *
 * Creates HVM-steered subagents based on task descriptions.
 */
class SubagentFactory extends EventEmitter {
  constructor(options = {}) {
    super();

    this.hvmClient = options.hvmClient || null;
    this.cognitiveRouter = options.cognitiveRouter || null;
    this.logger = options.logger || console;
    this.subagents = new Map();
    this.createdCount = 0;
  }

  /**
   * Create a subagent from configuration
   *
   * @param {Object} config - Subagent configuration
   * @param {string} config.description - What the subagent should do
   * @param {string} [config.role] - Subagent role
   * @param {Object} [config.hvmContext] - HVM context for steering
   * @returns {Subagent}
   */
  create(config) {
    this.createdCount++;

    // Analyze description for complexity
    const complexity = this._estimateComplexity(config.description);

    // Determine role from description if not provided
    const role = config.role || this._inferRole(config.description);

    // Get model hints for role
    const hints = RoleModelHints[role] || RoleModelHints[SubagentRole.RESEARCHER];

    // Generate HVM combinator trace and logit bias
    let hvmTrace = null;
    let logitBias = {};

    if (this.hvmClient && config.hvmContext) {
      hvmTrace = this._generateHvmTrace(complexity, role, config.hvmContext);
      logitBias = this.hvmClient.hvmToLogitBias(hvmTrace);
    }

    // Determine model from router or hints
    let model = config.model || hints.model;
    if (this.cognitiveRouter && !config.model) {
      // Let cognitive router decide based on complexity and cost
      const routerSuggestion = this.cognitiveRouter.suggestModel?.({
        complexity,
        role,
        costProfile: hints.costProfile
      });
      if (routerSuggestion) {
        model = routerSuggestion.model;
      }
    }

    // Create the subagent
    const subagent = new Subagent({
      id: config.id || `subagent-${this.createdCount}-${Date.now()}`,
      description: config.description,
      role,
      complexity,
      model,
      logitBias,
      hvmTrace,
      parentId: config.parentId,
      tools: config.tools || []
    });

    this.subagents.set(subagent.id, subagent);
    this.emit('subagent-created', { subagentId: subagent.id, role, complexity });

    return subagent;
  }

  /**
   * Create multiple subagents for parallel execution
   *
   * @param {Array<Object>} configs - Array of subagent configurations
   * @returns {Array<Subagent>}
   */
  createBatch(configs) {
    return configs.map(config => this.create(config));
  }

  /**
   * Get subagent by ID
   *
   * @param {string} id
   * @returns {Subagent|null}
   */
  get(id) {
    return this.subagents.get(id) || null;
  }

  /**
   * Remove subagent
   *
   * @param {string} id
   * @returns {boolean}
   */
  remove(id) {
    const removed = this.subagents.delete(id);
    if (removed) {
      this.emit('subagent-removed', { subagentId: id });
    }
    return removed;
  }

  /**
   * Get all subagents
   *
   * @returns {Array<Subagent>}
   */
  getAll() {
    return Array.from(this.subagents.values());
  }

  /**
   * Get factory state
   *
   * @returns {Object}
   */
  getState() {
    const subagents = this.getAll();
    return {
      createdCount: this.createdCount,
      activeCount: subagents.length,
      byRole: this._countByRole(subagents),
      byComplexity: this._countByComplexity(subagents),
      hvmEnabled: !!this.hvmClient
    };
  }

  /**
   * Estimate task complexity from description
   *
   * @private
   * @param {string} description
   * @returns {number}
   */
  _estimateComplexity(description) {
    const lower = description.toLowerCase();

    // Complex indicators
    const complexIndicators = [
      'multiple', 'parallel', 'orchestrate', 'comprehensive',
      'complex', 'deep', 'thorough', 'extensive'
    ];

    // Simple indicators
    const simpleIndicators = [
      'simple', 'quick', 'single', 'basic', 'straightforward'
    ];

    let score = ComplexityLevel.MODERATE;

    for (const indicator of complexIndicators) {
      if (lower.includes(indicator)) score++;
    }

    for (const indicator of simpleIndicators) {
      if (lower.includes(indicator)) score--;
    }

    return Math.min(Math.max(score, ComplexityLevel.SIMPLE), ComplexityLevel.COMPLEX);
  }

  /**
   * Infer role from description
   *
   * @private
   * @param {string} description
   * @returns {string}
   */
  _inferRole(description) {
    const lower = description.toLowerCase();

    if (lower.includes('research') || lower.includes('find') || lower.includes('search')) {
      return SubagentRole.RESEARCHER;
    }
    if (lower.includes('analyz') || lower.includes('examine') || lower.includes('investigate')) {
      return SubagentRole.ANALYST;
    }
    if (lower.includes('synthesiz') || lower.includes('combin') || lower.includes('summariz')) {
      return SubagentRole.SYNTHESIZER;
    }
    if (lower.includes('verify') || lower.includes('validat') || lower.includes('check')) {
      return SubagentRole.VERIFIER;
    }
    if (lower.includes('execut') || lower.includes('implement') || lower.includes('build')) {
      return SubagentRole.EXECUTOR;
    }

    return SubagentRole.RESEARCHER;
  }

  /**
   * Generate HVM combinator trace
   *
   * @private
   * @param {number} complexity
   * @param {string} role
   * @param {Object} context
   * @returns {Object}
   */
  _generateHvmTrace(complexity, role, context) {
    // Map complexity and role to combinator type
    let type;
    if (complexity >= ComplexityLevel.COMPLEX) {
      type = Combinators.CONSTRUCT; // Build up complex structures
    } else if (role === SubagentRole.SYNTHESIZER) {
      type = Combinators.ERASE; // Reduce/compress information
    } else {
      type = Combinators.DUPLICATE; // Explore parallel paths
    }

    return {
      type,
      address: context.address || { base: 2, coefficients: [complexity, role.length % 5] },
      metadata: {
        role,
        complexity,
        tokenHints: this._getTokenHintsForRole(role)
      }
    };
  }

  /**
   * Get token hints for role
   *
   * @private
   * @param {string} role
   * @returns {Array<string>}
   */
  _getTokenHintsForRole(role) {
    const hints = {
      [SubagentRole.RESEARCHER]: ['search', 'find', 'discover', 'explore'],
      [SubagentRole.ANALYST]: ['analyze', 'examine', 'evaluate', 'assess'],
      [SubagentRole.SYNTHESIZER]: ['combine', 'integrate', 'summarize', 'unify'],
      [SubagentRole.VERIFIER]: ['verify', 'validate', 'confirm', 'check'],
      [SubagentRole.EXECUTOR]: ['implement', 'execute', 'build', 'create']
    };
    return hints[role] || [];
  }

  /**
   * Count subagents by role
   *
   * @private
   * @param {Array<Subagent>} subagents
   * @returns {Object}
   */
  _countByRole(subagents) {
    const counts = {};
    for (const agent of subagents) {
      counts[agent.role] = (counts[agent.role] || 0) + 1;
    }
    return counts;
  }

  /**
   * Count subagents by complexity
   *
   * @private
   * @param {Array<Subagent>} subagents
   * @returns {Object}
   */
  _countByComplexity(subagents) {
    const counts = { simple: 0, moderate: 0, complex: 0 };
    for (const agent of subagents) {
      if (agent.complexity === ComplexityLevel.SIMPLE) counts.simple++;
      else if (agent.complexity === ComplexityLevel.MODERATE) counts.moderate++;
      else counts.complex++;
    }
    return counts;
  }

  /**
   * Cleanup factory
   */
  destroy() {
    this.subagents.clear();
    this.removeAllListeners();
  }
}

/**
 * Create a subagent factory
 *
 * @param {Object} [options]
 * @returns {SubagentFactory}
 */
function createSubagentFactory(options = {}) {
  return new SubagentFactory(options);
}

module.exports = {
  SubagentFactory,
  Subagent,
  createSubagentFactory,
  SubagentRole,
  ComplexityLevel,
  Combinators,
  RoleModelHints,
  available: true
};
