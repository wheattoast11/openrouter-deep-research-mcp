/**
 * Streaming Transport
 *
 * Real-time token streaming via MCP notifications.
 * Buffers tokens and flushes at configurable intervals for
 * efficient delivery to LLM clients.
 */

const logger = require('../utils/logger');

/**
 * StreamingTransport provides buffered real-time token delivery via MCP
 */
class StreamingTransport {
  /**
   * @param {Object} server - MCP server instance with notification capability
   * @param {string} jobId - Job ID for progress token routing
   * @param {Object} options - Configuration options
   * @param {number} options.flushInterval - Min ms between flushes (default: 100)
   * @param {number} options.maxBufferSize - Max buffer chars before force flush (default: 500)
   */
  constructor(server, jobId, options = {}) {
    this.server = server;
    this.jobId = jobId;
    this.buffer = '';
    this.tokenCount = 0;
    this.flushInterval = options.flushInterval || 100;
    this.maxBufferSize = options.maxBufferSize || 500;
    this.lastFlush = 0;
    this.enabled = !!server?.notification;
  }

  /**
   * Add token(s) to buffer, flushing if interval elapsed or buffer full
   * @param {string} token - Token or chunk to stream
   */
  async sendToken(token) {
    if (!this.enabled || !token) return;

    this.buffer += token;
    this.tokenCount++;

    const now = Date.now();
    const shouldFlush =
      (now - this.lastFlush >= this.flushInterval) ||
      (this.buffer.length >= this.maxBufferSize);

    if (shouldFlush) {
      await this.flush();
    }
  }

  /**
   * Send buffered content immediately
   */
  async flush() {
    if (!this.enabled || this.buffer.length === 0) return;

    const content = this.buffer;
    this.buffer = '';
    this.lastFlush = Date.now();

    try {
      await this.server.notification({
        method: 'notifications/progress',
        params: {
          progressToken: this.jobId,
          progress: {
            type: 'synthesis_stream',
            content,
            tokenCount: this.tokenCount,
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (err) {
      // Best-effort streaming - don't fail the operation
      logger.debug('Streaming notification failed', {
        jobId: this.jobId,
        error: err.message
      });
    }
  }

  /**
   * Signal stream completion and flush any remaining buffer
   */
  async complete() {
    // Flush remaining content
    await this.flush();

    if (!this.enabled) return;

    try {
      await this.server.notification({
        method: 'notifications/progress',
        params: {
          progressToken: this.jobId,
          progress: {
            type: 'synthesis_complete',
            totalTokens: this.tokenCount,
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (err) {
      logger.debug('Streaming completion notification failed', {
        jobId: this.jobId,
        error: err.message
      });
    }
  }

  /**
   * Check if transport is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.enabled;
  }

  /**
   * Get current stats
   * @returns {Object}
   */
  getStats() {
    return {
      tokenCount: this.tokenCount,
      bufferSize: this.buffer.length,
      enabled: this.enabled
    };
  }
}

/**
 * Create a streaming transport if server supports notifications
 * @param {Object} mcpExchange - MCP exchange object
 * @param {string} jobId - Job identifier
 * @param {Object} options - Transport options
 * @returns {StreamingTransport|null}
 */
function createStreamingTransport(mcpExchange, jobId, options = {}) {
  const server = mcpExchange?.server;
  if (!server?.notification) {
    return null;
  }
  return new StreamingTransport(server, jobId, options);
}

module.exports = {
  StreamingTransport,
  createStreamingTransport
};
