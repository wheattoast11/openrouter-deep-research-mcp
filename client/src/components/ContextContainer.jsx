// client/src/components/ContextContainer.jsx
/**
 * Context-Aware Container - Animated Container with State-Driven Visuals
 * 
 * Features:
 * - Pulse intensity = agent confidence
 * - Color gradient = research phase
 * - Glow radius = importance score
 * - Smooth transitions for all state changes
 */

import React from 'react';
import './ContextContainer.css';

const PHASE_COLORS = {
  idle: '#6b7280',
  intent: '#8b5cf6',
  memory: '#ec4899',
  policy: '#3b82f6',
  discovery: '#8b5cf6',
  research: '#3b82f6',
  synthesis: '#14b8a6',
  complete: '#10b981',
  error: '#ef4444'
};

export default function ContextContainer({ 
  confidence = 0.5,
  phase = 'idle',
  importance = 0.5,
  children,
  className = ''
}) {
  const containerStyle = {
    '--confidence': confidence,
    '--phase-color': PHASE_COLORS[phase] || PHASE_COLORS.idle,
    '--importance': importance,
    '--pulse-intensity': confidence,
    '--glow-radius': `${importance * 30}px`
  };

  return (
    <div 
      className={`context-container ${className}`}
      style={containerStyle}
      data-phase={phase}
      data-confidence-level={getConfidenceLevel(confidence)}
    >
      <div className="context-glow"></div>
      <div className="context-content">
        {children}
      </div>
    </div>
  );
}

function getConfidenceLevel(confidence) {
  if (confidence < 0.3) return 'low';
  if (confidence < 0.7) return 'medium';
  return 'high';
}




