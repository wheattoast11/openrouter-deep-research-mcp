// src/agents/computerUseAdapter.js
/**
 * Computer Use Adapter for Gemini 2.5 Computer Use Model
 * Provides visual understanding and action generation capabilities
 * Temperature: 0.15 for maximum determinism
 */

const openRouterClient = require('../utils/openRouterClient');
const config = require('../../config');
const fs = require('fs');
const path = require('path');

class ComputerUseAdapter {
  constructor() {
    this.model = config.models.computerUse.primary;
    this.temperature = config.models.computerUse.temperature;
    this.maxActions = config.models.computerUse.maxActions;
    this.actionHistory = [];
  }

  /**
   * Analyze a screenshot and generate the next action
   * @param {Buffer|string} screenshotBuffer - Screenshot as Buffer or base64
   * @param {string} goal - The goal to accomplish
   * @param {object} context - Additional context (URL, previous actions, etc.)
   * @returns {Promise<object>} - { action, confidence, reasoning }
   */
  async analyzeAndAct(screenshotBuffer, goal, context = {}) {
    try {
      const startTime = Date.now();
      
      // Convert screenshot to base64 if needed
      const screenshot = Buffer.isBuffer(screenshotBuffer)
        ? screenshotBuffer.toString('base64')
        : screenshotBuffer;

      // Build the analysis prompt
      const prompt = this._buildAnalysisPrompt(goal, context);

      // Call Gemini Computer Use model with vision
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${screenshot}`,
                detail: 'high'
              }
            }
          ]
        }
      ];

      const response = await openRouterClient.chatCompletion(
        this.model,
        messages,
        {
          temperature: this.temperature,
          max_tokens: 1000,
          response_format: { type: 'json_object' }
        }
      );

      const result = this._parseResponse(response);
      
      // Add to action history
      this.actionHistory.push({
        timestamp: new Date().toISOString(),
        goal,
        context,
        action: result.action,
        confidence: result.confidence,
        reasoning: result.reasoning,
        durationMs: Date.now() - startTime
      });

      console.error(`[${new Date().toISOString()}] ComputerUseAdapter: Generated action "${result.action.type}" with confidence ${result.confidence}`);

      return result;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ComputerUseAdapter: Error analyzing screenshot:`, error);
      throw new Error(`Failed to analyze screenshot: ${error.message}`);
    }
  }

  /**
   * Extract structured data from a screenshot
   * @param {Buffer|string} screenshotBuffer - Screenshot
   * @param {object} schema - JSON schema for extraction
   * @param {string} context - Additional context
   * @returns {Promise<object>} - Extracted data matching schema
   */
  async extractData(screenshotBuffer, schema, context = '') {
    try {
      const screenshot = Buffer.isBuffer(screenshotBuffer)
        ? screenshotBuffer.toString('base64')
        : screenshotBuffer;

      const prompt = `
You are a data extraction agent. Analyze this screenshot and extract information according to the following schema:

${JSON.stringify(schema, null, 2)}

${context ? `Additional context: ${context}` : ''}

Return ONLY valid JSON matching the schema. Be precise and extract exactly what is visible.
If a field is not visible, use null.
`;

      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${screenshot}`,
                detail: 'high'
              }
            }
          ]
        }
      ];

      const response = await openRouterClient.chatCompletion(
        config.models.computerUse.vision,
        messages,
        {
          temperature: 0.1,
          max_tokens: 2000,
          response_format: { type: 'json_object' }
        }
      );

      const content = response.choices?.[0]?.message?.content;
      const extracted = JSON.parse(content);

      console.error(`[${new Date().toISOString()}] ComputerUseAdapter: Extracted data with ${Object.keys(extracted).length} fields`);

      return extracted;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ComputerUseAdapter: Error extracting data:`, error);
      throw new Error(`Failed to extract data: ${error.message}`);
    }
  }

  /**
   * Understand the visual context of a screenshot
   * @param {Buffer|string} screenshotBuffer - Screenshot
   * @param {string} question - Question about the screenshot
   * @returns {Promise<string>} - Natural language answer
   */
  async understand(screenshotBuffer, question) {
    try {
      const screenshot = Buffer.isBuffer(screenshotBuffer)
        ? screenshotBuffer.toString('base64')
        : screenshotBuffer;

      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: question },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${screenshot}`,
                detail: 'high'
              }
            }
          ]
        }
      ];

      const response = await openRouterClient.chatCompletion(
        config.models.computerUse.vision,
        messages,
        {
          temperature: 0.2,
          max_tokens: 500
        }
      );

      const answer = response.choices?.[0]?.message?.content || 'Unable to understand screenshot';

      return answer;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ComputerUseAdapter: Error understanding screenshot:`, error);
      throw new Error(`Failed to understand screenshot: ${error.message}`);
    }
  }

  /**
   * Build the analysis prompt for action generation
   * @private
   */
  _buildAnalysisPrompt(goal, context) {
    const previousActions = this.actionHistory.slice(-3).map(a => ({
      action: a.action.type,
      target: a.action.target,
      result: a.action.result || 'pending'
    }));

    return `
You are a computer use agent with vision capabilities. Analyze this screenshot and determine the next action to accomplish the goal.

GOAL: ${goal}

CURRENT CONTEXT:
- URL: ${context.url || 'Unknown'}
- Viewport: ${context.viewport || 'Unknown'}
- Previous Actions: ${previousActions.length > 0 ? JSON.stringify(previousActions) : 'None'}

AVAILABLE ACTIONS:
1. navigate - Go to a URL
2. click - Click an element (provide selector)
3. type - Type text into an element (provide selector and text)
4. scroll - Scroll the page (direction: up/down/left/right, amount: pixels)
5. extract - Extract visible data (provide what to extract)
6. wait - Wait for an element or condition (provide selector or condition)
7. complete - Goal is accomplished

RULES:
- Be deterministic: same input → same output
- Choose the MOST DIRECT action to accomplish the goal
- Use specific CSS selectors when possible
- If multiple options exist, choose the most prominent one
- If the goal is accomplished, return action: "complete"
- Provide high confidence (0.8+) only when certain

Return a JSON object with this EXACT structure:
{
  "action": {
    "type": "navigate" | "click" | "type" | "scroll" | "extract" | "wait" | "complete",
    "target": "selector or URL or description",
    "value": "text to type (only for type action)",
    "params": { "direction": "down", "amount": 500 }
  },
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this action"
}
`;
  }

  /**
   * Parse the model response
   * @private
   */
  _parseResponse(response) {
    try {
      const content = response.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('Empty response from model');
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        // Try to extract JSON from markdown code block
        const match = content.match(/```json\n([\s\S]*?)\n```/);
        if (match) {
          parsed = JSON.parse(match[1]);
        } else {
          throw new Error('Could not parse JSON from response');
        }
      }

      // Validate structure
      if (!parsed.action || !parsed.action.type) {
        throw new Error('Invalid action structure');
      }

      // Set defaults
      parsed.confidence = Math.min(Math.max(parsed.confidence || 0.5, 0), 1);
      parsed.reasoning = parsed.reasoning || 'No reasoning provided';

      return parsed;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ComputerUseAdapter: Error parsing response:`, error);
      
      // Return a safe default action
      return {
        action: {
          type: 'wait',
          target: 'page to load',
          params: { duration: 2000 }
        },
        confidence: 0.3,
        reasoning: `Failed to parse model response: ${error.message}`
      };
    }
  }

  /**
   * Execute a multi-turn action loop
   * @param {Function} screenshotFn - Function that returns a screenshot Buffer
   * @param {string} goal - The goal to accomplish
   * @param {object} initialContext - Initial context
   * @param {Function} actionExecutor - Function to execute actions
   * @returns {Promise<Array>} - Array of executed actions
   */
  async executeLoop(screenshotFn, goal, initialContext, actionExecutor) {
    const actions = [];
    let context = { ...initialContext };
    let turnCount = 0;

    console.error(`[${new Date().toISOString()}] ComputerUseAdapter: Starting action loop for goal: "${goal}"`);

    while (turnCount < this.maxActions) {
      turnCount++;

      try {
        // Capture current state
        const screenshot = await screenshotFn();
        
        // Analyze and get next action
        const result = await this.analyzeAndAct(screenshot, goal, context);
        
        // Check if goal is complete
        if (result.action.type === 'complete') {
          console.error(`[${new Date().toISOString()}] ComputerUseAdapter: Goal accomplished after ${turnCount} actions`);
          actions.push({
            turn: turnCount,
            ...result,
            executed: true,
            success: true
          });
          break;
        }

        // Execute the action
        const executionResult = await actionExecutor(result.action, context);
        
        actions.push({
          turn: turnCount,
          ...result,
          executed: true,
          success: executionResult.success,
          result: executionResult.result
        });

        // Update context for next iteration
        context = {
          ...context,
          lastAction: result.action,
          lastResult: executionResult
        };

        // Short delay to allow page to settle
        await this._sleep(500);

      } catch (error) {
        console.error(`[${new Date().toISOString()}] ComputerUseAdapter: Error in action loop (turn ${turnCount}):`, error);
        
        actions.push({
          turn: turnCount,
          action: { type: 'error' },
          confidence: 0,
          reasoning: error.message,
          executed: false,
          success: false
        });

        // Decide whether to continue or abort
        if (turnCount >= 3) break; // Abort after 3 consecutive errors
      }
    }

    if (turnCount >= this.maxActions) {
      console.warn(`[${new Date().toISOString()}] ComputerUseAdapter: Reached max actions (${this.maxActions}) without completing goal`);
    }

    return actions;
  }

  /**
   * Get action history
   * @returns {Array} - Action history
   */
  getHistory() {
    return [...this.actionHistory];
  }

  /**
   * Clear action history
   */
  clearHistory() {
    this.actionHistory = [];
  }

  /**
   * Sleep helper
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ComputerUseAdapter;




