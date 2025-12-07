/**
 * Session Handlers
 *
 * Consolidated handlers for: undo, redo, fork_session, time_travel, session_state, checkpoint
 *
 * Integrates with SessionStore for time-travel capabilities.
 */

const { normalize } = require('../../core/normalize');

/**
 * Unified session handler
 *
 * Operations: state, undo, redo, fork, travel, checkpoint
 */
async function handleSession(op, params, context = {}) {
  const normalized = normalize('session', params);
  const { sessionStore } = context;

  if (!sessionStore) {
    throw new Error('Session store not available');
  }

  const sessionId = normalized.sessionId || normalized.id || 'default';

  switch (op) {
    case 'state':
      return getSessionState(sessionId, sessionStore);
    case 'undo':
      return undoAction(sessionId, sessionStore);
    case 'redo':
      return redoAction(sessionId, sessionStore);
    case 'fork':
      return forkSession(sessionId, normalized.newSessionId, sessionStore);
    case 'travel':
      return timeTravel(sessionId, normalized.timestamp, sessionStore);
    case 'checkpoint':
      return createCheckpoint(sessionId, normalized.name, sessionStore);
    default:
      throw new Error(`Unknown session operation: ${op}`);
  }
}

/**
 * Get current session state
 */
async function getSessionState(sessionId, sessionStore) {
  const state = await sessionStore.getState(sessionId);

  if (!state) {
    return {
      sessionId,
      exists: false,
      message: 'Session not found or empty'
    };
  }

  return {
    sessionId,
    exists: true,
    timestamp: state.timestamp || new Date().toISOString(),
    canUndo: state.undoStack?.length > 0,
    canRedo: state.redoStack?.length > 0,
    undoCount: state.undoStack?.length || 0,
    redoCount: state.redoStack?.length || 0,
    checkpoints: state.checkpoints || [],
    data: state.data || {}
  };
}

/**
 * Undo last action
 */
async function undoAction(sessionId, sessionStore) {
  const canUndo = await sessionStore.canUndo(sessionId);

  if (!canUndo) {
    return {
      sessionId,
      undone: false,
      message: 'Nothing to undo'
    };
  }

  const result = await sessionStore.undo(sessionId);

  return {
    sessionId,
    undone: true,
    action: result.action || 'unknown',
    timestamp: result.timestamp || new Date().toISOString(),
    message: `Undid: ${result.action || 'last action'}`
  };
}

/**
 * Redo previously undone action
 */
async function redoAction(sessionId, sessionStore) {
  const canRedo = await sessionStore.canRedo(sessionId);

  if (!canRedo) {
    return {
      sessionId,
      redone: false,
      message: 'Nothing to redo'
    };
  }

  const result = await sessionStore.redo(sessionId);

  return {
    sessionId,
    redone: true,
    action: result.action || 'unknown',
    timestamp: result.timestamp || new Date().toISOString(),
    message: `Redid: ${result.action || 'last undone action'}`
  };
}

/**
 * Fork session into new timeline
 */
async function forkSession(sourceId, newId, sessionStore) {
  const targetId = newId || `${sourceId}_fork_${Date.now()}`;

  // Check source exists
  const source = await sessionStore.getState(sourceId);

  if (!source) {
    return {
      forked: false,
      message: `Source session '${sourceId}' not found`
    };
  }

  // Create fork
  await sessionStore.fork(sourceId, targetId);

  return {
    forked: true,
    sourceSessionId: sourceId,
    newSessionId: targetId,
    timestamp: new Date().toISOString(),
    message: `Session forked. Use sessionId: "${targetId}" for the new timeline.`
  };
}

/**
 * Navigate to specific timestamp
 */
async function timeTravel(sessionId, timestamp, sessionStore) {
  if (!timestamp) {
    throw new Error('timestamp is required for time_travel');
  }

  // Parse timestamp
  let targetTime;
  try {
    targetTime = new Date(timestamp);
    if (isNaN(targetTime.getTime())) {
      throw new Error('Invalid timestamp format');
    }
  } catch (e) {
    throw new Error(`Invalid timestamp: ${timestamp}. Use ISO format (e.g., 2025-12-04T10:30:00Z)`);
  }

  const result = await sessionStore.timeTravel(sessionId, targetTime);

  return {
    sessionId,
    travelled: true,
    targetTimestamp: timestamp,
    actualTimestamp: result.timestamp || targetTime.toISOString(),
    stateFound: !!result.state,
    message: result.state
      ? `Travelled to ${result.timestamp || timestamp}`
      : `No state found at ${timestamp}, showing nearest`
  };
}

/**
 * Create named checkpoint
 */
async function createCheckpoint(sessionId, name, sessionStore) {
  if (!name) {
    throw new Error('name is required for checkpoint');
  }

  const timestamp = new Date().toISOString();
  await sessionStore.checkpoint(sessionId, name);

  return {
    sessionId,
    checkpointName: name,
    timestamp,
    message: `Checkpoint "${name}" created. Use time_travel or session_state to access.`
  };
}

/**
 * Legacy compatibility wrappers
 */
const undo = (params, ctx) => handleSession('undo', params, ctx);
const redo = (params, ctx) => handleSession('redo', params, ctx);
const fork = (params, ctx) => handleSession('fork', params, ctx);
const travel = (params, ctx) => handleSession('travel', params, ctx);
const state = (params, ctx) => handleSession('state', params, ctx);
const checkpoint = (params, ctx) => handleSession('checkpoint', params, ctx);

module.exports = {
  handleSession,
  getSessionState,
  undoAction,
  redoAction,
  forkSession,
  timeTravel,
  createCheckpoint,
  // Legacy exports
  undo,
  redo,
  fork,
  travel,
  state,
  checkpoint
};
