/**
 * Core Configuration Factory
 *
 * Injectable configuration for core abstractions.
 * Reads from global config with sensible defaults.
 *
 * @module core/config
 */

'use strict';

/**
 * Default values (used when not overridden)
 */
const DEFAULTS = {
  requestTracker: {
    timeout: 60000  // 1 minute default timeout for pending requests
  },
  consensus: {
    minAgreement: 0.6,
    modelWeights: {
      'anthropic/claude-sonnet-4': 1.0,
      'anthropic/claude-opus-4': 1.0,
      'openai/gpt-5-chat': 0.95,
      'google/gemini-2.5-pro': 0.90,
      'x-ai/grok-4': 0.85,
      'deepseek/deepseek-chat-v3.1': 0.75,
      'default': 0.5
    }
  },
  crystallization: {
    positiveWeight: 0.2,
    negativeWeight: 0.1
  }
};

// Lazy-load global config to avoid circular dependencies
let _globalConfig = null;
function getGlobalConfig() {
  if (!_globalConfig) {
    try {
      _globalConfig = require('../../config');
    } catch (e) {
      _globalConfig = {};
    }
  }
  return _globalConfig;
}

/**
 * Get configuration for a specific module
 *
 * @param {string} module - Module name ('requestTracker'|'consensus'|'crystallization')
 * @returns {Object} Configuration object with defaults applied
 *
 * @example
 * const config = getConfig('requestTracker');
 * console.log(config.timeout); // 60000 (or env override)
 */
function getConfig(module) {
  const globalConfig = getGlobalConfig();
  const coreConfig = globalConfig.core || {};

  switch (module) {
    case 'requestTracker':
      return {
        timeout: coreConfig.roleShift?.timeout ||
                 parseInt(process.env.ROLESHIFT_TIMEOUT_MS, 10) ||
                 DEFAULTS.requestTracker.timeout
      };

    case 'consensus':
      return {
        minAgreement: coreConfig.signal?.minAgreement ||
                      parseFloat(process.env.CONSENSUS_MIN_AGREEMENT) ||
                      DEFAULTS.consensus.minAgreement,
        modelWeights: coreConfig.signal?.modelWeights ||
                      DEFAULTS.consensus.modelWeights
      };

    case 'crystallization':
      return {
        positiveWeight: coreConfig.signal?.crystallization?.positiveWeight ||
                        parseFloat(process.env.CRYSTAL_POSITIVE_WEIGHT) ||
                        DEFAULTS.crystallization.positiveWeight,
        negativeWeight: coreConfig.signal?.crystallization?.negativeWeight ||
                        parseFloat(process.env.CRYSTAL_NEGATIVE_WEIGHT) ||
                        DEFAULTS.crystallization.negativeWeight
      };

    default:
      return DEFAULTS[module] || {};
  }
}

/**
 * Create configured instance with optional overrides
 *
 * @param {string} module - Module name
 * @param {Object} [overrides={}] - Override specific values
 * @returns {Object} Merged configuration
 *
 * @example
 * const config = createConfig('requestTracker', { timeout: 30000 });
 */
function createConfig(module, overrides = {}) {
  return { ...getConfig(module), ...overrides };
}

/**
 * Reset cached global config (useful for testing)
 */
function resetConfigCache() {
  _globalConfig = null;
}

module.exports = {
  DEFAULTS,
  getConfig,
  createConfig,
  resetConfigCache
};
