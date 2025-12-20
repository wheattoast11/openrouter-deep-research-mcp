/**
 * Zero Endpoint Handler
 *
 * MCP handler for Agent Zero - the emergent superintelligent research ensemble.
 * Provides the interface between MCP tools and the ZeroAgent orchestrator.
 */

const { ZeroAgent, createZeroAgent } = require('../../agents/zeroAgent');
const { SemanticRouter, createRouter } = require('../../core/router');
const { Signal, SignalType } = require('../../core/signal');

// Singleton instances
let zeroAgent = null;
let semanticRouter = null;

/**
 * Initialize Zero handler
 */
function initializeZero(config = {}) {
  zeroAgent = createZeroAgent({
    planningModel: config.planningModel || process.env.PLANNING_MODEL || 'anthropic/claude-sonnet-4',
    synthesisModel: config.synthesisModel || process.env.SYNTHESIS_MODEL || 'anthropic/claude-sonnet-4',
    maxThreads: config.maxThreads || 4,
    ...config
  });

  semanticRouter = createRouter({
    costPreference: config.costPreference || 'low',
    ...config
  });

  return { zeroAgent, semanticRouter };
}

/**
 * Get or create Zero agent instance
 */
function getZeroAgent() {
  if (!zeroAgent) {
    initializeZero();
  }
  return zeroAgent;
}

/**
 * Get or create router instance
 */
function getRouter() {
  if (!semanticRouter) {
    initializeZero();
  }
  return semanticRouter;
}

/**
 * Handle Zero research request
 *
 * MCP Tool: zero_research
 */
async function handleZeroResearch(params, context) {
  const { query, costPreference = 'low', maxThreads } = params;
  const agent = getZeroAgent();
  const router = getRouter();

  // Route query to determine models
  const route = await router.route({
    query,
    costPreference,
    maxModels: maxThreads || 4
  });

  // Execute via Zero agent
  const result = await agent.execute({
    query,
    context: {
      route,
      costPreference,
      requestId: context.requestId
    },
    executeModel: context.executeModel || createDefaultExecutor(context)
  });

  return {
    content: [{
      type: 'text',
      text: formatZeroResponse(result)
    }],
    metadata: {
      route,
      emergence: result.emergence,
      provenance: result.provenance
    }
  };
}

/**
 * Handle Zero structured generation
 *
 * MCP Tool: zero_generate
 */
async function handleZeroGenerate(params, context) {
  const { template, bindings = {} } = params;
  const agent = getZeroAgent();

  // Convert binding values to signals where needed
  const signalBindings = {};
  for (const [key, value] of Object.entries(bindings)) {
    if (typeof value === 'object' && value.type && value.payload) {
      signalBindings[key] = Signal.fromJSON(value);
    } else {
      signalBindings[key] = value;
    }
  }

  const result = await agent.executeStructured(template, signalBindings);

  if (result.error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${result.error}`
      }],
      isError: true
    };
  }

  return {
    content: [{
      type: 'text',
      text: result.result
    }],
    metadata: {
      confidence: result.confidence,
      template: result.template,
      bindings: result.bindings
    }
  };
}

/**
 * Handle Zero emergence state query
 *
 * MCP Tool: zero_emergence
 */
async function handleZeroEmergence(params, context) {
  const agent = getZeroAgent();
  const state = agent.getEmergenceState();

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(state, null, 2)
    }],
    metadata: state
  };
}

/**
 * Handle Zero route query
 *
 * MCP Tool: zero_route
 */
async function handleZeroRoute(params, context) {
  const { query, costPreference = 'low', maxModels = 1 } = params;
  const router = getRouter();

  const route = await router.route({
    query,
    costPreference,
    maxModels
  });

  return {
    content: [{
      type: 'text',
      text: formatRouteResponse(route)
    }],
    metadata: route
  };
}

/**
 * Handle Zero consensus calculation
 *
 * MCP Tool: zero_consensus
 */
async function handleZeroConsensus(params, context) {
  const { signals } = params;
  const agent = getZeroAgent();

  // Parse signals
  const parsedSignals = signals.map(s => {
    if (s instanceof Signal) return s;
    if (s.type && s.payload) return Signal.fromJSON(s);
    return Signal.response(s.content || s, s.source || 'unknown', s.confidence || 0.8);
  });

  const consensus = agent.calculateConsensus(parsedSignals);

  return {
    content: [{
      type: 'text',
      text: formatConsensusResponse(consensus)
    }],
    metadata: consensus
  };
}

/**
 * Handle Zero signal reduce
 *
 * MCP Tool: zero_reduce
 */
async function handleZeroReduce(params, context) {
  const { signals } = params;

  // Parse signals
  const parsedSignals = signals.map(s => {
    if (s instanceof Signal) return s;
    if (s.type && s.payload) return Signal.fromJSON(s);
    return Signal.response(s.content || s, s.source || 'unknown', s.confidence || 0.8);
  });

  const reduced = Signal.reduce(parsedSignals);

  return {
    content: [{
      type: 'text',
      text: formatReduceResponse(reduced)
    }],
    metadata: reduced.toJSON()
  };
}

/**
 * Route handler dispatcher
 */
async function handleZero(toolName, params, context) {
  const handlers = {
    'zero_research': handleZeroResearch,
    'zero_generate': handleZeroGenerate,
    'zero_emergence': handleZeroEmergence,
    'zero_route': handleZeroRoute,
    'zero_consensus': handleZeroConsensus,
    'zero_reduce': handleZeroReduce
  };

  const handler = handlers[toolName];
  if (!handler) {
    return {
      content: [{ type: 'text', text: `Unknown Zero tool: ${toolName}` }],
      isError: true
    };
  }

  return handler(params, context);
}

// ============================================
// Formatters
// ============================================

function formatZeroResponse(result) {
  const lines = [];

  lines.push('## Agent Zero Research Result\n');

  // Main result
  if (typeof result.result === 'string') {
    lines.push(result.result);
  } else if (result.result?.result) {
    lines.push(result.result.result);
  } else {
    lines.push(JSON.stringify(result.result, null, 2));
  }

  lines.push('\n---\n');

  // Emergence metadata
  if (result.emergence) {
    lines.push('### Emergence State');
    lines.push(`- **Context Depth**: ${result.emergence.contextDepth}`);
    lines.push(`- **Resonance**: ${(result.emergence.persona?.resonance || 0).toFixed(3)}`);
    lines.push(`- **Crystallized**: ${result.emergence.crystallization > 0.5 ? 'Yes' : 'No'}`);

    if (result.emergence.patterns && Object.keys(result.emergence.patterns).length > 0) {
      lines.push('\n**Detected Patterns**:');
      for (const [pattern, data] of Object.entries(result.emergence.patterns)) {
        if (data?.present) {
          lines.push(`- ${pattern}: ${data.count} occurrence(s)`);
        }
      }
    }
  }

  // Provenance
  if (result.provenance) {
    lines.push('\n### Provenance');
    lines.push(`- **Sources**: ${result.provenance.sourceCount}`);
    lines.push(`- **Method**: ${result.provenance.synthesisMethod}`);
    if (result.provenance.sources?.length > 0) {
      lines.push(`- **Path**: ${result.provenance.sources.join(' → ')}`);
    }
  }

  lines.push(`\n**Confidence**: ${(result.confidence * 100).toFixed(1)}%`);

  return lines.join('\n');
}

function formatRouteResponse(route) {
  const lines = [];

  lines.push('## Routing Decision\n');
  lines.push(`**Query Classification**: ${route.classification.type} (${(route.classification.confidence * 100).toFixed(1)}% confidence)`);
  lines.push(`**Cost Preference**: ${route.costPreference}`);
  lines.push(`**Routing Method**: ${route.routingMethod}`);

  lines.push('\n### Selected Models');
  for (const model of route.models) {
    lines.push(`- **${model.model}** (score: ${model.score.toFixed(3)}, tier: ${model.costTier})`);
  }

  return lines.join('\n');
}

function formatConsensusResponse(consensus) {
  const lines = [];

  lines.push('## Consensus Result\n');
  lines.push(`**Method**: ${consensus.method}`);
  lines.push(`**Confidence**: ${(consensus.confidence * 100).toFixed(1)}%`);
  lines.push(`**Signal Count**: ${consensus.signalCount || 1}`);

  if (consensus.topSource) {
    lines.push(`**Top Source**: ${consensus.topSource}`);
  }

  lines.push('\n### Consensus Value');
  if (typeof consensus.consensus === 'string') {
    lines.push(consensus.consensus);
  } else {
    lines.push('```json');
    lines.push(JSON.stringify(consensus.consensus, null, 2));
    lines.push('```');
  }

  return lines.join('\n');
}

function formatReduceResponse(reduced) {
  const lines = [];

  lines.push('## Signal Reduction Result\n');
  lines.push(`**Type**: ${reduced.type}`);
  lines.push(`**Confidence**: ${(reduced.confidence * 100).toFixed(1)}%`);
  lines.push(`**Source**: ${reduced.source}`);

  if (reduced.payload.crystallization !== undefined) {
    lines.push(`**Crystallization**: ${(reduced.payload.crystallization * 100).toFixed(1)}%`);
  }

  lines.push('\n### Reduced Content');
  if (typeof reduced.payload === 'string') {
    lines.push(reduced.payload);
  } else if (reduced.payload.result) {
    if (typeof reduced.payload.result === 'string') {
      lines.push(reduced.payload.result);
    } else {
      lines.push('```json');
      lines.push(JSON.stringify(reduced.payload.result, null, 2));
      lines.push('```');
    }
  }

  if (reduced.payload.reductionPath) {
    lines.push('\n**Reduction Path**:');
    lines.push(reduced.payload.reductionPath.join(' → '));
  }

  return lines.join('\n');
}

// ============================================
// Default executor (fallback when no context.executeModel)
// ============================================

function createDefaultExecutor(context) {
  return async (params) => {
    // This would integrate with OpenRouter API
    // For now, return a placeholder
    console.warn('[ZeroHandler] No executeModel provided, using placeholder');
    return {
      content: `[Placeholder response for model ${params.model}]`,
      confidence: 0.5
    };
  };
}

module.exports = {
  handleZero,
  handleZeroResearch,
  handleZeroGenerate,
  handleZeroEmergence,
  handleZeroRoute,
  handleZeroConsensus,
  handleZeroReduce,
  initializeZero,
  getZeroAgent,
  getRouter
};
