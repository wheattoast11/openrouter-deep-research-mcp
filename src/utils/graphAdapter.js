// src/utils/graphAdapter.js
// Adapter for @terminals-tech/graph integration

const config = require('../../config');
const dbClient = require('./dbClient');

let graphClient = null;
let isGraphReady = false;

async function initializeGraph() {
  if (isGraphReady && graphClient) {
    return { ready: true };
  }

  // Check feature flags
  if (!config.features.terminalsTechGraph) {
    return { ready: false, reason: '@terminals-tech graph disabled by feature flag' };
  }

  if (!config.features.graphEnrichment) {
    return { ready: false, reason: 'Graph enrichment disabled by feature flag' };
  }

  try {
    const db = dbClient.getDbInstance();
    if (!db) {
      throw new Error('Database not initialized, cannot create graph client.');
    }

    const { TextGraph } = await import('@terminals-tech/graph');

    // Create TextGraph with database connection
    const graph = new TextGraph({
      db: db,
      // Use the same vector dimension as embeddings
      embeddingDimension: config.embeddings?.dimension || 768
    });

    graphClient = graph;
    isGraphReady = true;

    process.stderr.write(`[${new Date().toISOString()}] ✓ Graph adapter initialized\n`);

    return { ready: true };
  } catch (error) {
    process.stderr.write(`[${new Date().toISOString()}] ❌ Graph adapter initialization failed: ${error.message}\n`);
    return { ready: false, reason: error.message };
  }
}

async function expandQueryWithGraph(queryText, maxExpansion = 5) {
  if (!isGraphReady || !graphClient) {
    await initializeGraph();
    if (!isGraphReady || !graphClient) {
      return [queryText]; // Return original if graph not available
    }
  }

  try {
    // Extract potential entities from query (simple NER-like approach)
    const terms = queryText.toLowerCase().split(/\s+/).filter(t => t.length > 3);

    const expanded = new Set([queryText]);
    let foundNeighbors = 0;

    for (const term of terms) {
      if (foundNeighbors >= maxExpansion) break;

      try {
        // Find entities matching this term
        const entities = await graphClient.findEntities(term);

        for (const entity of entities.slice(0, 2)) {
          // Get neighbors (related entities)
          const neighbors = await graphClient.getNeighbors(entity.id, { limit: 2 });

          for (const neighbor of neighbors) {
            if (foundNeighbors >= maxExpansion) break;

            // Add neighbor name as expanded query term
            if (neighbor.name) {
              expanded.add(neighbor.name);
              foundNeighbors++;
            }
          }
        }
      } catch (error) {
        // Skip on error, continue with other terms
        continue;
      }
    }

    return Array.from(expanded);
  } catch (error) {
    process.stderr.write(`[${new Date().toISOString()}] ❌ Graph expansion failed: ${error.message}\n`);
    return [queryText]; // Fallback to original query
  }
}

async function addEntity(entityName, entityType = 'concept', properties = {}) {
  if (!isGraphReady || !graphClient) {
    await initializeGraph();
    if (!isGraphReady || !graphClient) {
      return null;
    }
  }

  try {
    return await graphClient.addEntity({
      name: entityName,
      type: entityType,
      properties: properties
    });
  } catch (error) {
    process.stderr.write(`[${new Date().toISOString()}] ❌ Failed to add entity: ${error.message}\n`);
    return null;
  }
}

async function addRelation(sourceEntity, targetEntity, relationType, properties = {}) {
  if (!isGraphReady || !graphClient) {
    await initializeGraph();
    if (!isGraphReady || !graphClient) {
      return null;
    }
  }

  try {
    return await graphClient.addRelation({
      source: sourceEntity,
      target: targetEntity,
      type: relationType,
      properties: properties
    });
  } catch (error) {
    process.stderr.write(`[${new Date().toISOString()}] ❌ Failed to add relation: ${error.message}\n`);
    return null;
  }
}

module.exports = {
  initializeGraph,
  expandQueryWithGraph,
  addEntity,
  addRelation
};
