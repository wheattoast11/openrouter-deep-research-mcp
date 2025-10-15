/**
 * Local Zero Agent - Browser-optimized agent with local inference
 * 
 * Inherits from ZeroAgent but overrides execution with browser inference.
 * Features:
 * - Ultra-terse, token-efficient prompts
 * - Context engineering via semantic compression
 * - Functional reduction for task decomposition
 * - Interaction nets for computation pruning
 * 
 * @module agents/localZeroAgent
 */

const { ZeroAgent } = require('./zeroAgent');
const { pipe, compose, parallel, reduce, branch, tap } = require('../core/functionalReduction');
const { createNet, NodeType } = require('../core/interactionNets');

/**
 * Ultra-terse prompt templates for token efficiency
 */
const TERSE_PROMPTS = {
  parse: (query) => `Q: ${query}\nA:`,
  
  analyze: (context) => `Ctx: ${context}\nAnalysis:`,
  
  synthesize: (findings) => `Findings:\n${findings}\nSummary:`,
  
  reason: (premise) => `Given: ${premise}\nReason:`,
  
  decide: (options) => `Options:\n${options}\nBest:`,
  
  critique: (output) => `Output: ${output}\nIssues:`,
  
  iterate: (prev, feedback) => `Prev: ${prev}\nFeedback: ${feedback}\nImproved:`
};

/**
 * Local Zero Agent
 * 
 * Browser-optimized variant using local models
 */
class LocalZeroAgent extends ZeroAgent {
  constructor(options = {}) {
    super();
    
    this.inferenceEngine = options.inferenceEngine || null;
    this.modelId = options.modelId || 'qwen3-4b'; // Default: fast local model
    this.maxIterations = options.maxIterations || 3;
    this.confidenceThreshold = options.confidenceThreshold || 0.7;
    this.verbose = options.verbose !== false;
    
    // Computation graph for interaction nets
    this.computationGraph = null;
  }

  /**
   * Execute agent with local inference
   * 
   * Overrides parent execute() to use browser models
   * 
   * @param {Object} request - Request parameters
   * @param {Object} context - Execution context
   * @param {Function} onEvent - Event callback
   * @returns {Promise<Object>} Result
   */
  async execute(request, context = {}, onEvent = null) {
    const startTime = Date.now();
    const jobId = context.job_id || `local-job-${Date.now()}`;
    
    this.log(`Executing locally with model ${this.modelId}`);
    
    try {
      // Initialize computation graph
      this.computationGraph = createNet();
      const rootNode = this.computationGraph.createNode(NodeType.ROOT, { query: request.query });
      
      // Emit start event
      await this._emitEvent(onEvent, 'agent.started', {
        job_id: jobId,
        mode: 'local',
        model: this.modelId
      });
      
      // Functional pipeline: parse → reason → synthesize
      const result = await pipe(
        // Step 1: Parse intent
        tap(async () => await this._emitEvent(onEvent, 'tool.started', { tool: 'parse' })),
        async (req) => await this._parseIntent(req, rootNode),
        tap(async () => await this._emitEvent(onEvent, 'tool.completed', { tool: 'parse' })),
        
        // Step 2: Iterative reasoning
        tap(async () => await this._emitEvent(onEvent, 'tool.started', { tool: 'reason' })),
        async (parsed) => await this._iterativeReason(parsed, rootNode, onEvent),
        tap(async () => await this._emitEvent(onEvent, 'tool.completed', { tool: 'reason' })),
        
        // Step 3: Synthesize result
        tap(async () => await this._emitEvent(onEvent, 'tool.started', { tool: 'synthesize' })),
        async (reasoning) => await this._synthesizeResult(reasoning, rootNode),
        tap(async () => await this._emitEvent(onEvent, 'tool.completed', { tool: 'synthesize' }))
      )(request);
      
      // Optimize computation graph
      const graphStats = this.computationGraph.optimize();
      this.log(`Graph optimized: ${graphStats.removed} nodes removed`);
      
      const duration = Date.now() - startTime;
      
      await this._emitEvent(onEvent, 'agent.completed', {
        duration_ms: duration,
        graph_stats: graphStats
      });
      
      return {
        query: request.query,
        synthesis: result.synthesis,
        confidence: result.confidence,
        metadata: {
          duration_ms: duration,
          model: this.modelId,
          iterations: result.iterations,
          graph_stats: graphStats,
          job_id: jobId
        }
      };
      
    } catch (error) {
      await this._emitEvent(onEvent, 'agent.error', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Parse intent with local model
   * @private
   */
  async _parseIntent(request, rootNode) {
    this.log('Parsing intent...');
    
    // Terse prompt for parsing
    const prompt = TERSE_PROMPTS.parse(request.query);
    
    // Inference with local model
    const result = await this._runInference(prompt, {
      maxLength: 256,
      temperature: 0.3 // Low temperature for parsing
    });
    
    // Create parse node
    const parseNode = this.computationGraph.createNode(NodeType.AGENT, {
      operation: 'parse',
      input: request.query,
      output: result.text,
      confidence: result.confidence
    });
    
    this.computationGraph.connect(rootNode, parseNode);
    
    return {
      query: request.query,
      parsed: result.text,
      confidence: result.confidence,
      node: parseNode
    };
  }

  /**
   * Iterative reasoning with functional reduction
   * @private
   */
  async _iterativeReason(parsed, rootNode, onEvent) {
    this.log('Starting iterative reasoning...');
    
    let hypothesis = parsed.parsed;
    let confidence = parsed.confidence;
    let iteration = 0;
    const reasoningNodes = [];
    
    while (iteration < this.maxIterations && confidence < 0.95) {
      iteration++;
      
      this.log(`Iteration ${iteration}: confidence ${confidence.toFixed(3)}`);
      
      // Emit iteration event
      await this._emitEvent(onEvent, 'reasoning.iteration', {
        iteration,
        confidence,
        hypothesis: hypothesis.substring(0, 100)
      });
      
      // Reason about current hypothesis
      const reasoning = await this._reason(hypothesis, iteration);
      
      // Create reasoning node
      const reasonNode = this.computationGraph.createNode(NodeType.AGENT, {
        operation: 'reason',
        iteration,
        input: hypothesis,
        output: reasoning.text,
        confidence: reasoning.confidence
      });
      
      this.computationGraph.connect(parsed.node, reasonNode);
      reasoningNodes.push(reasonNode);
      
      // Gate: prune low-confidence paths
      if (reasoning.confidence < this.confidenceThreshold) {
        this.log(`Pruning low-confidence path: ${reasoning.confidence.toFixed(3)}`);
        this.computationGraph.erase(reasonNode);
        continue;
      }
      
      // Update hypothesis
      hypothesis = reasoning.text;
      confidence = reasoning.confidence;
      
      // Check for convergence
      if (this._hasConverged(reasoning, iteration)) {
        this.log('Reasoning converged');
        break;
      }
    }
    
    // Reduce computation graph (annihilate contradictions)
    await this.computationGraph.reduce({
      maxSteps: 100,
      customRule: this._pruneContradictions.bind(this)
    });
    
    return {
      hypothesis,
      confidence,
      iterations: iteration,
      nodes: reasoningNodes.filter(n => n.active)
    };
  }

  /**
   * Single reasoning step
   * @private
   */
  async _reason(hypothesis, iteration) {
    const prompt = TERSE_PROMPTS.reason(hypothesis);
    
    const result = await this._runInference(prompt, {
      maxLength: 512,
      temperature: 0.5 + (iteration * 0.1) // Increase temperature with iteration
    });
    
    return {
      text: result.text,
      confidence: result.confidence
    };
  }

  /**
   * Synthesize final result
   * @private
   */
  async _synthesizeResult(reasoning, rootNode) {
    this.log('Synthesizing result...');
    
    // Collect active reasoning nodes
    const activeNodes = reasoning.nodes.map(n => 
      this.computationGraph.nodes.get(n.id)
    ).filter(n => n.active);
    
    // Combine findings
    const findings = activeNodes.map(n => n.value.output).join('\n');
    
    // Terse synthesis prompt
    const prompt = TERSE_PROMPTS.synthesize(findings);
    
    const result = await this._runInference(prompt, {
      maxLength: 1024,
      temperature: 0.4
    });
    
    return {
      synthesis: result.text,
      confidence: reasoning.confidence,
      iterations: reasoning.iterations
    };
  }

  /**
   * Run inference with local model
   * @private
   */
  async _runInference(prompt, options = {}) {
    if (!this.inferenceEngine) {
      throw new Error('Inference engine not initialized');
    }
    
    // Ensure model is loaded
    if (!this.inferenceEngine.models.has(this.modelId)) {
      this.log(`Loading model ${this.modelId}...`);
      await this.inferenceEngine.loadModel(this.modelId);
    }
    
    // Run inference
    const result = await this.inferenceEngine.inference(this.modelId, prompt, {
      max_length: options.maxLength || 512,
      temperature: options.temperature || 0.7,
      do_sample: true,
      top_p: 0.9,
      top_k: 50
    });
    
    // Extract confidence from result
    const confidence = this._estimateConfidence(result);
    
    return {
      text: result.result || '',
      confidence,
      metadata: result.metadata
    };
  }

  /**
   * Estimate confidence from inference result
   * @private
   */
  _estimateConfidence(result) {
    // Simple heuristic: longer responses = higher confidence (up to a point)
    const length = (result.result || '').length;
    const lengthScore = Math.min(length / 500, 1.0) * 0.3;
    
    // Base confidence
    const baseConfidence = 0.5;
    
    return Math.min(baseConfidence + lengthScore, 0.95);
  }

  /**
   * Check if reasoning has converged
   * @private
   */
  _hasConverged(reasoning, iteration) {
    // Simple convergence check
    if (reasoning.confidence > 0.90) return true;
    if (iteration >= this.maxIterations) return true;
    
    return false;
  }

  /**
   * Custom reduction rule: prune contradictory hypotheses
   * @private
   */
  async _pruneContradictions(graph) {
    let pruned = false;
    
    // Find agent nodes with conflicting outputs
    const agentNodes = Array.from(graph.nodes.values()).filter(n => 
      n.active && n.type === NodeType.AGENT
    );
    
    for (let i = 0; i < agentNodes.length; i++) {
      for (let j = i + 1; j < agentNodes.length; j++) {
        const node1 = agentNodes[i];
        const node2 = agentNodes[j];
        
        // Check for contradiction
        if (this._areContradictory(node1.value.output, node2.value.output)) {
          // Annihilate lower confidence node
          if (node1.value.confidence < node2.value.confidence) {
            graph.erase(node1.id);
          } else {
            graph.erase(node2.id);
          }
          pruned = true;
        }
      }
    }
    
    return pruned;
  }

  /**
   * Check if two outputs are contradictory
   * @private
   */
  _areContradictory(output1, output2) {
    // Simple heuristic: check for negation patterns
    const negationPatterns = [
      ['is', 'is not'],
      ['yes', 'no'],
      ['true', 'false'],
      ['correct', 'incorrect']
    ];
    
    const lower1 = output1.toLowerCase();
    const lower2 = output2.toLowerCase();
    
    for (const [pos, neg] of negationPatterns) {
      if ((lower1.includes(pos) && lower2.includes(neg)) ||
          (lower1.includes(neg) && lower2.includes(pos))) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Emit event helper
   * @private
   */
  async _emitEvent(onEvent, type, payload) {
    if (onEvent && typeof onEvent === 'function') {
      try {
        await onEvent(type, payload);
      } catch (error) {
        this.log(`Error emitting event: ${error.message}`);
      }
    }
  }

  /**
   * Log message (if verbose)
   * @private
   */
  log(message) {
    if (this.verbose) {
      console.log(`[LocalZeroAgent] ${message}`);
    }
  }

  /**
   * Get computation graph (for visualization)
   */
  getComputationGraph() {
    return this.computationGraph;
  }

  /**
   * Export graph as DOT for visualization
   */
  exportGraphDot() {
    if (!this.computationGraph) return '';
    return this.computationGraph.toDot();
  }
}

module.exports = {
  LocalZeroAgent,
  TERSE_PROMPTS
};


