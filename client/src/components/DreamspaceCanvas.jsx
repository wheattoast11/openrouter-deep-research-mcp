// client/src/components/DreamspaceCanvas.jsx
/**
 * Dreamspace Canvas - The Visual Consciousness
 * 
 * A self-authoring UI that visualizes the agent's cognitive landscape in real-time.
 * Features soft gradient animations, context-aware containers, and tri-agent coordination display.
 * 
 * Layout:
 * - Left: Agent Dashboard (trio + sub-agents)
 * - Center: Research Visualization (graph + findings)
 * - Right: Visual Journey Timeline (screenshots)
 * - Bottom: Conversational Interface (user ↔ agent)
 */

import React, { useEffect, useReducer, useRef, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import AgentDashboard from './AgentDashboard';
import ResearchVisualization from './ResearchVisualization';
import VisualJourney from './VisualJourney';
import ConversationInterface from './ConversationInterface';
import ContextContainer from './ContextContainer';
import ModeShifter from './ModeShifter';
import './DreamspaceCanvas.css';

// Research phases for visualization
const RESEARCH_PHASES = {
  IDLE: { name: 'idle', color: '#6b7280', label: 'Ready' },
  INTENT: { name: 'intent', color: '#8b5cf6', label: 'Understanding' },
  MEMORY: { name: 'memory', color: '#ec4899', label: 'Recalling' },
  POLICY: { name: 'policy', color: '#3b82f6', label: 'Planning' },
  DISCOVERY: { name: 'discovery', color: '#8b5cf6', label: 'Discovering' },
  RESEARCH: { name: 'research', color: '#3b82f6', label: 'Researching' },
  SYNTHESIS: { name: 'synthesis', color: '#14b8a6', label: 'Synthesizing' },
  COMPLETE: { name: 'complete', color: '#10b981', label: 'Complete' },
  ERROR: { name: 'error', color: '#ef4444', label: 'Error' }
};

// State reducer for Dreamspace
function dreamspaceReducer(state, action) {
  switch (action.type) {
    case 'CONNECT':
      return { ...state, connected: true, connecting: false };
    
    case 'DISCONNECT':
      return { ...state, connected: false, connecting: false };
    
    case 'UPDATE_PHASE':
      return {
        ...state,
        currentPhase: action.payload.phase,
        phaseColor: RESEARCH_PHASES[action.payload.phase.toUpperCase()]?.color || '#6b7280',
        phaseLabel: RESEARCH_PHASES[action.payload.phase.toUpperCase()]?.label || action.payload.phase
      };
    
    case 'UPDATE_AGENTS':
      return {
        ...state,
        agents: action.payload.agents
      };
    
    case 'ADD_SCREENSHOT':
      return {
        ...state,
        screenshots: [...state.screenshots, action.payload.screenshot]
      };
    
    case 'UPDATE_GRAPH':
      return {
        ...state,
        graph: action.payload.graph
      };
    
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload.message]
      };
    
    case 'UPDATE_RESEARCH':
      return {
        ...state,
        activeResearch: {
          ...state.activeResearch,
          ...action.payload
        }
      };
    
    case 'SET_MODE':
      return {
        ...state,
        mode: action.payload.mode
      };
    
    case 'UPDATE_CONFIDENCE':
      return {
        ...state,
        confidence: action.payload.confidence
      };
    
    case 'UPDATE_IMPORTANCE':
      return {
        ...state,
        importance: action.payload.importance
      };
    
    default:
      return state;
  }
}

// Initial state
const initialState = {
  connected: false,
  connecting: true,
  currentPhase: 'idle',
  phaseColor: RESEARCH_PHASES.IDLE.color,
  phaseLabel: RESEARCH_PHASES.IDLE.label,
  mode: 'async', // 'async' or 'sync'
  confidence: 0.5,
  importance: 0.5,
  agents: {
    client: { status: 'idle', activeTask: null },
    server: { status: 'idle', activeTask: null },
    computer: { status: 'idle', activeTask: null },
    subAgents: []
  },
  screenshots: [],
  graph: { nodes: [], edges: [] },
  messages: [],
  activeResearch: {
    query: null,
    progress: 0,
    findings: [],
    insights: []
  }
};

export default function DreamspaceCanvas({ sessionId }) {
  const [state, dispatch] = useReducer(dreamspaceReducer, initialState);
  const canvasRef = useRef(null);
  
  // WebSocket connection
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/mcp/ws?session=${sessionId}`;
  const { socket, connected, send } = useWebSocket(wsUrl);

  // Handle WebSocket events
  useEffect(() => {
    if (!socket) return;

    socket.onopen = () => {
      dispatch({ type: 'CONNECT' });
    };

    socket.onclose = () => {
      dispatch({ type: 'DISCONNECT' });
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [socket]);

  // Handle incoming messages
  const handleMessage = (message) => {
    const { method, params } = message;

    switch (method) {
      case 'notifications/message':
        handleNotification(params);
        break;
      
      case 'progress':
        handleProgress(params);
        break;
      
      case 'state_change':
        handleStateChange(params);
        break;
      
      default:
        console.log('Unhandled message:', message);
    }
  };

  const handleNotification = (params) => {
    const { type, data } = params;

    switch (type) {
      case 'phase':
        dispatch({ type: 'UPDATE_PHASE', payload: { phase: data.phase } });
        break;
      
      case 'intent':
        dispatch({ 
          type: 'UPDATE_RESEARCH',
          payload: {
            query: data.query,
            complexity: data.complexity,
            novelty: data.novelty
          }
        });
        dispatch({ type: 'UPDATE_CONFIDENCE', payload: { confidence: data.confidence } });
        break;
      
      case 'policy':
        dispatch({
          type: 'UPDATE_RESEARCH',
          payload: {
            strategy: data.strategy,
            agents: data.agents,
            estimatedDuration: data.estimatedDuration
          }
        });
        break;
      
      case 'insight':
        const newInsights = state.activeResearch.insights || [];
        newInsights.push(data);
        dispatch({
          type: 'UPDATE_RESEARCH',
          payload: { insights: newInsights }
        });
        break;
      
      case 'synthesis':
        dispatch({
          type: 'UPDATE_RESEARCH',
          payload: {
            synthesis: data.text,
            confidence: data.confidence
          }
        });
        dispatch({ type: 'UPDATE_PHASE', payload: { phase: 'complete' } });
        break;
      
      case 'canvas_state_update':
        dispatch({ type: 'UPDATE_AGENTS', payload: { agents: data.agents } });
        break;
      
      case 'visual_journey_step':
        dispatch({ type: 'ADD_SCREENSHOT', payload: { screenshot: data } });
        break;
      
      case 'graph_update':
        dispatch({ type: 'UPDATE_GRAPH', payload: { graph: data } });
        break;
      
      case 'complete':
        dispatch({ type: 'UPDATE_PHASE', payload: { phase: 'complete' } });
        dispatch({ type: 'UPDATE_CONFIDENCE', payload: { confidence: data.confidence } });
        break;
      
      case 'error':
        dispatch({ type: 'UPDATE_PHASE', payload: { phase: 'error' } });
        break;
    }
  };

  const handleProgress = (params) => {
    if (params.progress !== undefined) {
      dispatch({
        type: 'UPDATE_RESEARCH',
        payload: { progress: params.progress }
      });
    }
  };

  const handleStateChange = (params) => {
    const { from, to, action } = params;
    dispatch({ type: 'UPDATE_PHASE', payload: { phase: to } });
  };

  const handleSendMessage = (message) => {
    // Add to local messages
    dispatch({
      type: 'ADD_MESSAGE',
      payload: {
        message: {
          role: 'user',
          content: message,
          timestamp: Date.now()
        }
      }
    });

    // Send via WebSocket
    send({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'agent',
        arguments: {
          query: message,
          async: true,
          costPreference: 'low'
        }
      }
    });
  };

  const handleModeShift = (newMode) => {
    dispatch({ type: 'SET_MODE', payload: { mode: newMode } });
  };

  return (
    <div className="dreamspace-root" ref={canvasRef}>
      {/* Connection Status Indicator */}
      <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
        <div className="status-dot"></div>
        <span>{connected ? 'Connected' : 'Connecting...'}</span>
      </div>

      {/* Mode Shifter */}
      <ModeShifter
        mode={state.mode}
        onShift={handleModeShift}
        phase={state.currentPhase}
      />

      {/* Main Canvas */}
      <ContextContainer
        confidence={state.confidence}
        phase={state.currentPhase}
        importance={state.importance}
        className="dreamspace-canvas"
      >
        {/* Top Bar: Phase Indicator */}
        <div className="phase-indicator">
          <div 
            className="phase-glow"
            style={{ 
              backgroundColor: state.phaseColor,
              boxShadow: `0 0 ${state.importance * 30}px ${state.phaseColor}`
            }}
          ></div>
          <span className="phase-label">{state.phaseLabel}</span>
          {state.activeResearch.query && (
            <span className="query-preview">
              {state.activeResearch.query.substring(0, 60)}...
            </span>
          )}
        </div>

        {/* Main Layout Grid */}
        <div className="dreamspace-grid">
          {/* Left Pane: Agent Dashboard */}
          <div className="pane left-pane">
            <AgentDashboard
              agents={state.agents}
              currentPhase={state.currentPhase}
              activeResearch={state.activeResearch}
            />
          </div>

          {/* Center: Research Visualization */}
          <div className="pane center-pane">
            <ResearchVisualization
              graph={state.graph}
              insights={state.activeResearch.insights}
              findings={state.activeResearch.findings}
              synthesis={state.activeResearch.synthesis}
              phase={state.currentPhase}
              confidence={state.confidence}
            />
          </div>

          {/* Right Pane: Visual Journey */}
          <div className="pane right-pane">
            <VisualJourney
              screenshots={state.screenshots}
              currentStep={state.screenshots.length}
              phase={state.currentPhase}
            />
          </div>

          {/* Bottom: Conversation Interface */}
          <div className="pane bottom-pane">
            <ConversationInterface
              messages={state.messages}
              onSendMessage={handleSendMessage}
              mode={state.mode}
              connected={connected}
            />
          </div>
        </div>

        {/* Floating Progress Indicator */}
        {state.activeResearch.progress > 0 && state.activeResearch.progress < 1 && (
          <div className="floating-progress">
            <div 
              className="progress-bar"
              style={{ width: `${state.activeResearch.progress * 100}%` }}
            ></div>
          </div>
        )}
      </ContextContainer>
    </div>
  );
}




