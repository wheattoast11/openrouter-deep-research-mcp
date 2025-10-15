/**
 * End-to-End MCP Test - Simulating Cursor IDE Client
 * 
 * Tests all exposed capabilities:
 * - Tools (6 in AGENT mode)
 * - Prompts (6 templates)
 * - Resources (9 dynamic resources)
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');

// Logging helpers
function logSection(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function logTest(name, status, details = '') {
  const icon = status === 'PASS' ? '✓' : (status === 'FAIL' ? '✗' : '○');
  const color = status === 'PASS' ? '\x1b[32m' : (status === 'FAIL' ? '\x1b[31m' : '\x1b[33m');
  console.log(`${color}${icon}\x1b[0m ${name}${details ? ' - ' + details : ''}`);
}

class MCPEndUserTester {
  constructor() {
    this.client = null;
    this.transport = null;
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0
    };
  }

  async initialize() {
    logSection('Initializing MCP Client Connection');
    
    try {
      // Create STDIO transport
      this.transport = new StdioClientTransport({
        command: 'node',
        args: [path.join(__dirname, 'src', 'server', 'mcpServer.js'), '--stdio'],
        env: {
          ...process.env,
          MODE: 'AGENT',
          OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
          ALLOW_NO_API_KEY: 'true' // For testing without real API key
        }
      });

      // Create client
      this.client = new Client({
        name: 'cursor-ide-simulator',
        version: '1.0.0'
      }, {
        capabilities: {
          sampling: {},
          roots: { listChanged: true }
        }
      });

      // Connect
      await this.client.connect(this.transport);
      logTest('MCP Client Connection', 'PASS', 'Connected via STDIO');
      this.results.passed++;
      return true;
    } catch (error) {
      logTest('MCP Client Connection', 'FAIL', error.message);
      this.results.failed++;
      return false;
    }
  }

  async testListTools() {
    logSection('Test 1: List Tools');
    
    try {
      const result = await this.client.listTools();
      const tools = result.tools || [];
      
      logTest('List Tools', 'PASS', `Found ${tools.length} tools`);
      
      // Verify expected tools in AGENT mode
      const expectedTools = ['agent', 'job_status', 'get_job_status', 'cancel_job', 'get_job_result', 'ping'];
      const foundTools = tools.map(t => t.name);
      
      for (const expected of expectedTools) {
        if (foundTools.includes(expected)) {
          logTest(`  Tool: ${expected}`, 'PASS', 'Found');
          this.results.passed++;
        } else {
          logTest(`  Tool: ${expected}`, 'FAIL', 'Not found');
          this.results.failed++;
        }
      }
      
      // Log tool details
      console.log('\nTool Details:');
      tools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
      
      return true;
    } catch (error) {
      logTest('List Tools', 'FAIL', error.message);
      this.results.failed++;
      return false;
    }
  }

  async testListPrompts() {
    logSection('Test 2: List Prompts');
    
    try {
      const result = await this.client.listPrompts();
      const prompts = result.prompts || [];
      
      logTest('List Prompts', 'PASS', `Found ${prompts.length} prompts`);
      
      // Verify expected prompts
      const expectedPrompts = [
        'planning_prompt',
        'synthesis_prompt',
        'research_workflow_prompt',
        'summarize_and_learn',
        'daily_briefing',
        'continuous_query'
      ];
      
      const foundPrompts = prompts.map(p => p.name);
      
      for (const expected of expectedPrompts) {
        if (foundPrompts.includes(expected)) {
          logTest(`  Prompt: ${expected}`, 'PASS', 'Found');
          this.results.passed++;
        } else {
          logTest(`  Prompt: ${expected}`, 'FAIL', 'Not found');
          this.results.failed++;
        }
      }
      
      // Log prompt details
      console.log('\nPrompt Details:');
      prompts.forEach(prompt => {
        console.log(`  - ${prompt.name}: ${prompt.description}`);
        if (prompt.arguments && prompt.arguments.length > 0) {
          prompt.arguments.forEach(arg => {
            console.log(`      • ${arg.name}: ${arg.description || 'no description'}`);
          });
        }
      });
      
      return true;
    } catch (error) {
      logTest('List Prompts', 'FAIL', error.message);
      this.results.failed++;
      return false;
    }
  }

  async testListResources() {
    logSection('Test 3: List Resources');
    
    try {
      const result = await this.client.listResources();
      const resources = result.resources || [];
      
      logTest('List Resources', 'PASS', `Found ${resources.length} resources`);
      
      // Verify expected resources
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
      
      const foundUris = resources.map(r => r.uri);
      
      for (const expected of expectedResources) {
        if (foundUris.includes(expected)) {
          logTest(`  Resource: ${expected}`, 'PASS', 'Found');
          this.results.passed++;
        } else {
          logTest(`  Resource: ${expected}`, 'FAIL', 'Not found');
          this.results.failed++;
        }
      }
      
      // Log resource details
      console.log('\nResource Details:');
      resources.forEach(resource => {
        console.log(`  - ${resource.uri}: ${resource.name}`);
        console.log(`    Description: ${resource.description || 'N/A'}`);
      });
      
      return true;
    } catch (error) {
      logTest('List Resources', 'FAIL', error.message);
      this.results.failed++;
      return false;
    }
  }

  async testReadResource() {
    logSection('Test 4: Read Resource (mcp://agent/status)');
    
    try {
      const result = await this.client.readResource({
        uri: 'mcp://agent/status'
      });
      
      logTest('Read Resource', 'PASS', 'Retrieved agent status');
      this.results.passed++;
      
      console.log('\nAgent Status:');
      if (result.contents && result.contents.length > 0) {
        const content = result.contents[0];
        console.log(content.text || JSON.stringify(content, null, 2));
      }
      
      return true;
    } catch (error) {
      logTest('Read Resource', 'FAIL', error.message);
      this.results.failed++;
      return false;
    }
  }

  async testGetPrompt() {
    logSection('Test 5: Get Prompt (planning_prompt)');
    
    try {
      const result = await this.client.getPrompt({
        name: 'planning_prompt',
        arguments: {
          query: 'How does quantum computing work?',
          domain: 'technical',
          complexity: 'moderate'
        }
      });
      
      logTest('Get Prompt', 'PASS', 'Retrieved planning prompt');
      this.results.passed++;
      
      console.log('\nPrompt Response:');
      console.log(`Description: ${result.description}`);
      if (result.messages && result.messages.length > 0) {
        const message = result.messages[0];
        const text = message.content?.text || JSON.stringify(message.content);
        console.log(`Content: ${text.substring(0, 200)}...`);
      }
      
      return true;
    } catch (error) {
      logTest('Get Prompt', 'FAIL', error.message);
      this.results.failed++;
      return false;
    }
  }

  async testPingTool() {
    logSection('Test 6: Call Tool (ping)');
    
    try {
      const result = await this.client.callTool({
        name: 'ping',
        arguments: {}
      });
      
      logTest('Ping Tool', 'PASS', 'Server responded');
      this.results.passed++;
      
      console.log('\nPing Response:');
      if (result.content && result.content.length > 0) {
        const text = result.content[0].text;
        console.log(text);
      }
      
      return true;
    } catch (error) {
      logTest('Ping Tool', 'FAIL', error.message);
      this.results.failed++;
      return false;
    }
  }

  async testAgentTool() {
    logSection('Test 7: Call Tool (agent) - Async Job');
    
    try {
      const result = await this.client.callTool({
        name: 'agent',
        arguments: {
          query: 'What is the capital of France?',
          async: true,
          costPreference: 'low'
        }
      });
      
      logTest('Agent Tool Call', 'PASS', 'Job submitted');
      this.results.passed++;
      
      if (result.content && result.content.length > 0) {
        const text = result.content[0].text;
        console.log(`\nResponse: ${text}`);
        
        // Extract job_id if present
        const jobMatch = text.match(/job[_-]id[:\s]+([a-zA-Z0-9-]+)/i);
        if (jobMatch) {
          const jobId = jobMatch[1];
          console.log(`Job ID: ${jobId}`);
          
          // Wait a bit then check status
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          await this.testJobStatus(jobId);
        }
      }
      
      return true;
    } catch (error) {
      logTest('Agent Tool Call', 'FAIL', error.message);
      this.results.failed++;
      return false;
    }
  }

  async testJobStatus(jobId) {
    logSection(`Test 8: Job Status (${jobId})`);
    
    try {
      const result = await this.client.callTool({
        name: 'job_status',
        arguments: {
          job_id: jobId,
          format: 'summary'
        }
      });
      
      logTest('Job Status', 'PASS', 'Retrieved job status');
      this.results.passed++;
      
      if (result.content && result.content.length > 0) {
        const text = result.content[0].text;
        console.log(`\nStatus: ${text}`);
      }
      
      return true;
    } catch (error) {
      logTest('Job Status', 'FAIL', error.message);
      this.results.failed++;
      return false;
    }
  }

  async cleanup() {
    logSection('Cleanup');
    
    try {
      if (this.client) {
        await this.client.close();
        logTest('Client Disconnect', 'PASS', 'Disconnected cleanly');
      }
    } catch (error) {
      logTest('Client Disconnect', 'FAIL', error.message);
    }
  }

  printSummary() {
    logSection('Test Summary');
    
    const total = this.results.passed + this.results.failed + this.results.skipped;
    const passRate = total > 0 ? Math.round((this.results.passed / total) * 100) : 0;
    
    console.log(`Total Tests: ${total}`);
    console.log(`\x1b[32m✓ Passed: ${this.results.passed}\x1b[0m`);
    console.log(`\x1b[31m✗ Failed: ${this.results.failed}\x1b[0m`);
    console.log(`\x1b[33m○ Skipped: ${this.results.skipped}\x1b[0m`);
    console.log(`\nPass Rate: ${passRate}%`);
    
    if (passRate === 100) {
      console.log('\n\x1b[32m🎉 ALL TESTS PASSED! Server is ready for production.\x1b[0m');
    } else if (passRate >= 80) {
      console.log('\n\x1b[33m⚠️  Most tests passed. Review failures above.\x1b[0m');
    } else {
      console.log('\n\x1b[31m❌ Multiple failures detected. Debug required.\x1b[0m');
    }
  }
}

// Main test execution
async function runTests() {
  const tester = new MCPEndUserTester();
  
  console.log('\x1b[35m');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  OpenRouter Agents MCP Server - End User Test Suite       ║');
  console.log('║  Testing: Tools, Prompts, Resources + BoundedExecutor Fix ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\x1b[0m');
  
  try {
    // Initialize
    const connected = await tester.initialize();
    if (!connected) {
      console.error('Failed to connect. Exiting.');
      process.exit(1);
    }
    
    // Run tests in sequence
    await tester.testListTools();
    await tester.testListPrompts();
    await tester.testListResources();
    await tester.testReadResource();
    await tester.testGetPrompt();
    await tester.testPingTool();
    await tester.testAgentTool(); // This will test BoundedExecutor fix
    
  } catch (error) {
    console.error('\n\x1b[31mFatal Error:\x1b[0m', error);
    tester.results.failed++;
  } finally {
    await tester.cleanup();
    tester.printSummary();
    
    // Exit with appropriate code
    process.exit(tester.results.failed > 0 ? 1 : 0);
  }
}

// Run if executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { MCPEndUserTester, runTests };

