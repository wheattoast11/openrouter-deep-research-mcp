/**
 * Bridge Layer
 *
 * Provides message routing and phase-lock protocol for multi-agent orchestration.
 *
 * @module core/bridge
 */

'use strict';

const phaseLock = require('./phaseLock');
const zeroBridge = require('./zeroBridge');

module.exports = {
  // Phase-Lock Protocol
  PhaseLockState: phaseLock.PhaseLockState,
  PhaseLockMessage: phaseLock.PhaseLockMessage,
  PhaseLockStateMachine: phaseLock.PhaseLockStateMachine,
  createOrchestratorPhaseLock: phaseLock.createOrchestratorPhaseLock,
  createAgentPhaseLock: phaseLock.createAgentPhaseLock,
  generateNonce: phaseLock.generateNonce,
  createChallengeResponse: phaseLock.createChallengeResponse,
  verifyChallengeResponse: phaseLock.verifyChallengeResponse,
  DEFAULT_TIMEOUT: phaseLock.DEFAULT_TIMEOUT,

  // Zero Bridge
  ZeroBridge: zeroBridge.ZeroBridge,
  AgentConnection: zeroBridge.AgentConnection,
  AgentState: zeroBridge.AgentState,
  BridgeMessage: zeroBridge.BridgeMessage
};
