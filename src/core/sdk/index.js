/**
 * Claude Agents SDK Integration
 *
 * Unified exports for SDK adapter layer that bridges Claude SDK patterns
 * to terminals.tech native abstractions (Signal/Rail/HVM).
 *
 * @module core/sdk
 */

'use strict';

const adapter = require('./adapter');
const messageTransformer = require('./messageTransformer');

// Lazy-load optional modules to avoid circular dependencies
let agentBridge = null;
let toolRegistry = null;
let sessionManager = null;
let subagentFactory = null;

function getAgentBridge() {
  if (!agentBridge) {
    try {
      agentBridge = require('./agentBridge');
    } catch (e) {
      // Module not yet implemented
      agentBridge = { available: false };
    }
  }
  return agentBridge;
}

function getToolRegistry() {
  if (!toolRegistry) {
    try {
      toolRegistry = require('./toolRegistry');
    } catch (e) {
      // Module not yet implemented
      toolRegistry = { available: false };
    }
  }
  return toolRegistry;
}

function getSessionManager() {
  if (!sessionManager) {
    try {
      sessionManager = require('./sessionManager');
    } catch (e) {
      // Module not yet implemented
      sessionManager = { available: false };
    }
  }
  return sessionManager;
}

function getSubagentFactory() {
  if (!subagentFactory) {
    try {
      subagentFactory = require('./subagentFactory');
    } catch (e) {
      // Module not yet implemented
      subagentFactory = { available: false };
    }
  }
  return subagentFactory;
}

module.exports = {
  // Core SDK Adapter
  SDKAdapter: adapter.SDKAdapter,
  SDKSession: adapter.SDKSession,
  createSDKAdapter: adapter.createSDKAdapter,
  SDK_DEFAULTS: adapter.DEFAULTS,

  // Message Transformer (Signal ↔ SDK isomorphism)
  MessageTransformer: messageTransformer.MessageTransformer,
  createMessageTransformer: messageTransformer.createMessageTransformer,
  SDKMessageType: messageTransformer.SDKMessageType,
  SDK_TO_SIGNAL_TYPE: messageTransformer.SDK_TO_SIGNAL_TYPE,
  SIGNAL_TO_SDK_TYPE: messageTransformer.SIGNAL_TO_SDK_TYPE,

  // Lazy-loaded modules
  getAgentBridge,
  getToolRegistry,
  getSessionManager,
  getSubagentFactory
};
