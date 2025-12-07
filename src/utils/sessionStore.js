// src/utils/sessionStore.js
// Session state management using @terminals-tech/core EventStore
// Provides time-travel, undo/redo, and session forking capabilities

const config = require('../../config');

let EventStore;
let coreInitialized = false;

// Lazy load @terminals-tech/core
async function initCoreModule() {
  if (coreInitialized) return true;
  try {
    const coreModule = await import('@terminals-tech/core');
    EventStore = coreModule.EventStore;
    coreInitialized = true;
    process.stderr.write(`[${new Date().toISOString()}] @terminals-tech/core initialized successfully.\n`);
    return true;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to initialize @terminals-tech/core:`, err);
    return false;
  }
}

// Session event types
const EventTypes = {
  QUERY_SUBMITTED: 'QUERY_SUBMITTED',
  REPORT_SAVED: 'REPORT_SAVED',
  REPORT_RATED: 'REPORT_RATED',
  SEARCH_PERFORMED: 'SEARCH_PERFORMED',
  TOOL_EXECUTED: 'TOOL_EXECUTED',
  SESSION_FORKED: 'SESSION_FORKED',
  CHECKPOINT_CREATED: 'CHECKPOINT_CREATED',
  // Job lifecycle events for batch research tracking
  JOBS_DISPATCHED: 'JOBS_DISPATCHED',
  JOBS_COMPLETED: 'JOBS_COMPLETED'
};

// Initial session state
const createInitialState = () => ({
  reports: [],
  queries: [],
  searches: [],
  toolExecutions: [],
  checkpoints: [],
  batchJobs: [], // Tracks batch research job dispatches for recovery
  currentReportId: null,
  metadata: {
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString()
  }
});

// Session state reducer - handles all event types
const sessionReducer = (state, event) => {
  const newState = { ...state };
  newState.metadata = { ...state.metadata, lastActivityAt: new Date().toISOString() };

  switch (event.type) {
    case EventTypes.QUERY_SUBMITTED:
      return {
        ...newState,
        queries: [...state.queries, {
          id: event.payload.queryId,
          query: event.payload.query,
          timestamp: event.payload.timestamp || new Date().toISOString(),
          parameters: event.payload.parameters
        }]
      };

    case EventTypes.REPORT_SAVED:
      return {
        ...newState,
        reports: [...state.reports, {
          id: event.payload.reportId,
          query: event.payload.query,
          timestamp: event.payload.timestamp || new Date().toISOString(),
          summary: event.payload.summary?.slice(0, 500)
        }],
        currentReportId: event.payload.reportId
      };

    case EventTypes.REPORT_RATED:
      return {
        ...newState,
        reports: state.reports.map(r =>
          r.id === event.payload.reportId
            ? { ...r, rating: event.payload.rating, ratingComment: event.payload.comment }
            : r
        )
      };

    case EventTypes.SEARCH_PERFORMED:
      return {
        ...newState,
        searches: [...state.searches, {
          query: event.payload.query,
          resultCount: event.payload.resultCount,
          timestamp: event.payload.timestamp || new Date().toISOString()
        }].slice(-100) // Keep last 100 searches
      };

    case EventTypes.TOOL_EXECUTED:
      return {
        ...newState,
        toolExecutions: [...state.toolExecutions, {
          tool: event.payload.tool,
          success: event.payload.success,
          timestamp: event.payload.timestamp || new Date().toISOString(),
          durationMs: event.payload.durationMs
        }].slice(-200) // Keep last 200 tool executions
      };

    case EventTypes.CHECKPOINT_CREATED:
      return {
        ...newState,
        checkpoints: [...state.checkpoints, {
          id: event.payload.checkpointId,
          name: event.payload.name,
          timestamp: new Date().toISOString(),
          eventIndex: event.payload.eventIndex
        }]
      };

    case EventTypes.JOBS_DISPATCHED:
      return {
        ...newState,
        batchJobs: [...(state.batchJobs || []), {
          batchId: event.payload.batchId,
          jobIds: event.payload.jobIds,
          queries: event.payload.queries,
          status: 'dispatched',
          dispatchedAt: event.payload.timestamp || new Date().toISOString(),
          costPreference: event.payload.costPreference,
          sseUrl: event.payload.sseUrl
        }].slice(-50) // Keep last 50 batch dispatches
      };

    case EventTypes.JOBS_COMPLETED:
      return {
        ...newState,
        batchJobs: (state.batchJobs || []).map(batch =>
          batch.batchId === event.payload.batchId
            ? {
                ...batch,
                status: 'completed',
                completedAt: event.payload.timestamp || new Date().toISOString(),
                results: event.payload.results,
                reportIds: event.payload.reportIds,
                successCount: event.payload.successCount,
                failureCount: event.payload.failureCount
              }
            : batch
        )
      };

    default:
      return state;
  }
};

class SessionManager {
  constructor(dbClient) {
    this.dbClient = dbClient;
    this.sessions = new Map(); // sessionId -> EventStore
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return true;

    const ready = await initCoreModule();
    if (!ready) return false;

    this.initialized = true;

    // Ensure session events table exists for persistence
    await this.ensureSchema();
    return true;
  }

  async ensureSchema() {
    if (!this.dbClient?.executeQuery) return;

    try {
      await this.dbClient.executeQuery(`
        CREATE TABLE IF NOT EXISTS session_events (
          id SERIAL PRIMARY KEY,
          session_id TEXT NOT NULL,
          event_index INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          payload JSONB,
          timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(session_id, event_index)
        );
      `, []);

      await this.dbClient.executeQuery(`
        CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id);
      `, []);

      await this.dbClient.executeQuery(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          parent_session_id TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          last_activity_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          metadata JSONB
        );
      `, []);

      process.stderr.write(`[${new Date().toISOString()}] Session store schema created/verified.\n`);
    } catch (err) {
      console.error('[SessionStore] Schema creation error:', err);
    }
  }

  /**
   * Get or create a session store for the given session ID
   */
  async getSession(sessionId) {
    if (!this.initialized) await this.initialize();
    if (!this.initialized) return null;

    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }

    // Create new EventStore for this session
    const store = new EventStore({
      initialState: createInitialState(),
      reducer: sessionReducer,
      persist: async (events) => {
        // Persist events to PGLite
        await this.persistEvents(sessionId, events);
      }
    });

    // Load existing events from database
    await this.loadEvents(sessionId, store);

    this.sessions.set(sessionId, store);

    // Register session in database
    await this.dbClient.executeQuery(`
      INSERT INTO sessions (id, metadata)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET last_activity_at = CURRENT_TIMESTAMP
    `, [sessionId, JSON.stringify({ initialized: new Date().toISOString() })]);

    return store;
  }

  async persistEvents(sessionId, events) {
    if (!this.dbClient?.executeQuery) return;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      try {
        await this.dbClient.executeQuery(`
          INSERT INTO session_events (session_id, event_index, event_type, payload)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (session_id, event_index) DO NOTHING
        `, [sessionId, i, event.type, JSON.stringify(event.payload)]);
      } catch (err) {
        console.error('[SessionStore] Error persisting event:', err);
      }
    }
  }

  async loadEvents(sessionId, store) {
    if (!this.dbClient?.executeQuery) return;

    try {
      const result = await this.dbClient.executeQuery(`
        SELECT event_type, payload FROM session_events
        WHERE session_id = $1
        ORDER BY event_index ASC
      `, [sessionId]);

      for (const row of result.rows || []) {
        store.append({
          type: row.event_type,
          payload: row.payload
        });
      }
    } catch (err) {
      console.error('[SessionStore] Error loading events:', err);
    }
  }

  /**
   * Dispatch an event to a session
   */
  async dispatch(sessionId, eventType, payload) {
    const store = await this.getSession(sessionId);
    if (!store) return null;

    store.append({ type: eventType, payload });

    // Update last activity
    await this.dbClient.executeQuery(`
      UPDATE sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [sessionId]);

    return store.project();
  }

  /**
   * Undo the last action in a session
   */
  async undo(sessionId) {
    const store = await this.getSession(sessionId);
    if (!store) return { success: false, error: 'Session not found' };

    try {
      const canUndo = store.undo();
      return {
        success: canUndo,
        state: store.project(),
        canUndo: store.canUndo ? store.canUndo() : false,
        canRedo: store.canRedo ? store.canRedo() : true
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Redo a previously undone action
   */
  async redo(sessionId) {
    const store = await this.getSession(sessionId);
    if (!store) return { success: false, error: 'Session not found' };

    try {
      const canRedo = store.redo();
      return {
        success: canRedo,
        state: store.project(),
        canUndo: store.canUndo ? store.canUndo() : true,
        canRedo: store.canRedo ? store.canRedo() : false
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Fork a session to create an alternate timeline
   */
  async forkSession(sessionId, newSessionId) {
    const store = await this.getSession(sessionId);
    if (!store) return { success: false, error: 'Session not found' };

    try {
      const forkedStore = store.fork();
      this.sessions.set(newSessionId, forkedStore);

      // Record fork relationship in database
      await this.dbClient.executeQuery(`
        INSERT INTO sessions (id, parent_session_id, metadata)
        VALUES ($1, $2, $3)
      `, [newSessionId, sessionId, JSON.stringify({ forkedAt: new Date().toISOString() })]);

      // Dispatch fork event to original session
      await this.dispatch(sessionId, EventTypes.SESSION_FORKED, {
        forkedSessionId: newSessionId
      });

      return {
        success: true,
        newSessionId,
        state: forkedStore.project()
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Navigate to a specific point in time
   */
  async timeTravel(sessionId, timestamp) {
    const store = await this.getSession(sessionId);
    if (!store) return { success: false, error: 'Session not found' };

    try {
      if (store.navigateToTime) {
        store.navigateToTime(new Date(timestamp));
      }
      return {
        success: true,
        state: store.project(),
        navigatedTo: timestamp
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Create a named checkpoint for easy navigation
   */
  async createCheckpoint(sessionId, name) {
    const store = await this.getSession(sessionId);
    if (!store) return { success: false, error: 'Session not found' };

    const checkpointId = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const events = store.getEvents ? store.getEvents() : [];

    await this.dispatch(sessionId, EventTypes.CHECKPOINT_CREATED, {
      checkpointId,
      name,
      eventIndex: events.length
    });

    return {
      success: true,
      checkpointId,
      name,
      eventCount: events.length
    };
  }

  /**
   * Get current session state
   */
  async getState(sessionId) {
    const store = await this.getSession(sessionId);
    if (!store) return null;

    return {
      state: store.project(),
      eventCount: store.getEvents ? store.getEvents().length : 0,
      canUndo: store.canUndo ? store.canUndo() : false,
      canRedo: store.canRedo ? store.canRedo() : false
    };
  }

  /**
   * Get all events for a session (for debugging/export)
   */
  async getEvents(sessionId) {
    const store = await this.getSession(sessionId);
    if (!store) return [];

    return store.getEvents ? store.getEvents() : [];
  }

  /**
   * List all active sessions
   */
  async listSessions(limit = 20) {
    try {
      const result = await this.dbClient.executeQuery(`
        SELECT id, parent_session_id, created_at, last_activity_at, metadata
        FROM sessions
        ORDER BY last_activity_at DESC
        LIMIT $1
      `, [limit]);

      return (result.rows || []).map(r => ({
        id: r.id,
        parentSessionId: r.parent_session_id,
        createdAt: r.created_at,
        lastActivityAt: r.last_activity_at,
        metadata: r.metadata
      }));
    } catch (err) {
      return [];
    }
  }
}

// Singleton instance
let sessionManagerInstance = null;

function getSessionManager(dbClient) {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager(dbClient);
  }
  return sessionManagerInstance;
}

module.exports = {
  SessionManager,
  getSessionManager,
  EventTypes
};
