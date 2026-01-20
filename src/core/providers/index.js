// src/core/providers/index.js
'use strict';

const openRouterClient = require('../../utils/openRouterClient');

class ProviderManager {
  constructor() {
    this.defaultProvider = 'openrouter';
  }

  async chat(model, messages, options = {}) {
    return openRouterClient.chatCompletion(model, messages, options);
  }

  stream(model, messages, options = {}) {
    return openRouterClient.streamChatCompletion(model, messages, options);
  }

  async getModels() {
    return openRouterClient.getModels();
  }

  health() {
    if (typeof openRouterClient.getDegradedLevel === 'function') {
      return {
        provider: this.defaultProvider,
        degradedLevel: openRouterClient.getDegradedLevel(),
        lastFailureStatus: openRouterClient.getLastFailureStatus?.() || null
      };
    }
    return { provider: this.defaultProvider, degradedLevel: 'unknown', lastFailureStatus: null };
  }
}

module.exports = new ProviderManager();
