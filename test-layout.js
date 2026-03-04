const { TuiLayoutManager } = require('./src/cli/orchestrator/core/tuiLayout');
const assert = require('assert');

console.log('Testing TuiLayoutManager...');

const layout = new TuiLayoutManager();
const topics = ['Analyst', 'Technical', 'Legal'];
const dims = { columns: 120, rows: 40 };

layout.createSwarmLayout(topics, dims);

assert.strictEqual(layout.panes.length, 3, 'Should have 3 panes');
assert.strictEqual(layout.mode, 'swarm', 'Mode should be swarm');

const analystPane = layout.getPane('Analyst');
assert.ok(analystPane, 'Should find Analyst pane');
assert.strictEqual(analystPane.width, 40, 'Pane width should be 120/3 = 40');
assert.strictEqual(analystPane.x, 0, 'First pane x should be 0');

const legalPane = layout.getPane('Legal');
assert.strictEqual(legalPane.x, 80, 'Third pane x should be 80');

// Test writing
analystPane.write('Hello World');
assert.strictEqual(analystPane.buffer[0], 'Hello World', 'Buffer should contain text');

// Test resize
layout.resize(150, 50);
assert.strictEqual(layout.getPane('Analyst').width, 50, 'Resized width should be 150/3 = 50');

console.log('TuiLayoutManager tests passed!');
