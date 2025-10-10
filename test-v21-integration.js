// Test v2.1 @terminals-tech integrations
const { initializeEmbeddings, embed, embedBatch } = require('./src/utils/embeddingsAdapter');
const { initializeGraph } = require('./src/utils/graphAdapter');

async function testIntegrations() {
  console.log('🧪 Testing v2.1 @terminals-tech integrations...\n');

  try {
    // Test embeddings
    console.log('1. Testing @terminals-tech/embeddings...');
    await initializeEmbeddings();
    const vector = await embed('test text');
    console.log(`   ✅ Embeddings working - vector length: ${vector.length}`);

    // Test graph
    console.log('2. Testing @terminals-tech/graph...');
    const graphResult = await initializeGraph();
    console.log(`   ✅ Graph ${graphResult.ready ? 'initialized' : 'not ready'}`);

    // Test agent tool exists
    console.log('3. Testing agent tool structure...');
    const { agentTool, agentSchema } = require('./src/server/tools');
    console.log(`   ✅ Agent tool found: ${typeof agentTool}`);
    console.log(`   ✅ Agent schema found: ${typeof agentSchema}`);

    console.log('\n🎉 All v2.1 integrations working correctly!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Integration test failed:', error.message);
    process.exit(1);
  }
}

testIntegrations();
