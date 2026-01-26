/**
 * Agents Index
 *
 * Unified exports for all agent modules.
 * Includes AgentFactory, SubagentPool, ZeroAgent, UnifiedFactory, and RoleModels.
 *
 * @module agents
 */

'use strict';

const researchAgent = require('./researchAgent');
const planningAgent = require('./planningAgent');
const contextAgent = require('./contextAgent');
const factCheckAgent = require('./factCheckAgent');
const zeroAgent = require('./zeroAgent');
const factory = require('./factory');
const pool = require('./pool');
const roleModels = require('./roleModels');
const unifiedFactory = require('./unifiedFactory');
const openRouterClient = require('../utils/openRouterClient');

/**
 * Call OpenRouter API for chat completions
 * @param {Object} options - Call options
 * @param {string} options.model - Model ID
 * @param {Array} options.messages - Chat messages
 * @param {boolean} [options.stream=false] - Enable streaming
 * @returns {Promise<Object|AsyncGenerator>} Response or stream
 */
async function callOpenRouter({ model, messages, stream = false }) {
  if (stream) {
    return openRouterClient.streamChatCompletion(model, messages);
  }
  return openRouterClient.chatCompletion(model, messages);
}

module.exports = {
  // Research Agent
  ResearchAgent: researchAgent.ResearchAgent || researchAgent,
  createResearchAgent: researchAgent.createResearchAgent || (() => new (researchAgent.ResearchAgent || researchAgent)()),

  // Planning Agent
  PlanningAgent: planningAgent.PlanningAgent || planningAgent,
  createPlanningAgent: planningAgent.createPlanningAgent || (() => new (planningAgent.PlanningAgent || planningAgent)()),

  // Context Agent
  ContextAgent: contextAgent.ContextAgent || contextAgent,
  createContextAgent: contextAgent.createContextAgent || (() => new (contextAgent.ContextAgent || contextAgent)()),

  // Fact Check Agent
  FactCheckAgent: factCheckAgent.FactCheckAgent || factCheckAgent,
  createFactCheckAgent: factCheckAgent.createFactCheckAgent || (() => new (factCheckAgent.FactCheckAgent || factCheckAgent)()),

  // Agent Zero - Emergent Research Ensemble
  ZeroAgent: zeroAgent.ZeroAgent,
  EmergenceState: zeroAgent.EmergenceState,
  createZeroAgent: zeroAgent.createZeroAgent,
  getZeroAgent: zeroAgent.getZeroAgent,

  // Agent Factory - Per-session instantiation
  AgentFactory: factory.AgentFactory,
  AgentType: factory.AgentType,
  AgentState: factory.AgentState,
  getFactory: factory.getFactory,
  createSessionFactory: factory.createSessionFactory,

  // Subagent Pool - Dynamic spawning with backpressure
  SubagentPool: pool.SubagentPool,
  PoolState: pool.PoolState,
  Priority: pool.Priority,
  createPool: pool.createPool,
  getPool: pool.getPool,
  terminatePool: pool.terminatePool,

  // Role-Based Model Selection
  AgentRole: roleModels.AgentRole,
  CostPreference: roleModels.CostPreference,
  getRoleModel: roleModels.getRoleModel,
  getComplexityAllocation: roleModels.getComplexityAllocation,
  estimateComplexity: roleModels.estimateComplexity,
  getTaskConfig: roleModels.getTaskConfig,
  RoleModelSelector: roleModels.RoleModelSelector,

  // Unified Agent Factory - Role-based creation with combinator integration
  UnifiedAgentFactory: unifiedFactory.UnifiedAgentFactory,
  getUnifiedFactory: unifiedFactory.getUnifiedFactory,
  resetUnifiedFactory: unifiedFactory.resetUnifiedFactory,
  createSessionUnifiedFactory: unifiedFactory.createSessionUnifiedFactory,

  // OpenRouter API wrapper
  callOpenRouter
};
