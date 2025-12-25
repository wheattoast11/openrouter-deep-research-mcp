/**
 * Sticky Clustering for Agent Memory
 * 
 * Agents naturally cluster based on communication patterns.
 * Memory is preserved through natural logging in time-travel system.
 */
class StickyCluster {
  constructor(dbClient, clusterTTL = 3600000) {
    this.dbClient = dbClient;
    this.clusterTTL = clusterTTL; // 1 hour default
  }

  async recordCommunication(sourceAgent, targetAgent, signal, weight = 1.0) {
    // Use cube for multi-dimensional affinity
    await this.dbClient.executeQuery(`
      INSERT INTO agent_communication_graph 
        (source_agent, target_agent, communication_vector, weight, timestamp)
      VALUES ($1, $2, cube(ARRAY[$3, $4, $5]), $6, NOW())
      ON CONFLICT (source_agent, target_agent)
      DO UPDATE SET 
        communication_vector = 
          cube_union(agent_communication_graph.communication_vector, EXCLUDED.communication_vector),
        weight = agent_communication_graph.weight + EXCLUDED.weight,
        timestamp = NOW()
    `, [
      sourceAgent, 
      targetAgent, 
      signal.confidence || 0.5,
      signal.complexity || 0.5,
      signal.relevance || 0.5,
      weight
    ]);
  }

  async getClusters(minAffinity = 0.6) {
    // Find tightly connected agent clusters using cube distance
    const result = await this.dbClient.executeQuery(`
      WITH agent_pairs AS (
        SELECT 
          source_agent,
          target_agent,
          cube_distance(communication_vector, cube(ARRAY[1,1,1])) as affinity,
          weight
        FROM agent_communication_graph
        WHERE timestamp > NOW() - INTERVAL '${this.clusterTTL} milliseconds'
      )
      SELECT * FROM agent_pairs
      WHERE affinity < $1
      ORDER BY affinity ASC, weight DESC
    `, [1.0 - minAffinity]);

    return this.buildClusterGraph(result.rows || []);
  }

  buildClusterGraph(edges) {
    // Union-find clustering algorithm
    const clusters = new Map();
    const parent = new Map();

    function find(x) {
      if (!parent.has(x)) parent.set(x, x);
      if (parent.get(x) !== x) {
        parent.set(x, find(parent.get(x)));
      }
      return parent.get(x);
    }

    function union(x, y) {
      const px = find(x);
      const py = find(y);
      if (px !== py) parent.set(px, py);
    }

    for (const edge of edges) {
      union(edge.source_agent, edge.target_agent);
    }

    for (const edge of edges) {
      const root = find(edge.source_agent);
      if (!clusters.has(root)) clusters.set(root, new Set());
      clusters.get(root).add(edge.source_agent);
      clusters.get(root).add(edge.target_agent);
    }

    return Array.from(clusters.values()).map(set => Array.from(set));
  }
}

module.exports = { StickyCluster };
