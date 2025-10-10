// Test @terminals-tech/embeddings exports
try {
  const emb = require('@terminals-tech/embeddings');
  console.log('@terminals-tech/embeddings exports:');
  Object.keys(emb).forEach(key => {
    console.log(`  ${key}: ${typeof emb[key]}`);
  });
} catch (error) {
  console.error('Error loading @terminals-tech/embeddings:', error.message);
}

try {
  const graph = require('@terminals-tech/graph');
  console.log('@terminals-tech/graph exports:');
  Object.keys(graph).forEach(key => {
    console.log(`  ${key}: ${typeof graph[key]}`);
  });
} catch (error) {
  console.error('Error loading @terminals-tech/graph:', error.message);
}

