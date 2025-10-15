import { useEffect, useState } from 'react';
import { on } from '../client/ContextGateway';

const TracesPanel = ({ onClose }) => {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedEvents, setExpandedEvents] = useState(new Set());

  useEffect(() => {
    const off = on('trace:emit', (e) => {
      setEvents((prev) => [...prev, e]);
    });
    return () => off && off();
  }, []);

  const toggleExpand = (idx) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const clearTraces = () => {
    setEvents([]);
    setExpandedEvents(new Set());
  };

  const exportTraces = () => {
    const data = JSON.stringify(events, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traces-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter events
  const filteredEvents = events.filter(e => {
    if (filter !== 'all' && !e.type?.includes(filter)) return false;
    if (searchTerm && !JSON.stringify(e).toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Event type categories
  const eventTypes = [...new Set(events.map(e => e.type?.split(':')[0]).filter(Boolean))];

  return (
    <div className="absolute bottom-4 left-4 w-[600px] max-h-[60vh] overflow-hidden glass rounded-lg shadow-2xl" style={{ zIndex: 30 }}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-terminal-text">
          Traces <span className="text-terminal-muted">({filteredEvents.length}/{events.length})</span>
        </h3>
        <div className="flex gap-2">
          <button 
            onClick={exportTraces}
            className="text-xs px-2 py-1 bg-terminal-bg/40 hover:bg-terminal-bg/60 rounded border border-white/10 text-terminal-text"
            title="Export traces to JSON"
          >
            Export
          </button>
          <button 
            onClick={clearTraces}
            className="text-xs px-2 py-1 bg-terminal-bg/40 hover:bg-terminal-bg/60 rounded border border-white/10 text-terminal-text"
            title="Clear all traces"
          >
            Clear
          </button>
          <button 
            onClick={onClose} 
            className="text-xs px-2 py-1 bg-terminal-bg/40 hover:bg-terminal-bg/60 rounded border border-white/10 text-terminal-text"
          >
            Close
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="p-3 border-b border-white/10 space-y-2">
        <div className="flex gap-2 items-center">
          <span className="text-xs text-terminal-muted">Filter:</span>
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="text-xs px-2 py-1 bg-terminal-bg rounded border border-white/10 text-terminal-text"
          >
            <option value="all">All Events</option>
            {eventTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search traces..."
          className="w-full text-xs px-2 py-1 bg-terminal-bg rounded border border-white/10 text-terminal-text placeholder-terminal-muted"
        />
      </div>

      {/* Events List */}
      <div className="overflow-y-auto max-h-[40vh] p-3 space-y-2">
        {filteredEvents.slice(-200).map((e, idx) => {
          const isExpanded = expandedEvents.has(idx);
          const eventType = e.type || 'unknown';
          const eventCategory = eventType.split(':')[0];
          
          // Color coding by category
          const categoryColors = {
            sop: 'text-blue-400',
            model: 'text-green-400',
            verify: 'text-yellow-400',
            policy: 'text-red-400',
            tool: 'text-purple-400',
            trace: 'text-cyan-400',
            default: 'text-terminal-muted'
          };
          
          const color = categoryColors[eventCategory] || categoryColors.default;
          
          return (
            <div 
              key={idx} 
              className="bg-terminal-bg/40 rounded border border-white/10 overflow-hidden"
            >
              {/* Event Header */}
              <div 
                className="flex items-center justify-between p-2 cursor-pointer hover:bg-white/5"
                onClick={() => toggleExpand(idx)}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={`text-xs font-mono ${color}`}>
                    {eventType}
                  </span>
                  <span className="text-xs text-terminal-muted">
                    {new Date(e.t).toLocaleTimeString()}
                  </span>
                </div>
                <span className="text-xs text-terminal-muted">
                  {isExpanded ? '▼' : '▶'}
                </span>
              </div>
              
              {/* Event Details (Expandable) */}
              {isExpanded && (
                <div className="p-2 border-t border-white/10">
                  <pre className="text-xs whitespace-pre-wrap break-words text-terminal-text font-mono">
                    {JSON.stringify(e, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
        {filteredEvents.length === 0 && (
          <div className="text-center text-terminal-muted text-xs py-8">
            {events.length === 0 ? 'No traces yet.' : 'No traces match the current filter.'}
          </div>
        )}
      </div>
    </div>
  );
};

export default TracesPanel;
