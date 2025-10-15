// client/src/components/AgentDashboard.jsx
/**
 * Agent Dashboard - Real-time Agent Status Display
 * Shows the trio (client, server, computer) + all sub-agents
 */

import React from 'react';
import './AgentDashboard.css';

const AGENT_TYPES = {
  client: { icon: '💻', label: 'Client Agent' },
  server: { icon: '🧠', label: 'Server Agent' },
  computer: { icon: '👁️', label: 'Computer Agent' }
};

export default function AgentDashboard({ agents, currentPhase, activeResearch }) {
  const { client, server, computer, subAgents = [] } = agents;

  return (
    <div className="agent-dashboard">
      <h3 className="dashboard-title">Agent Trio</h3>
      
      {/* Main Trio */}
      <div className="agent-trio">
        <AgentCard type="client" agent={client} />
        <AgentCard type="server" agent={server} />
        <AgentCard type="computer" agent={computer} />
      </div>

      {/* Sub-Agents */}
      {subAgents.length > 0 && (
        <>
          <h4 className="sub-agents-title">
            Sub-Agents ({subAgents.length})
          </h4>
          <div className="sub-agents-grid">
            {subAgents.map((agent, index) => (
              <SubAgentCard key={agent.id || index} agent={agent} index={index} />
            ))}
          </div>
        </>
      )}

      {/* Research Stats */}
      {activeResearch && activeResearch.query && (
        <div className="research-stats">
          <div className="stat">
            <span className="stat-label">Insights</span>
            <span className="stat-value">{activeResearch.insights?.length || 0}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Progress</span>
            <span className="stat-value">{Math.round((activeResearch.progress || 0) * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentCard({ type, agent }) {
  const config = AGENT_TYPES[type];
  const status = agent?.status || 'idle';
  const activeTask = agent?.activeTask;

  return (
    <div className={`agent-card ${status}`} data-type={type}>
      <div className="agent-icon">{config.icon}</div>
      <div className="agent-info">
        <div className="agent-label">{config.label}</div>
        <div className={`agent-status status-${status}`}>
          {status}
        </div>
        {activeTask && (
          <div className="agent-task">{activeTask.substring(0, 30)}...</div>
        )}
      </div>
    </div>
  );
}

function SubAgentCard({ agent, index }) {
  const status = agent.status || 'pending';
  const progress = agent.progress || 0;

  return (
    <div className={`sub-agent-card ${status}`}>
      <div className="sub-agent-header">
        <span className="sub-agent-number">#{index + 1}</span>
        <span className={`sub-agent-status status-${status}`}>{status}</span>
      </div>
      <div className="sub-agent-query">
        {agent.query?.substring(0, 50) || 'Processing...'}
      </div>
      {progress > 0 && (
        <div className="sub-agent-progress">
          <div 
            className="progress-fill"
            style={{ width: `${progress * 100}%` }}
          ></div>
        </div>
      )}
      {agent.finding && (
        <div className="sub-agent-finding">
          {agent.finding.substring(0, 100)}...
        </div>
      )}
    </div>
  );
}




