import { useEffect, useRef } from 'react';

/**
 * ComputationGraph - Visualizes the agent's reasoning process as an interaction net
 * 
 * Takes the graph data from InteractionNet.toJSON() and renders it as an SVG
 */
const ComputationGraph = ({ graphData }) => {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) return;
    if (!svgRef.current) return;

    // Clear previous rendering
    svgRef.current.innerHTML = '';

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    
    // Create SVG namespace
    const svgNS = 'http://www.w3.org/2000/svg';
    
    // Simple force-directed layout (spring-based)
    const nodes = graphData.nodes.map((node, i) => ({
      ...node,
      x: width / 2 + (Math.random() - 0.5) * 100,
      y: height / 2 + (Math.random() - 0.5) * 100,
      vx: 0,
      vy: 0
    }));

    const edges = graphData.edges || [];

    // Position nodes using a simple force simulation
    const iterations = 50;
    for (let iter = 0; iter < iterations; iter++) {
      // Apply forces
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 50 / (dist * dist); // Repulsion
          
          nodes[i].vx -= (dx / dist) * force;
          nodes[i].vy -= (dy / dist) * force;
          nodes[j].vx += (dx / dist) * force;
          nodes[j].vy += (dy / dist) * force;
        }
      }

      // Apply edge forces (attraction)
      for (const edge of edges) {
        const source = nodes.find(n => n.id === edge.from);
        const target = nodes.find(n => n.id === edge.to);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = dist * 0.01; // Attraction

        source.vx += (dx / dist) * force;
        source.vy += (dy / dist) * force;
        target.vx -= (dx / dist) * force;
        target.vy -= (dy / dist) * force;
      }

      // Update positions
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.9; // Damping
        node.vy *= 0.9;

        // Keep in bounds
        node.x = Math.max(30, Math.min(width - 30, node.x));
        node.y = Math.max(30, Math.min(height - 30, node.y));
      }
    }

    // Render edges first (so they appear below nodes)
    for (const edge of edges) {
      const source = nodes.find(n => n.id === edge.from);
      const target = nodes.find(n => n.id === edge.to);
      if (!source || !target) continue;

      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', source.x);
      line.setAttribute('y1', source.y);
      line.setAttribute('x2', target.x);
      line.setAttribute('y2', target.y);
      line.setAttribute('stroke', 'rgba(0, 255, 255, 0.3)');
      line.setAttribute('stroke-width', '1');
      
      // Add arrow
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      const arrowLength = 8;
      const arrowX = target.x - Math.cos(angle) * 15;
      const arrowY = target.y - Math.sin(angle) * 15;
      
      const arrow = document.createElementNS(svgNS, 'polygon');
      const points = [
        `${arrowX},${arrowY}`,
        `${arrowX - arrowLength * Math.cos(angle - Math.PI / 6)},${arrowY - arrowLength * Math.sin(angle - Math.PI / 6)}`,
        `${arrowX - arrowLength * Math.cos(angle + Math.PI / 6)},${arrowY - arrowLength * Math.sin(angle + Math.PI / 6)}`
      ].join(' ');
      arrow.setAttribute('points', points);
      arrow.setAttribute('fill', 'rgba(0, 255, 255, 0.5)');
      
      svgRef.current.appendChild(line);
      svgRef.current.appendChild(arrow);
    }

    // Render nodes
    for (const node of nodes) {
      const group = document.createElementNS(svgNS, 'g');
      
      // Node circle
      const circle = document.createElementNS(svgNS, 'circle');
      circle.setAttribute('cx', node.x);
      circle.setAttribute('cy', node.y);
      circle.setAttribute('r', node.type === 'root' ? 15 : 12);
      
      const colors = {
        root: '#FFD700',
        agent: '#00FFFF',
        constructor: '#90EE90',
        duplicator: '#FF69B4',
        eraser: '#FF6347'
      };
      circle.setAttribute('fill', colors[node.type] || '#CCCCCC');
      circle.setAttribute('stroke', 'rgba(255, 255, 255, 0.5)');
      circle.setAttribute('stroke-width', '2');
      
      // Node label
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', node.x);
      text.setAttribute('y', node.y - 20);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#FFFFFF');
      text.setAttribute('font-size', '10');
      text.setAttribute('font-family', 'monospace');
      text.textContent = node.type;
      
      // Value label (if present)
      if (node.label && node.label !== 'null' && node.label !== '{}') {
        const valueText = document.createElementNS(svgNS, 'text');
        valueText.setAttribute('x', node.x);
        valueText.setAttribute('y', node.y + 25);
        valueText.setAttribute('text-anchor', 'middle');
        valueText.setAttribute('fill', 'rgba(255, 255, 255, 0.6)');
        valueText.setAttribute('font-size', '8');
        valueText.setAttribute('font-family', 'monospace');
        valueText.textContent = node.label.length > 20 ? node.label.substring(0, 20) + '...' : node.label;
        group.appendChild(valueText);
      }
      
      group.appendChild(circle);
      group.appendChild(text);
      svgRef.current.appendChild(group);
    }
  }, [graphData]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'rgba(0, 0, 0, 0.5)',
      borderRadius: '4px',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      overflow: 'hidden'
    }}>
      <svg
        ref={svgRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block'
        }}
      />
    </div>
  );
};

export default ComputationGraph;

