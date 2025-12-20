/**
 * Session Manager
 *
 * Manages tmux sessions for the orchestrator.
 * Handles creation, destruction, and signal handling for cleanup.
 *
 * @module cli/orchestrator/core/session
 */

'use strict';

const { execSync, execFileSync } = require('child_process');
const { EventEmitter } = require('events');
const { tmux, isTmuxAvailable, ensureTmuxServer, isInsideTmux, getCurrentSession, listPanes } = require('./pane');

const SAFE_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function sanitizeSessionName(name) {
  if (!SAFE_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid session name: ${name}`);
  }
  return name;
}

/**
 * Session state
 */
const SessionState = {
  CREATED: 'created',
  ACTIVE: 'active',
  DESTROYING: 'destroying',
  DESTROYED: 'destroyed'
};

/**
 * Default session options
 */
const DEFAULT_OPTIONS = {
  windowName: 'zero',
  startDirectory: process.cwd(),
  detached: false
};

/**
 * Session Manager
 *
 * Creates and manages a tmux session for the orchestrator.
 *
 * Events:
 * - created: Session created
 * - destroyed: Session destroyed
 * - signal: Received termination signal (signal)
 * - error: Session error (error)
 */
class SessionManager extends EventEmitter {
  /**
   * Create session manager
   *
   * @param {Object} options - Session options
   * @param {string} [options.name] - Session name
   * @param {string} [options.windowName] - Initial window name
   * @param {string} [options.startDirectory] - Working directory
   * @param {boolean} [options.detached] - Start detached
   */
  constructor(options = {}) {
    super();
    this.name = sanitizeSessionName(options.name || `zero-${Date.now()}`);
    this.windowName = options.windowName || DEFAULT_OPTIONS.windowName;
    this.startDirectory = options.startDirectory || DEFAULT_OPTIONS.startDirectory;
    this.detached = options.detached ?? DEFAULT_OPTIONS.detached;
    this.state = null;
    this.createdAt = null;
    this.mainPaneId = null;
    this.signalHandlers = [];
    this.isReusing = false;
  }

  /**
   * Check if tmux is available and server can start
   *
   * @returns {{ available: boolean, error?: string }}
   */
  static checkTmux() {
    const result = ensureTmuxServer();
    return {
      available: result.ok,
      error: result.error
    };
  }

  /**
   * Check if already inside a tmux session
   *
   * @returns {boolean}
   */
  static isInTmux() {
    return isInsideTmux();
  }

  /**
   * Get existing session name if inside tmux
   *
   * @returns {string|null}
   */
  static getCurrentSessionName() {
    return getCurrentSession();
  }

  /**
   * List all tmux sessions
   *
   * @returns {Array<Object>}
   */
  static listSessions() {
    try {
      const format = '#{session_name}|#{session_created}|#{session_windows}|#{session_attached}';
      const output = tmux(['list-sessions', '-F', format], { ignoreError: true });

      if (!output) return [];

      return output.split('\n').filter(Boolean).map(line => {
        const [name, created, windows, attached] = line.split('|');
        return {
          name,
          createdAt: parseInt(created) * 1000,
          windowCount: parseInt(windows),
          isAttached: attached === '1'
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Check if a session exists
   *
   * @param {string} name - Session name
   * @returns {boolean}
   */
  static sessionExists(name) {
    try {
      tmux(['has-session', '-t', name], { silent: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create or attach to tmux session
   *
   * @returns {Promise<void>}
   */
  async create() {
    // Pre-flight check: ensure tmux is available and socket dir is ready
    const serverCheck = ensureTmuxServer();
    if (!serverCheck.ok) {
      throw new Error(serverCheck.error);
    }

    // Check if we're already in a tmux session
    if (isInsideTmux()) {
      const currentSession = getCurrentSession();
      if (currentSession) {
        this.name = currentSession;
        this.isReusing = true;
        this.state = SessionState.ACTIVE;
        this.createdAt = Date.now();

        // Get main pane ID
        const panes = listPanes(this.name);
        if (panes.length > 0) {
          this.mainPaneId = panes[0].tmuxPaneId;
        }

        this._setupSignalHandlers();
        this.emit('created', { reused: true });
        return;
      }
    }

    // Check if session already exists
    if (SessionManager.sessionExists(this.name)) {
      // Attach to existing session
      this.isReusing = true;
      this.state = SessionState.ACTIVE;
      this.createdAt = Date.now();

      const panes = listPanes(this.name);
      if (panes.length > 0) {
        this.mainPaneId = panes[0].tmuxPaneId;
      }

      this._setupSignalHandlers();
      this.emit('created', { reused: true });
      return;
    }

    // Create new session - tmux new-session will start server if needed
    const args = [
      'new-session',
      '-d', // Start detached
      '-s', this.name,
      '-n', this.windowName,
      '-c', this.startDirectory,
      '-P', '-F', '#{pane_id}' // Print pane ID
    ];

    try {
      this.mainPaneId = tmux(args);
      this.state = SessionState.CREATED;
      this.createdAt = Date.now();

      // Configure session options
      this._configureSession();

      // Set up signal handlers
      this._setupSignalHandlers();

      this.state = SessionState.ACTIVE;
      this.emit('created', { reused: false });

      // Attach if not detached mode
      if (!this.detached && !isInsideTmux()) {
        this.attach();
      }
    } catch (err) {
      // Provide more helpful error message
      const errMsg = err.stderr?.toString?.() || err.message || String(err);
      if (errMsg.includes('No such file or directory') || errMsg.includes('error connecting')) {
        const uid = process.getuid?.() || 501;
        throw new Error(
          `Failed to create tmux session. Socket directory issue.\n` +
          `Try running: rm -rf /tmp/tmux-${uid} && mkdir -p /tmp/tmux-${uid} && chmod 700 /tmp/tmux-${uid}\n` +
          `Then try again.`
        );
      }
      this.emit('error', err);
      throw err;
    }
  }

  /**
   * Configure session options
   * @private
   */
  _configureSession() {
    // Set status bar options
    tmux(['set-option', '-t', this.name, 'status', 'on'], { ignoreError: true });
    tmux(['set-option', '-t', this.name, 'status-position', 'bottom'], { ignoreError: true });

    // Enable pane borders with titles
    tmux(['set-option', '-t', this.name, 'pane-border-status', 'top'], { ignoreError: true });
    tmux(['set-option', '-t', this.name, 'pane-border-format', ' #{pane_title} '], { ignoreError: true });

    // Mouse support
    tmux(['set-option', '-t', this.name, 'mouse', 'on'], { ignoreError: true });

    // Increase history
    tmux(['set-option', '-t', this.name, 'history-limit', '10000'], { ignoreError: true });
  }

  /**
   * Set up signal handlers for cleanup
   * @private
   */
  _setupSignalHandlers() {
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];

    for (const signal of signals) {
      const handler = async () => {
        this.emit('signal', signal);
        await this.destroy();
        process.exit(0);
      };

      process.on(signal, handler);
      this.signalHandlers.push({ signal, handler });
    }

    // Handle uncaught exceptions
    const exceptionHandler = async (err) => {
      console.error('Uncaught exception:', err);
      await this.destroy();
      process.exit(1);
    };
    process.on('uncaughtException', exceptionHandler);
    this.signalHandlers.push({ signal: 'uncaughtException', handler: exceptionHandler });
  }

  /**
   * Remove signal handlers
   * @private
   */
  _removeSignalHandlers() {
    for (const { signal, handler } of this.signalHandlers) {
      process.off(signal, handler);
    }
    this.signalHandlers = [];
  }

  /**
   * Attach to the session
   */
  attach() {
    if (isInsideTmux()) {
      // Switch to session within tmux
      tmux(['switch-client', '-t', this.name], { ignoreError: true });
    } else {
      // Attach from outside tmux
      try {
        execFileSync('tmux', ['attach-session', '-t', this.name], { stdio: 'inherit' });
      } catch {
        // Session may have been destroyed
      }
    }
  }

  /**
   * Detach from the session
   */
  detach() {
    tmux(['detach-client', '-s', this.name], { ignoreError: true });
  }

  /**
   * Get session info
   *
   * @returns {Object}
   */
  getInfo() {
    const panes = listPanes(this.name);

    return {
      name: this.name,
      state: this.state,
      createdAt: this.createdAt,
      uptime: this.createdAt ? Date.now() - this.createdAt : 0,
      mainPaneId: this.mainPaneId,
      isReusing: this.isReusing,
      windowName: this.windowName,
      startDirectory: this.startDirectory,
      paneCount: panes.length,
      panes
    };
  }

  /**
   * Rename the session
   *
   * @param {string} newName - New session name
   */
  rename(newName) {
    const safeName = sanitizeSessionName(newName);
    tmux(['rename-session', '-t', this.name, safeName]);
    this.name = safeName;
  }

  /**
   * Send notification to session (if supported)
   *
   * @param {string} message - Notification message
   */
  notify(message) {
    tmux(['display-message', '-t', this.name, message], { ignoreError: true });
  }

  /**
   * Destroy the session
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    if (this.state === SessionState.DESTROYING || this.state === SessionState.DESTROYED) {
      return;
    }

    this.state = SessionState.DESTROYING;
    this._removeSignalHandlers();

    // Don't destroy if we're reusing an existing session
    if (this.isReusing) {
      this.state = SessionState.DESTROYED;
      this.emit('destroyed');
      return;
    }

    try {
      // Kill the session
      tmux(['kill-session', '-t', this.name], { ignoreError: true });
    } catch {
      // Session may already be gone
    }

    this.state = SessionState.DESTROYED;
    this.emit('destroyed');
  }

  /**
   * Create a new window in the session
   *
   * @param {string} name - Window name
   * @returns {string} Window target (session:window)
   */
  createWindow(name) {
    const target = `${this.name}:${name}`;
    tmux(['new-window', '-t', this.name, '-n', name, '-c', this.startDirectory]);
    return target;
  }

  /**
   * Select a window
   *
   * @param {string} name - Window name
   */
  selectWindow(name) {
    tmux(['select-window', '-t', `${this.name}:${name}`], { ignoreError: true });
  }

  /**
   * List windows in the session
   *
   * @returns {Array<Object>}
   */
  listWindows() {
    try {
      const format = '#{window_id}|#{window_name}|#{window_active}|#{window_panes}';
      const output = tmux(['list-windows', '-t', this.name, '-F', format], { ignoreError: true });

      if (!output) return [];

      return output.split('\n').filter(Boolean).map(line => {
        const [id, name, active, panes] = line.split('|');
        return {
          id,
          name,
          isActive: active === '1',
          paneCount: parseInt(panes)
        };
      });
    } catch {
      return [];
    }
  }
}

/**
 * Create and initialize a session
 *
 * @param {Object} [options] - Session options
 * @returns {Promise<SessionManager>}
 */
async function createSession(options = {}) {
  const session = new SessionManager(options);
  await session.create();
  return session;
}

module.exports = {
  SessionManager,
  SessionState,
  createSession
};
