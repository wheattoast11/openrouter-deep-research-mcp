const { spawn } = require('child_process');
const readline = require('readline');
const { chromium } = require('playwright'); // Import Playwright's chromium browser
const config = require('./config'); // Use server config for base URL
const fs = require('fs').promises;
const path = require('path');

class MCPClient {
  constructor() {
    this.nextId = 1;
    this.pendingRequests = new Map();
    this.results = [];
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.process = spawn('node', ['bin/openrouter-agents-mcp.js', '--stdio'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.rl = readline.createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity
      });

      this.rl.on('line', (line) => {
        try {
          const response = JSON.parse(line);
          if (response.id && this.pendingRequests.has(response.id)) {
            const { resolve, reject } = this.pendingRequests.get(response.id);
            this.pendingRequests.delete(response.id);
            
            if (response.error) {
              reject(new Error(JSON.stringify(response.error)));
            } else {
              resolve(response.result);
            }
          }
        } catch (e) {
          console.error('Parse error:', line);
        }
      });

      this.process.on('error', reject);
      
      // Send initialize
      this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }).then(resolve).catch(reject);
    });
  }

  sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pendingRequests.set(id, { resolve, reject });
      
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };
      
      this.process.stdin.write(JSON.stringify(request) + '\n');
      
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout for ${method}`));
        }
      }, 60000);
    });
  }

  async stop() {
    this.process.stdin.end();
    this.process.kill();
  }

  async runTest(name, fn) {
    console.log(`\n=== TEST: ${name} ===`);
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      console.log(`✓ PASS (${duration}ms)`);
      this.results.push({ name, status: 'PASS', duration, result });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`✗ FAIL (${duration}ms):`, error.message);
      this.results.push({ name, status: 'FAIL', duration, error: error.message });
      throw error;
    }
  }
}

/**
 * Browser Test Utilities - Enhanced Playwright Integration
 * Captures console, network, errors, and performance metrics
 */
class BrowserTestHarness {
  constructor(page) {
    this.page = page;
    this.consoleMessages = [];
    this.networkRequests = [];
    this.networkResponses = [];
    this.errors = [];
    this.performanceMetrics = [];
    
    this.setupCapture();
  }
  
  setupCapture() {
    // Console capture
    this.page.on('console', msg => {
      const entry = {
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      };
      this.consoleMessages.push(entry);
      console.log(`BROWSER [${entry.type}]: ${entry.text}`);
    });
    
    // Network request capture
    this.page.on('request', request => {
      this.networkRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        timestamp: new Date().toISOString()
      });
    });
    
    // Network response capture
    this.page.on('response', response => {
      this.networkResponses.push({
        url: response.url(),
        status: response.status(),
        headers: response.headers(),
        timestamp: new Date().toISOString()
      });
    });
    
    // Error capture
    this.page.on('pageerror', error => {
      const entry = {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      };
      this.errors.push(entry);
      console.error(`BROWSER ERROR: ${error.message}`);
    });
  }
  
  async capturePerformanceMetrics() {
    const metrics = await this.page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByType('paint');
      
      return {
        domContentLoaded: nav?.domContentLoadedEventEnd - nav?.domContentLoadedEventStart,
        loadComplete: nav?.loadEventEnd - nav?.loadEventStart,
        firstPaint: paint.find(p => p.name === 'first-paint')?.startTime,
        firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime,
        timestamp: new Date().toISOString()
      };
    });
    
    this.performanceMetrics.push(metrics);
    return metrics;
  }
  
  async takeScreenshot(name) {
    const outputDir = './test-results/screenshots';
    await fs.mkdir(outputDir, { recursive: true });
    const filepath = path.join(outputDir, `${name}-${Date.now()}.png`);
    await this.page.screenshot({ path: filepath, fullPage: true });
    console.log(`📸 Screenshot saved: ${filepath}`);
    return filepath;
  }
  
  async exportCapture(name) {
    const outputDir = './test-results/browser-captures';
    await fs.mkdir(outputDir, { recursive: true });
    
    const capture = {
      name,
      timestamp: new Date().toISOString(),
      console: this.consoleMessages,
      network: {
        requests: this.networkRequests,
        responses: this.networkResponses
      },
      errors: this.errors,
      performance: this.performanceMetrics
    };
    
    const filepath = path.join(outputDir, `${name}-${Date.now()}.json`);
    await fs.writeFile(filepath, JSON.stringify(capture, null, 2));
    console.log(`💾 Browser capture exported: ${filepath}`);
    return capture;
  }
  
  getReport() {
    return {
      totalConsoleMessages: this.consoleMessages.length,
      totalNetworkRequests: this.networkRequests.length,
      totalNetworkResponses: this.networkResponses.length,
      totalErrors: this.errors.length,
      totalPerformanceCaptures: this.performanceMetrics.length,
      errorsByType: this.errors.reduce((acc, e) => {
        const key = e.message.split(':')[0] || 'Unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
      networkByStatus: this.networkResponses.reduce((acc, r) => {
        const status = `${r.status}`;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

async function main() {
  const client = new MCPClient();
  let browser;
  let page;
  let serverProcess; // Declare serverProcess here to make it accessible in finally block

  try {
    console.log('Starting MCP server...');
    // Give the server ample time to fully initialize DB and embedder
    serverProcess = spawn('node', ['bin/openrouter-agents-mcp.js'], {
      stdio: ['pipe', 'inherit', 'inherit'] // Inherit stderr/stdout for server logs
    });

    // Wait for a few seconds to allow server to fully start and initialize
    console.log('Waiting 15 seconds for server to initialize...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    console.log('Server initialization wait complete.');

    // Start the MCPClient, which connects via STDIO
    await client.start();
    console.log('✓ MCPClient connected to server via STDIO.');

    // Setup Playwright browser
    browser = await chromium.launch({ headless: true }); // Set to false for visual debugging
    page = await browser.newPage();

    // Setup browser test harness for comprehensive capture
    const browserHarness = new BrowserTestHarness(page);

    // Navigate to UI page (SSE job viewer) using config base URL
    const baseUrl = config.server.publicUrl || `http://localhost:${config.server.port}`;
    await page.goto(`${baseUrl}/ui`, { waitUntil: 'domcontentloaded' });
    console.log('Navigated to /ui.');

    // Create a job via agent tool to get a job_id for UI
    let uiJobId;
    await client.runTest('Create async research job (agent)', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'agent',
        arguments: {
          action: 'research',
          query: 'Summarize latest advancements in vector databases',
          async: true,
          costPreference: 'low'
        }
      });
      console.log('Agent result:', JSON.stringify(result, null, 2));
      uiJobId = result.structuredContent?.job_id;
      if (!uiJobId) throw new Error('agent did not return job_id');
      return result;
    });

    // Feed the job_id into the UI and connect SSE stream
    await page.fill('#job', uiJobId);
    await page.click('#go');
    await page.waitForSelector('#status', { state: 'attached' });
    console.log(`UI connected to job events for ${uiJobId}`);

    // Test 1: Ping
    await client.runTest('Tool: ping', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'ping',
        arguments: {}
      });
      console.log('Result:', JSON.stringify(result, null, 2));
      return result;
    });

    // Test 2: Get Server Status
    await client.runTest('Tool: get_server_status', async () => {
      const result = await client.sendRequest('tools/call', {
        name: 'get_server_status',
        arguments: {}
      });
      console.log('Result:', JSON.stringify(result, null, 2));
      // Proceed even if embedder or db not yet ready; job worker waits until ready
      return result;
    });

    // Test 3: List Tools (MCP direct)
    await client.runTest('List all tools (MCP direct)', async () => {
      const result = await client.sendRequest('tools/list', {});
      console.log(`Found ${result.tools.length} tools:`, result.tools.map(t => t.name));
      return result;
    });

    // Test 4: List Resources (MCP direct)
    await client.runTest('List all resources (MCP direct)', async () => {
      const result = await client.sendRequest('resources/list', {});
      console.log(`Found ${result.resources.length} resources:`, result.resources.map(r => r.name));
      return result;
    });

    // Test 5: List Prompts (MCP direct)
    await client.runTest('List all prompts (MCP direct)', async () => {
      const result = await client.sendRequest('prompts/list', {});
      console.log(`Found ${result.prompts.length} prompts:`, result.prompts.map(p => p.name));
      return result;
    });

    // Test 6: Submit simple research (async) via browser UI
    let browserJobId;
    await client.runTest('Browser UI: Submit agent (async research)', async () => {
      // Locate the input field and type a query
      const inputSelector = 'textarea[placeholder="Ask the agent..."]'; // Adjust selector based on actual UI
      await page.waitForSelector(inputSelector);
      await page.fill(inputSelector, 'What are the ethical implications of advanced AI?');

      // Locate and click the submit button
      const submitButtonSelector = 'button:has-text("Send")'; // Adjust selector based on actual UI
      await page.waitForSelector(submitButtonSelector);
      await page.click(submitButtonSelector);

      // Wait for the UI to display a job ID or a success message
      await page.waitForSelector('.job-id-display'); // Assuming a class to display job IDs
      const jobIdText = await page.textContent('.job-id-display');
      browserJobId = jobIdText.replace('Job ID: ', '').trim();
      console.log('Browser UI - Captured Job ID:', browserJobId);

      if (!browserJobId) {
        throw new Error('Browser UI did not display a job_id');
      }
      // You might also want to assert some other UI elements indicating success
      return { job_id: browserJobId };
    });

    // Test 7: Check job status via browser UI (using the job ID from browser interaction)
    if (browserJobId) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Give some time for job to start
      await client.runTest('Browser UI: Check job status', async () => {
        // Assuming there's a way to view job status by clicking on the job ID or a dedicated status page
        // This part will be highly dependent on the actual UI implementation.
        // For now, let's just attempt to read the status from the UI if available, or rely on direct MCP calls.
        // More robust implementation would involve navigating to a job detail page and reading status.
        // For this test, we'll confirm the job exists in the UI.
        const jobEntrySelector = `.job-entry[data-job-id="${browserJobId}"]`;
        await page.waitForSelector(jobEntrySelector); // Wait for the job entry to appear in the UI
        const statusText = await page.textContent(`${jobEntrySelector} .job-status`); // Assuming status is displayed
        console.log(`Browser UI - Job ${browserJobId} Status:`, statusText);
        return { job_id: browserJobId, status: statusText };
      });
    } else {
      console.warn('Skipping browser UI job_status test as browserJobId was not obtained.');
    }

    // Test 8: Get job result via direct MCP call (using the job ID from browser interaction)
    if (browserJobId) {
      // Wait for a longer period to allow the research job to potentially complete
      console.log('Waiting 30 seconds for the browser-initiated job to complete...');
      await new Promise(resolve => setTimeout(resolve, 30000));

      await client.runTest('Tool: get_job_result (browser-initiated job)', async () => {
        try {
          const result = await client.sendRequest('tools/call', {
            name: 'get_job_result',
            arguments: {
              job_id: browserJobId
            }
          });
          console.log('Result:', JSON.stringify(result, null, 2));
          if (!result.structuredContent || !result.structuredContent.result) {
            throw new Error('Job result did not contain expected structured content');
          }
          return result;
        } catch (e) {
          console.warn(`Could not get job result for ${browserJobId}: ${e.message}`);
          throw e;
        }
      });
    } else {
      console.warn('Skipping get_job_result test as browserJobId was not obtained.');
    }

    // Capture final performance metrics and screenshot
    if (browserHarness && page) {
      console.log('\n=== BROWSER CAPTURE ===');
      await browserHarness.capturePerformanceMetrics();
      await browserHarness.takeScreenshot('final-state');
      const capture = await browserHarness.exportCapture('comprehensive-test');
      const report = browserHarness.getReport();
      console.log('Browser Test Report:', JSON.stringify(report, null, 2));
    }

    // Summary
    console.log('\n\n=== TEST SUMMARY ===');
    const passed = client.results.filter(r => r.status === 'PASS').length;
    const failed = client.results.filter(r => r.status === 'FAIL').length;
    console.log(`Total: ${client.results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log('\nDetailed Results:');
    client.results.forEach(r => {
      console.log(`  ${r.status === 'PASS' ? '✓' : '✗'} ${r.name} (${r.duration}ms)`);
      if (r.status === 'FAIL') {
        console.log(`    Error: ${r.error}`);
      }
    });

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
    if (serverProcess) {
      serverProcess.kill();
      console.log('Server process killed.');
    }
    await client.stop();
    console.log('MCPClient stopped.');
  }
}

main().catch(console.error);

