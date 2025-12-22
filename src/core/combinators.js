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
