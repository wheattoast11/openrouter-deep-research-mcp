/**
 * FactTracker - Accuracy metrics and feedback integration
 *
 * Tracks factual accuracy across:
 * - Model responses
 * - Claim verification outcomes
 * - User feedback (corrections)
 * - Source reliability
 *
 * Feeds into convergence calculations and model weight adjustments.
 */

'use strict';

const { sha256 } = require('../lib/micro-crypt');

/**
 * Fact status classifications
 */
const FactStatus = {
  UNVERIFIED: 'unverified',
  VERIFIED: 'verified',
  DISPUTED: 'disputed',
  CORRECTED: 'corrected',
  FALSE: 'false'
};

/**
 * Confidence adjustment factors
 */
const ADJUSTMENT_FACTORS = {
  USER_CORRECTION: -0.3,      // User marked as false
  USER_VERIFICATION: 0.2,     // User confirmed as true
  SOURCE_VERIFIED: 0.15,      // Source URL accessible
  SOURCE_FAILED: -0.2,        // Source URL inaccessible
  MULTI_MODEL_AGREE: 0.25,    // Multiple models agree
  MULTI_MODEL_DISAGREE: -0.25 // Models contradict
};

class FactTracker {
  constructor(deps = {}) {
    this.dbClient = deps.dbClient;
    this.sessionManager = deps.sessionManager;

    // In-memory tracking (persisted via session events)
    this.facts = new Map();           // factId -> FactRecord
    this.modelAccuracy = new Map();   // model -> AccuracyStats
    this.corrections = [];            // User corrections
    this.maxCorrections = 100;
  }

  /**
   * Initialize tracker, load persisted state
   */
  async initialize() {
    if (!this.dbClient) return;

    try {
      // Ensure schema exists
      await this.ensureSchema();

      // Load recent facts
      const result = await this.dbClient.executeQuery(`
        SELECT fact_id, claim, status, confidence, model, report_id, created_at
        FROM fact_records
        ORDER BY created_at DESC
        LIMIT 500
      `, []);

      for (const row of result.rows || []) {
        this.facts.set(row.fact_id, {
          id: row.fact_id,
          claim: row.claim,
          status: row.status,
          confidence: row.confidence,
          model: row.model,
          reportId: row.report_id,
          createdAt: row.created_at
        });
      }

      // Load model accuracy stats
      const accuracyResult = await this.dbClient.executeQuery(`
        SELECT model, correct_count, total_count
        FROM model_accuracy
      `, []);

      for (const row of accuracyResult.rows || []) {
        this.modelAccuracy.set(row.model, {
          correct: row.correct_count,
          total: row.total_count
        });
      }
    } catch (err) {
      console.error('[FactTracker] Initialize error:', err.message);
    }
  }

  async ensureSchema() {
    if (!this.dbClient?.executeDDL) return;

    try {
      await this.dbClient.executeDDL(`
        CREATE TABLE IF NOT EXISTS fact_records (
          fact_id TEXT PRIMARY KEY,
          claim TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'unverified',
          confidence FLOAT DEFAULT 0.5,
          model TEXT,
          report_id TEXT,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `, []);

      await this.dbClient.executeDDL(`
        CREATE TABLE IF NOT EXISTS model_accuracy (
          model TEXT PRIMARY KEY,
          correct_count INTEGER DEFAULT 0,
          total_count INTEGER DEFAULT 0,
          last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `, []);

      await this.dbClient.executeDDL(`
        CREATE TABLE IF NOT EXISTS fact_corrections (
          id SERIAL PRIMARY KEY,
          fact_id TEXT NOT NULL,
          original_claim TEXT,
          corrected_claim TEXT,
          correction_type TEXT,
          user_note TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `, []);
    } catch (err) {
      console.error('[FactTracker] Schema error:', err.message);
    }
  }

  /**
   * Generate stable fact ID from claim content
   */
  generateFactId(claim, model, reportId) {
    const content = `${claim}:${model || 'unknown'}:${reportId || 'none'}`;
    return 'fact_' + sha256(content).slice(0, 16);
  }

  /**
   * Record a new fact/claim
   * @param {Object} fact - Fact record
   * @returns {Object} Created fact record
   */
  async recordFact(fact) {
    const {
      claim,
      model,
      reportId,
      confidence = 0.5,
      status = FactStatus.UNVERIFIED,
      metadata = {}
    } = fact;

    const factId = this.generateFactId(claim, model, reportId);

    const record = {
      id: factId,
      claim,
      status,
      confidence,
      model,
      reportId,
      metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in memory
    this.facts.set(factId, record);

    // Persist to database
    if (this.dbClient?.executeDDL) {
      try {
        await this.dbClient.executeDDL(`
          INSERT INTO fact_records (fact_id, claim, status, confidence, model, report_id, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (fact_id) DO UPDATE SET
            status = EXCLUDED.status,
            confidence = EXCLUDED.confidence,
            updated_at = CURRENT_TIMESTAMP
        `, [factId, claim, status, confidence, model, reportId, JSON.stringify(metadata)]);
      } catch (err) {
        console.error('[FactTracker] Record error:', err.message);
      }
    }

    return record;
  }

  /**
   * Update fact status based on verification
   * @param {string} factId - Fact ID
   * @param {string} newStatus - New status
   * @param {number} confidenceAdjustment - Confidence adjustment
   */
  async updateFactStatus(factId, newStatus, confidenceAdjustment = 0) {
    const fact = this.facts.get(factId);
    if (!fact) return null;

    fact.status = newStatus;
    fact.confidence = Math.max(0, Math.min(1, fact.confidence + confidenceAdjustment));
    fact.updatedAt = new Date().toISOString();

    // Update model accuracy if status is definitive
    if (newStatus === FactStatus.VERIFIED || newStatus === FactStatus.FALSE) {
      await this.updateModelAccuracy(fact.model, newStatus === FactStatus.VERIFIED);
    }

    // Persist
    if (this.dbClient?.executeDDL) {
      try {
        await this.dbClient.executeDDL(`
          UPDATE fact_records
          SET status = $1, confidence = $2, updated_at = CURRENT_TIMESTAMP
          WHERE fact_id = $3
        `, [newStatus, fact.confidence, factId]);
      } catch (err) {
        console.error('[FactTracker] Update error:', err.message);
      }
    }

    return fact;
  }

  /**
   * Record user correction
   * @param {string} factId - Original fact ID
   * @param {string} correctedClaim - Corrected claim text
   * @param {string} userNote - User's explanation
   */
  async recordCorrection(factId, correctedClaim, userNote = '') {
    const fact = this.facts.get(factId);

    const correction = {
      factId,
      originalClaim: fact?.claim,
      correctedClaim,
      correctionType: 'user',
      userNote,
      createdAt: new Date().toISOString()
    };

    // Update fact status
    await this.updateFactStatus(factId, FactStatus.CORRECTED, ADJUSTMENT_FACTORS.USER_CORRECTION);

    // Store correction
    this.corrections.push(correction);
    if (this.corrections.length > this.maxCorrections) {
      this.corrections.shift();
    }

    // Persist correction
    if (this.dbClient?.executeDDL) {
      try {
        await this.dbClient.executeDDL(`
          INSERT INTO fact_corrections (fact_id, original_claim, corrected_claim, correction_type, user_note)
          VALUES ($1, $2, $3, $4, $5)
        `, [factId, correction.originalClaim, correctedClaim, 'user', userNote]);
      } catch (err) {
        console.error('[FactTracker] Correction error:', err.message);
      }
    }

    return correction;
  }

  /**
   * Update model accuracy statistics
   */
  async updateModelAccuracy(model, wasCorrect) {
    if (!model) return;

    const stats = this.modelAccuracy.get(model) || { correct: 0, total: 0 };
    stats.total++;
    if (wasCorrect) stats.correct++;
    this.modelAccuracy.set(model, stats);

    // Persist
    if (this.dbClient?.executeDDL) {
      try {
        await this.dbClient.executeDDL(`
          INSERT INTO model_accuracy (model, correct_count, total_count)
          VALUES ($1, $2, $3)
          ON CONFLICT (model) DO UPDATE SET
            correct_count = EXCLUDED.correct_count,
            total_count = EXCLUDED.total_count,
            last_updated = CURRENT_TIMESTAMP
        `, [model, stats.correct, stats.total]);
      } catch (err) {
        console.error('[FactTracker] Accuracy update error:', err.message);
      }
    }
  }

  /**
   * Get model accuracy score
   */
  getModelAccuracy(model) {
    const stats = this.modelAccuracy.get(model);
    if (!stats || stats.total === 0) {
      return { accuracy: 0.5, total: 0, unknown: true }; // Default 50%
    }
    return {
      accuracy: stats.correct / stats.total,
      total: stats.total,
      correct: stats.correct
    };
  }

  /**
   * Get facts for a report
   */
  getFactsForReport(reportId) {
    return Array.from(this.facts.values())
      .filter(f => f.reportId === reportId);
  }

  /**
   * Get disputed facts requiring review
   */
  getDisputedFacts(limit = 20) {
    return Array.from(this.facts.values())
      .filter(f => f.status === FactStatus.DISPUTED || f.status === FactStatus.UNVERIFIED)
      .sort((a, b) => b.confidence - a.confidence) // Higher confidence disputed = more concerning
      .slice(0, limit);
  }

  /**
   * Get recent corrections
   */
  getRecentCorrections(limit = 10) {
    return this.corrections.slice(-limit);
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    const facts = Array.from(this.facts.values());

    const byStatus = {};
    for (const status of Object.values(FactStatus)) {
      byStatus[status] = facts.filter(f => f.status === status).length;
    }

    const avgConfidence = facts.length > 0
      ? facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length
      : 0;

    const modelStats = Array.from(this.modelAccuracy.entries())
      .map(([model, stats]) => ({
        model,
        accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
        total: stats.total
      }))
      .sort((a, b) => b.accuracy - a.accuracy);

    return {
      totalFacts: facts.length,
      byStatus,
      avgConfidence,
      totalCorrections: this.corrections.length,
      modelStats,
      topAccuracyModel: modelStats[0]?.model,
      lowestAccuracyModel: modelStats[modelStats.length - 1]?.model
    };
  }

  /**
   * Calculate recommended model weight adjustment based on accuracy
   */
  getRecommendedWeightAdjustment(model) {
    const { accuracy, total } = this.getModelAccuracy(model);

    if (total < 10) {
      return { adjustment: 0, reason: 'insufficient-data' };
    }

    // Adjust weight based on deviation from 0.7 baseline
    const baseline = 0.7;
    const deviation = accuracy - baseline;

    return {
      adjustment: deviation * 0.5, // Scale factor
      accuracy,
      total,
      reason: deviation >= 0 ? 'above-baseline' : 'below-baseline'
    };
  }
}

module.exports = {
  FactTracker,
  FactStatus,
  ADJUSTMENT_FACTORS
};
