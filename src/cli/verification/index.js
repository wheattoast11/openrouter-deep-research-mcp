/**
 * Verification Layer - Index
 *
 * Central exports for the fact-verification/hardening layer.
 * Prevents hallucinations by:
 * - Multi-model consensus checking
 * - Source URL verification
 * - Accuracy tracking with feedback
 */

'use strict';

const { ConsensusGate, CLAIM_PATTERNS, THRESHOLDS, CLAIM_SEVERITY } = require('./consensusGate');
const { SourceVerifier, URL_PATTERNS, DOMAIN_TRUST } = require('./sourceVerifier');
const { FactTracker, FactStatus, ADJUSTMENT_FACTORS } = require('./factTracker');

/**
 * Unified verification pipeline
 * Combines all verification components into a single workflow.
 */
class VerificationPipeline {
  constructor(deps = {}) {
    this.consensusGate = new ConsensusGate(deps.consensus || {});
    this.sourceVerifier = new SourceVerifier(deps);
    this.factTracker = new FactTracker(deps);

    // Configuration
    this.options = {
      requireMultiModel: deps.requireMultiModel ?? true,
      verifySourcesEnabled: deps.verifySourcesEnabled ?? true,
      minConfidenceForOutput: deps.minConfidenceForOutput ?? 0.5,
      flagDisputed: deps.flagDisputed ?? true
    };
  }

  /**
   * Initialize all components
   */
  async initialize() {
    await this.factTracker.initialize();
  }

  /**
   * Run full verification pipeline on research output
   * @param {Object} params - Verification parameters
   * @param {Signal[]} params.signals - Model response signals
   * @param {string} params.reportText - Final report text
   * @param {string} params.reportId - Report ID for tracking
   * @returns {Object} Verification result
   */
  async verify({ signals, reportText, reportId }) {
    const result = {
      consensus: null,
      sources: null,
      facts: [],
      overallConfidence: 0,
      warnings: [],
      flags: [],
      approved: true
    };

    // Step 1: Consensus verification
    if (signals && signals.length > 0) {
      result.consensus = await this.consensusGate.verifyResponse(signals);

      // Record facts from consensus
      for (const verified of result.consensus.verified || []) {
        const fact = await this.factTracker.recordFact({
          claim: verified.raw,
          model: verified.models?.[0],
          reportId,
          confidence: verified.confidence,
          status: FactStatus.VERIFIED,
          metadata: { type: verified.type, severity: verified.severity }
        });
        result.facts.push(fact);
      }

      for (const disputed of result.consensus.disputed || []) {
        const fact = await this.factTracker.recordFact({
          claim: disputed.raw,
          model: disputed.models?.[0],
          reportId,
          confidence: disputed.confidence,
          status: FactStatus.DISPUTED,
          metadata: {
            type: disputed.type,
            severity: disputed.severity,
            reason: disputed.reason,
            contradictedBy: disputed.contradictedBy
          }
        });
        result.facts.push(fact);

        // Add flag for high-severity disputed claims
        if (disputed.severity >= 0.8) {
          result.flags.push({
            type: 'high-severity-disputed',
            claim: disputed.raw,
            reason: disputed.reason,
            models: disputed.models
          });
        }
      }

      // Check if consensus requires review
      if (result.consensus.requiresReview) {
        result.warnings.push({
          type: 'consensus-review-required',
          disputed: result.consensus.disputed?.length || 0,
          verified: result.consensus.verified?.length || 0
        });
      }
    }

    // Step 2: Source verification
    if (this.options.verifySourcesEnabled && reportText) {
      result.sources = await this.sourceVerifier.verifySources(reportText);

      if (result.sources.hasIssues) {
        result.warnings.push({
          type: 'source-issues',
          failed: result.sources.failed,
          failedUrls: result.sources.failedSources
        });
      }

      if (result.sources.totalSources === 0) {
        result.flags.push({
          type: 'no-sources',
          reason: 'Report contains no verifiable sources'
        });
      }
    }

    // Step 3: Calculate overall confidence
    const consensusWeight = 0.6;
    const sourceWeight = 0.4;

    const consensusScore = result.consensus?.overallConfidence ?? 0.5;
    const sourceScore = result.sources?.reliability ?? 0.5;

    result.overallConfidence = consensusScore * consensusWeight + sourceScore * sourceWeight;

    // Step 4: Determine approval
    if (result.overallConfidence < this.options.minConfidenceForOutput) {
      result.approved = false;
      result.warnings.push({
        type: 'low-confidence',
        confidence: result.overallConfidence,
        threshold: this.options.minConfidenceForOutput
      });
    }

    if (result.flags.some(f => f.type === 'high-severity-disputed')) {
      result.approved = false;
    }

    return result;
  }

  /**
   * Record user feedback on a fact
   */
  async recordFeedback(factId, isCorrect, correctedClaim = null, note = '') {
    if (isCorrect) {
      await this.factTracker.updateFactStatus(
        factId,
        FactStatus.VERIFIED,
        ADJUSTMENT_FACTORS.USER_VERIFICATION
      );
    } else if (correctedClaim) {
      await this.factTracker.recordCorrection(factId, correctedClaim, note);
    } else {
      await this.factTracker.updateFactStatus(
        factId,
        FactStatus.FALSE,
        ADJUSTMENT_FACTORS.USER_CORRECTION
      );
    }
  }

  /**
   * Get verification statistics
   */
  getStats() {
    return {
      consensus: this.consensusGate.getStats(),
      sources: this.sourceVerifier.getStats(),
      facts: this.factTracker.getStats()
    };
  }

  /**
   * Format verification result for CLI output
   */
  formatForOutput(result) {
    const lines = [];

    // Confidence indicator
    const confPct = Math.round(result.overallConfidence * 100);
    const confBar = '█'.repeat(Math.round(confPct / 10)) + '░'.repeat(10 - Math.round(confPct / 10));
    lines.push(`Confidence: ${confBar} ${confPct}%`);

    // Approval status
    if (!result.approved) {
      lines.push(`Status: REQUIRES REVIEW`);
    } else {
      lines.push(`Status: Verified`);
    }

    // Warnings
    if (result.warnings.length > 0) {
      lines.push(`\nWarnings (${result.warnings.length}):`);
      for (const w of result.warnings) {
        lines.push(`  - ${w.type}: ${JSON.stringify(w)}`);
      }
    }

    // Flags
    if (result.flags.length > 0) {
      lines.push(`\nFlags (${result.flags.length}):`);
      for (const f of result.flags) {
        lines.push(`  ! ${f.type}: ${f.claim || f.reason}`);
      }
    }

    // Sources summary
    if (result.sources) {
      lines.push(`\nSources: ${result.sources.verified}/${result.sources.totalSources} verified`);
    }

    return lines.join('\n');
  }
}

module.exports = {
  // Pipeline
  VerificationPipeline,

  // Components
  ConsensusGate,
  SourceVerifier,
  FactTracker,

  // Constants
  CLAIM_PATTERNS,
  THRESHOLDS,
  CLAIM_SEVERITY,
  URL_PATTERNS,
  DOMAIN_TRUST,
  FactStatus,
  ADJUSTMENT_FACTORS
};
