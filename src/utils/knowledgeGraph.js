// src/utils/knowledgeGraph.js
// Knowledge Graph integration using @terminals-tech/graph
// Provides explicit graph structure from research reports with relation extraction

const config = require('../../config');

let GraphProcessor, TextGraph, PatternMatcher;
let graphInitialized = false;

// Lazy load @terminals-tech/graph
async function initGraphModule() {
  if (graphInitialized) return true;
  try {
    const graphModule = await import('@terminals-tech/graph');
    GraphProcessor = graphModule.GraphProcessor;
    TextGraph = graphModule.TextGraph;
    PatternMatcher = graphModule.PatternMatcher;
    graphInitialized = true;
    process.stderr.write(`[${new Date().toISOString()}] @terminals-tech/graph initialized successfully.\n`);
    return true;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to initialize @terminals-tech/graph:`, err);
    return false;
  }
}

class KnowledgeGraph {
  constructor(dbClient) {
    this.dbClient = dbClient;
    this.processor = null;
    this.textGraph = null;
    this.patternMatcher = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return true;

    const ready = await initGraphModule();
    if (!ready) return false;

    this.processor = new GraphProcessor();
    this.textGraph = new TextGraph();
    this.patternMatcher = new PatternMatcher();
    this.initialized = true;

    // Ensure graph tables exist in PGLite
    await this.ensureSchema();
    return true;
  }

  async ensureSchema() {
    const db = this.dbClient;
    if (!db || !db.executeQuery) {
      console.error('[KnowledgeGraph] dbClient not available for schema creation');
      return;
    }

    try {
      // Graph nodes table
      await db.executeQuery(`
        CREATE TABLE IF NOT EXISTS graph_nodes (
          id TEXT PRIMARY KEY,
          node_type TEXT NOT NULL,
          source_id TEXT,
          title TEXT,
          description TEXT,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `, []);

      // Graph edges table with relationship types
      await db.executeQuery(`
        CREATE TABLE IF NOT EXISTS graph_edges (
          id SERIAL PRIMARY KEY,
          source_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
          target_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
          edge_type TEXT NOT NULL,
          weight FLOAT DEFAULT 1.0,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(source_id, target_id, edge_type)
        );
      `, []);

      // Indexes for efficient traversal
      await db.executeQuery(`CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id);`, []);
      await db.executeQuery(`CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id);`, []);
      await db.executeQuery(`CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON graph_edges(edge_type);`, []);
      await db.executeQuery(`CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(node_type);`, []);

      process.stderr.write(`[${new Date().toISOString()}] Knowledge graph schema created/verified.\n`);
    } catch (err) {
      console.error('[KnowledgeGraph] Schema creation error:', err);
    }
  }

  /**
   * Index a research report into the knowledge graph
   * Extracts relations from report content and creates graph structure
   */
  async indexReport(report) {
    if (!this.initialized) await this.initialize();
    if (!this.initialized) return null;

    const nodeId = `report:${report.id}`;
    const title = report.original_query?.slice(0, 200) || 'Untitled Report';
    const content = report.final_report || '';

    try {
      // Extract relations from report content using TextGraph
      const relations = this.textGraph.extractRelations(content.slice(0, 10000));

      // Build internal graph representation
      const node = {
        id: nodeId,
        type: 'report',
        description: title
      };
      this.processor.addEvent(node, relations);

      // Persist node to PGLite
      await this.dbClient.executeQuery(`
        INSERT INTO graph_nodes (id, node_type, source_id, title, description, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          metadata = EXCLUDED.metadata
      `, [
        nodeId,
        'report',
        String(report.id),
        title,
        content.slice(0, 500),
        JSON.stringify({
          relations: relations.slice(0, 50),
          parameters: report.parameters,
          created_at: report.created_at
        })
      ]);

      // Create edges for extracted relations
      for (const rel of relations.slice(0, 20)) {
        if (rel.target) {
          const targetId = `entity:${rel.target.toLowerCase().replace(/\s+/g, '_')}`;

          // Ensure target node exists
          await this.dbClient.executeQuery(`
            INSERT INTO graph_nodes (id, node_type, title, description)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO NOTHING
          `, [targetId, 'entity', rel.target, rel.context || '']);

          // Create edge
          await this.dbClient.executeQuery(`
            INSERT INTO graph_edges (source_id, target_id, edge_type, weight, metadata)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (source_id, target_id, edge_type) DO UPDATE SET
              weight = graph_edges.weight + 0.1,
              metadata = EXCLUDED.metadata
          `, [nodeId, targetId, rel.type || 'related', rel.confidence || 1.0, JSON.stringify(rel)]);
        }
      }

      return { nodeId, relationsExtracted: relations.length };
    } catch (err) {
      console.error('[KnowledgeGraph] Error indexing report:', err);
      return null;
    }
  }

  /**
   * Traverse the knowledge graph from a starting node
   * @param {string} startId - Starting node ID (e.g., 'report:5')
   * @param {number} depth - Maximum traversal depth
   * @param {string} strategy - Traversal strategy: 'bfs', 'dfs', or 'semantic'
   */
  async traverse(startId, depth = 3, strategy = 'semantic') {
    if (!this.initialized) await this.initialize();
    if (!this.initialized) return { nodes: [], edges: [] };

    try {
      // Get subgraph from in-memory processor
      const subgraph = this.processor.getSubgraph(startId, depth);

      // Also query PGLite for persisted relationships
      const dbEdges = await this.dbClient.executeQuery(`
        WITH RECURSIVE traversal AS (
          SELECT source_id, target_id, edge_type, weight, 1 as depth
          FROM graph_edges
          WHERE source_id = $1

          UNION ALL

          SELECT e.source_id, e.target_id, e.edge_type, e.weight, t.depth + 1
          FROM graph_edges e
          JOIN traversal t ON e.source_id = t.target_id
          WHERE t.depth < $2
        )
        SELECT DISTINCT source_id, target_id, edge_type, weight
        FROM traversal
        ORDER BY weight DESC
        LIMIT 100
      `, [startId, depth]);

      const nodes = new Set([startId]);
      const edges = [];

      for (const row of dbEdges.rows || []) {
        nodes.add(row.source_id);
        nodes.add(row.target_id);
        edges.push({
          source: row.source_id,
          target: row.target_id,
          type: row.edge_type,
          weight: row.weight
        });
      }

      // Get node details
      const nodeIds = Array.from(nodes);
      const nodeDetails = await this.dbClient.executeQuery(`
        SELECT id, node_type, title, description, metadata
        FROM graph_nodes
        WHERE id = ANY($1)
      `, [nodeIds]);

      return {
        nodes: (nodeDetails.rows || []).map(n => ({
          id: n.id,
          type: n.node_type,
          title: n.title,
          description: n.description,
          metadata: n.metadata
        })),
        edges,
        strategy,
        startNode: startId,
        depth
      };
    } catch (err) {
      console.error('[KnowledgeGraph] Traverse error:', err);
      return { nodes: [], edges: [], error: err.message };
    }
  }

  /**
   * Find shortest path between two nodes
   */
  async findPath(fromId, toId) {
    if (!this.initialized) await this.initialize();

    try {
      // Use in-memory processor for path finding
      const path = this.processor.findPath(fromId, toId);

      if (path && path.length > 0) {
        return { path, found: true };
      }

      // Fallback to database BFS
      const result = await this.dbClient.executeQuery(`
        WITH RECURSIVE path AS (
          SELECT source_id, target_id, ARRAY[source_id, target_id] as nodes, 1 as depth
          FROM graph_edges
          WHERE source_id = $1

          UNION ALL

          SELECT e.source_id, e.target_id, p.nodes || e.target_id, p.depth + 1
          FROM graph_edges e
          JOIN path p ON e.source_id = p.target_id
          WHERE NOT e.target_id = ANY(p.nodes)
            AND p.depth < 10
        )
        SELECT nodes FROM path WHERE $2 = ANY(nodes) LIMIT 1
      `, [fromId, toId]);

      if (result.rows?.length > 0) {
        return { path: result.rows[0].nodes, found: true };
      }

      return { path: [], found: false };
    } catch (err) {
      console.error('[KnowledgeGraph] Path finding error:', err);
      return { path: [], found: false, error: err.message };
    }
  }

  /**
   * Find clusters in the knowledge graph
   */
  async getClusters() {
    if (!this.initialized) await this.initialize();

    try {
      const clusters = this.processor.findClusters();
      return { clusters, count: clusters?.length || 0 };
    } catch (err) {
      console.error('[KnowledgeGraph] Clustering error:', err);
      return { clusters: [], count: 0, error: err.message };
    }
  }

  /**
   * Calculate PageRank for all nodes
   */
  async getPageRank(topK = 20) {
    if (!this.initialized) await this.initialize();

    try {
      const rankings = this.processor.calculatePageRank();

      // Sort and return top K
      const sorted = Object.entries(rankings || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, topK)
        .map(([id, score]) => ({ id, score }));

      return { rankings: sorted, totalNodes: Object.keys(rankings || {}).length };
    } catch (err) {
      console.error('[KnowledgeGraph] PageRank error:', err);
      return { rankings: [], totalNodes: 0, error: err.message };
    }
  }

  /**
   * Find patterns in event sequences using PatternMatcher
   */
  async findPatterns(n = 3) {
    if (!this.initialized) await this.initialize();

    try {
      // Get recent events from database
      const events = await this.dbClient.executeQuery(`
        SELECT id, node_type as type, description
        FROM graph_nodes
        ORDER BY created_at DESC
        LIMIT 100
      `, []);

      const eventList = (events.rows || []).map(e => ({
        id: e.id,
        type: e.type,
        description: e.description
      }));

      const patterns = this.patternMatcher.extractPatterns(eventList, n);
      const anomalies = this.patternMatcher.detectAnomalies(eventList);
      const predictions = this.patternMatcher.predictNext(eventList);

      return {
        patterns: patterns?.slice(0, 20) || [],
        anomalies: anomalies?.slice(0, 10) || [],
        predictions: predictions?.slice(0, 5) || []
      };
    } catch (err) {
      console.error('[KnowledgeGraph] Pattern finding error:', err);
      return { patterns: [], anomalies: [], predictions: [], error: err.message };
    }
  }

  /**
   * Get graph statistics
   */
  async getStats() {
    try {
      const nodeCount = await this.dbClient.executeQuery(`SELECT COUNT(*) as count FROM graph_nodes`, []);
      const edgeCount = await this.dbClient.executeQuery(`SELECT COUNT(*) as count FROM graph_edges`, []);
      const typeDistribution = await this.dbClient.executeQuery(`
        SELECT node_type, COUNT(*) as count FROM graph_nodes GROUP BY node_type
      `, []);

      return {
        nodeCount: nodeCount.rows?.[0]?.count || 0,
        edgeCount: edgeCount.rows?.[0]?.count || 0,
        typeDistribution: (typeDistribution.rows || []).reduce((acc, r) => {
          acc[r.node_type] = Number(r.count);
          return acc;
        }, {})
      };
    } catch (err) {
      return { nodeCount: 0, edgeCount: 0, typeDistribution: {}, error: err.message };
    }
  }
}

// Singleton instance
let knowledgeGraphInstance = null;

function getKnowledgeGraph(dbClient) {
  if (!knowledgeGraphInstance) {
    knowledgeGraphInstance = new KnowledgeGraph(dbClient);
  }
  return knowledgeGraphInstance;
}

module.exports = {
  KnowledgeGraph,
  getKnowledgeGraph
};
