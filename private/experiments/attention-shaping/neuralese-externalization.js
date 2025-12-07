/**
 * Neuralese Externalization
 *
 * Captures token patterns that drive understanding and crystallization.
 * Part of the TEJ_CLAUDE_UIT_PHASE_LOCK resonance system.
 *
 * EXPERIMENTAL - DO NOT USE IN PRODUCTION
 *
 * @see src/core/signal.js for production crystallization analysis
 */

// Import from core Signal protocol
const {
  CrystallizationPatterns: CorePatterns,
  extractCrystallization
} = require('../../../src/core/signal');

/**
 * Token patterns that indicate context crystallization
 * Extended patterns beyond core for experimental analysis
 */
const CrystallizationPatterns = {
  // Import core patterns
  ...CorePatterns,

  // Extended experimental patterns
  CONTEXT_STORE: /context.?store|memory|persist/i,
  PHASE_LOCK_EXTENDED: /phase.?lock|resonan|attractor|entrain/i
};

/**
 * Extract neuralese representation from text
 * Uses core extractCrystallization and adds experimental extensions
 *
 * @param {string} text - Input text to analyze
 * @returns {Object} Neuralese representation
 */
function extractNeuralese(text) {
  // Use core implementation for base crystallization
  const core = extractCrystallization(text);

  // Add experimental extended patterns
  const extendedPatterns = {};
  for (const [name, regex] of Object.entries(CrystallizationPatterns)) {
    if (!core.patterns[name]) {
      const matches = text.match(new RegExp(regex, 'gi'));
      extendedPatterns[name] = {
        present: !!matches,
        count: matches ? matches.length : 0
      };
    }
  }

  // Merge patterns
  const patterns = { ...core.patterns, ...extendedPatterns };

  // Experimental: add phase resonance detection
  const phaseResonance = detectPhaseResonance(text);

  return {
    patterns,
    crystallizationScore: core.score,
    phaseResonance,
    timestamp: new Date().toISOString()
  };
}

/**
 * Experimental: Detect phase-locked resonance patterns
 */
function detectPhaseResonance(text) {
  const markers = [
    'TEJ_CLAUDE', 'PHASE_LOCK', 'ATTRACTOR_STATE',
    'CRYSTALLIZATION', 'RESONANT', 'ENTRAIN'
  ];

  const found = markers.filter(m =>
    text.toUpperCase().includes(m)
  );

  return {
    detected: found.length > 0,
    markers: found,
    strength: found.length / markers.length
  };
}

/**
 * Serialize neuralese for external storage
 */
function serializeNeuralese(neuralese) {
  return `CONTEXT_CRYSTALLIZATION := {
  structural_isomorphism: ${neuralese.patterns.ISOMORPHISM.present},
  progressive_disclosure: ${neuralese.patterns.PROGRESSIVE_DISCLOSURE.present},
  event_sourcing: ${neuralese.patterns.EVENT_SOURCING.present},
  resonant_phase_lock: ${neuralese.patterns.PHASE_LOCK.present},
  score: ${neuralese.crystallizationScore.toFixed(3)}
}`;
}

module.exports = {
  CrystallizationPatterns,
  extractNeuralese,
  serializeNeuralese
};
