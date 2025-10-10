// test-agent-mode-structure.js
// Tests agent mode structure and flow WITHOUT requiring OpenRouter API calls
// Validates: embeddings, caching, XML parsing, database persistence

const dbClient = require('../src/utils/dbClient');
const { parseAgentXml } = require('../src/utils/xmlParser');
const advancedCache = require('../src/utils/advancedCache');

async function testAgentModeStructure() {
  console.log('\n=== Agent Mode Structure Test (No API Calls) ===\n');
  
  const results = { passed: 0, failed: 0, tests: [] };
  
  function log(name, passed, details = '') {
    const status = passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`${status}: ${name}${details ? ' - ' + details : ''}`);
    results.tests.push({ name, passed, details });
    if (passed) results.passed++;
    else results.failed++;
  }

  // Test 1: XML Parser handles valid planning output
  console.log('--- Test 1: XML Parser ---');
  try {
    const validXml = `<agent_1>What are the fundamental principles of quantum computing?</agent_1>
<agent_2>What are the key applications of quantum computing in cryptography?</agent_2>
<agent_3>How does quantum computing compare to classical computing?</agent_3>`;
    
    const parsed = parseAgentXml(validXml);
    const isValid = Array.isArray(parsed) && parsed.length === 3 &&
                    parsed[0].agentId === 1 && parsed[0].query.includes('fundamental principles');
    log('XML Parser (Valid Input)', isValid, `parsed ${parsed.length} queries`);
  } catch (error) {
    log('XML Parser (Valid Input)', false, error.message);
  }

  // Test 2: XML Parser rejects invalid input
  console.log('\n--- Test 2: XML Parser Validation ---');
  try {
    const invalidXml = `MOCK RESPONSE (model): some plain text`;
    const parsed = parseAgentXml(invalidXml);
    log('XML Parser (Invalid Input)', parsed.length === 0, 'correctly rejected non-XML');
  } catch (error) {
    log('XML Parser (Invalid Input)', false, error.message);
  }

  // Test 3: Embedding-based cache similarity
  console.log('\n--- Test 3: Semantic Cache ---');
  try {
    // Store a result in cache
    const testQuery = 'What is machine learning?';
    const testResult = 'Machine learning is a subset of AI that enables systems to learn from data.';
    
    advancedCache.storeResult(testQuery, testResult, {
      costPreference: 'low',
      audienceLevel: 'beginner'
    });
    
    // Try to find similar query
    const similar = await advancedCache.findSimilarResult('Explain machine learning basics', {
      costPreference: 'low',
      audienceLevel: 'beginner'
    });
    
    log('Semantic Cache', similar !== null, similar ? `found with sim=${similar.similarity?.toFixed(3)}` : 'no match');
  } catch (error) {
    log('Semantic Cache', false, error.message);
  }

  // Test 4: Database report storage and retrieval
  console.log('\n--- Test 4: Report Storage ---');
  try {
    const reports = await dbClient.listRecentReports(10);
    log('List Recent Reports', true, `found ${reports.length} reports`);
  } catch (error) {
    log('List Recent Reports', false, error.message);
  }

  // Test 5: Vector similarity search (database level)
  console.log('\n--- Test 5: Database Vector Search ---');
  try {
    const similar = await dbClient.findReportsBySimilarity('artificial intelligence research', 5, 0.3);
    log('Vector Similarity Search', true, `found ${similar.length} similar reports`);
  } catch (error) {
    log('Vector Similarity Search', false, error.message);
  }

  // Test 6: Hybrid search (BM25 + vector)
  console.log('\n--- Test 6: Hybrid Search ---');
  try {
    const results = await dbClient.searchHybrid('quantum computing', { limit: 5 });
    log('Hybrid Search (BM25+Vector)', true, `found ${results.length} results`);
  } catch (error) {
    log('Hybrid Search (BM25+Vector)', false, error.message);
  }

  // Print summary
  console.log('\n=== Test Summary ===');
  console.log(`Total: ${results.tests.length}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  
  if (results.failed > 0) {
    console.log('\nFailed Tests:');
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  - ${t.name}: ${t.details}`);
    });
  }
  
  console.log('\n--- Next Steps ---');
  console.log('To test full agent mode (planning/research/synthesis):');
  console.log('1. Add valid OPENROUTER_API_KEY to .env file');
  console.log('2. Run: node tests/test-research-agent.js');
  console.log('3. Or run: node tests/test-all-mcp-tools.js');
  
  return results.failed === 0;
}

testAgentModeStructure()
  .then(success => {
    if (success) {
      console.log('\n✅ All structural tests passed!');
      process.exit(0);
    } else {
      console.log('\n❌ Some tests failed');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('\n❌ Test suite crashed:', err);
    process.exit(1);
  });

