/**
 * Interaction Nets - Combinatorial Reduction via Interaction Combinators
 * 
 * Based on Yves Lafont's interaction combinators and interaction nets.
 * Provides primitives for non-linear computation graph optimization.
 * 
 * Core operators:
 * - Annihilation (α ⊗ α* → ε): Dual nodes cancel out
 * - Duplication (δ): Fan-out computation to multiple paths
 * - Erasure (ε): Prune unused computation paths
 * 
 * Applications:
 * - Prune low-confidence reasoning branches
 * - Duplicate high-value contexts for parallel agents
 * - Annihilate contradictory hypotheses
 * - Optimize computation graphs by removing redundancy
 * 
 * @module core/interactionNets
 */

/**
 * Node types in the interaction net
 */
const NodeType = {
  AGENT: 'agent', // Active computation node
  CONSTRUCTOR: 'constructor', // Data constructor
  DUPLICATOR: 'duplicator', // δ node
  ERASER: 'eraser', // ε node
  ROOT: 'root' // Entry point
};

/**
 * Interaction Net Graph
 * 
 * Manages nodes and wires in the computation graph.
 */
class InteractionNet {
  constructor() {
    this.nodes = new Map(); // nodeId -> node
    this.wires = new Map(); // wireId -> { from, to, value }
    this.nextNodeId = 0;
    this.nextWireId = 0;
    this.reductions = 0; // Count of reduction steps
  }

  /**
   * Create a new node in the network
   * 
   * @param {string} type - Node type
   * @param {*} value - Node value/payload
   * @param {Object} metadata - Additional metadata
   * @returns {number} Node ID
   */
  createNode(type, value = null, metadata = {}) {
    const nodeId = this.nextNodeId++;
    
    this.nodes.set(nodeId, {
      id: nodeId,
      type,
      value,
      metadata,
      inPorts: [],
      outPorts: [],
      active: true
    });
    
    return nodeId;
  }

  /**
   * Connect two nodes with a wire
   * 
   * @param {number} fromNodeId - Source node
   * @param {number} toNodeId - Target node
   * @param {*} value - Value flowing through wire
   * @returns {number} Wire ID
   */
  connect(fromNodeId, toNodeId, value = null) {
    const wireId = this.nextWireId++;
    
    const from = this.nodes.get(fromNodeId);
    const to = this.nodes.get(toNodeId);
    
    if (!from || !to) {
      throw new Error(`Invalid node IDs: ${fromNodeId}, ${toNodeId}`);
    }
    
    this.wires.set(wireId, { id: wireId, from: fromNodeId, to: toNodeId, value });
    
    from.outPorts.push(wireId);
    to.inPorts.push(wireId);
    
    return wireId;
  }

  /**
   * Annihilate: Remove dual nodes that cancel out
   * 
   * α ⊗ α* → ε (dual nodes annihilate to nothing)
   * 
   * Use case: Remove contradictory hypotheses or redundant computations
   * 
   * @param {number} nodeId1 - First node
   * @param {number} nodeId2 - Second node
   * @returns {boolean} True if annihilation occurred
   */
  annihilate(nodeId1, nodeId2) {
    const node1 = this.nodes.get(nodeId1);
    const node2 = this.nodes.get(nodeId2);
    
    if (!node1 || !node2 || !node1.active || !node2.active) {
      return false;
    }
    
    // Check if nodes are duals (contradictory or redundant)
    if (!this._areDual(node1, node2)) {
      return false;
    }
    
    // Remove both nodes and their wires
    this._removeNode(nodeId1);
    this._removeNode(nodeId2);
    
    this.reductions++;
    return true;
  }

  /**
   * Duplicate: Fan-out a computation to multiple paths
   * 
   * δ(x) → (x, x, ..., x)
   * 
   * Use case: Duplicate high-value context for parallel agent processing
   * 
   * @param {number} nodeId - Node to duplicate
   * @param {number} fanout - Number of copies
   * @returns {Array<number>} IDs of duplicated nodes
   */
  duplicate(nodeId, fanout = 2) {
    const node = this.nodes.get(nodeId);
    
    if (!node || !node.active) {
      return [];
    }
    
    const duplicates = [];
    
    for (let i = 0; i < fanout; i++) {
      const dupId = this.createNode(
        node.type,
        this._deepClone(node.value),
        { ...node.metadata, duplicateOf: nodeId, duplicateIndex: i }
      );
      
      duplicates.push(dupId);
    }
    
    this.reductions++;
    return duplicates;
  }

  /**
   * Erase: Prune unused computation path
   * 
   * ε(x) → ∅ (erase node and all downstream)
   * 
   * Use case: Prune low-confidence reasoning paths early
   * 
   * @param {number} nodeId - Node to erase
   * @param {boolean} recursive - Erase downstream nodes (default: true)
   * @returns {number} Number of nodes erased
   */
  erase(nodeId, recursive = true) {
    const node = this.nodes.get(nodeId);
    
    if (!node || !node.active) {
      return 0;
    }
    
    let erased = 0;
    
    if (recursive) {
      // Erase all downstream nodes
      const downstream = this._getDownstream(nodeId);
      for (const downId of downstream) {
        this._removeNode(downId);
        erased++;
      }
    }
    
    this._removeNode(nodeId);
    erased++;
    
    this.reductions++;
    return erased;
  }

  /**
   * Gate: Filter nodes by predicate (generalized erasure)
   * 
   * Only keep nodes that satisfy the predicate.
   * 
   * @param {Function} predicate - Filter function (node => boolean)
   * @returns {number} Number of nodes erased
   */
  gate(predicate) {
    const toErase = [];
    
    for (const [nodeId, node] of this.nodes.entries()) {
      if (node.active && !predicate(node)) {
        toErase.push(nodeId);
      }
    }
    
    let erased = 0;
    for (const nodeId of toErase) {
      erased += this.erase(nodeId, false); // Don't recurse (we're filtering all)
    }
    
    return erased;
  }

  /**
   * Reduce: Apply reduction rules until normal form
   * 
   * Repeatedly apply annihilation, erasure, and other rules
   * until no more reductions are possible.
   * 
   * @param {Object} options - Reduction options
   * @param {number} options.maxSteps - Max reduction steps (default: 1000)
   * @param {Function} options.customRule - Custom reduction rule
   * @returns {Object} Reduction result
   */
  async reduce(options = {}) {
    const { maxSteps = 1000, customRule = null } = options;
    const startReductions = this.reductions;
    
    let step = 0;
    let changed = true;
    
    while (changed && step < maxSteps) {
      changed = false;
      step++;
      
      // Try annihilations
      const dualPairs = this._findDualPairs();
      for (const [id1, id2] of dualPairs) {
        if (this.annihilate(id1, id2)) {
          changed = true;
        }
      }
      
      // Try erasures (nodes with no outgoing wires)
      const deadEnds = this._findDeadEnds();
      for (const nodeId of deadEnds) {
        if (this.erase(nodeId, false)) {
          changed = true;
        }
      }
      
      // Apply custom rule if provided
      if (customRule) {
        const customChanged = await customRule(this);
        changed = changed || customChanged;
      }
    }
    
    return {
      steps: step,
      reductions: this.reductions - startReductions,
      normalForm: !changed,
      remainingNodes: this.nodes.size
    };
  }

  /**
   * Optimize: Remove redundant nodes and simplify graph
   * 
   * @returns {Object} Optimization stats
   */
  optimize() {
    const before = this.nodes.size;
    
    // Remove disconnected nodes
    const disconnected = [];
    for (const [nodeId, node] of this.nodes.entries()) {
      if (node.inPorts.length === 0 && node.outPorts.length === 0 && node.type !== NodeType.ROOT) {
        disconnected.push(nodeId);
      }
    }
    
    for (const nodeId of disconnected) {
      this._removeNode(nodeId);
    }
    
    // Merge duplicate paths
    const duplicates = this._findDuplicatePaths();
    for (const [id1, id2] of duplicates) {
      this.annihilate(id1, id2);
    }
    
    const after = this.nodes.size;
    
    return {
      before,
      after,
      removed: before - after,
      compressionRatio: after / before
    };
  }

  /**
   * Get graph statistics
   * 
   * @returns {Object} Graph stats
   */
  getStats() {
    const activeNodes = Array.from(this.nodes.values()).filter(n => n.active).length;
    const totalWires = this.wires.size;
    
    const nodesByType = {};
    for (const node of this.nodes.values()) {
      if (node.active) {
        nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
      }
    }
    
    return {
      totalNodes: this.nodes.size,
      activeNodes,
      totalWires,
      reductions: this.reductions,
      nodesByType
    };
  }

  /**
   * Export graph as DOT format for visualization
   * 
   * @returns {string} DOT format graph
   */
  toDot() {
    let dot = 'digraph InteractionNet {\n';
    dot += '  rankdir=LR;\n';
    
    // Nodes
    for (const node of this.nodes.values()) {
      if (!node.active) continue;
      
      const shape = node.type === NodeType.ROOT ? 'doublecircle' : 'circle';
      const label = `${node.type}\\n${node.value || ''}`;
      dot += `  ${node.id} [label="${label}", shape=${shape}];\n`;
    }
    
    // Wires
    for (const wire of this.wires.values()) {
      const label = wire.value ? `label="${wire.value}"` : '';
      dot += `  ${wire.from} -> ${wire.to} [${label}];\n`;
    }
    
    dot += '}\n';
    return dot;
  }

  /**
   * Check if two nodes are duals (contradictory)
   * @private
   */
  _areDual(node1, node2) {
    // Nodes are dual if they represent contradictory states
    if (node1.metadata.contradicts === node2.id) return true;
    if (node2.metadata.contradicts === node1.id) return true;
    
    // Check value contradiction
    if (node1.value && node2.value) {
      if (typeof node1.value === 'object' && node1.value.confidence !== undefined) {
        // Low confidence nodes are duals
        return node1.value.confidence + node2.value.confidence < 0.5;
      }
    }
    
    return false;
  }

  /**
   * Remove a node and its wires
   * @private
   */
  _removeNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    
    // Remove all connected wires
    for (const wireId of [...node.inPorts, ...node.outPorts]) {
      this.wires.delete(wireId);
    }
    
    node.active = false;
  }

  /**
   * Get all downstream nodes
   * @private
   */
  _getDownstream(nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);
    
    const node = this.nodes.get(nodeId);
    if (!node) return [];
    
    const downstream = [];
    
    for (const wireId of node.outPorts) {
      const wire = this.wires.get(wireId);
      if (wire) {
        downstream.push(wire.to);
        downstream.push(...this._getDownstream(wire.to, visited));
      }
    }
    
    return downstream;
  }

  /**
   * Find pairs of dual nodes
   * @private
   */
  _findDualPairs() {
    const pairs = [];
    const nodes = Array.from(this.nodes.values()).filter(n => n.active);
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (this._areDual(nodes[i], nodes[j])) {
          pairs.push([nodes[i].id, nodes[j].id]);
        }
      }
    }
    
    return pairs;
  }

  /**
   * Find nodes with no outgoing wires
   * @private
   */
  _findDeadEnds() {
    const deadEnds = [];
    
    for (const [nodeId, node] of this.nodes.entries()) {
      if (node.active && node.outPorts.length === 0 && node.type !== NodeType.ROOT) {
        deadEnds.push(nodeId);
      }
    }
    
    return deadEnds;
  }

  /**
   * Find duplicate computation paths
   * @private
   */
  _findDuplicatePaths() {
    // Simple heuristic: nodes with same type and value
    const duplicates = [];
    const nodes = Array.from(this.nodes.values()).filter(n => n.active);
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].type === nodes[j].type &&
            JSON.stringify(nodes[i].value) === JSON.stringify(nodes[j].value)) {
          duplicates.push([nodes[i].id, nodes[j].id]);
        }
      }
    }
    
    return duplicates;
  }

  /**
   * Deep clone a value
   * @private
   */
  _deepClone(value) {
    if (value === null || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
  }
}

/**
 * Create a new interaction net
 * 
 * @returns {InteractionNet} New interaction net instance
 */
function createNet() {
  return new InteractionNet();
}

module.exports = {
  InteractionNet,
  NodeType,
  createNet
};


