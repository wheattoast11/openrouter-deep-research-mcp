/**
 * Unit tests for UniversalHook
 */

const { UniversalHook, UniversalEvents } = require('../../../src/core/hooks');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('UniversalHook', () => {
  let hook;
  let mockDbClient;
  let tempDir;

  beforeEach(() => {
    // Create temp directory for testing
    tempDir = path.join(os.tmpdir(), `hook-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // Mock dbClient
    mockDbClient = {
      executeQuery: jest.fn().mockResolvedValue({ rows: [{ node_id: 'test-node' }] })
    };

    hook = new UniversalHook({
      claudeHooksPath: path.join(tempDir, 'settings.json'),
      opencodeHooksPath: path.join(tempDir, 'opencode.json'),
      dbClient: mockDbClient,
      graphEnabled: true
    });

    // Create mock config files
    fs.writeFileSync(
      path.join(tempDir, 'settings.json'),
      JSON.stringify({ hooks: {} }, null, 2)
    );
    fs.writeFileSync(
      path.join(tempDir, 'opencode.json'),
      JSON.stringify({ mcp: {} }, null, 2)
    );
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('constructor initializes with default config', () => {
    expect(hook).toBeDefined();
    expect(hook.graphEnabled).toBe(true);
    expect(hook.eventHistory).toEqual([]);
  });

  test('fire() calls all provider hooks', async () => {
    const payload = { sessionId: 'test-session', data: 'test' };
    const result = await hook.fire(UniversalEvents.TOOL_BEFORE, payload);

    expect(result).toHaveProperty('eventId');
    expect(result).toHaveProperty('claudeCode');
    expect(result).toHaveProperty('opencode');
    expect(result).toHaveProperty('graph');
    expect(result.event).toBe(UniversalEvents.TOOL_BEFORE);
  });

  test('updateGraph() creates hook_events table and inserts node', async () => {
    const payload = { test: 'data' };
    const result = await hook.updateGraph(UniversalEvents.TOOL_AFTER, payload);

    expect(mockDbClient.executeQuery).toHaveBeenCalled();
    expect(result.status).toBe('inserted');
    expect(result.nodeType).toBe('hook_event');
  });

  test('getProviderHealth() returns provider status', () => {
    const health = hook.getProviderHealth();

    expect(health).toHaveProperty('claudeCode');
    expect(health).toHaveProperty('opencode');
    expect(health).toHaveProperty('graph');
    expect(health.graph.enabled).toBe(true);
  });

  test('getEventHistory() returns recent events', async () => {
    await hook.fire(UniversalEvents.SESSION_START, { sessionId: 'test' });
    await hook.fire(UniversalEvents.TOOL_BEFORE, { sessionId: 'test' });

    const history = hook.getEventHistory(10);
    expect(history.length).toBe(2);
    expect(history[0].event).toBe(UniversalEvents.SESSION_START);
  });

  test('clearHistory() removes all events', async () => {
    await hook.fire(UniversalEvents.SESSION_START, { sessionId: 'test' });
    hook.clearHistory();

    const history = hook.getEventHistory();
    expect(history.length).toBe(0);
  });

  test('installHook() adds hook to Claude Code config', async () => {
    const hookDef = {
      event: UniversalEvents.TOOL_BEFORE,
      matcher: 'Bash',
      command: '#!/bin/bash\necho "test"',
      type: 'command'
    };

    const result = await hook.installHook(hookDef);
    expect(result.claudeCode).toHaveProperty('status', 'installed');

    // Verify hook was written
    const settings = JSON.parse(fs.readFileSync(path.join(tempDir, 'settings.json'), 'utf8'));
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PreToolUse.length).toBe(1);
  });

  test('listHooks() returns hooks from both providers', async () => {
    // Install a hook first
    await hook.installHook({
      event: UniversalEvents.TOOL_BEFORE,
      matcher: 'Read',
      command: 'echo "test"'
    });

    const listings = await hook.listHooks();
    expect(listings.claudeCode.length).toBeGreaterThan(0);
  });

  test('fire() handles provider errors gracefully', async () => {
    // Make dbClient fail
    mockDbClient.executeQuery.mockRejectedValue(new Error('DB Error'));

    const result = await hook.fire(UniversalEvents.SESSION_START, { test: 'data' });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.provider === 'graph')).toBe(true);
  });
});
