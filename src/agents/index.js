/**
 * Agents Index
 *
 * Unified exports for all agent modules.
 */

const researchAgent = require('./researchAgent');
const planningAgent = require('./planningAgent');
const contextAgent = require('./contextAgent');
const factCheckAgent = require('./factCheckAgent');
const zeroAgent = require('./zeroAgent');

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
  createZeroAgent: zeroAgent.createZeroAgent
};
