/**
 * Renderer
 *
 * Main render loop and UI management for the orchestrator.
 * Handles keyboard input, screen updates, and state display.
 *
 * @module cli/orchestrator/ui/renderer
 */

'use strict';

const { EventEmitter } = require('events');
const readline = require('readline');
const {
  cursor,
  screen,
  getSize,
  writeln,
  write,
  bold,
  dim,
  cyan,
  green,
  yellow,
  red
} = require('../../lib/micro-term');
const { StatusBar, createStatusBar } = require('./statusBar');
const { CommandHandler, parseCommand } = require('./commands');

/**
 * Render mode
 */
const RenderMode = {
  NORMAL: 'normal',
  INPUT: 'input',
  OUTPUT: 'output'
};

/**
 * Key bindings
 */
const KeyBindings = {
  CTRL_C: '\x03',
  CTRL_D: '\x04',
  CTRL_L: '\x0c',
  ENTER: '\r',
  BACKSPACE: '\x7f',
  DELETE: '\x1b[3~',
  UP: '\x1b[A',
  DOWN: '\x1b[B',
  LEFT: '\x1b[C',
  RIGHT: '\x1b[D',
  TAB: '\t',
  ESC: '\x1b'
};

/**
 * Orchestrator Renderer
 *
 * Manages the orchestrator's terminal UI.
 *
 * Events:
 * - input: User input submitted (input)
 * - command: Command parsed (command, args)
 * - quit: Quit requested
 * - resize: Terminal resized (columns, rows)
 */
class Renderer extends EventEmitter {
  /**
   * Create renderer
   *
   * @param {Object} options - Renderer options
   * @param {Object} options.context - Orchestrator context
   * @param {StatusBar} [options.statusBar] - Status bar instance
   */
  constructor(options = {}) {
    super();
    this.context = options.context;
    this.statusBar = options.statusBar || createStatusBar();
    this.commandHandler = new CommandHandler(options.context);

    this.mode = RenderMode.NORMAL;
    this.inputBuffer = '';
    this.inputHistory = [];
    this.historyIndex = -1;
    this.cursorPos = 0;
    this.outputBuffer = [];
    this.maxOutputLines = 100;
    this.promptChar = '> ';
    this.running = false;

    this._setupCommandHandler();
  }

  /**
   * Set up command handler events
   * @private
   */
  _setupCommandHandler() {
    this.commandHandler.on('output', (lines) => {
      for (const line of lines) {
        this.addOutput(line);
      }
      this.renderOutput();
    });

    this.commandHandler.on('quit', () => {
      this.emit('quit');
    });

    this.commandHandler.on('clear', () => {
      this.clearOutput();
      this.render();
    });

    this.commandHandler.on('error', (err) => {
      this.addOutput(red(`Error: ${err.message}`));
      this.renderOutput();
    });
  }

  /**
   * Start the renderer
   */
  start() {
    if (this.running) return;
    this.running = true;

    // Set up raw mode for keyboard input
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      process.stdin.on('keypress', (char, key) => this._handleKeypress(char, key));
    }

    // Handle resize
    process.stdout.on('resize', () => {
      const size = getSize();
      this.emit('resize', size.columns, size.rows);
      this.render();
    });

    // Initial render
    this.render();
  }

  /**
   * Stop the renderer
   */
  stop() {
    this.running = false;
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    cursor.show();
  }

  /**
   * Handle keypress event
   *
   * @param {string} char - Character pressed
   * @param {Object} key - Key info
   * @private
   */
  _handleKeypress(char, key) {
    if (!this.running) return;

    // Handle Ctrl+C
    if (key?.ctrl && key?.name === 'c') {
      this.emit('quit');
      return;
    }

    // Handle Ctrl+D
    if (key?.ctrl && key?.name === 'd') {
      this.emit('quit');
      return;
    }

    // Handle Ctrl+L (clear)
    if (key?.ctrl && key?.name === 'l') {
      this.clearOutput();
      this.render();
      return;
    }

    // Handle Enter
    if (key?.name === 'return' || char === KeyBindings.ENTER) {
      this._submitInput();
      return;
    }

    // Handle Backspace
    if (key?.name === 'backspace' || char === KeyBindings.BACKSPACE) {
      if (this.cursorPos > 0) {
        this.inputBuffer =
          this.inputBuffer.slice(0, this.cursorPos - 1) +
          this.inputBuffer.slice(this.cursorPos);
        this.cursorPos--;
        this.renderPrompt();
      }
      return;
    }

    // Handle Delete
    if (key?.name === 'delete') {
      if (this.cursorPos < this.inputBuffer.length) {
        this.inputBuffer =
          this.inputBuffer.slice(0, this.cursorPos) +
          this.inputBuffer.slice(this.cursorPos + 1);
        this.renderPrompt();
      }
      return;
    }

    // Handle Up arrow (history)
    if (key?.name === 'up') {
      this._historyUp();
      return;
    }

    // Handle Down arrow (history)
    if (key?.name === 'down') {
      this._historyDown();
      return;
    }

    // Handle Left arrow
    if (key?.name === 'left') {
      if (this.cursorPos > 0) {
        this.cursorPos--;
        this.renderPrompt();
      }
      return;
    }

    // Handle Right arrow
    if (key?.name === 'right') {
      if (this.cursorPos < this.inputBuffer.length) {
        this.cursorPos++;
        this.renderPrompt();
      }
      return;
    }

    // Handle Tab (completion)
    if (key?.name === 'tab') {
      this._handleTab();
      return;
    }

    // Handle regular character input
    if (char && !key?.ctrl && !key?.meta) {
      this.inputBuffer =
        this.inputBuffer.slice(0, this.cursorPos) +
        char +
        this.inputBuffer.slice(this.cursorPos);
      this.cursorPos++;
      this.renderPrompt();
    }
  }

  /**
   * Submit input
   * @private
   */
  async _submitInput() {
    const input = this.inputBuffer.trim();

    if (!input) {
      this.renderPrompt();
      return;
    }

    // Add to history
    if (this.inputHistory[this.inputHistory.length - 1] !== input) {
      this.inputHistory.push(input);
      if (this.inputHistory.length > 100) {
        this.inputHistory.shift();
      }
    }
    this.historyIndex = -1;

    // Clear input
    this.inputBuffer = '';
    this.cursorPos = 0;

    // Add input to output
    this.addOutput(cyan(this.promptChar) + input);

    // Check if command
    const parsed = parseCommand(input);
    if (parsed) {
      this.emit('command', parsed.command, parsed.args);
      await this.commandHandler.execute(parsed);
    } else {
      // Regular input - emit and possibly broadcast
      this.emit('input', input);
      this.addOutput(dim('(Input not a command. Use /help for commands or /broadcast to send to agents)'));
    }

    this.renderOutput();
    this.renderPrompt();
  }

  /**
   * Navigate history up
   * @private
   */
  _historyUp() {
    if (this.inputHistory.length === 0) return;

    if (this.historyIndex === -1) {
      this.historyIndex = this.inputHistory.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex--;
    }

    this.inputBuffer = this.inputHistory[this.historyIndex];
    this.cursorPos = this.inputBuffer.length;
    this.renderPrompt();
  }

  /**
   * Navigate history down
   * @private
   */
  _historyDown() {
    if (this.historyIndex === -1) return;

    if (this.historyIndex < this.inputHistory.length - 1) {
      this.historyIndex++;
      this.inputBuffer = this.inputHistory[this.historyIndex];
    } else {
      this.historyIndex = -1;
      this.inputBuffer = '';
    }

    this.cursorPos = this.inputBuffer.length;
    this.renderPrompt();
  }

  /**
   * Handle tab completion
   * @private
   */
  _handleTab() {
    const input = this.inputBuffer;

    // Command completion
    if (input.startsWith('/')) {
      const partial = input.slice(1).toLowerCase();
      const { COMMANDS } = require('./commands');
      const matches = Object.keys(COMMANDS).filter(cmd => cmd.startsWith(partial));

      if (matches.length === 1) {
        this.inputBuffer = '/' + matches[0] + ' ';
        this.cursorPos = this.inputBuffer.length;
        this.renderPrompt();
      } else if (matches.length > 1) {
        this.addOutput(dim('Commands: ' + matches.join(', ')));
        this.renderOutput();
        this.renderPrompt();
      }
    }
  }

  /**
   * Add output line
   *
   * @param {string} line - Line to add
   */
  addOutput(line) {
    this.outputBuffer.push(line);
    if (this.outputBuffer.length > this.maxOutputLines) {
      this.outputBuffer.shift();
    }
  }

  /**
   * Clear output buffer
   */
  clearOutput() {
    this.outputBuffer = [];
  }

  /**
   * Full render
   */
  render() {
    if (!this.running) return;

    screen.clear();
    this.renderStatusBar();
    this.renderOutput();
    this.renderPrompt();
  }

  /**
   * Render status bar
   */
  renderStatusBar() {
    const state = this._getOrchestratorState();
    const statusLine = this.statusBar.render(state);

    cursor.move(1, 1);
    write(statusLine);
    writeln('');
    writeln(dim('\u2500'.repeat(getSize().columns)));
  }

  /**
   * Render output area
   */
  renderOutput() {
    const { rows } = getSize();
    const availableRows = rows - 4; // Status bar (2) + prompt (1) + margin

    // Get visible lines
    const visibleLines = this.outputBuffer.slice(-availableRows);

    // Move to output area start
    cursor.move(1, 4);

    for (const line of visibleLines) {
      screen.clearLine();
      writeln(line);
    }

    // Clear remaining lines
    for (let i = visibleLines.length; i < availableRows; i++) {
      screen.clearLine();
      writeln('');
    }
  }

  /**
   * Render prompt line
   */
  renderPrompt() {
    const { rows, columns } = getSize();

    // Move to prompt line (bottom)
    cursor.move(1, rows);
    screen.clearLine();

    // Render prompt
    const prompt = cyan(this.promptChar) + this.inputBuffer;

    // Handle long input (scroll)
    const maxInputWidth = columns - this.promptChar.length - 2;
    let displayInput = this.inputBuffer;
    let displayCursorPos = this.cursorPos;

    if (this.inputBuffer.length > maxInputWidth) {
      const start = Math.max(0, this.cursorPos - maxInputWidth + 10);
      displayInput = this.inputBuffer.slice(start, start + maxInputWidth);
      displayCursorPos = this.cursorPos - start;
    }

    write(cyan(this.promptChar) + displayInput);

    // Position cursor
    cursor.move(this.promptChar.length + displayCursorPos + 1, rows);
  }

  /**
   * Get orchestrator state for status bar
   *
   * @returns {Object}
   * @private
   */
  _getOrchestratorState() {
    if (!this.context.bridge) {
      return { agents: {}, pendingQueries: 0 };
    }

    const connectedAgents = this.context.bridge.getConnectedAgents();
    const agents = {};

    for (const agentId of connectedAgents) {
      const info = this.context.bridge.getAgentInfo(agentId);
      agents[agentId] = {
        state: info?.state === 'connected' ? 'ready' : (info?.state || 'disconnected'),
        connectedAt: info?.connectedAt
      };
    }

    return {
      agents,
      pendingQueries: this.context.bus?.getPendingQueries()?.length || 0
    };
  }

  /**
   * Update status bar only
   */
  updateStatus() {
    if (!this.running) return;
    cursor.save();
    this.renderStatusBar();
    cursor.restore();
  }

  /**
   * Show notification message
   *
   * @param {string} message - Message to show
   * @param {string} [type] - Type: info, success, warning, error
   */
  notify(message, type = 'info') {
    let formatted;
    switch (type) {
      case 'success': formatted = green('\u2713 ' + message); break;
      case 'warning': formatted = yellow('\u26a0 ' + message); break;
      case 'error': formatted = red('\u2717 ' + message); break;
      default: formatted = cyan('\u2139 ' + message);
    }

    this.addOutput(formatted);
    this.renderOutput();
    this.renderPrompt();
  }

  /**
   * Show agent activity
   *
   * @param {string} agentId - Agent that had activity
   * @param {string} activity - Activity description
   */
  showActivity(agentId, activity) {
    this.addOutput(dim(`[${agentId}] ${activity}`));
    this.renderOutput();
    this.renderPrompt();
  }
}

/**
 * Create renderer instance
 *
 * @param {Object} options - Renderer options
 * @returns {Renderer}
 */
function createRenderer(options) {
  return new Renderer(options);
}

module.exports = {
  Renderer,
  RenderMode,
  KeyBindings,
  createRenderer
};
