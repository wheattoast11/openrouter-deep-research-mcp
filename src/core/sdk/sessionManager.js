/**
 * SDK Session Manager
 *
 * Maps SDK sessions to Rail-based session tracking.
 * Provides session persistence, state management, and time-travel capabilities.
 *
 * @module core/sdk/sessionManager
 */

'use strict';

const { EventEmitter } = require('events');

/**
 * Session state
 */
const SessionState = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  EXPIRED: 'expired'
};

/**
 * Session event types
 */
const SessionEventType = {
  MESSAGE: 'message',
  TOOL_CALL: 'tool_call',
  SUBAGENT_SPAWN: 'subagent_spawn',
  CHECKPOINT: 'checkpoint',
  FORK: 'fork',
  ERROR: 'error'
};

/**
 * Session event record
 */
class SessionEvent {
  constructor(type, payload, metadata = {}) {
    this.id = `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.type = type;
    this.payload = payload;
    this.timestamp = Date.now();
    this.metadata = metadata;
    this.undone = false;
  }

  /**
   * Serialize event
   *
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      payload: this.payload,
      timestamp: this.timestamp,
      metadata: this.metadata,
      undone: this.undone
    };
  }

  /**
   * Create from JSON
   *
   * @param {Object} json
   * @returns {SessionEvent}
   */
  static fromJSON(json) {
    const event = new SessionEvent(json.type, json.payload, json.metadata);
    event.id = json.id;
    event.timestamp = json.timestamp;
    event.undone = json.undone;
    return event;
  }
}

/**
 * Managed Session
 */
class ManagedSession {
  constructor(id, config = {}) {
    this.id = id;
    this.state = SessionState.ACTIVE;
    this.events = [];
    this.checkpoints = new Map();
    this.forks = new Map();
    this.parentId = config.parentId || null;
    this.config = config;
    this.metadata = config.metadata || {};
    this.created = Date.now();
    this.lastActivity = Date.now();
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Add event to session
   *
   * @param {string} type - Event type
   * @param {any} payload - Event payload
   * @param {Object} [metadata] - Event metadata
   * @returns {SessionEvent}
   */
  addEvent(type, payload, metadata = {}) {
    const event = new SessionEvent(type, payload, metadata);
    this.events.push(event);
    this.lastActivity = Date.now();
    this.redoStack = []; // Clear redo stack on new event
    return event;
  }

  /**
   * Undo last event
   *
   * @returns {SessionEvent|null}
   */
  undo() {
    // Find last non-undone event
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i];
      if (!event.undone) {
        event.undone = true;
        this.undoStack.push(event.id);
        this.redoStack.push(event.id);
        this.lastActivity = Date.now();
        return event;
      }
    }
    return null;
  }

  /**
   * Redo last undone event
   *
   * @returns {SessionEvent|null}
   */
  redo() {
    const eventId = this.redoStack.pop();
    if (!eventId) return null;

    const event = this.events.find(e => e.id === eventId);
    if (event) {
      event.undone = false;
      this.undoStack = this.undoStack.filter(id => id !== eventId);
      this.lastActivity = Date.now();
    }
    return event || null;
  }

  /**
   * Create checkpoint
   *
   * @param {string} name - Checkpoint name
   * @returns {Object}
   */
  createCheckpoint(name) {
    const checkpoint = {
      id: `checkpoint-${Date.now()}`,
      name,
      eventIndex: this.events.length,
      timestamp: Date.now(),
      snapshot: this.getSnapshot()
    };
    this.checkpoints.set(checkpoint.id, checkpoint);
    this.addEvent(SessionEventType.CHECKPOINT, { checkpointId: checkpoint.id, name });
    return checkpoint;
  }

  /**
   * Restore to checkpoint
   *
   * @param {string} checkpointId
   * @returns {boolean}
   */
  restoreCheckpoint(checkpointId) {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) return false;

    // Mark all events after checkpoint as undone
    for (let i = checkpoint.eventIndex; i < this.events.length; i++) {
      this.events[i].undone = true;
    }
    this.lastActivity = Date.now();
    return true;
  }

  /**
   * Fork session
   *
   * @param {string} newId - New session ID
   * @returns {ManagedSession}
   */
  fork(newId) {
    const forked = new ManagedSession(newId, {
      ...this.config,
      parentId: this.id,
      metadata: { ...this.metadata, forkedFrom: this.id }
    });

    // Copy non-undone events
    forked.events = this.events
      .filter(e => !e.undone)
      .map(e => SessionEvent.fromJSON(e.toJSON()));

    // Copy checkpoints
    for (const [id, cp] of this.checkpoints) {
      forked.checkpoints.set(id, { ...cp });
    }

    this.forks.set(newId, forked);
    this.addEvent(SessionEventType.FORK, { forkId: newId });

    return forked;
  }

  /**
   * Get active events (non-undone)
   *
   * @returns {Array<SessionEvent>}
   */
  getActiveEvents() {
    return this.events.filter(e => !e.undone);
  }

  /**
   * Get session snapshot
   *
   * @returns {Object}
   */
  getSnapshot() {
    return {
      id: this.id,
      state: this.state,
      eventCount: this.events.length,
      activeEventCount: this.getActiveEvents().length,
      checkpointCount: this.checkpoints.size,
      forkCount: this.forks.size,
      created: this.created,
      lastActivity: this.lastActivity,
      canUndo: this.events.some(e => !e.undone),
      canRedo: this.redoStack.length > 0
    };
  }

  /**
   * Get session state for persistence
   *
   * @returns {Object}
   */
  getState() {
    return {
      id: this.id,
      state: this.state,
      events: this.events.map(e => e.toJSON()),
      checkpoints: Array.from(this.checkpoints.entries()),
      parentId: this.parentId,
      config: this.config,
      metadata: this.metadata,
      created: this.created,
      lastActivity: this.lastActivity
    };
  }

  /**
   * Restore session from state
   *
   * @param {Object} state
   * @returns {ManagedSession}
   */
  static fromState(state) {
    const session = new ManagedSession(state.id, state.config);
    session.state = state.state;
    session.events = state.events.map(e => SessionEvent.fromJSON(e));
    session.checkpoints = new Map(state.checkpoints);
    session.parentId = state.parentId;
    session.metadata = state.metadata;
    session.created = state.created;
    session.lastActivity = state.lastActivity;
    return session;
  }
}

/**
 * SDK Session Manager
 *
 * Manages session lifecycle and provides time-travel capabilities.
 */
class SDKSessionManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.sessions = new Map();
    this.railClient = options.railClient || null;
    this.persistenceAdapter = options.persistenceAdapter || null;
    this.logger = options.logger || console;
    this.defaultTTL = options.defaultTTL || 3600000; // 1 hour
    this.maxSessions = options.maxSessions || 100;
  }

  /**
   * Create a new session
   *
   * @param {Object} [config] - Session configuration
   * @returns {ManagedSession}
   */
  create(config = {}) {
    const id = config.id || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Check session limit
    if (this.sessions.size >= this.maxSessions) {
      this._evictOldestSession();
    }

    const session = new ManagedSession(id, config);
    this.sessions.set(id, session);
    this.emit('session-created', { sessionId: id });

    return session;
  }

  /**
   * Get session by ID
   *
   * @param {string} id
   * @returns {ManagedSession|null}
   */
  get(id) {
    return this.sessions.get(id) || null;
  }

  /**
   * Get or create session
   *
   * @param {string} id
   * @param {Object} [config]
   * @returns {ManagedSession}
   */
  getOrCreate(id, config = {}) {
    let session = this.get(id);
    if (!session) {
      session = this.create({ ...config, id });
    }
    return session;
  }

  /**
   * Add event to session
   *
   * @param {string} sessionId
   * @param {string} type
   * @param {any} payload
   * @param {Object} [metadata]
   * @returns {SessionEvent|null}
   */
  addEvent(sessionId, type, payload, metadata = {}) {
    const session = this.get(sessionId);
    if (!session) return null;

    const event = session.addEvent(type, payload, metadata);
    this.emit('event-added', { sessionId, eventId: event.id, type });

    return event;
  }

  /**
   * Undo last event in session
   *
   * @param {string} sessionId
   * @returns {SessionEvent|null}
   */
  undo(sessionId) {
    const session = this.get(sessionId);
    if (!session) return null;

    const event = session.undo();
    if (event) {
      this.emit('event-undone', { sessionId, eventId: event.id });
    }
    return event;
  }

  /**
   * Redo last undone event in session
   *
   * @param {string} sessionId
   * @returns {SessionEvent|null}
   */
  redo(sessionId) {
    const session = this.get(sessionId);
    if (!session) return null;

    const event = session.redo();
    if (event) {
      this.emit('event-redone', { sessionId, eventId: event.id });
    }
    return event;
  }

  /**
   * Create checkpoint in session
   *
   * @param {string} sessionId
   * @param {string} name
   * @returns {Object|null}
   */
  createCheckpoint(sessionId, name) {
    const session = this.get(sessionId);
    if (!session) return null;

    const checkpoint = session.createCheckpoint(name);
    this.emit('checkpoint-created', { sessionId, checkpointId: checkpoint.id, name });

    return checkpoint;
  }

  /**
   * Fork a session
   *
   * @param {string} sessionId
   * @param {string} [newId]
   * @returns {ManagedSession|null}
   */
  fork(sessionId, newId) {
    const session = this.get(sessionId);
    if (!session) return null;

    const forked = session.fork(newId || `${sessionId}-fork-${Date.now()}`);
    this.sessions.set(forked.id, forked);
    this.emit('session-forked', { originalId: sessionId, forkId: forked.id });

    return forked;
  }

  /**
   * Close session
   *
   * @param {string} sessionId
   * @returns {boolean}
   */
  close(sessionId) {
    const session = this.get(sessionId);
    if (!session) return false;

    session.state = SessionState.COMPLETED;
    this.emit('session-closed', { sessionId });

    return true;
  }

  /**
   * Delete session
   *
   * @param {string} sessionId
   * @returns {boolean}
   */
  delete(sessionId) {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      this.emit('session-deleted', { sessionId });
    }
    return deleted;
  }

  /**
   * List all sessions
   *
   * @param {Object} [filter]
   * @returns {Array<Object>}
   */
  list(filter = {}) {
    let sessions = Array.from(this.sessions.values());

    if (filter.state) {
      sessions = sessions.filter(s => s.state === filter.state);
    }

    return sessions.map(s => s.getSnapshot());
  }

  /**
   * Get manager state
   *
   * @returns {Object}
   */
  getState() {
    const sessions = this.list();
    return {
      sessionCount: sessions.length,
      activeSessions: sessions.filter(s => s.state === SessionState.ACTIVE).length,
      totalEvents: sessions.reduce((sum, s) => sum + s.eventCount, 0),
      maxSessions: this.maxSessions
    };
  }

  /**
   * Persist session to storage
   *
   * @param {string} sessionId
   * @returns {Promise<boolean>}
   */
  async persist(sessionId) {
    if (!this.persistenceAdapter) return false;

    const session = this.get(sessionId);
    if (!session) return false;

    try {
      await this.persistenceAdapter.save(sessionId, session.getState());
      this.emit('session-persisted', { sessionId });
      return true;
    } catch (error) {
      this.logger.error?.('Session persistence failed', { sessionId, error: error.message });
      return false;
    }
  }

  /**
   * Load session from storage
   *
   * @param {string} sessionId
   * @returns {Promise<ManagedSession|null>}
   */
  async load(sessionId) {
    if (!this.persistenceAdapter) return null;

    try {
      const state = await this.persistenceAdapter.load(sessionId);
      if (!state) return null;

      const session = ManagedSession.fromState(state);
      this.sessions.set(sessionId, session);
      this.emit('session-loaded', { sessionId });

      return session;
    } catch (error) {
      this.logger.error?.('Session load failed', { sessionId, error: error.message });
      return null;
    }
  }

  /**
   * Evict oldest inactive session
   *
   * @private
   */
  _evictOldestSession() {
    let oldest = null;
    let oldestTime = Infinity;

    for (const session of this.sessions.values()) {
      if (session.state !== SessionState.ACTIVE && session.lastActivity < oldestTime) {
        oldest = session;
        oldestTime = session.lastActivity;
      }
    }

    if (oldest) {
      this.delete(oldest.id);
    }
  }

  /**
   * Cleanup manager
   */
  destroy() {
    this.sessions.clear();
    this.removeAllListeners();
  }
}

/**
 * Create an SDK session manager
 *
 * @param {Object} [options]
 * @returns {SDKSessionManager}
 */
function createSDKSessionManager(options = {}) {
  return new SDKSessionManager(options);
}

module.exports = {
  SDKSessionManager,
  ManagedSession,
  SessionEvent,
  createSDKSessionManager,
  SessionState,
  SessionEventType,
  available: true
};
