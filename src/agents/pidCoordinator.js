// src/agents/pidCoordinator.js
/**
 * PID Coordinator - Control Theory Alignment Across Agents
 * 
 * Uses PID control to maintain alignment between:
 * - Research goal (setpoint)
 * - Current findings (process variable)
 * - Agent behaviors (control output)
 * 
 * Tuning: Kp=0.8, Ki=0.2, Kd=0.1 (auto-tune over time)
 */

const dbClient = require('../utils/dbClient');

class PIDCoordinator {
  constructor(Kp = 0.8, Ki = 0.2, Kd = 0.1) {
    this.Kp = Kp; // Proportional gain
    this.Ki = Ki; // Integral gain
    this.Kd = Kd; // Derivative gain
    
    this.integral = 0;
    this.lastError = 0;
    this.history = [];
    
    this.autoTune = true;
    this.tuningData = [];
  }

  /**
   * Coordinate agents toward research goal
   * @param {string} goal - Research goal/query
   * @param {string} currentState - Current findings/synthesis
   * @param {Array} agents - Array of agents to coordinate
   * @returns {Promise<object>} Coordination result with error and correction
   */
  async coordinate(goal, currentState, agents = []) {
    try {
      // Generate embeddings for goal and current state
      const goalEmbedding = await this._embed(goal);
      const stateEmbedding = await this._embed(currentState);
      
      if (!goalEmbedding || !stateEmbedding) {
        console.warn('PID: Cannot compute error without embeddings');
        return { error: 0, correction: 0 };
      }
      
      // Compute error (cosine distance: 1 - similarity)
      const similarity = this._cosineSimilarity(goalEmbedding, stateEmbedding);
      const error = 1 - similarity;
      
      // PID calculation
      this.integral += error;
      const derivative = error - this.lastError;
      
      const correction = 
        this.Kp * error +
        this.Ki * this.integral +
        this.Kd * derivative;
      
      this.lastError = error;
      
      // Record for auto-tuning
      this.history.push({
        timestamp: Date.now(),
        error,
        correction,
        similarity
      });
      
      // Apply corrections to agents
      for (const agent of agents) {
        await this._adjustAgent(agent, correction, error);
      }
      
      // Auto-tune if enabled
      if (this.autoTune && this.history.length >= 10) {
        this._autoTune();
      }
      
      return {
        error,
        correction,
        similarity,
        integral: this.integral,
        derivative,
        tuned: { Kp: this.Kp, Ki: this.Ki, Kd: this.Kd }
      };
    } catch (error) {
      console.error('PID coordination error:', error);
      return { error: 0, correction: 0 };
    }
  }

  /**
   * Adjust agent behavior based on PID correction
   * @private
   */
  async _adjustAgent(agent, correction, error) {
    const adjustments = {
      // Temperature: decrease when converging, increase when diverging
      temperature: this._clamp(0.15 - correction * 0.1, 0.05, 0.3),
      
      // Depth: increase when error is high
      depth: Math.ceil(3 + correction * 2),
      
      // Focus: exploration vs. exploitation
      focus: correction > 0.5 ? 'exploration' : 'exploitation',
      
      // Confidence threshold for accepting results
      confidenceThreshold: this._clamp(0.7 - error * 0.2, 0.5, 0.9),
      
      // Parallelism: more agents when error is high
      parallelism: Math.ceil(4 + correction * 4)
    };
    
    // Apply adjustments to agent
    if (typeof agent.adjustBehavior === 'function') {
      await agent.adjustBehavior(adjustments);
    }
    
    return adjustments;
  }

  /**
   * Auto-tune PID parameters based on history
   * @private
   */
  _autoTune() {
    if (this.history.length < 10) return;
    
    // Get recent history
    const recent = this.history.slice(-20);
    
    // Calculate oscillation and settling time
    const oscillations = this._countOscillations(recent);
    const settlingTime = this._calculateSettlingTime(recent);
    
    // Adjust gains based on behavior
    if (oscillations > 5) {
      // Too much oscillation → reduce proportional and derivative
      this.Kp *= 0.9;
      this.Kd *= 0.8;
    } else if (oscillations < 2 && settlingTime > 10) {
      // Too slow → increase proportional
      this.Kp *= 1.1;
    }
    
    // Integral windup prevention
    if (Math.abs(this.integral) > 5) {
      this.integral *= 0.5;
      this.Ki *= 0.9;
    }
    
    // Clamp gains to reasonable ranges
    this.Kp = this._clamp(this.Kp, 0.1, 2.0);
    this.Ki = this._clamp(this.Ki, 0.01, 0.5);
    this.Kd = this._clamp(this.Kd, 0.01, 0.5);
    
    console.error(`[${new Date().toISOString()}] PID auto-tuned: Kp=${this.Kp.toFixed(3)}, Ki=${this.Ki.toFixed(3)}, Kd=${this.Kd.toFixed(3)}`);
  }

  /**
   * Count oscillations in error signal
   * @private
   */
  _countOscillations(history) {
    let oscillations = 0;
    let lastSign = 0;
    
    for (const entry of history) {
      const sign = Math.sign(entry.error - 0.5);
      if (sign !== 0 && sign !== lastSign && lastSign !== 0) {
        oscillations++;
      }
      lastSign = sign;
    }
    
    return oscillations;
  }

  /**
   * Calculate settling time (how long to reach <10% error)
   * @private
   */
  _calculateSettlingTime(history) {
    for (let i = 0; i < history.length; i++) {
      if (history[i].error < 0.1) {
        return i;
      }
    }
    return history.length;
  }

  /**
   * Embed text
   * @private
   */
  async _embed(text) {
    if (!text) return null;
    
    try {
      // Use first 500 chars for embedding
      const truncated = text.substring(0, 500);
      return await dbClient.generateEmbedding(truncated);
    } catch (error) {
      console.error('PID embedding error:', error);
      return null;
    }
  }

  /**
   * Calculate cosine similarity
   * @private
   */
  _cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
  }

  /**
   * Clamp value to range
   * @private
   */
  _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Reset PID state
   */
  reset() {
    this.integral = 0;
    this.lastError = 0;
    this.history = [];
  }

  /**
   * Get PID status
   */
  getStatus() {
    return {
      gains: { Kp: this.Kp, Ki: this.Ki, Kd: this.Kd },
      state: {
        integral: this.integral,
        lastError: this.lastError
      },
      history: this.history.slice(-10),
      autoTune: this.autoTune
    };
  }

  /**
   * Set PID gains manually
   */
  setGains(Kp, Ki, Kd) {
    this.Kp = this._clamp(Kp, 0.1, 2.0);
    this.Ki = this._clamp(Ki, 0.01, 0.5);
    this.Kd = this._clamp(Kd, 0.01, 0.5);
    this.autoTune = false; // Disable auto-tune when manually set
  }
}

module.exports = PIDCoordinator;




