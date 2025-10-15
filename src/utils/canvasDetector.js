// src/utils/canvasDetector.js
/**
 * Intelligent Canvas Detection
 * 
 * Analyzes task and determines optimal canvas mode:
 * - full-page: Entire browser controlled
 * - split-pane: 50% width iframe
 * - overlay: Transparent layer
 * - iframe: Embedded in element
 * 
 * Decision factors:
 * - Task complexity
 * - Available screen space
 * - User preferences
 * - Content type
 */

const dbClient = require('./dbClient');

class CanvasDetector {
  constructor() {
    this.userPreferences = new Map(); // userId -> preferences
  }

  /**
   * Detect optimal canvas mode for a task
   * @param {string} task - Task description
   * @param {object} context - Additional context
   * @returns {Promise<object>} Canvas mode recommendation
   */
  async detectCanvasMode(task, context = {}) {
    try {
      // Assess task complexity
      const complexity = await this._assessComplexity(task);
      
      // Check available screen space
      const screenSpace = context.screenWidth || 1920;
      
      // Get user preferences
      const userPref = this._getUserPreference(context.userId);
      
      // Determine optimal mode
      const mode = this._selectMode(complexity, screenSpace, userPref, context);
      
      console.error(`[${new Date().toISOString()}] Canvas mode selected: ${mode.type} (complexity: ${complexity.toFixed(2)})`);
      
      return mode;
    } catch (error) {
      console.error('Canvas detection error:', error);
      
      // Fallback to safe default
      return {
        type: 'iframe',
        reasoning: 'Fallback mode due to detection error',
        parameters: {
          width: '100%',
          height: '600px'
        }
      };
    }
  }

  /**
   * Set user preference for canvas mode
   */
  setUserPreference(userId, preference) {
    this.userPreferences.set(userId, {
      ...preference,
      updatedAt: Date.now()
    });
  }

  /**
   * Get user preference
   * @private
   */
  _getUserPreference(userId) {
    return this.userPreferences.get(userId) || { mode: 'auto' };
  }

  /**
   * Assess task complexity
   * @private
   */
  async _assessComplexity(task) {
    // Use heuristics for fast assessment
    let complexity = 0;
    
    // Length factor
    const words = task.split(/\s+/).length;
    complexity += Math.min(words / 50, 0.3);
    
    // Action complexity
    const actions = {
      'read': 0.1,
      'extract': 0.2,
      'compare': 0.4,
      'analyze': 0.5,
      'navigate multiple': 0.6,
      'monitor': 0.7,
      'synthesize': 0.8
    };
    
    for (const [pattern, score] of Object.entries(actions)) {
      if (new RegExp(pattern, 'i').test(task)) {
        complexity = Math.max(complexity, score);
      }
    }
    
    // Multi-step indicator
    if (/and|then|after|also|additionally/i.test(task)) {
      complexity += 0.2;
    }
    
    return Math.min(complexity, 1.0);
  }

  /**
   * Select canvas mode based on factors
   * @private
   */
  _selectMode(complexity, screenSpace, userPref, context) {
    // User override
    if (userPref.mode && userPref.mode !== 'auto') {
      return {
        type: userPref.mode,
        reasoning: 'User preference override',
        parameters: this._getParameters(userPref.mode, screenSpace)
      };
    }
    
    // Context-specific overrides
    if (context.requiresFullControl) {
      return {
        type: 'full-page',
        reasoning: 'Task requires full browser control',
        parameters: this._getParameters('full-page', screenSpace)
      };
    }
    
    // Complexity-based selection
    if (complexity > 0.7) {
      // High complexity → Full page
      return {
        type: 'full-page',
        reasoning: `High complexity (${complexity.toFixed(2)}) requires full control`,
        parameters: this._getParameters('full-page', screenSpace)
      };
    } else if (complexity > 0.4) {
      // Medium complexity → Split pane
      return {
        type: 'split-pane',
        reasoning: `Medium complexity (${complexity.toFixed(2)}) benefits from split view`,
        parameters: this._getParameters('split-pane', screenSpace)
      };
    } else if (context.embedInExisting) {
      // Low complexity, embed in existing → Iframe
      return {
        type: 'iframe',
        reasoning: `Low complexity (${complexity.toFixed(2)}), embedded view sufficient`,
        parameters: this._getParameters('iframe', screenSpace)
      };
    } else {
      // Default → Overlay (minimal disruption)
      return {
        type: 'overlay',
        reasoning: `Default mode for complexity ${complexity.toFixed(2)}`,
        parameters: this._getParameters('overlay', screenSpace)
      };
    }
  }

  /**
   * Get parameters for canvas mode
   * @private
   */
  _getParameters(mode, screenSpace) {
    const params = {
      'full-page': {
        width: '100vw',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 10000
      },
      
      'split-pane': {
        width: screenSpace > 1920 ? '960px' : '50vw',
        height: '100vh',
        position: 'fixed',
        top: 0,
        right: 0,
        zIndex: 9999
      },
      
      'overlay': {
        width: '800px',
        height: '600px',
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9998,
        opacity: 0.95
      },
      
      'iframe': {
        width: '100%',
        height: '600px',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px'
      }
    };
    
    return params[mode] || params.overlay;
  }

  /**
   * Generate canvas HTML
   */
  generateCanvasHtml(mode, sessionId) {
    const params = this._getParameters(mode.type, 1920);
    
    const styles = Object.entries(params)
      .map(([key, value]) => `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value}`)
      .join('; ');
    
    return `
      <div id="dreamspace-canvas" style="${styles}">
        <iframe 
          src="/dreamspace?session=${sessionId}" 
          style="width: 100%; height: 100%; border: none;"
          allow="camera; microphone; autoplay"
        ></iframe>
      </div>
    `;
  }
}

// Singleton instance
const clientLauncher = new ClientLauncher();

module.exports = clientLauncher;
module.exports.ClientLauncher = ClientLauncher;




