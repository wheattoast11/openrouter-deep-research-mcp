// src/server/tools.js
const { z } = require('zod');
const planningAgent = require('../agents/planningAgent');
const researchAgent = require('../agents/researchAgent');
const contextAgent = require('../agents/contextAgent');
const { parseAgentXml } = require('../utils/xmlParser');

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

function getCacheKey(params) {
  // Create a deterministic key from params
  return JSON.stringify({
    query: params.query,
    costPreference: params.costPreference,
    audienceLevel: params.audienceLevel,
    outputFormat: params.outputFormat,
    includeSources: params.includeSources
  });
}

function getFromCache(key) {
  if (!cache.has(key)) return null;
  
  const cached = cache.get(key);
  const now = Date.now();
  
  // Check if cache entry is expired
  if (now - cached.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  
  console.error(`Cache hit for key: ${key.substring(0, 40)}...`);
  return cached.data;
}

function setInCache(key, data) {
  // Prevent cache from growing too large (max 100 entries)
  if (cache.size >= 100) {
    // Delete oldest entry
    const oldestKey = [...cache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
    cache.delete(oldestKey);
  }
  
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

const conductResearchSchema = z.object({
  query: z.string().min(1, "Query must not be empty"),
  costPreference: z.enum(['high', 'low']).default('low'),
  audienceLevel: z.enum(['beginner', 'intermediate', 'expert']).default('intermediate'),
  outputFormat: z.enum(['report', 'briefing', 'bullet_points']).default('report'),
  includeSources: z.boolean().default(true),
  maxLength: z.number().optional()
});

async function conductResearch(params) {
  const { query, costPreference, audienceLevel, outputFormat, includeSources, maxLength } = params;
  
  // Check cache first
  const cacheKey = getCacheKey(params);
  const cachedResult = getFromCache(cacheKey);
  if (cachedResult) {
    console.error('Returning cached research result');
    return cachedResult;
  }
  
  // Track research progress
  let progress = {
    stage: 'planning',
    completed: 0,
    total: 4, // planning, querying, researching, contextualizing
    startTime: Date.now()
  };
  
  try {
    // Step 1: Plan research using Claude to break down into sub-queries
    console.error('Planning research...');
    const planningResult = await planningAgent.planResearch(query, {
      maxAgents: params.maxAgents || 5,
      focusAreas: params.focusAreas
    });
    
    progress.stage = 'parsing';
    progress.completed = 1;
    console.error(`Progress: ${progress.completed}/${progress.total} (${progress.stage})`);
    
    // Step 2: Parse the XML output to extract agent queries
    const agentQueries = parseAgentXml(planningResult);
    
    if (agentQueries.length === 0) {
      throw new Error('Failed to parse research plan. No agent queries found.');
    }
    
    console.error(`Planned ${agentQueries.length} research queries`);
    
    // Step 3: Conduct research for each agent
    progress.stage = 'researching';
    progress.completed = 2;
    console.error(`Progress: ${progress.completed}/${progress.total} (${progress.stage})`);
    console.error('Conducting research...');
    
    // Try with primary model cost preference
    let researchResults;
    try {
      researchResults = await researchAgent.conductParallelResearch(agentQueries, costPreference);
    } catch (error) {
      // If high cost fails, try with low cost as fallback
      if (costPreference === 'high') {
        console.error('High-cost research failed, falling back to low-cost models');
        researchResults = await researchAgent.conductParallelResearch(agentQueries, 'low');
      } else {
        throw error;
      }
    }
    
    // Update progress
    progress.stage = 'contextualizing';
    progress.completed = 3;
    console.error(`Progress: ${progress.completed}/${progress.total} (${progress.stage})`);
    
    // Step 4: Contextualize results
    console.error('Contextualizing results...');
    const finalReport = await contextAgent.contextualizeResults(
      query, 
      researchResults, 
      {
        audienceLevel,
        outputFormat,
        includeSources,
        maxLength
      }
    );
    
    // Store in cache
    setInCache(cacheKey, finalReport);
    
    // Calculate and log metrics
    const duration = Date.now() - progress.startTime;
    console.error(`Research completed in ${(duration / 1000).toFixed(2)}s with ${agentQueries.length} agents`);
    
    return finalReport;
  } catch (error) {
    console.error('Error in conductResearch tool:', error);
    throw new Error(`Research failed: ${error.message}`);
  }
}

module.exports = {
  conductResearchSchema,
  conductResearch
};