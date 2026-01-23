/**
 * Signal Router (Core Routing Layer)
 * 
 * Routes incoming signals to the appropriate cognitive path (Chat, Research, or Action).
 * Uses Thermodynamic Routing (Energy-based semantic matching).
 */

const { createRouter, ThermodynamicRouter } = require('../../routing');
const config = require('../../../config');
const logger = require('../../utils/logger').child('SignalRouter');

const INTENT_ATTRACTORS = [
  {
    id: 'chat',
    name: 'Dialogue',
    description: 'Casual conversation, greetings, and system meta-questions',
    seedPhrases: [
      'hello', 'hi', 'how are you', 'who are you', 'what is your name',
      'can we talk', 'tell me a joke', 'what can you do', 'help me understand'
    ],
    model: config.models?.planning || 'openai/gpt-5-mini',
    agent: 'zero_chat'
  },
  {
    id: 'research',
    name: 'Research',
    description: 'Deep information retrieval, analysis, and synthesis',
    seedPhrases: [
      'research the topic of', 'investigate', 'find information about',
      'analyze the following', 'give me a comprehensive report on',
      'what is the history of', 'explain in detail'
    ],
    model: config.models?.research || 'google/gemini-3-flash-preview',
    agent: 'research_ensemble'
  },
  {
    id: 'action',
    name: 'Action',
    description: 'Direct tool execution, file operations, or coding tasks',
    seedPhrases: [
      'run this command', 'create a file', 'edit this code',
      'execute the script', 'fix the bug in', 'npm install',
      'git commit these changes'
    ],
    model: config.models?.synthesis || 'anthropic/claude-sonnet-4.5',
    agent: 'task_processor'
  }
];

class SignalRouter {
  constructor() {
    this.router = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    // Create a specialized thermodynamic router for intents
    const routingConfig = config.routing || {};
    this.router = await createRouter({
      boltzmannTemperature: routingConfig.boltzmannTemperature || 0.3, 
      minConfidenceThreshold: routingConfig.minConfidenceThreshold || 0.5,
      maxEnergyThreshold: routingConfig.maxEnergyThreshold || 0.8
    });

    // Initialize with intent-specific attractors
    await this.router.initialize(INTENT_ATTRACTORS);
    this.initialized = true;
    logger.info('SignalRouter initialized with neural intent attractors');
  }

  /**
   * Routes a raw input to a specific intent
   * @param {string} input 
   * @returns {Promise<Object>} The routing decision
   */
  async route(input) {
    if (!this.initialized) await this.initialize();

    // Fast-path: short greetings are almost always chat
    if (input.length < 10 && /^(hi|hello|hey|yo|help|who)$/i.test(input.trim())) {
      return {
        selectedAttractor: 'chat',
        confidence: 0.95,
        model: 'openai/gpt-5-mini',
        agent: 'zero_chat'
      };
    }

    const decision = await this.router.route(input);
    
    // Heuristic: Very long inputs are usually research/analysis
    if (input.length > 500 && decision.selectedAttractor === 'chat') {
       decision.selectedAttractor = 'research';
       decision.agent = 'research_ensemble';
       decision.confidence = Math.max(decision.confidence, 0.7);
    }

    const attractor = this.router.getAttractor(decision.selectedAttractor);
    
    return {
      ...decision,
      name: attractor ? attractor.name : decision.selectedAttractor
    };
  }
}

module.exports = new SignalRouter();
