/**
 * Interaction Combinators - The algebra of Zero
 *
 * Based on Lafont's Interaction Nets and the theory behind optimal lambda calculus.
 * These three combinators form a complete basis for computation:
 *
 * - γ (gamma): construct/destruct - structural operations
 * - δ (delta): duplicate/erase - copying and choice
 * - ε (epsilon): annihilate - termination and cleanup
 *
 * The key insight: interaction nets are inherently parallel and confluent.
 * Any sequence of reductions leads to the same normal form.
 *
 * @module core/combinators
 */

'use strict';

const { EventEmitter } = require('events');
const crypto = require('crypto');

// Lazy-loaded Rail consensus module
let _consensusModule = null;

function getConsensusModule() {
  if (!_consensusModule) {
    try {
      _consensusModule = require('./rail/consensus');
    } catch (e) {
      _consensusModule = null;
    }
  }
  return _consensusModule;
}

/**
 * AmbContext - Non-deterministic choice context with backtracking
 *
 * Implements McCarthy's AMB semantics with proper backtracking support.
 * Enables exploration of multiple computation paths.
 *
 * @class
 * @extends EventEmitter
 */
class AmbContext extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {string} [options.strategy='depth-first'] - Search strategy
   * @param {number} [options.maxBacktracks=1000] - Maximum backtrack operations
   * @param {boolean} [options.trace=true] - Enable choice tracing
   */
  constructor(options = {}) {
    super();
    this.id = crypto.randomUUID();
    this.strategy = options.strategy ?? 'depth-first';
    this.maxBacktracks = options.maxBacktracks ?? 1000;
    this.traceEnabled = options.trace !== false;

    // State
    this._alternatives = [];    // Current choice point alternatives
    this._continuations = [];   // Backtrack stack (saved states)
    this._trace = [];           // Choice history
    this._backtrackCount = 0;
    this._choiceCount = 0;
    this._currentPath = [];     // Current choice path indices

    // Statistics
    this._stats = {
      choices: 0,
      backtracks: 0,
      successes: 0,
      failures: 0,
      maxDepth: 0
    };
  }

  /**
   * Register a choice point and select an alternative
   *
   * @param {Array} alternatives - Possible values to choose from
   * @param {Array<number>} [weights] - Optional weights for weighted strategy
   * @returns {*} Selected alternative
   * @throws {Error} If no alternatives and no backtrack possible
   */
  choose(alternatives, weights = null) {
    if (!Array.isArray(alternatives) || alternatives.length === 0) {
      return this._fail('No alternatives provided');
    }

    this._choiceCount++;
    this._stats.choices++;

    // Save current state for backtracking
    const choicePoint = {
      id: crypto.randomUUID(),
      alternatives: [...alternatives],
      weights: weights ? [...weights] : null,
      remaining: alternatives.slice(1), // All except first
      remainingWeights: weights ? weights.slice(1) : null,
      pathIndex: this._currentPath.length,
      timestamp: Date.now()
    };

    this._continuations.push(choicePoint);
    this._stats.maxDepth = Math.max(this._stats.maxDepth, this._continuations.length);

    // Select based on strategy
    const selectedIndex = this._selectIndex(alternatives, weights);
    const selected = alternatives[selectedIndex];

    // Update state
    this._currentPath.push(selectedIndex);

    if (this.traceEnabled) {
      this._trace.push({
        type: 'choice',
        choiceId: choicePoint.id,
        selected,
        selectedIndex,
        totalAlternatives: alternatives.length,
        depth: this._continuations.length,
        timestamp: Date.now()
      });
    }

    this.emit('choice', {
      id: choicePoint.id,
      selected,
      alternatives: alternatives.length,
      depth: this._continuations.length
    });

    return selected;
  }

  /**
   * Consensus-weighted choice with early crystallization exit
   *
   * Unlike standard choose(), this method:
   * - Executes all alternatives in parallel
   * - Calculates streaming consensus as results arrive
   * - Supports early exit when crystallization threshold is reached
   * - Uses IQ quadrature for phase-lock detection
   *
   * @param {Array} alternatives - Possible values/models to choose from
   * @param {object} [options]
   * @param {number} [options.consensusThreshold=0.6] - Minimum agreement threshold
   * @param {boolean} [options.earlyExit=true] - Exit early when threshold reached
   * @param {Function} [options.crystallizationCallback] - Called with score, return true to exit
   * @param {number} [options.timeoutMs=30000] - Timeout for consensus
   * @param {Array<number>} [options.weights] - Initial weights for alternatives
   * @param {boolean} [options.useQuadrature=true] - Enable IQ quadrature analysis
   * @param {Function} [options.executor] - Async function to execute each alternative
   * @returns {Promise<object>} Result with selected alternative and consensus metrics
   */
  async chooseWithConsensus(alternatives, options = {}) {
    if (!Array.isArray(alternatives) || alternatives.length === 0) {
      throw new Error('No alternatives provided for consensus choice');
    }

    const consensusMod = getConsensusModule();
    if (!consensusMod) {
      // Fallback to regular weighted choice if consensus module unavailable
      return this._fallbackChooseWithConsensus(alternatives, options);
    }

    const {
      consensusThreshold = 0.6,
      earlyExit = true,
      crystallizationCallback = null,
      timeoutMs = 30000,
      weights = null,
      useQuadrature = true,
      executor = null
    } = options;

    this._choiceCount++;
    this._stats.choices++;

    const choiceId = crypto.randomUUID();

    // Create streaming consensus session
    const consensus = new consensusMod.StreamingConsensus({
      minAgreement: consensusThreshold,
      timeoutMs,
      useQuadrature,
      updateIntervalMs: 250
    });

    // Track results and signals
    const results = new Map();
    const signals = [];
    let earlyExitTriggered = false;
    let selectedAlternative = null;
    let consensusResult = null;

    // Create promise that resolves on consensus or timeout
    const consensusPromise = new Promise((resolve) => {
      // Listen for consensus updates
      const checkCrystallization = () => {
        const current = consensus.calculate();
        const score = current.quadrature?.combinedScore ?? current.agreement;

        // Emit crystallization event
        this.emit('crystallization', {
          choiceId,
          score,
          agreement: current.agreement,
          phaseLocked: current.quadrature?.isLocked ?? false,
          resonance: current.quadrature?.resonanceStrength ?? 0,
          signalCount: current.signalCount
        });

        // Check early exit conditions
        if (earlyExit) {
          // Crystallization callback takes precedence
          if (crystallizationCallback && crystallizationCallback(score)) {
            earlyExitTriggered = true;
            consensus.stop();
            resolve(current);
            return true;
          }

          // Phase-lock detection (fastest consensus path)
          if (current.quadrature?.isLocked && current.quadrature?.resonanceStrength > 0.7) {
            earlyExitTriggered = true;
            consensus.stop();
            resolve(current);
            return true;
          }

          // Standard threshold
          if (current.agreement >= consensusThreshold && current.signalCount >= 2) {
            earlyExitTriggered = true;
            consensus.stop();
            resolve(current);
            return true;
          }
        }

        return false;
      };

      // Periodic check during execution
      const checkInterval = setInterval(() => {
        if (checkCrystallization()) {
          clearInterval(checkInterval);
        }
      }, 100);

      // Timeout handler
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!earlyExitTriggered) {
          consensus.stop();
          resolve(consensus.calculate());
        }
      }, timeoutMs);
    });

    // Execute alternatives (in parallel if executor provided)
    if (executor) {
      // Parallel execution with executor function
      const executions = alternatives.map(async (alt, index) => {
        try {
          const result = await executor(alt, index);

          // Create signal from result
          const signal = {
            source: typeof alt === 'string' ? alt : `alternative_${index}`,
            confidence: weights ? (weights[index] / Math.max(...weights)) : 1.0,
            payload: result
          };

          signals.push(signal);
          results.set(index, { alternative: alt, result, success: true });

          // Add to consensus calculation
          consensus.addSignal(signal);

          return { index, result, success: true };
        } catch (error) {
          results.set(index, { alternative: alt, error, success: false });
          return { index, error, success: false };
        }
      });

      // Wait for all executions or early exit
      await Promise.race([
        Promise.allSettled(executions),
        consensusPromise
      ]);
    } else {
      // No executor: treat alternatives as pre-computed results
      alternatives.forEach((alt, index) => {
        const signal = {
          source: typeof alt === 'string' ? alt : `alternative_${index}`,
          confidence: weights ? (weights[index] / Math.max(...weights)) : 1.0,
          payload: alt
        };

        signals.push(signal);
        results.set(index, { alternative: alt, result: alt, success: true });
        consensus.addSignal(signal);
      });
    }

    // Get final consensus
    consensusResult = await consensusPromise;
    consensus.stop();

    // Select best alternative based on consensus
    if (consensusResult.majority) {
      // Find alternative that matches majority vote
      for (const [index, data] of results) {
        if (data.success) {
          const vote = this._extractVoteSignature(data.result);
          if (vote === consensusResult.majority.vote) {
            selectedAlternative = { index, ...data };
            break;
          }
        }
      }
    }

    // Fallback: select by highest weight or first successful
    if (!selectedAlternative) {
      if (weights) {
        let maxWeight = -1;
        for (const [index, data] of results) {
          if (data.success && weights[index] > maxWeight) {
            maxWeight = weights[index];
            selectedAlternative = { index, ...data };
          }
        }
      } else {
        for (const [index, data] of results) {
          if (data.success) {
            selectedAlternative = { index, ...data };
            break;
          }
        }
      }
    }

    // Record trace
    if (this.traceEnabled) {
      this._trace.push({
        type: 'consensus_choice',
        choiceId,
        selectedIndex: selectedAlternative?.index ?? -1,
        totalAlternatives: alternatives.length,
        agreement: consensusResult.agreement,
        phaseLocked: consensusResult.quadrature?.isLocked ?? false,
        resonance: consensusResult.quadrature?.resonanceStrength ?? 0,
        earlyExit: earlyExitTriggered,
        depth: this._continuations.length,
        timestamp: Date.now()
      });
    }

    // Emit consensus choice event
    this.emit('consensus_choice', {
      choiceId,
      selected: selectedAlternative?.alternative,
      selectedIndex: selectedAlternative?.index,
      consensus: {
        agreement: consensusResult.agreement,
        phaseLocked: consensusResult.quadrature?.isLocked ?? false,
        combinedScore: consensusResult.quadrature?.combinedScore ?? consensusResult.agreement,
        resonance: consensusResult.quadrature?.resonanceStrength ?? 0
      },
      earlyExit: earlyExitTriggered,
      signalCount: signals.length
    });

    return {
      selected: selectedAlternative?.alternative ?? alternatives[0],
      result: selectedAlternative?.result,
      index: selectedAlternative?.index ?? 0,
      consensus: {
        agreement: consensusResult.agreement,
        confidence: consensusResult.confidence,
        state: consensusResult.state,
        phaseLocked: consensusResult.quadrature?.isLocked ?? false,
        combinedScore: consensusResult.quadrature?.combinedScore ?? consensusResult.agreement,
        resonance: consensusResult.quadrature?.resonanceStrength ?? 0,
        signalCount: signals.length
      },
      earlyExit: earlyExitTriggered,
      allResults: Array.from(results.values())
    };
  }

  /**
   * Extract vote signature from result for consensus matching
   * @private
   */
  _extractVoteSignature(result) {
    const payload = typeof result === 'string'
      ? result
      : JSON.stringify(result);
    return payload.slice(0, 100).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Fallback consensus choice when Rail module unavailable
   * @private
   */
  async _fallbackChooseWithConsensus(alternatives, options) {
    const { weights = null, executor = null } = options;

    // Execute all alternatives
    const results = [];
    if (executor) {
      for (let i = 0; i < alternatives.length; i++) {
        try {
          const result = await executor(alternatives[i], i);
          results.push({ index: i, alternative: alternatives[i], result, success: true });
        } catch (error) {
          results.push({ index: i, alternative: alternatives[i], error, success: false });
        }
      }
    } else {
      alternatives.forEach((alt, i) => {
        results.push({ index: i, alternative: alt, result: alt, success: true });
      });
    }

    // Select by weight or first success
    const successful = results.filter(r => r.success);
    let selected = successful[0];

    if (weights && successful.length > 0) {
      let maxWeight = -1;
      for (const r of successful) {
        if (weights[r.index] > maxWeight) {
          maxWeight = weights[r.index];
          selected = r;
        }
      }
    }

    return {
      selected: selected?.alternative ?? alternatives[0],
      result: selected?.result,
      index: selected?.index ?? 0,
      consensus: {
        agreement: successful.length / alternatives.length,
        confidence: 1.0,
        state: 'fallback',
        phaseLocked: false,
        combinedScore: successful.length / alternatives.length,
        resonance: 0,
        signalCount: results.length
      },
      earlyExit: false,
      allResults: results
    };
  }

  /**
   * Select index based on strategy
   *
   * @private
   * @param {Array} alternatives
   * @param {Array<number>} weights
   * @returns {number}
   */
  _selectIndex(alternatives, weights) {
    switch (this.strategy) {
      case 'weighted':
        if (weights && weights.length === alternatives.length) {
          return this._weightedSelect(weights);
        }
        return 0;

      case 'breadth-first':
        // BFS would require different execution model
        // For now, fall through to depth-first
        return 0;

      case 'random':
        return Math.floor(Math.random() * alternatives.length);

      case 'depth-first':
      default:
        return 0;
    }
  }

  /**
   * Weighted random selection
   *
   * @private
   * @param {Array<number>} weights
   * @returns {number}
   */
  _weightedSelect(weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;

    const r = Math.random() * total;
    let cumulative = 0;

    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i];
      if (r < cumulative) return i;
    }

    return weights.length - 1;
  }

  /**
   * Backtrack to previous choice point and try next alternative
   *
   * @returns {*} Next alternative value
   * @throws {Error} If no backtrack possible (all paths exhausted)
   */
  backtrack() {
    this._backtrackCount++;
    this._stats.backtracks++;

    if (this._backtrackCount > this.maxBacktracks) {
      throw new Error(`Max backtracks exceeded (${this.maxBacktracks})`);
    }

    // Find a choice point with remaining alternatives
    while (this._continuations.length > 0) {
      const choicePoint = this._continuations[this._continuations.length - 1];

      if (choicePoint.remaining.length > 0) {
        // Pop the next alternative
        const nextAlt = choicePoint.remaining.shift();
        const nextWeight = choicePoint.remainingWeights
          ? choicePoint.remainingWeights.shift()
          : null;

        // Update path
        this._currentPath = this._currentPath.slice(0, choicePoint.pathIndex);
        const selectedIndex = choicePoint.alternatives.length - choicePoint.remaining.length - 1;
        this._currentPath.push(selectedIndex);

        if (this.traceEnabled) {
          this._trace.push({
            type: 'backtrack',
            choiceId: choicePoint.id,
            selected: nextAlt,
            remainingAlternatives: choicePoint.remaining.length,
            depth: this._continuations.length,
            timestamp: Date.now()
          });
        }

        this.emit('backtrack', {
          id: choicePoint.id,
          selected: nextAlt,
          remaining: choicePoint.remaining.length,
          depth: this._continuations.length
        });

        return nextAlt;
      } else {
        // This choice point exhausted, pop it
        this._continuations.pop();
      }
    }

    // No more alternatives anywhere
    return this._fail('All alternatives exhausted');
  }

  /**
   * Mark current path as failed and backtrack
   *
   * @private
   * @param {string} reason
   * @throws {Error} If no backtrack possible
   */
  _fail(reason) {
    this._stats.failures++;

    if (this.traceEnabled) {
      this._trace.push({
        type: 'fail',
        reason,
        depth: this._continuations.length,
        timestamp: Date.now()
      });
    }

    this.emit('fail', { reason, depth: this._continuations.length });

    if (this._continuations.length > 0) {
      return this.backtrack();
    }

    throw new Error(`AMB failure: ${reason}`);
  }

  /**
   * Mark current path as successful
   *
   * @param {*} result - Success result
   * @returns {*} The result
   */
  succeed(result) {
    this._stats.successes++;

    if (this.traceEnabled) {
      this._trace.push({
        type: 'success',
        result,
        path: [...this._currentPath],
        depth: this._continuations.length,
        timestamp: Date.now()
      });
    }

    this.emit('success', { result, path: this._currentPath });

    return result;
  }

  /**
   * Run a computation with AMB choices
   *
   * @param {Function} fn - Function that uses this.choose()
   * @returns {*} First successful result
   */
  run(fn) {
    while (true) {
      try {
        const result = fn(this);
        return this.succeed(result);
      } catch (e) {
        if (e.message.includes('AMB failure')) {
          throw e; // Propagate exhaustion
        }
        // Other errors trigger backtrack
        try {
          this.backtrack();
        } catch (backtrackError) {
          throw new Error(`AMB exhausted after error: ${e.message}`);
        }
      }
    }
  }

  /**
   * Find all successful results (not just first)
   *
   * @param {Function} fn - Function that uses this.choose()
   * @param {number} [limit=100] - Maximum results to collect
   * @returns {Array} All successful results
   */
  runAll(fn, limit = 100) {
    const results = [];

    while (results.length < limit) {
      try {
        const result = fn(this);
        results.push(result);

        if (this.traceEnabled) {
          this._trace.push({
            type: 'collected',
            resultIndex: results.length - 1,
            timestamp: Date.now()
          });
        }

        // Try to backtrack for more results
        try {
          this.backtrack();
        } catch (e) {
          break; // No more alternatives
        }
      } catch (e) {
        if (e.message.includes('AMB failure') || e.message.includes('exhausted')) {
          break;
        }
        // Try backtracking on other errors
        try {
          this.backtrack();
        } catch (backtrackError) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * Get choice trace
   *
   * @param {number} [limit] - Limit trace entries
   * @returns {Array}
   */
  getTrace(limit = undefined) {
    if (limit) {
      return this._trace.slice(-limit);
    }
    return [...this._trace];
  }

  /**
   * Get current path (indices of choices made)
   *
   * @returns {Array<number>}
   */
  getPath() {
    return [...this._currentPath];
  }

  /**
   * Get statistics
   *
   * @returns {object}
   */
  getStats() {
    return {
      ...this._stats,
      currentDepth: this._continuations.length,
      traceLength: this._trace.length,
      pathLength: this._currentPath.length
    };
  }

  /**
   * Export state for serialization/debugging
   *
   * @returns {object}
   */
  exportState() {
    return {
      id: this.id,
      strategy: this.strategy,
      stats: this.getStats(),
      currentPath: this.getPath(),
      trace: this.traceEnabled ? this.getTrace(100) : [],
      continuationDepth: this._continuations.length
    };
  }

  /**
   * Reset context for reuse
   */
  reset() {
    this._alternatives = [];
    this._continuations = [];
    this._trace = [];
    this._backtrackCount = 0;
    this._choiceCount = 0;
    this._currentPath = [];
    this._stats = {
      choices: 0,
      backtracks: 0,
      successes: 0,
      failures: 0,
      maxDepth: 0
    };
  }
}

/**
 * Combinator types
 */
const CombinatorType = {
  GAMMA: 'γ',      // construct/destruct
  DELTA: 'δ',      // duplicate/erase
  EPSILON: 'ε',    // annihilate
};

/**
 * Port types for interaction net connections
 */
const PortType = {
  PRINCIPAL: 'principal',  // Active port (triggers interaction)
  AUXILIARY: 'auxiliary',  // Passive ports
};

/**
 * Base class for interaction net agents (nodes)
 */
class Agent {
  constructor(type, arity = 2) {
    this.id = require('crypto').randomUUID();
    this.type = type;
    this.arity = arity;
    this.ports = new Array(arity).fill(null);
    this.principal = 0; // Index of principal port
    this.data = null;   // Payload for the agent
    this.metadata = {}; // Extra metadata (timestamps, sources, etc.)
  }

  /**
   * Connect this agent's port to another agent's port
   */
  connect(myPort, other, otherPort) {
    if (myPort >= this.arity || otherPort >= other.arity) {
      throw new Error(`Invalid port index: ${myPort} or ${otherPort}`);
    }
    this.ports[myPort] = { agent: other, port: otherPort };
    other.ports[otherPort] = { agent: this, port: myPort };
    return this;
  }

  /**
   * Check if this agent can interact with another (principal ports connected)
   */
  canInteract(other) {
    const conn = this.ports[this.principal];
    return conn && conn.agent === other && conn.port === other.principal;
  }

  /**
   * Get the agent connected to the principal port
   */
  getPrincipalNeighbor() {
    const conn = this.ports[this.principal];
    return conn ? conn.agent : null;
  }
}

/**
 * Gamma (γ) - Construct/Destruct combinator
 *
 * Used for:
 * - Creating structure from components (construct)
 * - Extracting components from structure (destruct)
 *
 * In RFP workflow: Create RFP from requirements, Parse vendor responses
 */
class Gamma extends Agent {
  constructor(operation = 'construct') {
    super(CombinatorType.GAMMA, 3); // principal + 2 auxiliary
    this.operation = operation;
  }

  /**
   * Construct: Combine auxiliary inputs into a structure at principal
   * @param {any} left - Left input
   * @param {any} right - Right input
   * @returns {Object} Combined structure
   */
  static construct(left, right, schema = {}) {
    return {
      _type: 'γ_construct',
      left,
      right,
      schema,
      timestamp: Date.now(),
    };
  }

  /**
   * Destruct: Split a structure into components
   * @param {Object} structure - Structure to decompose
   * @returns {Object} { left, right } components
   */
  static destruct(structure) {
    if (structure?._type === 'γ_construct') {
      return { left: structure.left, right: structure.right };
    }
    // Generic destructuring
    if (Array.isArray(structure)) {
      const mid = Math.floor(structure.length / 2);
      return { left: structure.slice(0, mid), right: structure.slice(mid) };
    }
    if (typeof structure === 'object' && structure !== null) {
      const keys = Object.keys(structure);
      const mid = Math.floor(keys.length / 2);
      const left = {}, right = {};
      keys.forEach((k, i) => {
        if (i < mid) left[k] = structure[k];
        else right[k] = structure[k];
      });
      return { left, right };
    }
    return { left: structure, right: null };
  }
}

/**
 * Delta (δ) - Duplicate/Erase combinator
 *
 * Used for:
 * - Duplicating a value to multiple consumers (fan-out)
 * - Erasing/selecting one of multiple options (fan-in, AMB resolution)
 *
 * In RFP workflow: Send RFP to multiple vendors, Select winning vendor
 */
class Delta extends Agent {
  constructor(operation = 'duplicate') {
    super(CombinatorType.DELTA, 3); // principal + 2 auxiliary
    this.operation = operation;
  }

  /**
   * Duplicate: Fork a value to multiple consumers
   * @param {any} value - Value to duplicate
   * @param {number} count - Number of copies (default 2)
   * @returns {Array} Array of identical copies with tracking metadata
   */
  static duplicate(value, count = 2) {
    const forkId = require('crypto').randomUUID();
    return Array.from({ length: count }, (_, i) => ({
      _type: 'δ_fork',
      forkId,
      forkIndex: i,
      forkTotal: count,
      value: JSON.parse(JSON.stringify(value)), // Deep clone
      timestamp: Date.now(),
    }));
  }

  /**
   * Erase: Select one option from multiple (resolve AMB)
   * @param {Array} options - Array of forked options
   * @param {Function} selector - Selection function (receives options, returns index or item)
   * @returns {Object} Selected option with resolution metadata
   */
  static erase(options, selector) {
    if (!Array.isArray(options) || options.length === 0) {
      throw new Error('erase requires non-empty options array');
    }

    let selected;
    let selectedIndex;

    if (typeof selector === 'function') {
      const result = selector(options);
      if (typeof result === 'number') {
        selectedIndex = result;
        selected = options[result];
      } else {
        selectedIndex = options.indexOf(result);
        selected = result;
      }
    } else if (typeof selector === 'number') {
      selectedIndex = selector;
      selected = options[selector];
    } else {
      // Default: first option
      selectedIndex = 0;
      selected = options[0];
    }

    return {
      _type: 'δ_resolve',
      selected: selected?.value ?? selected,
      selectedIndex,
      totalOptions: options.length,
      forkId: options[0]?.forkId,
      erasedCount: options.length - 1,
      resolvedAt: Date.now(),
    };
  }

  /**
   * AMB: Non-deterministic choice (McCarthy's AMB operator)
   * Returns all possible values until one succeeds
   * @param {Array} alternatives - Possible values
   * @param {Function} predicate - Success predicate
   * @returns {Generator} Yields values until predicate succeeds
   */
  static *amb(alternatives, predicate = () => true) {
    for (const alt of alternatives) {
      if (predicate(alt)) {
        yield { success: true, value: alt };
        return;
      }
      yield { success: false, value: alt, reason: 'predicate failed' };
    }
    yield { success: false, value: null, reason: 'no alternatives matched' };
  }
}

/**
 * Epsilon (ε) - Annihilate combinator
 *
 * Used for:
 * - Cleanup and termination
 * - Signaling workflow completion
 * - Resource deallocation
 *
 * In RFP workflow: Workflow completion, Audit trail sealing
 */
class Epsilon extends Agent {
  constructor() {
    super(CombinatorType.EPSILON, 1); // Only principal port (terminator)
  }

  /**
   * Annihilate: Mark a computation as complete
   * @param {any} result - Final result
   * @param {Object} context - Completion context
   * @returns {Object} Completion record
   */
  static annihilate(result, context = {}) {
    return {
      _type: 'ε_complete',
      result,
      context,
      completedAt: Date.now(),
      sealed: true,
    };
  }

  /**
   * Check if a value represents completion
   */
  static isComplete(value) {
    return value?._type === 'ε_complete' && value?.sealed === true;
  }
}

/**
 * Interaction Net - Runtime for combinator reduction
 */
class InteractionNet extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
    this.activeEdges = []; // Edges where principal ports are connected
    this.reductionCount = 0;
  }

  /**
   * Add an agent to the net
   */
  addAgent(agent) {
    this.agents.set(agent.id, agent);
    return agent;
  }

  /**
   * Find all active pairs (principal-principal connections)
   */
  findActivePairs() {
    const pairs = [];
    const seen = new Set();

    for (const agent of this.agents.values()) {
      const neighbor = agent.getPrincipalNeighbor();
      if (neighbor && !seen.has(agent.id) && !seen.has(neighbor.id)) {
        if (agent.canInteract(neighbor)) {
          pairs.push([agent, neighbor]);
          seen.add(agent.id);
          seen.add(neighbor.id);
        }
      }
    }

    return pairs;
  }

  /**
   * Apply interaction rules to reduce the net
   * @returns {boolean} True if a reduction occurred
   */
  reduce() {
    const pairs = this.findActivePairs();
    if (pairs.length === 0) return false;

    for (const [a, b] of pairs) {
      this._interact(a, b);
      this.reductionCount++;
    }

    return true;
  }

  /**
   * Reduce until no more active pairs
   * @param {number} maxSteps - Maximum reduction steps (safety limit)
   */
  normalize(maxSteps = 10000) {
    let steps = 0;
    while (this.reduce() && steps < maxSteps) {
      steps++;
    }
    this.emit('normalized', { steps, agents: this.agents.size });
    return steps;
  }

  /**
   * Apply interaction rule for two agents
   */
  _interact(a, b) {
    // γ-γ interaction: annihilate and reconnect auxiliaries
    if (a.type === CombinatorType.GAMMA && b.type === CombinatorType.GAMMA) {
      this._gammaGamma(a, b);
    }
    // δ-δ interaction: cross-connect (duplication)
    else if (a.type === CombinatorType.DELTA && b.type === CombinatorType.DELTA) {
      this._deltaDelta(a, b);
    }
    // ε-* interaction: erase everything
    else if (a.type === CombinatorType.EPSILON || b.type === CombinatorType.EPSILON) {
      this._epsilonAny(a, b);
    }
    // γ-δ interaction: distribute
    else if ((a.type === CombinatorType.GAMMA && b.type === CombinatorType.DELTA) ||
             (a.type === CombinatorType.DELTA && b.type === CombinatorType.GAMMA)) {
      this._gammaOrDelta(a, b);
    }

    this.emit('interaction', { a: a.type, b: b.type, reductions: this.reductionCount });
  }

  _gammaGamma(a, b) {
    // Annihilate and cross-connect auxiliaries
    this._reconnect(a.ports[1], b.ports[1]);
    this._reconnect(a.ports[2], b.ports[2]);
    this.agents.delete(a.id);
    this.agents.delete(b.id);
  }

  _deltaDelta(a, b) {
    // Create cross-connections (4 new δ agents)
    const d1 = this.addAgent(new Delta());
    const d2 = this.addAgent(new Delta());
    const d3 = this.addAgent(new Delta());
    const d4 = this.addAgent(new Delta());

    // Wire up the new agents
    this._reconnect(a.ports[1], { agent: d1, port: 0 });
    this._reconnect(a.ports[2], { agent: d2, port: 0 });
    this._reconnect(b.ports[1], { agent: d3, port: 0 });
    this._reconnect(b.ports[2], { agent: d4, port: 0 });

    d1.connect(1, d3, 1);
    d1.connect(2, d4, 1);
    d2.connect(1, d3, 2);
    d2.connect(2, d4, 2);

    this.agents.delete(a.id);
    this.agents.delete(b.id);
  }

  _epsilonAny(a, b) {
    // Epsilon erases everything
    const epsilon = a.type === CombinatorType.EPSILON ? a : b;
    const other = a.type === CombinatorType.EPSILON ? b : a;

    // Propagate epsilon to auxiliary ports
    for (let i = 1; i < other.arity; i++) {
      const conn = other.ports[i];
      if (conn) {
        const newEpsilon = this.addAgent(new Epsilon());
        this._reconnect(conn, { agent: newEpsilon, port: 0 });
      }
    }

    this.agents.delete(epsilon.id);
    this.agents.delete(other.id);
  }

  _gammaOrDelta(a, b) {
    // Distribution: create new structure
    const gamma = a.type === CombinatorType.GAMMA ? a : b;
    const delta = a.type === CombinatorType.GAMMA ? b : a;

    const g1 = this.addAgent(new Gamma(gamma.operation));
    const g2 = this.addAgent(new Gamma(gamma.operation));
    const d1 = this.addAgent(new Delta(delta.operation));
    const d2 = this.addAgent(new Delta(delta.operation));

    // Complex rewiring for distribution
    this._reconnect(gamma.ports[1], { agent: d1, port: 0 });
    this._reconnect(gamma.ports[2], { agent: d2, port: 0 });
    this._reconnect(delta.ports[1], { agent: g1, port: 0 });
    this._reconnect(delta.ports[2], { agent: g2, port: 0 });

    g1.connect(1, d1, 1);
    g1.connect(2, d2, 1);
    g2.connect(1, d1, 2);
    g2.connect(2, d2, 2);

    this.agents.delete(gamma.id);
    this.agents.delete(delta.id);
  }

  _reconnect(oldConn, newConn) {
    if (oldConn && oldConn.agent && newConn && newConn.agent) {
      const target = oldConn.agent.ports[oldConn.port];
      if (target) {
        newConn.agent.ports[newConn.port] = target;
        target.agent.ports[target.port] = newConn;
      }
    }
  }
}

/**
 * High-level workflow combinator for common patterns
 */
class WorkflowCombinator {
  /**
   * Fan-out then fan-in pattern (map-reduce)
   * @param {any} input - Input to process
   * @param {Array<Function>} processors - Parallel processors
   * @param {Function} reducer - Reduction function
   */
  static async mapReduce(input, processors, reducer) {
    // Fan-out (δ duplicate)
    const forks = Delta.duplicate(input, processors.length);

    // Process in parallel
    const results = await Promise.all(
      forks.map((fork, i) => processors[i](fork.value))
    );

    // Fan-in (δ erase with custom reducer)
    return Delta.erase(results, (opts) => {
      return reducer(opts);
    });
  }

  /**
   * Pipeline pattern (sequential γ construct/destruct)
   * @param {any} input - Initial input
   * @param {Array<Function>} stages - Pipeline stages
   */
  static async pipeline(input, stages) {
    let current = input;
    const trace = [];

    for (const stage of stages) {
      const constructed = Gamma.construct(current, { stage: stage.name || 'anonymous' });
      current = await stage(current);
      const { left } = Gamma.destruct(constructed);
      trace.push({ input: left, output: current });
    }

    return Epsilon.annihilate(current, { trace, stageCount: stages.length });
  }

  /**
   * Conditional branching with AMB
   * @param {any} input - Input to test
   * @param {Array<{predicate: Function, handler: Function}>} branches - Conditional branches
   */
  static async branch(input, branches) {
    for (const { predicate, handler } of branches) {
      if (await predicate(input)) {
        const result = await handler(input);
        return Epsilon.annihilate(result, { branch: predicate.name || 'matched' });
      }
    }
    return Epsilon.annihilate(null, { branch: 'none', reason: 'no branch matched' });
  }
}

module.exports = {
  // Types
  CombinatorType,
  PortType,

  // Core combinators
  Agent,
  Gamma,
  Delta,
  Epsilon,

  // AMB context with backtracking
  AmbContext,

  // Runtime
  InteractionNet,

  // High-level patterns
  WorkflowCombinator,

  // Convenience exports
  construct: Gamma.construct,
  destruct: Gamma.destruct,
  duplicate: Delta.duplicate,
  erase: Delta.erase,
  amb: Delta.amb,
  annihilate: Epsilon.annihilate,
  isComplete: Epsilon.isComplete,
};
