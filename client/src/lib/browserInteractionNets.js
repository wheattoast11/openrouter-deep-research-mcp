/**
 * Browser-compatible Interaction Nets with Active-Pair Rewrites
 * Extended version with deterministic replay and amb-select strategy
 * 
 * Features:
 * - Active-pair reduction with event emission
 * - Amb-select strategy (minimal free-energy path)
 * - Deterministic replay via PRNG seeds
 * - Reduction history for perfect recurrence
 */

export const NodeType = {
  AGENT: 'agent',
  CONSTRUCTOR: 'constructor',
  DUPLICATOR: 'duplicator',
  ERASER: 'eraser',
  ROOT: 'root',
  AMB: 'amb'  // Ambiguous choice node
};

// Seeded PRNG for deterministic replay
class PRNG {
  constructor(seed = 0) {
    this.seed = seed;
  }
  
  next() {
    // Linear congruential generator
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
  
  reset(seed) {
    this.seed = seed;
  }
}

export class InteractionNet {
  constructor(seed = 0) {
    this.nodes = new Map();
    this.wires = new Map();
    this.nextNodeId = 0;
    this.nextWireId = 0;
    this.reductions = 0;
    this.reductionHistory = [];  // For deterministic replay
    this.prng = new PRNG(seed);
    this.seed = seed;
    this.listeners = new Map();  // Event listeners
  }

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

  erase(nodeId, recursive = true) {
    const node = this.nodes.get(nodeId);
    
    if (!node || !node.active) {
      return 0;
    }
    
    let erased = 0;
    
    if (recursive) {
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

  toDot() {
    let dot = 'digraph InteractionNet {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [style=filled, fontname="Arial"];\n';
    
    // Nodes
    for (const node of this.nodes.values()) {
      if (!node.active) continue;
      
      const shape = node.type === NodeType.ROOT ? 'doublecircle' : 'circle';
      const color = this._getNodeColor(node.type);
      const label = `${node.type}\\n${this._truncate(JSON.stringify(node.value), 20)}`;
      dot += `  ${node.id} [label="${label}", shape=${shape}, fillcolor="${color}"];\n`;
    }
    
    // Wires
    for (const wire of this.wires.values()) {
      const from = this.nodes.get(wire.from);
      const to = this.nodes.get(wire.to);
      if (from && from.active && to && to.active) {
        dot += `  ${wire.from} -> ${wire.to};\n`;
      }
    }
    
    dot += '}\n';
    return dot;
  }

  toJSON() {
    const nodes = [];
    const edges = [];
    
    for (const node of this.nodes.values()) {
      if (node.active) {
        nodes.push({
          id: node.id,
          type: node.type,
          label: this._truncate(JSON.stringify(node.value), 30)
        });
      }
    }
    
    for (const wire of this.wires.values()) {
      const from = this.nodes.get(wire.from);
      const to = this.nodes.get(wire.to);
      if (from && from.active && to && to.active) {
        edges.push({
          from: wire.from,
          to: wire.to
        });
      }
    }
    
    return { nodes, edges };
  }

  _removeNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    
    for (const wireId of [...node.inPorts, ...node.outPorts]) {
      this.wires.delete(wireId);
    }
    
    node.active = false;
  }

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

  _getNodeColor(type) {
    const colors = {
      [NodeType.ROOT]: '#FFD700',
      [NodeType.AGENT]: '#00FFFF',
      [NodeType.CONSTRUCTOR]: '#90EE90',
      [NodeType.DUPLICATOR]: '#FF69B4',
      [NodeType.ERASER]: '#FF6347'
    };
    return colors[type] || '#CCCCCC';
  }

  _truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }
  
  /**
   * Event emission for reductions
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }
  
  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    for (const cb of callbacks) {
      try {
        cb(data);
      } catch (e) {
        console.error('Event listener error:', e);
      }
    }
  }
  
  /**
   * Find active pairs (nodes connected by a wire that can reduce)
   */
  findActivePairs() {
    const pairs = [];
    
    for (const wire of this.wires.values()) {
      const from = this.nodes.get(wire.from);
      const to = this.nodes.get(wire.to);
      
      if (!from || !to || !from.active || !to.active) continue;
      
      // Active pair conditions:
      // 1. DUPLICATOR → DUPLICATOR (annihilation)
      // 2. ERASER → any (erasure)
      // 3. CONSTRUCTOR → CONSTRUCTOR (merge)
      if (
        (from.type === NodeType.DUPLICATOR && to.type === NodeType.DUPLICATOR) ||
        (from.type === NodeType.ERASER) ||
        (from.type === NodeType.CONSTRUCTOR && to.type === NodeType.CONSTRUCTOR)
      ) {
        pairs.push({ wire, from, to });
      }
    }
    
    return pairs;
  }
  
  /**
   * Reduce an active pair
   */
  reduceActivePair(pair) {
    const { wire, from, to } = pair;
    
    this.emit('reduction', {
      type: 'active_pair',
      from: from.id,
      to: to.id,
      fromType: from.type,
      toType: to.type,
      timestamp: Date.now()
    });
    
    // Record reduction for replay
    this.reductionHistory.push({
      step: this.reductions,
      from: from.id,
      to: to.id,
      fromType: from.type,
      toType: to.type,
      seed: this.prng.seed
    });
    
    // Perform reduction based on node types
    if (from.type === NodeType.ERASER) {
      // Eraser consumes the other node
      this.erase(to.id, true);
      this.erase(from.id, false);
    } else if (from.type === NodeType.DUPLICATOR && to.type === NodeType.DUPLICATOR) {
      // Duplicator annihilation
      this._removeNode(from.id);
      this._removeNode(to.id);
    } else if (from.type === NodeType.CONSTRUCTOR && to.type === NodeType.CONSTRUCTOR) {
      // Constructor merge
      const merged = this.createNode(NodeType.CONSTRUCTOR, {
        ...from.value,
        ...to.value
      });
      this._removeNode(from.id);
      this._removeNode(to.id);
    }
    
    this.reductions++;
  }
  
  /**
   * Reduce all active pairs
   */
  reduceAll() {
    let pairs = this.findActivePairs();
    let iterations = 0;
    const maxIterations = 1000;  // Prevent infinite loops
    
    while (pairs.length > 0 && iterations < maxIterations) {
      for (const pair of pairs) {
        this.reduceActivePair(pair);
      }
      pairs = this.findActivePairs();
      iterations++;
    }
    
    return iterations;
  }
  
  /**
   * Amb-select strategy: choose minimal free-energy path
   * Free energy F = Cost - T * log(Capability)
   * Lower F = more favorable path
   */
  ambSelect(choices, temperature = 1.0) {
    if (choices.length === 0) return null;
    if (choices.length === 1) return choices[0];
    
    // Calculate free energy for each choice
    const energies = choices.map(choice => {
      const cost = choice.cost || 1.0;
      const capability = choice.capability || 1.0;
      const freeEnergy = cost - temperature * Math.log(capability);
      return { choice, freeEnergy };
    });
    
    // Sort by free energy (ascending)
    energies.sort((a, b) => a.freeEnergy - b.freeEnergy);
    
    // Use PRNG for deterministic selection among equal energies
    const minEnergy = energies[0].freeEnergy;
    const candidates = energies.filter(e => Math.abs(e.freeEnergy - minEnergy) < 0.001);
    
    const index = Math.floor(this.prng.next() * candidates.length);
    const selected = candidates[index].choice;
    
    this.emit('amb_select', {
      choices: choices.length,
      selected: selected.id || selected.name,
      freeEnergy: candidates[index].freeEnergy,
      timestamp: Date.now()
    });
    
    return selected;
  }
  
  /**
   * Replay reduction history with same seed
   */
  replay() {
    const history = [...this.reductionHistory];
    this.reset(this.seed);
    
    for (const step of history) {
      // Restore PRNG state
      this.prng.reset(step.seed);
      
      // Find and reduce the same pair
      const from = this.nodes.get(step.from);
      const to = this.nodes.get(step.to);
      
      if (from && to) {
        const wire = Array.from(this.wires.values()).find(
          w => w.from === step.from && w.to === step.to
        );
        
        if (wire) {
          this.reduceActivePair({ wire, from, to });
        }
      }
    }
    
    this.emit('replay_complete', {
      steps: history.length,
      timestamp: Date.now()
    });
  }
  
  /**
   * Reset net to initial state
   */
  reset(seed = null) {
    this.nodes.clear();
    this.wires.clear();
    this.nextNodeId = 0;
    this.nextWireId = 0;
    this.reductions = 0;
    this.reductionHistory = [];
    
    if (seed !== null) {
      this.seed = seed;
      this.prng.reset(seed);
    }
    
    this.emit('reset', { seed: this.seed, timestamp: Date.now() });
  }
  
  /**
   * Export reduction history for persistence
   */
  exportHistory() {
    return {
      seed: this.seed,
      reductions: this.reductions,
      history: this.reductionHistory
    };
  }
  
  /**
   * Import reduction history and replay
   */
  importHistory(exported) {
    this.seed = exported.seed;
    this.reductionHistory = exported.history;
    this.replay();
  }
}

export function createNet(seed = 0) {
  return new InteractionNet(seed);
}

/**
 * Get deterministic seed from environment
 */
export function getDeterministicNetSeed() {
  const envSeed = import.meta?.env?.VITE_DETERMINISTIC_SEED;
  if (envSeed && !isNaN(Number(envSeed)) && Number(envSeed) !== 0) {
    return Number(envSeed);
  }
  return Date.now();  // Non-deterministic fallback
}

