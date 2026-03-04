// src/utils/providerTelemetry.js
'use strict';

const MAX_MODEL_ENTRIES = 50;

const state = {
  providers: {},
  lastUpdated: null
};

function ensureProvider(provider) {
  const key = provider || 'openrouter';
  if (!state.providers[key]) {
    state.providers[key] = {
      totals: {
        requests: 0,
        successes: 0,
        failures: 0,
        retries: 0,
        streams: 0
      },
      latency: {
        avgMs: 0,
        maxMs: 0,
        lastMs: 0
      },
      statusCodes: {},
      errorCategories: {},
      models: {},
      keyRotations: 0,
      fallbackAttempts: 0,
      lastError: null,
      lastUpdated: null
    };
  }
  return state.providers[key];
}

function ensureModel(providerState, model) {
  const key = model || 'unknown';
  if (!providerState.models[key]) {
    providerState.models[key] = {
      requests: 0,
      successes: 0,
      failures: 0,
      avgLatencyMs: 0,
      lastLatencyMs: 0,
      lastError: null
    };
  }
  return providerState.models[key];
}

function updateLatency(target, latencyMs) {
  if (!Number.isFinite(latencyMs)) return;
  target.lastMs = latencyMs;
  target.maxMs = Math.max(target.maxMs || 0, latencyMs);
  const prevAvg = target.avgMs || 0;
  const count = target.count || 0;
  const nextCount = count + 1;
  target.avgMs = prevAvg + (latencyMs - prevAvg) / nextCount;
  target.count = nextCount;
}

function recordRequest({ provider = 'openrouter', model, success, latencyMs, statusCode, errorCategory, stream = false, retry = false }) {
  const providerState = ensureProvider(provider);
  const modelState = ensureModel(providerState, model);

  providerState.totals.requests += 1;
  modelState.requests += 1;
  if (stream) providerState.totals.streams += 1;
  if (retry) providerState.totals.retries += 1;

  if (success) {
    providerState.totals.successes += 1;
    modelState.successes += 1;
  } else {
    providerState.totals.failures += 1;
    modelState.failures += 1;
  }

  updateLatency(providerState.latency, latencyMs);
  modelState.lastLatencyMs = latencyMs || modelState.lastLatencyMs;
  modelState.avgLatencyMs = modelState.avgLatencyMs || 0;
  if (Number.isFinite(latencyMs)) {
    const prevAvg = modelState.avgLatencyMs || 0;
    const count = modelState._latencyCount || 0;
    const nextCount = count + 1;
    modelState.avgLatencyMs = prevAvg + (latencyMs - prevAvg) / nextCount;
    modelState._latencyCount = nextCount;
  }

  if (statusCode) {
    providerState.statusCodes[statusCode] = (providerState.statusCodes[statusCode] || 0) + 1;
  }
  if (errorCategory) {
    providerState.errorCategories[errorCategory] = (providerState.errorCategories[errorCategory] || 0) + 1;
  }

  if (!success) {
    const errorDetails = {
      model: model || 'unknown',
      statusCode: statusCode || null,
      category: errorCategory || null,
      at: new Date().toISOString()
    };
    providerState.lastError = errorDetails;
    modelState.lastError = errorDetails;
  }

  providerState.lastUpdated = new Date().toISOString();
  state.lastUpdated = providerState.lastUpdated;

  const modelKeys = Object.keys(providerState.models);
  if (modelKeys.length > MAX_MODEL_ENTRIES) {
    const dropKey = modelKeys[0];
    delete providerState.models[dropKey];
  }
}

function recordFallback({ provider = 'openrouter', fromModel, toModel }) {
  const providerState = ensureProvider(provider);
  providerState.fallbackAttempts += 1;
  providerState.lastUpdated = new Date().toISOString();
  if (fromModel) ensureModel(providerState, fromModel);
  if (toModel) ensureModel(providerState, toModel);
}

function recordKeyRotation({ provider = 'openrouter' }) {
  const providerState = ensureProvider(provider);
  providerState.keyRotations += 1;
  providerState.lastUpdated = new Date().toISOString();
}

function getSnapshot(options = {}) {
  const includeModelsFlag = process.env.PROVIDER_TELEMETRY_MODELS;
  const includeModelsDefault = includeModelsFlag === undefined ? true : includeModelsFlag !== 'false';
  const { maxModels = 8, includeModels = includeModelsDefault } = options;
  const providers = {};
  for (const [name, info] of Object.entries(state.providers)) {
    const models = includeModels
      ? Object.entries(info.models)
        .slice(0, maxModels)
        .reduce((acc, [model, stats]) => {
          acc[model] = {
            requests: stats.requests,
            successes: stats.successes,
            failures: stats.failures,
            avgLatencyMs: Math.round(stats.avgLatencyMs || 0),
            lastLatencyMs: Math.round(stats.lastLatencyMs || 0),
            lastError: stats.lastError
          };
          return acc;
        }, {})
      : undefined;

    providers[name] = {
      totals: info.totals,
      latency: {
        avgMs: Math.round(info.latency.avgMs || 0),
        maxMs: Math.round(info.latency.maxMs || 0),
        lastMs: Math.round(info.latency.lastMs || 0)
      },
      statusCodes: info.statusCodes,
      errorCategories: info.errorCategories,
      keyRotations: info.keyRotations,
      fallbackAttempts: info.fallbackAttempts,
      lastError: info.lastError,
      lastUpdated: info.lastUpdated,
      models
    };
  }

  return {
    providers,
    lastUpdated: state.lastUpdated
  };
}

module.exports = {
  recordRequest,
  recordFallback,
  recordKeyRotation,
  getSnapshot
};
