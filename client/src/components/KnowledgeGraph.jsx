import { useState } from 'react'

function KnowledgeGraph({ wsconnected }) {
  const [entity, setEntity] = useState('')
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(false)

  const queryGraph = async () => {
    if (!entity.trim()) return

    setLoading(true)
    try {
      const response = await fetch('http://localhost:3008/client/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'query_graph',
          arguments: { entity: entity.trim(), maxHops: 2 }
        })
      })
      
      const data = await response.json()
      setGraphData(data)
    } catch (error) {
      console.error('Error querying graph:', error)
      setGraphData({ error: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3 text-terminal-muted">Knowledge Graph</h3>
      
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && queryGraph()}
          placeholder="Entity name..."
          className="flex-1 bg-terminal-bg/50 border border-terminal-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-terminal-accent"
        />
        <button
          onClick={queryGraph}
          disabled={loading || !entity.trim()}
          className="px-3 py-1.5 bg-terminal-accent/80 hover:bg-terminal-accent disabled:bg-terminal-muted disabled:cursor-not-allowed rounded text-sm transition-colors"
        >
          {loading ? '...' : 'Query'}
        </button>
      </div>

      {graphData && (
        <div className="bg-terminal-bg/30 rounded p-3 text-xs">
          {graphData.error ? (
            <p className="text-terminal-error">{graphData.error}</p>
          ) : graphData.found ? (
            <div className="space-y-2">
              <div>
                <span className="text-terminal-muted">Entity:</span>{' '}
                <span className="text-terminal-success">{graphData.entity.name}</span>
                <span className="text-terminal-muted ml-2">({graphData.entity.type})</span>
              </div>
              {graphData.relationships && graphData.relationships.length > 0 && (
                <div>
                  <span className="text-terminal-muted">Relationships ({graphData.relationships.length}):</span>
                  <div className="mt-1 space-y-1 pl-3">
                    {graphData.relationships.slice(0, 5).map((rel, i) => (
                      <div key={i} className="text-terminal-text/70">
                        {rel.source.name} <span className="text-terminal-accent">→</span> {rel.target.name}
                        <span className="text-terminal-muted text-[10px] ml-1">({rel.relationType})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-terminal-muted">Entity not found</p>
          )}
        </div>
      )}
    </div>
  )
}

export default KnowledgeGraph

