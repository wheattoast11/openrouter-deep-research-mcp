# MCP Agent Console

A minimalist, performant, and intelligent client add-on for the OpenRouter Agents MCP server.

Inspired by the Terminals.tech aesthetic: **ultra-minimal, collapsible, lightweight, and ultra-intelligent**.

## Features

- ✨ **Real-Time Communication**: WebSocket connection for bidirectional agent interaction
- 🧠 **Knowledge Graph Visualization**: Query and explore the agent's knowledge
- ⏰ **Temporal Awareness**: View and manage scheduled actions
- 💬 **Event Stream**: See agent thoughts, status updates, and proactive suggestions
- 🎯 **Agent Steering**: Dynamically adjust agent focus mid-task
- 📊 **Quick Actions**: Pre-defined commands for common workflows
- 🌌 **Local Zero Agent**: Browser-based AI with real-time cognitive visualization

## Quick Start

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173?token=YOUR_TOKEN`

## Usage

### Mode Switching

Toggle between **Server Mode** (🌐) and **Local Mode** (🧠) using the mode switcher in the header.

#### Server Mode (Remote MCP Server)

Type in the command bar:

- **Direct Query**: `What is PGlite?`
- **Steering**: `/steer Focus on security implications`
- **Context**: `/context User prefers detailed analysis`

Click the quick action buttons for instant commands:
- 🎯 Steer Agent
- 📊 Daily Briefing
- 🔍 Recent Updates

Query the knowledge graph by typing an entity name (e.g., "PGlite") and clicking "Query".

#### Local Mode (Cognitive Substrate)

The **Local Zero Agent** is a fully browser-based AI system that runs independently of the remote MCP server.

**Features**:
- Real-time particle visualization reflecting AI cognitive state
- Multi-agent architecture (Planner + Synthesizer)
- Entropy, coherence, and phase-lock metrics
- Powered by Transformers.js and WebGPU
- No server dependency - runs entirely in your browser

**How it works**:
1. Enter a query in the input field
2. Watch the particle manifold shift from high-entropy (chaotic) to low-entropy (coherent) as agents think
3. The Planner breaks down your request into steps
4. The Synthesizer creates a comprehensive response
5. All inference happens locally using a 0.5B parameter model

This demonstrates the "realizability proof" - the system proves its own capabilities through direct execution.

## Integration

This component can be embedded in other applications as a collapsible overlay:

```html
<script src="dist/mcp-agent-console.js"></script>
<div id="mcp-console"></div>
<script>
  MCPConsole.mount('#mcp-console', {
    serverUrl: 'ws://localhost:3008/mcp/ws',
    token: 'YOUR_TOKEN',
    collapsed: true
  });
</script>
```

## Configuration

Edit `vite.config.js` to change the proxy target:

```javascript
proxy: {
  '/mcp': {
    target: 'http://your-server:3008',
    changeOrigin: true,
    ws: true
  }
}
```

## Design Philosophy

- **Minimalist**: Clean, distraction-free interface
- **Performant**: Optimized rendering and efficient WebSocket handling
- **Intelligent**: Contextual quick actions and smart event filtering
- **Terminals-Themed**: Dark mode with terminal aesthetics
- **Accessible**: Keyboard shortcuts and semantic HTML

## Build

```bash
npm run build
```

Output in `dist/` - deployable as static files or embedded component.

## License

MIT © 2025 Terminals.tech

