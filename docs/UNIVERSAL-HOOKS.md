# Universal Hook System

The Universal Hook System provides cross-provider event handling that bridges Claude Code and OpenCode with unified event semantics and knowledge graph integration.

## Architecture

```
┌─────────────────┐
│  Application    │
│   (Fire Event)  │
└────────┬────────┘
         │
    ┌────▼─────┐
    │ Universal │
    │   Hook   │
    └────┬─────┘
         │
    ┌────┴──────────────────┬──────────────────┐
    ▼                       ▼                  ▼
┌───────────┐         ┌──────────┐      ┌──────────┐
│Claude Code│         │ OpenCode │      │Knowledge │
│  Hooks    │         │  Events  │      │  Graph   │
└───────────┘         └──────────┘      └──────────┘
```

## Features

- **Cross-Provider Events**: Fire events to both Claude Code and OpenCode simultaneously
- **Unified Event Semantics**: Universal event types mapped to provider-specific formats
- **Knowledge Graph Integration**: Automatic graph node creation for event tracking
- **Event History**: Track and replay event sequences
- **Provider Health Monitoring**: Check availability of each provider
- **Hook Installation**: Declaratively install hooks across providers

## Installation

```javascript
const { UniversalHook, UniversalEvents } = require('./src/core/hooks');
```

## Universal Event Types

| Universal Event | Claude Code | OpenCode | Description |
|----------------|-------------|----------|-------------|
| `tool:before` | `PreToolUse` | custom | Before tool execution |
| `tool:after` | `PostToolUse` | custom | After tool execution |
| `session:start` | `SessionStart` | custom | Session initialization |
| `session:end` | `SessionEnd` | custom | Session termination |
| `agent:complete` | `SubagentStop` | custom | Agent task completion |
| `prompt:submit` | `UserPromptSubmit` | custom | User prompt submission |
| `precompact` | `PreCompact` | custom | Before context compaction |
| `stop` | `Stop` | custom | Execution stop |
| `notification` | `Notification` | custom | System notification |

## Quick Start

### Basic Usage

```javascript
const { UniversalHook, UniversalEvents } = require('./src/core/hooks');

const hook = new UniversalHook({
  graphEnabled: false  // Disable graph tracking for basic usage
});

// Fire an event
const result = await hook.fire(UniversalEvents.SESSION_START, {
  sessionId: 'my-session',
  projectDir: '/path/to/project'
});

console.log('Event ID:', result.eventId);
console.log('Claude Code:', result.claudeCode?.status);  // 'written'
console.log('OpenCode:', result.opencode?.status);       // 'written'
```

### With Graph Tracking

```javascript
const dbClient = require('./src/utils/dbClient');
await dbClient.waitForInit();

const hook = new UniversalHook({
  dbClient,
  graphEnabled: true
});

const result = await hook.fire(UniversalEvents.TOOL_BEFORE, {
  sessionId: 'my-session',
  toolName: 'Bash',
  command: 'npm test'
});

console.log('Graph node:', result.graph?.nodeId);  // 'hook:tool:before:1737467553832'
```

## API Reference

### Constructor

```javascript
new UniversalHook(config)
```

**Config Options:**
- `claudeHooksPath` (string): Path to Claude Code settings.json (default: `~/.claude/settings.json`)
- `opencodeHooksPath` (string): Path to OpenCode config (default: `~/.config/opencode/opencode.json`)
- `graphEnabled` (boolean): Enable knowledge graph tracking (default: `true`)
- `dbClient` (object): Database client for graph operations (required if `graphEnabled`)
- `maxHistorySize` (number): Maximum event history size (default: `1000`)

### Methods

#### `fire(event, payload)`

Fire an event to all providers.

```javascript
const result = await hook.fire(UniversalEvents.SESSION_START, {
  sessionId: 'demo',
  projectDir: process.cwd()
});
```

**Returns:**
```javascript
{
  eventId: 'universal-uuid',
  timestamp: '2026-01-21T15:00:00.000Z',
  event: 'session:start',
  claudeCode: { eventId: 'cc-event-uuid', status: 'written', file: '...' },
  opencode: { eventId: 'oc-event-uuid', status: 'written', file: '...' },
  graph: { status: 'inserted', nodeId: 'hook:session:start:123', nodeType: 'hook_event' },
  errors: []
}
```

#### `fireClaudeHook(event, payload)`

Fire event specifically to Claude Code.

```javascript
const result = await hook.fireClaudeHook(UniversalEvents.TOOL_BEFORE, {
  sessionId: 'demo',
  toolName: 'Read',
  filePath: '/path/to/file'
});
```

#### `fireOpencodeHook(event, payload)`

Fire event specifically to OpenCode.

```javascript
const result = await hook.fireOpencodeHook(UniversalEvents.TOOL_AFTER, {
  sessionId: 'demo',
  toolName: 'Bash',
  success: true
});
```

#### `updateGraph(event, payload)`

Update knowledge graph with event (requires `dbClient`).

```javascript
const result = await hook.updateGraph(UniversalEvents.SESSION_START, {
  sessionId: 'demo'
});
```

#### `installHook(hookDef)`

Install a hook to both providers.

```javascript
const result = await hook.installHook({
  event: UniversalEvents.TOOL_BEFORE,
  matcher: 'Bash',
  command: '#!/bin/bash\necho "Hook triggered" >&2\nexit 0',
  type: 'command'
});
```

#### `listHooks()`

List installed hooks from both providers.

```javascript
const listings = await hook.listHooks();
console.log('Claude Code hooks:', listings.claudeCode);
console.log('OpenCode hooks:', listings.opencode);
```

#### `getProviderHealth()`

Get provider health status.

```javascript
const health = hook.getProviderHealth();
console.log(health);
// {
//   claudeCode: { id: 'claude-code', enabled: true, healthy: true },
//   opencode: { id: 'opencode', enabled: true, healthy: true },
//   graph: { enabled: true, available: true }
// }
```

#### `getEventHistory(limit)`

Get recent event history.

```javascript
const history = hook.getEventHistory(50);
history.forEach(e => {
  console.log(`${e.timestamp}: ${e.event}`);
});
```

#### `clearHistory()`

Clear event history.

```javascript
hook.clearHistory();
```

## Event Payload Format

### Claude Code Format

```json
{
  "event_id": "cc-event-{uuid}",
  "session_id": "session-123",
  "event_type": "PreToolUse",
  "timestamp": "2026-01-21T15:00:00.000Z",
  "toolName": "Bash",
  "command": "npm test"
}
```

**File Location:** `~/.claude/sessions/{session_id}/hook_{timestamp}_{event_type}.json`

### OpenCode Format

```json
{
  "event_id": "oc-event-{uuid}",
  "event_type": "tool:before",
  "timestamp": "2026-01-21T15:00:00.000Z",
  "provider": "opencode",
  "toolName": "Bash",
  "command": "npm test"
}
```

**File Location:** `~/.config/opencode/events/{event_id}.json`

### Graph Node Format

```sql
CREATE TABLE hook_events (
  id SERIAL PRIMARY KEY,
  node_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

**Node ID Format:** `hook:{event_type}:{timestamp}`

## Complete Workflow Example

```javascript
const { UniversalHook, UniversalEvents } = require('./src/core/hooks');
const dbClient = require('./src/utils/dbClient');

await dbClient.waitForInit();

const hook = new UniversalHook({
  dbClient,
  graphEnabled: true
});

// 1. Session Start
await hook.fire(UniversalEvents.SESSION_START, {
  sessionId: 'workflow-123',
  projectDir: process.cwd()
});

// 2. Tool Execution
await hook.fire(UniversalEvents.TOOL_BEFORE, {
  sessionId: 'workflow-123',
  toolName: 'Bash',
  command: 'npm test'
});

await hook.fire(UniversalEvents.TOOL_AFTER, {
  sessionId: 'workflow-123',
  toolName: 'Bash',
  success: true,
  duration: 1234
});

// 3. Agent Completion
await hook.fire(UniversalEvents.AGENT_COMPLETE, {
  sessionId: 'workflow-123',
  agentType: 'research',
  reportId: '42'
});

// 4. Session End
await hook.fire(UniversalEvents.SESSION_END, {
  sessionId: 'workflow-123',
  duration: 5000
});

// Check history
const history = hook.getEventHistory();
console.log(`Tracked ${history.length} events`);
```

## Error Handling

The Universal Hook System is designed to be resilient. Errors from individual providers do not prevent other providers from receiving events.

```javascript
const result = await hook.fire(UniversalEvents.SESSION_START, { sessionId: 'demo' });

if (result.errors.length > 0) {
  console.error('Some providers failed:');
  result.errors.forEach(err => {
    console.error(`  ${err.provider}: ${err.error}`);
  });
}

// Other providers may still have succeeded
if (result.claudeCode?.status === 'written') {
  console.log('Claude Code hook succeeded');
}
```

## Provider-Specific Considerations

### Claude Code

- Events are written as JSON files in session directories
- Hook format follows Claude Code's command hook specification
- Events trigger hooks based on matcher patterns

### OpenCode

- Events are written to a shared events directory
- No built-in hook system, so custom event handling is required
- Event files can be monitored by OpenCode extensions

### Knowledge Graph

- Requires database initialization via `dbClient.waitForInit()`
- Creates `hook_events` table automatically
- Enables temporal event queries and graph analysis

## Advanced Usage

### Custom Hook Commands

```javascript
const hookDef = {
  event: UniversalEvents.TOOL_BEFORE,
  matcher: 'Bash',
  command: `#!/bin/bash
TOOL_DATA=$(cat)
COMMAND=$(echo "$TOOL_DATA" | jq -r '.tool_input.command // empty')

# Block dangerous commands
if echo "$COMMAND" | grep -qE '(rm\\s+.*-[rf]|sudo)'; then
  echo "🚫 Dangerous command blocked" >&2
  exit 2
fi

exit 0`,
  type: 'command'
};

await hook.installHook(hookDef);
```

### Event Filtering

```javascript
const history = hook.getEventHistory();
const toolEvents = history.filter(e =>
  e.event === UniversalEvents.TOOL_BEFORE ||
  e.event === UniversalEvents.TOOL_AFTER
);
console.log(`Tool events: ${toolEvents.length}`);
```

### Provider-Specific Firing

```javascript
// Fire only to Claude Code
const result = await hook.fireClaudeHook(UniversalEvents.SESSION_START, {
  sessionId: 'demo'
});

// Fire only to OpenCode
const result = await hook.fireOpencodeHook(UniversalEvents.SESSION_START, {
  sessionId: 'demo'
});
```

## Testing

Run unit tests:
```bash
npm test tests/unit/hooks/universalHook.test.js
```

Run integration test:
```bash
node src/core/hooks/example.js
```

## See Also

- [Claude Code Hook Documentation](https://github.com/anthropics/claude-code/docs/hooks)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Knowledge Graph Documentation](./KNOWLEDGE-GRAPH.md)

## License

MIT
