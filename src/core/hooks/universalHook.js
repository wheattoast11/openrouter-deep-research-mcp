/**
 * Universal Hook System - fires events to both Claude Code and OpenCode
 * with shared knowledge graph tracking.
 *
 * Bridges hook events across providers (Claude Code, OpenCode) with unified
 * event semantics and knowledge graph integration.
 */

const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

/**
 * Universal Hook Event Types
 * Maps Claude Code events to OpenCode equivalents
 */
const UniversalEvents = {
  TOOL_BEFORE: 'tool:before',      // PreToolUse → custom
  TOOL_AFTER: 'tool:after',        // PostToolUse → custom
  SESSION_START: 'session:start',  // SessionStart → custom
  SESSION_END: 'session:end',      // SessionEnd → custom
  AGENT_COMPLETE: 'agent:complete', // SubagentStop → custom
  PROMPT_SUBMIT: 'prompt:submit',  // UserPromptSubmit → custom
  PRECOMPACT: 'precompact',        // PreCompact → custom
  STOP: 'stop',                    // Stop → custom
  NOTIFICATION: 'notification'     // Notification → custom
};

/**
 * Provider-specific event mappings
 */
const ClaudeCodeEvents = {
  [UniversalEvents.TOOL_BEFORE]: 'PreToolUse',
  [UniversalEvents.TOOL_AFTER]: 'PostToolUse',
  [UniversalEvents.SESSION_START]: 'SessionStart',
  [UniversalEvents.SESSION_END]: 'SessionEnd',
  [UniversalEvents.AGENT_COMPLETE]: 'SubagentStop',
  [UniversalEvents.PROMPT_SUBMIT]: 'UserPromptSubmit',
  [UniversalEvents.PRECOMPACT]: 'PreCompact',
  [UniversalEvents.STOP]: 'Stop',
  [UniversalEvents.NOTIFICATION]: 'Notification'
};

/**
 * UniversalHook - Cross-provider hook system with graph tracking
 */
class UniversalHook {
  constructor(config = {}) {
    this.claudeHooksPath = config.claudeHooksPath || path.join(os.homedir(), '.claude', 'settings.json');
    this.opencodeHooksPath = config.opencodeHooksPath || path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
    this.graphEnabled = config.graphEnabled !== false;
    this.dbClient = config.dbClient || null;
    this.eventHistory = [];
    this.maxHistorySize = config.maxHistorySize || 1000;

    // Provider metadata
    this.providers = {
      claudeCode: { id: 'claude-code', enabled: true, healthy: false },
      opencode: { id: 'opencode', enabled: true, healthy: false }
    };

    this._checkProviderHealth();
  }

  /**
   * Check if providers are available
   * @private
   */
  _checkProviderHealth() {
    // Check Claude Code
    try {
      if (fs.existsSync(this.claudeHooksPath)) {
        const data = JSON.parse(fs.readFileSync(this.claudeHooksPath, 'utf8'));
        this.providers.claudeCode.healthy = data && typeof data.hooks === 'object';
      }
    } catch (err) {
      this.providers.claudeCode.healthy = false;
    }

    // Check OpenCode
    try {
      if (fs.existsSync(this.opencodeHooksPath)) {
        const data = JSON.parse(fs.readFileSync(this.opencodeHooksPath, 'utf8'));
        this.providers.opencode.healthy = data && typeof data === 'object';
      }
    } catch (err) {
      this.providers.opencode.healthy = false;
    }
  }

  /**
   * Fire event to both providers
   * @param {string} event - Universal event name (e.g., 'tool:before')
   * @param {Object} payload - Event payload
   * @returns {Promise<Object>} Result summary
   */
  async fire(event, payload) {
    const eventId = `universal-${randomUUID()}`;
    const timestamp = new Date().toISOString();

    const results = {
      eventId,
      timestamp,
      event,
      claudeCode: null,
      opencode: null,
      graph: null,
      errors: []
    };

    // Fire to Claude Code
    if (this.providers.claudeCode.enabled && this.providers.claudeCode.healthy) {
      try {
        results.claudeCode = await this.fireClaudeHook(event, payload);
      } catch (err) {
        results.errors.push({ provider: 'claudeCode', error: err.message });
      }
    }

    // Fire to OpenCode
    if (this.providers.opencode.enabled && this.providers.opencode.healthy) {
      try {
        results.opencode = await this.fireOpencodeHook(event, payload);
      } catch (err) {
        results.errors.push({ provider: 'opencode', error: err.message });
      }
    }

    // Update knowledge graph
    if (this.graphEnabled && this.dbClient) {
      try {
        results.graph = await this.updateGraph(event, payload);
      } catch (err) {
        results.errors.push({ provider: 'graph', error: err.message });
      }
    }

    // Track in history
    this._addToHistory({ eventId, timestamp, event, payload, results });

    return results;
  }

  /**
   * Fire event to Claude Code hooks
   * @param {string} event - Universal event name
   * @param {Object} payload - Event payload
   * @returns {Promise<Object>} Claude Code hook result
   */
  async fireClaudeHook(event, payload) {
    const claudeEvent = ClaudeCodeEvents[event];
    if (!claudeEvent) {
      throw new Error(`No Claude Code mapping for event: ${event}`);
    }

    const eventId = `cc-event-${randomUUID()}`;
    const sessionId = payload.sessionId || payload.session_id || 'default';

    // Create hook payload in Claude Code format
    const hookPayload = {
      event_id: eventId,
      session_id: sessionId,
      event_type: claudeEvent,
      timestamp: new Date().toISOString(),
      ...payload
    };

    // Write to Claude Code session directory
    const sessionDir = path.join(os.homedir(), '.claude', 'sessions', sessionId);
    try {
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      const hookFile = path.join(sessionDir, `hook_${Date.now()}_${claudeEvent}.json`);
      fs.writeFileSync(hookFile, JSON.stringify(hookPayload, null, 2));

      return { eventId, file: hookFile, status: 'written' };
    } catch (err) {
      return { eventId, error: err.message, status: 'failed' };
    }
  }

  /**
   * Fire event to OpenCode hooks
   * @param {string} event - Universal event name
   * @param {Object} payload - Event payload
   * @returns {Promise<Object>} OpenCode hook result
   */
  async fireOpencodeHook(event, payload) {
    const eventId = `oc-event-${randomUUID()}`;

    // OpenCode uses custom event format (no built-in hooks like Claude Code)
    // We write to a standard events directory
    const eventsDir = path.join(os.homedir(), '.config', 'opencode', 'events');

    try {
      if (!fs.existsSync(eventsDir)) {
        fs.mkdirSync(eventsDir, { recursive: true });
      }

      const hookPayload = {
        event_id: eventId,
        event_type: event,
        timestamp: new Date().toISOString(),
        provider: 'opencode',
        ...payload
      };

      const hookFile = path.join(eventsDir, `${eventId}.json`);
      fs.writeFileSync(hookFile, JSON.stringify(hookPayload, null, 2));

      return { eventId, file: hookFile, status: 'written' };
    } catch (err) {
      return { eventId, error: err.message, status: 'failed' };
    }
  }

  /**
   * Update knowledge graph with event
   * @param {string} event - Universal event name
   * @param {Object} payload - Event payload
   * @returns {Promise<Object>} Graph update result
   */
  async updateGraph(event, payload) {
    if (!this.dbClient) {
      return { status: 'skipped', reason: 'No dbClient provided' };
    }

    try {
      const nodeId = `hook:${event}:${Date.now()}`;

      // For now, we'll use the dbClient's executeQuery to insert a hook event node
      // This assumes a graph-like structure or a table for tracking events
      // Since the actual graph tables aren't in dbClient.js, we'll create a simple event log

      const sql = `
        INSERT INTO hook_events (node_id, event_type, payload, timestamp)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT DO NOTHING
        RETURNING node_id
      `;

      // Create table if not exists (idempotent)
      await this.dbClient.executeQuery(`
        CREATE TABLE IF NOT EXISTS hook_events (
          id SERIAL PRIMARY KEY,
          node_id TEXT UNIQUE NOT NULL,
          event_type TEXT NOT NULL,
          payload JSONB,
          timestamp TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      const result = await this.dbClient.executeQuery(sql, [
        nodeId,
        event,
        JSON.stringify(payload)
      ]);

      return {
        status: 'inserted',
        nodeId: result.rows?.[0]?.node_id || nodeId,
        nodeType: 'hook_event'
      };
    } catch (err) {
      return {
        status: 'failed',
        error: err.message
      };
    }
  }

  /**
   * Install a hook definition to both providers
   * @param {Object} hookDef - Hook definition
   * @returns {Promise<Object>} Installation result
   */
  async installHook(hookDef) {
    const { event, matcher, command, type = 'command' } = hookDef;

    if (!event || !matcher) {
      throw new Error('Hook definition must include event and matcher');
    }

    const results = {
      claudeCode: null,
      opencode: null,
      errors: []
    };

    // Install to Claude Code
    if (this.providers.claudeCode.enabled && this.providers.claudeCode.healthy) {
      try {
        const claudeEvent = ClaudeCodeEvents[event];
        if (!claudeEvent) {
          throw new Error(`No Claude Code mapping for event: ${event}`);
        }

        const settings = JSON.parse(fs.readFileSync(this.claudeHooksPath, 'utf8'));

        if (!settings.hooks) settings.hooks = {};
        if (!settings.hooks[claudeEvent]) settings.hooks[claudeEvent] = [];

        settings.hooks[claudeEvent].push({
          matcher,
          hooks: [{ type, command }]
        });

        fs.writeFileSync(this.claudeHooksPath, JSON.stringify(settings, null, 2));
        results.claudeCode = { status: 'installed', event: claudeEvent };
      } catch (err) {
        results.errors.push({ provider: 'claudeCode', error: err.message });
      }
    }

    // Install to OpenCode (create hook file)
    if (this.providers.opencode.enabled) {
      try {
        const hooksDir = path.join(os.homedir(), '.config', 'opencode', 'hooks');
        if (!fs.existsSync(hooksDir)) {
          fs.mkdirSync(hooksDir, { recursive: true });
        }

        const hookFile = path.join(hooksDir, `${event.replace(/:/g, '_')}_${matcher}.sh`);
        fs.writeFileSync(hookFile, command, { mode: 0o755 });

        results.opencode = { status: 'installed', file: hookFile };
      } catch (err) {
        results.errors.push({ provider: 'opencode', error: err.message });
      }
    }

    return results;
  }

  /**
   * List installed hooks from both providers
   * @returns {Promise<Object>} Hook listings
   */
  async listHooks() {
    const listings = {
      claudeCode: [],
      opencode: [],
      errors: []
    };

    // List Claude Code hooks
    if (this.providers.claudeCode.healthy) {
      try {
        const settings = JSON.parse(fs.readFileSync(this.claudeHooksPath, 'utf8'));
        if (settings.hooks) {
          for (const [event, hookArray] of Object.entries(settings.hooks)) {
            listings.claudeCode.push({
              event,
              count: hookArray.length,
              matchers: hookArray.map(h => h.matcher)
            });
          }
        }
      } catch (err) {
        listings.errors.push({ provider: 'claudeCode', error: err.message });
      }
    }

    // List OpenCode hooks
    try {
      const hooksDir = path.join(os.homedir(), '.config', 'opencode', 'hooks');
      if (fs.existsSync(hooksDir)) {
        const files = fs.readdirSync(hooksDir);
        listings.opencode = files.map(f => ({
          file: f,
          path: path.join(hooksDir, f)
        }));
      }
    } catch (err) {
      listings.errors.push({ provider: 'opencode', error: err.message });
    }

    return listings;
  }

  /**
   * Get provider health status
   * @returns {Object} Provider health
   */
  getProviderHealth() {
    return {
      claudeCode: this.providers.claudeCode,
      opencode: this.providers.opencode,
      graph: {
        enabled: this.graphEnabled,
        available: !!this.dbClient
      }
    };
  }

  /**
   * Get event history
   * @param {number} limit - Maximum number of events to return
   * @returns {Array} Recent events
   */
  getEventHistory(limit = 50) {
    return this.eventHistory.slice(-limit);
  }

  /**
   * Clear event history
   */
  clearHistory() {
    this.eventHistory = [];
  }

  /**
   * Add event to history (internal)
   * @private
   */
  _addToHistory(entry) {
    this.eventHistory.push(entry);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }
}

module.exports = {
  UniversalHook,
  UniversalEvents,
  ClaudeCodeEvents
};
