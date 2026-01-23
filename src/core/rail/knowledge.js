/**
 * Knowledge Pipeline: Perceptual Synthesis for Research
 *
 * Orchestrates the transition from raw web perception to crystallized knowledge
 * using the Rail protocol and Signal-native combinators.
 *
 * @module core/rail/knowledge
 */

'use strict';

const { Pipeline, StageType } = require('./pipeline');
const { Signal } = require('../signal');
const { StreamingConsensus, ConsensusState } = require('./consensus');
const UnifiedSearchMesh = require('../../utils/robustWebScraper');
const { SignalParser } = require('../../utils/xmlParser');

class KnowledgePipeline {
  constructor() {
    this.mesh = new UnifiedSearchMesh();
    this.parser = new SignalParser();
    
    this.pipeline = new Pipeline('knowledge-mesh', { traceEnabled: true })
      // Stage 1: Perception - Gather raw signals from the web fabric
      .stage(StageType.TRANSFORM, 'perception', async (token) => {
        const query = token.value;
        const signals = await this.mesh.perception(query);
        return token.derive(signals, 'perception');
      })
      
      // Stage 2: Synthesis - Reduce multiple web signals into a unified insight
      .stage(StageType.TRANSFORM, 'synthesis', async (token) => {
        const signals = token.value;
        if (!Array.isArray(signals) || signals.length === 0) return token;
        
        const reduction = Signal.reduce(signals, { tags: ['knowledge-synthesis'] });
        return token.derive(reduction, 'synthesis');
      })
      
      // Stage 3: Crystallization - Detect if the synthesized insight has converged
      .observe('crystallization', async (token) => {
        const signal = token.value;
        if (signal instanceof Signal && signal.isConverged()) {
          process.stderr.write(`[${new Date().toISOString()}] KnowledgePipeline: Crystallization detected (score: ${signal.crystallization.score})\n`);
        }
      });
  }

  /**
   * Execute the research pipeline for a query.
   * Returns a promise that resolves when knowledge has crystallized or timeout.
   */
  async research(query) {
    const result = await this.pipeline.execute(query);
    
    if (!result.ok) {
      throw result.error;
    }

    return result.value.value; // The final Signal
  }

  /**
   * Create a streaming research session.
   * Emits consensus updates via the consensus manager.
   */
  async streamResearch(query, progressToken) {
    const { consensusManager } = require('./index');
    const consensus = consensusManager.create({ minAgreement: 0.7 });
    consensus.start(progressToken);

    // Initial perception
    const perceptionSignals = await this.mesh.perception(query);
    perceptionSignals.forEach(s => consensus.addSignal(s));

    // Synthesis is handled by the reduction of signals in the consensus calculator
    return consensus;
  }
}

module.exports = KnowledgePipeline;
