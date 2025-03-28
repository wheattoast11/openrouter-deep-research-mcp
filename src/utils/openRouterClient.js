// src/utils/openRouterClient.js
const axios = require('axios');
const config = require('../../config');

class OpenRouterClient {
  constructor() {
    this.apiKey = config.openrouter.apiKey;
    this.baseUrl = config.openrouter.baseUrl;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'http://localhost:3002',
        'X-Title': 'OpenRouter Research Agents',
        'Content-Type': 'application/json'
      }
    });
  }

  async chatCompletion(model, messages, options = {}) {
    try {
      const response = await this.client.post('/chat/completions', {
        model,
        messages,
        ...options
      });
      
      return response.data;
    } catch (error) {
      console.error('Error calling OpenRouter API:', error.response?.data || error.message);
      throw error;
    }
  }

  async getModels() {
    try {
      const response = await this.client.get('/models');
      return response.data;
    } catch (error) {
      console.error('Error fetching models:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new OpenRouterClient();