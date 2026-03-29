'use strict';

const assert = require('assert');
const {
  toolAllowedInPreset,
  listToolsForPreset,
  normalizePreset,
  DEVELOPER_EXTRA
} = require('../../src/server/mcpToolSets');

assert.strictEqual(normalizePreset('enterprise'), 'enterprise');
assert.strictEqual(normalizePreset('bogus'), 'conversational');

const conv = listToolsForPreset('conversational');
assert.ok(conv.includes('ask'));
assert.ok(conv.includes('job_get'));
assert.ok(!conv.includes('research'));
assert.ok(conv.length <= 5, 'conversational should stay small');

assert.strictEqual(toolAllowedInPreset('ask', 'conversational'), true);
assert.strictEqual(toolAllowedInPreset('graph_stats', 'conversational'), false);
assert.strictEqual(toolAllowedInPreset('graph_stats', 'enterprise'), true);

const devExtra = [...DEVELOPER_EXTRA];
assert.ok(devExtra.includes('kb_search'));
assert.ok(devExtra.includes('research_start'));

console.log('mcp-preset.test: ok', { conversational: conv.length, developerExtra: devExtra.length });
