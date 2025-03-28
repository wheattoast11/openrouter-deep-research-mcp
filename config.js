require('dotenv').config();

const config = {
  server: {
    port: process.env.PORT || 3002,
    name: "openrouter_agents",
    version: "1.0.0"
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: "https://openrouter.ai/api/v1"
  },
  models: {
    planning: "anthropic/claude-3-7-sonnet:thinking",
    highCost: process.env.HIGH_COST_MODELS ? 
      process.env.HIGH_COST_MODELS.split(',') : [
        "perplexity/sonar-deep-research",
        "perplexity/sonar-pro",
        "perplexity/sonar-reasoning-pro",
        "openai/gpt-4o-search-preview"
      ],
    lowCost: process.env.LOW_COST_MODELS ? 
      process.env.LOW_COST_MODELS.split(',') : [
        "perplexity/sonar-reasoning",
        "openai/gpt-4o-mini-search-preview",
        "google/gemini-2.0-flash-001"
      ]
  }
};

module.exports = config;