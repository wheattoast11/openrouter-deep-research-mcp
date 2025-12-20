/**
 * Status Bar
 *
 * Renders a status bar showing agent states and orchestrator status.
 * Uses micro-term for ANSI formatting.
 *
 * @module cli/orchestrator/ui/statusBar
 */

'use strict';

const {
  style,
  bold,
  dim,
  red,
  green,
  yellow,
  cyan,
  blue,
  gray,
  getSize
} = require('../../lib/micro-term');
const { getAgent } = require('../agents/registry');

/**
 * Agent state indicators
 */
const StateIndicator = {
  ready: { symbol: '\u25cf', color: 'green', label: 'ready' },      // Solid circle
  thinking: { symbol: '\u25cb', color: 'yellow', label: 'thinking' }, // Empty circle
  error: { symbol: '\u25cf', color: 'red', label: 'error' },
  connecting: { symbol: '\u25cb', color: 'cyan', label: 'connecting' },
  disconnected: { symbol: '\u25cb', color: 'gray', label: 'offline' }
};

/**
 * Apply color to text based on color name
 *
 * @param {string} text - Text to color
 * @param {string} colorName - Color name
 * @returns {string} Colored text
 */
function applyColor(text, colorName) {
  switch (colorName) {
    case 'red': return red(text);
    case 'green': return green(text);
    case 'yellow': return yellow(text);
    case 'cyan': return cyan(text);
    case 'blue': return blue(text);
    case 'gray': return gray(text);
    case 'magenta': return style(text, 'magenta');
    case 'brightBlue': return style(text, 'brightBlue');
    case 'brightGreen': return style(text, 'brightGreen');
    case 'white': return style(text, 'white');
    default: return text;
  }
}

/**
 * Status Bar Renderer
 *
 * Renders orchestrator status bar.
 */
class StatusBar {
  /**
   * Create status bar
   *
   * @param {Object} options - Status bar options
   * @param {Object} [options.customIndicators] - Custom state indicators
   */
  constructor(options = {}) {
    this.customIndicators = options.customIndicators || {};
    this.lastRender = '';
  }

  /**
   * Get state indicator
   *
   * @param {string} state - Agent state
   * @returns {Object} Indicator config
   */
  getIndicator(state) {
    return this.customIndicators[state] || StateIndicator[state] || StateIndicator.disconnected;
  }

  /**
   * Format agent status segment
   *
   * @param {string} agentId - Agent identifier
   * @param {Object} agentState - Agent state info
   * @returns {string} Formatted segment
   */
  formatAgentStatus(agentId, agentState) {
    const agent = getAgent(agentId);
    const indicator = this.getIndicator(agentState.state || 'disconnected');
    const color = agent?.color || indicator.color;

    const symbol = applyColor(indicator.symbol, indicator.color);
    const name = applyColor(agentId, color);
    const state = dim(`:${indicator.label}`);

    return `${symbol} ${name}${state}`;
  }

  /**
   * Format lock status
   *
   * @param {number} connected - Connected count
   * @param {number} total - Total count
   * @returns {string} Formatted lock status
   */
  formatLockStatus(connected, total) {
    const ratio = `${connected}/${total}`;
    if (connected === total && total > 0) {
      return green(`[${ratio} locked]`);
    } else if (connected > 0) {
      return yellow(`[${ratio} locked]`);
    } else {
      return gray(`[${ratio} locked]`);
    }
  }

  /**
   * Format consensus status
   *
   * @param {Object} consensus - Consensus info
   * @returns {string} Formatted consensus
   */
  formatConsensus(consensus) {
    if (!consensus) return '';

    const confidence = Math.round(consensus.confidence * 100);
    let color = 'gray';
    if (confidence >= 80) color = 'green';
    else if (confidence >= 50) color = 'yellow';
    else color = 'red';

    return applyColor(`[consensus: ${confidence}%]`, color);
  }

  /**
   * Format query status
   *
   * @param {number} pending - Pending queries
   * @returns {string} Formatted query status
   */
  formatQueryStatus(pending) {
    if (pending === 0) return '';
    return yellow(`[${pending} pending]`);
  }

  /**
   * Render full status bar
   *
   * @param {Object} state - Orchestrator state
   * @param {Object} state.agents - Agent states { agentId: { state, ... } }
   * @param {number} [state.pendingQueries] - Pending query count
   * @param {Object} [state.consensus] - Current consensus info
   * @param {string} [state.mode] - Current mode
   * @returns {string} Rendered status bar
   */
  render(state) {
    const { columns } = getSize();
    const parts = [];

    // Zero indicator
    parts.push(cyan(bold('\u25c9 zero'))); // Double circle for orchestrator

    // Separator
    parts.push(dim('\u2502')); // Vertical bar

    // Agent statuses
    const agentIds = Object.keys(state.agents || {});
    const connectedCount = agentIds.filter(
      id => ['ready', 'thinking'].includes(state.agents[id]?.state)
    ).length;

    for (const agentId of agentIds) {
      const agentState = state.agents[agentId] || {};
      parts.push(this.formatAgentStatus(agentId, agentState));
    }

    // Separator
    if (agentIds.length > 0) {
      parts.push(dim('\u2502'));
    }

    // Lock status
    parts.push(this.formatLockStatus(connectedCount, agentIds.length));

    // Consensus status
    if (state.consensus) {
      parts.push(this.formatConsensus(state.consensus));
    }

    // Query status
    if (state.pendingQueries > 0) {
      parts.push(this.formatQueryStatus(state.pendingQueries));
    }

    // Mode indicator
    if (state.mode) {
      parts.push(dim(`[${state.mode}]`));
    }

    // Join with spaces
    const line = parts.join(' ');
    this.lastRender = line;

    return line;
  }

  /**
   * Render minimal status (for tight spaces)
   *
   * @param {Object} state - Orchestrator state
   * @returns {string} Minimal status
   */
  renderMinimal(state) {
    const agentIds = Object.keys(state.agents || {});
    const ready = agentIds.filter(id => state.agents[id]?.state === 'ready').length;
    const thinking = agentIds.filter(id => state.agents[id]?.state === 'thinking').length;
    const total = agentIds.length;

    const parts = [cyan('\u25c9')]; // Zero indicator

    if (thinking > 0) {
      parts.push(yellow(`${thinking}T`));
    }
    if (ready > 0) {
      parts.push(green(`${ready}R`));
    }

    parts.push(dim(`/${total}`));

    return parts.join('');
  }

  /**
   * Render agent list for help display
   *
   * @param {Object} agents - Agent states
   * @returns {Array<string>} Lines to display
   */
  renderAgentList(agents) {
    const lines = [];
    lines.push(bold('Connected Agents:'));

    for (const [agentId, state] of Object.entries(agents)) {
      const indicator = this.getIndicator(state.state || 'disconnected');
      const agent = getAgent(agentId);
      const name = agent?.name || agentId;
      const symbol = applyColor(indicator.symbol, indicator.color);
      const uptime = state.connectedAt
        ? dim(` (${formatUptime(Date.now() - state.connectedAt)})`)
        : '';

      lines.push(`  ${symbol} ${name}${uptime}`);
    }

    if (Object.keys(agents).length === 0) {
      lines.push(dim('  No agents connected'));
    }

    return lines;
  }

  /**
   * Get status bar width
   *
   * @returns {number} Character count of last render
   */
  getWidth() {
    // Strip ANSI codes for width calculation
    return this.lastRender.replace(/\x1b\[[0-9;]*m/g, '').length;
  }
}

/**
 * Format uptime duration
 *
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted duration
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Create a status bar instance
 *
 * @param {Object} [options] - Status bar options
 * @returns {StatusBar}
 */
function createStatusBar(options = {}) {
  return new StatusBar(options);
}

module.exports = {
  StatusBar,
  createStatusBar,
  StateIndicator,
  formatUptime
};
