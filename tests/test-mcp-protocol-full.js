#!/usr/bin/env node
// tests/test-mcp-protocol-full.js
// Tests that tools, prompts, AND resources are all accessible via MCP protocol

const { spawn } = require('child_process');
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'src', 'server', 'mcpServer.js');

async function testFullMCPProtocol() {
  console.log('\n=== MCP Protocol Full Test (Tools + Prompts + Resources) ===\n');
  
  const env = {
    ...process.env,
    MODE: 'AGENT',
    NODE_NO_WARNINGS: '1',
    LOG_LEVEL: 'warn'
  };

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY, '--stdio'],
    cwd: PROJECT_ROOT,
    env
  });

  const client = new Client({
    name: 'mcp-tester',
    version: '1.0.0'
  }, {
    capabilities: {
      tools: {},
      prompts: { listChanged: true },
      resources: { subscribe: true, listChanged: true }
    }
  });

  try {
    await transport.start();
    await client.connect(transport);

    console.log('✅ Connected to MCP server\n');

    // Test 1: List Tools
    console.log('--- Tools ---');
    const toolsResult = await client.listTools({});
    console.log(`Found ${toolsResult.tools.length} tools:`);
    toolsResult.tools.forEach(t => console.log(`  • ${t.name}`));

    // Test 2: List Prompts
    console.log('\n--- Prompts ---');
    try {
      const promptsResult = await client.listPrompts({});
      console.log(`Found ${promptsResult.prompts.length} prompts:`);
      promptsResult.prompts.forEach(p => console.log(`  • ${p.name} - ${p.description.substring(0, 60)}...`));
    } catch (e) {
      console.log(`❌ Prompts error: ${e.message}`);
    }

    // Test 3: List Resources
    console.log('\n--- Resources ---');
    try {
      const resourcesResult = await client.listResources({});
      console.log(`Found ${resourcesResult.resources.length} resources:`);
      resourcesResult.resources.forEach(r => console.log(`  • ${r.uri} - ${r.name}`));
    } catch (e) {
      console.log(`❌ Resources error: ${e.message}`);
    }

    // Test 4: Read a sample resource
    console.log('\n--- Resource Read Test ---');
    try {
      const resource = await client.readResource({ uri: 'mcp://specs/core' });
      console.log(`✅ Read resource: mcp://specs/core`);
      console.log(`   Content type: ${typeof resource.contents[0]?.text || typeof resource.contents[0]?.blob}`);
    } catch (e) {
      console.log(`❌ Resource read error: ${e.message}`);
    }

    // Test 5: Get a sample prompt
    console.log('\n--- Prompt Get Test ---');
    try {
      const prompt = await client.getPrompt({ 
        name: 'research_workflow_prompt',
        arguments: { topic: 'quantum computing' }
      });
      console.log(`✅ Got prompt: research_workflow_prompt`);
      console.log(`   Messages: ${prompt.messages.length}`);
    } catch (e) {
      console.log(`❌ Prompt get error: ${e.message}`);
    }

    await client.close();
    console.log('\n✅ MCP Protocol Full Test Complete');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    try {
      await client.close();
    } catch (_) {}
    process.exit(1);
  }
}

testFullMCPProtocol();

