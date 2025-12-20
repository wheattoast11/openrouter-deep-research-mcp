/**
 * Layout Engine
 *
 * Manages pane layouts for multi-agent orchestration.
 * Supports various layout strategies optimized for different agent counts.
 *
 * @module cli/orchestrator/core/layout
 */

'use strict';

const { createPane, listPanes, tmux, getPane } = require('./pane');

/**
 * Layout strategies
 */
const LayoutStrategy = {
  HORIZONTAL: 'horizontal',   // Side by side
  VERTICAL: 'vertical',       // Stacked
  GRID: 'grid',              // Grid arrangement
  MAIN_WITH_AGENTS: 'main_with_agents' // Main pane on top, agents below
};

/**
 * Default layout configuration
 */
const DEFAULT_LAYOUT = {
  strategy: LayoutStrategy.MAIN_WITH_AGENTS,
  mainPaneRatio: 30,  // Main pane gets 30% of height
  agentPaneRatio: 70, // Agents share 70%
  minPaneWidth: 40,
  minPaneHeight: 10
};

/**
 * Layout Manager
 *
 * Creates and manages pane layouts for agents.
 */
class LayoutManager {
  /**
   * Create layout manager
   *
   * @param {Object} options - Layout options
   * @param {string} options.sessionName - tmux session name
   * @param {string} [options.strategy] - Layout strategy
   * @param {number} [options.mainPaneRatio] - Main pane ratio
   */
  constructor(options) {
    this.sessionName = options.sessionName;
    this.strategy = options.strategy || DEFAULT_LAYOUT.strategy;
    this.mainPaneRatio = options.mainPaneRatio ?? DEFAULT_LAYOUT.mainPaneRatio;
    this.agentPaneRatio = 100 - this.mainPaneRatio;
    this.mainPane = null;
    this.agentPanes = new Map(); // agentId -> Pane
    this.initialized = false;
  }

  /**
   * Initialize the layout with a main pane
   *
   * @param {string} mainPaneId - Existing main pane ID
   */
  initialize(mainPaneId) {
    this.mainPane = getPane(mainPaneId, {
      id: 'main',
      sessionName: this.sessionName
    });
    this.mainPane.setTitle('zero');
    this.initialized = true;
  }

  /**
   * Get window dimensions
   *
   * @returns {{ width: number, height: number }}
   */
  getWindowSize() {
    try {
      const width = parseInt(tmux(['display-message', '-t', this.sessionName, '-p', '#{window_width}']));
      const height = parseInt(tmux(['display-message', '-t', this.sessionName, '-p', '#{window_height}']));
      return { width, height };
    } catch {
      return { width: 160, height: 48 }; // Reasonable defaults
    }
  }

  /**
   * Create layout for agents
   *
   * @param {Array<string>} agentIds - Agent identifiers
   * @returns {Map<string, Pane>} Map of agentId -> Pane
   */
  layoutAgents(agentIds) {
    if (agentIds.length === 0) {
      return new Map();
    }

    switch (this.strategy) {
      case LayoutStrategy.MAIN_WITH_AGENTS:
        return this._layoutMainWithAgents(agentIds);
      case LayoutStrategy.HORIZONTAL:
        return this._layoutHorizontal(agentIds);
      case LayoutStrategy.VERTICAL:
        return this._layoutVertical(agentIds);
      case LayoutStrategy.GRID:
        return this._layoutGrid(agentIds);
      default:
        return this._layoutMainWithAgents(agentIds);
    }
  }

  /**
   * Main pane on top (30%), agents split below (70%)
   *
   * @param {Array<string>} agentIds - Agent identifiers
   * @returns {Map<string, Pane>}
   * @private
   */
  _layoutMainWithAgents(agentIds) {
    const panes = new Map();
    const windowSize = this.getWindowSize();
    const agentCount = agentIds.length;

    // First agent splits from main pane
    const firstPane = createPane({
      sessionName: this.sessionName,
      id: agentIds[0],
      agentId: agentIds[0],
      direction: 'v', // Split vertically (stacked)
      size: this.agentPaneRatio,
      targetPane: this.mainPane.tmuxPaneId
    });
    panes.set(agentIds[0], firstPane);
    this.agentPanes.set(agentIds[0], firstPane);

    // Additional agents split horizontally in the agent area
    if (agentCount > 1) {
      let lastPane = firstPane;
      const remainingAgents = agentIds.slice(1);
      const widthPerAgent = Math.floor(100 / agentCount);

      for (let i = 0; i < remainingAgents.length; i++) {
        const agentId = remainingAgents[i];
        // Each subsequent agent splits from the last created pane
        const pane = createPane({
          sessionName: this.sessionName,
          id: agentId,
          agentId: agentId,
          direction: 'h', // Split horizontally (side by side)
          size: Math.floor(100 / (remainingAgents.length - i + 1)),
          targetPane: lastPane.tmuxPaneId
        });
        panes.set(agentId, pane);
        this.agentPanes.set(agentId, pane);
        lastPane = pane;
      }
    }

    // Balance the layout
    this._balanceLayout();

    return panes;
  }

  /**
   * All panes side by side
   *
   * @param {Array<string>} agentIds - Agent identifiers
   * @returns {Map<string, Pane>}
   * @private
   */
  _layoutHorizontal(agentIds) {
    const panes = new Map();
    const widthPerAgent = Math.floor(100 / (agentIds.length + 1)); // +1 for main

    let lastPane = this.mainPane;

    for (const agentId of agentIds) {
      const pane = createPane({
        sessionName: this.sessionName,
        id: agentId,
        agentId: agentId,
        direction: 'h',
        size: widthPerAgent,
        targetPane: lastPane.tmuxPaneId
      });
      panes.set(agentId, pane);
      this.agentPanes.set(agentId, pane);
      lastPane = pane;
    }

    return panes;
  }

  /**
   * All panes stacked vertically
   *
   * @param {Array<string>} agentIds - Agent identifiers
   * @returns {Map<string, Pane>}
   * @private
   */
  _layoutVertical(agentIds) {
    const panes = new Map();
    const heightPerAgent = Math.floor(100 / (agentIds.length + 1));

    let lastPane = this.mainPane;

    for (const agentId of agentIds) {
      const pane = createPane({
        sessionName: this.sessionName,
        id: agentId,
        agentId: agentId,
        direction: 'v',
        size: heightPerAgent,
        targetPane: lastPane.tmuxPaneId
      });
      panes.set(agentId, pane);
      this.agentPanes.set(agentId, pane);
      lastPane = pane;
    }

    return panes;
  }

  /**
   * Grid layout for many agents
   *
   * @param {Array<string>} agentIds - Agent identifiers
   * @returns {Map<string, Pane>}
   * @private
   */
  _layoutGrid(agentIds) {
    const panes = new Map();
    const totalPanes = agentIds.length + 1; // +1 for main

    // Calculate grid dimensions
    const cols = Math.ceil(Math.sqrt(totalPanes));
    const rows = Math.ceil(totalPanes / cols);

    // First create rows by splitting vertically
    const rowPanes = [this.mainPane];
    const rowHeight = Math.floor(100 / rows);

    for (let r = 1; r < rows; r++) {
      const rowPane = createPane({
        sessionName: this.sessionName,
        id: `row-${r}`,
        direction: 'v',
        size: Math.floor(100 / (rows - r + 1)),
        targetPane: rowPanes[r - 1].tmuxPaneId
      });
      rowPanes.push(rowPane);
    }

    // Then split each row horizontally
    let agentIndex = 0;
    for (let r = 0; r < rowPanes.length && agentIndex < agentIds.length; r++) {
      const agentsInRow = Math.min(cols - (r === 0 ? 1 : 0), agentIds.length - agentIndex);
      let lastPane = rowPanes[r];

      // Skip first cell in first row (that's the main pane)
      const startCol = r === 0 ? 1 : 0;

      for (let c = startCol; c < startCol + agentsInRow && agentIndex < agentIds.length; c++) {
        const agentId = agentIds[agentIndex];
        const pane = createPane({
          sessionName: this.sessionName,
          id: agentId,
          agentId: agentId,
          direction: 'h',
          size: Math.floor(100 / (startCol + agentsInRow - c)),
          targetPane: lastPane.tmuxPaneId
        });
        panes.set(agentId, pane);
        this.agentPanes.set(agentId, pane);
        lastPane = pane;
        agentIndex++;
      }
    }

    return panes;
  }

  /**
   * Balance pane sizes
   * @private
   */
  _balanceLayout() {
    // Use tmux's built-in layout balancing
    try {
      // Try tiled layout first for balanced sizing
      tmux(['select-layout', '-t', this.sessionName, 'tiled'], { ignoreError: true });

      // Then switch to our preferred layout
      if (this.strategy === LayoutStrategy.MAIN_WITH_AGENTS) {
        tmux(['select-layout', '-t', this.sessionName, 'main-horizontal'], { ignoreError: true });
      }
    } catch {
      // Ignore layout errors
    }
  }

  /**
   * Add a single agent pane
   *
   * @param {string} agentId - Agent identifier
   * @returns {Pane}
   */
  addAgentPane(agentId) {
    // Find the best pane to split
    const targetPane = this.agentPanes.size > 0
      ? Array.from(this.agentPanes.values())[this.agentPanes.size - 1]
      : this.mainPane;

    const direction = this.strategy === LayoutStrategy.VERTICAL ? 'v' : 'h';
    const size = 50; // Split in half

    const pane = createPane({
      sessionName: this.sessionName,
      id: agentId,
      agentId: agentId,
      direction,
      size,
      targetPane: targetPane.tmuxPaneId
    });

    this.agentPanes.set(agentId, pane);
    this._balanceLayout();

    return pane;
  }

  /**
   * Remove an agent pane
   *
   * @param {string} agentId - Agent identifier
   */
  removeAgentPane(agentId) {
    const pane = this.agentPanes.get(agentId);
    if (pane) {
      pane.kill();
      this.agentPanes.delete(agentId);
      this._balanceLayout();
    }
  }

  /**
   * Get pane for an agent
   *
   * @param {string} agentId - Agent identifier
   * @returns {Pane|null}
   */
  getAgentPane(agentId) {
    return this.agentPanes.get(agentId) || null;
  }

  /**
   * Focus the main pane
   */
  focusMain() {
    if (this.mainPane) {
      this.mainPane.focus();
    }
  }

  /**
   * Focus an agent's pane
   *
   * @param {string} agentId - Agent identifier
   */
  focusAgent(agentId) {
    const pane = this.agentPanes.get(agentId);
    if (pane) {
      pane.focus();
    }
  }

  /**
   * Resize main pane
   *
   * @param {number} ratio - New ratio (1-99)
   */
  resizeMain(ratio) {
    this.mainPaneRatio = Math.max(10, Math.min(90, ratio));
    this.agentPaneRatio = 100 - this.mainPaneRatio;

    if (this.mainPane) {
      const windowSize = this.getWindowSize();
      const height = Math.floor(windowSize.height * (this.mainPaneRatio / 100));
      this.mainPane.resize(null, height);
    }
  }

  /**
   * Swap two panes
   *
   * @param {string} agentId1 - First agent
   * @param {string} agentId2 - Second agent
   */
  swapPanes(agentId1, agentId2) {
    const pane1 = this.agentPanes.get(agentId1);
    const pane2 = this.agentPanes.get(agentId2);

    if (pane1 && pane2) {
      tmux(['swap-pane', '-s', pane1.tmuxPaneId, '-t', pane2.tmuxPaneId], { ignoreError: true });
    }
  }

  /**
   * Get layout info
   *
   * @returns {Object}
   */
  getInfo() {
    const windowSize = this.getWindowSize();
    const agentPanes = {};

    for (const [agentId, pane] of this.agentPanes) {
      agentPanes[agentId] = pane.getInfo();
    }

    return {
      strategy: this.strategy,
      mainPaneRatio: this.mainPaneRatio,
      agentPaneRatio: this.agentPaneRatio,
      windowSize,
      mainPane: this.mainPane?.getInfo(),
      agentPanes,
      agentCount: this.agentPanes.size
    };
  }

  /**
   * Apply a preset layout
   *
   * @param {string} preset - Preset name: 'even-horizontal', 'even-vertical', 'main-horizontal', 'main-vertical', 'tiled'
   */
  applyPreset(preset) {
    tmux(['select-layout', '-t', this.sessionName, preset], { ignoreError: true });
  }

  /**
   * Zoom/unzoom current pane
   */
  toggleZoom() {
    tmux(['resize-pane', '-t', this.sessionName, '-Z'], { ignoreError: true });
  }

  /**
   * Cleanup all agent panes
   */
  cleanup() {
    for (const pane of this.agentPanes.values()) {
      pane.kill();
    }
    this.agentPanes.clear();
  }
}

/**
 * Create layout manager
 *
 * @param {Object} options - Layout options
 * @returns {LayoutManager}
 */
function createLayoutManager(options) {
  return new LayoutManager(options);
}

module.exports = {
  LayoutManager,
  LayoutStrategy,
  createLayoutManager,
  DEFAULT_LAYOUT
};
