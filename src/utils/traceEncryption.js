/**
 * Trace Encryption Utility
 * Provides AES-256-GCM encryption for sensitive trace data
 * Uses environment-based encryption keys with automatic generation
 */

const crypto = require('crypto');
const config = require('../../config');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Get or generate encryption key
 * @returns {Buffer} Encryption key
 */
function getEncryptionKey() {
  const envKey = process.env.PRIVATE_TRACES_ENCRYPTION_KEY;
  
  if (envKey && envKey.length === 64) {
    // Use provided hex key
    return Buffer.from(envKey, 'hex');
  }
  
  // Generate ephemeral key (session-based, not persisted)
  // For production, should use a secrets manager
  const sessionSeed = process.env.SESSION_SEED || 'default-seed-change-me';
  const salt = crypto.createHash('sha256').update(sessionSeed).digest();
  return crypto.pbkdf2Sync(sessionSeed, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt trace data
 * @param {object} data - Trace data to encrypt
 * @returns {string} Encrypted data as base64 string
 */
function encryptTrace(data) {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const jsonData = JSON.stringify(data);
    let encrypted = cipher.update(jsonData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Combine iv + encrypted + tag
    const combined = Buffer.concat([
      iv,
      Buffer.from(encrypted, 'hex'),
      tag
    ]);
    
    return combined.toString('base64');
  } catch (error) {
    console.error('Trace encryption failed:', error.message);
    throw error;
  }
}

/**
 * Decrypt trace data
 * @param {string} encryptedData - Base64 encrypted data
 * @returns {object} Decrypted trace data
 */
function decryptTrace(encryptedData) {
  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const iv = combined.slice(0, IV_LENGTH);
    const tag = combined.slice(-TAG_LENGTH);
    const encrypted = combined.slice(IV_LENGTH, -TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Trace decryption failed:', error.message);
    throw error;
  }
}

/**
 * Check if encryption is enabled
 * @returns {boolean}
 */
function isEncryptionEnabled() {
  return process.env.PRIVATE_TRACES_ENABLED === '1';
}

/**
 * Redact sensitive fields from trace data
 * @param {object} data - Trace data
 * @returns {object} Redacted data
 */
function redactSensitiveFields(data) {
  const redacted = JSON.parse(JSON.stringify(data)); // Deep clone
  
  // Redact common sensitive patterns
  const sensitiveKeys = ['apiKey', 'api_key', 'token', 'password', 'secret', 'authorization'];
  
  function redactObject(obj) {
    if (!obj || typeof obj !== 'object') return;
    
    for (const key in obj) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        obj[key] = '***REDACTED***';
      } else if (typeof obj[key] === 'object') {
        redactObject(obj[key]);
      } else if (typeof obj[key] === 'string') {
        // Redact API key patterns
        obj[key] = obj[key]
          .replace(/(sk-[a-z0-9]+)/gi, 'sk-***')
          .replace(/(api[_-]?key[:\s=]+)([^\s]+)/gi, '$1***')
          .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '***@***.***');
      }
    }
  }
  
  redactObject(redacted);
  return redacted;
}

/**
 * Store trace with optional encryption
 * @param {object} trace - Trace data
 * @returns {object} Stored trace (encrypted if enabled)
 */
function prepareTraceForStorage(trace) {
  // Always redact sensitive fields
  const redacted = redactSensitiveFields(trace);
  
  if (isEncryptionEnabled()) {
    return {
      encrypted: true,
      data: encryptTrace(redacted),
      timestamp: Date.now()
    };
  }
  
  return {
    encrypted: false,
    data: redacted,
    timestamp: Date.now()
  };
}

/**
 * Retrieve trace with optional decryption
 * @param {object} storedTrace - Stored trace object
 * @returns {object} Decrypted trace data
 */
function retrieveTraceFromStorage(storedTrace) {
  if (!storedTrace) return null;
  
  if (storedTrace.encrypted) {
    return decryptTrace(storedTrace.data);
  }
  
  return storedTrace.data;
}

/**
 * Purge old traces based on retention policy
 * @param {number} retentionDays - Days to retain traces
 * @returns {number} Number of traces purged
 */
async function purgeOldTraces(retentionDays = 30) {
  const dbClient = require('./dbClient');
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  try {
    const result = await dbClient.db.query(
      `DELETE FROM compliance_traces WHERE created_at < $1 RETURNING id`,
      [cutoffDate.toISOString()]
    );
    
    return result.rows ? result.rows.length : 0;
  } catch (error) {
    console.error('Trace purge failed:', error.message);
    return 0;
  }
}

module.exports = {
  encryptTrace,
  decryptTrace,
  isEncryptionEnabled,
  redactSensitiveFields,
  prepareTraceForStorage,
  retrieveTraceFromStorage,
  purgeOldTraces,
  getEncryptionKey
};

