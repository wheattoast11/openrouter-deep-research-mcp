import { useEffect, useState } from 'react';
import { on } from '../client/ContextGateway';

const TracesPanel = ({ onClose }) => {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const off = on('trace:emit', (e) => {
      setEvents((prev) => [...prev, e]);
    });
    return () => off && off();
  }, []);

  return (
    <div className="absolute bottom-4 left-4 w-[480px] max-h-[40vh] overflow-y-auto glass rounded-lg p-3" style={{ zIndex: 30 }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-terminal-muted">Traces</h3>
        <button onClick={onClose} className="text-xs text-terminal-muted hover:text-terminal-text">Close</button>
      </div>
      <div className="space-y-2 text-xs">
        {events.slice(-200).map((e, idx) => (
          <div key={idx} className="bg-terminal-bg/40 rounded px-2 py-1 border border-white/10">
            <div className="text-terminal-muted">{new Date(e.t).toLocaleTimeString()}</div>
            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(e, null, 2)}</pre>
          </div>
        ))}
        {events.length === 0 && (
          <div className="text-terminal-muted">No traces yet.</div>
        )}
      </div>
    </div>
  );
};

export default TracesPanel;
