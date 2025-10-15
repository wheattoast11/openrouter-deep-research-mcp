import { useState, useEffect, useRef } from 'react'
import CommandBar from './components/CommandBar'
import EventStream from './components/EventStream'
import AgentStatus from './components/AgentStatus'
import KnowledgeGraph from './components/KnowledgeGraph'
import JobPanel from './components/JobPanel'
import ToolPanel from './components/ToolPanel'
import ElicitationModal from './components/ElicitationModal'
import CognitiveSubstrate from './components/CognitiveSubstrate'
import TracesPanel from './components/TracesPanel'
import ModelSelector from './components/ModelSelector'
import { setRemoteForwarder, updateStackMode } from './client/ContextGateway'

function App() {
  const [ws, setWs] = useState(null)
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState([])
  const [agentStatus, setAgentStatus] = useState('disconnected')
  const [isCollapsed, setIsCollapsed] = useState(false)
  // Env-gated private mode and initial stack mode
  const isPrivate = (import.meta.env.VITE_PRIVATE_AGENT === '1')
  const initialMode = (isPrivate && String(import.meta.env.VITE_STACK_MODE || '').toLowerCase() === 'local') ? 'local' : 'remote'
  const [viewMode, setViewMode] = useState(initialMode) // 'remote' | 'local'

  // Job streams and tool outputs
  const [activeJobs, setActiveJobs] = useState(new Map())
  const [jobStreams, setJobStreams] = useState(new Map())
  const [toolOutputs, setToolOutputs] = useState(new Map())
  const [showJobPanel, setShowJobPanel] = useState(false)
  const [showToolPanel, setShowToolPanel] = useState(false)
  const [elicitationRequest, setElicitationRequest] = useState(null)
  const [showTraces, setShowTraces] = useState(false)

  useEffect(() => {
    // Auto-connect to WebSocket on mount
    const token = new URLSearchParams(window.location.search).get('token') || 'demo'
    const host = import.meta.env.VITE_SERVER_HOST || window.location.hostname
    const port = import.meta.env.VITE_SERVER_PORT || '3009'
    const proto = (window.location.protocol === 'https:') ? 'wss' : 'ws'
    const wsUrl = `${proto}://${host}:${port}/mcp/ws?token=${token}`
    
    const websocket = new WebSocket(wsUrl)
    
    websocket.onopen = () => {
      console.log('WebSocket connected')
      setConnected(true)
      setAgentStatus('idle')
      setRemoteForwarder((msg) => websocket.send(msg))
    }
    
    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        console.log('Received:', message)
        
        // Handle different event types
        switch (message.type) {
          case 'session.started':
            setAgentStatus('idle')
            addEvent({ type: 'system', text: 'Session started', data: message.payload })
            break
          case 'agent.thinking':
            setAgentStatus('thinking')
            addEvent({ type: 'agent', text: message.payload.thought })
            break
          case 'agent.status_update':
            setAgentStatus(message.payload.status)
            addEvent({ type: 'status', text: `Status: ${message.payload.status}` })
            break
          case 'agent.proactive_suggestion':
            addEvent({ type: 'suggestion', text: message.payload.suggestion || 'New suggestion available' })
            break
          case 'temporal.action_triggered':
            addEvent({ type: 'temporal', text: `Scheduled action: ${message.payload.action?.type}`, data: message.payload })
            break
          case 'temporal.monitor_update':
            addEvent({ type: 'monitor', text: `New information: ${message.payload.query}`, data: message.payload })
            break
          case 'temporal.briefing_generated':
            addEvent({ type: 'briefing', text: 'Daily briefing ready', data: message.payload })
            break
          // no default
        }
      } catch (error) {
        console.error('Error parsing message:', error)
      }
    }
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error)
      setConnected(false)
      setAgentStatus('error')
    }
    
    websocket.onclose = () => {
      console.log('WebSocket closed')
      setConnected(false)
      setAgentStatus('disconnected')
      setRemoteForwarder(null)
    }
    
    setWs(websocket)
    
    return () => {
      websocket.close()
    }
  }, [])

  useEffect(() => {
    updateStackMode(viewMode)
  }, [viewMode])

  const addEvent = (event) => {
    setEvents(prev => [...prev, { ...event, id: Date.now(), timestamp: new Date().toISOString() }])
  }

  const handleElicitationSubmit = (elicitationId, data) => {
    if (ws && connected) {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'elicitation_response',
          arguments: { elicitationId, data }
        },
        id: Date.now()
      }))
      setElicitationRequest(null)
    }
  }

  const sendCommand = async (command) => {
    if (!ws || !connected) {
      console.error('WebSocket not connected')
      return
    }

    try {
      // Parse command and send appropriate message
      if (command.startsWith('/steer')) {
        const goal = command.slice(6).trim()
        ws.send(JSON.stringify({
          type: 'agent.steer',
          payload: { new_goal: goal }
        }))
        addEvent({ type: 'user', text: `Steering: ${goal}` })
        } else if (command.startsWith('/context')) {
        const info = command.slice(8).trim()
        ws.send(JSON.stringify({
          type: 'agent.provide_context',
          payload: { new_information: info }
        }))
        addEvent({ type: 'user', text: `Context: ${info}` })
      } else {
        // Default: send as JSON-RPC tool call
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'agent',
            arguments: {
              query: command,
              async: true
            }
          },
          id: Date.now()
        }))
        addEvent({ type: 'user', text: command })
      }
    } catch (error) {
      console.error('Error sending command:', error)
      addEvent({ type: 'error', text: error.message })
    }
  }

  return (
    <div className="min-h-screen bg-terminal-bg flex flex-col">
      {/* Header */}
      <header className="glass border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-terminal-success animate-pulse-slow" />
          <h1 className="text-lg font-semibold">Agent Console</h1>
          <span className="text-xs text-terminal-muted">v2.0</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Mode Toggle (env-gated) */}
          {isPrivate && (
            <button
              onClick={() => setViewMode(viewMode === 'remote' ? 'local' : 'remote')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                viewMode === 'local'
                  ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                  : 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
              }`}
              title={viewMode === 'remote' ? 'Switch to Local Zero Agent' : 'Switch to Remote Server'}
            >
              {viewMode === 'remote' ? '🌐 Server' : '🧠 Local'}
            </button>
          )}
          {isPrivate && viewMode === 'local' && (
            <ModelSelector />
          )}
          {isPrivate && (
            <button
              onClick={() => setShowTraces(!showTraces)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                showTraces
                  ? 'bg-terminal-accent text-terminal-bg'
                  : 'bg-terminal-bg/50 text-terminal-muted hover:text-terminal-text'
              }`}
              title="Traces"
            >
              Traces
            </button>
          )}
          
          <AgentStatus status={agentStatus} connected={connected} />

          {/* Panel Toggle Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowJobPanel(!showJobPanel)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                showJobPanel
                  ? 'bg-terminal-accent text-terminal-bg'
                  : 'bg-terminal-bg/50 text-terminal-muted hover:text-terminal-text'
              }`}
              title="Job Streams"
            >
              Jobs ({activeJobs.size})
            </button>
            <button
              onClick={() => setShowToolPanel(!showToolPanel)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                showToolPanel
                  ? 'bg-terminal-accent text-terminal-bg'
                  : 'bg-terminal-bg/50 text-terminal-muted hover:text-terminal-text'
              }`}
              title="Tool Outputs"
            >
              Tools ({toolOutputs.size})
            </button>
          </div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-terminal-muted hover:text-terminal-text transition-colors"
          >
            {isCollapsed ? '▲' : '▼'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      {!isCollapsed && (
        <>
          {viewMode === 'remote' ? (
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 overflow-hidden">
              {/* Left: Event Stream */}
              <div className="lg:col-span-2">
                <EventStream events={events} />
              </div>

              {/* Right: Knowledge Graph & Tools */}
              <div className="flex flex-col gap-4">
                <KnowledgeGraph wsconnected={connected} />
                
                {/* Quick Actions */}
                <div className="glass rounded-lg p-4">
                  <h3 className="text-sm font-semibold mb-2 text-terminal-muted">Quick Actions</h3>
                  <div className="flex flex-col gap-2 text-xs">
                    <button
                      onClick={() => sendCommand('/steer Focus on recent developments')}
                      className="px-3 py-1.5 bg-terminal-accent/20 hover:bg-terminal-accent/30 rounded transition-colors text-left"
                    >
                      🎯 Steer Agent
                    </button>
                    <button
                      onClick={() => sendCommand('Generate daily briefing')}
                      className="px-3 py-1.5 bg-terminal-accent/20 hover:bg-terminal-accent/30 rounded transition-colors text-left"
                    >
                      📊 Daily Briefing
                    </button>
                    <button
                      onClick={() => sendCommand('What are the latest updates?')}
                      className="px-3 py-1.5 bg-terminal-accent/20 hover:bg-terminal-accent/30 rounded transition-colors text-left"
                    >
                      🔍 Recent Updates
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 w-full h-full">
              <CognitiveSubstrate />
            </div>
          )}
        </>
      )}

      {/* Command Bar (Only in Remote Mode) */}
      {viewMode === 'remote' && <CommandBar onCommand={sendCommand} connected={connected} />}

      {/* Panels */}
      {showJobPanel && (
        <JobPanel
          activeJobs={activeJobs}
          jobStreams={jobStreams}
          onClose={() => setShowJobPanel(false)}
        />
      )}
      {showToolPanel && (
        <ToolPanel
          toolOutputs={toolOutputs}
          onClose={() => setShowToolPanel(false)}
        />
      )}
      {isPrivate && showTraces && (
        <TracesPanel onClose={() => setShowTraces(false)} />
      )}

      {/* Elicitation Modal */}
      {elicitationRequest && (
        <ElicitationModal
          request={elicitationRequest}
          onClose={() => setElicitationRequest(null)}
          onSubmit={handleElicitationSubmit}
        />
      )}
    </div>
  )
}

export default App
