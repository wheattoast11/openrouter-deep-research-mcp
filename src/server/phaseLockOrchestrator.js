/**
 * Phase-Lock Orchestrator - Bidirectional Client↔Server Synchronization
 * 
 * Manages phase-locked communication between:
 * 1. External client (Claude Desktop, Cursor, API consumer)
 * 2. MCP Server (this server)
 * 3. Internal UI client (spawned via clientLauncher)
 * 
 * Architecture: Client ↔ Server ↔ Client where server spawns internal
 * client to visualize its own state, creating recursive topology.
 * 
 * @module server/phaseLockOrchestrator
 */

const clientLauncher = require('./clientLauncher');
const elicitationManager = require('./elicitation');
const EventEmitter = require('events');

class PhaseLockOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map(); // sessionId -> session state
    this.phaseLocks = new Map(); // sessionId -> phase lock state
    this.enabled = process.env.PHASE_LOCK_ENABLED !== 'false';
  }

  /**
   * Initialize phase-locked session
   * 
   * @param {string} sessionId - Session identifier
   * @param {Object} transport - WebSocket transport
   * @param {Object} options - Session options
   * @returns {Promise<Object>} Session metadata
   */
  async initializeSession(sessionId, transport, options = {}) {
    if (!this.enabled) {
      return { phaselock: false, reason: 'Disabled via env' };
    }

    // Create session state
    this.sessions.set(sessionId, {
      id: sessionId,
      transport,
      externalClient: {
        connected: true,
        lastHeartbeat: Date.now()
      },
      internalClient: null,
      phaseLock: {
        locked: false,
        phase: 'idle',
        synchronizedAt: null
      },
      options
    });

    // Spawn internal UI client
    const launchResult = await clientLauncher.launchDreamspace(sessionId, {
      position: options.position || 'corner',
      autoHide: options.autoHide !== false
    });

    if (launchResult.launched) {
      const session = this.sessions.get(sessionId);
      session.internalClient = {
        launched: true,
        url: launchResult.url,
        launchedAt: Date.now()
      };

      // Wait for internal client to connect via WebSocket
      this._waitForInternalClientConnection(sessionId, 10000);
    }

    return {
      phaselock: true,
      sessionId,
      internalClientLaunched: launchResult.launched,
      internalClientUrl: launchResult.url
    };
  }

  /**
   * Wait for internal client to establish WebSocket connection
   * @private
   */
  async _waitForInternalClientConnection(sessionId, timeout = 10000) {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const session = this.sessions.get(sessionId);
        
        if (!session) {
          clearInterval(checkInterval);
          resolve(false);
          return;
        }

        // Check if we have established bidirectional connection
        if (session.internalClient && session.internalClient.transport) {
          clearInterval(checkInterval);
          this._establishPhaseLock(sessionId);
          resolve(true);
          return;
        }

        // Timeout
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          console.warn(`[PhaseLock] Internal client connection timeout for ${sessionId}`);
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Register internal client connection
   * 
   * Called when internal UI connects via WebSocket
   */
  registerInternalClient(sessionId, transport) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      console.warn(`[PhaseLock] No session found for ${sessionId}`);
      return false;
    }

    if (session.internalClient) {
      session.internalClient.transport = transport;
      session.internalClient.connectedAt = Date.now();
      
      this._establishPhaseLock(sessionId);
      return true;
    }

    return false;
  }

  /**
   * Establish phase lock between external and internal clients
   * @private
   */
  _establishPhaseLock(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) return;

    session.phaseLock = {
      locked: true,
      phase: 'synchronized',
      synchronizedAt: Date.now(),
      heartbeatInterval: 1000 // 1s heartbeat
    };

    // Start heartbeat
    session.phaseLock.heartbeat = setInterval(() => {
      this._sendHeartbeat(sessionId);
    }, session.phaseLock.heartbeatInterval);

    console.error(`[PhaseLock] Established for session ${sessionId}`);
    
    // Emit event
    this.emit('phaselock:established', { sessionId });

    // Notify both clients
    this._broadcastToSession(sessionId, 'phaselock/established', {
      sessionId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast event to all clients in a session (external + internal)
   * 
   * This creates the bidirectional sync loop
   * 
   * @param {string} sessionId - Session ID
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   */
  _broadcastToSession(sessionId, eventType, payload) {
    const session = this.sessions.get(sessionId);
    
    if (!session) return;

    // Send to external client
    if (session.transport && session.transport.sendEvent) {
      session.transport.sendEvent(eventType, payload);
    }

    // Send to internal client
    if (session.internalClient?.transport && session.internalClient.transport.sendEvent) {
      session.internalClient.transport.sendEvent(eventType, payload);
    }
  }

  /**
   * Send heartbeat to maintain phase lock
   * @private
   */
  _sendHeartbeat(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session || !session.phaseLock.locked) return;

    const heartbeat = {
      timestamp: Date.now(),
      phase: session.phaseLock.phase,
      externalAlive: session.externalClient.connected,
      internalAlive: session.internalClient?.transport ? true : false
    };

    this._broadcastToSession(sessionId, 'phaselock/heartbeat', heartbeat);
  }

  /**
   * Forward agent event to all clients in session
   * 
   * This is the key method for streaming - any agent event gets
   * mirrored to both the external client AND the internal UI
   * 
   * @param {string} sessionId - Session ID
   * @param {string} eventType - Event type (e.g., 'tool.started')
   * @param {Object} payload - Event payload
   */
  async streamEvent(sessionId, eventType, payload) {
    this._broadcastToSession(sessionId, eventType, payload);
  }

  /**
   * Elicit input from user via external client,
   * show visualization in internal client
   * 
   * @param {string} sessionId - Session ID
   * @param {Object} request - Elicitation request
   * @returns {Promise<Object>} User response
   */
  async elicitWithVisualization(sessionId, request) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Send visualization to internal client
    if (session.internalClient?.transport) {
      session.internalClient.transport.sendEvent('elicitation/visualize', {
        prompt: request.prompt,
        schema: request.schema
      });
    }

    // Elicit from external client
    const response = await elicitationManager.request(session.transport, request);
    
    // Update internal client with response
    if (session.internalClient?.transport) {
      session.internalClient.transport.sendEvent('elicitation/response', {
        data: response
      });
    }

    return response;
  }

  /**
   * Clean up session
   */
  async closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) return;

    // Stop heartbeat
    if (session.phaseLock.heartbeat) {
      clearInterval(session.phaseLock.heartbeat);
    }

    // Close internal client
    if (session.internalClient?.launched) {
      await clientLauncher.closeDreamspace(sessionId);
    }

    this.sessions.delete(sessionId);
    this.phaseLocks.delete(sessionId);

    console.error(`[PhaseLock] Session ${sessionId} closed`);
  }

  /**
   * Get session stats
   */
  getStats() {
    const sessions = Array.from(this.sessions.values());
    
    return {
      totalSessions: sessions.length,
      phaseLocked: sessions.filter(s => s.phaseLock.locked).length,
      withInternalClient: sessions.filter(s => s.internalClient?.launched).length
    };
  }
}

// Singleton instance
const orchestrator = new PhaseLockOrchestrator();

module.exports = orchestrator;
module.exports.PhaseLockOrchestrator = PhaseLockOrchestrator;

