/**
 * DAG Execution Model
 *
 * Implements Directed Acyclic Graph for parallel task execution.
 * Used for orchestrating HVM reductions and agent workflows.
 *
 * Features:
 * - Topological sorting with cycle detection (Kahn's algorithm)
 * - Parallel execution of independent nodes
 * - Status tracking and progress events
 *
 * @module core/dag
 */

'use strict';

const crypto = require('crypto');
const { EventEmitter } = require('events');

// Lazy-loaded modules
let _resonanceModule = null;
let _stabilizationModule = null;

function getResonanceModule() {
  if (!_resonanceModule) {
    try {
      _resonanceModule = require('./resonance');
    } catch (e) {
      _resonanceModule = null;
    }
  }
  return _resonanceModule;
}

function getStabilizationModule() {
  if (!_stabilizationModule) {
    try {
      _stabilizationModule = require('./stabilization');
    } catch (e) {
      _stabilizationModule = null;
    }
  }
  return _stabilizationModule;
}

/**
 * Node status
 */
const NodeStatus = {
  PENDING: 'pending',
  READY: 'ready',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

/**
 * DAG Node - a task node in the execution graph
 *
 * @class
 */
class DAGNode {
  /**
   * @param {string} id - Unique identifier
   * @param {object} [options]
   * @param {*} [options.operation] - The operation to execute
   * @param {string} [options.name] - Human-readable name
   * @param {object} [options.data] - Associated data
   */
  constructor(id, options = {}) {
    this.id = id || crypto.randomUUID();
    this.name = options.name || this.id.slice(0, 8);
    this.operation = options.operation || null;
    this.data = options.data || {};

    this.dependencies = new Set();
    this.dependents = new Set();
    this.status = NodeStatus.PENDING;
    this.result = null;
    this.error = null;

    this.startTime = null;
    this.endTime = null;

    // Resonance tracking (v1.14.1)
    this.resonance = {
      phase: options.phase ?? null,           // IQ phase for this node's model
      model: options.model ?? null,           // Model identifier
      variance: null,                          // Recent variance (lower = more stable)
      phaseLocked: false,                      // True if phase-locked with other nodes
      priority: 0                              // Resonance-based priority adjustment
    };
  }

  /**
   * Update resonance metrics for this node
   *
   * @param {object} metrics
   * @param {number} [metrics.variance] - Recent variance
   * @param {boolean} [metrics.phaseLocked] - Phase lock status
   * @param {number} [metrics.phase] - Current phase
   */
  updateResonance(metrics) {
    if (metrics.variance !== undefined) {
      this.resonance.variance = metrics.variance;
      // Lower variance = higher priority
      this.resonance.priority = metrics.phaseLocked
        ? 10 - metrics.variance * 5  // Boost phase-locked nodes
        : 5 - metrics.variance * 5;
    }
    if (metrics.phaseLocked !== undefined) {
      this.resonance.phaseLocked = metrics.phaseLocked;
    }
    if (metrics.phase !== undefined) {
      this.resonance.phase = metrics.phase;
    }
  }

  /**
   * Get resonance priority (higher = execute first)
   *
   * @returns {number}
   */
  getResonancePriority() {
    return this.resonance.priority;
  }

  /**
   * Add a dependency (this node depends on other)
   *
   * @param {DAGNode} node
   */
  addDependency(node) {
    this.dependencies.add(node.id);
    node.dependents.add(this.id);
  }

  /**
   * Check if node is ready to execute
   * (all dependencies completed successfully)
   *
   * @param {Map<string, DAGNode>} nodeMap
   * @returns {boolean}
   */
  isReady(nodeMap) {
    if (this.status !== NodeStatus.PENDING) return false;

    for (const depId of this.dependencies) {
      const dep = nodeMap.get(depId);
      if (!dep || dep.status !== NodeStatus.COMPLETED) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if node is blocked (has failed dependencies)
   *
   * @param {Map<string, DAGNode>} nodeMap
   * @returns {boolean}
   */
  isBlocked(nodeMap) {
    for (const depId of this.dependencies) {
      const dep = nodeMap.get(depId);
      if (dep && (dep.status === NodeStatus.FAILED || dep.status === NodeStatus.SKIPPED)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get execution duration in ms
   *
   * @returns {number|null}
   */
  get duration() {
    if (!this.startTime) return null;
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }

  /**
   * Serialize to JSON
   *
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      dependencies: [...this.dependencies],
      dependents: [...this.dependents],
      duration: this.duration,
      data: this.data,
      resonance: { ...this.resonance }
    };
  }
}

/**
 * Interaction DAG - execution graph with parallel scheduling
 *
 * @class
 * @extends EventEmitter
 */
class InteractionDAG extends EventEmitter {
  constructor() {
    super();
    this.nodes = new Map();
    this._executionOrder = null;
  }

  /**
   * Add a node to the DAG
   *
   * @param {DAGNode} node
   * @returns {DAGNode}
   */
  addNode(node) {
    this.nodes.set(node.id, node);
    this._executionOrder = null; // Invalidate cache
    return node;
  }

  /**
   * Create and add a new node
   *
   * @param {string} [id]
   * @param {object} [options]
   * @returns {DAGNode}
   */
  createNode(id, options = {}) {
    const node = new DAGNode(id, options);
    return this.addNode(node);
  }

  /**
   * Add dependency edge: from depends on to
   *
   * @param {string} fromId
   * @param {string} toId
   */
  addEdge(fromId, toId) {
    const from = this.nodes.get(fromId);
    const to = this.nodes.get(toId);
    if (from && to) {
      from.addDependency(to);
      this._executionOrder = null;
    }
  }

  /**
   * Topological sort using Kahn's algorithm
   *
   * @returns {{ order: Array<string>, hasCycle: boolean }}
   */
  topologicalSort() {
    const inDegree = new Map();
    const queue = [];
    const order = [];

    // Initialize in-degrees
    for (const [id, node] of this.nodes) {
      inDegree.set(id, node.dependencies.size);
      if (node.dependencies.size === 0) {
        queue.push(id);
      }
    }

    // Process nodes with no dependencies
    while (queue.length > 0) {
      const nodeId = queue.shift();
      order.push(nodeId);

      const node = this.nodes.get(nodeId);
      for (const depId of node.dependents) {
        const newDegree = inDegree.get(depId) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) {
          queue.push(depId);
        }
      }
    }

    const hasCycle = order.length !== this.nodes.size;
    return { order, hasCycle };
  }

  /**
   * Check if DAG is valid (no cycles)
   *
   * @returns {boolean}
   */
  isValid() {
    const { hasCycle } = this.topologicalSort();
    return !hasCycle;
  }

  /**
   * Find nodes that can be executed in parallel
   *
   * @returns {Array<DAGNode>}
   */
  findParallelizable() {
    const ready = [];
    for (const node of this.nodes.values()) {
      if (node.isReady(this.nodes)) {
        ready.push(node);
      }
    }
    return ready;
  }

  /**
   * Group nodes into execution levels
   *
   * Level 0: No dependencies
   * Level N: Dependencies all in levels 0..N-1
   *
   * @returns {Array<Array<DAGNode>>}
   */
  getLevels() {
    const { order, hasCycle } = this.topologicalSort();
    if (hasCycle) {
      throw new Error('DAG contains cycle, cannot determine levels');
    }

    const levels = [];
    const nodeLevel = new Map();

    for (const id of order) {
      const node = this.nodes.get(id);
      let level = 0;

      // Level is max of dependency levels + 1
      for (const depId of node.dependencies) {
        const depLevel = nodeLevel.get(depId) || 0;
        level = Math.max(level, depLevel + 1);
      }

      nodeLevel.set(id, level);

      while (levels.length <= level) {
        levels.push([]);
      }
      levels[level].push(node);
    }

    return levels;
  }

  /**
   * Execute DAG with given executor function
   *
   * @param {Function} executor - async (node, results) => result
   * @param {object} [options]
   * @param {number} [options.parallelism=4] - Max parallel executions
   * @param {boolean} [options.stopOnFailure=true] - Stop if any node fails
   * @returns {Promise<Map<string, *>>} - Results by node ID
   */
  async execute(executor, options = {}) {
    const { parallelism = 4, stopOnFailure = true } = options;
    const results = new Map();

    const { hasCycle } = this.topologicalSort();
    if (hasCycle) {
      throw new Error('Cannot execute DAG with cycles');
    }

    // Reset all nodes to pending
    for (const node of this.nodes.values()) {
      node.status = NodeStatus.PENDING;
      node.result = null;
      node.error = null;
    }

    this.emit('execution:start', { nodeCount: this.nodes.size });

    // Execute level by level
    const levels = this.getLevels();

    for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
      const level = levels[levelIdx];
      this.emit('level:start', { level: levelIdx, nodeCount: level.length });

      // Process level in chunks based on parallelism
      for (let i = 0; i < level.length; i += parallelism) {
        const batch = level.slice(i, i + parallelism);
        const batchPromises = batch.map(async (node) => {
          // Check if blocked by failed dependency
          if (node.isBlocked(this.nodes)) {
            node.status = NodeStatus.SKIPPED;
            this.emit('node:skipped', { node: node.toJSON() });
            return;
          }

          node.status = NodeStatus.RUNNING;
          node.startTime = Date.now();
          this.emit('node:start', { node: node.toJSON() });

          try {
            const result = await executor(node, results);
            node.result = result;
            node.status = NodeStatus.COMPLETED;
            node.endTime = Date.now();
            results.set(node.id, result);
            this.emit('node:complete', { node: node.toJSON(), result });
          } catch (error) {
            node.error = error;
            node.status = NodeStatus.FAILED;
            node.endTime = Date.now();
            this.emit('node:failed', { node: node.toJSON(), error: error.message });

            if (stopOnFailure) {
              throw error;
            }
          }
        });

        await Promise.all(batchPromises);
      }

      this.emit('level:complete', { level: levelIdx });
    }

    this.emit('execution:complete', { results: results.size });
    return results;
  }

  /**
   * Execute DAG with resonance-aware scheduling
   *
   * Prioritizes nodes based on:
   * 1. Phase-locked nodes (highest priority)
   * 2. Low-variance nodes (more stable)
   * 3. Defers high-variance nodes until resonance stabilizes
   *
   * @param {Function} executor - async (node, results) => result
   * @param {object} [options]
   * @param {number} [options.parallelism=4] - Max parallel executions
   * @param {boolean} [options.stopOnFailure=true] - Stop if any node fails
   * @param {number} [options.stabilizationThreshold=0.3] - Variance threshold for stability
   * @param {boolean} [options.waitForStabilization=false] - Wait for unstable nodes
   * @param {number} [options.maxDeferrals=3] - Max times to defer unstable nodes
   * @returns {Promise<Map<string, *>>} - Results by node ID
   */
  async executeWithResonance(executor, options = {}) {
    const {
      parallelism = 4,
      stopOnFailure = true,
      stabilizationThreshold = 0.3,
      waitForStabilization = false,
      maxDeferrals = 3
    } = options;

    const results = new Map();
    const deferrals = new Map(); // Track how many times each node was deferred

    const { hasCycle } = this.topologicalSort();
    if (hasCycle) {
      throw new Error('Cannot execute DAG with cycles');
    }

    // Reset all nodes to pending
    for (const node of this.nodes.values()) {
      node.status = NodeStatus.PENDING;
      node.result = null;
      node.error = null;
      deferrals.set(node.id, 0);
    }

    // Get resonance module for stabilization monitoring
    const stabilizationMod = getStabilizationModule();
    const monitor = stabilizationMod?.getGlobalMonitor?.() ?? null;

    this.emit('execution:start', {
      nodeCount: this.nodes.size,
      resonanceAware: true,
      hasStabilizationMonitor: !!monitor
    });

    // Execute level by level with resonance-aware ordering
    const levels = this.getLevels();

    for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
      let level = levels[levelIdx];

      // Sort level by resonance priority (higher first)
      level = this._sortByResonancePriority(level);

      this.emit('level:start', {
        level: levelIdx,
        nodeCount: level.length,
        resonanceOrder: level.map(n => ({ id: n.id, priority: n.getResonancePriority() }))
      });

      // Partition into stable and unstable nodes
      const { stable, unstable } = this._partitionByStability(level, stabilizationThreshold);

      // Execute stable nodes first
      await this._executeBatch(stable, executor, results, parallelism, stopOnFailure);

      // Handle unstable nodes
      if (unstable.length > 0) {
        if (waitForStabilization) {
          // Wait for system to stabilize before executing unstable nodes
          await this._waitForStabilization(monitor, stabilizationThreshold);
        }

        // Check if we should defer or execute unstable nodes
        const toExecute = [];
        const toDefer = [];

        for (const node of unstable) {
          const deferCount = deferrals.get(node.id);
          if (deferCount < maxDeferrals && node.resonance.variance > stabilizationThreshold * 2) {
            // High variance, defer if possible
            toDefer.push(node);
            deferrals.set(node.id, deferCount + 1);
          } else {
            toExecute.push(node);
          }
        }

        // Execute nodes that can't be deferred further
        if (toExecute.length > 0) {
          this.emit('resonance:executing_unstable', {
            level: levelIdx,
            nodes: toExecute.map(n => n.id)
          });
          await this._executeBatch(toExecute, executor, results, parallelism, stopOnFailure);
        }

        // Deferred nodes will be processed at end of all levels
        if (toDefer.length > 0) {
          this.emit('resonance:deferred', {
            level: levelIdx,
            nodes: toDefer.map(n => ({ id: n.id, deferrals: deferrals.get(n.id) }))
          });
        }
      }

      this.emit('level:complete', { level: levelIdx });
    }

    // Process any remaining deferred nodes
    const deferredNodes = [...this.nodes.values()].filter(n => n.status === NodeStatus.PENDING);
    if (deferredNodes.length > 0) {
      this.emit('resonance:processing_deferred', { count: deferredNodes.length });

      // Final attempt at stabilization
      if (waitForStabilization && monitor) {
        await this._waitForStabilization(monitor, stabilizationThreshold);
      }

      await this._executeBatch(deferredNodes, executor, results, parallelism, stopOnFailure);
    }

    this.emit('execution:complete', {
      results: results.size,
      resonanceAware: true
    });

    return results;
  }

  /**
   * Sort nodes by resonance priority (higher first)
   *
   * @private
   * @param {Array<DAGNode>} nodes
   * @returns {Array<DAGNode>}
   */
  _sortByResonancePriority(nodes) {
    return [...nodes].sort((a, b) => {
      const priorityDiff = b.getResonancePriority() - a.getResonancePriority();
      if (priorityDiff !== 0) return priorityDiff;

      // Secondary sort: phase-locked nodes first
      if (a.resonance.phaseLocked && !b.resonance.phaseLocked) return -1;
      if (!a.resonance.phaseLocked && b.resonance.phaseLocked) return 1;

      return 0;
    });
  }

  /**
   * Partition nodes into stable and unstable based on variance threshold
   *
   * @private
   * @param {Array<DAGNode>} nodes
   * @param {number} threshold
   * @returns {{ stable: Array<DAGNode>, unstable: Array<DAGNode> }}
   */
  _partitionByStability(nodes, threshold) {
    const stable = [];
    const unstable = [];

    for (const node of nodes) {
      // Nodes without variance data are considered stable
      if (node.resonance.variance === null || node.resonance.variance <= threshold) {
        stable.push(node);
      } else if (node.resonance.phaseLocked) {
        // Phase-locked nodes are stable even with higher variance
        stable.push(node);
      } else {
        unstable.push(node);
      }
    }

    return { stable, unstable };
  }

  /**
   * Execute a batch of nodes in parallel
   *
   * @private
   */
  async _executeBatch(nodes, executor, results, parallelism, stopOnFailure) {
    for (let i = 0; i < nodes.length; i += parallelism) {
      const batch = nodes.slice(i, i + parallelism);
      const batchPromises = batch.map(async (node) => {
        if (node.isBlocked(this.nodes)) {
          node.status = NodeStatus.SKIPPED;
          this.emit('node:skipped', { node: node.toJSON() });
          return;
        }

        node.status = NodeStatus.RUNNING;
        node.startTime = Date.now();
        this.emit('node:start', { node: node.toJSON() });

        try {
          const result = await executor(node, results);
          node.result = result;
          node.status = NodeStatus.COMPLETED;
          node.endTime = Date.now();
          results.set(node.id, result);
          this.emit('node:complete', { node: node.toJSON(), result });
        } catch (error) {
          node.error = error;
          node.status = NodeStatus.FAILED;
          node.endTime = Date.now();
          this.emit('node:failed', { node: node.toJSON(), error: error.message });

          if (stopOnFailure) {
            throw error;
          }
        }
      });

      await Promise.all(batchPromises);
    }
  }

  /**
   * Wait for system stabilization
   *
   * @private
   * @param {object} monitor - StabilizationMonitor instance
   * @param {number} threshold - Variance threshold
   * @param {number} [timeoutMs=5000] - Max wait time
   */
  async _waitForStabilization(monitor, threshold, timeoutMs = 5000) {
    if (!monitor) return;

    return new Promise((resolve) => {
      const startTime = Date.now();

      const check = () => {
        const metrics = monitor.getMetrics();
        const elapsed = Date.now() - startTime;

        // Check if stabilized
        if (metrics.variance <= threshold || monitor.isStable()) {
          resolve();
          return;
        }

        // Check timeout
        if (elapsed >= timeoutMs) {
          this.emit('resonance:stabilization_timeout', {
            elapsed,
            variance: metrics.variance
          });
          resolve();
          return;
        }

        // Check again in 100ms
        setTimeout(check, 100);
      };

      check();
    });
  }

  /**
   * Update resonance metrics for all nodes from external source
   *
   * @param {Map<string, object>|object} metricsMap - Map of nodeId → resonance metrics
   */
  updateResonanceMetrics(metricsMap) {
    const map = metricsMap instanceof Map ? metricsMap : new Map(Object.entries(metricsMap));

    for (const [nodeId, metrics] of map) {
      const node = this.nodes.get(nodeId);
      if (node) {
        node.updateResonance(metrics);
      }
    }

    this.emit('resonance:updated', { nodeCount: map.size });
  }

  /**
   * Get resonance statistics for the DAG
   *
   * @returns {object}
   */
  getResonanceStats() {
    let phaseLocked = 0;
    let totalVariance = 0;
    let varianceCount = 0;
    let totalPriority = 0;

    for (const node of this.nodes.values()) {
      if (node.resonance?.phaseLocked) phaseLocked++;
      if (node.resonance?.variance !== null && node.resonance?.variance !== undefined) {
        totalVariance += node.resonance.variance;
        varianceCount++;
      }
      totalPriority += node.resonance?.priority ?? 0;
    }

    return {
      nodeCount: this.nodes.size,
      phaseLocked,
      avgVariance: varianceCount > 0 ? totalVariance / varianceCount : null,
      avgPriority: this.nodes.size > 0 ? totalPriority / this.nodes.size : 0,
      hasResonanceData: varianceCount > 0
    };
  }

  /**
   * Get execution statistics
   *
   * @returns {object}
   */
  getStats() {
    const byStatus = {};
    let totalDuration = 0;
    let completedCount = 0;

    for (const node of this.nodes.values()) {
      byStatus[node.status] = (byStatus[node.status] || 0) + 1;
      if (node.duration) {
        totalDuration += node.duration;
        completedCount++;
      }
    }

    return {
      nodeCount: this.nodes.size,
      byStatus,
      avgDuration: completedCount > 0 ? totalDuration / completedCount : 0,
      totalDuration,
      levels: this.getLevels().length
    };
  }

  /**
   * Export graph for visualization
   *
   * @returns {{ nodes: Array, edges: Array }}
   */
  exportGraph() {
    const nodes = [];
    const edges = [];

    for (const node of this.nodes.values()) {
      nodes.push(node.toJSON());
      for (const depId of node.dependencies) {
        edges.push({ from: depId, to: node.id });
      }
    }

    return { nodes, edges };
  }

  /**
   * Generate DOT format for visualization
   *
   * @returns {string}
   */
  toDOT() {
    const lines = ['digraph DAG {', '  rankdir=LR;'];

    // Color by status
    const statusColors = {
      [NodeStatus.PENDING]: 'white',
      [NodeStatus.READY]: 'lightblue',
      [NodeStatus.RUNNING]: 'yellow',
      [NodeStatus.COMPLETED]: 'lightgreen',
      [NodeStatus.FAILED]: 'red',
      [NodeStatus.SKIPPED]: 'gray'
    };

    for (const node of this.nodes.values()) {
      const color = statusColors[node.status] || 'white';
      lines.push(`  "${node.id}" [label="${node.name}", fillcolor="${color}", style=filled];`);
    }

    for (const node of this.nodes.values()) {
      for (const depId of node.dependencies) {
        lines.push(`  "${depId}" -> "${node.id}";`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Clear all nodes
   */
  clear() {
    this.nodes.clear();
    this._executionOrder = null;
  }
}

/**
 * Create DAG from dependency specification
 *
 * @param {Array<{id: string, deps?: Array<string>, operation?: *, name?: string}>} spec
 * @returns {InteractionDAG}
 */
function dagFromSpec(spec) {
  const dag = new InteractionDAG();

  // First pass: create all nodes
  for (const item of spec) {
    dag.createNode(item.id, {
      operation: item.operation,
      name: item.name,
      data: item.data || {}
    });
  }

  // Second pass: add edges
  for (const item of spec) {
    if (item.deps) {
      for (const depId of item.deps) {
        dag.addEdge(item.id, depId);
      }
    }
  }

  return dag;
}

module.exports = {
  NodeStatus,
  DAGNode,
  InteractionDAG,
  dagFromSpec
};
