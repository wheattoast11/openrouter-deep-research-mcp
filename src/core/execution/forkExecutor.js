/**
 * Fork Executor - Sandboxed Parallel Research Execution
 *
 * Implements the fork/rejoin pattern for multi-model research:
 * 1. Delta.duplicate() - Fork query into parallel sandboxed sessions
 * 2. Parallel execution in sandboxed contexts
 * 3. StreamingConsensus - Real-time agreement calculation
 * 4. Delta.erase() / Epsilon.annihilate() - Rejoin and seal results
 *
 * @module core/execution/forkExecutor
 */

'use strict';

const crypto = require('crypto');
const { Delta, Epsilon, WorkflowCombinator } = require('../combinators');
const { TunnelRegistry, Tunnel } = require('../rail/tunnel');
const { StreamingConsensus } = require('../rail/consensus');
const logger = require('../../utils/logger').child('ForkExecutor');
const config = require('../../../config');

/**
 * Fork permissions - what a sandboxed fork can do
 */
const ForkPermissions = {
  // Read-only access
  READ: ['kb:*', 'graph:*', 'session:read'],
  // Write access (scoped to fork)
  WRITE: (forkId) => [`session:${forkId}:*`, `fork:${forkId}:*`],
  // Execution permissions
  EXECUTE: ['research', 'search', 'retrieve', 'query']
};

/**
 * Fork strategies
 */
const ForkStrategy = {
  PARALLEL: 'parallel',    // All forks run simultaneously
  SEQUENTIAL: 'sequential', // Forks run one after another
  AMB: 'amb'               // Non-deterministic choice (first success wins)
};

/**
 * Create a sandboxed fork context
 *
 * @param {string} parentSessionId - Parent session to fork from
 * @param {string} [forkId] - Optional fork ID (auto-generated if not provided)
 * @param {object} [constraints] - Additional constraints
 * @returns {Promise<object>} Fork context with permissions
 */
async function createSandboxedFork(parentSessionId, forkId = null, constraints = {}) {
  const id = forkId || `fork_${crypto.randomUUID().slice(0, 8)}`;

  // Build permissions based on constraints
  const permissions = {
    read: [...ForkPermissions.READ],
    write: [...ForkPermissions.WRITE(id)],
    execute: [...ForkPermissions.EXECUTE]
  };

  // Apply constraint overrides
  if (constraints.readOnly) {
    permissions.write = [];
    permissions.execute = permissions.execute.filter(p => !['research'].includes(p));
  }
  if (constraints.allowedTools) {
    permissions.execute = constraints.allowedTools;
  }

  logger.debug('Created sandboxed fork', {
    parentSessionId,
    forkId: id,
    permissions: {
      readCount: permissions.read.length,
      writeCount: permissions.write.length,
      executeCount: permissions.execute.length
    }
  });

  return {
    forkId: id,
    parentSessionId,
    permissions,
    constraints,
    createdAt: Date.now(),
    status: 'ready'
  };
}

/**
 * Execute research in a sandboxed fork context
 *
 * @param {object} fork - Fork context from createSandboxedFork
 * @param {object} input - Research input (query, params)
 * @param {Tunnel} [tunnel] - Optional tunnel for inter-fork communication
 * @param {function} [executor] - Research executor function
 * @returns {Promise<object>} Research result with provenance
 */
async function executeSandboxedResearch(fork, input, tunnel = null, executor = null) {
  const startTime = Date.now();

  try {
    // Default executor uses the research agent
    if (!executor) {
      const researchAgent = require('../../agents/researchAgent');
      executor = async (q, opts) => {
        return researchAgent.conductResearch(q, opts.costPreference || 'low');
      };
    }

    // Execute with fork context
    const result = await executor(input.query, {
      ...input,
      _forkContext: fork
    });

    // Send progress through tunnel if available
    if (tunnel) {
      tunnel.send({
        type: 'fork_progress',
        forkId: fork.forkId,
        status: 'completed',
        resultPreview: typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200)
      });
    }

    return {
      forkId: fork.forkId,
      success: true,
      result,
      duration: Date.now() - startTime,
      provenance: {
        parentSession: fork.parentSessionId,
        permissions: fork.permissions.execute,
        constraints: fork.constraints
      }
    };
  } catch (error) {
    logger.error('Sandboxed research failed', {
      forkId: fork.forkId,
      error: error.message
    });

    // Report failure through tunnel
    if (tunnel) {
      tunnel.send({
        type: 'fork_error',
        forkId: fork.forkId,
        error: error.message
      });
    }

    return {
      forkId: fork.forkId,
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Execute fork/rejoin pattern
 *
 * This is the main entry point for parallel research with consensus.
 *
 * @param {object} options
 * @param {string} options.query - Research query
 * @param {string} [options.sessionId='default'] - Parent session ID
 * @param {number} [options.forkCount=3] - Number of parallel forks
 * @param {string} [options.strategy='parallel'] - Fork strategy
 * @param {object} [options.context] - Additional context
 * @param {function} [options.onEvent] - Event callback
 * @returns {Promise<object>} Consensus result with all fork outputs
 */
async function executeForkRejoin(options) {
  const {
    query,
    sessionId = 'default',
    forkCount = 3,
    strategy = ForkStrategy.PARALLEL,
    context = {},
    onEvent = null
  } = options;

  const executionId = crypto.randomUUID().slice(0, 8);

  logger.info('Starting fork/rejoin execution', {
    executionId,
    query: query.slice(0, 60),
    forkCount,
    strategy
  });

  // Phase 1: Delta.duplicate - Create forked inputs
  const forks = Delta.duplicate({ query, context }, forkCount);

  // Phase 2: Create sandboxed fork contexts
  const forkContexts = await Promise.all(
    forks.map((fork, i) =>
      createSandboxedFork(sessionId, `fork_${executionId}_${i}`, {
        forkIndex: i,
        strategy
      })
    )
  );

  // Phase 3: Create tunnels for inter-fork communication
  // TTL should be generous - research forks can run for several minutes
  const tunnelTtlMs = config.core?.rail?.tunnels?.defaultTtlMs || 600000; // 10 minutes default
  const tunnelRegistry = new TunnelRegistry();
  const tunnels = forkContexts.map((forkCtx, i) => {
    // Create tunnel from each fork back to the orchestrator
    return tunnelRegistry.connect(forkCtx.forkId, `orchestrator_${executionId}`, {
      ttl: tunnelTtlMs,
      priority: i === 0 ? 10 : 5 // Primary fork has higher priority
    });
  });

  // Phase 4: Create consensus calculator
  // Timeout should be generous - research can take several minutes per model
  const consensusTimeoutMs = config.core?.rail?.consensus?.timeoutMs || 300000; // 5 minutes default
  const consensus = new StreamingConsensus({
    minAgreement: config.core?.rail?.consensus?.minAgreement || 0.6,
    timeoutMs: consensusTimeoutMs
  });
  consensus.start(executionId);

  // Emit fork start event
  if (onEvent) {
    await onEvent('fork_start', {
      executionId,
      forkCount,
      strategy,
      forkIds: forkContexts.map(f => f.forkId)
    });
  }

  // Phase 5: Execute based on strategy
  let results;

  switch (strategy) {
    case ForkStrategy.PARALLEL:
      results = await executeParallel(forkContexts, forks, tunnels, consensus, onEvent);
      break;

    case ForkStrategy.SEQUENTIAL:
      results = await executeSequential(forkContexts, forks, tunnels, consensus, onEvent);
      break;

    case ForkStrategy.AMB:
      results = await executeAmb(forkContexts, forks, tunnels, consensus, onEvent);
      break;

    default:
      results = await executeParallel(forkContexts, forks, tunnels, consensus, onEvent);
  }

  // Phase 6: Calculate final consensus
  const finalConsensus = consensus.getResult();
  consensus.stop();

  // Phase 7: Delta.erase - Select best result based on consensus
  const selected = Delta.erase(
    results.filter(r => r.success),
    (opts) => {
      // Select by highest confidence from consensus
      const consensusSources = finalConsensus.majority?.sources || [];
      const matchIdx = opts.findIndex(r =>
        consensusSources.some(s => s.includes(r.forkId))
      );
      return matchIdx >= 0 ? matchIdx : 0;
    }
  );

  // Phase 8: Epsilon.annihilate - Seal final result
  const final = Epsilon.annihilate(selected.selected, {
    executionId,
    strategy,
    forkCount,
    successCount: results.filter(r => r.success).length,
    consensus: {
      state: finalConsensus.state,
      agreement: finalConsensus.agreement,
      confidence: finalConsensus.confidence
    },
    allResults: results.map(r => ({
      forkId: r.forkId,
      success: r.success,
      duration: r.duration,
      preview: r.success && r.result
        ? (typeof r.result === 'string' ? r.result.slice(0, 100) : 'complex')
        : r.error
    }))
  });

  // Cleanup tunnels
  await tunnelRegistry.closeAll();

  // Emit completion event
  if (onEvent) {
    await onEvent('fork_complete', {
      executionId,
      success: final.result !== null,
      consensus: final.context.consensus,
      duration: final.context.allResults.reduce((sum, r) => sum + (r.duration || 0), 0)
    });
  }

  logger.info('Fork/rejoin completed', {
    executionId,
    successCount: final.context.successCount,
    agreement: final.context.consensus.agreement?.toFixed(2)
  });

  return final;
}

/**
 * Execute forks in parallel
 */
async function executeParallel(forkContexts, forks, tunnels, consensus, onEvent) {
  return Promise.all(
    forkContexts.map(async (forkCtx, i) => {
      const result = await executeSandboxedResearch(
        forkCtx,
        forks[i].value,
        tunnels[i]
      );

      // Feed result to consensus
      if (result.success) {
        consensus.addSignal({
          source: forkCtx.forkId,
          confidence: 0.8,
          payload: result.result
        });
      }

      // Emit progress
      if (onEvent) {
        await onEvent('fork_progress', {
          forkId: forkCtx.forkId,
          index: i,
          total: forkContexts.length,
          success: result.success
        });
      }

      return result;
    })
  );
}

/**
 * Execute forks sequentially
 */
async function executeSequential(forkContexts, forks, tunnels, consensus, onEvent) {
  const results = [];

  for (let i = 0; i < forkContexts.length; i++) {
    const result = await executeSandboxedResearch(
      forkContexts[i],
      forks[i].value,
      tunnels[i]
    );

    if (result.success) {
      consensus.addSignal({
        source: forkContexts[i].forkId,
        confidence: 0.8,
        payload: result.result
      });
    }

    if (onEvent) {
      await onEvent('fork_progress', {
        forkId: forkContexts[i].forkId,
        index: i,
        total: forkContexts.length,
        success: result.success
      });
    }

    results.push(result);
  }

  return results;
}

/**
 * Execute forks with AMB (first success wins)
 */
async function executeAmb(forkContexts, forks, tunnels, consensus, onEvent) {
  return new Promise(async (resolve) => {
    const results = [];
    let resolved = false;

    // Race all forks - first success wins
    const promises = forkContexts.map(async (forkCtx, i) => {
      const result = await executeSandboxedResearch(
        forkContexts[i],
        forks[i].value,
        tunnels[i]
      );

      results[i] = result;

      // First success wins in AMB mode
      if (result.success && !resolved) {
        resolved = true;

        consensus.addSignal({
          source: forkCtx.forkId,
          confidence: 1.0, // High confidence for AMB winner
          payload: result.result
        });

        if (onEvent) {
          await onEvent('fork_amb_winner', {
            forkId: forkCtx.forkId,
            index: i
          });
        }
      }

      return result;
    });

    // Wait for all to complete (for cleanup)
    await Promise.allSettled(promises);

    // Return all results (even if only first was used for consensus)
    resolve(results);
  });
}

module.exports = {
  // Core functions
  createSandboxedFork,
  executeSandboxedResearch,
  executeForkRejoin,

  // Constants
  ForkPermissions,
  ForkStrategy,

  // Execution helpers
  executeParallel,
  executeSequential,
  executeAmb
};
