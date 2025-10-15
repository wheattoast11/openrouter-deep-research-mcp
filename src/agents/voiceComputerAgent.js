// src/agents/voiceComputerAgent.js
/**
 * Voice + Computer Use Fusion Agent
 * 
 * Combines:
 * - Gemini Live API (voice input/output)
 * - Computer Use Adapter (visual understanding + actions)
 * - Action Executor (browser automation)
 * 
 * Flow:
 * 1. User speaks: "Find pricing for X and compare"
 * 2. Live API transcribes + understands
 * 3. Computer Agent navigates + extracts
 * 4. Live API synthesizes → speaks back
 * 5. Dreamspace visualizes in real-time
 */

const GeminiLiveClient = require('../utils/geminiLiveClient');
const ComputerUseAdapter = require('./computerUseAdapter');
const ActionExecutor = require('./actionExecutor');
const visualJourneyCapture = require('../utils/visualJourneyCapture');

class VoiceComputerAgent {
  constructor(options = {}) {
    this.liveClient = new GeminiLiveClient(options);
    this.computerAdapter = new ComputerUseAdapter();
    this.actionExecutor = new ActionExecutor({ headless: false });
    
    this.activeSession = null;
    this.conversationHistory = [];
  }

  /**
   * Start a conversational research session
   * @param {string} sessionId - Session identifier
   * @param {string} initialQuery - Optional initial query
   * @returns {Promise<void>}
   */
  async startConversation(sessionId, initialQuery = null) {
    this.activeSession = sessionId;
    
    // Initialize visual journey
    const journey = await visualJourneyCapture.initializeJourney(
      sessionId,
      initialQuery || 'Voice-driven research session'
    );
    
    // Connect to Gemini Live API with function declarations
    await this.liveClient.connect({
      voice: 'Puck', // Friendly, conversational voice
      functions: [
        {
          name: 'navigate_and_extract',
          description: 'Navigate to a URL and extract specific information',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to navigate to' },
              extractionSchema: { type: 'object', description: 'JSON schema for data to extract' }
            },
            required: ['url']
          }
        },
        {
          name: 'analyze_current_page',
          description: 'Analyze the currently visible page',
          parameters: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'Question about the page' }
            },
            required: ['question']
          }
        },
        {
          name: 'compare_pages',
          description: 'Navigate to multiple pages and compare information',
          parameters: {
            type: 'object',
            properties: {
              urls: { type: 'array', items: { type: 'string' }, description: 'URLs to compare' },
              comparisonCriteria: { type: 'string', description: 'What to compare' }
            },
            required: ['urls']
          }
        },
        {
          name: 'search_and_synthesize',
          description: 'Search for information and provide synthesis',
          parameters: {
            type: 'object',
            properties: {
              searchQuery: { type: 'string', description: 'What to search for' },
              depth: { type: 'string', enum: ['quick', 'standard', 'deep'], description: 'Search depth' }
            },
            required: ['searchQuery']
          }
        }
      ]
    });
    
    // Set up event handlers
    this._setupEventHandlers(journey);
    
    // Start with initial query if provided
    if (initialQuery) {
      await this.liveClient.sendText(initialQuery);
    }
    
    console.error(`[${new Date().toISOString()}] Voice+Computer session started: ${sessionId}`);
  }

  /**
   * Process voice input
   * @param {Buffer} audioBuffer - PCM audio data
   */
  async processVoice(audioBuffer) {
    if (!this.liveClient.connected) {
      throw new Error('Not connected to Gemini Live API');
    }
    
    await this.liveClient.sendAudio(audioBuffer);
  }

  /**
   * Get conversation history
   */
  getHistory() {
    return [...this.conversationHistory];
  }

  /**
   * Stop conversation
   */
  async stop() {
    await this.liveClient.disconnect();
    await this.actionExecutor.close();
    this.activeSession = null;
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Setup event handlers
   * @private
   */
  _setupEventHandlers(journey) {
    // Handle text responses
    this.liveClient.on('text', (text) => {
      this.conversationHistory.push({
        role: 'assistant',
        type: 'text',
        content: text,
        timestamp: Date.now()
      });
      
      this.emit('agent_response', { type: 'text', content: text });
    });
    
    // Handle audio responses
    this.liveClient.on('audio', (audioBuffer) => {
      this.emit('agent_audio', audioBuffer);
    });
    
    // Handle function calls
    this.liveClient.on('function_call', async (call) => {
      console.error(`[${new Date().toISOString()}] Function called: ${call.name}`);
      
      try {
        const result = await this._executeFunctionCall(call, journey);
        
        await this.liveClient.sendFunctionResponse(call.id, result);
        
        this.emit('function_executed', { call, result });
      } catch (error) {
        console.error('Function execution error:', error);
        
        await this.liveClient.sendFunctionResponse(call.id, {
          error: error.message
        });
      }
    });
  }

  /**
   * Execute function call from Gemini
   * @private
   */
  async _executeFunctionCall(call, journey) {
    const { name, args } = call;
    
    switch (name) {
      case 'navigate_and_extract':
        return await this._navigateAndExtract(args, journey);
      
      case 'analyze_current_page':
        return await this._analyzeCurrentPage(args, journey);
      
      case 'compare_pages':
        return await this._comparePages(args, journey);
      
      case 'search_and_synthesize':
        return await this._searchAndSynthesize(args, journey);
      
      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }

  /**
   * Navigate and extract
   * @private
   */
  async _navigateAndExtract(args, journey) {
    const { url, extractionSchema } = args;
    
    // Navigate
    await this.actionExecutor.navigate(url);
    
    // Capture screenshot
    const screenshotResult = await this.actionExecutor.screenshot();
    await visualJourneyCapture.captureScreenshot(journey.id, screenshotResult.buffer, {
      url,
      action_type: 'navigate_and_extract'
    });
    
    // Extract data if schema provided
    if (extractionSchema) {
      const extractResult = await this.actionExecutor.extract(null, extractionSchema);
      return extractResult.data;
    }
    
    // Otherwise, use Computer Use to analyze and extract
    const analysis = await this.computerAdapter.analyzeAndAct(
      screenshotResult.buffer,
      `Extract key information from this page about: ${url}`,
      { url }
    );
    
    return {
      url,
      analysis: analysis.reasoning,
      confidence: analysis.confidence
    };
  }

  /**
   * Analyze current page
   * @private
   */
  async _analyzeCurrentPage(args, journey) {
    const { question } = args;
    
    // Get current URL
    const currentUrl = await this.actionExecutor.getCurrentUrl();
    
    // Capture screenshot
    const screenshotResult = await this.actionExecutor.screenshot();
    await visualJourneyCapture.captureScreenshot(journey.id, screenshotResult.buffer, {
      url: currentUrl,
      action_type: 'analyze',
      description: question
    });
    
    // Use Computer Use to understand
    const understanding = await this.computerAdapter.understand(
      screenshotResult.buffer,
      question
    );
    
    return {
      url: currentUrl,
      question,
      answer: understanding
    };
  }

  /**
   * Compare pages
   * @private
   */
  async _comparePages(args, journey) {
    const { urls, comparisonCriteria } = args;
    
    const pageData = [];
    
    for (const url of urls) {
      // Navigate
      await this.actionExecutor.navigate(url);
      await this.actionExecutor.waitFor(2000); // Let page load
      
      // Capture
      const screenshotResult = await this.actionExecutor.screenshot();
      await visualJourneyCapture.captureScreenshot(journey.id, screenshotResult.buffer, {
        url,
        action_type: 'compare'
      });
      
      // Extract based on criteria
      const extracted = await this.computerAdapter.extractData(
        screenshotResult.buffer,
        { [comparisonCriteria]: 'string' },
        `Extract ${comparisonCriteria} from this page`
      );
      
      pageData.push({
        url,
        data: extracted
      });
    }
    
    return {
      comparison: pageData,
      criteria: comparisonCriteria,
      urls: urls.length
    };
  }

  /**
   * Search and synthesize
   * @private
   */
  async _searchAndSynthesize(args, journey) {
    const { searchQuery, depth = 'standard' } = args;
    
    // Use the research loop
    const { research } = require('../intelligence/researchCore');
    const livingMemory = require('../intelligence/livingMemory');
    
    const results = [];
    
    for await (const result of research(searchQuery, { requestId: journey.id }, livingMemory)) {
      results.push(result);
      
      // Emit progress
      if (result.type === 'insight') {
        this.emit('research_progress', result);
      }
    }
    
    // Get final synthesis
    const synthesis = results.find(r => r.type === 'synthesis' || r.type === 'complete');
    
    return {
      query: searchQuery,
      synthesis: synthesis?.data?.synthesis || 'Research complete',
      insights: results.filter(r => r.type === 'insight').length
    };
  }
}

module.exports = VoiceComputerAgent;

