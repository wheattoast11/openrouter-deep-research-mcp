// Platform Integration Example for terminals.tech
// This file shows how to embed the MCP server in a Next.js application

const { Client } = require('@modelcontextprotocol/sdk/client');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp');

class PlatformMCPClient {
  constructor() {
    this.transport = new StreamableHTTPClientTransport('http://localhost:3000/mcp', {
      headers: { Authorization: `Bearer ${process.env.MCP_SERVER_API_KEY}` }
    });
    this.client = new Client({ name: 'terminals-platform', version: '1.0.0' });
  }

  async connect() {
    await this.transport.start();
    await this.client.connect(this.transport);
  }

  async query(prompt, options = {}) {
    return await this.client.callTool({
      name: 'agent',
      arguments: {
        query: prompt,
        async: false,
        includeSources: true,
        ...options
      }
    });
  }

  async disconnect() {
    await this.transport.close();
  }
}

// Usage in API route
// pages/api/agent.js
import { PlatformMCPClient } from '../../lib/platform-mcp-client';

let mcpClient = null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt required' });
  }

  try {
    // Initialize client if needed
    if (!mcpClient) {
      mcpClient = new PlatformMCPClient();
      await mcpClient.connect();
    }

    const result = await mcpClient.query(prompt);
    res.json({ response: result.content[0].text });
  } catch (error) {
    console.error('MCP query failed:', error);
    res.status(500).json({ error: 'Agent query failed' });
  }
}

// Usage in React component
// components/AgentChat.js
import { useState } from 'react';

export default function AgentChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const sendMessage = async () => {
    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: input })
    });

    const result = await response.json();
    setMessages([...messages, { user: input, agent: result.response }]);
    setInput('');
  };

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>
          <strong>You:</strong> {msg.user}<br/>
          <strong>Agent:</strong> {msg.agent}
        </div>
      ))}
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}

