import { useEffect, useState } from 'react';
import { listModelProfiles, getDefaultProfileId } from '../lib/modelProfiles';
import { updateModelProfile } from '../client/ContextGateway';

const ModelSelector = () => {
  const [selected, setSelected] = useState(getDefaultProfileId());
  const profiles = listModelProfiles();

  useEffect(() => {
    updateModelProfile(selected);
  }, [selected]);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-terminal-muted">Model:</span>
      <select
        className="bg-terminal-bg/50 border border-white/10 rounded px-2 py-1 outline-none hover:border-white/20"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        {profiles.map(p => (
          <option key={p.id} value={p.id}>{p.id}</option>
        ))}
      </select>
    </div>
  );
};

export default ModelSelector;
