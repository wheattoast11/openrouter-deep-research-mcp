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

## Quick Start

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173?token=YOUR_TOKEN`

## Usage

### Commands

Type in the command bar:

- **Direct Query**: `What is PGlite?`
- **Steering**: `/steer Focus on security implications`
- **Context**: `/context User prefers detailed analysis`

### Quick Actions

Click the quick action buttons for instant commands:
- 🎯 Steer Agent
- 📊 Daily Briefing
- 🔍 Recent Updates

### Knowledge Graph

Type an entity name (e.g., "PGlite") and click "Query" to explore relationships.

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

