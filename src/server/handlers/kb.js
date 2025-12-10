/**
 * Knowledge Base Handlers
 *
 * Consolidated handlers for: search, query, retrieve, get_report, history
 */

const { normalize } = require('../../core/normalize');

/**
 * Unified KB handler
 *
 * Operations: search, sql, retrieve, report, history
 */
async function handleKB(op, params, context = {}) {
  const normalized = normalize('kb', params);
  const { dbClient } = context;

  if (!dbClient) {
    throw new Error('Database client not available');
  }

  switch (op) {
    case 'search':
      return searchKB(normalized, dbClient);
    case 'sql':
    case 'query':
      return executeQuery(normalized, dbClient);
    case 'retrieve':
      return retrieve(normalized, dbClient);
    case 'report':
    case 'get':
      return getReport(normalized, dbClient);
    case 'history':
    case 'list':
      return listHistory(normalized, dbClient);
    default:
      throw new Error(`Unknown KB operation: ${op}`);
  }
}

/**
 * Hybrid BM25+vector search
 */
async function searchKB(params, dbClient) {
  const query = params.query || params.q;
  const { k = 10, scope = 'both', rerank = false } = params;

  if (!query) {
    throw new Error('query is required for search');
  }

  let results = [];

  if (typeof dbClient.searchHybrid === 'function') {
    results = await dbClient.searchHybrid(query, k, scope, rerank);
  } else {
    // Fallback to basic text search
    results = await fallbackSearch(dbClient, query, k, scope);
  }

  return {
    query,
    k,
    scope,
    resultCount: results?.length || 0,
    results: (results || []).map(r => ({
      id: r.id || r.source_id,
      type: r.source_type || r.type || 'unknown',
      title: r.title || r.query?.substring(0, 50),
      score: r.score || r.similarity,
      snippet: r.content?.substring(0, 200) || r.snippet
    }))
  };
}

/**
 * Execute SQL query (SELECT only)
 */
async function executeQuery(params, dbClient) {
  const { sql, params: sqlParams = [], explain = false } = params;

  if (!sql) {
    throw new Error('sql is required');
  }

  // Security: Only allow SELECT statements
  const normalized = sql.trim().toLowerCase();
  if (!normalized.startsWith('select')) {
    throw new Error('Only SELECT queries are allowed. Use sql parameter for SELECT queries.');
  }

  // Check for dangerous patterns
  const dangerous = ['drop', 'delete', 'update', 'insert', 'alter', 'truncate', 'create'];
  for (const word of dangerous) {
    if (normalized.includes(word)) {
      throw new Error(`Dangerous SQL keyword detected: ${word}. Only read-only SELECT allowed.`);
    }
  }

  const rows = await dbClient.query(sql, sqlParams);

  const result = {
    sql: sql.substring(0, 200),
    rowCount: rows?.length || 0,
    rows: rows || []
  };

  // Add plain English explanation if requested
  if (explain && rows?.length > 0) {
    result.explanation = generateExplanation(sql, rows);
  }

  return result;
}

/**
 * Retrieve from index or SQL
 */
async function retrieve(params, dbClient) {
  const { mode = 'index' } = params;

  if (mode === 'sql') {
    return executeQuery(params, dbClient);
  }

  // Index mode
  const query = params.query || params.q;
  if (!query) {
    throw new Error('query is required when mode="index"');
  }

  return searchKB({ ...params, query }, dbClient);
}

/**
 * Get report by ID
 *
 * Includes job_id detection to provide helpful guidance when users
 * mistakenly pass a job ID instead of a report ID.
 */
async function getReport(params, dbClient) {
  const reportId = params.reportId || params.id || params.report_id;
  const { mode = 'full', maxChars = 2000, query: summaryQuery } = params;

  if (!reportId) {
    throw new Error('reportId is required. Use history() to list available reports.');
  }

  // Detect if user passed a job_id instead of reportId
  // Job IDs have format: job_<timestamp>_<random>
  if (/^job_\d+_[a-z0-9]{6,}$/i.test(String(reportId))) {
    throw new Error(
      `"${reportId}" appears to be a Job ID, not a Report ID.\n` +
      `Report IDs are integers (e.g., "5", "42").\n\n` +
      `To get the report from this job:\n` +
      `1. job_status({ job_id: "${reportId}" }) -> check if status is "succeeded"\n` +
      `2. Extract the reportId from the response\n` +
      `3. get_report({ reportId: "<the_report_id>" })`
    );
  }

  // Validate numeric format (report IDs are integers)
  if (!/^\d+$/.test(String(reportId).trim())) {
    throw new Error(
      `Invalid report ID format: "${reportId}"\n` +
      `Report IDs must be numeric (e.g., "5", "42").\n` +
      `Use history() to list available reports with their IDs.`
    );
  }

  // Fetch report
  let report;
  if (typeof dbClient.getReportById === 'function') {
    report = await dbClient.getReportById(reportId);
  } else {
    const rows = await dbClient.query(
      'SELECT id, original_query as query, final_report, parameters, created_at FROM research_reports WHERE id = $1',
      [reportId]
    );
    report = rows?.[0];
    // Extract nested fields from parameters JSONB
    if (report?.parameters) {
      const params = typeof report.parameters === 'string' ? JSON.parse(report.parameters) : report.parameters;
      report.cost_preference = params.costPreference;
      report.audience_level = params.audienceLevel;
    }
  }

  if (!report) {
    throw new Error(`Report ID ${reportId} not found`);
  }

  const content = report.final_report || '';

  // Apply mode transformations
  let outputContent = content;

  switch (mode) {
    case 'truncate':
      outputContent = content.substring(0, maxChars);
      if (content.length > maxChars) {
        outputContent += `\n\n[Truncated. Full length: ${content.length} chars]`;
      }
      break;

    case 'summary':
      // Simple extractive summary - first paragraph + key sections
      const paragraphs = content.split(/\n\n+/);
      outputContent = paragraphs.slice(0, 3).join('\n\n');
      if (paragraphs.length > 3) {
        outputContent += `\n\n[Summary of ${paragraphs.length} sections]`;
      }
      break;

    case 'smart':
      // If query provided, try to find relevant sections
      if (summaryQuery) {
        const lower = summaryQuery.toLowerCase();
        const sentences = content.split(/[.!?]+/);
        const relevant = sentences.filter(s =>
          s.toLowerCase().includes(lower)
        ).slice(0, 5);
        outputContent = relevant.length > 0
          ? relevant.join('. ') + '.'
          : content.substring(0, maxChars);
      } else {
        outputContent = content.substring(0, maxChars);
      }
      break;

    case 'full':
    default:
      // Return full content
      break;
  }

  return {
    reportId,
    query: report.query,
    costPreference: report.cost_preference,
    audienceLevel: report.audience_level,
    createdAt: report.created_at,
    rating: report.rating,
    contentLength: content.length,
    mode,
    content: outputContent
  };
}

/**
 * List research history
 */
async function listHistory(params, dbClient) {
  const { limit = 10, queryFilter } = params;

  let sql = 'SELECT id, original_query, parameters, created_at FROM research_reports';
  const sqlParams = [];

  if (queryFilter) {
    sql += ' WHERE original_query ILIKE $1';
    sqlParams.push(`%${queryFilter}%`);
  }

  sql += ' ORDER BY created_at DESC LIMIT $' + (sqlParams.length + 1);
  sqlParams.push(limit);

  const rows = await dbClient.query(sql, sqlParams);

  return {
    limit,
    filter: queryFilter || null,
    count: rows?.length || 0,
    reports: (rows || []).map(r => {
      const params = r.parameters ? (typeof r.parameters === 'string' ? JSON.parse(r.parameters) : r.parameters) : {};
      return {
        id: r.id,
        query: r.original_query,
        costPreference: params.costPreference,
        audienceLevel: params.audienceLevel,
        createdAt: r.created_at
      };
    })
  };
}

/**
 * Generate plain English explanation of query results
 */
function generateExplanation(sql, rows) {
  const count = rows.length;

  if (count === 0) {
    return 'No results found for this query.';
  }

  // Detect table name
  const tableMatch = sql.match(/from\s+(\w+)/i);
  const tableName = tableMatch ? tableMatch[1] : 'records';

  // Describe columns
  const columns = Object.keys(rows[0]);

  let explanation = `Found ${count} ${tableName}${count > 1 ? 's' : ''}.`;

  if (columns.length <= 5) {
    explanation += ` Columns: ${columns.join(', ')}.`;
  }

  // Sample values if numeric
  for (const col of columns) {
    const values = rows.map(r => r[col]).filter(v => typeof v === 'number');
    if (values.length > 0) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      explanation += ` Average ${col}: ${avg.toFixed(2)}.`;
      break;  // Just show one metric
    }
  }

  return explanation;
}

/**
 * Fallback search using basic text matching
 */
async function fallbackSearch(dbClient, query, k, scope) {
  const results = [];

  if (scope !== 'docs') {
    // Search reports
    const reportSql = `
      SELECT id, query as title, 'report' as type, final_report as content
      FROM research_reports
      WHERE query ILIKE $1 OR final_report ILIKE $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const reports = await dbClient.query(reportSql, [`%${query}%`, k]);
    results.push(...(reports || []));
  }

  if (scope !== 'reports') {
    // Search doc_index
    const docSql = `
      SELECT source_id as id, title, 'doc' as type, content
      FROM doc_index
      WHERE title ILIKE $1 OR content ILIKE $1
      LIMIT $2
    `;
    const docs = await dbClient.query(docSql, [`%${query}%`, k]);
    results.push(...(docs || []));
  }

  return results.slice(0, k);
}

/**
 * Legacy compatibility wrappers
 */
const search = (params, ctx) => handleKB('search', params, ctx);
const query = (params, ctx) => handleKB('sql', params, ctx);
const retrieveLegacy = (params, ctx) => handleKB('retrieve', params, ctx);
const getReportLegacy = (params, ctx) => handleKB('report', params, ctx);
const history = (params, ctx) => handleKB('history', params, ctx);

module.exports = {
  handleKB,
  searchKB,
  executeQuery,
  retrieve,
  getReport,
  listHistory,
  // Legacy exports
  search,
  query,
  retrieve: retrieveLegacy,
  getReportLegacy,
  history
};
