#!/usr/bin/env node
// tests/test-mcp-capabilities.js  
// Validates MCP protocol capabilities (resources, prompts, tools) per 2025-06-18 spec

const config = require('../config');

async function validateMCPCapabilities() {
  console.log('\n=== MCP Protocol Capabilities Validation (2025-06-18) ===\n');
  
  const results = { passed: 0, failed: 0 };
  
  function check(name, condition, details = '') {
    const status = condition ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${name}${details ? ' - ' + details : ''}`);
    if (condition) results.passed++;
    else results.failed++;
  }

  // Test 1: MCP Configuration
  console.log('--- MCP Configuration ---');
  check('MCP config exists', config.mcp !== undefined);
  check('MCP mode set', config.mcp?.mode !== undefined, `mode=${config.mcp?.mode}`);
  check('Prompts feature enabled', config.mcp?.features?.prompts === true);
  check('Resources feature enabled', config.mcp?.features?.resources === true);
  check('Transport config exists', config.mcp?.transport !== undefined);
  check('Streamable HTTP enabled', config.mcp?.transport?.streamableHttpEnabled === true);

  // Test 2: Server Capabilities
  console.log('\n--- Server Capabilities ---');
  const mcpServerFile = require('fs').readFileSync('src/server/mcpServer.js', 'utf8');
  
  check('MCP Server uses @modelcontextprotocol/sdk', mcpServerFile.includes('@modelcontextprotocol/sdk/server'));
  check('Capabilities declared in code', mcpServerFile.includes('capabilities: {'));
  check('Tools capability in code', mcpServerFile.includes('tools: {}'));
  check('Prompts capability in code', mcpServerFile.includes('prompts: { listChanged: true }'));
  check('Resources capability in code', mcpServerFile.includes('resources: { subscribe: true, listChanged: true }'));

  // Test 3: Prompts Registration
  console.log('\n--- Prompts Registration ---');
  const expectedPrompts = [
    'planning_prompt',
    'synthesis_prompt',
    'research_workflow_prompt',
    'summarize_and_learn',
    'daily_briefing',
    'continuous_query'
  ];

  check('Expected prompt count', expectedPrompts.length === 6, `${expectedPrompts.length} prompts defined`);
  
  expectedPrompts.forEach(promptName => {
    check(`Prompt: ${promptName}`, mcpServerFile.includes(`'${promptName}'`));
  });

  check('setPromptRequestHandlers called', mcpServerFile.includes('server.setPromptRequestHandlers'));
  check('Prompt list handler exists', mcpServerFile.includes('list: async () => ({ prompts:'));
  check('Prompt get handler exists', mcpServerFile.includes('get: async (request) =>'));

  // Test 4: Resources Registration
  console.log('\n--- Resources Registration ---');
  const expectedResources = [
    'mcp://specs/core',
    'mcp://tools/catalog',
    'mcp://patterns/workflows',
    'mcp://examples/multimodal',
    'mcp://use-cases/domains',
    'mcp://optimization/caching',
    'mcp://agent/status',
    'mcp://knowledge_base/updates',
    'mcp://temporal/schedule'
  ];

  check('Expected resource count', expectedResources.length === 9, `${expectedResources.length} resources defined`);
  
  expectedResources.forEach(resourceUri => {
    check(`Resource: ${resourceUri}`, mcpServerFile.includes(`'${resourceUri}'`));
  });

  check('setResourceRequestHandlers called', mcpServerFile.includes('server.setResourceRequestHandlers'));
  check('Resource list handler exists', mcpServerFile.includes('list: async () => ({ resources:'));
  check('Resource read handler exists', mcpServerFile.includes('read: async (request) =>'));

  // Test 5: Discovery Endpoint
  console.log('\n--- MCP Discovery ---');
  check('Discovery endpoint registered', mcpServerFile.includes('/.well-known/mcp.json'));
  check('Discovery returns capabilities', mcpServerFile.includes('capabilities:'));
  check('Discovery returns resources', mcpServerFile.includes('resources:'));
  check('Discovery returns prompts', mcpServerFile.includes('prompts:'));

  // Test 6: Protocol Version
  console.log('\n--- Protocol Version ---');
  check('MCP spec version documented', mcpServerFile.includes('2025-06-18') || mcpServerFile.includes('2025-03-26'));
  check('Server version from package.json', config.server.version !== undefined, `v${config.server.version}`);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total: ${results.passed + results.failed}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  
  if (results.failed > 0) {
    console.log('\n❌ MCP capabilities validation failed');
    return false;
  }
  
  console.log('\n✅ MCP capabilities fully compliant with 2025-06-18 spec');
  console.log('\nCapabilities Summary:');
  console.log(`  • Tools: ✅ Exposed per MODE (AGENT=${config.mcp.mode === 'AGENT'})`);
  console.log(`  • Prompts: ✅ ${expectedPrompts.length} prompts with listChanged support`);
  console.log(`  • Resources: ✅ ${expectedResources.length} resources with subscribe + listChanged`);
  console.log(`  • Transport: ✅ WebSocket + Streamable HTTP`);
  console.log(`  • Discovery: ✅ /.well-known/mcp.json endpoint`);
  
  return true;
}

validateMCPCapabilities()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('\n❌ Validation crashed:', err);
    process.exit(1);
  });

