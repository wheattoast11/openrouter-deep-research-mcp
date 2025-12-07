/**
 * Citation Validator
 *
 * Validates URLs in research citations to detect dead links and hallucinated sources.
 * Marks invalid citations as [DEAD LINK] or [UNVERIFIED].
 *
 * @module citationValidator
 * @version 1.8.0
 */

'use strict';

const logger = require('./logger').child('CitationValidator');

// Regex patterns for citation extraction
const CITATION_PATTERNS = [
  // [Source: Title — https://...]
  /\[Source:\s*([^\]]+?)\s*—\s*(https?:\/\/[^\]\s]+)\]/gi,
  // [Title](https://...)
  /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/gi,
  // Inline URLs
  /(https?:\/\/[^\s\]\)\"<>]+)/gi
];

// Domains that are known-good and don't need validation
const TRUSTED_DOMAINS = [
  'github.com',
  'npmjs.com',
  'docs.python.org',
  'developer.mozilla.org',
  'pglite.dev',
  'spec.modelcontextprotocol.io',
  'openrouter.ai',
  'anthropic.com',
  'openai.com'
];

// Domains that are known to block HEAD requests
const SKIP_VALIDATION_DOMAINS = [
  'linkedin.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com'
];

/**
 * Extract all citations from text
 * @param {string} text - The text to extract citations from
 * @returns {Array<Object>} Array of citation objects with title and url
 */
function extractCitations(text) {
  if (!text || typeof text !== 'string') return [];

  const citations = [];
  const seen = new Set();

  for (const pattern of CITATION_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      let title, url;

      if (match.length === 3) {
        // Patterns with title and URL
        title = match[1].trim();
        url = match[2].trim();
      } else if (match.length === 2) {
        // URL-only pattern
        url = match[1].trim();
        title = url;
      } else {
        continue;
      }

      // Normalize URL
      url = url.replace(/[.,;:]+$/, ''); // Remove trailing punctuation

      // Skip duplicates
      if (seen.has(url)) continue;
      seen.add(url);

      try {
        new URL(url); // Validate URL format
        citations.push({ title, url, original: match[0] });
      } catch {
        // Invalid URL format, skip
      }
    }
  }

  return citations;
}

/**
 * Check if a domain is trusted and can skip validation
 * @param {string} url - The URL to check
 * @returns {boolean} True if the domain is trusted
 */
function isTrustedDomain(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return TRUSTED_DOMAINS.some(d => hostname.includes(d));
  } catch {
    return false;
  }
}

/**
 * Check if a domain should skip validation due to blocking
 * @param {string} url - The URL to check
 * @returns {boolean} True if validation should be skipped
 */
function shouldSkipValidation(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return SKIP_VALIDATION_DOMAINS.some(d => hostname.includes(d));
  } catch {
    return false;
  }
}

/**
 * Validate a single URL via HEAD request
 * @param {string} url - The URL to validate
 * @param {number} timeout - Request timeout in ms
 * @returns {Promise<Object>} Validation result
 */
async function validateUrl(url, timeout = 5000) {
  // Skip validation for certain domains
  if (shouldSkipValidation(url)) {
    return { url, valid: true, status: 'skipped', reason: 'domain blocks validation' };
  }

  // Trust known domains
  if (isTrustedDomain(url)) {
    return { url, valid: true, status: 'trusted', reason: 'trusted domain' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'OpenRouter-Agents-CitationValidator/1.0'
      },
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    if (response.ok || response.status === 403 || response.status === 405) {
      // 403/405 often mean the page exists but blocks HEAD
      return { url, valid: true, status: response.status, reason: 'accessible' };
    } else if (response.status === 404) {
      return { url, valid: false, status: 404, reason: 'not found' };
    } else {
      return { url, valid: false, status: response.status, reason: `HTTP ${response.status}` };
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return { url, valid: false, status: 'timeout', reason: 'request timed out' };
    }
    return { url, valid: false, status: 'error', reason: error.message };
  }
}

/**
 * Validate all citations in text
 * @param {string} text - Text containing citations
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation results
 */
async function validateCitations(text, options = {}) {
  const { maxConcurrent = 5, timeout = 5000, requestId = 'unknown' } = options;

  const citations = extractCitations(text);
  if (citations.length === 0) {
    return { total: 0, valid: 0, invalid: 0, results: [] };
  }

  logger.debug('Validating citations', { requestId, count: citations.length });

  const results = [];
  const batches = [];

  // Process in batches for rate limiting
  for (let i = 0; i < citations.length; i += maxConcurrent) {
    batches.push(citations.slice(i, i + maxConcurrent));
  }

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(c => validateUrl(c.url, timeout).then(r => ({ ...c, ...r })))
    );
    results.push(...batchResults);
  }

  const valid = results.filter(r => r.valid).length;
  const invalid = results.filter(r => !r.valid).length;

  logger.info('Citation validation complete', {
    requestId,
    total: results.length,
    valid,
    invalid
  });

  return {
    total: results.length,
    valid,
    invalid,
    results
  };
}

/**
 * Annotate text with citation validity markers
 * @param {string} text - Original text with citations
 * @param {Array<Object>} validationResults - Results from validateCitations
 * @returns {string} Annotated text
 */
function annotateText(text, validationResults) {
  if (!text || !validationResults?.results) return text;

  let annotated = text;

  for (const result of validationResults.results) {
    if (!result.valid && result.original) {
      const marker = result.status === 404 ? '[DEAD LINK]' : '[UNVERIFIED]';
      annotated = annotated.replace(
        result.original,
        `${result.original} ${marker}`
      );
    }
  }

  return annotated;
}

/**
 * Get a summary of citation quality
 * @param {Object} validationResults - Results from validateCitations
 * @returns {Object} Quality summary
 */
function getQualitySummary(validationResults) {
  if (!validationResults?.total) {
    return { score: 1.0, level: 'unknown', message: 'No citations to validate' };
  }

  const { total, valid, invalid } = validationResults;
  const score = total > 0 ? valid / total : 0;

  let level, message;

  if (score >= 0.9) {
    level = 'high';
    message = `${valid}/${total} citations verified`;
  } else if (score >= 0.7) {
    level = 'medium';
    message = `${invalid} of ${total} citations could not be verified`;
  } else if (score >= 0.5) {
    level = 'low';
    message = `Warning: ${invalid}/${total} citations unverified or dead`;
  } else {
    level = 'very-low';
    message = `Critical: Most citations (${invalid}/${total}) could not be verified`;
  }

  return { score, level, message };
}

module.exports = {
  extractCitations,
  validateUrl,
  validateCitations,
  annotateText,
  getQualitySummary,
  isTrustedDomain
};
