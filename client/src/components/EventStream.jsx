import { useEffect, useRef } from 'react'

const eventTypeStyles = {
  system: { bg: 'bg-terminal-bg', icon: '🔵', label: 'System' },
  agent: { bg: 'bg-terminal-accent/10', icon: '🤖', label: 'Agent' },
  user: { bg: 'bg-terminal-success/10', icon: '👤', label: 'You' },
  status: { bg: 'bg-terminal-warning/10', icon: '⚡', label: 'Status' },
  suggestion: { bg: 'bg-terminal-accent/20', icon: '💡', label: 'Suggestion' },
  temporal: { bg: 'bg-terminal-warning/10', icon: '⏰', label: 'Scheduled' },
  monitor: { bg: 'bg-terminal-success/10', icon: '👁️', label: 'Monitor' },
  briefing: { bg: 'bg-terminal-accent/10', icon: '📊', label: 'Briefing' },
  error: { bg: 'bg-terminal-error/10', icon: '❌', label: 'Error' },
  raw: { bg: 'bg-terminal-muted/10', icon: '📦', label: 'Event' }
}

function EventStream({ events }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  return (
    <div className="glass rounded-lg h-full flex flex-col">
      <div className="px-4 py-3 border-b border-terminal-border">
        <h2 className="text-sm font-semibold">Event Stream</h2>
        <p className="text-xs text-terminal-muted mt-0.5">{events.length} events</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {events.map((event) => {
          const style = eventTypeStyles[event.type] || eventTypeStyles.raw
          
          return (
            <div 
              key={event.id} 
              className={`${style.bg} rounded-lg p-3 border border-terminal-border/30`}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg">{style.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-terminal-muted">{style.label}</span>
                    <span className="text-xs text-terminal-muted/50">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm break-words">{event.text}</p>
                  {event.data && (
                    <details className="mt-2">
                      <summary className="text-xs text-terminal-muted cursor-pointer hover:text-terminal-text">
                        Details
                      </summary>
                      <pre className="mt-1 text-xs bg-terminal-bg/50 p-2 rounded overflow-x-auto">
                        {JSON.stringify(event.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
    </div>
  )
}

export default EventStream

