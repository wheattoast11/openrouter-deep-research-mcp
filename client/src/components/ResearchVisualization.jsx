// client/src/components/ResearchVisualization.jsx
/**
 * Research Visualization - Graph and Insights Display
 * Real-time visualization of research findings and knowledge graph
 */

import React, { useRef, useEffect } from 'react';
import './ResearchVisualization.css';

export default function ResearchVisualization({
  graph,
  insights = [],
  findings = [],
  synthesis,
  phase,
  confidence
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current && graph && graph.nodes.length > 0) {
      renderGraph(canvasRef.current, graph);
    }
  }, [graph]);

  return (
    <div className="research-visualization">
      {/* Graph Canvas */}
      {graph && graph.nodes.length > 0 ? (
        <div className="graph-container">
          <canvas ref={canvasRef} className="graph-canvas"></canvas>
          <GraphLegend graph={graph} />
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <div className="empty-text">Research visualization will appear here</div>
        </div>
      )}

      {/* Insights Stream */}
      {insights.length > 0 && (
        <div className="insights-container">
          <h4 className="insights-title">Live Insights</h4>
          <div className="insights-stream">
            {insights.slice(-5).map((insight, index) => (
              <InsightCard key={index} insight={insight} index={index} />
            ))}
          </div>
        </div>
      )}

      {/* Synthesis Display */}
      {synthesis && (
        <div className="synthesis-container">
          <h4 className="synthesis-title">Synthesis</h4>
          <div className="synthesis-content">
            <div className="synthesis-confidence">
              <span className="confidence-label">Confidence:</span>
              <div className="confidence-bar">
                <div 
                  className="confidence-fill"
                  style={{ width: `${(confidence || 0.5) * 100}%` }}
                ></div>
              </div>
              <span className="confidence-value">{Math.round((confidence || 0.5) * 100)}%</span>
            </div>
            <div className="synthesis-text">
              {synthesis.substring(0, 500)}...
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InsightCard({ insight, index }) {
  return (
    <div className="insight-card" style={{ animationDelay: `${index * 0.1}s` }}>
      <div className="insight-meta">
        <span className="insight-source">{insight.source || 'Agent'}</span>
        <span className="insight-confidence">
          {Math.round((insight.confidence || 0.8) * 100)}%
        </span>
      </div>
      <div className="insight-text">
        {insight.text?.substring(0, 200) || 'Processing...'}
      </div>
    </div>
  );
}

function GraphLegend({ graph }) {
  const nodeTypes = [...new Set(graph.nodes.map(n => n.type))];
  
  return (
    <div className="graph-legend">
      {nodeTypes.map(type => (
        <div key={type} className="legend-item">
          <div className={`legend-dot type-${type}`}></div>
          <span className="legend-label">{type}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Render knowledge graph on canvas
 * Simple force-directed layout
 */
function renderGraph(canvas, graph) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width = canvas.offsetWidth * 2;
  const height = canvas.height = canvas.offsetHeight * 2;
  ctx.scale(2, 2);

  const w = width / 2;
  const h = height / 2;

  // Position nodes in circle
  const nodes = graph.nodes.map((node, i) => {
    const angle = (i / graph.nodes.length) * 2 * Math.PI;
    const radius = Math.min(w, h) * 0.35;
    return {
      ...node,
      x: w / 2 + Math.cos(angle) * radius,
      y: h / 2 + Math.sin(angle) * radius
    };
  });

  // Clear canvas
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(0, 0, w, h);

  // Draw edges
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
  ctx.lineWidth = 1;
  
  for (const edge of graph.edges) {
    const from = nodes.find(n => n.id === edge.from);
    const to = nodes.find(n => n.id === edge.to);
    
    if (from && to) {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }

  // Draw nodes
  for (const node of nodes) {
    ctx.fillStyle = node.color || '#3b82f6';
    ctx.beginPath();
    ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI);
    ctx.fill();
    
    // Node label
    ctx.fillStyle = '#f8fafc';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(node.label?.substring(0, 15) || node.id, node.x, node.y + 20);
  }
}




