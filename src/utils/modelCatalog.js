const openRouterClient = require('./openRouterClient');
const NodeCache = require('node-cache');

// Cache model catalog for 30 minutes by default
const catalogCache = new NodeCache({ stdTTL: 1800, checkperiod: 120 });

function normalizeModelEntry(entry) {
  // Attempt to normalize capabilities where possible
  const id = entry.id || entry.name || entry.model || 'unknown';
  const provider = entry.provider || (id.includes('/') ? id.split('/')[0] : 'unknown');
  const capabilities = entry.capabilities || {};
  const supportsVision = !!(capabilities.vision || /vision|multimodal|image/i.test(JSON.stringify(entry)));
  const supportsTools = !!(capabilities.tools || capabilities.functions || /tool|function/i.test(JSON.stringify(entry)));
  const contextWindow = entry.context_length || entry.context_window || null;
  const pricing = entry.pricing || entry.price || null;
  return {
    id,
    provider,
    label: entry.name || entry.label || id,
    capabilities: {
      vision: supportsVision,
      tools: supportsTools,
      contextWindow
    },
    pricing
  };
}

async function refresh() {
  const data = await openRouterClient.getModels();
  const models = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
  const normalized = models.map(normalizeModelEntry);
  catalogCache.set('catalog', normalized);
  return normalized;
}

async function getCatalog() {
  const cached = catalogCache.get('catalog');
  if (cached) return cached;
  return refresh();
}

function findByCapability({ vision = null, tools = null } = {}) {
  const catalog = catalogCache.get('catalog') || [];
  return catalog.filter(m => {
    let ok = true;
    if (vision !== null) ok = ok && !!m.capabilities.vision === !!vision;
    if (tools !== null) ok = ok && !!m.capabilities.tools === !!tools;
    return ok;
  });
}

module.exports = {
  refresh,
  getCatalog,
  findByCapability,
};
