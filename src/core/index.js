/**
 * Core Abstractions
 *
 * Unified exports for all core modules.
 */

const signal = require('./signal');
const normalize = require('./normalize');
const schemas = require('./schemas');
const roleShift = require('./roleShift');

module.exports = {
  // Signal Protocol
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
  coerceTypes: normalize.coerceTypes,
  GLOBAL_ALIASES: normalize.GLOBAL_ALIASES,
  TOOL_ALIASES: normalize.TOOL_ALIASES,
  DEFAULTS: normalize.DEFAULTS,

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
  createRoleShift: roleShift.createRoleShift
};
