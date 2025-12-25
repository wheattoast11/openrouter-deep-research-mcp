/**
 * Agent Zero Temporal Replay System
 * 
 * Uses tsm_system_time for efficient temporal sampling of Agent Zero's
 * emergence state and convergence metrics.
 */
class ZeroReplay {
  constructor(dbClient) {
    this.dbClient = dbClient;
  }

  /**
   * Replay Agent Zero's emergence path for a specific research query
   * @param {string} requestId - Research request ID
   * @param {Object} options - Replay options
   * @returns {Promise<Array>} Replay steps
   */
  async replayEmergence(requestId, options = {}) {
    const { intervalMs = 1000, maxSteps = 50 } = options;
    
    // Get all events for this request
    const events = await this.dbClient.getJobEvents(requestId, 0, 1000);
    if (!events || events.length === 0) return [];

    const startTime = new Date(events[0].ts).getTime();
    const endTime = new Date(events[events.length - 1].ts).getTime();
    
    const steps = [];
    let currentTime = startTime;

    while (currentTime <= endTime && steps.length < maxSteps) {
      // Use tsm_system_time to sample state at this timestamp
      const snapshot = await this.dbClient.executeQuery(`
        SELECT * FROM tool_observations
        TABLESAMPLE tsm_system_time($1)
        WHERE request_id = $2
        ORDER BY created_at DESC
        LIMIT 5
      `, [currentTime, requestId]);

      steps.push({
        timestamp: new Date(currentTime).toISOString(),
        observations: snapshot.rows || [],
        relativeTimeMs: currentTime - startTime
      });

      currentTime += intervalMs;
    }

    return steps;
  }

  /**
   * Analyze convergence stability over time
   * @param {string} requestId
   * @returns {Promise<Object>} Convergence analysis
   */
  async analyzeConvergenceStability(requestId) {
    // Compare early vs late observations using temporal sampling
    const result = await this.dbClient.executeQuery(`
      WITH early_state AS (
        SELECT success, latency_ms FROM tool_observations
        TABLESAMPLE tsm_system_time(1000) -- Sample early (1s in)
        WHERE request_id = $1
      ),
      late_state AS (
        SELECT success, latency_ms FROM tool_observations
        TABLESAMPLE tsm_system_time(30000) -- Sample late (30s in)
        WHERE request_id = $1
      )
      SELECT 
        (SELECT AVG(latency_ms) FROM early_state) as avg_early_latency,
        (SELECT AVG(latency_ms) FROM late_state) as avg_late_latency,
        (SELECT COUNT(*) FILTER (WHERE success) FROM early_state)::float / NULLIF((SELECT COUNT(*) FROM early_state), 0) as early_success_rate,
        (SELECT COUNT(*) FILTER (WHERE success) FROM late_state)::float / NULLIF((SELECT COUNT(*) FROM late_state), 0) as late_success_rate
    `, [requestId]);

    return result.rows?.[0] || null;
  }
}

module.exports = { ZeroReplay };
