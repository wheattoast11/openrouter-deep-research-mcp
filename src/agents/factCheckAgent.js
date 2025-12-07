/**
 * Fact-Checking Agent
 *
 * Verifies claims in research output by:
 * 1. Checking against local knowledge base
 * 2. Detecting contradictions between ensemble models
 * 3. Flagging unverifiable claims
 *
 * @module factCheckAgent
 * @version 1.8.0
 */

'use strict';

const localKnowledge = require('../utils/localKnowledge');
const citationValidator = require('../utils/citationValidator');
const logger = require('../utils/logger').child('FactCheckAgent');

/**
 * Extract claims from research text
 * Looks for statements that make factual assertions
 * @param {string} text - Research text
 * @returns {Array<Object>} Extracted claims
 */
function extractClaims(text) {
  if (!text || typeof text !== 'string') return [];

  const claims = [];

  // Split into sentences
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);

  // Patterns that indicate factual claims
  const claimPatterns = [
    /\b(does not|doesn't|cannot|can't|unable|not able)\s+(support|work|run|function)/i,
    /\b(supports?|works?|runs?|functions?|enables?|allows?)\b/i,
    /\b(is|are|was|were)\s+(a|an|the)\s+/i,
    /\b(limited to|restricted to|only works with)\b/i,
    /\b(incompatible|not compatible|won't work)\b/i,
    /\b(requires?|needs?|must have)\b/i,
    /\b(up to|at least|maximum|minimum)\s+\d+/i,
    /\b(introduced|released|launched|added)\s+(in|on|at)/i
  ];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    for (const pattern of claimPatterns) {
      if (pattern.test(trimmed)) {
        claims.push({
          text: trimmed,
          pattern: pattern.source,
          confidence: 'unknown'
        });
        break; // Only add once per sentence
      }
    }
  }

  return claims;
}

/**
 * Check claims against local knowledge base
 * @param {Array<Object>} claims - Claims to verify
 * @returns {Array<Object>} Claims with verification status
 */
function verifyAgainstLocalKnowledge(claims) {
  const verified = [];

  for (const claim of claims) {
    const contradiction = localKnowledge.checkContradiction(claim.text);

    if (contradiction) {
      verified.push({
        ...claim,
        status: 'CONTRADICTED',
        confidence: 'low',
        contradiction: contradiction.contradiction,
        correctFacts: contradiction.correctFacts,
        sources: contradiction.sources
      });
      logger.warn('Claim contradicts local knowledge', {
        claim: claim.text.substring(0, 80),
        contradiction: contradiction.contradiction
      });
    } else {
      // Check if claim aligns with local knowledge
      const relevant = localKnowledge.findRelevantKnowledge(claim.text);
      if (relevant.length > 0) {
        verified.push({
          ...claim,
          status: 'ALIGNED',
          confidence: 'high',
          supportingKnowledge: relevant[0].facts.slice(0, 2)
        });
      } else {
        verified.push({
          ...claim,
          status: 'UNVERIFIED',
          confidence: 'unknown'
        });
      }
    }
  }

  return verified;
}

/**
 * Detect contradictions between ensemble model outputs
 * @param {Array<Object>} ensembleResults - Results from multiple models
 * @returns {Array<Object>} Detected contradictions
 */
function detectEnsembleContradictions(ensembleResults) {
  if (!ensembleResults || ensembleResults.length < 2) return [];

  const contradictions = [];

  // Extract key claims from each model
  const modelClaims = ensembleResults.map((result, idx) => ({
    model: result.model || `model_${idx}`,
    claims: extractClaims(result.content || result.response || '')
  }));

  // Compare claims between models
  const contradictionPatterns = [
    {
      positive: /\b(supports?|works?|can|does|has)\b/i,
      negative: /\b(does not|doesn't|cannot|can't|unable|won't)\b/i,
      topic: null // Will be extracted
    }
  ];

  for (let i = 0; i < modelClaims.length; i++) {
    for (let j = i + 1; j < modelClaims.length; j++) {
      const model1 = modelClaims[i];
      const model2 = modelClaims[j];

      for (const claim1 of model1.claims) {
        for (const claim2 of model2.claims) {
          // Check if claims are about same topic but contradict
          const hasPositive1 = contradictionPatterns[0].positive.test(claim1.text);
          const hasNegative1 = contradictionPatterns[0].negative.test(claim1.text);
          const hasPositive2 = contradictionPatterns[0].positive.test(claim2.text);
          const hasNegative2 = contradictionPatterns[0].negative.test(claim2.text);

          // Look for opposing polarity on similar topics
          if ((hasPositive1 && hasNegative2) || (hasNegative1 && hasPositive2)) {
            // Check topic similarity via keyword overlap
            const words1 = new Set(claim1.text.toLowerCase().split(/\s+/).filter(w => w.length > 4));
            const words2 = new Set(claim2.text.toLowerCase().split(/\s+/).filter(w => w.length > 4));
            const overlap = [...words1].filter(w => words2.has(w));

            if (overlap.length >= 2) {
              contradictions.push({
                model1: model1.model,
                claim1: claim1.text,
                model2: model2.model,
                claim2: claim2.text,
                overlappingTopics: overlap,
                type: 'polarity_contradiction'
              });
            }
          }
        }
      }
    }
  }

  return contradictions;
}

/**
 * Calculate an accuracy score for research output
 * @param {Object} checkResults - Results from fact-checking
 * @returns {Object} Accuracy score and breakdown
 */
function calculateAccuracyScore(checkResults) {
  const { claims = [], citationQuality = {}, contradictions = [] } = checkResults;

  if (claims.length === 0) {
    return { score: 0.5, level: 'unknown', breakdown: { claims: 0, contradicted: 0 } };
  }

  let score = 1.0;
  const breakdown = {
    totalClaims: claims.length,
    aligned: 0,
    contradicted: 0,
    unverified: 0,
    citationScore: citationQuality.score || 0,
    ensembleContradictions: contradictions.length
  };

  // Count claim statuses
  for (const claim of claims) {
    if (claim.status === 'CONTRADICTED') {
      breakdown.contradicted++;
      score -= 0.2; // Heavy penalty for contradicting known facts
    } else if (claim.status === 'ALIGNED') {
      breakdown.aligned++;
      score += 0.05; // Small bonus for aligned claims
    } else {
      breakdown.unverified++;
      score -= 0.02; // Small penalty for unverified
    }
  }

  // Factor in citation quality
  if (citationQuality.score !== undefined) {
    score = score * 0.7 + citationQuality.score * 0.3;
  }

  // Penalty for ensemble contradictions
  score -= contradictions.length * 0.1;

  // Clamp score to [0, 1]
  score = Math.max(0, Math.min(1, score));

  let level;
  if (score >= 0.8) level = 'high';
  else if (score >= 0.6) level = 'medium';
  else if (score >= 0.4) level = 'low';
  else level = 'very-low';

  return { score, level, breakdown };
}

/**
 * Run full fact-checking on research output
 * @param {string} content - Research content to check
 * @param {Object} options - Options including ensembleResults, requestId
 * @returns {Promise<Object>} Fact-check results
 */
async function factCheck(content, options = {}) {
  const { ensembleResults = [], requestId = 'unknown' } = options;

  logger.info('Starting fact-check', { requestId, contentLength: content?.length || 0 });

  const results = {
    claims: [],
    contradictions: [],
    citationQuality: null,
    accuracyScore: null
  };

  try {
    // 1. Extract and verify claims against local knowledge
    const claims = extractClaims(content);
    results.claims = verifyAgainstLocalKnowledge(claims);

    // 2. Detect ensemble contradictions
    if (ensembleResults.length > 0) {
      results.contradictions = detectEnsembleContradictions(ensembleResults);
    }

    // 3. Validate citations
    const citationValidation = await citationValidator.validateCitations(content, { requestId });
    results.citationQuality = citationValidator.getQualitySummary(citationValidation);

    // 4. Calculate overall accuracy score
    results.accuracyScore = calculateAccuracyScore(results);

    logger.info('Fact-check complete', {
      requestId,
      claims: results.claims.length,
      contradicted: results.claims.filter(c => c.status === 'CONTRADICTED').length,
      ensembleContradictions: results.contradictions.length,
      accuracyScore: results.accuracyScore.score
    });

  } catch (error) {
    logger.error('Fact-check error', { requestId, error: error.message });
    results.error = error.message;
  }

  return results;
}

/**
 * Generate warnings for the final report based on fact-check results
 * @param {Object} factCheckResults - Results from factCheck()
 * @returns {Array<string>} Warning messages
 */
function generateWarnings(factCheckResults) {
  const warnings = [];

  // Warn about contradicted claims
  const contradicted = factCheckResults.claims?.filter(c => c.status === 'CONTRADICTED') || [];
  if (contradicted.length > 0) {
    warnings.push(`WARNING: ${contradicted.length} claim(s) contradict verified local knowledge.`);
    for (const c of contradicted.slice(0, 3)) {
      warnings.push(`  - "${c.text.substring(0, 60)}..." → CORRECT: ${c.contradiction}`);
    }
  }

  // Warn about ensemble contradictions
  if (factCheckResults.contradictions?.length > 0) {
    warnings.push(`NOTE: ${factCheckResults.contradictions.length} contradiction(s) detected between ensemble models.`);
  }

  // Warn about citation quality
  if (factCheckResults.citationQuality?.level === 'low' || factCheckResults.citationQuality?.level === 'very-low') {
    warnings.push(`WARNING: ${factCheckResults.citationQuality.message}`);
  }

  // Overall accuracy warning
  if (factCheckResults.accuracyScore?.level === 'low' || factCheckResults.accuracyScore?.level === 'very-low') {
    warnings.push(`CAUTION: Overall accuracy score is ${factCheckResults.accuracyScore.level} (${(factCheckResults.accuracyScore.score * 100).toFixed(0)}%). Verify claims independently.`);
  }

  return warnings;
}

module.exports = {
  extractClaims,
  verifyAgainstLocalKnowledge,
  detectEnsembleContradictions,
  calculateAccuracyScore,
  factCheck,
  generateWarnings
};
