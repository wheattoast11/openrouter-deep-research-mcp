import { useState } from 'react'

function JobPanel({ activeJobs, jobStreams, onClose }) {
  const [selectedJobId, setSelectedJobId] = useState(null)

  const formatDuration = (startTime, endTime = null) => {
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
      case 'canceled': return 'bg-gray-500'
      default: return 'bg-blue-500'
    }
  }

  return (
    <div className="fixed top-0 right-0 h-full w-96 bg-terminal-bg border-l border-terminal-border shadow-lg z-50">
      <div className="flex items-center justify-between p-4 border-b border-terminal-border">
        <h3 className="text-lg font-semibold text-terminal-text">Job Streams</h3>
        <button
          onClick={onClose}
          className="text-terminal-muted hover:text-terminal-text"
        >
          ✕
        </button>
      </div>

      <div className="flex h-full">
        {/* Job List */}
        <div className="w-1/3 border-r border-terminal-border overflow-y-auto">
          <div className="p-2">
            {Array.from(activeJobs.values()).map(job => (
              <div
                key={job.id}
                className={`p-3 mb-2 rounded cursor-pointer transition-colors ${
                  selectedJobId === job.id
                    ? 'bg-terminal-accent/20 border border-terminal-accent'
                    : 'bg-terminal-bg/50 hover:bg-terminal-bg'
                }`}
                onClick={() => setSelectedJobId(job.id)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-terminal-text truncate">
                    {job.id.slice(0, 8)}...
                  </span>
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(job.status)}`} />
                </div>
                <div className="text-xs text-terminal-muted">
                  {formatDuration(job.startTime, job.endTime)}
                </div>
              </div>
            ))}
            {activeJobs.size === 0 && (
              <div className="text-terminal-muted text-sm p-3">No active jobs</div>
            )}
          </div>
        </div>

        {/* Job Stream */}
        <div className="flex-1 p-4 overflow-y-auto">
          {selectedJobId ? (
            <div>
              <div className="mb-4">
                <h4 className="text-md font-medium text-terminal-text mb-2">
                  Job: {selectedJobId.slice(0, 8)}...
                </h4>
                {(() => {
                  const job = activeJobs.get(selectedJobId)
                  const streams = jobStreams.get(selectedJobId) || []
                  return (
                    <div className="space-y-2">
                      {streams.map((event, index) => (
                        <div key={index} className="bg-terminal-bg/50 p-3 rounded">
                          <div className="text-xs text-terminal-muted mb-1">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </div>
                          <div className="text-sm text-terminal-text">
                            <span className="font-medium">{event.type}:</span>{' '}
                            {typeof event.data === 'object'
                              ? JSON.stringify(event.data, null, 2)
                              : event.data
                            }
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </div>
          ) : (
            <div className="text-terminal-muted text-sm flex items-center justify-center h-full">
              Select a job to view its stream
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default JobPanel
