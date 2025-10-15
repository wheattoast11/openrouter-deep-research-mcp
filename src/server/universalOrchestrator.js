// src/server/universalOrchestrator.js
/**
 * Universal Orchestrator - Tri-Agent Coordination
 * 
 * Coordinates between:
 * - Client Agent (Cursor/Claude Desktop)
 * - Server Agent (MCP Orchestrator) 
 * - Computer Agent (Gemini Computer Use)
 * 
 * All three share a unified latent space through embeddings and graph.
 */

const { v4: uuidv4 } = require('uuid');
const livingMemory = require('../intelligence/livingMemory');
const EventEmitter = require('events');

// Session states
const STATES = {
  IDLE: 'idle',
  INTENT_PARSING: 'intent_parsing',
  MEMORY_QUERY: 'memory_query',
  POLICY_SELECTION: 'policy_selection',
  PLANNING: 'planning',
  DISCOVERING: 'discovering',
  RESEARCHING: 'researching',
  SYNTHESIZING: 'synthesizing',
  COMPLETE: 'complete',
  ERROR: 'error'
};

class UniversalOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.agents = new Map(); // agentId -> agent instance
  }

  /**
   * Create a new research session
   */
  async createSession(clientId, options = {}) {
    const sessionId = options.sessionId || uuidv4();
    
    const session = {
      id: sessionId,
      state: STATES.IDLE,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      
      // Agents
      clientAgents: [{
        id: clientId,
        type: 'mcp-client',
        connectionId: options.connectionId,
        capabilities: options.capabilities || {}
      }],
      
      serverAgent: {
        id: 'server-' + sessionId,
        status: 'ready',
        activeTask: null
      },
      
      computerAgent: {
        id: 'computer-' + sessionId,
        status: 'idle',
        canvasType: null,
        currentUrl: null,
        screenshots: []
      },
      
      // Shared latent space
      sharedLatentSpace: {
        memory: livingMemory,
        embeddings: new Map(),
        conversationHistory: [],
        graphNodes: [],
        graphEdges: []
      },
      
      // Active research
      activeResearch: {
        query: null,
        intent: null,
        policy: null,
        progress: 0,
        findings: [],
        visualJourney: [],
        subAgents: []
      },
      
      // History
      history: [],
      
      // Options
      options
    };
    
    this.sessions.set(sessionId, session);
    
    console.error(`[${new Date().toISOString()}] Created session ${sessionId} for client ${clientId}`);
    
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Dispatch an action to a session
   */
  async dispatch(sessionId, action) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    // Update last activity
    session.lastActivity = Date.now();
    
    // Determine next state
    const nextState = this._transition(session.state, action);
    
    // Log state transition
    console.error(`[${new Date().toISOString()}] Session ${sessionId}: ${session.state} → ${nextState} (${action.type})`);
    
    // Update state
    const previousState = session.state;
    session.state = nextState;
    
    // Execute state action
    await this._executeStateAction(session, action);
    
    // Broadcast state change to all clients
    this.broadcast(sessionId, {
      method: 'state_change',
      params: {
        from: previousState,
        to: nextState,
        action: action.type
      }
    });
    
    // Record in history
    session.history.push({
      timestamp: Date.now(),
      state: nextState,
      action: action.type,
      payload: action.payload
    });
    
    return session;
  }

  /**
   * State transition logic
   * @private
   */
  _transition(currentState, action) {
    // State machine transitions
    const transitions = {
      [STATES.IDLE]: {
        'START_RESEARCH': STATES.INTENT_PARSING,
        'ERROR': STATES.ERROR
      },
      [STATES.INTENT_PARSING]: {
        'INTENT_PARSED': STATES.MEMORY_QUERY,
        'ERROR': STATES.ERROR
      },
      [STATES.MEMORY_QUERY]: {
        'MEMORY_QUERIED': STATES.POLICY_SELECTION,
        'ERROR': STATES.ERROR
      },
      [STATES.POLICY_SELECTION]: {
        'POLICY_SELECTED': STATES.PLANNING,
        'ERROR': STATES.ERROR
      },
      [STATES.PLANNING]: {
        'PLAN_READY': STATES.DISCOVERING,
        'ERROR': STATES.ERROR
      },
      [STATES.DISCOVERING]: {
        'SOURCES_FOUND': STATES.RESEARCHING,
        'ERROR': STATES.ERROR
      },
      [STATES.RESEARCHING]: {
        'RESEARCH_COMPLETE': STATES.SYNTHESIZING,
        'ERROR': STATES.ERROR
      },
      [STATES.SYNTHESIZING]: {
        'SYNTHESIS_COMPLETE': STATES.COMPLETE,
        'ERROR': STATES.ERROR
      },
      [STATES.COMPLETE]: {
        'START_RESEARCH': STATES.INTENT_PARSING,
        'RESET': STATES.IDLE
      },
      [STATES.ERROR]: {
        'RETRY': STATES.IDLE,
        'RESET': STATES.IDLE
      }
    };
    
    const stateTransitions = transitions[currentState] || {};
    return stateTransitions[action.type] || currentState;
  }

  /**
   * Execute action for current state
   * @private
   */
  async _executeStateAction(session, action) {
    switch (session.state) {
      case STATES.INTENT_PARSING:
        session.serverAgent.status = 'parsing-intent';
        session.serverAgent.activeTask = 'Understanding query';
        break;
      
      case STATES.MEMORY_QUERY:
        session.serverAgent.status = 'querying-memory';
        session.serverAgent.activeTask = 'Searching knowledge base';
        break;
      
      case STATES.POLICY_SELECTION:
        session.serverAgent.status = 'selecting-policy';
        session.serverAgent.activeTask = 'Choosing strategy';
        break;
      
      case STATES.DISCOVERING:
        session.serverAgent.status = 'discovering';
        session.serverAgent.activeTask = 'Finding sources';
        break;
      
      case STATES.RESEARCHING:
        session.serverAgent.status = 'researching';
        session.serverAgent.activeTask = 'Conducting research';
        session.computerAgent.status = 'active';
        break;
      
      case STATES.SYNTHESIZING:
        session.serverAgent.status = 'synthesizing';
        session.serverAgent.activeTask = 'Synthesizing findings';
        session.computerAgent.status = 'idle';
        break;
      
      case STATES.COMPLETE:
        session.serverAgent.status = 'complete';
        session.serverAgent.activeTask = null;
        session.computerAgent.status = 'idle';
        break;
      
      case STATES.ERROR:
        session.serverAgent.status = 'error';
        session.computerAgent.status = 'error';
        break;
      
      default:
        session.serverAgent.status = 'idle';
        session.serverAgent.activeTask = null;
    }
  }

  /**
   * Broadcast message to all clients in a session
   */
  broadcast(sessionId, message) {
    const session = this.sessions.get(sessionId);
    
    if (!session) return;
    
    // Emit to event bus (WebSocket handler will pick it up)
    this.emit('broadcast', {
      sessionId,
      message
    });
  }

  /**
   * Update research progress
   */
  updateProgress(sessionId, progress) {
    const session = this.sessions.get(sessionId);
    
    if (!session) return;
    
    session.activeResearch.progress = progress;
    
    this.broadcast(sessionId, {
      method: 'research_progress',
      params: {
        progress,
        findings: session.activeResearch.findings.length,
        insights: session.activeResearch.insights?.length || 0
      }
    });
  }

  /**
   * Add screenshot to visual journey
   */
  addScreenshot(sessionId, screenshot) {
    const session = this.sessions.get(sessionId);
    
    if (!session) return;
    
    session.computerAgent.screenshots.push(screenshot);
    session.activeResearch.visualJourney.push(screenshot);
    
    this.broadcast(sessionId, {
      method: 'visual_journey_step',
      params: screenshot
    });
  }

  /**
   * Update knowledge graph
   */
  updateGraph(sessionId, graphUpdate) {
    const session = this.sessions.get(sessionId);
    
    if (!session) return;
    
    const { nodes = [], edges = [] } = graphUpdate;
    
    // Merge with existing graph
    session.sharedLatentSpace.graphNodes = [
      ...session.sharedLatentSpace.graphNodes,
      ...nodes
    ];
    session.sharedLatentSpace.graphEdges = [
      ...session.sharedLatentSpace.graphEdges,
      ...edges
    ];
    
    this.broadcast(sessionId, {
      method: 'graph_update',
      params: {
        nodes: session.sharedLatentSpace.graphNodes,
        edges: session.sharedLatentSpace.graphEdges
      }
    });
  }

  /**
   * Register a sub-agent
   */
  registerSubAgent(sessionId, subAgent) {
    const session = this.sessions.get(sessionId);
    
    if (!session) return;
    
    session.activeResearch.subAgents.push({
      id: subAgent.id || uuidv4(),
      query: subAgent.query,
      status: 'active',
      progress: 0,
      finding: null,
      ...subAgent
    });
    
    this.broadcast(sessionId, {
      method: 'canvas_state_update',
      params: {
        agents: {
          client: session.clientAgents[0],
          server: session.serverAgent,
          computer: session.computerAgent,
          subAgents: session.activeResearch.subAgents
        }
      }
    });
  }

  /**
   * Update sub-agent status
   */
  updateSubAgent(sessionId, subAgentId, update) {
    const session = this.sessions.get(sessionId);
    
    if (!session) return;
    
    const subAgent = session.activeResearch.subAgents.find(a => a.id === subAgentId);
    
    if (subAgent) {
      Object.assign(subAgent, update);
      
      this.broadcast(sessionId, {
        method: 'canvas_state_update',
        params: {
          agents: {
            client: session.clientAgents[0],
            server: session.serverAgent,
            computer: session.computerAgent,
            subAgents: session.activeResearch.subAgents
          }
        }
      });
    }
  }

  /**
   * Clean up old sessions
   */
  cleanup(maxAge = 3600000) { // 1 hour default
    const now = Date.now();
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > maxAge) {
        console.error(`[${new Date().toISOString()}] Cleaning up inactive session ${sessionId}`);
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Get all sessions
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count
   */
  getSessionCount() {
    return this.sessions.size;
  }
}

// Singleton instance
const orchestrator = new UniversalOrchestrator();

// Auto-cleanup every 5 minutes
setInterval(() => {
  orchestrator.cleanup();
}, 300000);

module.exports = orchestrator;
module.exports.UniversalOrchestrator = UniversalOrchestrator;
module.exports.STATES = STATES;

