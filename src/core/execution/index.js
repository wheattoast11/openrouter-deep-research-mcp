/**
 * Execution Module
 *
 * Provides fork/rejoin execution patterns for parallel research
 * with consensus-based result synthesis.
 *
 * @module core/execution
 */

'use strict';

const forkExecutor = require('./forkExecutor');

module.exports = {
  // Fork executor exports
  ...forkExecutor,

  // Namespace for clarity
  ForkExecutor: forkExecutor
};
