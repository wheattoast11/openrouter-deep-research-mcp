/**
 * Shared Handler Utilities
 *
 * Unified exports for handler utility modules.
 *
 * @module server/handlers/shared
 */

'use strict';

const context = require('./context');
const capabilities = require('./capabilities');
const legacy = require('./legacy');
const fallbacks = require('./fallbacks');

module.exports = {
  // Context validation
  ContextError: context.ContextError,
  validateContext: context.validateContext,
  validators: context.validators,
  hasCapability: context.hasCapability,
  getMissing: context.getMissing,
  CONTEXT_MESSAGES: context.MESSAGES,

  // Capability detection
  hasMethod: capabilities.hasMethod,
  hasMethods: capabilities.hasMethods,
  withCapability: capabilities.withCapability,
  withFirstCapability: capabilities.withFirstCapability,
  CAPABILITIES: capabilities.CAPABILITIES,
  getMissingCapabilities: capabilities.getMissingCapabilities,
  createCapabilityProxy: capabilities.createCapabilityProxy,

  // Legacy wrapper generation
  createLegacyWrapper: legacy.createLegacyWrapper,
  createLegacyWrappers: legacy.createLegacyWrappers,
  LEGACY_MAPPINGS: legacy.LEGACY_MAPPINGS,
  generateLegacyExports: legacy.generateLegacyExports,
  createUnifiedHandler: legacy.createUnifiedHandler,

  // Fallback implementations
  fallbackSearch: fallbacks.fallbackSearch,
  fallbackTraversal: fallbacks.fallbackTraversal,
  fallbackPath: fallbacks.fallbackPath,
  fallbackClusters: fallbacks.fallbackClusters,
  fallbackPageRank: fallbacks.fallbackPageRank,
  fallbackPatterns: fallbacks.fallbackPatterns,
  fallbackStats: fallbacks.fallbackStats,
  fallbackGetReport: fallbacks.fallbackGetReport,
  withFallbacks: fallbacks.withFallbacks
};
