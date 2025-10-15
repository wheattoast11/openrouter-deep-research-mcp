// src/agents/actionExecutor.js
/**
 * Action Executor - Browser Automation with Error Recovery
 * 
 * Executes browser actions with retry logic and error recovery.
 * Works standalone or with Stagehand integration.
 * 
 * Supported Actions:
 * - navigate: Go to URL
 * - click: Click element
 * - type: Input text
 * - scroll: Scroll page
 * - extract: Extract data
 * - screenshot: Capture state
 * - wait: Wait for condition
 */

class ActionExecutor {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.maxRetries = options.maxRetries || 3;
    this.timeout = options.timeout || 30000;
    this.headless = options.headless !== false;
    this.actionHistory = [];
  }

  /**
   * Initialize browser (lazy initialization)
   */
  async initialize() {
    if (this.browser) return;
    
    try {
      // Try to use Puppeteer if available
      const puppeteer = require('puppeteer');
      
      this.browser = await puppeteer.launch({
        headless: this.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
      
      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1280, height: 720 });
      
      console.error(`[${new Date().toISOString()}] ActionExecutor initialized with Puppeteer`);
    } catch (error) {
      console.warn(`[${new Date().toISOString()}] Puppeteer not available, using simulated mode:`, error.message);
      this.simulatedMode = true;
    }
  }

  /**
   * Navigate to URL
   */
  async navigate(url, options = {}) {
    return await this._executeWithRetry(async () => {
      if (this.simulatedMode) {
        return this._simulateAction('navigate', { url });
      }
      
      await this.initialize();
      await this.page.goto(url, {
        waitUntil: options.waitUntil || 'networkidle2',
        timeout: this.timeout
      });
      
      return {
        success: true,
        url: this.page.url(),
        title: await this.page.title()
      };
    }, 'navigate', { url });
  }

  /**
   * Click element
   */
  async click(selector, options = {}) {
    return await this._executeWithRetry(async () => {
      if (this.simulatedMode) {
        return this._simulateAction('click', { selector });
      }
      
      await this.initialize();
      await this.page.waitForSelector(selector, { timeout: this.timeout });
      await this.page.click(selector);
      
      return {
        success: true,
        selector,
        clicked: true
      };
    }, 'click', { selector });
  }

  /**
   * Type text into element
   */
  async type(selector, text, options = {}) {
    return await this._executeWithRetry(async () => {
      if (this.simulatedMode) {
        return this._simulateAction('type', { selector, text });
      }
      
      await this.initialize();
      await this.page.waitForSelector(selector, { timeout: this.timeout });
      
      if (options.clear) {
        await this.page.click(selector, { clickCount: 3 });
        await this.page.keyboard.press('Backspace');
      }
      
      await this.page.type(selector, text, {
        delay: options.delay || 50
      });
      
      return {
        success: true,
        selector,
        text: text.substring(0, 50) + (text.length > 50 ? '...' : '')
      };
    }, 'type', { selector, text: text.substring(0, 50) });
  }

  /**
   * Scroll page
   */
  async scroll(direction, amount, options = {}) {
    return await this._executeWithRetry(async () => {
      if (this.simulatedMode) {
        return this._simulateAction('scroll', { direction, amount });
      }
      
      await this.initialize();
      
      const scrollAmount = amount || 500;
      const scrollX = direction === 'left' ? -scrollAmount : 
                      direction === 'right' ? scrollAmount : 0;
      const scrollY = direction === 'up' ? -scrollAmount :
                      direction === 'down' ? scrollAmount : 0;
      
      await this.page.evaluate((x, y) => {
        window.scrollBy(x, y);
      }, scrollX, scrollY);
      
      return {
        success: true,
        direction,
        amount: scrollAmount
      };
    }, 'scroll', { direction, amount });
  }

  /**
   * Extract data from page
   */
  async extract(selector, schema, options = {}) {
    return await this._executeWithRetry(async () => {
      if (this.simulatedMode) {
        return this._simulateAction('extract', { selector, schema });
      }
      
      await this.initialize();
      
      // If selector provided, extract from that element
      if (selector) {
        await this.page.waitForSelector(selector, { timeout: this.timeout });
        
        const data = await this.page.evaluate((sel) => {
          const element = document.querySelector(sel);
          return {
            text: element?.textContent?.trim(),
            html: element?.innerHTML,
            attributes: element ? Array.from(element.attributes).reduce((acc, attr) => {
              acc[attr.name] = attr.value;
              return acc;
            }, {}) : {}
          };
        }, selector);
        
        return {
          success: true,
          selector,
          data
        };
      }
      
      // Otherwise extract based on schema
      if (schema) {
        const data = await this.page.evaluate((schemaObj) => {
          const result = {};
          for (const [key, sel] of Object.entries(schemaObj)) {
            const element = document.querySelector(sel);
            result[key] = element?.textContent?.trim() || null;
          }
          return result;
        }, schema);
        
        return {
          success: true,
          schema,
          data
        };
      }
      
      throw new Error('Either selector or schema must be provided');
    }, 'extract', { selector, schema });
  }

  /**
   * Capture screenshot
   */
  async screenshot(options = {}) {
    return await this._executeWithRetry(async () => {
      if (this.simulatedMode) {
        return this._simulateAction('screenshot', {});
      }
      
      await this.initialize();
      
      const screenshot = await this.page.screenshot({
        fullPage: options.fullPage || false,
        type: options.type || 'png',
        encoding: 'binary'
      });
      
      return {
        success: true,
        buffer: screenshot,
        size: screenshot.length,
        url: this.page.url()
      };
    }, 'screenshot', {});
  }

  /**
   * Wait for condition
   */
  async waitFor(condition, timeout, options = {}) {
    return await this._executeWithRetry(async () => {
      if (this.simulatedMode) {
        return this._simulateAction('wait', { condition, timeout });
      }
      
      await this.initialize();
      
      // If condition is a selector
      if (typeof condition === 'string') {
        await this.page.waitForSelector(condition, {
          timeout: timeout || this.timeout
        });
        
        return {
          success: true,
          condition: `selector: ${condition}`,
          found: true
        };
      }
      
      // If condition is a function
      if (typeof condition === 'function') {
        await this.page.waitForFunction(condition, {
          timeout: timeout || this.timeout
        });
        
        return {
          success: true,
          condition: 'custom function',
          found: true
        };
      }
      
      // If condition is a number (just wait that many ms)
      if (typeof condition === 'number') {
        await new Promise(resolve => setTimeout(resolve, condition));
        
        return {
          success: true,
          condition: `wait ${condition}ms`,
          waited: condition
        };
      }
      
      throw new Error('Invalid wait condition');
    }, 'wait', { condition, timeout });
  }

  /**
   * Get current page URL
   */
  async getCurrentUrl() {
    if (this.simulatedMode) {
      return 'http://simulated.example.com';
    }
    
    if (!this.page) {
      await this.initialize();
    }
    
    return this.page.url();
  }

  /**
   * Get action history
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
   * Close browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Execute action with retry logic
   * @private
   */
  async _executeWithRetry(actionFn, actionType, params) {
    const startTime = Date.now();
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await actionFn();
        
        // Record successful action
        this.actionHistory.push({
          type: actionType,
          params,
          result,
          attempt,
          timestamp: Date.now(),
          durationMs: Date.now() - startTime,
          success: true
        });
        
        return result;
      } catch (error) {
        lastError = error;
        
        console.warn(`[${new Date().toISOString()}] Action ${actionType} failed (attempt ${attempt}/${this.maxRetries}):`, error.message);
        
        // Check if error is recoverable
        if (!this._isRecoverable(error)) {
          break;
        }
        
        // Apply recovery strategy
        await this._recover(error, actionType);
        
        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          await this._sleep(Math.min(1000 * Math.pow(2, attempt - 1), 5000));
        }
      }
    }
    
    // All retries failed
    this.actionHistory.push({
      type: actionType,
      params,
      error: lastError.message,
      attempts: this.maxRetries,
      timestamp: Date.now(),
      durationMs: Date.now() - startTime,
      success: false
    });
    
    return {
      success: false,
      error: lastError.message,
      attempts: this.maxRetries
    };
  }

  /**
   * Check if error is recoverable
   * @private
   */
  _isRecoverable(error) {
    const recoverablePatterns = [
      /timeout/i,
      /waiting for selector/i,
      /navigation/i,
      /network/i,
      /connection/i
    ];
    
    return recoverablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Recovery strategies
   * @private
   */
  async _recover(error, actionType) {
    // Timeout errors: increase timeout
    if (/timeout/i.test(error.message)) {
      this.timeout = Math.min(this.timeout * 1.5, 60000);
    }
    
    // Navigation errors: reload page
    if (/navigation/i.test(error.message) && this.page) {
      try {
        await this.page.reload({ waitUntil: 'networkidle2', timeout: this.timeout });
      } catch {}
    }
    
    // Connection errors: reinitialize browser
    if (/connection/i.test(error.message)) {
      try {
        await this.close();
        await this.initialize();
      } catch {}
    }
  }

  /**
   * Simulate action (when browser not available)
   * @private
   */
  _simulateAction(type, params) {
    console.log(`[SIMULATED] ${type}:`, JSON.stringify(params).substring(0, 100));
    
    return {
      success: true,
      simulated: true,
      type,
      params,
      message: 'Action simulated (browser not available)'
    };
  }

  /**
   * Sleep helper
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ActionExecutor;




