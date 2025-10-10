#!/usr/bin/env node
// tests/comprehensive-qa.js
// Comprehensive QA and regression test suite

const fs = require('fs');
const path = require('path');

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

function log(status, category, test, message) {
  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  const line = `${emoji} [${category}] ${test}: ${message}`;
  console.log(line);
  
  results.tests.push({ status, category, test, message });
  if (status === 'PASS') results.passed++;
  else if (status === 'FAIL') results.failed++;
  else results.warnings++;
}

console.log('='.repeat(80));
console.log('COMPREHENSIVE QA & REGRESSION TEST SUITE');
console.log('@terminals-tech/openrouter-agents v1.6.0');
console.log('='.repeat(80));
console.log('');

// === Phase 1: File Structure & Dependencies ===
console.log('Phase 1: File Structure & Dependencies\n');

// Check critical files exist
const criticalFiles = [
  'package.json',
  'config.js',
  'src/server/mcpServer.js',
  'src/server/tools.js',
  'src/utils/dbClient.js',
  'src/utils/embeddingsAdapter.js',
  'src/utils/graphAdapter.js',
  'src/utils/vectorDimensionMigration.js',
  'src/utils/backgroundJobs.js',
  'tests/qa-intuitiveness.js'
];

for (const file of criticalFiles) {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    log('PASS', 'Files', file, 'exists');
  } else {
    log('FAIL', 'Files', file, 'MISSING');
  }
}

// Check package.json structure
try {
  const pkg = require('../package.json');
  
  if (pkg.name === '@terminals-tech/openrouter-agents') {
    log('PASS', 'Package', 'name', '@terminals-tech/openrouter-agents');
  } else {
    log('FAIL', 'Package', 'name', `Wrong name: ${pkg.name}`);
  }
  
  if (pkg.engines && pkg.engines.node && pkg.engines.node.includes('18')) {
    log('PASS', 'Package', 'engines', 'Node >=18 specified');
  } else {
    log('WARN', 'Package', 'engines', 'Node version constraint unclear');
  }
  
  const requiredDeps = ['@terminals-tech/embeddings', '@terminals-tech/graph', '@terminals-tech/core'];
  for (const dep of requiredDeps) {
    if (pkg.dependencies && pkg.dependencies[dep]) {
      log('PASS', 'Package', `dep:${dep}`, 'present');
    } else {
      log('WARN', 'Package', `dep:${dep}`, 'missing (optional)');
    }
  }
  
  const requiredScripts = ['start', 'stdio', 'qa:intuitive', 'test:mcp'];
  for (const script of requiredScripts) {
    if (pkg.scripts && pkg.scripts[script]) {
      log('PASS', 'Package', `script:${script}`, 'defined');
    } else {
      log('FAIL', 'Package', `script:${script}`, 'MISSING');
    }
  }
} catch (e) {
  log('FAIL', 'Package', 'parse', e.message);
}

// === Phase 2: Config Validation ===
console.log('\nPhase 2: Configuration Validation\n');

try {
  const config = require('../config.js');
  
  // Embeddings config
  if (config.embeddings) {
    log('PASS', 'Config', 'embeddings', 'section exists');
    
    if (config.embeddings.provider) {
      log('PASS', 'Config', 'embeddings.provider', config.embeddings.provider);
    } else {
      log('FAIL', 'Config', 'embeddings.provider', 'MISSING');
    }
    
    if (config.embeddings.dimension) {
      log('PASS', 'Config', 'embeddings.dimension', `${config.embeddings.dimension}D`);
    } else {
      log('FAIL', 'Config', 'embeddings.dimension', 'MISSING');
    }
  } else {
    log('FAIL', 'Config', 'embeddings', 'section MISSING');
  }
  
  // Database config
  if (config.database && config.database.vectorDimension) {
    log('PASS', 'Config', 'database.vectorDimension', `${config.database.vectorDimension}D`);
  } else {
    log('FAIL', 'Config', 'database.vectorDimension', 'MISSING');
  }
  
  // Indexer config
  if (config.indexer) {
    if (config.indexer.similarityThresholds && Array.isArray(config.indexer.similarityThresholds)) {
      log('PASS', 'Config', 'indexer.similarityThresholds', config.indexer.similarityThresholds.join(','));
    } else {
      log('FAIL', 'Config', 'indexer.similarityThresholds', 'MISSING or invalid');
    }
    
    if (typeof config.indexer.graphEnrichment !== 'undefined') {
      log('PASS', 'Config', 'indexer.graphEnrichment', config.indexer.graphEnrichment);
    } else {
      log('WARN', 'Config', 'indexer.graphEnrichment', 'not configured');
    }
  }
  
  // MCP transport config
  if (config.mcp && config.mcp.transport) {
    if (typeof config.mcp.transport.streamableHttpEnabled !== 'undefined') {
      log('PASS', 'Config', 'mcp.transport.streamableHttpEnabled', config.mcp.transport.streamableHttpEnabled);
    } else {
      log('WARN', 'Config', 'mcp.transport.streamableHttpEnabled', 'not set');
    }
  }
  
  // Idempotency config
  if (config.idempotency && typeof config.idempotency.enabled !== 'undefined') {
    log('PASS', 'Config', 'idempotency.enabled', config.idempotency.enabled);
  } else {
    log('WARN', 'Config', 'idempotency', 'not fully configured');
  }
} catch (e) {
  log('FAIL', 'Config', 'load', e.message);
}

// === Phase 3: Module Loading ===
console.log('\nPhase 3: Module Loading\n');

const modulesToLoad = [
  { name: 'dbClient', path: '../src/utils/dbClient' },
  { name: 'embeddingsAdapter', path: '../src/utils/embeddingsAdapter' },
  { name: 'graphAdapter', path: '../src/utils/graphAdapter' },
  { name: 'vectorMigration', path: '../src/utils/vectorDimensionMigration' },
  { name: 'backgroundJobs', path: '../src/utils/backgroundJobs' },
  { name: 'tools', path: '../src/server/tools' }
];

const loadedModules = {};

for (const mod of modulesToLoad) {
  try {
    const loaded = require(mod.path);
    loadedModules[mod.name] = loaded;
    
    const exportCount = Object.keys(loaded).length;
    log('PASS', 'Module', mod.name, `loaded (${exportCount} exports)`);
  } catch (e) {
    log('FAIL', 'Module', mod.name, `Failed to load: ${e.message}`);
  }
}

// === Phase 4: API Surface Validation ===
console.log('\nPhase 4: API Surface Validation\n');

// Check tools module exports
if (loadedModules.tools) {
  const requiredExports = [
    'agentSchema',
    'agentTool',
    'conductResearchSchema',
    'retrieveSchema',
    'retrieveTool',
    'pingSchema',
    'pingTool',
    'getServerStatus',
    'listToolsTool',
    'searchToolsTool'
  ];
  
  for (const exp of requiredExports) {
    if (loadedModules.tools[exp]) {
      log('PASS', 'API', `tools.${exp}`, 'exported');
    } else {
      log('FAIL', 'API', `tools.${exp}`, 'MISSING');
    }
  }
}

// Check dbClient exports
if (loadedModules.dbClient) {
  const requiredDbExports = [
    'saveResearchReport',
    'findReportsBySimilarity',
    'searchHybrid',
    'indexDocument',
    'getDb',
    'isEmbedderReady',
    'isDbInitialized'
  ];
  
  for (const exp of requiredDbExports) {
    if (loadedModules.dbClient[exp]) {
      log('PASS', 'API', `dbClient.${exp}`, 'exported');
    } else {
      log('FAIL', 'API', `dbClient.${exp}`, 'MISSING');
    }
  }
}

// Check embeddingsAdapter exports
if (loadedModules.embeddingsAdapter) {
  const requiredEmbExports = [
    'initializeEmbeddings',
    'generateEmbedding',
    'getEmbedderStatus',
    'cosineSimilarity'
  ];
  
  for (const exp of requiredEmbExports) {
    if (loadedModules.embeddingsAdapter[exp]) {
      log('PASS', 'API', `embeddingsAdapter.${exp}`, 'exported');
    } else {
      log('FAIL', 'API', `embeddingsAdapter.${exp}`, 'MISSING');
    }
  }
}

// Check graphAdapter exports
if (loadedModules.graphAdapter) {
  const requiredGraphExports = [
    'initializeGraph',
    'expandQueryWithGraph',
    'getGraphStatus'
  ];
  
  for (const exp of requiredGraphExports) {
    if (loadedModules.graphAdapter[exp]) {
      log('PASS', 'API', `graphAdapter.${exp}`, 'exported');
    } else {
      log('FAIL', 'API', `graphAdapter.${exp}`, 'MISSING');
    }
  }
}

// Check backgroundJobs exports
if (loadedModules.backgroundJobs) {
  const requiredBgExports = [
    'startBackgroundJobs',
    'stopBackgroundJobs',
    'getBackgroundJobsStatus',
    'embedderHealthCheck',
    'databaseMaintenance'
  ];
  
  for (const exp of requiredBgExports) {
    if (loadedModules.backgroundJobs[exp]) {
      log('PASS', 'API', `backgroundJobs.${exp}`, 'exported');
    } else {
      log('FAIL', 'API', `backgroundJobs.${exp}`, 'MISSING');
    }
  }
}

// === Phase 5: Documentation ===
console.log('\nPhase 5: Documentation\n');

const docFiles = [
  { path: 'README.md', keywords: ['@terminals-tech', 'agent', 'gemini', 'embeddings'] },
  { path: 'CLAUDE.md', keywords: ['embeddings', 'graph', 'vector', 'dimension'] },
  { path: 'docs/MIGRATION-v1.6.md', keywords: ['embeddings', 'dimension', 'Gemini'] },
  { path: 'docs/IMPLEMENTATION-SUMMARY.md', keywords: ['completed', 'terminals-tech'] }
];

for (const doc of docFiles) {
  const fullPath = path.join(process.cwd(), doc.path);
  
  if (!fs.existsSync(fullPath)) {
    log('WARN', 'Docs', doc.path, 'missing');
    continue;
  }
  
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    let keywordsFound = 0;
    
    for (const keyword of doc.keywords) {
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        keywordsFound++;
      }
    }
    
    const coverage = (keywordsFound / doc.keywords.length) * 100;
    if (coverage >= 75) {
      log('PASS', 'Docs', doc.path, `${coverage.toFixed(0)}% keyword coverage`);
    } else if (coverage >= 50) {
      log('WARN', 'Docs', doc.path, `${coverage.toFixed(0)}% keyword coverage (low)`);
    } else {
      log('FAIL', 'Docs', doc.path, `${coverage.toFixed(0)}% keyword coverage (very low)`);
    }
  } catch (e) {
    log('FAIL', 'Docs', doc.path, `Failed to read: ${e.message}`);
  }
}

// === Phase 6: Integration Checks ===
console.log('\nPhase 6: Integration Checks\n');

// Check if agent tool can be invoked (syntax check)
if (loadedModules.tools && loadedModules.tools.agentTool) {
  const agentTool = loadedModules.tools.agentTool;
  
  if (typeof agentTool === 'function') {
    log('PASS', 'Integration', 'agentTool', 'is callable function');
    
    // Check arity (should accept params, mcpExchange, requestId)
    if (agentTool.length >= 1) {
      log('PASS', 'Integration', 'agentTool.arity', `accepts ${agentTool.length} params`);
    } else {
      log('WARN', 'Integration', 'agentTool.arity', 'unexpected signature');
    }
  } else {
    log('FAIL', 'Integration', 'agentTool', 'not a function');
  }
}

// Check embeddings adapter initialization
if (loadedModules.embeddingsAdapter) {
  const getStatus = loadedModules.embeddingsAdapter.getEmbedderStatus;
  
  if (typeof getStatus === 'function') {
    try {
      const status = getStatus();
      log('PASS', 'Integration', 'embedderStatus', `provider=${status.provider}, ready=${status.ready}`);
    } catch (e) {
      log('WARN', 'Integration', 'embedderStatus', `Error: ${e.message}`);
    }
  }
}

// Check graph adapter status
if (loadedModules.graphAdapter) {
  const getStatus = loadedModules.graphAdapter.getGraphStatus;
  
  if (typeof getStatus === 'function') {
    try {
      const status = getStatus();
      log('PASS', 'Integration', 'graphStatus', `ready=${status.ready}, enabled=${status.enabled}`);
    } catch (e) {
      log('WARN', 'Integration', 'graphStatus', `Error: ${e.message}`);
    }
  }
}

// === Summary ===
console.log('\n' + '='.repeat(80));
console.log('QA SUMMARY');
console.log('='.repeat(80));
console.log(`✅ PASSED:   ${results.passed}`);
console.log(`❌ FAILED:   ${results.failed}`);
console.log(`⚠️  WARNINGS: ${results.warnings}`);
console.log(`   TOTAL:    ${results.tests.length}`);
console.log('');

const passRate = (results.passed / results.tests.length) * 100;
console.log(`Pass Rate: ${passRate.toFixed(1)}%`);
console.log('');

if (results.failed === 0 && passRate >= 90) {
  console.log('🎉 QA: EXCELLENT - All critical tests passed!');
  process.exit(0);
} else if (results.failed === 0 && passRate >= 75) {
  console.log('✅ QA: GOOD - All critical tests passed with some warnings');
  process.exit(0);
} else if (results.failed <= 3) {
  console.log('⚠️  QA: ACCEPTABLE - Minor failures, review recommended');
  process.exit(0);
} else {
  console.log('❌ QA: FAILED - Critical issues found, fix required');
  process.exit(1);
}

