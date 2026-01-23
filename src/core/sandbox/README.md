# Sandbox & Permissions Module

Unified permission system that abstracts permission checking across Claude Code and OpenCode environments.

## Usage

```javascript
const { UnifiedPermissions, PermissionType } = require('./src/core/sandbox');

// Create instance and load permissions
const perms = new UnifiedPermissions();
await perms.load();

// Check if action is allowed
const allowed = perms.canExecute('Bash(npm run test)');
console.log('Can execute:', allowed);

// Check with pattern matching
perms.checkPattern('Bash(npm run:*)', 'Bash(npm run test)'); // true
perms.checkPattern('Read(./src/**)', 'Read(./src/core/index.js)'); // true
perms.checkPattern('mcp__*', 'mcp__openrouter-research__tool'); // true

// Get summary
const summary = perms.getSummary();
console.log(summary);
```

## Pattern Syntax

Claude Code uses glob-style patterns:

- `Bash(npm run:*)` - Matches any npm run command
- `Read(./src/**)` - Matches any file in src/ recursively
- `Edit(.env*)` - Matches .env, .env.local, etc.
- `mcp__*` - Matches any MCP tool
- `/mcp*` - Matches any MCP skill/command

## Permission Checking

The system checks permissions in this order:

1. **Explicit Deny** - If action matches any deny pattern, block it
2. **Explicit Allow** - If action matches any allow pattern, allow it
3. **Default Mode** - Fall back to default (ask, allow, dontAsk)

## Provider Support

- **Claude Code** - Full granular permissions from `~/.claude/settings.json`
- **OpenCode** - MCP-level permissions from `~/.config/opencode/opencode.json`

## Advanced Usage

```javascript
// Add permission to both providers
await perms.addPermission('Bash(bun :*)', 'allow');

// Remove permission from both providers
await perms.removePermission('Bash(curl :*)', 'deny');

// Sync permissions between providers
await perms.syncPermissions('claude', 'opencode');

// Get allowed actions for specific type
const bashPerms = perms.getAllowedForType('Bash');
console.log('Allowed bash commands:', bashPerms);

// Check provider availability
if (perms.hasProvider('claude')) {
  console.log('Claude Code permissions loaded');
}
```

## Security

The system automatically blocks dangerous patterns:

- `Bash(rm -rf :*)` - Recursive file deletion
- `Bash(sudo :*)` - Sudo commands
- `Bash(chmod 777 :*)` - Insecure permissions
- `Edit(.env*)` - Sensitive files
- `Read(secrets/**)` - Secret files

These denials are loaded from the respective provider configurations.
