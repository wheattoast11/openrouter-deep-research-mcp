import { useState } from 'react'

function ToolPanel({ toolOutputs, onClose }) {
  const [selectedToolId, setSelectedToolId] = useState(null)

  const formatDuration = (startTime, endTime = null) => {
    if (!startTime) return '0s'
    const start = new Date(startTime)
    const end = endTime ? new Date(endTime) : new Date()
    const duration = end - start
    return `${Math.floor(duration / 1000)}s`
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'bg-yellow-500'
      case 'completed': return 'bg-green-500'
      case 'failed': return 'bg-red-500'
      default: return 'bg-blue-500'
    }
  }

  const formatToolName = (toolId) => {
    // Extract tool name from ID if possible
    const parts = toolId.split('_')
    return parts.length > 1 ? parts.slice(1).join('_') : toolId
  }

  return (
    <div className="fixed top-0 right-0 h-full w-96 bg-terminal-bg border-l border-terminal-border shadow-lg z-50">
      <div className="flex items-center justify-between p-4 border-b border-terminal-border">
        <h3 className="text-lg font-semibold text-terminal-text">Tool Outputs</h3>
        <button
          onClick={onClose}
          className="text-terminal-muted hover:text-terminal-text"
        >
          ✕
        </button>
      </div>

      <div className="flex h-full">
        {/* Tool List */}
        <div className="w-1/3 border-r border-terminal-border overflow-y-auto">
          <div className="p-2">
            {Array.from(toolOutputs.values()).map(tool => (
              <div
                key={tool.id}
                className={`p-3 mb-2 rounded cursor-pointer transition-colors ${
                  selectedToolId === tool.id
                    ? 'bg-terminal-accent/20 border border-terminal-accent'
                    : 'bg-terminal-bg/50 hover:bg-terminal-bg'
                }`}
                onClick={() => setSelectedToolId(tool.id)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-terminal-text truncate">
                    {formatToolName(tool.name || tool.id)}
                  </span>
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(tool.status)}`} />
                </div>
                <div className="text-xs text-terminal-muted">
                  {formatDuration(tool.startTime, tool.endTime)}
                </div>
              </div>
            ))}
            {toolOutputs.size === 0 && (
              <div className="text-terminal-muted text-sm p-3">No tool outputs</div>
            )}
          </div>
        </div>

        {/* Tool Output */}
        <div className="flex-1 p-4 overflow-y-auto">
          {selectedToolId ? (
            <div>
              <div className="mb-4">
                <h4 className="text-md font-medium text-terminal-text mb-2">
                  Tool: {formatToolName(toolOutputs.get(selectedToolId)?.name || selectedToolId)}
                </h4>
                {(() => {
                  const tool = toolOutputs.get(selectedToolId)
                  if (!tool) return null

                  return (
                    <div className="space-y-4">
                      {/* Live output during execution */}
                      {tool.status === 'running' && tool.output && (
                        <div className="bg-terminal-bg/50 p-3 rounded">
                          <div className="text-xs text-terminal-muted mb-2">Live Output:</div>
                          <pre className="text-sm text-terminal-text whitespace-pre-wrap">
                            {tool.output}
                          </pre>
                        </div>
                      )}

                      {/* Final output */}
                      {tool.status === 'completed' && tool.finalOutput && (
                        <div className="bg-terminal-bg/50 p-3 rounded">
                          <div className="text-xs text-terminal-muted mb-2">Final Output:</div>
                          <pre className="text-sm text-terminal-text whitespace-pre-wrap">
                            {typeof tool.finalOutput === 'string'
                              ? tool.finalOutput
                              : JSON.stringify(tool.finalOutput, null, 2)
                            }
                          </pre>
                        </div>
                      )}

                      {/* Tool metadata */}
                      <div className="bg-terminal-bg/30 p-3 rounded text-sm">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-terminal-muted">Status:</span>
                            <span className="ml-2 capitalize">{tool.status}</span>
                          </div>
                          <div>
                            <span className="text-terminal-muted">Started:</span>
                            <span className="ml-2">
                              {tool.startTime ? new Date(tool.startTime).toLocaleTimeString() : 'Unknown'}
                            </span>
                          </div>
                          {tool.endTime && (
                            <div>
                              <span className="text-terminal-muted">Completed:</span>
                              <span className="ml-2">
                                {new Date(tool.endTime).toLocaleTimeString()}
                              </span>
                            </div>
                          )}
                          <div>
                            <span className="text-terminal-muted">Duration:</span>
                            <span className="ml-2">
                              {formatDuration(tool.startTime, tool.endTime)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          ) : (
            <div className="text-terminal-muted text-sm flex items-center justify-center h-full">
              Select a tool to view its output
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ToolPanel
