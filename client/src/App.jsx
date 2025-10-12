import { useState, useEffect, useRef } from 'react'
import CommandBar from './components/CommandBar'
import EventStream from './components/EventStream'
import AgentStatus from './components/AgentStatus'
import KnowledgeGraph from './components/KnowledgeGraph'
import JobPanel from './components/JobPanel'
import ToolPanel from './components/ToolPanel'
import ElicitationModal from './components/ElicitationModal'

function App() {
  const [ws, setWs] = useState(null)
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState([])
  const [agentStatus, setAgentStatus] = useState('disconnected')
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Job streams and tool outputs
  const [activeJobs, setActiveJobs] = useState(new Map())
  const [jobStreams, setJobStreams] = useState(new Map())
  const [toolOutputs, setToolOutputs] = useState(new Map())
  const [showJobPanel, setShowJobPanel] = useState(false)
  const [showToolPanel, setShowToolPanel] = useState(false)
  const [elicitationRequest, setElicitationRequest] = useState(null)

  useEffect(() => {
    // Auto-connect to WebSocket on mount
    const token = new URLSearchParams(window.location.search).get('token') || 'demo'
    const wsUrl = `ws://localhost:3008/mcp/ws?token=${token}`
    
    const websocket = new WebSocket(wsUrl)
    
    websocket.onopen = () => {
      console.log('WebSocket connected')
      setConnected(true)
      setAgentStatus('idle')
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
          case 'job.started':
            setActiveJobs(prev => new Map(prev).set(message.payload.job_id, {
              id: message.payload.job_id,
              status: 'running',
              startTime: new Date().toISOString(),
              events: []
            }))
            setJobStreams(prev => new Map(prev).set(message.payload.job_id, []))
            addEvent({ type: 'agent', text: `Job ${message.payload.job_id} started`, data: message.payload })
            break
          case 'job.events':
            // Update job streams with new events
            message.payload.events.forEach(event => {
              setJobStreams(prev => {
                const newStreams = new Map(prev)
                const stream = newStreams.get(message.payload.jobId) || []
                stream.push({
                  timestamp: new Date().toISOString(),
                  type: event.type,
                  data: event.data
                })
                newStreams.set(message.payload.jobId, stream)
                return newStreams
              })
            })
            addEvent({ type: 'agent', text: `Job ${message.payload.jobId}: ${message.payload.events.length} events`, data: message.payload })
            break
          case 'tool.started':
            setToolOutputs(prev => new Map(prev).set(message.payload.tool_id, {
              id: message.payload.tool_id,
              name: message.payload.tool_name,
              status: 'running',
              startTime: new Date().toISOString(),
              output: ''
            }))
            break
          case 'tool.delta':
            setToolOutputs(prev => {
              const newOutputs = new Map(prev)
              const current = newOutputs.get(message.payload.tool_id)
              if (current) {
                current.output += message.payload.delta
                current.lastUpdate = new Date().toISOString()
              }
              return newOutputs
            })
            break
          case 'tool.completed':
            setToolOutputs(prev => {
              const newOutputs = new Map(prev)
              const current = newOutputs.get(message.payload.tool_id)
              if (current) {
                current.status = 'completed'
                current.endTime = new Date().toISOString()
                current.finalOutput = message.payload.result
              }
              return newOutputs
            })
            break
          case 'elicitation/request':
            setElicitationRequest(message.payload)
            break
          case 'job.result':
            const resultText = typeof message.payload.result === 'object' 
              ? JSON.stringify(message.payload.result, null, 2) 
              : message.payload.result
            
            const eventData = { 
              type: message.payload.status === 'failed' ? 'error' : 'agent', 
              text: resultText 
            }

            if (message.payload.result && message.payload.result.resources) {
              eventData.resources = message.payload.result.resources
            }

            addEvent(eventData)

            // Update job status
            setActiveJobs(prev => {
              const newJobs = new Map(prev)
              const job = newJobs.get(message.payload.job_id)
              if (job) {
                job.status = message.payload.status
                job.endTime = new Date().toISOString()
              }
              return newJobs
            })

            setAgentStatus('idle')
            break
          default:
            addEvent({ type: 'raw', text: message.type, data: message })
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
    }
    
    setWs(websocket)
    
    return () => {
      websocket.close()
    }
  }, [])

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
      )}

      {/* Command Bar (Always Visible) */}
      <CommandBar onCommand={sendCommand} connected={connected} />

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
