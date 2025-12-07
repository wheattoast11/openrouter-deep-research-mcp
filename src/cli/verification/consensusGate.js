/**
 * ConsensusGate - Multi-model agreement verification
 *
 * Extends the Signal Protocol's ConsensusCalculator to:
 * - Extract and compare factual claims across model responses
 * - Flag disputed claims for human review
 * - Require minimum agreement threshold for factual assertions
 *
 * Critical for preventing hallucinations like "Qwen3-Omni doesn't exist"
 */

'use strict';

const { Signal, ConsensusCalculator, ModelWeights } = require('../../core/signal');

/**
 * Patterns for extracting factual claims from text
 */
const CLAIM_PATTERNS = {
  // Existence claims: "X exists", "X is a real thing", "X does not exist"
  existence: /\b(does(?:n't|not)?|doesn't|isn't|is(?:n't)?)\s+(?:a\s+)?(?:real|actual|existing|valid|available)\b/gi,

  // Definition claims: "X is Y", "X means Y"
  definition: /\b([A-Z][A-Za-z0-9-]+)\s+(?:is|are|was|were)\s+(?:a|an|the)?\s*([^.!?]{10,100})/g,

  // Temporal claims: "X was released in Y", "X launched on Y"
  temporal: /\b(released|launched|announced|introduced|created|founded)\s+(?:in|on)\s+(\d{4})/gi,

  // Quantitative claims: "X has Y users", "X supports Y"
  quantitative: /\b(has|have|supports?|contains?|includes?)\s+(\d[\d,]*)\s+/gi,

  // Capability claims: "X can do Y", "X supports Y"
  capability: /\b(can(?:not)?|cannot|supports?|doesn't support)\s+([^.!?]{5,80})/gi,

  // Negation claims: "X is not Y", "X doesn't have Y"
  negation: /\b(not|no|never|doesn't|don't|isn't|aren't|won't|can't)\s+([^.!?]{5,60})/gi
};

/**
 * Confidence thresholds
 */
const THRESHOLDS = {
  HIGH_CONFIDENCE: 0.85,    // Claims above this are considered verified
  MEDIUM_CONFIDENCE: 0.6,   // Claims below this need review
  MIN_AGREEMENT: 0.7,       // Minimum agreement ratio for consensus
  CRITICAL_CLAIM: 0.9       // Existence/capability claims need higher bar
};

/**
 * Claim types with severity weights
 */
const CLAIM_SEVERITY = {
  existence: 1.0,    // "X doesn't exist" - highest severity (Qwen3-Omni bug)
  capability: 0.9,   // "X can't do Y" - high severity
  temporal: 0.7,     // Date claims - medium severity
  definition: 0.6,   // What X is - medium severity
  quantitative: 0.5, // Numbers - can be outdated
  negation: 0.8      // General negations - high severity
};

class ConsensusGate {
  constructor(options = {}) {
    this.minAgreement = options.minAgreement || THRESHOLDS.MIN_AGREEMENT;
    this.requiredModels = options.requiredModels || 2;
    this.baseCalculator = new ConsensusCalculator({ minAgreement: this.minAgreement });

    // Track claim accuracy over time
    this.claimHistory = [];
    this.maxHistory = 500;
  }

  /**
   * Extract factual claims from text
   * @param {string} text - Response text
   * @returns {Object[]} Array of extracted claims
   */
  extractClaims(text) {
    const claims = [];

    for (const [type, pattern] of Object.entries(CLAIM_PATTERNS)) {
      const matches = text.matchAll(new RegExp(pattern.source, pattern.flags));

      for (const match of matches) {
        const claim = {
          type,
          raw: match[0].trim(),
          subject: match[1]?.trim(),
          predicate: match[2]?.trim(),
          severity: CLAIM_SEVERITY[type] || 0.5,
          position: match.index,
          context: text.slice(
            Math.max(0, match.index - 50),
            Math.min(text.length, match.index + match[0].length + 50)
          )
        };

        // Normalize for comparison
        claim.normalized = this.normalizeClaim(claim);
        claims.push(claim);
      }
    }

    return claims;
  }

  /**
   * Normalize claim for comparison
   */
  normalizeClaim(claim) {
    return (claim.raw || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/['"]/g, '')
      .trim();
  }

  /**
   * Calculate semantic similarity between two claims
   * Simple word overlap for now - can be enhanced with embeddings
   */
  claimSimilarity(claim1, claim2) {
    const words1 = new Set(claim1.normalized.split(/\s+/));
    const words2 = new Set(claim2.normalized.split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Check if two claims contradict each other
   */
  claimsContradict(claim1, claim2) {
    // Same subject, one negated
    if (claim1.subject && claim2.subject) {
      const sameSubject = claim1.subject.toLowerCase() === claim2.subject.toLowerCase();
      const oneNegated = (claim1.type === 'negation') !== (claim2.type === 'negation');

      if (sameSubject && oneNegated) {
        return true;
      }
    }

    // Check for explicit contradiction patterns
    const n1 = claim1.normalized;
    const n2 = claim2.normalized;

    // "X exists" vs "X doesn't exist"
    if (n1.includes('exist') && n2.includes('exist')) {
      const pos1 = !n1.includes('not') && !n1.includes("n't");
      const pos2 = !n2.includes('not') && !n2.includes("n't");
      if (pos1 !== pos2) return true;
    }

    return false;
  }

  /**
   * Verify response signals for factual accuracy
   * @param {Signal[]} signals - Array of model response signals
   * @returns {Object} Verification result
   */
  async verifyResponse(signals) {
    if (!signals || signals.length === 0) {
      return {
        verified: [],
        disputed: [],
        overallConfidence: 0,
        requiresReview: true,
        reason: 'no-signals'
      };
    }

    if (signals.length < this.requiredModels) {
      // Single model - flag high-severity claims
      const claims = this.extractClaims(
        typeof signals[0].payload === 'string'
          ? signals[0].payload
          : JSON.stringify(signals[0].payload)
      );

      const highSeverity = claims.filter(c => c.severity >= 0.8);
      return {
        verified: claims.filter(c => c.severity < 0.8),
        disputed: highSeverity.map(c => ({
          ...c,
          confidence: signals[0].confidence,
          models: [signals[0].source],
          reason: 'single-model-high-severity'
        })),
        overallConfidence: signals[0].confidence * 0.7, // Penalize single model
        requiresReview: highSeverity.length > 0,
        reason: 'single-model'
      };
    }

    // Multi-model verification
    const allClaims = signals.map(signal => ({
      source: signal.source,
      confidence: signal.confidence,
      weight: signal.weight,
      claims: this.extractClaims(
        typeof signal.payload === 'string'
          ? signal.payload
          : JSON.stringify(signal.payload)
      )
    }));

    // Build claim consensus
    const verified = [];
    const disputed = [];
    const seen = new Set();

    for (const { source, claims, confidence, weight } of allClaims) {
      for (const claim of claims) {
        if (seen.has(claim.normalized)) continue;
        seen.add(claim.normalized);

        // Find similar/contradicting claims from other models
        const agreements = [];
        const contradictions = [];

        for (const other of allClaims) {
          if (other.source === source) continue;

          for (const otherClaim of other.claims) {
            const similarity = this.claimSimilarity(claim, otherClaim);

            if (similarity > 0.6) {
              if (this.claimsContradict(claim, otherClaim)) {
                contradictions.push({
                  claim: otherClaim,
                  source: other.source,
                  similarity
                });
              } else {
                agreements.push({
                  claim: otherClaim,
                  source: other.source,
                  similarity
                });
              }
            }
          }
        }

        // Calculate agreement ratio
        const totalResponses = allClaims.length;
        const agreeingModels = agreements.length + 1; // +1 for original
        const agreementRatio = agreeingModels / totalResponses;

        // Determine if verified or disputed
        const threshold = claim.severity >= 0.8 ? THRESHOLDS.CRITICAL_CLAIM : this.minAgreement;

        if (contradictions.length > 0) {
          disputed.push({
            ...claim,
            confidence: agreementRatio,
            agreementRatio,
            models: [source, ...agreements.map(a => a.source)],
            contradictedBy: contradictions.map(c => ({
              source: c.source,
              claim: c.claim.raw
            })),
            reason: 'contradiction'
          });
        } else if (agreementRatio >= threshold && agreeingModels >= this.requiredModels) {
          verified.push({
            ...claim,
            confidence: agreementRatio,
            agreementRatio,
            models: [source, ...agreements.map(a => a.source)]
          });
        } else {
          disputed.push({
            ...claim,
            confidence: agreementRatio,
            agreementRatio,
            models: [source, ...agreements.map(a => a.source)],
            reason: agreementRatio < threshold ? 'low-agreement' : 'insufficient-models'
          });
        }
      }
    }

    // Calculate overall confidence
    const verifiedWeight = verified.reduce((sum, c) => sum + c.confidence * c.severity, 0);
    const disputedWeight = disputed.reduce((sum, c) => sum + (1 - c.confidence) * c.severity, 0);
    const totalWeight = verifiedWeight + disputedWeight || 1;
    const overallConfidence = verifiedWeight / totalWeight;

    return {
      verified,
      disputed,
      overallConfidence,
      requiresReview: disputed.some(d =>
        d.severity >= 0.8 || d.reason === 'contradiction'
      ),
      signalCount: signals.length,
      claimCount: verified.length + disputed.length
    };
  }

  /**
   * Record claim verification result for learning
   */
  recordResult(claim, wasCorrect) {
    this.claimHistory.push({
      claim: claim.normalized,
      type: claim.type,
      severity: claim.severity,
      wasCorrect,
      timestamp: Date.now()
    });

    if (this.claimHistory.length > this.maxHistory) {
      this.claimHistory.shift();
    }
  }

  /**
   * Get accuracy statistics
   */
  getStats() {
    if (this.claimHistory.length === 0) {
      return { total: 0, correct: 0, accuracy: 0 };
    }

    const correct = this.claimHistory.filter(h => h.wasCorrect).length;
    return {
      total: this.claimHistory.length,
      correct,
      accuracy: correct / this.claimHistory.length,
      byType: Object.entries(CLAIM_SEVERITY).map(([type]) => {
        const ofType = this.claimHistory.filter(h => h.type === type);
        const correctOfType = ofType.filter(h => h.wasCorrect).length;
        return {
          type,
          total: ofType.length,
          accuracy: ofType.length > 0 ? correctOfType / ofType.length : 0
        };
      })
    };
  }
}

module.exports = {
  ConsensusGate,
  CLAIM_PATTERNS,
  THRESHOLDS,
  CLAIM_SEVERITY
};
