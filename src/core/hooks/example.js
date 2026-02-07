/**
 * Universal Hook System - Usage Examples
 */

const { UniversalHook, UniversalEvents } = require('./index');
const dbClient = require('../../utils/dbClient');

/**
 * Example 1: Basic hook firing without graph
 */
async function basicExample() {
  console.log('\n=== Example 1: Basic Hook Firing ===');

  const hook = new UniversalHook({
    graphEnabled: false
  });

  const result = await hook.fire(UniversalEvents.TOOL_BEFORE, {
    sessionId: 'demo-session',
    toolName: 'Bash',
    command: 'ls -la'
  });

  console.log('Event fired:', result.eventId);
  console.log('Claude Code:', result.claudeCode?.status);
  console.log('OpenCode:', result.opencode?.status);
}

/**
 * Example 2: Hook firing with graph tracking
 */
async function graphExample() {
  console.log('\n=== Example 2: Hook with Graph Tracking ===');

  // Initialize database first
  await dbClient.waitForInit();

  const hook = new UniversalHook({
    dbClient,
    graphEnabled: true
  });

  const result = await hook.fire(UniversalEvents.SESSION_START, {
    sessionId: 'graph-demo',
    projectDir: process.cwd()
  });

  console.log('Event with graph:', result.eventId);
  console.log('Graph node:', result.graph?.nodeId);
}

/**
 * Example 3: Installing hooks
 */
async function installExample() {
  console.log('\n=== Example 3: Installing Hooks ===');

  const hook = new UniversalHook();

  const hookDef = {
    event: UniversalEvents.TOOL_BEFORE,
    matcher: 'Bash',
    command: `#!/bin/bash
TOOL_DATA=$(cat)
COMMAND=$(echo "$TOOL_DATA" | jq -r '.tool_input.command // empty')
echo "Executing: $COMMAND" >&2
exit 0`,
    type: 'command'
  };

  const result = await hook.installHook(hookDef);
  console.log('Hook installed:');
  console.log('  Claude Code:', result.claudeCode?.status);
  console.log('  OpenCode:', result.opencode?.status);
}

/**
 * Example 4: Listing installed hooks
 */
async function listExample() {
  console.log('\n=== Example 4: Listing Hooks ===');

  const hook = new UniversalHook();
  const listings = await hook.listHooks();

  console.log('Claude Code hooks:', listings.claudeCode.length);
  listings.claudeCode.forEach(h => {
    console.log(`  - ${h.event}: ${h.count} hook(s)`);
  });

  console.log('OpenCode hooks:', listings.opencode.length);
}

/**
 * Example 5: Event history and tracking
 */
async function historyExample() {
  console.log('\n=== Example 5: Event History ===');

  const hook = new UniversalHook({ graphEnabled: false });

  // Fire multiple events
  await hook.fire(UniversalEvents.SESSION_START, { sessionId: 'history-demo' });
  await hook.fire(UniversalEvents.TOOL_BEFORE, { toolName: 'Read' });
  await hook.fire(UniversalEvents.TOOL_AFTER, { toolName: 'Read', success: true });

  const history = hook.getEventHistory(10);
  console.log(`Tracked ${history.length} events:`);
  history.forEach(e => {
    console.log(`  - ${e.timestamp}: ${e.event}`);
  });
}

/**
 * Example 6: Provider health monitoring
 */
async function healthExample() {
  console.log('\n=== Example 6: Provider Health ===');

  const hook = new UniversalHook();
  const health = hook.getProviderHealth();

  console.log('Provider Status:');
  console.log('  Claude Code:', health.claudeCode.healthy ? '✓' : '✗');
  console.log('  OpenCode:', health.opencode.healthy ? '✓' : '✗');
  console.log('  Graph:', health.graph.enabled && health.graph.available ? '✓' : '○');
}

/**
 * Example 7: Complete workflow
 */
async function completeWorkflow() {
  console.log('\n=== Example 7: Complete Workflow ===');

  await dbClient.waitForInit();

  const hook = new UniversalHook({
    dbClient,
    graphEnabled: true
  });

  // Session lifecycle
  console.log('1. Session Start');
  await hook.fire(UniversalEvents.SESSION_START, {
    sessionId: 'workflow-demo',
    projectDir: process.cwd()
  });

  // Tool execution
  console.log('2. Tool Before');
  await hook.fire(UniversalEvents.TOOL_BEFORE, {
    sessionId: 'workflow-demo',
    toolName: 'Bash',
    command: 'npm test'
  });

  console.log('3. Tool After');
  await hook.fire(UniversalEvents.TOOL_AFTER, {
    sessionId: 'workflow-demo',
    toolName: 'Bash',
    success: true,
    duration: 1234
  });

  // Agent completion
  console.log('4. Agent Complete');
  await hook.fire(UniversalEvents.AGENT_COMPLETE, {
    sessionId: 'workflow-demo',
    agentType: 'research',
    reportId: '42'
  });

  // Session end
  console.log('5. Session End');
  await hook.fire(UniversalEvents.SESSION_END, {
    sessionId: 'workflow-demo',
    duration: 5000
  });

  console.log('\nWorkflow complete. Check event history:');
  const history = hook.getEventHistory();
  console.log(`  Tracked ${history.length} events`);
}

// Run examples if executed directly
if (require.main === module) {
  (async () => {
    try {
      await basicExample();
      await graphExample();
      await installExample();
      await listExample();
      await historyExample();
      await healthExample();
      await completeWorkflow();

      console.log('\n=== All Examples Complete ===\n');
      process.exit(0);
    } catch (err) {
      console.error('Example failed:', err);
      process.exit(1);
    }
  })();
}

module.exports = {
  basicExample,
  graphExample,
  installExample,
  listExample,
  historyExample,
  healthExample,
  completeWorkflow
};
