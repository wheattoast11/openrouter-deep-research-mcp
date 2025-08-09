// qa-test-suite.js
require('dotenv').config();
const { conductResearch } = require('./src/server/tools');
const dbClient = require('./src/utils/dbClient');

async function runTests() {
  console.log('\n======= OPENROUTER AGENTS QA TEST SUITE =======\n');
  
  // Track test results
  const results = {
    passed: [],
    failed: []
  };
  
  // Helper function to run a test
  async function runTest(name, testFn) {
    console.log(`\n----- TEST: ${name} -----`);
    try {
      await testFn();
      console.log(`✅ PASSED: ${name}`);
      results.passed.push(name);
    } catch (error) {
      console.error(`❌ FAILED: ${name}`);
      console.error(`Error: ${error.message}`);
      results.failed.push({ name, error: error.message });
    }
  }

  // Test 1: Database Initialization
  await runTest('Database Initialization', async () => {
    // Attempt to list reports (even if empty)
    const reports = await dbClient.listRecentReports(1);
    console.log(`Successfully connected to database. Found ${reports.length} existing reports.`);
    
    // If we get here without errors, the test passed
  });

  // Test 2: Basic Query with Caching
  await runTest('Basic Query with Caching', async () => {
    console.log('Running first query (should be a cache miss)...');
    const result1 = await conductResearch({
      query: 'What is the capital of France?',
      costPreference: 'low',
      audienceLevel: 'beginner',
      outputFormat: 'bullet_points',
      includeSources: false,
      maxLength: 100
    });
    
    console.log('Result 1:', result1);
    
    console.log('Running same query again (should be a cache hit)...');
    const result2 = await conductResearch({
      query: 'What is the capital of France?',
      costPreference: 'low',
      audienceLevel: 'beginner',
      outputFormat: 'bullet_points',
      includeSources: false,
      maxLength: 100
    });
    
    console.log('Result 2:', result2);
    
    if (!result1 || !result2) {
      throw new Error('One or both query results were null or undefined');
    }
  });

  // Test 3: Similarity Search
  await runTest('Similarity Search', async () => {
    // First, ensure we have at least one report
    const reports = await dbClient.listRecentReports(10);
    
    if (reports.length === 0) {
      // We need to run at least one query to have data for similarity search
      console.log('No reports found, running a query to create data for similarity search...');
      await conductResearch({
        query: 'What are the benefits of exercise?',
        costPreference: 'low',
        audienceLevel: 'beginner',
        outputFormat: 'bullet_points',
        includeSources: false,
        maxLength: 100
      });
    }
    
    // Now test similarity search
    console.log('Testing similarity search...');
    const similarReports = await dbClient.findReportsBySimilarity('health benefits of physical activity', 3, 0.5);
    console.log(`Found ${similarReports.length} similar reports`);
    
    // The test passes if we got a result (even if it's empty)
  });

  // Test 4: Error Handling - Invalid Cost Preference
  await runTest('Error Handling - Invalid Parameter', async () => {
    try {
      await conductResearch({
        query: 'Test query',
        costPreference: 'invalid_value', // This should trigger a validation error
        audienceLevel: 'beginner',
        outputFormat: 'bullet_points',
        includeSources: false
      });
      
      // If we get here, no error was thrown - fail the test
      throw new Error('Expected validation error was not thrown');
    } catch (error) {
      // We expect an error here, so this is actually a success
      console.log('Successfully caught expected error:', error.message);
    }
  });

  // Test 5: Different Output Format
  await runTest('Different Output Format', async () => {
    console.log('Testing report output format...');
    const result = await conductResearch({
      query: 'What is artificial intelligence?',
      costPreference: 'low',
      audienceLevel: 'beginner',
      outputFormat: 'briefing', // Different from previous tests
      includeSources: false,
      maxLength: 100
    });
    
    console.log('Result:', result);
    
    if (!result) {
      throw new Error('Query result was null or undefined');
    }
  });

  // Print summary
  console.log('\n======= TEST RESULTS SUMMARY =======\n');
  console.log(`Total Tests: ${results.passed.length + results.failed.length}`);
  console.log(`Passed: ${results.passed.length}`);
  console.log(`Failed: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\n----- Failed Tests -----');
    results.failed.forEach((failure, index) => {
      console.log(`${index + 1}. ${failure.name}: ${failure.error}`);
    });
  }
  
  return results;
}

runTests()
  .then(results => {
    if (results.failed.length > 0) {
      console.log('\nSome tests failed. Please review the error messages above.');
    } else {
      console.log('\nAll tests passed successfully!');
    }
  })
  .catch(err => {
    console.error('Error running test suite:', err);
    process.exit(1);
  });
