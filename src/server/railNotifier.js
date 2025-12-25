/**
 * Rail Protocol Notifier
 *
 * Emits MCP notifications for rail events:
 * - notifications/rail.tunnel - Agent-to-agent message flow
 * - notifications/rail.consensus - Streaming consensus updates
 *
 * Follows the same pattern as progressNotifier.js but for Rail Protocol events.
 *
 * @module server/railNotifier
 */

'use strict';

const config = require('../../config');
const logger = require('../utils/logger');

// Notification type constants (matching core/rail/tunnel.js and consensus.js)
const TUNNEL_NOTIFICATION = 'notifications/rail.tunnel';
const CONSENSUS_NOTIFICATION = 'notifications/rail.consensus';

/**
 * Rail Protocol Notifier
 *
 * Emits MCP notifications for tunnel messages and consensus updates.
 */
class RailNotifier {
  /**
   * @param {object} exchange - MCP exchange context with sendNotification
   */
  constructor(exchange) {
    this.exchange = exchange;
    this.enabled = config.core?.rail?.enabled !== false;
    this.debug = config.core?.rail?.debug || false;
    this.debugRails = config.core?.rail?.debugRails || [];
  }

  /**
   * Check if notifications can be sent
   * @returns {boolean}
   */
  get canNotify() {
    return this.enabled && !!(
      this.exchange?.sendNotification ||
      this.exchange?.server?.notification
    );
  }

  /**
   * Notify tunnel message flow
   *
   * @param {string} tunnelId - Tunnel UUID
   * @param {string} source - Source agent identifier
   * @param {string} target - Target agent identifier
   * @param {object} signal - Signal payload (truncated for notification)
   */
  async notifyTunnelMessage(tunnelId, source, target, signal) {
    if (!this.canNotify) return;

    // Apply debug filter
    if (this.debugRails.length > 0 && !this.debugRails.includes(tunnelId)) {
      return;
    }

    const notification = {
      method: TUNNEL_NOTIFICATION,
      params: {
        tunnelId,
        source,
        target,
        signal: this._truncateSignal(signal),
        timestamp: new Date().toISOString()
      }
    };

    await this._send(notification);

    if (this.debug) {
      logger.debug('Rail tunnel notification sent', {
        tunnelId,
        source,
        target
      });
    }
  }

  /**
   * Notify consensus update during streaming verification
   *
   * @param {string} sessionId - Consensus session UUID
   * @param {string} state - Current state (PENDING, PARTIAL, CONVERGED, DIVERGED, TIMEOUT)
   * @param {number} agreement - Current agreement level (0-1)
   * @param {Array} signals - Model signals (summarized)
   * @param {boolean} complete - Whether consensus is complete
   */
  async notifyConsensusUpdate(sessionId, state, agreement, signals = [], complete = false) {
    if (!this.canNotify) return;

    // Apply debug filter
    if (this.debugRails.length > 0 && !this.debugRails.includes(sessionId)) {
      return;
    }

    const notification = {
      method: CONSENSUS_NOTIFICATION,
      params: {
        sessionId,
        state,
        agreement: Math.round(agreement * 100) / 100, // 2 decimal places
        signalCount: signals.length,
        signals: signals.slice(0, 5).map(s => ({
          source: s.source,
          confidence: s.confidence,
          vote: s.vote
        })),
        complete,
        timestamp: new Date().toISOString()
      }
    };

    await this._send(notification);

    if (this.debug) {
      logger.debug('Rail consensus notification sent', {
        sessionId,
        state,
        agreement,
        signalCount: signals.length,
        complete
      });
    }
  }

  /**
   * Truncate signal for notification (keep under 500 chars)
   * @private
   */
  _truncateSignal(signal) {
    if (!signal) return null;

    try {
      const str = typeof signal === 'object' ? JSON.stringify(signal) : String(signal);
      return str.length > 500 ? str.slice(0, 497) + '...' : str;
    } catch {
      return '[unserializable]';
    }
  }

  /**
   * Subscribe to database change notifications and emit via Rail
   * @param {Object} tunnelRegistry - Rail tunnel registry
   * @returns {Promise<Object>} Unsubscribe functions
   */
  async subscribeToTableChanges(tunnelRegistry) {
    const dbClient = require('../utils/dbClient');
    
    // Research reports channel
    const unsubReports = await dbClient.subscribeToChanges('research_reports_changed', (payload) => {
      try {
        const data = JSON.parse(payload);
        
        // Broadcast to all active tunnels
        for (const tunnel of tunnelRegistry.list()) {
          tunnel.send({
            type: 'db_change',
            table: 'research_reports',
            operation: data.operation,
            id: data.id,
            timestamp: data.timestamp
          });
        }
      } catch (err) {
        logger.warn('Failed to parse research_report_changed notification', { error: err.message });
      }
    });

    // Jobs channel
    const unsubJobs = await dbClient.subscribeToChanges('jobs_changed', (payload) => {
      try {
        const data = JSON.parse(payload);
        
        // Broadcast job status changes
        for (const tunnel of tunnelRegistry.list()) {
          if (tunnel.metadata?.subscriptions?.includes('jobs')) {
            tunnel.send({
              type: 'db_change',
              table: 'jobs',
              operation: data.operation,
              id: data.id,
              status: data.status,
              timestamp: data.timestamp
            });
          }
        }
      } catch (err) {
        logger.warn('Failed to parse jobs_changed notification', { error: err.message });
      }
    });

    return { unsubReports, unsubJobs };
  }

  /**
   * Send notification through available channel
   * @private
   */
  async _send(notification) {
    try {
      if (this.exchange?.sendNotification) {
        await this.exchange.sendNotification(notification);
      } else if (this.exchange?.server?.notification) {
        await this.exchange.server.notification(notification);
      }
    } catch (err) {
      logger.warn('Failed to send rail notification', {
        method: notification.method,
        error: err.message
      });
    }
  }
}

/**
 * No-op notifier for when notifications are disabled
 */
class NoOpRailNotifier {
  get canNotify() { return false; }
  async notifyTunnelMessage() {}
  async notifyConsensusUpdate() {}
}

/**
 * Create a rail notifier for the given exchange context
 *
 * @param {object} exchange - MCP exchange context
 * @returns {RailNotifier|NoOpRailNotifier}
 */
function createRailNotifier(exchange) {
  if (config.core?.rail?.enabled === false) {
    return new NoOpRailNotifier();
  }
  return new RailNotifier(exchange);
}

module.exports = {
  RailNotifier,
  NoOpRailNotifier,
  createRailNotifier,
  TUNNEL_NOTIFICATION,
  CONSENSUS_NOTIFICATION
};
