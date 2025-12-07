/**
 * Graph Handlers
 *
 * Consolidated handlers for: graph_traverse, graph_path, graph_clusters,
 * graph_pagerank, graph_patterns, graph_stats
 *
 * Integrates with knowledge graph for relationship discovery.
 */

const { normalize } = require('../../core/normalize');

/**
 * Unified graph handler
 *
 * Operations: traverse, path, clusters, pagerank, patterns, stats
 */
async function handleGraph(op, params, context = {}) {
  const normalized = normalize('graph', params);
  const { graphClient, dbClient } = context;

  // Use graphClient if available, otherwise fall back to dbClient
  const client = graphClient || dbClient;

  if (!client) {
    throw new Error('Graph or database client not available');
  }

  switch (op) {
    case 'traverse':
      return traverseGraph(normalized, client);
    case 'path':
      return findPath(normalized, client);
    case 'clusters':
      return findClusters(normalized, client);
    case 'pagerank':
    case 'rank':
      return getPageRank(normalized, client);
    case 'patterns':
      return findPatterns(normalized, client);
    case 'stats':
      return getGraphStats(client);
    default:
      throw new Error(`Unknown graph operation: ${op}`);
  }
}

/**
 * Traverse graph from starting node
 */
async function traverseGraph(params, client) {
  const { startNode, node, depth = 3, strategy = 'semantic' } = params;
  const start = startNode || node;

  if (!start) {
    throw new Error('startNode is required');
  }

  // Parse node format: "report:5" or "doc:123"
  const [nodeType, nodeId] = start.includes(':') ? start.split(':') : ['report', start];

  if (typeof client.traverseGraph === 'function') {
    const result = await client.traverseGraph(nodeType, nodeId, depth, strategy);
    return formatTraversalResult(start, result, strategy);
  }

  // Fallback: simple SQL-based traversal
  const nodes = await fallbackTraversal(client, nodeType, nodeId, depth);
  return formatTraversalResult(start, nodes, 'sql-fallback');
}

/**
 * Find path between two nodes
 */
async function findPath(params, client) {
  const { from, to } = params;

  if (!from || !to) {
    throw new Error('Both from and to parameters are required');
  }

  if (typeof client.findPath === 'function') {
    const path = await client.findPath(from, to);
    return {
      from,
      to,
      pathFound: path && path.length > 0,
      pathLength: path?.length || 0,
      path: path || [],
      message: path?.length > 0
        ? `Found path with ${path.length} steps`
        : 'No path found between nodes'
    };
  }

  // Fallback: no path finding available
  return {
    from,
    to,
    pathFound: false,
    message: 'Path finding not available (no graph client)'
  };
}

/**
 * Find node clusters
 */
async function findClusters(params, client) {
  if (typeof client.findClusters === 'function') {
    const clusters = await client.findClusters();
    return {
      clusterCount: clusters?.length || 0,
      clusters: (clusters || []).map((c, i) => ({
        id: i,
        size: c.nodes?.length || c.size || 0,
        label: c.label || `Cluster ${i + 1}`,
        nodes: c.nodes?.slice(0, 10) || []  // Limit to first 10 nodes per cluster
      }))
    };
  }

  // Fallback: group by topic similarity
  return {
    clusterCount: 0,
    clusters: [],
    message: 'Clustering not available (no graph client)'
  };
}

/**
 * Get PageRank importance scores
 */
async function getPageRank(params, client) {
  const { topK = 20 } = params;

  if (typeof client.getPageRank === 'function') {
    const rankings = await client.getPageRank(topK);
    return {
      topK,
      rankings: rankings || [],
      message: `Top ${topK} nodes by importance`
    };
  }

  // Fallback: use report ratings or access count
  if (typeof client.query === 'function') {
    const sql = `
      SELECT id, query, rating,
             COALESCE(rating, 0) as importance
      FROM research_reports
      ORDER BY importance DESC, created_at DESC
      LIMIT $1
    `;
    const rows = await client.query(sql, [topK]);
    return {
      topK,
      rankings: (rows || []).map((r, i) => ({
        rank: i + 1,
        nodeId: `report:${r.id}`,
        label: r.query?.substring(0, 50) || `Report ${r.id}`,
        score: r.importance || 0
      })),
      message: 'Rankings based on report ratings (PageRank not available)'
    };
  }

  return {
    topK,
    rankings: [],
    message: 'PageRank not available'
  };
}

/**
 * Find event patterns (N-grams)
 */
async function findPatterns(params, client) {
  const { n = 3 } = params;

  if (typeof client.findPatterns === 'function') {
    const patterns = await client.findPatterns(n);
    return {
      n,
      patternCount: patterns?.length || 0,
      patterns: patterns || []
    };
  }

  // Fallback: analyze query patterns
  if (typeof client.query === 'function') {
    const sql = `
      SELECT query, COUNT(*) as frequency
      FROM research_reports
      GROUP BY query
      HAVING COUNT(*) > 1
      ORDER BY frequency DESC
      LIMIT 20
    `;
    const rows = await client.query(sql, []);
    return {
      n,
      patternCount: rows?.length || 0,
      patterns: (rows || []).map(r => ({
        pattern: r.query?.substring(0, 100),
        frequency: parseInt(r.frequency)
      })),
      message: 'Patterns based on repeated queries (N-gram analysis not available)'
    };
  }

  return {
    n,
    patternCount: 0,
    patterns: [],
    message: 'Pattern analysis not available'
  };
}

/**
 * Get graph statistics
 */
async function getGraphStats(client) {
  const stats = {
    available: false,
    nodeCount: 0,
    edgeCount: 0,
    reportCount: 0,
    docCount: 0
  };

  if (typeof client.getGraphStats === 'function') {
    const graphStats = await client.getGraphStats();
    return {
      available: true,
      ...graphStats
    };
  }

  // Fallback: count from database
  if (typeof client.query === 'function') {
    try {
      const reportCount = await client.query('SELECT COUNT(*) as count FROM research_reports', []);
      stats.reportCount = parseInt(reportCount?.[0]?.count) || 0;

      const docCount = await client.query('SELECT COUNT(*) as count FROM doc_index', []);
      stats.docCount = parseInt(docCount?.[0]?.count) || 0;

      stats.nodeCount = stats.reportCount + stats.docCount;
      stats.available = true;
    } catch (e) {
      stats.error = e.message;
    }
  }

  return stats;
}

/**
 * Format traversal result
 */
function formatTraversalResult(startNode, nodes, strategy) {
  return {
    startNode,
    strategy,
    nodeCount: nodes?.length || 0,
    nodes: (nodes || []).map(n => ({
      id: n.id || n.nodeId,
      type: n.type || 'unknown',
      label: n.label || n.title || n.query?.substring(0, 50),
      depth: n.depth || 0,
      similarity: n.similarity
    }))
  };
}

/**
 * Fallback traversal using SQL
 */
async function fallbackTraversal(client, nodeType, nodeId, depth) {
  if (typeof client.query !== 'function') {
    return [];
  }

  // Simple: get related reports based on query similarity
  const sql = `
    SELECT r.id, r.query, 'report' as type
    FROM research_reports r
    WHERE r.id != $1
    ORDER BY r.created_at DESC
    LIMIT $2
  `;

  const rows = await client.query(sql, [nodeId, depth * 5]);

  return (rows || []).map((r, i) => ({
    id: `report:${r.id}`,
    type: r.type,
    label: r.query?.substring(0, 50),
    depth: Math.floor(i / 5) + 1
  }));
}

/**
 * Legacy compatibility wrappers
 */
const graphTraverse = (params, ctx) => handleGraph('traverse', params, ctx);
const graphPath = (params, ctx) => handleGraph('path', params, ctx);
const graphClusters = (params, ctx) => handleGraph('clusters', params, ctx);
const graphPagerank = (params, ctx) => handleGraph('pagerank', params, ctx);
const graphPatterns = (params, ctx) => handleGraph('patterns', params, ctx);
const graphStats = (params, ctx) => handleGraph('stats', params, ctx);

module.exports = {
  handleGraph,
  traverseGraph,
  findPath,
  findClusters,
  getPageRank,
  findPatterns,
  getGraphStats,
  // Legacy exports
  graphTraverse,
  graphPath,
  graphClusters,
  graphPagerank,
  graphPatterns,
  graphStats
};
