/**
 * Orchestration Timer
 *
 * Performance timing utility for integration tests.
 * Tracks marks and measures for parallel orchestration metrics.
 */
'use strict';

const { performance } = require('perf_hooks');

class OrchestrationTimer {
  constructor() {
    this.marks = new Map();
    this.metrics = {};
    this.startTime = performance.now();
  }

  /**
   * Record a timestamp mark
   * @param {string} name - Mark identifier
   */
  mark(name) {
    this.marks.set(name, performance.now());
  }

  /**
   * Measure duration between two marks
   * @param {string} name - Metric name
   * @param {string} startMark - Start mark name
   * @param {string} endMark - End mark name (defaults to 'now')
   */
  measure(name, startMark, endMark = null) {
    const start = this.marks.get(startMark);
    const end = endMark ? this.marks.get(endMark) : performance.now();

    if (start === undefined) {
      console.warn(`Timer: Start mark "${startMark}" not found`);
      return;
    }

    this.metrics[name] = end - start;
  }

  /**
   * Get elapsed time since timer creation
   * @returns {number} Milliseconds elapsed
   */
  elapsed() {
    return performance.now() - this.startTime;
  }

  /**
   * Calculate parallel speedup factor
   * @param {number} sequentialEstimate - Estimated sequential time
   * @returns {number} Speedup factor
   */
  calculateSpeedup(sequentialEstimate) {
    const total = this.metrics.total || this.elapsed();
    return sequentialEstimate / total;
  }

  /**
   * Generate performance report
   * @returns {Object} Metrics summary
   */
  report() {
    return {
      totalTimeMs: Math.round(this.elapsed()),
      metrics: { ...this.metrics },
      marks: Object.fromEntries(
        [...this.marks.entries()].map(([k, v]) => [k, Math.round(v - this.startTime)])
      )
    };
  }

  /**
   * Format report for console output
   * @returns {string} Formatted report
   */
  toString() {
    const report = this.report();
    const lines = [
      '=== Orchestration Performance Report ===',
      `Total Time: ${(report.totalTimeMs / 1000).toFixed(2)}s`,
      '',
      'Metrics:'
    ];

    for (const [name, value] of Object.entries(report.metrics)) {
      lines.push(`  ${name}: ${(value / 1000).toFixed(2)}s`);
    }

    lines.push('', 'Marks (relative to start):');
    for (const [name, value] of Object.entries(report.marks)) {
      lines.push(`  ${name}: ${(value / 1000).toFixed(2)}s`);
    }

    return lines.join('\n');
  }
}

/**
 * Timeout wrapper for async operations
 * @param {Function} fn - Async function to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} description - Operation description for error message
 * @returns {Promise} Result or timeout error
 */
async function withTimeout(fn, timeoutMs, description) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${description} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([fn(), timeoutPromise]);
}

module.exports = {
  OrchestrationTimer,
  withTimeout
};
