require('dotenv').config();

const config = {
  server: {
    // Support both SERVER_PORT and PORT, prefer SERVER_PORT if present
    port: process.env.SERVER_PORT || process.env.PORT || 3002,
    name: "openrouter_agents",
    version: "1.0.0",
    // Add a key for basic server authentication (optional)
    apiKey: process.env.SERVER_API_KEY || null 
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: "https://openrouter.ai/api/v1"
  },
  models: {
    // Allow overriding planning model; fall back to previous default if set, else a generally-available safe default
    planning: process.env.PLANNING_MODEL || "google/gemini-2.5-pro-exp-03-25:free", // Model for planning and synthesis
    // Define models with domain strengths
    // Accept either JSON array of objects or CSV of model ids in env vars
    highCost: process.env.HIGH_COST_MODELS ? 
      (function parseHighCost(val){
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed;
        } catch(_) {}
        // CSV fallback -> wrap ids as objects without explicit domains
        return String(val).split(',').map(s=>s.trim()).filter(Boolean).map(name=>({ name, domains: ["general"] }));
      })(process.env.HIGH_COST_MODELS) : [
        { name: "perplexity/sonar-deep-research", domains: ["search", "general"] },
        { name: "perplexity/sonar-pro", domains: ["search", "general"] },
        { name: "anthropic/claude-3.7-sonnet:thinking", domains: ["reasoning", "technical"] },
        { name: "openai/gpt-4o-search-preview", domains: ["search", "general", "technical", "reasoning", "creative"] }
      ],
    lowCost: process.env.LOW_COST_MODELS ? 
      (function parseLowCost(val){
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed;
        } catch(_) {}
        return String(val).split(',').map(s=>s.trim()).filter(Boolean).map(name=>({ name, domains: ["general"] }));
      })(process.env.LOW_COST_MODELS) : [
        { name: "perplexity/sonar-reasoning", domains: ["reasoning", "general"] },
        { name: "openai/gpt-4o-mini-search-preview", domains: ["search", "general", "reasoning"] },
         { name: "google/gemini-2.0-flash-001", domains: ["general", "creative"] }
       ],
    // Define a tier for potentially simpler tasks (adjust models as needed)
    veryLowCost: process.env.VERY_LOW_COST_MODELS ?
       (function parseVeryLow(val){
         try {
           const parsed = JSON.parse(val);
           if (Array.isArray(parsed)) return parsed;
         } catch(_) {}
         return String(val).split(',').map(s=>s.trim()).filter(Boolean).map(name=>({ name, domains: ["general"] }));
       })(process.env.VERY_LOW_COST_MODELS) : [
         { name: "google/gemini-2.0-flash-001", domains: ["general", "reasoning", "creative"] }, // Example, Haiku is often cost-effective
         // Add other very cheap models if available, e.g., specific fine-tunes
       ],
     // Add a model specifically for classification tasks if needed, or reuse planning model
     classification: process.env.CLASSIFICATION_MODEL || "anthropic/claude-3-5-haiku",
     // Default ensemble size for research agent model ensembles
     ensembleSize: parseInt(process.env.ENSEMBLE_SIZE, 10) || 2,
     // Max research iterations (initial + refinements)
     maxResearchIterations: parseInt(process.env.MAX_RESEARCH_ITERATIONS, 10) || 2 // Default to 1 initial + 1 refinement
  },
  // Database configuration for knowledge base using PGLite
  database: {
    dataDirectory: process.env.PGLITE_DATA_DIR || "./researchAgentDB",
    vectorDimension: 384, // Dimension for the embeddings from all-MiniLM-L6-v2
    cacheTTL: parseInt(process.env.CACHE_TTL_SECONDS, 10) || 3600, // 1 hour in seconds
    // Enhanced PGLite configuration
    databaseUrl: process.env.PGLITE_DATABASE_URL || null, // Override auto-detected URL
    relaxedDurability: process.env.PGLITE_RELAXED_DURABILITY === 'false' ? false : true, // Default to true; allow explicit disable
    maxRetryAttempts: parseInt(process.env.PGLITE_MAX_RETRY_ATTEMPTS, 10) || 3, // Default to 3 retry attempts
    retryDelayBaseMs: parseInt(process.env.PGLITE_RETRY_DELAY_BASE_MS, 10) || 200, // Base delay in milliseconds
    allowInMemoryFallback: process.env.PGLITE_ALLOW_IN_MEMORY_FALLBACK === 'false' ? false : true // Default to true
  },
  // Configuration for where to save full research reports
  reportOutputPath: process.env.REPORT_OUTPUT_PATH || './research_outputs/'
};

module.exports = config;
