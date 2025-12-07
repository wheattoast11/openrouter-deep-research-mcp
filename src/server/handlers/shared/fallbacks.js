/**
 * Consolidated Fallback Implementations
 *
 * Fallback functions when primary capabilities are unavailable.
 * Provides graceful degradation for handlers.
 *
 * @module server/handlers/shared/fallbacks
 */

'use strict';

/**
 * Fallback search implementation using basic SQL queries.
 *
 * @param {Object} dbClient - Database client with query method
 * @param {string} query - Search query text
 * @param {number} [k=10] - Maximum results to return
 * @param {string} [scope='both'] - Scope: 'both', 'reports', or 'docs'
 * @returns {Promise<Array>} Search results
 *
 * @example
 * const results = await fallbackSearch(dbClient, 'AI safety', 5, 'reports');
 */
async function fallbackSearch(dbClient, query, k = 10, scope = 'both') {
  if (typeof dbClient?.query !== 'function') {
    return [];
  }

  const results = [];
  const searchPattern = `%${query}%`;

  // Search reports
  if (scope !== 'docs') {
    try {
      const reports = await dbClient.query(
        `SELECT id, original_query as title, 'report' as type,
                SUBSTRING(final_report, 1, 500) as content
         FROM research_reports
         WHERE original_query ILIKE $1 OR final_report ILIKE $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [searchPattern, k]
      );
      if (Array.isArray(reports)) {
        results.push(...reports.map(r => ({
          ...r,
          source: 'report',
          score: 0.5  // No ranking in fallback
        })));
      }
    } catch (e) {
      // Ignore errors, continue with other sources
    }
  }

  // Search docs
  if (scope !== 'reports') {
    try {
      const docs = await dbClient.query(
        `SELECT source_id as id, title, 'doc' as type,
                SUBSTRING(content, 1, 500) as content
         FROM doc_index
         WHERE title ILIKE $1 OR content ILIKE $1
         LIMIT $2`,
        [searchPattern, k]
      );
      if (Array.isArray(docs)) {
        results.push(...docs.map(d => ({
          ...d,
          source: 'doc',
          score: 0.5
        })));
      }
    } catch (e) {
      // Ignore errors
    }
  }

  return results.slice(0, k);
}

/**
 * Fallback graph traversal using basic SQL.
 *
 * @param {Object} dbClient - Database client
 * @param {string} nodeType - Node type (e.g., 'report')
 * @param {string|number} nodeId - Node identifier
 * @param {number} [depth=3] - Traversal depth
 * @returns {Promise<Array>} Traversal results
 */
async function fallbackTraversal(dbClient, nodeType, nodeId, depth = 3) {
  if (typeof dbClient?.query !== 'function') {
    return [];
  }

  try {
    // Simple fallback: return related reports by recency
    const rows = await dbClient.query(
      `SELECT id, original_query, 'report' as type
       FROM research_reports
       WHERE id != $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [nodeId, depth * 5]
    );

    return (rows || []).map((r, i) => ({
      id: `report:${r.id}`,
      type: r.type,
      label: r.original_query?.substring(0, 50),
      depth: Math.floor(i / 5) + 1
    }));
  } catch (e) {
    return [];
  }
}

/**
 * Fallback path finding (returns empty - no path without graph).
 *
 * @param {Object} dbClient - Database client
 * @param {string} fromNode - Source node
 * @param {string} toNode - Target node
 * @returns {Promise<Object>} Path result (empty in fallback)
 */
async function fallbackPath(dbClient, fromNode, toNode) {
  // Without a proper graph, we can't find paths
  return {
    path: [],
    found: false,
    message: 'Graph client not available; path finding requires graph support'
  };
}

/**
 * Fallback cluster detection.
 *
 * @param {Object} dbClient - Database client
 * @returns {Promise<Array>} Clusters (empty in fallback)
 */
async function fallbackClusters(dbClient) {
  // Clustering requires graph algorithms
  return {
    clusters: [],
    message: 'Cluster detection requires graph client'
  };
}

/**
 * Fallback PageRank calculation.
 *
 * @param {Object} dbClient - Database client
 * @param {number} [topK=20] - Top K results
 * @returns {Promise<Array>} Ranked nodes (by recency in fallback)
 */
async function fallbackPageRank(dbClient, topK = 20) {
  if (typeof dbClient?.query !== 'function') {
    return [];
  }

  try {
    const rows = await dbClient.query(
      `SELECT id, original_query as label,
              1.0 / (ROW_NUMBER() OVER (ORDER BY created_at DESC)) as score
       FROM research_reports
       ORDER BY created_at DESC
       LIMIT $1`,
      [topK]
    );

    return (rows || []).map(r => ({
      id: `report:${r.id}`,
      label: r.label,
      score: parseFloat(r.score) || 0.1
    }));
  } catch (e) {
    return [];
  }
}

/**
 * Fallback pattern detection.
 *
 * @param {Object} dbClient - Database client
 * @param {number} [n=3] - N-gram size
 * @returns {Promise<Object>} Patterns (empty in fallback)
 */
async function fallbackPatterns(dbClient, n = 3) {
  return {
    patterns: [],
    message: 'Pattern detection requires graph client'
  };
}

/**
 * Fallback graph statistics.
 *
 * @param {Object} dbClient - Database client
 * @returns {Promise<Object>} Basic stats from database
 */
async function fallbackStats(dbClient) {
  if (typeof dbClient?.query !== 'function') {
    return { nodes: 0, edges: 0, message: 'Database not available' };
  }

  try {
    const reportCount = await dbClient.query(
      'SELECT COUNT(*) as count FROM research_reports'
    );
    const docCount = await dbClient.query(
      'SELECT COUNT(*) as count FROM doc_index'
    );

    return {
      nodes: (parseInt(reportCount?.[0]?.count) || 0) +
             (parseInt(docCount?.[0]?.count) || 0),
      edges: 0,
      reports: parseInt(reportCount?.[0]?.count) || 0,
      docs: parseInt(docCount?.[0]?.count) || 0,
      message: 'Stats from database (no graph edges available)'
    };
  } catch (e) {
    return { nodes: 0, edges: 0, error: e.message };
  }
}

/**
 * Fallback report retrieval.
 *
 * @param {Object} dbClient - Database client
 * @param {string|number} reportId - Report ID
 * @returns {Promise<Object|null>} Report object or null
 */
async function fallbackGetReport(dbClient, reportId) {
  if (typeof dbClient?.query !== 'function') {
    return null;
  }

  try {
    const rows = await dbClient.query(
      `SELECT id, original_query as query, final_report as content,
              cost_preference, audience_level, created_at
       FROM research_reports
       WHERE id = $1`,
      [reportId]
    );
    return rows?.[0] || null;
  } catch (e) {
    return null;
  }
}

/**
 * Create a fallback-enabled handler.
 *
 * @param {Object} primary - Primary handler functions
 * @param {Object} fallback - Fallback handler functions
 * @returns {Object} Combined handler that tries primary then fallback
 *
 * @example
 * const safeHandlers = withFallbacks(
 *   { search: graphSearch },
 *   { search: fallbackSearch }
 * );
 */
function withFallbacks(primary, fallback) {
  const combined = {};
  const allKeys = new Set([...Object.keys(primary), ...Object.keys(fallback)]);

  for (const key of allKeys) {
    combined[key] = async (...args) => {
      try {
        if (primary[key]) {
          return await primary[key](...args);
        }
      } catch (e) {
        // Primary failed, try fallback
      }

      if (fallback[key]) {
        return await fallback[key](...args);
      }

      throw new Error(`No implementation available for: ${key}`);
    };
  }

  return combined;
}

module.exports = {
  fallbackSearch,
  fallbackTraversal,
  fallbackPath,
  fallbackClusters,
  fallbackPageRank,
  fallbackPatterns,
  fallbackStats,
  fallbackGetReport,
  withFallbacks
};
