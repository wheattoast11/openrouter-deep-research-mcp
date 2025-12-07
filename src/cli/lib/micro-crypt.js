/**
 * micro-crypt.js - Zero-dependency encryption utilities
 *
 * Provides:
 * - AES-256-GCM encryption/decryption
 * - scrypt key derivation (memory-hard)
 * - Secure random generation
 * - Hash-chain for audit logs
 *
 * ~120 lines, no external dependencies.
 * Uses only Node.js built-in crypto module.
 */

'use strict';

const crypto = require('crypto');

// Constants
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;       // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;      // 256 bits

// scrypt parameters (OWASP recommended)
const SCRYPT_N = 2 ** 17;   // CPU/memory cost (128MB)
const SCRYPT_R = 8;         // Block size
const SCRYPT_P = 1;         // Parallelization

/**
 * Derive a key from password using scrypt
 * @param {string} password - User password
 * @param {Buffer} salt - Salt (random bytes)
 * @returns {Promise<Buffer>} Derived key
 */
async function deriveKey(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      }
    );
  });
}

/**
 * Encrypt data with AES-256-GCM
 * @param {string|Buffer} data - Data to encrypt
 * @param {string} password - Encryption password
 * @returns {Promise<string>} Encrypted data (base64)
 */
async function encrypt(data, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = await deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  const input = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: salt (32) + iv (12) + authTag (16) + ciphertext
  const result = Buffer.concat([salt, iv, authTag, encrypted]);
  return result.toString('base64');
}

/**
 * Decrypt data with AES-256-GCM
 * @param {string} encryptedData - Encrypted data (base64)
 * @param {string} password - Decryption password
 * @returns {Promise<string>} Decrypted data
 */
async function decrypt(encryptedData, password) {
  const data = Buffer.from(encryptedData, 'base64');

  // Extract components
  const salt = data.subarray(0, SALT_LENGTH);
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = await deriveKey(password, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Generate secure random bytes
 * @param {number} length - Number of bytes
 * @returns {Buffer}
 */
function randomBytes(length) {
  return crypto.randomBytes(length);
}

/**
 * Generate a random hex string
 * @param {number} length - String length (will be length/2 bytes)
 * @returns {string}
 */
function randomHex(length) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

/**
 * Hash data with SHA-256
 * @param {string|Buffer} data - Data to hash
 * @returns {string} Hex hash
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Create hash chain entry for audit logs
 * Chains: hash(previousHash + data + timestamp)
 * @param {string} previousHash - Previous entry hash
 * @param {Object} data - Data to include
 * @returns {Object} Chain entry with hash
 */
function chainEntry(previousHash, data) {
  const timestamp = Date.now();
  const payload = JSON.stringify({ previousHash, data, timestamp });
  const hash = sha256(payload);

  return {
    hash,
    previousHash,
    timestamp,
    data
  };
}

/**
 * Verify hash chain integrity
 * @param {Object[]} chain - Array of chain entries
 * @returns {boolean} True if chain is valid
 */
function verifyChain(chain) {
  if (!chain || chain.length === 0) return true;

  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    const expectedPrev = i === 0 ? null : chain[i - 1].hash;

    if (entry.previousHash !== expectedPrev) {
      return false;
    }

    const payload = JSON.stringify({
      previousHash: entry.previousHash,
      data: entry.data,
      timestamp: entry.timestamp
    });

    if (sha256(payload) !== entry.hash) {
      return false;
    }
  }

  return true;
}

module.exports = {
  encrypt,
  decrypt,
  deriveKey,
  randomBytes,
  randomHex,
  sha256,
  chainEntry,
  verifyChain,
  ALGORITHM,
  KEY_LENGTH,
  SALT_LENGTH
};
