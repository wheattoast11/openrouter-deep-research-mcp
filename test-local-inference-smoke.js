#!/usr/bin/env node
/**
 * Smoke Test: Local GGUF Inference Integration
 * Quick validation that all pieces are wired correctly (doesn't require model downloads)
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

function log(level, message) {
  const color = level === 'success' ? colors.green : level === 'warning' ? colors.yellow : colors.red;
  console.error(`${color}[${level.toUpperCase()}]${colors.reset} ${message}`);
}

async function smokeTest() {
  log('info', '🔥 Smoke Test: Local Inference Integration');
  
  try {
    // Test with models DISABLED (fast path)
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['bin/openrouter-agents-mcp.js', '--stdio'],
      env: {
        ...process.env,
        LOCAL_MODELS_ENABLED: 'false', // Disabled for smoke test
        MODE: 'MANUAL', // Need MANUAL mode to expose local_inference tool
        OPENROUTER_API_KEY: 'test-key',
        PGLITE_DATA_DIR: './researchAgentDB'
      }
    });

    const client = new Client(
      { name: 'smoke-test', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
    log('success', '✓ MCP Client connected');

    // List tools
    const toolsResponse = await client.listTools();
    const toolNames = toolsResponse.tools.map(t => t.name);
    
    const hasLocalInference = toolNames.includes('local_inference');
    if (hasLocalInference) {
      log('success', '✓ local_inference tool registered');
    } else {
      log('error', '✗ local_inference tool NOT found');
      process.exit(1);
    }

    // Try calling with models disabled (should fail gracefully)
    try {
      await client.callTool({
        name: 'local_inference',
        arguments: {
          modelId: 'test',
          prompt: 'test'
        }
      });
      log('warning', '⚠ Tool call succeeded unexpectedly (models disabled)');
    } catch (error) {
      if (error.message.includes('not initialized') || error.message.includes('not loaded')) {
        log('success', '✓ Tool correctly reports models not loaded');
      } else {
        log('warning', `⚠ Unexpected error: ${error.message}`);
      }
    }

    await client.close();
    
    log('success', '✅ Smoke Test Passed!');
    log('info', 'Run with LOCAL_MODELS_ENABLED=true to test full inference flow');
    
    process.exit(0);

  } catch (error) {
    log('error', `❌ Smoke Test Failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

smokeTest();

