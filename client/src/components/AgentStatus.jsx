function AgentStatus({ status, connected }) {
  const statusConfig = {
    disconnected: { color: 'bg-terminal-error', text: 'Disconnected', pulse: false },
    idle: { color: 'bg-terminal-success', text: 'Idle', pulse: true },
    thinking: { color: 'bg-terminal-warning', text: 'Thinking', pulse: true },
    'waiting_for_input': { color: 'bg-terminal-accent', text: 'Waiting', pulse: true },
    error: { color: 'bg-terminal-error', text: 'Error', pulse: false },
    connected: { color: 'bg-terminal-success', text: 'Connected', pulse: false }
  }

  const config = statusConfig[status] || statusConfig.disconnected

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${config.color} ${config.pulse ? 'animate-pulse-slow' : ''}`} />
      <span className="text-sm text-terminal-muted">{config.text}</span>
    </div>
  )
}

export default AgentStatus

