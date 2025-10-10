// src/agents/zeroAgent.js
// Zero Orchestrator - The single hub agent that coordinates planning → research → synthesis

const config = require('../../config');
const planningAgent = require('./planningAgent');
const researchAgent = require('./researchAgent');
const contextAgent = require('./contextAgent');

class ZeroAgent {
  constructor() {
    this.planner = new planningAgent.PlanningAgent();
    this.researcher = new researchAgent.ResearchAgent();
    this.synthesizer = new contextAgent.ContextAgent();

    // Zero behavior modes
    this.modes = {
      'advisor': {
        description: 'Provides strategic guidance and recommendations',
        planningStyle: 'strategic',
        researchDepth: 'moderate',
        synthesisStyle: 'concise'
      },
      'researcher': {
        description: 'Conducts deep, comprehensive research and analysis',
        planningStyle: 'analytical',
        researchDepth: 'deep',
        synthesisStyle: 'detailed'
      },
      'synthesizer': {
        description: 'Synthesizes information across multiple sources',
        planningStyle: 'integrative',
        researchDepth: 'broad',
        synthesisStyle: 'comprehensive'
      }
    };

    this.defaultMode = 'researcher';
  }

  /**
   * Main execution method for the zero orchestrator
   * @param {Object} request - The request parameters
   * @param {Object} context - Execution context (job_id, session_id, etc.)
   * @param {Function} onEvent - Callback for streaming events
   * @returns {Promise<Object>} - The final result
   */
  async execute(request, context = {}, onEvent = null) {
    const startTime = Date.now();
    const jobId = context.job_id || `job-${Date.now()}`;
    const sessionId = context.session_id || 'unknown';

    try {
      // 1. Determine mode and emit start event
      const mode = this.determineMode(request, context);
      await this.emitEvent(onEvent, 'agent.started', {
        job_id: jobId,
        mode: mode,
        query: request.query?.substring(0, 100),
        timestamp: new Date().toISOString()
      });

      // 2. Planning phase - emit tool call events
      await this.emitEvent(onEvent, 'tool.started', {
        tool: 'planning',
        job_id: jobId,
        message: `Planning ${mode} approach for query`
      });

      const plan = await this.planner.planQuery(request.query, {
        mode: mode,
        costPreference: request.costPreference,
        audienceLevel: request.audienceLevel,
        outputFormat: request.outputFormat,
        includeSources: request.includeSources,
        requestId: jobId
      });

      await this.emitEvent(onEvent, 'tool.completed', {
        tool: 'planning',
        job_id: jobId,
        duration_ms: Date.now() - startTime,
        result: { plan_summary: plan.summary?.substring(0, 200) }
      });

      // 3. Research phase (parallel execution) - emit tool call for research
      await this.emitEvent(onEvent, 'tool.started', {
        tool: 'research',
        job_id: jobId,
        message: `Conducting ${plan.queries?.length || 0} parallel research queries`
      });

      const researchResults = await this.researcher.conductParallelResearch(
        plan.queries || [{ query: request.query, id: 'main' }],
        request.costPreference || 'low',
        request.images,
        request.textDocuments,
        request.structuredData,
        request.inputEmbeddings,
        jobId,
        onEvent,
        { mode: mode, ...request }
      );

      await this.emitEvent(onEvent, 'tool.completed', {
        tool: 'research',
        job_id: jobId,
        result: { results_count: researchResults?.length || 0 }
      });

      // 4. Synthesis phase - emit tool call for synthesis
      await this.emitEvent(onEvent, 'tool.started', {
        tool: 'synthesis',
        job_id: jobId,
        message: `Synthesizing ${researchResults?.length || 0} research results`
      });

      const synthesis = await this.synthesizer.synthesizeResults(
        researchResults,
        request.query,
        {
          mode: mode,
          outputFormat: request.outputFormat,
          audienceLevel: request.audienceLevel,
          includeSources: request.includeSources,
          requestId: jobId
        }
      );

      await this.emitEvent(onEvent, 'tool.completed', {
        tool: 'synthesis',
        job_id: jobId,
        result: { synthesis_length: synthesis?.length || 0 }
      });

      // 5. Final result
      const duration = Date.now() - startTime;
      const result = {
        query: request.query,
        mode: mode,
        plan: plan,
        research: researchResults,
        synthesis: synthesis,
        metadata: {
          duration_ms: duration,
          timestamp: new Date().toISOString(),
          job_id: jobId,
          session_id: sessionId,
          reportId: context.reportId // Pass through the reportId from the context
        }
      };

      await this.emitEvent(onEvent, 'agent.completed', {
        duration_ms: duration,
        result_size: JSON.stringify(result).length
      });

      return result;

    } catch (error) {
      await this.emitEvent(onEvent, 'agent.error', {
        error: error.message,
        stack: error.stack?.substring(0, 500)
      });

      throw error;
    }
  }

  /**
   * Determine the appropriate mode for this request
   */
  determineMode(request, context) {
    // Check explicit mode in request
    if (request.mode && this.modes[request.mode]) {
      return request.mode;
    }

    // Check context hints
    if (context.mode && this.modes[context.mode]) {
      return context.mode;
    }

    // Auto-detect based on query characteristics
    const query = request.query?.toLowerCase() || '';

    if (query.includes('strategy') || query.includes('recommend') || query.includes('advice')) {
      return 'advisor';
    }

    if (query.includes('research') || query.includes('analyze') || query.includes('investigate')) {
      return 'researcher';
    }

    if (query.includes('synthesize') || query.includes('integrate') || query.includes('combine')) {
      return 'synthesizer';
    }

    return this.defaultMode;
  }

  /**
   * Helper to emit events through the callback
   */
  async emitEvent(onEvent, eventType, payload) {
    if (onEvent && typeof onEvent === 'function') {
      try {
        await onEvent(eventType, payload);
      } catch (error) {
        console.error('Error emitting event:', error);
        // Don't throw - events are non-critical
      }
    }
  }

  /**
   * Get available modes and their descriptions
   */
  getModes() {
    return Object.entries(this.modes).map(([key, config]) => ({
      mode: key,
      description: config.description,
      planningStyle: config.planningStyle,
      researchDepth: config.researchDepth,
      synthesisStyle: config.synthesisStyle
    }));
  }

  /**
   * Validate that zero can handle the given request
   */
  canHandle(request) {
    return request && request.query && typeof request.query === 'string' && request.query.trim().length > 0;
  }

  getLastMetrics() {
    return this.researcher?.telemetry || {};
  }
}

module.exports = { ZeroAgent };
