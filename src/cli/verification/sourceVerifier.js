/**
 * SourceVerifier - Citation and URL validation
 *
 * Verifies sources cited in research reports:
 * - Checks URL accessibility
 * - Cross-references against knowledge graph
 * - Tracks source reliability scores over time
 * - Extracts and validates citations
 */

'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * URL patterns for extraction
 */
const URL_PATTERNS = {
  // Standard URLs
  http: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi,

  // DOI links
  doi: /\b(doi\.org\/\S+|DOI:\s*\S+)/gi,

  // arXiv references
  arxiv: /\b(arxiv\.org\/abs\/[\d.]+|arXiv:[\d.]+)/gi,

  // GitHub repos
  github: /github\.com\/[^\s<>"{}|\\^`\[\]\/]+\/[^\s<>"{}|\\^`\[\]]+/gi
};

/**
 * Known reliable domains with trust scores
 */
const DOMAIN_TRUST = {
  // High trust - official sources
  'arxiv.org': 0.95,
  'doi.org': 0.95,
  'github.com': 0.85,
  'docs.python.org': 0.95,
  'developer.mozilla.org': 0.95,
  'wikipedia.org': 0.75,

  // AI/ML sources
  'huggingface.co': 0.90,
  'openai.com': 0.90,
  'anthropic.com': 0.90,
  'deepmind.com': 0.90,
  'qwenlm.github.io': 0.90, // Qwen documentation
  'modelcontextprotocol.io': 0.95,

  // News/blogs - variable trust
  'medium.com': 0.50,
  'dev.to': 0.55,
  'towardsdatascience.com': 0.60,

  // Default for unknown
  'default': 0.40
};

/**
 * Request timeout for URL verification
 */
const REQUEST_TIMEOUT = 10000; // 10 seconds

class SourceVerifier {
  constructor(deps = {}) {
    this.dbClient = deps.dbClient;
    this.knowledgeGraph = deps.knowledgeGraph;
    this.fetchTool = deps.fetchTool;

    // Track source reliability over time
    this.reliabilityScores = new Map();
    this.verificationHistory = [];
    this.maxHistory = 200;
  }

  /**
   * Extract all URLs/citations from text
   * @param {string} text - Report text
   * @returns {Object[]} Array of extracted sources
   */
  extractSources(text) {
    const sources = [];
    const seen = new Set();

    for (const [type, pattern] of Object.entries(URL_PATTERNS)) {
      const matches = text.matchAll(new RegExp(pattern.source, pattern.flags));

      for (const match of matches) {
        let url = match[0].trim();

        // Clean up trailing punctuation
        url = url.replace(/[.,;:!?)]+$/, '');

        // Normalize
        const normalized = url.toLowerCase();
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        sources.push({
          url,
          type,
          domain: this.extractDomain(url),
          baseTrust: this.getDomainTrust(url)
        });
      }
    }

    return sources;
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      // Handle non-http patterns
      if (!url.startsWith('http')) {
        if (url.includes('doi.org')) return 'doi.org';
        if (url.includes('arxiv')) return 'arxiv.org';
        if (url.includes('github.com')) return 'github.com';
        return 'unknown';
      }

      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return 'invalid';
    }
  }

  /**
   * Get trust score for domain
   */
  getDomainTrust(url) {
    const domain = this.extractDomain(url);

    // Check runtime reliability adjustments
    if (this.reliabilityScores.has(domain)) {
      return this.reliabilityScores.get(domain);
    }

    // Check known domains
    for (const [knownDomain, trust] of Object.entries(DOMAIN_TRUST)) {
      if (domain.endsWith(knownDomain)) {
        return trust;
      }
    }

    return DOMAIN_TRUST.default;
  }

  /**
   * Verify a single URL is accessible
   * @param {string} url - URL to verify
   * @returns {Promise<Object>} Verification result
   */
  async verifyUrl(url) {
    // Skip non-HTTP URLs
    if (!url.startsWith('http')) {
      return {
        url,
        accessible: null,
        reason: 'non-http',
        trust: this.getDomainTrust(url)
      };
    }

    try {
      const result = await this.headRequest(url);
      return {
        url,
        accessible: result.success,
        statusCode: result.statusCode,
        contentType: result.contentType,
        title: result.title,
        trust: this.getDomainTrust(url),
        latencyMs: result.latencyMs
      };
    } catch (err) {
      return {
        url,
        accessible: false,
        error: err.message,
        trust: this.getDomainTrust(url) * 0.5 // Penalize inaccessible
      };
    }
  }

  /**
   * HTTP HEAD request with timeout
   */
  headRequest(url) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.request(url, { method: 'HEAD', timeout: REQUEST_TIMEOUT }, (res) => {
        resolve({
          success: res.statusCode >= 200 && res.statusCode < 400,
          statusCode: res.statusCode,
          contentType: res.headers['content-type'],
          latencyMs: Date.now() - start
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Verify all sources in a report
   * @param {string} reportText - Full report text
   * @returns {Promise<Object>} Verification summary
   */
  async verifySources(reportText) {
    const sources = this.extractSources(reportText);

    if (sources.length === 0) {
      return {
        totalSources: 0,
        verified: 0,
        failed: 0,
        skipped: 0,
        sources: [],
        reliability: 0,
        hasIssues: true,
        reason: 'no-sources-found'
      };
    }

    // Verify URLs in parallel (with concurrency limit)
    const results = [];
    const batchSize = 5;

    for (let i = 0; i < sources.length; i += batchSize) {
      const batch = sources.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(s => this.verifyUrl(s.url))
      );
      results.push(...batchResults);
    }

    // Classify results
    const verified = results.filter(r => r.accessible === true);
    const failed = results.filter(r => r.accessible === false);
    const skipped = results.filter(r => r.accessible === null);

    // Update reliability scores based on results
    for (const result of results) {
      if (result.accessible !== null) {
        this.updateReliabilityScore(result.url, result.accessible);
      }
    }

    // Calculate overall reliability
    const trustSum = results.reduce((sum, r) => sum + (r.trust || 0), 0);
    const accessibleBonus = verified.length * 0.1;
    const failurePenalty = failed.length * 0.15;
    const reliability = Math.max(0, Math.min(1,
      (trustSum / results.length) + accessibleBonus - failurePenalty
    ));

    return {
      totalSources: sources.length,
      verified: verified.length,
      failed: failed.length,
      skipped: skipped.length,
      sources: results,
      reliability,
      hasIssues: failed.length > 0 || sources.length < 2,
      failedSources: failed.map(f => ({ url: f.url, error: f.error }))
    };
  }

  /**
   * Update reliability score for a domain
   */
  updateReliabilityScore(url, wasAccessible) {
    const domain = this.extractDomain(url);
    const current = this.reliabilityScores.get(domain) || DOMAIN_TRUST[domain] || DOMAIN_TRUST.default;

    // Exponential moving average
    const alpha = 0.1;
    const newScore = wasAccessible
      ? current + alpha * (1 - current)    // Increase towards 1
      : current - alpha * current;          // Decrease towards 0

    this.reliabilityScores.set(domain, Math.max(0.1, Math.min(0.99, newScore)));

    // Record in history
    this.verificationHistory.push({
      url,
      domain,
      accessible: wasAccessible,
      timestamp: Date.now()
    });

    if (this.verificationHistory.length > this.maxHistory) {
      this.verificationHistory.shift();
    }
  }

  /**
   * Cross-reference claim against knowledge graph
   * @param {string} claim - Factual claim to verify
   * @returns {Promise<Object>} Cross-reference result
   */
  async crossReferenceKnowledgeGraph(claim) {
    if (!this.knowledgeGraph) {
      return { available: false };
    }

    try {
      // Search for related nodes in knowledge graph
      const searchResult = await this.dbClient?.executeQuery(`
        SELECT id, title, description, metadata
        FROM graph_nodes
        WHERE description ILIKE $1
        LIMIT 5
      `, [`%${claim.slice(0, 100)}%`]);

      if (!searchResult?.rows?.length) {
        return { available: true, found: false, relatedNodes: [] };
      }

      return {
        available: true,
        found: true,
        relatedNodes: searchResult.rows.map(r => ({
          id: r.id,
          title: r.title,
          relevance: 'partial-match'
        }))
      };
    } catch (err) {
      return { available: true, found: false, error: err.message };
    }
  }

  /**
   * Get verification statistics
   */
  getStats() {
    const history = this.verificationHistory;

    if (history.length === 0) {
      return { total: 0, accessible: 0, rate: 0 };
    }

    const accessible = history.filter(h => h.accessible).length;
    const byDomain = {};

    for (const entry of history) {
      if (!byDomain[entry.domain]) {
        byDomain[entry.domain] = { total: 0, accessible: 0 };
      }
      byDomain[entry.domain].total++;
      if (entry.accessible) byDomain[entry.domain].accessible++;
    }

    return {
      total: history.length,
      accessible,
      rate: accessible / history.length,
      byDomain: Object.entries(byDomain).map(([domain, stats]) => ({
        domain,
        ...stats,
        rate: stats.accessible / stats.total
      }))
    };
  }
}

module.exports = {
  SourceVerifier,
  URL_PATTERNS,
  DOMAIN_TRUST,
  REQUEST_TIMEOUT
};
