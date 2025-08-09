// test-all-mcp-tools.js - A comprehensive test script for all MCP tools

const { 
  conductResearch, 
  researchFollowUp, 
  getPastResearch, 
  rateResearchReport, 
  listResearchHistory 
} = require('./src/server/tools');

async function runTests() {
  console.log("===== Testing All MCP Tools =====\n");
  
  let reportId = null;
  const results = {
    conductResearch: false,
    researchFollowUp: false,
    getPastResearch: false,
    rateResearchReport: false,
    listResearchHistory: false
  };

  // Test 1: conductResearch
  console.log("----- Testing conduct_research -----");
  try {
    const researchResult = await conductResearch({
      query: "What is quantum computing?",
      costPreference: "low",
      audienceLevel: "intermediate",
      outputFormat: "report",
      includeSources: true
    });
    
    console.log("Result:", researchResult);
    
    // Extract reportId for use in other tests
    const match = researchResult.match(/Report ID: (\S+)/);
    if (match && match[1]) {
      reportId = match[1];
      console.log(`Extracted reportId: ${reportId}`);
    }
    
    results.conductResearch = true;
    console.log("conduct_research ✅ PASSED\n");
  } catch (error) {
    console.error("Error:", error.message);
    console.log("conduct_research ❌ FAILED\n");
  }

  // Test 2: researchFollowUp (only if conductResearch succeeded)
  if (results.conductResearch) {
    console.log("----- Testing research_follow_up -----");
    try {
      const followUpResult = await researchFollowUp({
        originalQuery: "What is quantum computing?",
        followUpQuestion: "What are the potential applications of quantum computing in cryptography?",
        costPreference: "low"
      });
      
      console.log("Result:", followUpResult);
      results.researchFollowUp = true;
      console.log("research_follow_up ✅ PASSED\n");
    } catch (error) {
      console.error("Error:", error.message);
      console.log("research_follow_up ❌ FAILED\n");
    }
  }

  // Test 3: getPastResearch
  console.log("----- Testing get_past_research -----");
  try {
    const pastResearchResult = await getPastResearch({
      query: "quantum computing",
      limit: 5,
      minSimilarity: 0.6
    });
    
    console.log("Result length:", pastResearchResult.length, "characters");
    results.getPastResearch = true;
    console.log("get_past_research ✅ PASSED\n");
  } catch (error) {
    console.error("Error:", error.message);
    console.log("get_past_research ❌ FAILED\n");
  }

  // Test 4: rateResearchReport (only if we have a reportId)
  if (reportId) {
    console.log("----- Testing rate_research_report -----");
    try {
      const ratingResult = await rateResearchReport({
        reportId: reportId,
        rating: 5,
        comment: "Excellent research report with comprehensive information."
      });
      
      console.log("Result:", ratingResult);
      results.rateResearchReport = true;
      console.log("rate_research_report ✅ PASSED\n");
    } catch (error) {
      console.error("Error:", error.message);
      console.log("rate_research_report ❌ FAILED\n");
    }
  }

  // Test 5: listResearchHistory
  console.log("----- Testing list_research_history -----");
  try {
    const historyResult = await listResearchHistory({
      limit: 10
    });
    
    console.log("Result length:", historyResult.length, "characters");
    results.listResearchHistory = true;
    console.log("list_research_history ✅ PASSED\n");
  } catch (error) {
    console.error("Error:", error.message);
    console.log("list_research_history ❌ FAILED\n");
  }

  // Print summary
  console.log("===== Test Summary =====");
  for (const [test, passed] of Object.entries(results)) {
    console.log(`${test}: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  }
  
  const overallSuccess = Object.values(results).every(result => result === true);
  console.log(`\nOverall Result: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  return overallSuccess;
}

// Run the tests
runTests().then(success => {
  console.log("\nTest execution completed.");
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error("Error during test execution:", error);
  process.exit(1);
});
