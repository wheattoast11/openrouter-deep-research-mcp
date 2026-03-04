/**
 * RFP Workflow Engine - SMB Procurement using Interaction Combinators
 *
 * This workflow demonstrates the Zero Protocol's realizability:
 * - Each stage maps to an interaction combinator (γ, δ, ε)
 * - The workflow is inherently parallel and confluent
 * - AMB points represent non-deterministic business decisions
 *
 * Workflow Stages:
 * 1. Discovery    (γ construct) - Gather requirements
 * 2. Generation   (γ construct) - Create RFP document
 * 3. Distribution (δ duplicate) - Send to vendors
 * 4. Collection   (γ destruct)  - Parse responses
 * 5. Evaluation   (comparison)  - Score and rank
 * 6. Selection    (δ erase/AMB) - Choose vendor
 * 7. Completion   (ε annihilate)- Finalize workflow
 *
 * @module workflows/rfpWorkflow
 */

'use strict';

const { EventEmitter } = require('events');
const {
  Gamma,
  Delta,
  Epsilon,
  WorkflowCombinator,
  construct,
  destruct,
  duplicate,
  erase,
  annihilate,
  isComplete,
} = require('../core/combinators');

/**
 * RFP Workflow States
 */
const RFPState = {
  DRAFT: 'draft',
  REQUIREMENTS: 'requirements',
  GENERATED: 'generated',
  DISTRIBUTED: 'distributed',
  RESPONSES_RECEIVED: 'responses_received',
  EVALUATED: 'evaluated',
  VENDOR_SELECTED: 'vendor_selected',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/**
 * Budget Guardian - Type-level overspending prevention
 * Ensures budget constraints are satisfied at compile-time equivalent
 */
class BudgetGuardian {
  constructor(maxBudget, currency = 'USD') {
    this.maxBudget = maxBudget;
    this.currency = currency;
    this.allocated = 0;
    this.warnings = [];
  }

  /**
   * Check if a quote is within budget
   * @param {number} amount - Quote amount
   * @returns {Object} Validation result
   */
  validate(amount) {
    const withinBudget = amount <= this.maxBudget;
    const percentOfBudget = (amount / this.maxBudget) * 100;

    const result = {
      valid: withinBudget,
      amount,
      maxBudget: this.maxBudget,
      percentOfBudget: percentOfBudget.toFixed(1),
      currency: this.currency,
    };

    if (!withinBudget) {
      result.overage = amount - this.maxBudget;
      result.warning = `Quote exceeds budget by ${this.currency} ${result.overage.toFixed(2)}`;
    } else if (percentOfBudget > 90) {
      result.warning = `Quote is ${percentOfBudget.toFixed(1)}% of budget - minimal margin`;
    }

    return result;
  }

  /**
   * Rank quotes by value (price vs budget efficiency)
   * @param {Array} quotes - Array of {vendor, amount}
   */
  rankByValue(quotes) {
    return quotes
      .filter(q => q.amount <= this.maxBudget)
      .map(q => ({
        ...q,
        budgetEfficiency: ((this.maxBudget - q.amount) / this.maxBudget * 100).toFixed(1),
        rank: null,
      }))
      .sort((a, b) => a.amount - b.amount)
      .map((q, i) => ({ ...q, rank: i + 1 }));
  }
}

/**
 * RFP Document Builder (γ construct)
 */
class RFPBuilder {
  constructor() {
    this.sections = [];
  }

  addSection(title, content) {
    this.sections.push({ title, content, addedAt: Date.now() });
    return this;
  }

  addRequirements(requirements) {
    return this.addSection('Requirements', requirements);
  }

  addScope(scope) {
    return this.addSection('Scope of Work', scope);
  }

  addTimeline(timeline) {
    return this.addSection('Timeline', timeline);
  }

  addBudgetRange(min, max, currency = 'USD') {
    return this.addSection('Budget', {
      range: { min, max },
      currency,
      note: 'Quotes outside this range may not be considered',
    });
  }

  addEvaluationCriteria(criteria) {
    return this.addSection('Evaluation Criteria', criteria);
  }

  /**
   * Build the RFP document using γ construct
   */
  build(metadata = {}) {
    const rfpId = require('crypto').randomUUID();

    // Use γ construct to combine all sections
    let document = { sections: [] };
    for (const section of this.sections) {
      document = construct(document, section, { merge: 'sections' });
      document.sections = [...(document.left?.sections || []), document.right];
    }

    return {
      _type: 'rfp_document',
      id: rfpId,
      version: '1.0',
      sections: this.sections,
      metadata: {
        ...metadata,
        createdAt: Date.now(),
        sectionCount: this.sections.length,
      },
      status: RFPState.GENERATED,
    };
  }
}

/**
 * Vendor Response Parser (γ destruct)
 */
class ResponseParser {
  /**
   * Parse a vendor's response into structured data
   * @param {Object} response - Raw vendor response
   */
  static parse(response) {
    // Use γ destruct to extract components
    const { left: metadata, right: content } = destruct(response);

    return {
      _type: 'parsed_response',
      vendor: response.vendor || 'unknown',
      quote: this._extractQuote(content || response),
      timeline: this._extractTimeline(content || response),
      qualifications: this._extractQualifications(content || response),
      parsedAt: Date.now(),
    };
  }

  static _extractQuote(content) {
    if (typeof content?.quote === 'number') return content.quote;
    if (typeof content?.price === 'number') return content.price;
    if (typeof content?.amount === 'number') return content.amount;
    // Try to find a number that looks like a price
    const text = JSON.stringify(content);
    const priceMatch = text.match(/[\$£€]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    return priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;
  }

  static _extractTimeline(content) {
    if (content?.timeline) return content.timeline;
    if (content?.deliveryDate) return { end: content.deliveryDate };
    if (content?.duration) return { duration: content.duration };
    return null;
  }

  static _extractQualifications(content) {
    return {
      experience: content?.experience || content?.yearsInBusiness,
      certifications: content?.certifications || [],
      references: content?.references || [],
    };
  }
}

/**
 * RFP Workflow Engine
 */
class RFPWorkflow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.id = require('crypto').randomUUID();
    this.state = RFPState.DRAFT;
    this.budget = options.budget ? new BudgetGuardian(options.budget, options.currency) : null;
    this.rfp = null;
    this.vendors = [];
    this.responses = [];
    this.evaluations = [];
    this.selectedVendor = null;
    this.auditLog = [];
    this.ambPoints = []; // Track non-deterministic decision points
  }

  /**
   * Log an action to the audit trail
   */
  _log(action, data = {}) {
    const entry = {
      timestamp: Date.now(),
      action,
      state: this.state,
      ...data,
    };
    this.auditLog.push(entry);
    this.emit('audit', entry);
    return entry;
  }

  /**
   * Stage 1: Discovery - Gather requirements (γ construct)
   * @param {Object} requirements - Business requirements
   */
  async discover(requirements) {
    this._log('discovery_started', { requirementCount: Object.keys(requirements).length });

    // Use γ construct to build requirements structure
    const structured = construct(
      { type: 'business_requirements' },
      requirements,
      { stage: 'discovery' }
    );

    this.requirements = structured;
    this.state = RFPState.REQUIREMENTS;
    this._log('discovery_complete', { structured: true });

    return structured;
  }

  /**
   * Stage 2: Generation - Create RFP document (γ construct)
   * @param {Object} customizations - Additional RFP customizations
   */
  async generate(customizations = {}) {
    if (this.state !== RFPState.REQUIREMENTS) {
      throw new Error(`Cannot generate RFP in state: ${this.state}`);
    }

    this._log('generation_started');

    const builder = new RFPBuilder();

    // Build from requirements
    if (this.requirements?.right) {
      const req = this.requirements.right;
      if (req.scope) builder.addScope(req.scope);
      if (req.requirements) builder.addRequirements(req.requirements);
      if (req.timeline) builder.addTimeline(req.timeline);
      if (req.criteria) builder.addEvaluationCriteria(req.criteria);
    }

    // Add budget section if guardian exists
    if (this.budget) {
      builder.addBudgetRange(0, this.budget.maxBudget, this.budget.currency);
    }

    // Apply customizations
    for (const [title, content] of Object.entries(customizations)) {
      builder.addSection(title, content);
    }

    this.rfp = builder.build({ workflowId: this.id });
    this.state = RFPState.GENERATED;
    this._log('generation_complete', { rfpId: this.rfp.id, sections: this.rfp.sections.length });

    return this.rfp;
  }

  /**
   * Stage 3: Distribution - Send to vendors (δ duplicate)
   * @param {Array<Object>} vendors - List of vendors to send RFP
   */
  async distribute(vendors) {
    if (this.state !== RFPState.GENERATED) {
      throw new Error(`Cannot distribute in state: ${this.state}`);
    }

    this._log('distribution_started', { vendorCount: vendors.length });

    // Use δ duplicate to fork RFP to all vendors
    const forks = duplicate(this.rfp, vendors.length);

    this.vendors = vendors.map((vendor, i) => ({
      ...vendor,
      rfpFork: forks[i],
      sentAt: Date.now(),
      status: 'pending',
    }));

    this.state = RFPState.DISTRIBUTED;
    this._log('distribution_complete', {
      vendorNames: vendors.map(v => v.name),
      forkId: forks[0]?.forkId,
    });

    return this.vendors;
  }

  /**
   * Stage 4: Collection - Receive and parse responses (γ destruct)
   * @param {Array<Object>} responses - Vendor responses
   */
  async collectResponses(responses) {
    if (this.state !== RFPState.DISTRIBUTED) {
      throw new Error(`Cannot collect responses in state: ${this.state}`);
    }

    this._log('collection_started', { responseCount: responses.length });

    // Use γ destruct to parse each response
    this.responses = responses.map(response => {
      const parsed = ResponseParser.parse(response);

      // Mark vendor as responded
      const vendor = this.vendors.find(v => v.name === response.vendor || v.id === response.vendorId);
      if (vendor) {
        vendor.status = 'responded';
        vendor.response = parsed;
      }

      return parsed;
    });

    this.state = RFPState.RESPONSES_RECEIVED;
    this._log('collection_complete', {
      parsedCount: this.responses.length,
      vendors: this.responses.map(r => r.vendor),
    });

    return this.responses;
  }

  /**
   * Stage 5: Evaluation - Score and rank responses
   * @param {Object} weights - Scoring weights for criteria
   */
  async evaluate(weights = { price: 0.4, timeline: 0.3, qualifications: 0.3 }) {
    if (this.state !== RFPState.RESPONSES_RECEIVED) {
      throw new Error(`Cannot evaluate in state: ${this.state}`);
    }

    this._log('evaluation_started', { weights });

    this.evaluations = this.responses.map(response => {
      // Calculate scores
      const scores = {
        price: this._scorePriceValue(response.quote),
        timeline: this._scoreTimeline(response.timeline),
        qualifications: this._scoreQualifications(response.qualifications),
      };

      // Weighted total
      const totalScore = Object.entries(weights).reduce((sum, [key, weight]) => {
        return sum + (scores[key] || 0) * weight;
      }, 0);

      // Budget validation
      const budgetCheck = this.budget?.validate(response.quote) || { valid: true };

      return {
        vendor: response.vendor,
        quote: response.quote,
        scores,
        totalScore: totalScore.toFixed(2),
        budgetCheck,
        eligible: budgetCheck.valid,
      };
    });

    // Rank eligible vendors
    this.evaluations = this.evaluations
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((e, i) => ({ ...e, rank: e.eligible ? i + 1 : null }));

    this.state = RFPState.EVALUATED;
    this._log('evaluation_complete', {
      evaluations: this.evaluations.map(e => ({
        vendor: e.vendor,
        score: e.totalScore,
        eligible: e.eligible,
        rank: e.rank,
      })),
    });

    return this.evaluations;
  }

  _scorePriceValue(quote) {
    if (!quote || !this.budget) return 50;
    const efficiency = (this.budget.maxBudget - quote) / this.budget.maxBudget;
    return Math.max(0, Math.min(100, 50 + efficiency * 50));
  }

  _scoreTimeline(timeline) {
    if (!timeline) return 50;
    // Simplified scoring - shorter is better
    return 70;
  }

  _scoreQualifications(qualifications) {
    if (!qualifications) return 50;
    let score = 50;
    if (qualifications.experience > 5) score += 20;
    if (qualifications.certifications?.length > 0) score += 15;
    if (qualifications.references?.length > 0) score += 15;
    return Math.min(100, score);
  }

  /**
   * Stage 6: Selection - Choose vendor (δ erase / AMB point)
   * @param {Function|number|string} selector - Selection criteria
   */
  async select(selector) {
    if (this.state !== RFPState.EVALUATED) {
      throw new Error(`Cannot select in state: ${this.state}`);
    }

    this._log('selection_started');

    // This is an AMB point - non-deterministic choice
    const ambPoint = {
      id: require('crypto').randomUUID(),
      type: 'vendor_selection',
      options: this.evaluations.filter(e => e.eligible),
      timestamp: Date.now(),
    };
    this.ambPoints.push(ambPoint);

    // Use δ erase to resolve the choice
    let selection;

    if (typeof selector === 'function') {
      selection = erase(ambPoint.options, selector);
    } else if (typeof selector === 'number') {
      // Select by rank
      const byRank = ambPoint.options.find(e => e.rank === selector);
      selection = erase(ambPoint.options, () => byRank || ambPoint.options[0]);
    } else if (typeof selector === 'string') {
      // Select by vendor name
      const byName = ambPoint.options.find(e => e.vendor === selector);
      selection = erase(ambPoint.options, () => byName || ambPoint.options[0]);
    } else {
      // Default: highest ranked eligible
      selection = erase(ambPoint.options, (opts) => opts[0]);
    }

    this.selectedVendor = selection.selected;
    ambPoint.resolved = selection;

    this.state = RFPState.VENDOR_SELECTED;
    this._log('selection_complete', {
      selectedVendor: this.selectedVendor?.vendor,
      ambPointId: ambPoint.id,
      totalOptions: selection.totalOptions,
      erasedCount: selection.erasedCount,
    });

    return this.selectedVendor;
  }

  /**
   * Stage 7: Completion - Finalize workflow (ε annihilate)
   * @param {Object} finalNotes - Any final notes or attachments
   */
  async complete(finalNotes = {}) {
    if (this.state !== RFPState.VENDOR_SELECTED) {
      throw new Error(`Cannot complete in state: ${this.state}`);
    }

    this._log('completion_started');

    // Use ε annihilate to seal the workflow
    const result = annihilate({
      workflowId: this.id,
      rfpId: this.rfp?.id,
      selectedVendor: this.selectedVendor,
      finalQuote: this.selectedVendor?.quote,
      budgetRemaining: this.budget ? this.budget.maxBudget - (this.selectedVendor?.quote || 0) : null,
    }, {
      finalNotes,
      auditLogLength: this.auditLog.length,
      ambPointsResolved: this.ambPoints.length,
      completedAt: Date.now(),
    });

    this.state = RFPState.COMPLETED;
    this._log('completion_complete', { sealed: result.sealed });

    return result;
  }

  /**
   * Cancel the workflow
   * @param {string} reason - Cancellation reason
   */
  async cancel(reason) {
    this._log('cancellation', { reason, previousState: this.state });

    const result = annihilate({
      workflowId: this.id,
      cancelled: true,
      reason,
    }, {
      state: this.state,
      cancelledAt: Date.now(),
    });

    this.state = RFPState.CANCELLED;
    return result;
  }

  /**
   * Get workflow summary
   */
  getSummary() {
    return {
      id: this.id,
      state: this.state,
      rfpId: this.rfp?.id,
      vendorCount: this.vendors.length,
      responseCount: this.responses.length,
      selectedVendor: this.selectedVendor?.vendor,
      budget: this.budget ? {
        max: this.budget.maxBudget,
        currency: this.budget.currency,
      } : null,
      auditLogEntries: this.auditLog.length,
      ambPoints: this.ambPoints.length,
      isComplete: isComplete({ _type: 'ε_complete', sealed: this.state === RFPState.COMPLETED }),
    };
  }
}

/**
 * Factory function for creating RFP workflows
 */
function createRFPWorkflow(options = {}) {
  return new RFPWorkflow(options);
}

module.exports = {
  // States
  RFPState,

  // Classes
  RFPWorkflow,
  RFPBuilder,
  ResponseParser,
  BudgetGuardian,

  // Factory
  createRFPWorkflow,
};
