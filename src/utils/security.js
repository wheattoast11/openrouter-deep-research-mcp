// src/utils/security.js
// Security utilities for redaction, SSRF protection, and input sanitization

const url = require('url');

/**
 * Redact sensitive strings from logs/errors
 * @param {string} text - Text to redact
 * @returns {string} Redacted text
 */
function redactSecrets(text) {
  if (typeof text !== 'string') return text;
  
  return text
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-[REDACTED]')
    .replace(/OPENROUTER_API_KEY[=:]\s*[^\s'"]+/gi, 'OPENROUTER_API_KEY=[REDACTED]')
    .replace(/GEMINI_API_KEY[=:]\s*[^\s'"]+/gi, 'GEMINI_API_KEY=[REDACTED]')
    .replace(/GOOGLE_API_KEY[=:]\s*[^\s'"]+/gi, 'GOOGLE_API_KEY=[REDACTED]')
    .replace(/SERVER_API_KEY[=:]\s*[^\s'"]+/gi, 'SERVER_API_KEY=[REDACTED]')
    .replace(/Authorization:\s*[^\n]+/gi, 'Authorization: [REDACTED]')
    .replace(/"apiKey"\s*:\s*"[^"]+"/gi, '"apiKey":"[REDACTED]"')
    .replace(/"api_key"\s*:\s*"[^"]+"/gi, '"api_key":"[REDACTED]"');
}

/**
 * Validate URL for SSRF protection
 * @param {string} urlString - URL to validate
 * @returns {Object} { valid: boolean, reason?: string, parsed?: URL }
 */
function validateUrlForFetch(urlString) {
  try {
    const parsed = new url.URL(urlString);
    
    // Block private/internal IPs
    const hostname = parsed.hostname.toLowerCase();
    
    // Block localhost variations
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(hostname)) {
      return { valid: false, reason: 'Localhost URLs blocked for SSRF protection' };
    }
    
    // Block private IP ranges (simplified)
    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname)) {
      return { valid: false, reason: 'Private IP ranges blocked for SSRF protection' };
    }
    
    // Block link-local
    if (/^169\.254\./.test(hostname)) {
      return { valid: false, reason: 'Link-local IPs blocked for SSRF protection' };
    }
    
    // Block file:// and other non-http protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, reason: `Protocol ${parsed.protocol} not allowed` };
    }
    
    // Block metadata endpoints (AWS, GCP, Azure)
    if (/169\.254\.169\.254|metadata\.google\.internal|metadata\.azure\.com/i.test(hostname)) {
      return { valid: false, reason: 'Cloud metadata endpoints blocked' };
    }
    
    return { valid: true, parsed };
  } catch (err) {
    return { valid: false, reason: `Invalid URL: ${err.message}` };
  }
}

/**
 * Sanitize user-provided SQL to prevent injection (basic check)
 * @param {string} sql - SQL query
 * @returns {Object} { valid: boolean, reason?: string }
 */
function validateSqlQuery(sql) {
  if (typeof sql !== 'string' || !sql.trim()) {
    return { valid: false, reason: 'SQL must be a non-empty string' };
  }
  
  const lowerSql = sql.trim().toLowerCase();
  
  // Only allow SELECT for now
  if (!lowerSql.startsWith('select')) {
    return { valid: false, reason: 'Only SELECT queries allowed' };
  }
  
  // Block dangerous functions/keywords
  const blocklist = [
    'pg_sleep',
    'pg_read_file',
    'pg_ls_dir',
    'copy ',
    'into outfile',
    'load_file',
    'exec(',
    'execute(',
    'xp_cmdshell'
  ];
  
  for (const term of blocklist) {
    if (lowerSql.includes(term)) {
      return { valid: false, reason: `Blocked term: ${term}` };
    }
  }
  
  return { valid: true };
}

/**
 * Redact PII from text (basic patterns)
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function redactPII(text) {
  if (typeof text !== 'string') return text;
  
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN-REDACTED]')
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, '[CARD-REDACTED]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL-REDACTED]');
}

module.exports = {
  redactSecrets,
  validateUrlForFetch,
  validateSqlQuery,
  redactPII
};

