// client/src/components/VisualJourney.jsx
/**
 * Visual Journey Timeline - Screenshot Timeline Display
 * Shows the agent's visual journey through web pages
 */

import React, { useRef, useEffect } from 'react';
import './VisualJourney.css';

export default function VisualJourney({ screenshots = [], currentStep, phase }) {
  const timelineRef = useRef(null);

  useEffect(() => {
    // Auto-scroll to latest screenshot
    if (timelineRef.current && screenshots.length > 0) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [screenshots.length]);

  return (
    <div className="visual-journey">
      <h3 className="journey-title">Visual Journey</h3>
      
      {screenshots.length === 0 ? (
        <div className="journey-empty">
          <div className="empty-icon">📸</div>
          <div className="empty-text">Screenshots will appear as the agent explores</div>
        </div>
      ) : (
        <div className="journey-timeline" ref={timelineRef}>
          {screenshots.map((screenshot, index) => (
            <ScreenshotCard
              key={screenshot.id || index}
              screenshot={screenshot}
              index={index}
              isCurrent={index === currentStep - 1}
            />
          ))}
        </div>
      )}

      {screenshots.length > 0 && (
        <div className="journey-stats">
          <span className="stat-item">
            {screenshots.length} {screenshots.length === 1 ? 'step' : 'steps'}
          </span>
          {phase !== 'complete' && (
            <span className="stat-item stat-active">Recording...</span>
          )}
        </div>
      )}
    </div>
  );
}

function ScreenshotCard({ screenshot, index, isCurrent }) {
  const handleClick = () => {
    // Open full-size screenshot in modal
    window.open(screenshot.url || screenshot.path, '_blank');
  };

  return (
    <div 
      className={`screenshot-card ${isCurrent ? 'current' : ''}`}
      onClick={handleClick}
    >
      <div className="screenshot-header">
        <span className="screenshot-number">#{index + 1}</span>
        <span className="screenshot-action">{screenshot.action_type || 'capture'}</span>
      </div>
      
      {screenshot.url && (
        <div className="screenshot-url" title={screenshot.url}>
          {screenshot.url.substring(0, 40)}...
        </div>
      )}

      <div className="screenshot-preview">
        {screenshot.thumbnail || screenshot.path ? (
          <img 
            src={screenshot.thumbnail || screenshot.path}
            alt={`Screenshot ${index + 1}`}
            className="screenshot-image"
          />
        ) : (
          <div className="screenshot-placeholder">
            <span>📸</span>
          </div>
        )}
      </div>

      {screenshot.description && (
        <div className="screenshot-description">
          {screenshot.description}
        </div>
      )}

      {screenshot.timestamp && (
        <div className="screenshot-timestamp">
          {new Date(screenshot.timestamp).toLocaleTimeString()}
        </div>
      )}

      {screenshot.extracted_data && Object.keys(screenshot.extracted_data).length > 0 && (
        <div className="screenshot-data-badge">
          {Object.keys(screenshot.extracted_data).length} fields extracted
        </div>
      )}
    </div>
  );
}




