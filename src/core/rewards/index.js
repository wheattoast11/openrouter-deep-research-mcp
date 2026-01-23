/**
 * Rewards Module
 *
 * Procedural reward system for signal quality assessment.
 *
 * @module core/rewards
 */

'use strict';

const procedural = require('./procedural');

module.exports = {
  // Classes
  RewardResult: procedural.RewardResult,
  TraceContext: procedural.TraceContext,
  ProceduralReward: procedural.ProceduralReward,

  // Functions
  quickReward: procedural.quickReward,
  createRewardCalculator: procedural.createRewardCalculator,
  getGlobalCalculator: procedural.getGlobalCalculator,

  // Constants
  DEFAULT_WEIGHTS: procedural.DEFAULT_WEIGHTS,

  // Namespaced
  procedural
};
