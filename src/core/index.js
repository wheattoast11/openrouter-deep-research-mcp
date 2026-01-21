/**
 * Core Abstractions
 *
 * Unified exports for all core modules.
 */

const signal = require('./signal');
const normalize = require('./normalize');
const schemas = require('./schemas');
const roleShift = require('./roleShift');
const coreConfig = require('./config');
const context = require('./context');
const validation = require('./middleware/validation');
const responseEnvelope = require('./responseEnvelope');
const router = require('./router');
const rail = require('./rail');
const embeddedClient = require('./embeddedClient');
const heartbeat = require('./heartbeat');

// SDK Adapter (lazy-loaded to avoid circular deps)
let sdk = null;

function getSDK() {
  if (!sdk) {
    sdk = require('./sdk');
  }
  return sdk;
}

// Transport and Bridge (loaded lazily to avoid circular deps)
let transport = null;
let bridge = null;

function getTransport() {
  if (!transport) {
    transport = require('./transport');
  }
  return transport;
}

function getBridge() {
  if (!bridge) {
    bridge = require('./bridge');
  }
  return bridge;
}

module.exports = {
  // Core Configuration Factory
  getConfig: coreConfig.getConfig,
  createConfig: coreConfig.createConfig,
  CONFIG_DEFAULTS: coreConfig.DEFAULTS,

  // Context Factory
  DOMAIN_REQUIREMENTS: context.DOMAIN_REQUIREMENTS,
  validateContext: context.validateContext,
  contextFactory: context.contextFactory,
  mergeContext: context.mergeContext,
  getGraphClient: context.getGraphClient,

  // Validation Middleware
  isValidationEnabled: validation.isValidationEnabled,
  withValidation: validation.withValidation,
  validateParamsMiddleware: validation.validateParams,

  // Signal Protocol (SDK-aligned: AgentSignal)
  AgentSignal: signal.AgentSignal,
  // Backward compatibility alias (deprecated)
  Signal: signal.Signal,
  SignalType: signal.SignalType,
  SignalBus: signal.SignalBus,
  ConsensusCalculator: signal.ConsensusCalculator,
  ModelWeights: signal.ModelWeights,
  CrystallizationPatterns: signal.CrystallizationPatterns,
  extractCrystallization: signal.extractCrystallization,

  // Parameter Normalization
  normalize: normalize.normalize,
  applyAliases: normalize.applyAliases,
  validateRequired: normalize.validateRequired,
  validateParams: normalize.validateParams,
  coerceTypes: normalize.coerceTypes,
  GLOBAL_ALIASES: normalize.GLOBAL_ALIASES,
  TOOL_ALIASES: normalize.TOOL_ALIASES,
  DEFAULTS: normalize.DEFAULTS,
  PARAM_RULES: normalize.PARAM_RULES,

  // Schema Registry
  Schemas: schemas.Schemas,
  getSchema: schemas.getSchema,
  validate: schemas.validate,
  safeValidate: schemas.safeValidate,
  BaseSchemas: schemas.Base,
  ResearchSchemas: schemas.Research,
  KBSchemas: schemas.KB,
  JobSchemas: schemas.Job,
  GraphSchemas: schemas.Graph,
  SessionSchemas: schemas.Session,

  // RoleShift Protocol
  RoleMode: roleShift.RoleMode,
  RoleShiftProtocol: roleShift.RoleShiftProtocol,
  createRoleShift: roleShift.createRoleShift,

  // Response Envelope
  ResponseEnvelope: responseEnvelope.ResponseEnvelope,
  Responses: responseEnvelope.Responses,

  // Semantic Router (Agent Zero)
  SemanticRouter: router.SemanticRouter,
  RouteType: router.RouteType,
  ModelProfiles: router.ModelProfiles,
  ClassificationPatterns: router.ClassificationPatterns,
  createRouter: router.createRouter,
  defaultRouter: router.defaultRouter,

  // Transport Layer (lazy-loaded)
  getTransport,

  // Bridge Layer (lazy-loaded)
  getBridge,

  // Rail Protocol
  Rail: rail.Rail,
  Token: rail.Token,
  Switch: rail.Switch,
  // SDK-compatible Result types (preferred)
  ok: rail.ok,
  err: rail.err,
  isOk: rail.isOk,
  isErr: rail.isErr,
  // Backward compatibility aliases (deprecated)
  Ok: rail.Ok,
  Err: rail.Err,
  // Error types
  BackpressureError: rail.BackpressureError,
  RailClosedError: rail.RailClosedError,
  tokenFromSignal: rail.tokenFromSignal,
  signalFromToken: rail.signalFromToken,

  // Embedded MCP Client (Void Simulation)
  EmbeddedMcpClient: embeddedClient.EmbeddedMcpClient,
  createEmbeddedClient: embeddedClient.createEmbeddedClient,

  // Heartbeat Monitor (Agent Liveness)
  HeartbeatMonitor: heartbeat.HeartbeatMonitor,
  AgentHeartbeat: heartbeat.AgentHeartbeat,
  createHeartbeatMonitor: heartbeat.createHeartbeatMonitor,
  HeartbeatState: heartbeat.HeartbeatState,

  // SDK Adapter (lazy-loaded)
  getSDK
};
