const openRouterClient = require('./openRouterClient');
const NodeCache = require('node-cache');

// Cache model catalog for 30 minutes by default
const catalogCache = new NodeCache({ stdTTL: 1800, checkperiod: 120 });

function normalizeModelEntry(entry) {
  // Attempt to normalize capabilities where possible
  const id = entry.id || entry.name || entry.model || 'unknown';
  const provider = entry.provider || (id.includes('/') ? id.split('/')[0] : 'unknown');
  const capabilities = entry.capabilities || {};
  const modalities = entry.modalities || entry.modes || entry.input_modalities || [];
  const supportsVision = !!(capabilities.vision || (Array.isArray(modalities) && modalities.some(m => /image|vision/i.test(String(m)))) || /vision|multimodal|image/i.test(JSON.stringify(entry)));
  const supportsTools = !!(capabilities.tools || capabilities.functions || /tool|function/i.test(JSON.stringify(entry)));
  const contextWindow = entry.context_length || entry.context_window || null;
  const pricing = entry.pricing || entry.price || null;
  const releaseDateMatch = /(?:\b|[^0-9])(20\d{6})(?:\b|[^0-9])/.exec(id); // e.g., 20250725 in id
  const releaseDate = releaseDateMatch ? releaseDateMatch[1] : (entry.release_date || null);
  return {
    id,
    provider,
    label: entry.name || entry.label || id,
    capabilities: {
      vision: supportsVision,
      tools: supportsTools,
      contextWindow
    },
    modalities: Array.isArray(modalities) ? modalities : [],
    pricing,
    releaseDate,
    tags: entry.tags || []
  };
}

function hashCatalog(models) {
  try {
    const ids = models.map(m => m.id).sort();
    const json = JSON.stringify(ids);
    // Simple DJB2 hash for short, stable key
    let h = 5381;
    for (let i = 0; i < json.length; i++) h = ((h << 5) + h) + json.charCodeAt(i);
    return `h${(h >>> 0).toString(16)}`;
  } catch (_) {
    return `h0`;
  }
}

async function refresh() {
  const data = await openRouterClient.getModels();
  const models = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
  const normalized = models.map(normalizeModelEntry);
  const newHash = hashCatalog(normalized);
  const oldHash = catalogCache.get('catalog_hash');
  catalogCache.set('catalog', normalized);
  catalogCache.set('catalog_hash', newHash);
  catalogCache.set('last_refreshed_at', Date.now());
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

function getCatalogHash() {
  return catalogCache.get('catalog_hash') || null;
}

function getPreferred2025Models() {
  const catalog = catalogCache.get('catalog') || [];
  const patterns = [
    /qwen3/i,
    /gemini[-_\s]?2\.5/i,
    /grok[-_\s]?4/i,
    /gpt[-_\s]?5/i,
  ];
  const preferred = [];
  for (const p of patterns) {
    const match = catalog.find(m => p.test(m.id) || p.test(m.label));
    if (match) preferred.push(match);
  }
  return preferred;
}

module.exports = {
  refresh,
  getCatalog,
  findByCapability,
  getCatalogHash,
  getPreferred2025Models,
};
