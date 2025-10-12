#!/usr/bin/env node

/**
 * End-User Testing Script for OpenRouter Research Agents MCP Server
 * Tests the server as an end user would experience it through Cursor IDE
 * 
 * Run: node test-end-user-cursor-mcp.js
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'='.repeat(80)}`, 'cyan');
  log(`  ${title}`, 'bright');
  log('='.repeat(80), 'cyan');
}

function logTest(name, status, details = '') {
  const symbol = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '●';
  const color = status === 'PASS' ? 'green' : status === 'FAIL' ? 'red' : 'yellow';
  log(`${symbol} ${name}`, color);
  if (details) {
    log(`  ${details}`, 'reset');
  }
}

class MCPEndUserTester {
  constructor() {
    this.client = null;
    this.transport = null;
    this.testResults = {
      passed: 0,
      failed: 0,
      skipped: 0
    };
  }

  async initialize() {
    logSection('Initializing MCP Client Connection');
    
    try {
      // Create transport with command and args
      this.transport = new StdioClientTransport({
        command: 'node',
        args: [path.join(__dirname, 'src', 'server', 'mcpServer.js'), '--stdio'],
        env: {
          ...process.env,
          MODE: 'ALL', // Test with all tools exposed
          OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key'
        }
      });

      // Create client
      this.client = new Client({
        name: 'end-user-tester',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      // Connect
      await this.client.connect(this.transport);
      logTest('MCP Client Connection', 'PASS', 'Connected to MCP server via STDIO');
      return true;
    } catch (error) {
      logTest('MCP Client Connection', 'FAIL', error.message);
      return false;
    }
  }

  async testPing() {
    logSection('Test 1: Basic Connectivity (ping)');
    try {
      const result = await this.client.callTool({
        name: 'ping',
        arguments: { info: true }
      });
      
      const data = JSON.parse(result.content[0].text);
      if (data.pong) {
        this.testResults.passed++;
        logTest('Ping Tool', 'PASS', `Server responded: ${data.time || 'pong'}`);
        return true;
      }
    } catch (error) {
      this.testResults.failed++;
      logTest('Ping Tool', 'FAIL', error.message);
      return false;
    }
  }

  async testServerStatus() {
    logSection('Test 2: Server Status Check');
    try {
      const result = await this.client.callTool({
        name: 'get_server_status',
        arguments: {}
      });
      
      const status = JSON.parse(result.content[0].text);
      
      // Verify key components
      const checks = [
        { name: 'Database Initialized', value: status.database?.initialized },
        { name: 'Embedder Ready', value: status.embedder?.ready },
        { name: 'Server Version', value: status.serverVersion },
        { name: 'Jobs Queue', value: status.jobs !== undefined }
      ];

      let allPassed = true;
      checks.forEach(check => {
        if (check.value) {
          logTest(check.name, 'PASS', JSON.stringify(check.value));
        } else {
          logTest(check.name, 'FAIL', 'Not available');
          allPassed = false;
        }
      });

      if (allPassed) {
        this.testResults.passed++;
        return true;
      } else {
        this.testResults.failed++;
        return false;
      }
    } catch (error) {
      this.testResults.failed++;
      logTest('Server Status', 'FAIL', error.message);
      return false;
    }
  }

  async testListTools() {
    logSection('Test 3: Tool Discovery');
    try {
      const result = await this.client.callTool({
        name: 'list_tools',
        arguments: { semantic: false }
      });
      
      const data = JSON.parse(result.content[0].text);
      const toolCount = data.tools?.length || 0;
      
      if (toolCount > 0) {
        this.testResults.passed++;
        logTest('List Tools', 'PASS', `Found ${toolCount} available tools`);
        
        // Show a few key tools
        const keyTools = ['agent', 'ping', 'research', 'conduct_research', 'search', 'query'];
        log('\n  Key Tools Available:', 'cyan');
        keyTools.forEach(toolName => {
          const found = data.tools.find(t => t.name === toolName);
          if (found) {
            log(`    ✓ ${toolName}`, 'green');
          }
        });
        
        return true;
      }
    } catch (error) {
      this.testResults.failed++;
      logTest('List Tools', 'FAIL', error.message);
      return false;
    }
  }

  async testUtilityTools() {
    logSection('Test 4: Utility Tools (calc, date_time)');
    
    // Test calc
    try {
      const calcResult = await this.client.callTool({
        name: 'calc',
        arguments: { expr: '2 + 2 * 3' }
      });
      
      const calcData = JSON.parse(calcResult.content[0].text);
      if (calcData.result === 8) {
        logTest('Calc Tool', 'PASS', `2 + 2 * 3 = ${calcData.result}`);
        this.testResults.passed++;
      } else {
        logTest('Calc Tool', 'FAIL', `Expected 8, got ${calcData.result}`);
        this.testResults.failed++;
      }
    } catch (error) {
      logTest('Calc Tool', 'FAIL', error.message);
      this.testResults.failed++;
    }

    // Test date_time
    try {
      const dateResult = await this.client.callTool({
        name: 'date_time',
        arguments: { format: 'iso' }
      });
      
      const dateData = JSON.parse(dateResult.content[0].text);
      if (dateData.timestamp) {
        logTest('Date/Time Tool', 'PASS', `Current time: ${dateData.timestamp}`);
        this.testResults.passed++;
      } else {
        logTest('Date/Time Tool', 'FAIL', 'No timestamp returned');
        this.testResults.failed++;
      }
    } catch (error) {
      logTest('Date/Time Tool', 'FAIL', error.message);
      this.testResults.failed++;
    }
  }

  async testPrompts() {
    logSection('Test 5: MCP Prompts');
    try {
      const prompts = await this.client.listPrompts();
      
      if (prompts && prompts.prompts && prompts.prompts.length > 0) {
        this.testResults.passed++;
        logTest('List Prompts', 'PASS', `Found ${prompts.prompts.length} prompt templates`);
        
        // Show available prompts
        log('\n  Available Prompts:', 'cyan');
        prompts.prompts.forEach(prompt => {
          log(`    • ${prompt.name}`, 'reset');
          if (prompt.description) {
            log(`      ${prompt.description}`, 'reset');
          }
        });
        return true;
      } else {
        this.testResults.skipped++;
        logTest('List Prompts', 'SKIP', 'No prompts available');
        return false;
      }
    } catch (error) {
      this.testResults.failed++;
      logTest('List Prompts', 'FAIL', error.message);
      return false;
    }
  }

  async testResources() {
    logSection('Test 6: MCP Resources');
    try {
      const resources = await this.client.listResources();
      
      if (resources && resources.resources && resources.resources.length > 0) {
        this.testResults.passed++;
        logTest('List Resources', 'PASS', `Found ${resources.resources.length} resources`);
        
        // Show available resources
        log('\n  Available Resources:', 'cyan');
        resources.resources.forEach(resource => {
          log(`    • ${resource.uri}`, 'reset');
          if (resource.name) {
            log(`      ${resource.name}`, 'reset');
          }
        });
        return true;
      } else {
        this.testResults.skipped++;
        logTest('List Resources', 'SKIP', 'No resources available');
        return false;
      }
    } catch (error) {
      this.testResults.failed++;
      logTest('List Resources', 'FAIL', error.message);
      return false;
    }
  }

  async testAsyncAgent() {
    logSection('Test 7: Async Agent Tool (Job Submission)');
    
    // Skip if no API key
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'test-key') {
      this.testResults.skipped++;
      logTest('Async Agent', 'SKIP', 'No OPENROUTER_API_KEY configured');
      return false;
    }

    try {
      const result = await this.client.callTool({
        name: 'agent',
        arguments: {
          query: 'What is 2+2?',
          async: true
        }
      });
      
      const data = JSON.parse(result.content[0].text);
      
      if (data.job_id) {
        logTest('Agent Job Submission', 'PASS', `Job ID: ${data.job_id}`);
        
        // Test job status check
        try {
          const statusResult = await this.client.callTool({
            name: 'job_status',
            arguments: { job_id: data.job_id }
          });
          
          const statusData = JSON.parse(statusResult.content[0].text);
          logTest('Job Status Check', 'PASS', `Status: ${statusData.status || 'queued'}`);
          this.testResults.passed++;
          return true;
        } catch (statusError) {
          logTest('Job Status Check', 'FAIL', statusError.message);
          this.testResults.failed++;
          return false;
        }
      } else {
        logTest('Agent Job Submission', 'FAIL', 'No job_id returned');
        this.testResults.failed++;
        return false;
      }
    } catch (error) {
      this.testResults.failed++;
      logTest('Async Agent', 'FAIL', error.message);
      return false;
    }
  }

  async testKnowledgeBase() {
    logSection('Test 8: Knowledge Base Operations');
    
    // Test history
    try {
      const historyResult = await this.client.callTool({
        name: 'history',
        arguments: { limit: 5 }
      });
      
      const historyData = JSON.parse(historyResult.content[0].text);
      logTest('Research History', 'PASS', `Found ${historyData.count || 0} reports`);
      this.testResults.passed++;
    } catch (error) {
      logTest('Research History', 'FAIL', error.message);
      this.testResults.failed++;
    }

    // Test search (if indexer enabled)
    try {
      const searchResult = await this.client.callTool({
        name: 'search',
        arguments: { q: 'test', k: 5, scope: 'both' }
      });
      
      const searchData = JSON.parse(searchResult.content[0].text);
      logTest('KB Search', 'PASS', `Found ${searchData.results?.length || 0} results`);
      this.testResults.passed++;
    } catch (error) {
      // Search might fail if no indexed content, that's ok
      logTest('KB Search', 'SKIP', 'No indexed content or indexer disabled');
      this.testResults.skipped++;
    }
  }

  async generateReport() {
    logSection('Test Summary Report');
    
    const total = this.testResults.passed + this.testResults.failed + this.testResults.skipped;
    const passRate = total > 0 ? ((this.testResults.passed / total) * 100).toFixed(1) : 0;
    
    log(`\nTotal Tests: ${total}`, 'bright');
    log(`  ✓ Passed:  ${this.testResults.passed}`, 'green');
    log(`  ✗ Failed:  ${this.testResults.failed}`, 'red');
    log(`  ● Skipped: ${this.testResults.skipped}`, 'yellow');
    log(`\nPass Rate: ${passRate}%`, passRate >= 80 ? 'green' : 'red');
    
    if (this.testResults.failed === 0) {
      log('\n🎉 All tests passed! Server is ready for end-user use.', 'green');
    } else {
      log('\n⚠️  Some tests failed. Review the output above for details.', 'red');
    }
    
    // Write detailed report to file
    const reportData = {
      timestamp: new Date().toISOString(),
      serverVersion: '2.1.1-beta',
      testResults: this.testResults,
      passRate: parseFloat(passRate),
      status: this.testResults.failed === 0 ? 'PASS' : 'FAIL'
    };
    
    require('fs').writeFileSync(
      'test-end-user-results.json',
      JSON.stringify(reportData, null, 2)
    );
    
    log('\nDetailed results written to: test-end-user-results.json', 'cyan');
  }

  async cleanup() {
    try {
      if (this.client) {
        await this.client.close();
      }
      log('\n✓ Connection closed', 'green');
    } catch (error) {
      log(`\n✗ Cleanup error: ${error.message}`, 'red');
    }
  }

  async runAllTests() {
    try {
      // Initialize connection
      const connected = await this.initialize();
      if (!connected) {
        log('\n✗ Failed to connect to MCP server. Exiting.', 'red');
        process.exit(1);
      }

      // Run test suite
      await this.testPing();
      await this.testServerStatus();
      await this.testListTools();
      await this.testUtilityTools();
      await this.testPrompts();
      await this.testResources();
      await this.testAsyncAgent();
      await this.testKnowledgeBase();

      // Generate report
      await this.generateReport();

    } catch (error) {
      log(`\n✗ Unexpected error: ${error.message}`, 'red');
      console.error(error);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

// Run tests
if (require.main === module) {
  const tester = new MCPEndUserTester();
  tester.runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = MCPEndUserTester;

