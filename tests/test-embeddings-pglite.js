// test-embeddings-pglite.js
// Validates embeddings pipeline + PGlite + pgvector integration (no LLM API calls needed)

const dbClient = require('../src/utils/dbClient');
const { embed, embedBatch, isEmbeddingsReady, getDimension } = require('../src/utils/embeddingsAdapter');

async function testEmbeddingsPipeline() {
  console.log('\n=== PGlite + pgvector Embeddings Integration Test ===\n');
  
  const results = { passed: 0, failed: 0, tests: [] };
  
  function log(name, passed, details = '') {
    const status = passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`${status}: ${name}${details ? ' - ' + details : ''}`);
    results.tests.push({ name, passed, details });
    if (passed) results.passed++;
    else results.failed++;
  }

  // Test 1: Embeddings adapter initialization
  console.log('--- Test 1: Embeddings Adapter Ready ---');
  try {
    const ready = isEmbeddingsReady();
    const dim = getDimension();
    log('Embeddings Adapter', ready && dim === 384, `ready=${ready}, dimension=${dim}`);
  } catch (error) {
    log('Embeddings Adapter', false, error.message);
  }

  // Test 2: Generate single embedding
  console.log('\n--- Test 2: Generate Single Embedding ---');
  try {
    const vector = await embed('This is a test sentence for embeddings.');
    const isValid = Array.isArray(vector) && vector.length === 384 && typeof vector[0] === 'number';
    log('Single Embedding', isValid, `length=${vector?.length}, type=${typeof vector?.[0]}`);
  } catch (error) {
    log('Single Embedding', false, error.message);
  }

  // Test 3: Generate batch embeddings
  console.log('\n--- Test 3: Generate Batch Embeddings ---');
  try {
    const vectors = await embedBatch([
      'First sentence',
      'Second sentence',
      'Third sentence'
    ]);
    const isValid = Array.isArray(vectors) && vectors.length === 3 && 
                    vectors.every(v => Array.isArray(v) && v.length === 384);
    log('Batch Embeddings', isValid, `count=${vectors?.length}, all 384D=${isValid}`);
  } catch (error) {
    log('Batch Embeddings', false, error.message);
  }

  // Test 4: PGlite vector storage
  console.log('\n--- Test 4: PGlite Vector Storage ---');
  try {
    const testText = 'PGlite is an embeddable Postgres database with pgvector support.';
    const embedding = await dbClient.generateEmbedding(testText);
    const isValid = embedding && Array.isArray(embedding) && embedding.length === 384;
    log('Generate Embedding via dbClient', isValid, `dimension=${embedding?.length}`);
  } catch (error) {
    log('Generate Embedding via dbClient', false, error.message);
  }

  // Test 5: Vector similarity search
  console.log('\n--- Test 5: Vector Similarity Search ---');
  try {
    // First, ensure we have at least one report with embeddings
    const reports = await dbClient.listRecentReports(1);
    console.log(`  Found ${reports.length} existing reports in database`);
    
    // Test similarity search (will work even with 0 results)
    const similar = await dbClient.findReportsBySimilarity('quantum computing technology', 5, 0.3);
    log('Vector Similarity Search', true, `found ${similar.length} similar reports`);
  } catch (error) {
    log('Vector Similarity Search', false, error.message);
  }

  // Test 6: Cosine similarity calculation
  console.log('\n--- Test 6: Cosine Similarity Math ---');
  try {
    const vec1 = await embed('artificial intelligence');
    const vec2 = await embed('machine learning');
    const vec3 = await embed('banana recipe');
    
    // Calculate similarities manually
    const sim12 = cosineSimilarity(vec1, vec2);
    const sim13 = cosineSimilarity(vec1, vec3);
    
    const isValid = sim12 > sim13 && sim12 > 0.5 && sim13 < 0.5;
    log('Cosine Similarity', isValid, `AI-ML=${sim12.toFixed(3)}, AI-Banana=${sim13.toFixed(3)}`);
  } catch (error) {
    log('Cosine Similarity', false, error.message);
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
  
  return results.failed === 0;
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

testEmbeddingsPipeline()
  .then(success => {
    if (success) {
      console.log('\n✅ All embeddings + PGlite tests passed!');
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

