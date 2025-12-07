// src/utils/advancedCache.js
// Advanced caching system with semantic similarity and cost optimization

const NodeCache = require('node-cache');
const crypto = require('crypto');
const dbClient = require('./dbClient');
const config = require('../../config');

class AdvancedCache {
  constructor() {
    // Multi-tier caching system
    this.resultCache = new NodeCache({ 
      stdTTL: config.caching?.results?.ttlSeconds || 7200,
      maxKeys: config.caching?.results?.maxEntries || 1000,
      checkperiod: 600 // Check for expired keys every 10 minutes
    });
    
    this.modelCache = new NodeCache({
      stdTTL: config.caching?.models?.ttlSeconds || 3600,
      maxKeys: config.caching?.models?.maxEntries || 500,
      checkperiod: 300 // Check for expired keys every 5 minutes
    });

    this.similarityThreshold = config.caching?.results?.similarityThreshold || 0.85;
    this.enabled = config.caching?.results?.enabled !== false;
  }

  // Generate semantic cache key with query normalization
  generateSemanticKey(query, params = {}) {
    const normalizedQuery = query.toLowerCase().trim();
    const sortedParams = Object.keys(params).sort().reduce((obj, key) => {
      obj[key] = params[key];
      return obj;
    }, {});
    
    const content = `${normalizedQuery}:${JSON.stringify(sortedParams)}`;
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  // Check for semantically similar cached results
  async findSimilarResult(query, params = {}) {
    if (!this.enabled) return null;

    try {
      // First check exact match
      const exactKey = this.generateSemanticKey(query, params);
      const exactMatch = this.resultCache.get(exactKey);
      if (exactMatch) {
        console.error(`[${new Date().toISOString()}] AdvancedCache: Exact cache hit for query "${query.substring(0, 50)}..."`);
        return { ...exactMatch, cacheType: 'exact' };
      }

      // Check semantic similarity using database vector search
      const similar = await dbClient.findReportsBySimilarity(query, 3, this.similarityThreshold);
      if (similar && similar.length > 0) {
        const bestMatch = similar[0];
        const sim = typeof bestMatch.similarityScore === 'number' ? bestMatch.similarityScore : (bestMatch.similarity || 0);
        const reportId = String(bestMatch.id || bestMatch._id || '');
        const content = bestMatch.final_report || bestMatch.finalReport || '';
        const originalQuery = bestMatch.original_query || bestMatch.originalQuery || '';

        // CRITICAL: Validate similarity is actually high enough before returning cached result
        // This prevents returning unrelated cached content
        if (sim < this.similarityThreshold) {
          console.error(`[${new Date().toISOString()}] AdvancedCache: Rejecting low-similarity match (${sim?.toFixed ? sim.toFixed(3) : sim} < ${this.similarityThreshold}). Query: "${query.substring(0, 50)}..." Cached: "${originalQuery.substring(0, 50)}..."`);
          return null; // Force fresh research
        }

        console.error(`[${new Date().toISOString()}] AdvancedCache: Semantic cache hit (similarity: ${sim?.toFixed ? sim.toFixed(3) : sim}) for query "${query.substring(0, 50)}..." matched cached query "${originalQuery.substring(0, 40)}..."`);

        // Cache the semantic match for future exact retrieval
        this.resultCache.set(exactKey, {
          result: content,
          reportId: reportId,
          similarity: sim,
          originalQuery: originalQuery,
          timestamp: new Date().toISOString()
        });

        return {
          result: content,
          reportId: reportId,
          cacheType: 'semantic',
          similarity: sim
        };
      }

      console.error(`[${new Date().toISOString()}] AdvancedCache: Cache miss for query "${query.substring(0, 50)}..."`);
      return null;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] AdvancedCache: Error checking cache:`, error);
      return null;
    }
  }

  // Store result with semantic enrichment
  async storeResult(query, params, result, reportId = null) {
    if (!this.enabled) return;

    try {
      const key = this.generateSemanticKey(query, params);
      const cacheEntry = {
        result,
        reportId,
        query,
        params,
        timestamp: new Date().toISOString(),
        cost: this.calculateCost(result) // Estimate cost for tracking
      };

      this.resultCache.set(key, cacheEntry);
      console.error(`[${new Date().toISOString()}] AdvancedCache: Stored result for query "${query.substring(0, 50)}..." (key: ${key})`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] AdvancedCache: Error storing result:`, error);
    }
  }

  // Model response caching for repeated API calls
  cacheModelResponse(model, messages, response) {
    if (!this.enabled) return;

    const key = this.generateModelKey(model, messages);
    this.modelCache.set(key, {
      response,
      model,
      timestamp: new Date().toISOString(),
      usage: response.usage
    });
  }

  getCachedModelResponse(model, messages) {
    if (!this.enabled) return null;

    const key = this.generateModelKey(model, messages);
    return this.modelCache.get(key);
  }

  generateModelKey(model, messages) {
    const content = `${model}:${JSON.stringify(messages)}`;
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  // Cost estimation for cache value assessment
  calculateCost(result) {
    const estimatedTokens = Math.ceil((result?.length || 0) / 4); // Rough token estimate
    return estimatedTokens * 0.000001; // Rough cost estimate
  }

  // Get cache statistics for monitoring
  getStats() {
    return {
      results: {
        keys: this.resultCache.keys().length,
        hits: this.resultCache.getStats().hits,
        misses: this.resultCache.getStats().misses,
        size: this.resultCache.getStats().vsize
      },
      models: {
        keys: this.modelCache.keys().length,
        hits: this.modelCache.getStats().hits,
        misses: this.modelCache.getStats().misses,
        size: this.modelCache.getStats().vsize
      },
      config: {
        enabled: this.enabled,
        similarityThreshold: this.similarityThreshold,
        resultTTL: config.caching?.results?.ttlSeconds || 7200,
        modelTTL: config.caching?.models?.ttlSeconds || 3600
      }
    };
  }

  // Clear cache (for maintenance)
  clear(type = 'all') {
    if (type === 'all' || type === 'results') {
      this.resultCache.flushAll();
    }
    if (type === 'all' || type === 'models') {
      this.modelCache.flushAll();
    }
    console.error(`[${new Date().toISOString()}] AdvancedCache: Cleared ${type} cache`);
  }
}

module.exports = new AdvancedCache();
