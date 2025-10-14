/**
 * Browser-compatible Interaction Nets
 * Simplified version of interactionNets.js for use in React components
 */

export const NodeType = {
  AGENT: 'agent',
  CONSTRUCTOR: 'constructor',
  DUPLICATOR: 'duplicator',
  ERASER: 'eraser',
  ROOT: 'root'
};

export class InteractionNet {
  constructor() {
    this.nodes = new Map();
    this.wires = new Map();
    this.nextNodeId = 0;
    this.nextWireId = 0;
    this.reductions = 0;
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
}

export function createNet() {
  return new InteractionNet();
}

