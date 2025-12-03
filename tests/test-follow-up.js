// test-follow-up.js - A simple script to test the research_follow_up function

const { researchFollowUp } = require('../src/server/tools');

async function testFollowUp() {
  console.log("Testing research_follow_up with basic parameters...");
  
  try {
    const result = await researchFollowUp({
      originalQuery: "What is quantum computing?",
      followUpQuestion: "What are the potential applications of quantum computing in cryptography?",
      costPreference: "low"
    });
    
    console.log("Success! Result:", result);
    return true;
  } catch (error) {
    console.error("Error:", error.message);
    return false;
  }
}

// Run the test
testFollowUp().then(success => {
  if (success) {
    console.log("Test completed successfully!");
  } else {
    console.log("Test failed.");
    process.exit(1);
  }
});
