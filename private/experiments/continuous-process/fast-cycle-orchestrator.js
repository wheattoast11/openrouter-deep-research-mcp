/**
 * Fast Cycle Orchestrator
 *
 * Experimental sub-500ms heartbeat cycles for rapid orchestration.
 * Implements AIMD (Additive Increase/Multiplicative Decrease) backoff.
 *
 * EXPERIMENTAL - DO NOT USE IN PRODUCTION
 *
 * @see src/core/signal.js for production SignalBus
 */

const EventEmitter = require('events');

// Import from core Signal protocol
const { Signal, SignalBus } = require('../../../src/core/signal');

class FastCycleOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      // Target cycle time (ms)
      targetCycleMs: options.targetCycleMs || 500,

      // Minimum cycle time (safety limit)
      minCycleMs: options.minCycleMs || 100,

      // Maximum cycle time (degraded mode)
      maxCycleMs: options.maxCycleMs || 5000,

      // AIMD parameters
      aimd: {
        additiveIncrease: options.additiveIncrease || 50,   // ms to add on success
        multiplicativeDecrease: options.multiplicativeDecrease || 0.5  // factor on failure
      }
    };

    this.state = {
      currentCycleMs: this.config.targetCycleMs,
      cycleCount: 0,
      successCount: 0,
      failureCount: 0,
      lastCycleTime: null,
      running: false
    };

    this.cycleTimer = null;
  }

  /**
   * Start the orchestration loop
   */
  start() {
    if (this.state.running) return;

    this.state.running = true;
    this.emit('start', { config: this.config });
    this._scheduleCycle();
  }

  /**
   * Stop the orchestration loop
   */
  stop() {
    this.state.running = false;
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
    this.emit('stop', { state: this.state });
  }

  /**
   * Schedule next cycle
   */
  _scheduleCycle() {
    if (!this.state.running) return;

    this.cycleTimer = setTimeout(() => {
      this._executeCycle();
    }, this.state.currentCycleMs);
  }

  /**
   * Execute a single cycle
   */
  async _executeCycle() {
    const startTime = Date.now();
    this.state.cycleCount++;

    try {
      // Emit cycle event for handlers to process
      await this._runCycleHandlers();

      // Success - AIMD additive increase
      this.state.successCount++;
      this.state.currentCycleMs = Math.max(
        this.config.minCycleMs,
        this.state.currentCycleMs - this.config.aimd.additiveIncrease
      );

      this.emit('cycle-complete', {
        cycleNumber: this.state.cycleCount,
        durationMs: Date.now() - startTime,
        nextCycleMs: this.state.currentCycleMs
      });

    } catch (error) {
      // Failure - AIMD multiplicative decrease
      this.state.failureCount++;
      this.state.currentCycleMs = Math.min(
        this.config.maxCycleMs,
        Math.ceil(this.state.currentCycleMs / this.config.aimd.multiplicativeDecrease)
      );

      this.emit('cycle-error', {
        cycleNumber: this.state.cycleCount,
        error: error.message,
        nextCycleMs: this.state.currentCycleMs
      });
    }

    this.state.lastCycleTime = Date.now();
    this._scheduleCycle();
  }

  /**
   * Run cycle handlers (override in subclass)
   */
  async _runCycleHandlers() {
    // Base implementation - emit event for external handlers
    const handlers = this.listeners('cycle');
    for (const handler of handlers) {
      await handler();
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      cycleCount: this.state.cycleCount,
      successRate: this.state.cycleCount > 0
        ? (this.state.successCount / this.state.cycleCount).toFixed(3)
        : 0,
      currentCycleMs: this.state.currentCycleMs,
      running: this.state.running
    };
  }
}

module.exports = { FastCycleOrchestrator };
