/**
 * Step 3: Feature Selection
 *
 * Toggle optional features:
 * - Knowledge Graph (semantic search, document indexing)
 * - Time Travel (undo/redo, session forking)
 * - Verification Mode (strict validation)
 *
 * @module cli/wizard/steps/features
 */

'use strict';

const features = [
  {
    key: 'knowledgeGraph',
    name: 'Knowledge Graph',
    description: 'Semantic search, document indexing, and graph analysis',
    default: true,
    envVar: 'GRAPH_ENABLED',
  },
  {
    key: 'timeTravel',
    name: 'Time Travel',
    description: 'Undo/redo, session forking, and checkpoint restoration',
    default: true,
    envVar: 'SESSION_TIME_TRAVEL',
  },
  {
    key: 'strictValidation',
    name: 'Strict Validation',
    description: 'Enforce strict schema validation for all tool calls',
    default: false,
    envVar: 'STRICT_SCHEMA_VALIDATION',
  },
  {
    key: 'debugMode',
    name: 'Debug Mode',
    description: 'Verbose logging for troubleshooting',
    default: false,
    envVar: 'LOG_LEVEL=debug',
  },
];

/**
 * Run the feature selection step
 */
async function run(rl, askYesNo) {
  console.log('');
  console.log('  Enable optional features:');
  console.log('  (You can change these later in .env)');
  console.log('');

  const selectedFeatures = {};

  for (const feature of features) {
    const hint = feature.default ? '(recommended)' : '';
    const question = `Enable ${feature.name}? ${hint}`;
    console.log(`\n  ${feature.name}`);
    console.log(`  \x1b[2m${feature.description}\x1b[0m`);

    const enabled = await askYesNo(rl, question, feature.default);
    selectedFeatures[feature.key] = enabled;
  }

  // Summary
  console.log('\n  Selected features:');
  for (const feature of features) {
    const status = selectedFeatures[feature.key] ? '\x1b[32m[ON]\x1b[0m' : '\x1b[2m[OFF]\x1b[0m';
    console.log(`  ${status} ${feature.name}`);
  }

  return selectedFeatures;
}

module.exports = {
  run,
  features,
};
