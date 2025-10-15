// src/server/clientLauncher.js
/**
 * Client Launcher - Auto-Launch Dreamspace UI
 * 
 * Automatically launches minimalist browser window when MCP client connects.
 * Features:
 * - Corner positioning
 * - Auto-hide when inactive
 * - Session sharing with MCP client
 * - WebSocket communication
 */

const { spawn } = require('child_process');
const path = require('path');
const config = require('../../config');

class ClientLauncher {
  constructor() {
    this.launchedClients = new Map();
    this.autoLaunch = process.env.AUTO_LAUNCH_DREAMSPACE !== 'false';
  }

  /**
   * Launch Dreamspace UI for a session
   * @param {string} sessionId - Session identifier
   * @param {object} options - Launch options
   * @returns {Promise<object>} Launch result
   */
  async launchDreamspace(sessionId, options = {}) {
    if (!this.autoLaunch) {
      console.log('Auto-launch disabled');
      return { launched: false, reason: 'Auto-launch disabled' };
    }
    
    // Check if already launched for this session
    if (this.launchedClients.has(sessionId)) {
      return { launched: false, reason: 'Already launched', existing: true };
    }
    
    try {
      const url = this._buildDreamspaceUrl(sessionId, options);
      
      // Platform-specific launch
      const command = this._getLaunchCommand(url, options);
      
      const process = spawn(command.cmd, command.args, {
        detached: true,
        stdio: 'ignore'
      });
      
      process.unref(); // Don't wait for browser to close
      
      this.launchedClients.set(sessionId, {
        pid: process.pid,
        url,
        launchedAt: Date.now(),
        options
      });
      
      console.error(`[${new Date().toISOString()}] Dreamspace UI launched for session ${sessionId}`);
      
      return {
        launched: true,
        url,
        sessionId,
        position: options.position || 'corner'
      };
    } catch (error) {
      console.error('Dreamspace launch error:', error);
      return {
        launched: false,
        error: error.message
      };
    }
  }

  /**
   * Close Dreamspace UI for a session
   * @param {string} sessionId - Session identifier
   */
  async closeDreamspace(sessionId) {
    const client = this.launchedClients.get(sessionId);
    
    if (!client) {
      return { closed: false, reason: 'Not found' };
    }
    
    try {
      // Kill process
      if (client.pid) {
        process.kill(client.pid, 'SIGTERM');
      }
      
      this.launchedClients.delete(sessionId);
      
      console.error(`[${new Date().toISOString()}] Dreamspace UI closed for session ${sessionId}`);
      
      return { closed: true };
    } catch (error) {
      console.error('Dreamspace close error:', error);
      return { closed: false, error: error.message };
    }
  }

  /**
   * Check if Dreamspace is running for a session
   */
  isRunning(sessionId) {
    return this.launchedClients.has(sessionId);
  }

  /**
   * Get all active Dreamspace clients
   */
  getActiveLaunches() {
    return Array.from(this.launchedClients.entries()).map(([sessionId, client]) => ({
      sessionId,
      url: client.url,
      uptime: Date.now() - client.launchedAt
    }));
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Build Dreamspace URL
   * @private
   */
  _buildDreamspaceUrl(sessionId, options) {
    const baseUrl = config.server.publicUrl || `http://localhost:${config.server.port}`;
    const params = new URLSearchParams({
      session: sessionId,
      position: options.position || 'corner',
      autoHide: options.autoHide !== false ? 'true' : 'false'
    });
    
    return `${baseUrl}/dreamspace?${params.toString()}`;
  }

  /**
   * Get platform-specific launch command
   * @private
   */
  _getLaunchCommand(url, options) {
    const platform = process.platform;
    
    const windowOptions = this._getWindowOptions(options);
    
    // Platform-specific browser launch
    if (platform === 'win32') {
      // Windows: Use start command
      return {
        cmd: 'cmd',
        args: ['/c', 'start', '', url]
      };
    } else if (platform === 'darwin') {
      // macOS: Use open command
      return {
        cmd: 'open',
        args: ['-a', 'Google Chrome', '--args', `--app=${url}`, ...windowOptions]
      };
    } else {
      // Linux: Try xdg-open or google-chrome
      return {
        cmd: 'google-chrome',
        args: [`--app=${url}`, ...windowOptions]
      };
    }
  }

  /**
   * Get window positioning options
   * @private
   */
  _getWindowOptions(options) {
    const position = options.position || 'corner';
    
    const positions = {
      corner: ['--window-position=1400,50', '--window-size=500,700'],
      fullscreen: ['--start-fullscreen'],
      'split-left': ['--window-position=0,0', '--window-size=960,1080'],
      'split-right': ['--window-position=960,0', '--window-size=960,1080']
    };
    
    return positions[position] || positions.corner;
  }

  /**
   * Format duration
   * @private
   */
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Calculate success rate
   * @private
   */
  _calculateSuccessRate(actions) {
    if (actions.length === 0) return 100;
    const successful = actions.filter(a => a.success !== false).length;
    return Math.round((successful / actions.length) * 100);
  }
}

// Singleton instance
const clientLauncher = new ClientLauncher();

module.exports = clientLauncher;
module.exports.ClientLauncher = ClientLauncher;




