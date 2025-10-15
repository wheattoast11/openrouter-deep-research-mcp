// src/utils/credentialManager.js
/**
 * Secure Credential Manager using PGlite with pgcrypto
 * Stores encrypted API keys and secrets in the database
 * Uses PBKDF2-derived encryption keys for AES-256-GCM encryption
 */

const crypto = require('crypto');
const dbClient = require('./dbClient');

// Constants for encryption
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const SALT_LENGTH = 32; // 256 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const PBKDF2_ITERATIONS = 100000; // Recommended minimum

class CredentialManager {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize the credential manager
   * Creates the secure_credentials table if it doesn't exist
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Check if pgcrypto extension is available
      await this._ensurePgCrypto();
      
      // Create secure_credentials table
      await this._createCredentialsTable();
      
      this.initialized = true;
      console.error(`[${new Date().toISOString()}] CredentialManager initialized successfully`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] CredentialManager initialization error:`, error);
      throw error;
    }
  }

  /**
   * Ensure pgcrypto extension is enabled
   */
  async _ensurePgCrypto() {
    try {
      // pgcrypto is built-in to PostgreSQL, just verify it's available
      await dbClient.executeQuery(`
        SELECT * FROM pg_available_extensions WHERE name = 'pgcrypto'
      `, []);
    } catch (error) {
      console.warn(`[${new Date().toISOString()}] pgcrypto extension check warning:`, error.message);
      // Continue anyway - we'll use Node.js crypto as fallback
    }
  }

  /**
   * Create the secure_credentials table
   */
  async _createCredentialsTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS secure_credentials (
        service TEXT PRIMARY KEY,
        encrypted_key TEXT NOT NULL,
        salt TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await dbClient.executeQuery(sql, []);
  }

  /**
   * Derive an encryption key from a master password using PBKDF2
   * @param {string} masterPassword - The master password
   * @param {Buffer} salt - Salt for key derivation
   * @returns {Promise<Buffer>} - Derived key
   */
  async _deriveKey(masterPassword, salt) {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        masterPassword,
        salt,
        PBKDF2_ITERATIONS,
        KEY_LENGTH,
        'sha256',
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });
  }

  /**
   * Encrypt a credential using AES-256-GCM
   * @param {string} plaintext - The plaintext to encrypt
   * @param {Buffer} key - The encryption key
   * @param {Buffer} iv - Initialization vector
   * @returns {object} - { ciphertext, authTag }
   */
  _encrypt(plaintext, key, iv) {
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    return {
      ciphertext: encrypted,
      authTag: authTag.toString('base64')
    };
  }

  /**
   * Decrypt a credential using AES-256-GCM
   * @param {string} ciphertext - The ciphertext to decrypt
   * @param {Buffer} key - The decryption key
   * @param {Buffer} iv - Initialization vector
   * @param {Buffer} authTag - Authentication tag
   * @returns {string} - Decrypted plaintext
   */
  _decrypt(ciphertext, key, iv, authTag) {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Store an encrypted credential
   * @param {string} service - Service identifier (e.g., 'openrouter', 'gemini')
   * @param {string} key - The API key or secret to store
   * @param {string} masterPassword - Master password for encryption
   * @returns {Promise<boolean>} - Success status
   */
  async storeCredential(service, key, masterPassword) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(SALT_LENGTH);
      const iv = crypto.randomBytes(IV_LENGTH);
      
      // Derive encryption key from master password
      const encryptionKey = await this._deriveKey(masterPassword, salt);
      
      // Encrypt the credential
      const { ciphertext, authTag } = this._encrypt(key, encryptionKey, iv);
      
      // Store in database
      const sql = `
        INSERT INTO secure_credentials (service, encrypted_key, salt, iv, auth_tag, algorithm, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (service) 
        DO UPDATE SET 
          encrypted_key = EXCLUDED.encrypted_key,
          salt = EXCLUDED.salt,
          iv = EXCLUDED.iv,
          auth_tag = EXCLUDED.auth_tag,
          algorithm = EXCLUDED.algorithm,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      await dbClient.executeQuery(sql, [
        service,
        ciphertext,
        salt.toString('base64'),
        iv.toString('base64'),
        authTag,
        ALGORITHM
      ]);
      
      console.error(`[${new Date().toISOString()}] Credential stored for service: ${service}`);
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error storing credential for ${service}:`, error);
      throw new Error(`Failed to store credential: ${error.message}`);
    }
  }

  /**
   * Retrieve and decrypt a credential
   * @param {string} service - Service identifier
   * @param {string} masterPassword - Master password for decryption
   * @returns {Promise<string|null>} - Decrypted credential or null if not found
   */
  async retrieveCredential(service, masterPassword) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const sql = `
        SELECT encrypted_key, salt, iv, auth_tag, algorithm
        FROM secure_credentials
        WHERE service = $1
      `;
      
      const results = await dbClient.executeQuery(sql, [service]);
      
      if (!results || results.length === 0) {
        return null;
      }
      
      const row = results[0];
      
      // Parse stored values
      const salt = Buffer.from(row.salt, 'base64');
      const iv = Buffer.from(row.iv, 'base64');
      const authTag = Buffer.from(row.auth_tag, 'base64');
      
      // Derive decryption key
      const decryptionKey = await this._deriveKey(masterPassword, salt);
      
      // Decrypt the credential
      const plaintext = this._decrypt(
        row.encrypted_key,
        decryptionKey,
        iv,
        authTag
      );
      
      return plaintext;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error retrieving credential for ${service}:`, error);
      
      // If decryption fails, it's likely a wrong password
      if (error.message.includes('Unsupported state') || error.message.includes('auth')) {
        throw new Error('Invalid master password or corrupted credential');
      }
      
      throw new Error(`Failed to retrieve credential: ${error.message}`);
    }
  }

  /**
   * Rotate a credential with a new key
   * @param {string} service - Service identifier
   * @param {string} newKey - New API key
   * @param {string} masterPassword - Master password for encryption
   * @returns {Promise<boolean>} - Success status
   */
  async rotateCredential(service, newKey, masterPassword) {
    // Simply overwrite with new credential
    return await this.storeCredential(service, newKey, masterPassword);
  }

  /**
   * Delete a credential
   * @param {string} service - Service identifier
   * @returns {Promise<boolean>} - Success status
   */
  async deleteCredential(service) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const sql = `DELETE FROM secure_credentials WHERE service = $1`;
      await dbClient.executeQuery(sql, [service]);
      
      console.error(`[${new Date().toISOString()}] Credential deleted for service: ${service}`);
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error deleting credential for ${service}:`, error);
      throw new Error(`Failed to delete credential: ${error.message}`);
    }
  }

  /**
   * List all stored credential service names (never exposes actual keys)
   * @returns {Promise<Array<object>>} - Array of {service, created_at, updated_at}
   */
  async listCredentials() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const sql = `
        SELECT service, created_at, updated_at
        FROM secure_credentials
        ORDER BY updated_at DESC
      `;
      
      const results = await dbClient.executeQuery(sql, []);
      return results || [];
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error listing credentials:`, error);
      throw new Error(`Failed to list credentials: ${error.message}`);
    }
  }

  /**
   * Check if a credential exists for a service
   * @param {string} service - Service identifier
   * @returns {Promise<boolean>} - True if exists
   */
  async hasCredential(service) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const sql = `SELECT 1 FROM secure_credentials WHERE service = $1 LIMIT 1`;
      const results = await dbClient.executeQuery(sql, [service]);
      return results && results.length > 0;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error checking credential for ${service}:`, error);
      return false;
    }
  }
}

// Singleton instance
const credentialManager = new CredentialManager();

module.exports = credentialManager;




