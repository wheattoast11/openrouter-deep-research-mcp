/**
 * Session Manager (Core Brains Layer)
 * 
 * Manages the "Persistent State" of an Agent Zero interaction.
 * Handles: History, Variables, Persona, and Context.
 * 
 * v1.16.0: Converged with EventStore for Isomorphic Persistence.
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const providerTelemetry = require('../utils/providerTelemetry');
const dbClient = require('../utils/dbClient');
const { getSessionManager: getStoreManager } = require('../utils/sessionStore');

class Session extends EventEmitter {
  constructor(id = null, options = {}, store = null) {
    super();
    this.id = id || crypto.randomUUID();
    this.created = Date.now();
    this.lastActive = Date.now();
    this.store = store; // EventStore instance
    
    // Memory Cache
    this.history = []; 
    this.variables = {}; 
    this.mode = options.mode || 'cli';
    
    // Context
    this.context = {
      workingDirectory: process.cwd(),
      systemInfo: {
        platform: process.platform,
        nodeVersion: process.version
      }
    };

    if (this.store) {
      this._syncFromStore();
    }
  }

  _syncFromStore() {
    const state = this.store.project();
    if (state.history) {
      this.history = state.history;
    } else if (state.queries) {
      // Legacy fallback
      this.history = state.queries.map(q => ({
        id: q.id,
        role: 'user',
        content: q.query,
        timestamp: q.timestamp,
        metadata: q.parameters
      }));
    }
  }

  async addMessage(role, content, metadata = {}) {
    const message = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: Date.now(),
      metadata
    };
    this.history.push(message);
    this.lastActive = Date.now();

    // Persist to EventStore if available
    if (this.store) {
      if (role === 'user') {
        this.store.append({
          type: 'QUERY_SUBMITTED',
          payload: {
            queryId: message.id,
            query: content,
            timestamp: new Date(message.timestamp).toISOString(),
            parameters: metadata
          }
        });
      } else if (role === 'assistant') {
        this.store.append({
          type: 'RESPONSE_RECEIVED', // Added this event type below
          payload: {
            responseId: message.id,
            content,
            timestamp: new Date(message.timestamp).toISOString(),
            metadata
          }
        });
      }
    }

    this.emit('message', message);
    return message;
  }

  setVariable(key, value) {
    this.variables[key] = value;
    this.emit('variable', { key, value });
  }

  getVariable(key) {
    return this.variables[key];
  }

  getMessages(limit = 20) {
    return this.history.slice(-limit).map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  updateTelemetry() {
    this.telemetrySnapshot = providerTelemetry.getSnapshot({ maxModels: 3 });
    this.emit('telemetry', this.telemetrySnapshot);
    return this.telemetrySnapshot;
  }

  clear() {
    this.history = [];
    this.variables = {};
    this.emit('clear');
  }

  toJSON() {
    return {
      id: this.id,
      created: this.created,
      mode: this.mode,
      historyCount: this.history.length,
      variables: Object.keys(this.variables)
    };
  }
}

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.activeSessionId = null;
    this.storeManager = getStoreManager(dbClient);
  }

  async getSession(id, options = {}) {
    if (this.sessions.has(id)) {
      return this.sessions.get(id);
    }

    const store = await this.storeManager.getSession(id);
    const session = new Session(id, options, store);
    this.sessions.set(session.id, session);
    return session;
  }

  async createSession(options = {}) {
    const id = crypto.randomUUID();
    return this.getSession(id, options);
  }

  async getActiveSession() {
    // For CLI, we use a 'default' session unless specified
    const id = this.activeSessionId || 'default-cli-session';
    this.activeSessionId = id;
    return this.getSession(id);
  }
}

module.exports = {
  Session,
  sessionManager: new SessionManager()
};
