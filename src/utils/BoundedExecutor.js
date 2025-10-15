/**
 * BoundedExecutor - Deterministic Concurrency Control
 * 
 * Replacement/polyfill for @terminals-tech/core BoundedExecutor
 * until the package is updated with this export.
 * 
 * Provides FIFO queue with bounded parallelism for deterministic
 * concurrent task execution.
 * 
 * @module utils/BoundedExecutor
 */

class BoundedExecutor {
  constructor(options = {}) {
    this.maxConcurrency = options.maxConcurrency || 10;
    this.queue = [];
    this.running = new Set();
    this.onTaskStart = options.onTaskStart || null;
    this.onTaskFinish = options.onTaskFinish || null;
    this.meter = options.meter || null;
  }

  /**
   * Execute a task with bounded concurrency
   * 
   * @param {Function} fn - Async function to execute
   * @returns {Promise} Task result
   */
  async execute(fn) {
    return this.submit(fn);
  }

  /**
   * Submit a task to the executor
   * 
   * @param {Function} fn - Async function to execute
   * @returns {Promise} Task result
   */
  async submit(fn) {
    // If under concurrency limit, execute immediately
    if (this.running.size < this.maxConcurrency) {
      return this._executeTask(fn, this.running.size);
    }

    // Otherwise, queue it
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._processQueue();
    });
  }

  /**
   * Execute a task and manage concurrency
   * @private
   */
  async _executeTask(fn, index) {
    const taskId = Symbol('task');
    this.running.add(taskId);

    try {
      // Emit start event
      if (this.onTaskStart) {
        await this.onTaskStart({ index, taskId });
      }

      const result = await fn();

      // Emit finish event
      if (this.onTaskFinish) {
        await this.onTaskFinish({ index, taskId, result, error: null });
      }

      return result;
    } catch (error) {
      // Emit finish with error
      if (this.onTaskFinish) {
        await this.onTaskFinish({ index, taskId, result: null, error });
      }

      throw error;
    } finally {
      this.running.delete(taskId);
      this._processQueue();
    }
  }

  /**
   * Process queued tasks
   * @private
   */
  _processQueue() {
    while (this.queue.length > 0 && this.running.size < this.maxConcurrency) {
      const { fn, resolve, reject } = this.queue.shift();
      
      this._executeTask(fn, this.running.size)
        .then(resolve)
        .catch(reject);
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      maxConcurrency: this.maxConcurrency,
      running: this.running.size,
      queued: this.queue.length,
      total: this.running.size + this.queue.length
    };
  }
}

module.exports = { BoundedExecutor };

