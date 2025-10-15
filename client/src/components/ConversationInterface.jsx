// client/src/components/ConversationInterface.jsx
/**
 * Conversational Interface - User ↔ Agent Communication
 * Natural language input with message history
 */

import React, { useState, useRef, useEffect } from 'react';
import './ConversationInterface.css';

export default function ConversationInterface({ 
  messages = [], 
  onSendMessage, 
  mode = 'sync',
  connected = false 
}) {
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!input.trim() || !connected) return;
    
    onSendMessage(input.trim());
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="conversation-interface">
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="messages-empty">
            <div className="empty-icon">💭</div>
            <div className="empty-text">
              {mode === 'async' 
                ? 'Start a research query or ask a question'
                : 'Chat with the agent'}
            </div>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((message, index) => (
              <MessageBubble key={index} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        <div className="input-wrapper">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={connected ? "Ask a question or start research..." : "Connecting..."}
            disabled={!connected}
            className="message-input"
            rows={1}
          />
          <button 
            type="submit" 
            className="send-button"
            disabled={!input.trim() || !connected}
          >
            <span className="send-icon">🚀</span>
          </button>
        </div>
        
        <div className="input-footer">
          <span className="connection-indicator">
            <span className={`connection-dot ${connected ? 'connected' : ''}`}></span>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <span className="mode-indicator">{mode === 'async' ? 'Research Mode' : 'Chat Mode'}</span>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const timestamp = message.timestamp 
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'agent'}`}>
      <div className="message-header">
        <span className="message-role">{isUser ? 'You' : 'Agent'}</span>
        {timestamp && <span className="message-time">{timestamp}</span>}
      </div>
      <div className="message-content">
        {message.content}
      </div>
      {message.metadata && (
        <div className="message-metadata">
          {message.metadata.reportId && (
            <span className="metadata-item">Report: {message.metadata.reportId}</span>
          )}
          {message.metadata.durationMs && (
            <span className="metadata-item">{message.metadata.durationMs}ms</span>
          )}
        </div>
      )}
    </div>
  );
}




