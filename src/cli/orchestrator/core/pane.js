/**
 * Pane Abstraction
 *
 * Manages tmux panes for agent processes.
 * Zero dependencies beyond Node.js built-ins.
 *
 * @module cli/orchestrator/core/pane
 */

'use strict';

const { execSync, execFileSync, spawn } = require('child_process');
const fs = require('fs');

/**
 * Pane state
 */
const PaneState = {
  CREATED: 'created',
  RUNNING: 'running',
  STOPPED: 'stopped',
  DEAD: 'dead'
};

/**
 * Execute tmux command synchronously
 *
 * @param {Array<string>} args - tmux command arguments
 * @param {Object} [options] - exec options
 * @returns {string} Command output
 */
function tmux(args, options = {}) {
  try {
    const result = execFileSync('tmux', args, {
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : ['pipe', 'pipe', 'pipe'],
      ...options
    });
    return result.trim();
  } catch (err) {
    if (options.ignoreError) {
      return '';
    }
    throw err;
  }
}

/**
 * Check if tmux is available and can connect to server
 *
 * @returns {boolean}
 */
function isTmuxAvailable() {
  try {
    execSync('which tmux', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure tmux server is running and socket is accessible
 * Creates the socket directory if needed and verifies tmux can run
 *
 * @returns {{ ok: boolean, error?: string }}
 */
function ensureTmuxServer() {
  const fs = require('fs');

  // Check if tmux binary exists
  if (!isTmuxAvailable()) {
    return { ok: false, error: 'tmux is not installed. Install with: brew install tmux' };
  }

  // Get socket directory path
  const uid = process.getuid?.() || 501;
  const socketDir = `/tmp/tmux-${uid}`;

  // Step 1: Ensure socket directory exists with correct permissions
  try {
    if (!fs.existsSync(socketDir)) {
      fs.mkdirSync(socketDir, { mode: 0o700 });
    } else {
      // Verify we can write to it
      const testFile = `${socketDir}/.zero-test-${Date.now()}`;
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    }
  } catch (err) {
    // Try to fix permissions - validate socketDir is safe path
    const expectedSocketDir = `/tmp/tmux-${uid}`;
    if (socketDir !== expectedSocketDir) {
      return {
        ok: false,
        error: `Invalid socket directory: ${socketDir}`
      };
    }

    try {
      if (fs.existsSync(socketDir)) {
        fs.rmSync(socketDir, { recursive: true, force: true });
      }
      fs.mkdirSync(socketDir, { mode: 0o700, recursive: true });
    } catch (fixErr) {
      return {
        ok: false,
        error: `tmux socket directory has permission issues.\n` +
          `Try running: tmux kill-server 2>/dev/null; rm -rf ${socketDir}; mkdir -m 700 ${socketDir}\n` +
          `Then retry your command.`
      };
    }
  }

  // Step 2: Verify tmux can run by checking version
  try {
    execSync('tmux -V', { stdio: 'pipe', timeout: 5000 });
  } catch (err) {
    const errMsg = err.stderr?.toString() || err.message || '';
    return { ok: false, error: `tmux verification failed: ${errMsg}` };
  }

  // Step 3: Check if server is already running by listing sessions
  // If no server, this starts one; if server exists, it just lists
  try {
    execSync('tmux list-sessions 2>/dev/null || true', {
      stdio: 'pipe',
      timeout: 5000,
      shell: true
    });
  } catch {
    // list-sessions failing is OK - server might not have sessions yet
    // The important thing is tmux binary works and directory is ready
  }

  return { ok: true };
}

/**
 * Check if inside a tmux session
 *
 * @returns {boolean}
 */
function isInsideTmux() {
  return !!process.env.TMUX;
}

/**
 * Get current tmux session name
 *
 * @returns {string|null}
 */
function getCurrentSession() {
  if (!isInsideTmux()) return null;
  try {
    return tmux(['display-message', '-p', '"#S"']).replace(/"/g, '');
  } catch {
    return null;
  }
}

/**
 * Pane class
 *
 * Represents a single tmux pane with an associated agent.
 */
class Pane {
  /**
   * Create a pane wrapper
   *
   * @param {Object} options - Pane options
   * @param {string} options.id - Pane identifier
   * @param {string} options.tmuxPaneId - tmux pane ID (e.g., "%1")
   * @param {string} [options.agentId] - Associated agent ID
   * @param {string} [options.sessionName] - tmux session name
   */
  constructor(options) {
    this.id = options.id;
    this.tmuxPaneId = options.tmuxPaneId;
    this.agentId = options.agentId || null;
    this.sessionName = options.sessionName || null;
    this.state = PaneState.CREATED;
    this.pid = null;
    this.createdAt = Date.now();
    this.command = null;
  }

  /**
   * Send text to the pane (simulates typing)
   *
   * @param {string} text - Text to send
   * @param {boolean} [enter=true] - Press enter after text
   */
  send(text, enter = true) {
    const escaped = text.replace(/"/g, '\\"');
    tmux(['send-keys', '-t', this.tmuxPaneId, `"${escaped}"`, enter ? 'Enter' : '']);
  }

  /**
   * Send keys to the pane
   *
   * @param {...string} keys - Keys to send (e.g., 'C-c', 'Enter')
   */
  sendKeys(...keys) {
    tmux(['send-keys', '-t', this.tmuxPaneId, ...keys]);
  }

  /**
   * Run a command in the pane
   *
   * @param {string} command - Command to execute
   * @param {Object} [env] - Environment variables
   */
  run(command, env = {}) {
    this.command = command;
    this.state = PaneState.RUNNING;

    // Build env string
    const envPrefix = Object.entries(env)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');

    const fullCommand = envPrefix ? `${envPrefix} ${command}` : command;
    this.send(fullCommand);
  }

  /**
   * Resize the pane
   *
   * @param {number|string} width - Width in columns or percentage (e.g., 50, "50%")
   * @param {number|string} height - Height in rows or percentage
   */
  resize(width, height) {
    if (typeof width === 'number') {
      tmux(['resize-pane', '-t', this.tmuxPaneId, '-x', width.toString()], { ignoreError: true });
    }
    if (typeof height === 'number') {
      tmux(['resize-pane', '-t', this.tmuxPaneId, '-y', height.toString()], { ignoreError: true });
    }
  }

  /**
   * Get pane dimensions
   *
   * @returns {{ width: number, height: number }}
   */
  getDimensions() {
    try {
      const width = parseInt(tmux(['display-message', '-t', this.tmuxPaneId, '-p', '#{pane_width}']));
      const height = parseInt(tmux(['display-message', '-t', this.tmuxPaneId, '-p', '#{pane_height}']));
      return { width, height };
    } catch {
      return { width: 80, height: 24 };
    }
  }

  /**
   * Capture pane output
   *
   * @param {Object} [options] - Capture options
   * @param {number} [options.lines] - Number of lines to capture (default all)
   * @param {boolean} [options.escape] - Include escape sequences
   * @returns {string} Captured text
   */
  getOutput(options = {}) {
    const args = ['capture-pane', '-t', this.tmuxPaneId, '-p'];

    if (options.lines) {
      args.push('-S', (-options.lines).toString());
    }
    if (options.escape) {
      args.push('-e');
    }

    return tmux(args, { ignoreError: true });
  }

  /**
   * Clear the pane
   */
  clear() {
    this.sendKeys('C-l');
  }

  /**
   * Send interrupt (Ctrl+C)
   */
  interrupt() {
    this.sendKeys('C-c');
  }

  /**
   * Focus this pane
   */
  focus() {
    tmux(['select-pane', '-t', this.tmuxPaneId]);
  }

  /**
   * Get pane info from tmux
   *
   * @returns {Object} Pane information
   */
  getInfo() {
    try {
      const format = '#{pane_pid}|#{pane_current_command}|#{pane_active}|#{pane_width}x#{pane_height}';
      const info = tmux(['display-message', '-t', this.tmuxPaneId, '-p', format]);
      const [pid, cmd, active, size] = info.split('|');
      const [width, height] = size.split('x').map(Number);

      return {
        id: this.id,
        tmuxPaneId: this.tmuxPaneId,
        agentId: this.agentId,
        pid: parseInt(pid),
        currentCommand: cmd,
        isActive: active === '1',
        width,
        height,
        state: this.state,
        createdAt: this.createdAt
      };
    } catch {
      return {
        id: this.id,
        tmuxPaneId: this.tmuxPaneId,
        agentId: this.agentId,
        state: PaneState.DEAD
      };
    }
  }

  /**
   * Check if pane is alive
   *
   * @returns {boolean}
   */
  isAlive() {
    try {
      tmux(['display-message', '-t', this.tmuxPaneId, '-p', '']);
      return true;
    } catch {
      this.state = PaneState.DEAD;
      return false;
    }
  }

  /**
   * Kill the pane
   */
  kill() {
    try {
      tmux(['kill-pane', '-t', this.tmuxPaneId], { ignoreError: true });
    } catch {
      // Ignore errors
    }
    this.state = PaneState.DEAD;
  }

  /**
   * Set pane title (visible in border)
   *
   * @param {string} title - Pane title
   */
  setTitle(title) {
    tmux(['select-pane', '-t', this.tmuxPaneId, '-T', title], { ignoreError: true });
  }

  /**
   * Enable/disable pane border status
   *
   * @param {boolean} show - Show pane border
   */
  setBorder(show) {
    const value = show ? 'on' : 'off';
    tmux(['set-option', '-p', '-t', this.tmuxPaneId, 'pane-border-status', value], { ignoreError: true });
  }
}

/**
 * Create a new pane in a session
 *
 * @param {Object} options - Creation options
 * @param {string} options.sessionName - Target session
 * @param {string} [options.id] - Pane identifier
 * @param {string} [options.agentId] - Associated agent
 * @param {string} [options.direction] - Split direction: 'h' (horizontal) or 'v' (vertical)
 * @param {number} [options.size] - Size percentage for split
 * @param {string} [options.targetPane] - Target pane to split (default: current)
 * @returns {Pane} New pane instance
 */
function createPane(options) {
  const {
    sessionName,
    id = `pane-${Date.now()}`,
    agentId = null,
    direction = 'v',
    size = 50,
    targetPane = null
  } = options;

  const args = ['split-window'];

  // Direction: -h for horizontal (side by side), -v for vertical (stacked)
  args.push(direction === 'h' ? '-h' : '-v');

  // Size percentage
  args.push('-p', size.toString());

  // Target pane
  if (targetPane) {
    args.push('-t', targetPane);
  } else if (sessionName) {
    args.push('-t', sessionName);
  }

  // Print new pane ID
  args.push('-P', '-F', '#{pane_id}');

  const tmuxPaneId = tmux(args);

  const pane = new Pane({
    id,
    tmuxPaneId,
    agentId,
    sessionName
  });

  return pane;
}

/**
 * Get all panes in a session
 *
 * @param {string} sessionName - Session name
 * @returns {Array<Object>} Pane information
 */
function listPanes(sessionName) {
  try {
    const format = '#{pane_id}|#{pane_pid}|#{pane_current_command}|#{pane_active}';
    const output = tmux(['list-panes', '-t', sessionName, '-F', format]);

    return output.split('\n').filter(Boolean).map(line => {
      const [paneId, pid, cmd, active] = line.split('|');
      return {
        tmuxPaneId: paneId,
        pid: parseInt(pid),
        command: cmd,
        isActive: active === '1'
      };
    });
  } catch {
    return [];
  }
}

/**
 * Get pane by tmux ID
 *
 * @param {string} tmuxPaneId - tmux pane ID
 * @param {Object} [options] - Additional options
 * @returns {Pane} Pane instance
 */
function getPane(tmuxPaneId, options = {}) {
  return new Pane({
    id: options.id || tmuxPaneId,
    tmuxPaneId,
    agentId: options.agentId,
    sessionName: options.sessionName
  });
}

module.exports = {
  Pane,
  PaneState,
  createPane,
  listPanes,
  getPane,
  tmux,
  isTmuxAvailable,
  ensureTmuxServer,
  isInsideTmux,
  getCurrentSession
};
