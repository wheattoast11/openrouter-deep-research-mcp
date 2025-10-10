#!/usr/bin/env node
// Test script to run synchronous research and generate outputs

const tools = require('../src/server/tools');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '../research_outputs');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function runResearch(query, filename, options = {}) {
  console.error(`\n[${new Date().toISOString()}] Starting research: ${query.slice(0, 80)}...`);
  
  try {
    const startTime = Date.now();
    const result = await tools.conductResearch({
      query,
      costPreference: options.costPreference || 'low',
      audienceLevel: options.audienceLevel || 'intermediate',
      outputFormat: options.outputFormat || 'report',
      includeSources: true,
      ...options
    }, null, `test-${Date.now()}`);
    
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] Research completed in ${(duration/1000).toFixed(1)}s`);
    
    // Extract report ID from result
    const reportIdMatch = result.match(/Report ID:\s*(\d+)/);
    const reportId = reportIdMatch ? reportIdMatch[1] : null;
    
    if (reportId) {
      // Get the full report
      const report = await tools.getReportContent({
        reportId,
        mode: 'full'
      }, null, `test-${Date.now()}`);
      
      // Write to file
      const outputPath = path.join(outputDir, filename);
      fs.writeFileSync(outputPath, report, 'utf8');
      console.error(`[${new Date().toISOString()}] Report saved to: ${outputPath}`);
      
      return { success: true, reportId, outputPath, duration };
    } else {
      console.error(`[${new Date().toISOString()}] Warning: Could not extract report ID from result`);
      return { success: false, error: 'No report ID' };
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Research failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.error('='.repeat(80));
  console.error('OpenRouter Research Agents - Synchronous Research Test');
  console.error('='.repeat(80));
  
  const queries = [
    {
      query: 'What are the latest best practices for MCP (Model Context Protocol) server development and implementation patterns in 2025?',
      filename: 'research-report-mcp-best-practices.md',
      options: { audienceLevel: 'expert', outputFormat: 'report' }
    },
    {
      query: 'How do advanced prompt engineering techniques like chain-of-thought, tree-of-thought, and constitutional AI compare in terms of effectiveness and use cases?',
      filename: 'research-report-prompt-engineering.md',
      options: { audienceLevel: 'expert', outputFormat: 'report' }
    },
    {
      query: 'What are the trade-offs between WebSocket, Server-Sent Events (SSE), and HTTP/2 for real-time bidirectional communication in 2025?',
      filename: 'research-report-realtime-protocols.md',
      options: { audienceLevel: 'intermediate', outputFormat: 'report' }
    }
  ];
  
  const results = [];
  
  for (const { query, filename, options } of queries) {
    const result = await runResearch(query, filename, options);
    results.push({ query, filename, ...result });
    
    // Wait a bit between queries to avoid rate limits
    if (queries.indexOf({ query, filename, options }) < queries.length - 1) {
      console.error('Waiting 2s before next query...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  console.error('\n' + '='.repeat(80));
  console.error('Test Summary');
  console.error('='.repeat(80));
  
  results.forEach(({ query, filename, success, reportId, duration, error }) => {
    const status = success ? `✓ SUCCESS (${(duration/1000).toFixed(1)}s, ID: ${reportId})` : `✗ FAILED: ${error}`;
    console.error(`\n${filename}:`);
    console.error(`  Query: ${query.slice(0, 80)}...`);
    console.error(`  Status: ${status}`);
  });
  
  const successCount = results.filter(r => r.success).length;
  console.error(`\n${successCount}/${results.length} queries succeeded`);
  
  process.exit(successCount === results.length ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});



