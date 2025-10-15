// client/src/components/ModeShifter.jsx
/**
 * Mode Shifter - Smooth Async/Sync Transition
 * Detects when user needs direct interaction vs. background research
 */

import React, { useEffect, useState } from 'react';
import './ModeShifter.css';

export default function ModeShifter({ mode, onShift, phase }) {
  const [isShifting, setIsShifting] = useState(false);

  // Auto-detect mode shift needs
  useEffect(() => {
    // Shift to sync when user is directly interacting
    if (phase === 'idle' || phase === 'complete') {
      if (mode === 'async') {
        handleShift('sync');
      }
    }
    
    // Shift to async when research is actively running
    if (phase === 'discovery' || phase === 'research' || phase === 'synthesis') {
      if (mode === 'sync') {
        handleShift('async');
      }
    }
  }, [phase]);

  const handleShift = (newMode) => {
    if (newMode === mode) return;
    
    setIsShifting(true);
    
    setTimeout(() => {
      onShift(newMode);
      setIsShifting(false);
    }, 300);
  };

  return (
    <div className={`mode-shifter ${isShifting ? 'shifting' : ''}`}>
      <button
        className={`mode-button ${mode === 'async' ? 'active' : ''}`}
        onClick={() => handleShift('async')}
        disabled={isShifting}
      >
        <span className="mode-icon">🔄</span>
        <span className="mode-label">Async</span>
      </button>
      
      <div className="mode-indicator">
        <div className={`indicator-dot ${mode}`}></div>
      </div>
      
      <button
        className={`mode-button ${mode === 'sync' ? 'active' : ''}`}
        onClick={() => handleShift('sync')}
        disabled={isShifting}
      >
        <span className="mode-icon">💬</span>
        <span className="mode-label">Sync</span>
      </button>
    </div>
  );
}




