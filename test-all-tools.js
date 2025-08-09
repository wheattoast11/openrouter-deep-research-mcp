// test-all-tools.js
require('dotenv').config();
const { z } = require('zod');
const { 
  conductResearchSchema,
  researchFollowUpSchema,
  getPastResearchSchema,
  rateResearchReportSchema,
  listResearchHistorySchema,
  
  conductResearch,
  researchFollowUp,
  getPastResearch,
  rateResearchReport,
  listResearchHistory
} = require('./src/server/tools');

/**
 * Simple mock for MCP exchange to capture progress updates
 */
class MockExchange {
  constructor() {
    this.progressToken = 'mock-token';
    this.progressUpdates = [];
  }
  
  sendProgress(data) {
    this.progressUpdates.push(data);
    console.log(`[Progress] ${data.value?.message || JSON.stringify(data.value)}`);
  }
}

async function testAllTools() {
  console.log('\n===== Testing All MCP Tools =====\n');
  
  // Store the report ID for use in other tests
  let reportId = null;
  
  // 1. Test conductResearch (simplified)
  console.log('\n----- Testing conduct_research -----');
  try {
    const mock = new MockExchange();
    
    console.log('Calling conductResearch with simple query...');
    const researchResult = await conductResearch({
      query: "What is quantum computing?",
      costPreference: "low",
      audienceLevel: "intermediate",
      outputFormat: "report",
      includeSources: true
    }, mock);
    
    console.log(`Research result: ${researchResult}`);
    // Extract report ID for future tests
    const match = researchResult.match(/Report ID: ([^\.]+)/);
    if (match && match[1]) {
      reportId = match[1];
      console.log(`Extracted reportId: ${reportId}`);
    }
    console.log('conduct_research ✅ PASSED');
  } catch (error) {
    console.error('conduct_research ❌ FAILED:', error.message);
  }
  
  // 2. Test research_follow_up
  if (reportId) {
    console.log('\n----- Testing research_follow_up -----');
    try {
      const mock = new MockExchange();
      
      console.log('Calling researchFollowUp...');
      const followUpResult = await researchFollowUp({
        originalQuery: "What is quantum computing?",
        followUpQuestion: "How does quantum computing affect cryptography?",
        costPreference: "low"
      }, mock);
      
      console.log(`Follow-up result: ${followUpResult}`);
      console.log('research_follow_up ✅ PASSED');
    } catch (error) {
      console.error('research_follow_up ❌ FAILED:', error.message);
    }
  }
  
  // 3. Test get_past_research
  console.log('\n----- Testing get_past_research -----');
  try {
    const mock = new MockExchange();
    
    console.log('Calling getPastResearch...');
    const pastResult = await getPastResearch({
      query: "quantum computing",
      limit: 3,
      minSimilarity: 0.6
    }, mock);
    
    console.log(`Past research result length: ${pastResult.length} characters`);
    console.log('get_past_research ✅ PASSED');
  } catch (error) {
    console.error('get_past_research ❌ FAILED:', error.message);
  }
  
  // 4. Test rate_research_report
  if (reportId) {
    console.log('\n----- Testing rate_research_report -----');
    try {
      const mock = new MockExchange();
      
      console.log('Calling rateResearchReport...');
      const ratingResult = await rateResearchReport({
        reportId: reportId,
        rating: 5,
        comment: "Great report on quantum computing!"
      }, mock);
      
      console.log(`Rating result: ${ratingResult}`);
      console.log('rate_research_report ✅ PASSED');
    } catch (error) {
      console.error('rate_research_report ❌ FAILED:', error.message);
    }
  }
  
  // 5. Test list_research_history
  console.log('\n----- Testing list_research_history -----');
  try {
    const mock = new MockExchange();
    
    console.log('Calling listResearchHistory...');
    const historyResult = await listResearchHistory({
      limit: 5
    }, mock);
    
    console.log(`History result length: ${historyResult.length} characters`);
    console.log('list_research_history ✅ PASSED');
  } catch (error) {
    console.error('list_research_history ❌ FAILED:', error.message);
  }
  
  console.log('\n===== Tool Testing Complete =====');
}

// Run the tests
testAllTools().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
