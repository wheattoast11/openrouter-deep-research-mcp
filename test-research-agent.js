// test-research-agent.js
require('dotenv').config();
const { conductResearch } = require('./src/server/tools');

// Enable more detailed debug logging
process.env.DEBUG = 'true';

async function testResearchAgent() {
  console.log('\n=== Testing OpenRouter Research Agents ===\n');
  console.log('Testing simple query with low-cost models...');
  console.log('Using OpenRouter API Key:', process.env.OPENROUTER_API_KEY ? 'API Key found (hidden for security)' : 'API Key missing!');
  
  try {
    // A very simple test query to minimize tokens and time
    const result = await conductResearch({
      query: 'Explain what PGLite is in one sentence',
      costPreference: 'low',
      audienceLevel: 'beginner',
      outputFormat: 'bullet_points',
      includeSources: false,
      maxLength: 100
    });
    
    console.log('\n=== Result ===\n');
    console.log(result);
    console.log('\n=== Test Completed Successfully ===\n');
  } catch (error) {
    console.error('\n=== Test Failed ===\n');
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

testResearchAgent().catch(err => {
  console.error('Unhandled error in test:', err);
  process.exit(1);
});
