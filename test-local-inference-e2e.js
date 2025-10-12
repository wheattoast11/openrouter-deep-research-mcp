#!/usr/bin/env node
/**
 * E2E Test: Local GGUF Inference via MCP
 * Tests the complete user journey for local model integration
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const levelColors = {
    info: colors.blue,
    success: colors.green,
    warning: colors.yellow,
    error: colors.red,
    test: colors.magenta
  };
  
  const color = levelColors[level] || colors.reset;
  console.error(`${color}[${timestamp}] [${level.toUpperCase()}]${colors.reset} ${message}`);
  
  if (data) {
    console.error(JSON.stringify(data, null, 2));
  }
}

async function testE2E() {
  log('test', '🚀 Starting E2E Test: Local GGUF Inference via MCP');
  
  try {
    // Phase 1: Initialize MCP Client with STDIO transport
    log('info', 'Phase 1: Initializing MCP Client (STDIO transport)...');
    
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['bin/openrouter-agents-mcp.js', '--stdio'],
      env: {
        ...process.env,
        LOCAL_MODELS_ENABLED: 'true',
        LOCAL_MODEL_IDS: 'mradermacher/Qwen3-4B-Thinking-2507-Esper3.1-i1-GGUF,wheattoast11/utopia-atomic',
        LOCAL_MODELS_DOWNLOAD_PATH: './models',
        MODE: 'ALL', // Need ALL or MANUAL mode to expose all tools
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
        PGLITE_DATA_DIR: './researchAgentDB'
      }
    });

    const client = new Client(
      {
        name: 'e2e-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          sampling: {},
        },
      }
    );

    await client.connect(transport);
    log('success', '✓ MCP Client connected via STDIO');

    // Phase 2: List available tools (discovery)
    log('info', 'Phase 2: Discovering available tools...');
    const toolsResponse = await client.listTools();
    const toolNames = toolsResponse.tools.map(t => t.name);
    
    log('info', `Found ${toolNames.length} tools`);
    
    const hasLocalInference = toolNames.includes('local_inference');
    if (hasLocalInference) {
      log('success', '✓ local_inference tool is available');
      
      // Get tool details
      const localInferenceTool = toolsResponse.tools.find(t => t.name === 'local_inference');
      log('info', 'local_inference tool schema:', localInferenceTool.inputSchema);
    } else {
      log('warning', '⚠ local_inference tool NOT found. Available tools:', toolNames);
    }

    // Phase 3: Call local_inference tool with single model
    log('info', 'Phase 3: Testing single-model inference (utopia-atomic)...');
    
    try {
      const singleModelResult = await client.callTool({
        name: 'local_inference',
        arguments: {
          modelId: 'wheattoast11/utopia-atomic',
          prompt: 'Explain the concept of emergence in complex systems in one sentence.',
          options: {
            maxTokens: 100,
            temperature: 0.7
          }
        }
      });

      log('success', '✓ Single-model inference completed');
      log('info', 'Response:', singleModelResult);
    } catch (error) {
      log('error', `✗ Single-model inference failed: ${error.message}`);
      if (error.stack) log('error', error.stack);
    }

    // Phase 4: Call local_inference with pipeline mode (Qwen→Utopia)
    log('info', 'Phase 4: Testing pipeline mode (Qwen→Utopia)...');
    
    try {
      const pipelineResult = await client.callTool({
        name: 'local_inference',
        arguments: {
          modelId: 'wheattoast11/utopia-atomic',
          prompt: 'What are the key principles of agent-based modeling?',
          pipeline: {
            enabled: true,
            reasoningModel: 'mradermacher/Qwen3-4B-Thinking-2507-Esper3.1-i1-GGUF'
          },
          options: {
            maxTokens: 200,
            temperature: 0.8
          }
        }
      });

      log('success', '✓ Pipeline inference completed');
      log('info', 'Pipeline response:', pipelineResult);
    } catch (error) {
      log('error', `✗ Pipeline inference failed: ${error.message}`);
      if (error.stack) log('error', error.stack);
    }

    // Phase 5: Test with agent tool (async workflow)
    log('info', 'Phase 5: Testing via agent tool (async workflow)...');
    
    try {
      const agentResult = await client.callTool({
        name: 'agent',
        arguments: {
          query: 'Use local_inference to explain quantum entanglement using the Qwen→Utopia pipeline',
          mode: 'auto'
        }
      });

      log('success', '✓ Agent tool invocation completed');
      log('info', 'Agent response:', agentResult);
      
      // If async, poll for job status
      if (agentResult.content && agentResult.content[0]?.text) {
        const resultText = agentResult.content[0].text;
        const jobIdMatch = resultText.match(/job_[a-f0-9-]+/);
        
        if (jobIdMatch) {
          const jobId = jobIdMatch[0];
          log('info', `Job created: ${jobId}. Polling for status...`);
          
          // Poll for job completion (max 10 attempts)
          for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const statusResult = await client.callTool({
              name: 'job_status',
              arguments: { job_id: jobId, detail: 'full' }
            });

            log('info', `Job status (attempt ${i + 1}):`, statusResult);
            
            const statusText = statusResult.content?.[0]?.text || '';
            if (statusText.includes('"status":"completed"') || statusText.includes('"status":"failed"')) {
              log('success', '✓ Job completed');
              break;
            }
          }
        }
      }
    } catch (error) {
      log('error', `✗ Agent tool invocation failed: ${error.message}`);
      if (error.stack) log('error', error.stack);
    }

    // Phase 6: Cleanup
    log('info', 'Phase 6: Cleaning up...');
    await client.close();
    
    log('success', '✅ E2E Test Complete!');
    log('test', 'Summary: Tested discovery, single-model inference, pipeline mode, and async agent integration');
    
    process.exit(0);

  } catch (error) {
    log('error', `❌ E2E Test Failed: ${error.message}`);
    if (error.stack) log('error', error.stack);
    process.exit(1);
  }
}

// Run test
testE2E().catch(error => {
  log('error', `Fatal error: ${error.message}`);
  process.exit(1);
});

