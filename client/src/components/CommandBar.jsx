import { useState } from 'react'

function CommandBar({ onCommand, connected }) {
  const [input, setInput] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (input.trim() && connected) {
      onCommand(input.trim())
      setInput('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass border-t px-4 py-3">
      <div className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={connected ? "Enter command (e.g., /steer goal, research query, daily_briefing)" : "Connecting..."}
          disabled={!connected}
          className="flex-1 bg-terminal-bg/50 border border-terminal-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terminal-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!connected || !input.trim()}
          className="px-6 py-2 bg-terminal-accent hover:bg-terminal-accent/80 disabled:bg-terminal-muted disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          Send
        </button>
      </div>
    </form>
  )
}

export default CommandBar

