/**
 * MCP-Compliant Structured Logging System
 *
 * Provides unified logging with:
 * - MCP SDK sendLoggingMessage() integration for client notifications
 * - LOG_LEVEL filtering (debug, info, warn, error)
 * - LOG_OUTPUT routing (stderr, mcp, both)
 * - Structured JSON format for machine parsing
 * - STDIO mode detection to prevent protocol corruption
 *
 * @module logger
 * @version 1.8.0
 */

'use strict';

// MCP-compatible log levels (RFC 5424 syslog subset)
const LogLevel = {
  DEBUG: 10,
  INFO: 20,
  NOTICE: 30,
  WARNING: 40,
  WARN: 40, // Alias
  ERROR: 50,
  CRITICAL: 60
};

// Reverse mapping for display
const LevelNames = {
  10: 'DEBUG',
  20: 'INFO',
  30: 'NOTICE',
  40: 'WARN',
  50: 'ERROR',
  60: 'CRITICAL'
};

// MCP SDK level names (for sendLoggingMessage)
const MCPLevelNames = {
  10: 'debug',
  20: 'info',
  30: 'notice',
  40: 'warning',
  50: 'error',
  60: 'critical'
};

/**
 * Unified MCP Logger
 * Singleton instance exported for use across the codebase
 */
class MCPLogger {
  constructor() {
    // Parse LOG_LEVEL from environment (default: info)
    const envLevel = (process.env.LOG_LEVEL || 'info').toUpperCase();
    this.minLevel = LogLevel[envLevel] ?? LogLevel.INFO;

    // Parse LOG_OUTPUT from environment (default: stderr)
    // Options: 'stderr' | 'mcp' | 'both'
    this.output = process.env.LOG_OUTPUT || 'stderr';

    // Detect STDIO mode - suppress non-error output to prevent JSON-RPC corruption
    this.isStdio = process.argv.includes('--stdio');

    // MCP server instance (set via setServer after server creation)
    this.server = null;

    // Default session ID for MCP notifications
    this.defaultSessionId = null;

    // Pending logs before server is ready (for 'mcp' output mode)
    this.pendingLogs = [];

    // Component name for log context
    this.component = null;
  }

  /**
   * Set the MCP server instance for sendLoggingMessage notifications
   * Call this after McpServer is created in mcpServer.js
   *
   * @param {McpServer} server - The MCP server instance
   * @param {string} [sessionId] - Default session ID for notifications
   */
  setServer(server, sessionId = null) {
    this.server = server;
    this.defaultSessionId = sessionId;

    // Flush any pending logs
    if (this.pendingLogs.length > 0 && this.output !== 'stderr') {
      for (const pending of this.pendingLogs) {
        this._sendMCPNotification(pending.level, pending.entry, pending.sessionId);
      }
      this.pendingLogs = [];
    }
  }

  /**
   * Create a child logger with preset component context
   * @param {string} component - Component name (e.g., 'ResearchAgent', 'JobWorker')
   * @returns {Object} Logger with bound component
   */
  child(component) {
    const self = this;
    return {
      debug: (msg, ctx) => self.debug(msg, { ...ctx, component }),
      info: (msg, ctx) => self.info(msg, { ...ctx, component }),
      warn: (msg, ctx) => self.warn(msg, { ...ctx, component }),
      error: (msg, ctx) => self.error(msg, { ...ctx, component }),
      notice: (msg, ctx) => self.notice(msg, { ...ctx, component })
    };
  }

  /**
   * Core logging method
   * @param {number} level - Log level (from LogLevel enum)
   * @param {string} message - Log message
   * @param {Object} [context={}] - Additional context (requestId, component, etc.)
   */
  log(level, message, context = {}) {
    // Level filtering
    if (level < this.minLevel) return;

    const entry = {
      ts: new Date().toISOString(),
      level: LevelNames[level] || 'INFO',
      msg: message,
      ...context
    };

    // In STDIO mode, only output errors to prevent JSON-RPC corruption
    const isError = level >= LogLevel.ERROR;
    const shouldStderr = this.output === 'stderr' || this.output === 'both' || isError;
    const shouldMCP = (this.output === 'mcp' || this.output === 'both') && !this.isStdio;

    // Stderr output
    if (shouldStderr) {
      // In STDIO mode, suppress non-errors entirely
      if (!this.isStdio || isError) {
        this._writeStderr(entry);
      }
    }

    // MCP notification output
    if (shouldMCP) {
      const sessionId = context.sessionId || this.defaultSessionId;
      if (this.server) {
        this._sendMCPNotification(level, entry, sessionId);
      } else if (this.output === 'mcp') {
        // Queue for later if MCP-only mode and server not ready
        this.pendingLogs.push({ level, entry, sessionId });
      }
    }
  }

  /**
   * Write structured log entry to stderr
   * @private
   */
  _writeStderr(entry) {
    const { ts, level, msg, requestId, component, ...rest } = entry;

    // Build prefix parts
    const parts = [`[${ts}]`, `[${level}]`];
    if (component) parts.push(`[${component}]`);
    if (requestId) parts.push(`[${requestId}]`);

    // Format: [timestamp] [LEVEL] [component] [requestId] message {extra}
    let line = `${parts.join(' ')} ${msg}`;

    // Append extra context as JSON if present
    const extra = Object.keys(rest).length > 0 ? rest : null;
    if (extra) {
      // Remove sessionId from display (internal)
      delete extra.sessionId;
      if (Object.keys(extra).length > 0) {
        line += ` ${JSON.stringify(extra)}`;
      }
    }

    process.stderr.write(line + '\n');
  }

  /**
   * Send log via MCP SDK sendLoggingMessage notification
   * @private
   */
  async _sendMCPNotification(level, entry, sessionId) {
    if (!this.server?.sendLoggingMessage) return;

    try {
      await this.server.sendLoggingMessage({
        level: MCPLevelNames[level] || 'info',
        logger: entry.component || 'openrouter-agents',
        data: entry
      }, sessionId);
    } catch (err) {
      // Fallback to stderr on notification failure
      if (this.output === 'mcp') {
        this._writeStderr({ ...entry, mcpError: err.message });
      }
    }
  }

  // Convenience methods

  /**
   * Debug level - detailed diagnostic info
   * @param {string} msg - Message
   * @param {Object} [ctx] - Context
   */
  debug(msg, ctx) { this.log(LogLevel.DEBUG, msg, ctx); }

  /**
   * Info level - general operational messages
   * @param {string} msg - Message
   * @param {Object} [ctx] - Context
   */
  info(msg, ctx) { this.log(LogLevel.INFO, msg, ctx); }

  /**
   * Notice level - significant but normal events
   * @param {string} msg - Message
   * @param {Object} [ctx] - Context
   */
  notice(msg, ctx) { this.log(LogLevel.NOTICE, msg, ctx); }

  /**
   * Warning level - degraded functionality, non-fatal issues
   * @param {string} msg - Message
   * @param {Object} [ctx] - Context
   */
  warn(msg, ctx) { this.log(LogLevel.WARNING, msg, ctx); }

  /**
   * Error level - operation failures, exceptions
   * @param {string} msg - Message
   * @param {Object} [ctx] - Context (can include error object)
   */
  error(msg, ctx) {
    // Handle error objects in context
    if (ctx?.error instanceof Error) {
      ctx = {
        ...ctx,
        error: ctx.error.message,
        stack: ctx.error.stack,
        code: ctx.error.code
      };
    }
    this.log(LogLevel.ERROR, msg, ctx);
  }

  /**
   * Critical level - system-wide failures requiring immediate attention
   * @param {string} msg - Message
   * @param {Object} [ctx] - Context
   */
  critical(msg, ctx) { this.log(LogLevel.CRITICAL, msg, ctx); }
}

// Export singleton instance
const logger = new MCPLogger();

module.exports = logger;
module.exports.LogLevel = LogLevel;
module.exports.MCPLogger = MCPLogger;
