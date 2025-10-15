// src/agents/multiAgentResearch.js
/**
 * Multi-Agent Research Orchestration
 * Parallel test-time compute with discovery, gate, deep-dive, and synthesis phases
 * 
 * Strategy:
 * 1. Discovery Phase - 8 parallel agents find sources
 * 2. Gate - Consolidate, deduplicate, rank (threshold: 0.7)
 * 3. Deep Dive - 4 parallel agents analyze selected sources
 * 4. Synthesis - Single agent synthesizes all findings
 */

// Polyfill: @terminals-tech/core@0.1.1 doesn't export BoundedExecutor yet
const { BoundedExecutor } = require('../utils/BoundedExecutor');
const researchAgent = require('./researchAgent');
const contextAgent = require('./contextAgent');
const dbClient = require('../utils/dbClient');

class MultiAgentResearch {
  constructor(options = {}) {
    this.discoveryAgents = options.discoveryAgents || 8;
    this.deepDiveAgents = options.deepDiveAgents || 4;
    this.gateThreshold = options.gateThreshold || 0.7;
    this.onEvent = options.onEvent || (() => {});
  }

  /**
   * Execute parallel research with all phases
   * @param {string} query - Research query
   * @param {object} options - Research options
   * @returns {Promise<object>} Synthesis result
   */
  async execute(query, options = {}) {
    const startTime = Date.now();
    const requestId = options.requestId || `multi-${Date.now()}`;
    
    console.error(`[${new Date().toISOString()}] [${requestId}] Multi-Agent Research starting for: "${query.substring(0, 50)}..."`);
    
    try {
      // Phase 1: Discovery
      await this.onEvent('phase', { phase: 'discovery', agents: this.discoveryAgents });
      const discoveries = await this._discoveryPhase(query, requestId);
      
      console.error(`[${new Date().toISOString()}] [${requestId}] Discovery complete: ${discoveries.length} sources found`);
      
      // Phase 2: Gate
      await this.onEvent('phase', { phase: 'gate', threshold: this.gateThreshold });
      const selected = await this._gatePhase(discoveries, query, requestId);
      
      console.error(`[${new Date().toISOString()}] [${requestId}] Gate complete: ${selected.length} sources selected`);
      
      // Phase 3: Deep Dive
      await this.onEvent('phase', { phase: 'deep_dive', agents: this.deepDiveAgents });
      const deepFindings = await this._deepDivePhase(selected, query, requestId);
      
      console.error(`[${new Date().toISOString()}] [${requestId}] Deep dive complete: ${deepFindings.length} findings`);
      
      // Phase 4: Synthesis
      await this.onEvent('phase', { phase: 'synthesis' });
      const synthesis = await this._synthesisPhase(deepFindings, query, requestId);
      
      console.error(`[${new Date().toISOString()}] [${requestId}] Synthesis complete in ${Date.now() - startTime}ms`);
      
      return {
        synthesis,
        metadata: {
          discoveryCount: discoveries.length,
          selectedCount: selected.length,
          findingsCount: deepFindings.length,
          durationMs: Date.now() - startTime,
          phases: ['discovery', 'gate', 'deep_dive', 'synthesis']
        }
      };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [${requestId}] Multi-Agent Research error:`, error);
      throw error;
    }
  }

  /**
   * Phase 1: Discovery - Parallel source discovery
   * @private
   */
  async _discoveryPhase(query, requestId) {
    const executor = new BoundedExecutor({ maxConcurrency: this.discoveryAgents });
    
    // Generate diverse sub-queries
    const subQueries = await this._generateSubQueries(query, this.discoveryAgents);
    
    // Execute discovery in parallel
    const results = await Promise.all(
      subQueries.map((subQuery, agentId) =>
        executor.submit(async () => {
          await this.onEvent('sub_agent_start', { agentId, query: subQuery });
          
          try {
            const result = await researchAgent.conductSingleResearch(subQuery, {
              costPreference: 'low',
              requestId: `${requestId}-discovery-${agentId}`,
              maxSources: 5
            });
            
            await this.onEvent('sub_agent_complete', { 
              agentId, 
              success: true,
              sourcesFound: result.sources?.length || 0
            });
            
            return {
              agentId,
              query: subQuery,
              sources: result.sources || [],
              finding: result.finding || ''
            };
          } catch (error) {
            await this.onEvent('sub_agent_error', { agentId, error: error.message });
            return { agentId, query: subQuery, sources: [], error: error.message };
          }
        })
      )
    );
    
    // Flatten sources from all agents
    const allSources = [];
    for (const result of results) {
      if (result.sources) {
        allSources.push(...result.sources);
      }
    }
    
    return allSources;
  }

  /**
   * Phase 2: Gate - Filter and rank sources
   * @private
   */
  async _gatePhase(sources, query, requestId) {
    // Deduplicate by URL
    const uniqueSources = this._deduplicateSources(sources);
    
    console.error(`[${new Date().toISOString()}] [${requestId}] Deduplicated: ${sources.length} → ${uniqueSources.length}`);
    
    // Rank by relevance
    const ranked = await this._rankSources(uniqueSources, query);
    
    // Filter by threshold
    const selected = ranked.filter(s => s.score >= this.gateThreshold);
    
    // Take top sources if we have too many
    const maxSources = this.deepDiveAgents * 3; // 3 sources per deep-dive agent
    const final = selected.slice(0, maxSources);
    
    await this.onEvent('gate_complete', {
      totalSources: sources.length,
      uniqueSources: uniqueSources.length,
      aboveThreshold: selected.length,
      selected: final.length
    });
    
    return final;
  }

  /**
   * Phase 3: Deep Dive - Detailed analysis of selected sources
   * @private
   */
  async _deepDivePhase(sources, query, requestId) {
    const executor = new BoundedExecutor({ maxConcurrency: this.deepDiveAgents });
    
    const findings = await Promise.all(
      sources.map((source, index) =>
        executor.submit(async () => {
          await this.onEvent('deep_dive_start', { sourceIndex: index, url: source.url });
          
          try {
            const analysis = await researchAgent.analyzeSingleSource(source, query, {
              costPreference: 'low',
              requestId: `${requestId}-deep-${index}`,
              depth: 'comprehensive'
            });
            
            await this.onEvent('deep_dive_complete', {
              sourceIndex: index,
              success: true,
              insightsExtracted: analysis.insights?.length || 0
            });
            
            return analysis;
          } catch (error) {
            await this.onEvent('deep_dive_error', { sourceIndex: index, error: error.message });
            return { source, error: error.message, insights: [] };
          }
        })
      )
    );
    
    return findings;
  }

  /**
   * Phase 4: Synthesis - Combine all findings
   * @private
   */
  async _synthesisPhase(findings, query, requestId) {
    // Prepare findings for synthesis
    const allInsights = findings.flatMap(f => f.insights || []);
    
    // Use context agent for synthesis
    const synthesis = await contextAgent.contextualizeResults(
      query,
      findings.map(f => ({
        result: f.analysis || f.finding || '',
        source: f.source?.url,
        confidence: f.confidence || 0.8
      })),
      [], // agent queries
      {
        audienceLevel: 'expert',
        outputFormat: 'report',
        includeSources: true
      },
      requestId
    );
    
    return {
      text: synthesis,
      insights: allInsights,
      sources: findings.map(f => f.source).filter(Boolean),
      confidence: this._calculateConfidence(findings)
    };
  }

  /**
   * Generate sub-queries for parallel discovery
   * @private
   */
  async _generateSubQueries(query, count) {
    const openRouterClient = require('../utils/openRouterClient');
    const config = require('../../config');
    
    try {
      const prompt = `Break down this research query into ${count} diverse, focused sub-queries that explore different aspects:

"${query}"

Return ONLY a JSON object with a "queries" array of ${count} strings.
Each sub-query should explore a unique angle or facet.

Format: {"queries": ["sub-query 1", "sub-query 2", ...]}`;
      
      const response = await openRouterClient.chatCompletion(
        config.models.computerUse.speed,
        [{ role: 'user', content: prompt }],
        { temperature: 0.4, max_tokens: 800, response_format: { type: 'json_object' } }
      );
      
      const result = JSON.parse(response.choices[0].message.content);
      const queries = result.queries || result.subQueries || [];
      
      // Ensure we have enough queries
      if (queries.length < count) {
        while (queries.length < count) {
          queries.push(query + ` (aspect ${queries.length + 1})`);
        }
      }
      
      return queries.slice(0, count);
    } catch (error) {
      console.error('Sub-query generation error:', error);
      // Fallback: repeat main query
      return Array(count).fill(query);
    }
  }

  /**
   * Deduplicate sources by URL
   * @private
   */
  _deduplicateSources(sources) {
    const seen = new Set();
    const unique = [];
    
    for (const source of sources) {
      const url = source.url || source.link || source.href;
      if (url && !seen.has(url)) {
        seen.add(url);
        unique.push(source);
      }
    }
    
    return unique;
  }

  /**
   * Rank sources by relevance to query
   * @private
   */
  async _rankSources(sources, query) {
    const queryEmbedding = await dbClient.generateEmbedding(query);
    
    if (!queryEmbedding) {
      // Fallback: return sources with default score
      return sources.map(s => ({ ...s, score: 0.5 }));
    }
    
    const ranked = [];
    
    for (const source of sources) {
      // Create source description for embedding
      const description = `${source.title || ''} ${source.description || source.snippet || ''}`;
      const sourceEmbedding = await dbClient.generateEmbedding(description);
      
      let score = 0.5; // default
      
      if (sourceEmbedding) {
        // Calculate cosine similarity
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < queryEmbedding.length; i++) {
          dot += queryEmbedding[i] * sourceEmbedding[i];
          normA += queryEmbedding[i] * queryEmbedding[i];
          normB += sourceEmbedding[i] * sourceEmbedding[i];
        }
        score = dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
      }
      
      ranked.push({ ...source, score });
    }
    
    // Sort by score descending
    ranked.sort((a, b) => b.score - a.score);
    
    return ranked;
  }

  /**
   * Calculate overall confidence from findings
   * @private
   */
  _calculateConfidence(findings) {
    if (findings.length === 0) return 0.5;
    
    const sum = findings.reduce((acc, f) => acc + (f.confidence || 0.8), 0);
    return sum / findings.length;
  }
}

module.exports = MultiAgentResearch;



