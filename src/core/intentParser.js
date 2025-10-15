// src/core/intentParser.js
/**
 * Intent Parser - Fast, local intent understanding
 * 
 * Parses user queries to understand:
 * - What they want (intent)
 * - How complex it is (complexity)
 * - How novel it is (novelty)
 * - What entities are involved
 * 
 * Target: <50ms with local processing
 */

/**
 * Parse intent from query
 * @param {string} query - User's research question
 * @param {object} options - Additional context
 * @returns {Promise<object>} Parsed intent with confidence
 */
async function parseIntent(query, options = {}) {
  const startTime = Date.now();
  
  try {
    // Step 1: Fast heuristic analysis
    const heuristics = analyzeHeuristics(query);
    
    // Step 2: Generate embedding (using existing embedder)
    const dbClient = require('../utils/dbClient');
    const embedding = await dbClient.generateEmbedding(query);
    
    // Step 3: Extract entities (simple NER)
    const entities = extractEntities(query);
    
    // Step 4: Assess complexity
    const complexity = assessComplexity(query, heuristics, entities);
    
    // Step 5: Assess novelty (requires memory lookup)
    const novelty = await assessNovelty(embedding, options.sessionHistory);
    
    // Step 6: Determine intent type
    const intentType = classifyIntent(query, heuristics);
    
    const durationMs = Date.now() - startTime;
    
    return {
      parsed: {
        type: intentType,
        action: heuristics.action,
        subject: heuristics.subject,
        modifiers: heuristics.modifiers
      },
      embedding,
      entities,
      complexity, // 0-1 scale
      novelty, // 0-1 scale  
      confidence: calculateConfidence(heuristics, entities),
      durationMs
    };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Intent parsing error:`, error);
    
    // Fallback: simple intent
    return {
      parsed: {
        type: 'general_query',
        action: 'research',
        subject: query,
        modifiers: []
      },
      embedding: null,
      entities: [],
      complexity: 0.5,
      novelty: 0.5,
      confidence: 0.6,
      durationMs: Date.now() - startTime,
      error: error.message
    };
  }
}

/**
 * Fast heuristic analysis using regex patterns
 * @private
 */
function analyzeHeuristics(query) {
  const lower = query.toLowerCase();
  
  // Extract action verbs
  const actionPatterns = {
    compare: /compar[ei]|versus|vs|differ|contrast/i,
    analyze: /analyz[ei]|examine|study|investigate/i,
    explain: /explain|describe|what is|tell me about/i,
    find: /find|locate|search|look for|get/i,
    summarize: /summar[iy]z[ei]|overview|brief/i,
    evaluate: /evaluat[ei]|assess|judge|rate/i,
    predict: /predict|forecast|future|will/i,
    create: /creat[ei]|generat[ei]|build|make|design/i
  };
  
  let action = 'research'; // default
  for (const [verb, pattern] of Object.entries(actionPatterns)) {
    if (pattern.test(lower)) {
      action = verb;
      break;
    }
  }
  
  // Extract subject (noun phrases)
  const words = query.split(/\s+/);
  const subject = words.slice(0, Math.min(5, words.length)).join(' ');
  
  // Extract modifiers (adjectives, time constraints, etc.)
  const modifiers = [];
  
  if (/latest|recent|new|current|today/i.test(lower)) {
    modifiers.push('temporal:recent');
  }
  if (/historical|past|previous|old/i.test(lower)) {
    modifiers.push('temporal:historical');
  }
  if (/best|top|leading|premier/i.test(lower)) {
    modifiers.push('quality:high');
  }
  if (/detailed|comprehensive|thorough|deep/i.test(lower)) {
    modifiers.push('depth:high');
  }
  if (/quick|brief|short|simple/i.test(lower)) {
    modifiers.push('depth:low');
  }
  
  return { action, subject, modifiers };
}

/**
 * Extract entities from query
 * @private
 */
function extractEntities(query) {
  const entities = [];
  
  // URLs
  const urlPattern = /https?:\/\/[^\s]+/gi;
  const urls = query.match(urlPattern) || [];
  urls.forEach(url => entities.push({ type: 'url', value: url }));
  
  // Emails
  const emailPattern = /[\w.-]+@[\w.-]+\.\w+/gi;
  const emails = query.match(emailPattern) || [];
  emails.forEach(email => entities.push({ type: 'email', value: email }));
  
  // Numbers
  const numberPattern = /\b\d+(?:\.\d+)?(?:[KMB]|million|billion|thousand)?\b/gi;
  const numbers = query.match(numberPattern) || [];
  numbers.forEach(num => entities.push({ type: 'number', value: num }));
  
  // Dates (simple patterns)
  const datePattern = /\b\d{4}|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi;
  const dates = query.match(datePattern) || [];
  dates.forEach(date => entities.push({ type: 'date', value: date }));
  
  // Quoted phrases (important concepts)
  const quotePattern = /"([^"]+)"|'([^']+)'/gi;
  let match;
  while ((match = quotePattern.exec(query)) !== null) {
    entities.push({ type: 'concept', value: match[1] || match[2] });
  }
  
  // Technical terms (capitalized words, acronyms)
  const technicalPattern = /\b[A-Z]{2,}(?![a-z])\b/g;
  const technical = query.match(technicalPattern) || [];
  technical.forEach(term => entities.push({ type: 'technical', value: term }));
  
  return entities;
}

/**
 * Assess query complexity
 * @private
 */
function assessComplexity(query, heuristics, entities) {
  let complexity = 0;
  
  // Length factor (0-0.3)
  const wordCount = query.split(/\s+/).length;
  complexity += Math.min(wordCount / 100, 0.3);
  
  // Entity factor (0-0.2)
  complexity += Math.min(entities.length / 10, 0.2);
  
  // Action complexity (0-0.2)
  const actionComplexity = {
    'explain': 0.05,
    'find': 0.05,
    'summarize': 0.1,
    'compare': 0.15,
    'analyze': 0.15,
    'evaluate': 0.18,
    'predict': 0.2,
    'create': 0.2
  };
  complexity += actionComplexity[heuristics.action] || 0.1;
  
  // Modifier factor (0-0.15)
  const depthModifier = heuristics.modifiers.find(m => m.startsWith('depth:'));
  if (depthModifier === 'depth:high') {
    complexity += 0.15;
  } else if (depthModifier === 'depth:low') {
    complexity += 0.05;
  } else {
    complexity += 0.1;
  }
  
  // Conjunction factor (0-0.15)
  const conjunctions = (query.match(/\band\b|\bor\b|\bbut\b/gi) || []).length;
  complexity += Math.min(conjunctions * 0.05, 0.15);
  
  return Math.min(complexity, 1.0);
}

/**
 * Assess novelty (how different from past queries)
 * @private
 */
async function assessNovelty(embedding, sessionHistory) {
  if (!embedding || !sessionHistory || sessionHistory.length === 0) {
    return 0.7; // Default: somewhat novel
  }
  
  try {
    // Compare with recent session queries
    const recentEmbeddings = sessionHistory
      .slice(-5) // Last 5 queries
      .map(h => h.embedding)
      .filter(e => e && e.length > 0);
    
    if (recentEmbeddings.length === 0) {
      return 0.7;
    }
    
    // Calculate average similarity
    let totalSimilarity = 0;
    for (const prevEmbedding of recentEmbeddings) {
      totalSimilarity += cosineSimilarity(embedding, prevEmbedding);
    }
    const avgSimilarity = totalSimilarity / recentEmbeddings.length;
    
    // Novelty is inverse of similarity
    return 1 - avgSimilarity;
  } catch (error) {
    console.error('Novelty assessment error:', error);
    return 0.7;
  }
}

/**
 * Classify intent type
 * @private
 */
function classifyIntent(query, heuristics) {
  const lower = query.toLowerCase();
  
  // Question types
  if (/^(what|who|where|when|which|whose)\b/i.test(query)) {
    return 'factual_question';
  }
  if (/^(how|why)\b/i.test(query)) {
    return 'explanatory_question';
  }
  if (/\?$/.test(query)) {
    return 'general_question';
  }
  
  // Commands
  if (/^(find|search|get|fetch|retrieve)\b/i.test(query)) {
    return 'retrieval_command';
  }
  if (/^(compare|contrast|analyze)\b/i.test(query)) {
    return 'analysis_command';
  }
  if (/^(create|generate|build|make)\b/i.test(query)) {
    return 'creation_command';
  }
  
  // Statements (implicit research)
  if (/\b(research|investigate|explore|study)\b/i.test(lower)) {
    return 'research_statement';
  }
  
  // Default
  return 'general_query';
}

/**
 * Calculate overall confidence
 * @private
 */
function calculateConfidence(heuristics, entities) {
  let confidence = 0.7; // Base confidence
  
  // Boost for clear action verbs
  if (heuristics.action !== 'research') {
    confidence += 0.1;
  }
  
  // Boost for entities
  if (entities.length > 0) {
    confidence += Math.min(entities.length * 0.05, 0.15);
  }
  
  // Boost for specific modifiers
  if (heuristics.modifiers.length > 0) {
    confidence += Math.min(heuristics.modifiers.length * 0.02, 0.05);
  }
  
  return Math.min(confidence, 0.95);
}

/**
 * Helper: Cosine similarity
 * @private
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
}

module.exports = {
  parseIntent,
  analyzeHeuristics,
  extractEntities,
  assessComplexity
};




