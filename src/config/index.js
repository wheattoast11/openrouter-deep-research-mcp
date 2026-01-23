/**
 * Configuration Module
 *
 * Unified exports for configuration utilities.
 *
 * @module config
 */

'use strict';

const constants = require('./constants');
const schema = require('./schema');

module.exports = {
  // Constants
  ...constants,

  // Schema validation
  validateConfig: schema.validateConfig,
  parseConfig: schema.parseConfig,
  validateEnv: schema.validateEnv,

  // Individual schemas for extension
  schemas: {
    Server: schema.ServerSchema,
    OpenRouter: schema.OpenRouterSchema,
    Database: schema.DatabaseSchema,
    Indexer: schema.IndexerSchema,
    Jobs: schema.JobsSchema,
    Logging: schema.LoggingSchema,
    Caching: schema.CachingSchema,
    Core: schema.CoreSchema,
    MCP: schema.MCPSchema,
    Config: schema.ConfigSchema
  }
};
