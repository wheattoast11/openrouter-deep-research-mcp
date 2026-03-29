/**
 * MCP v3 preset gating — replaces MODE=AGENT|MANUAL|ALL for tool exposure.
 */
const logger = require('../utils/logger').child('McpToolSets');

const CONVERSATIONAL = new Set(['ask', 'status', 'job_get', 'cancel_job']);

/** Tools beyond conversational for power users / automation */
const DEVELOPER_EXTRA = new Set([
  'kb_search',
  'kb_query',
  'research_start',
  'batch_research',
  'get_report',
  'history',
  'agent',
  'zero_chat',
  'research',
  'retrieve'
]);

const VALID_PRESETS = new Set(['conversational', 'developer', 'enterprise']);

/**
 * Resolve preset from env (MCP_PRESET) with deprecated MODE shim.
 * @returns {'conversational'|'developer'|'enterprise'}
 */
function resolvePresetFromEnv() {
  let preset = (process.env.MCP_PRESET || 'conversational').toLowerCase().trim();
  if (process.env.MODE && String(process.env.MODE).trim()) {
    const m = String(process.env.MODE).toUpperCase();
    if (!process.env.MCP_PRESET) {
      logger.warn('MODE is deprecated; set MCP_PRESET instead. Mapping MODE to MCP_PRESET.', {
        MODE: m
      });
      if (m === 'AGENT') preset = 'conversational';
      else if (m === 'MANUAL') preset = 'developer';
      // ALL or anything else with MODE only → enterprise-style surface
      else preset = 'enterprise';
    } else {
      logger.warn('Both MODE and MCP_PRESET are set; MCP_PRESET wins.', {
        MODE: m,
        MCP_PRESET: preset
      });
    }
  }
  if (!VALID_PRESETS.has(preset)) {
    logger.warn('Unknown MCP_PRESET; falling back to conversational', { preset });
    preset = 'conversational';
  }
  return preset;
}

/**
 * @param {string} preset
 * @returns {'conversational'|'developer'|'enterprise'}
 */
function normalizePreset(preset) {
  const p = String(preset || 'conversational').toLowerCase().trim();
  return VALID_PRESETS.has(p) ? p : 'conversational';
}

/**
 * @param {string} toolName
 * @param {string} preset
 * @returns {boolean}
 */
function toolAllowedInPreset(toolName, preset) {
  const p = normalizePreset(preset);
  if (p === 'enterprise') return true;
  if (p === 'conversational') return CONVERSATIONAL.has(toolName);
  if (p === 'developer') return CONVERSATIONAL.has(toolName) || DEVELOPER_EXTRA.has(toolName);
  return false;
}

/**
 * Sorted tool list for tests / introspection
 * @param {string} preset
 * @returns {string[]}
 */
function listToolsForPreset(preset) {
  const p = normalizePreset(preset);
  if (p === 'enterprise') return ['*'];
  if (p === 'conversational') return [...CONVERSATIONAL].sort();
  const dev = new Set([...CONVERSATIONAL, ...DEVELOPER_EXTRA]);
  return [...dev].sort();
}

module.exports = {
  CONVERSATIONAL,
  DEVELOPER_EXTRA,
  VALID_PRESETS,
  resolvePresetFromEnv,
  normalizePreset,
  toolAllowedInPreset,
  listToolsForPreset
};
