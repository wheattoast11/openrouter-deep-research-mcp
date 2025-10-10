#!/usr/bin/env node
// tests/qa-intuitiveness.js
// Automated intuitiveness evaluation for openrouter-agents MCP server

const {
  listToolsTool,
  searchToolsTool,
  dateTimeTool,
  calcTool,
  getServerStatus,
  researchTool,
  getJobStatusTool,
  retrieveTool,
  listResearchHistory,
  getReportContent
} = require('../src/server/tools');

const results = [];
let passCount = 0;
let failCount = 0;
let issueCount = 0;

function log(status, toolName, message) {
  const prefix = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  const line = `${prefix} ${status}: ${toolName} - ${message}`;
  console.log(line);
  results.push({ status, toolName, message });
  
  if (status === 'PASS') passCount++;
  else if (status === 'FAIL') failCount++;
  else issueCount++;
}

async function testDiscovery() {
  console.log('\n=== A) Discovery ===\n');

  // 1. List tools
  try {
    const result = await listToolsTool({});
    const parsed = JSON.parse(result);
    if (parsed.tools && parsed.tools.length > 0 && parsed.tools[0].name && parsed.tools[0].description) {
      log('PASS', 'list_tools', `Found ${parsed.tools.length} tools with names and descriptions`);
    } else {
      log('FAIL', 'list_tools', 'Tools list missing names or descriptions');
    }
  } catch (e) {
    log('FAIL', 'list_tools', e.message);
  }

  // 2. Search tools
  try {
    const result = await searchToolsTool({ query: 'research' });
    const parsed = JSON.parse(result);
    if (parsed.tools && parsed.tools.length > 0) {
      log('PASS', 'search_tools', `Found ${parsed.tools.length} research-related tools`);
    } else {
      log('ISSUE', 'search_tools', 'No tools returned for "research" query');
    }
  } catch (e) {
    log('FAIL', 'search_tools', e.message);
  }
}

async function testSimpleUtilities() {
  console.log('\n=== B) Simple Utilities ===\n');

  // 3. date_time
  try {
    const isoResult = await dateTimeTool({ format: 'iso' });
    if (isoResult.includes('T') && isoResult.includes('Z')) {
      log('PASS', 'date_time', 'ISO format returned');
    } else {
      log('FAIL', 'date_time', 'ISO format invalid');
    }

    const rfcResult = await dateTimeTool({ format: 'rfc' });
    if (rfcResult.length > 10) {
      log('PASS', 'date_time', 'RFC format returned');
    } else {
      log('FAIL', 'date_time', 'RFC format invalid');
    }

    const epochResult = await dateTimeTool({ format: 'epoch' });
    if (!isNaN(parseInt(epochResult))) {
      log('PASS', 'date_time', 'Epoch format returned as integer');
    } else {
      log('FAIL', 'date_time', 'Epoch format invalid');
    }
  } catch (e) {
    log('FAIL', 'date_time', e.message);
  }

  // 4. calc
  try {
    const r1 = await calcTool({ expression: '2+2*5' });
    if (r1.trim() === '12') {
      log('PASS', 'calc', '2+2*5 = 12');
    } else {
      log('FAIL', 'calc', `2+2*5 = ${r1} (expected 12)`);
    }

    const r2 = await calcTool({ expression: '(2+2)*5' });
    if (r2.trim() === '20') {
      log('PASS', 'calc', '(2+2)*5 = 20');
    } else {
      log('FAIL', 'calc', `(2+2)*5 = ${r2} (expected 20)`);
    }

    const r3 = await calcTool({ expression: '2^8' });
    if (r3.trim() === '256') {
      log('PASS', 'calc', '2^8 = 256');
    } else {
      log('FAIL', 'calc', `2^8 = ${r3} (expected 256)`);
    }
  } catch (e) {
    log('FAIL', 'calc', e.message);
  }

  // 5. get_server_status
  try {
    const status = await getServerStatus({});
    const parsed = JSON.parse(status);
    if (parsed.dbInitialized !== undefined && parsed.embedderReady !== undefined) {
      const lines = status.split('\n').length;
      if (lines <= 20) {
        log('PASS', 'get_server_status', 'Returned concise status summary');
      } else {
        log('ISSUE', 'get_server_status', `Status output too verbose (${lines} lines)`);
      }
    } else {
      log('FAIL', 'get_server_status', 'Missing required status fields');
    }
  } catch (e) {
    log('FAIL', 'get_server_status', e.message);
  }
}

async function testResearchWorkflow() {
  console.log('\n=== C) Research Workflow ===\n');

  let jobId = null;

  // 6. research (async)
  try {
    const result = await researchTool({ query: 'quantum computing applications', async: true });
    const parsed = JSON.parse(result);
    if (parsed.job_id) {
      jobId = parsed.job_id;
      const lines = result.split('\n').length;
      if (lines <= 10) {
        log('PASS', 'research', `Job ${jobId.substring(0, 8)}... created with concise response`);
      } else {
        log('ISSUE', 'research', `Response too verbose (${lines} lines)`);
      }
    } else {
      log('FAIL', 'research', 'No job_id returned');
    }
  } catch (e) {
    log('FAIL', 'research', e.message);
  }

  // 7. job_status
  if (jobId) {
    // Wait a moment for job to process
    await new Promise(r => setTimeout(r, 1000));

    try {
      const result = await getJobStatusTool({ job_id: jobId });
      const lines = result.split('\n').length;
      if (lines <= 15) {
        log('PASS', 'job_status', 'Terse status summary returned');
      } else {
        log('ISSUE', 'job_status', `Status too verbose (${lines} lines)`);
      }
    } catch (e) {
      log('FAIL', 'job_status', e.message);
    }
  } else {
    log('FAIL', 'job_status', 'Skipped (no job_id from previous step)');
  }

  // 8. conduct_research (sync)
  try {
    const result = await researchTool({ query: 'artificial intelligence trends 2025', async: false });
    if (result && result.length > 100) {
      const lines = result.split('\n').length;
      if (result.includes('report') || result.includes('saved')) {
        log('PASS', 'conduct_research', `Returned research report (${lines} lines)`);
      } else {
        log('ISSUE', 'conduct_research', 'Report format unclear');
      }
    } else {
      log('FAIL', 'conduct_research', 'Response too short or missing');
    }
  } catch (e) {
    log('FAIL', 'conduct_research', e.message);
  }
}

async function testRetrieval() {
  console.log('\n=== D) Retrieval ===\n');

  // 9. retrieve (index mode)
  try {
    const result = await retrieveTool({ mode: 'index', query: 'quantum computing', k: 5, scope: 'reports' });
    const lines = result.split('\n').length;
    if (lines <= 30) {
      log('PASS', 'retrieve', 'Concise index search results');
    } else {
      log('ISSUE', 'retrieve', `Results too verbose (${lines} lines)`);
    }
  } catch (e) {
    log('FAIL', 'retrieve', e.message);
  }

  // 10. retrieve (sql mode)
  try {
    const result = await retrieveTool({ mode: 'sql', sql: 'SELECT 1 as test' });
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].test === 1) {
      log('PASS', 'retrieve', 'SQL mode returned expected result');
    } else {
      log('FAIL', 'retrieve', 'SQL result format unexpected');
    }
  } catch (e) {
    log('FAIL', 'retrieve', e.message);
  }
}

async function testReportsAndHistory() {
  console.log('\n=== E) Reports and History ===\n');

  // 11. history
  try {
    const result = await listResearchHistory({ limit: 5 });
    const lines = result.split('\n').filter(l => l.trim()).length;
    if (lines <= 10) {
      log('PASS', 'history', 'Readable history list');
    } else {
      log('ISSUE', 'history', `History too verbose (${lines} lines)`);
    }
  } catch (e) {
    log('FAIL', 'history', e.message);
  }

  // 12. get_report_content
  try {
    // Get a report ID from history first
    const historyResult = await listResearchHistory({ limit: 1 });
    const idMatch = historyResult.match(/id:\s*(\d+)/);
    
    if (idMatch && idMatch[1]) {
      const reportId = idMatch[1];
      const result = await getReportContent({ reportId, mode: 'summary', maxChars: 500 });
      
      if (result && result.length > 0 && result.length <= 600) {
        log('PASS', 'get_report_content', 'Summary mode respects maxChars');
      } else if (result.length > 600) {
        log('ISSUE', 'get_report_content', 'maxChars not respected');
      } else {
        log('FAIL', 'get_report_content', 'No content returned');
      }
    } else {
      log('ISSUE', 'get_report_content', 'No reports in history to test');
    }
  } catch (e) {
    log('FAIL', 'get_report_content', e.message);
  }
}

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('MCP Server Intuitiveness Evaluation');
  console.log('openrouter-agents');
  console.log('='.repeat(60));

  await testDiscovery();
  await testSimpleUtilities();
  await testResearchWorkflow();
  await testRetrieval();
  await testReportsAndHistory();

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`✅ PASS:  ${passCount}`);
  console.log(`❌ FAIL:  ${failCount}`);
  console.log(`⚠️  ISSUE: ${issueCount}`);

  const total = passCount + failCount + issueCount;
  const score = total > 0 ? Math.round((passCount / total) * 5) : 0;
  
  console.log(`\nIntuitiveness Score: ${score}/5`);

  // Generate improvement suggestions
  if (failCount > 0 || issueCount > 0) {
    console.log('\nSuggested Improvements:');
    let suggestions = 0;
    
    if (results.some(r => r.message.includes('verbose') || r.message.includes('lines'))) {
      console.log(`1. Reduce output verbosity for concise responses`);
      suggestions++;
    }
    
    if (results.some(r => r.status === 'FAIL')) {
      console.log(`${suggestions + 1}. Fix failing tool implementations for reliability`);
      suggestions++;
    }
    
    if (results.some(r => r.message.includes('format'))) {
      console.log(`${suggestions + 1}. Improve response format consistency`);
      suggestions++;
    }

    // Pad to 3 suggestions
    while (suggestions < 3) {
      suggestions++;
      if (suggestions === 1) console.log(`1. Enhance documentation for unclear tools`);
      else if (suggestions === 2) console.log(`2. Add more freeform input handling`);
      else if (suggestions === 3) console.log(`3. Improve error messages clarity`);
    }
  } else {
    console.log('\n🎉 Excellent! All tests passed.');
  }

  console.log('='.repeat(60));

  process.exit(failCount > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(err => {
  console.error('Fatal error in test harness:', err);
  process.exit(1);
});

