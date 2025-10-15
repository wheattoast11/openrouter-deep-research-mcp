import { trace } from './ContextGateway';

/**
 * Standard Operating Procedure (SOP) Gates
 * Deterministic, event-driven constitution for agent behavior
 * 
 * Flow: OBSERVE → ABSTRACT → DECIDE → ACT → VERIFY
 * Each gate is idempotent and emits structured events
 */

export const Gates = Object.freeze({
  OBSERVE: 'observe',
  ABSTRACT: 'abstract',
  DECIDE: 'decide',
  ACT: 'act',
  VERIFY: 'verify',
});

export const Roles = Object.freeze({
  PLANNER: 'planner',
  SYNTHESIZER: 'synthesizer',
  OBSERVER: 'observer',
  VERIFIER: 'verifier',
  EXECUTOR: 'executor'
});

// Gate state tracking for idempotency
const gateHistory = new Map(); // sessionId -> [gates]
let currentSession = null;

/**
 * Initialize a new SOP session
 * @param {string} sessionId - Unique session identifier
 */
export function initSession(sessionId) {
  currentSession = sessionId;
  gateHistory.set(sessionId, []);
  trace({ 
    type: 'sop:session:init', 
    sessionId, 
    timestamp: Date.now() 
  });
}

/**
 * Enter a gate with context (idempotent within session)
 * @param {string} gate - Gate name from Gates enum
 * @param {object} context - Contextual data for the gate
 * @param {string} role - Role executing the gate (optional)
 */
export function enterGate(gate, context = {}, role = null) {
  const session = currentSession || 'default';
  const history = gateHistory.get(session) || [];
  
  // Check if gate already entered in this session
  const alreadyEntered = history.some(h => h.gate === gate && h.role === role);
  
  const event = {
    type: 'sop:gate:entered',
    gate,
    role,
    context,
    sessionId: session,
    timestamp: Date.now(),
    idempotent: alreadyEntered
  };
  
  trace(event);
  
  if (!alreadyEntered) {
    history.push({ gate, role, timestamp: Date.now(), context });
    gateHistory.set(session, history);
  }
  
  return event;
}

/**
 * Exit a gate with result
 * @param {string} gate - Gate name
 * @param {object} result - Result data
 */
export function exitGate(gate, result = {}) {
  const session = currentSession || 'default';
  trace({
    type: 'sop:gate:exited',
    gate,
    result,
    sessionId: session,
    timestamp: Date.now()
  });
}

/**
 * Verify result against policy
 * @param {any} result - Result to verify
 * @param {object} policy - Verification policy
 * @returns {boolean} True if verification passed
 */
export function verify(result, policy = {}) {
  const passed = !policy?.fails?.(result);
  const event = {
    type: passed ? 'verify:passed' : 'verify:failed',
    result: typeof result === 'string' ? result.substring(0, 100) : result,
    policy: policy.name || 'unnamed',
    timestamp: Date.now()
  };
  
  trace(event);
  
  if (!passed && policy.onFail) {
    policy.onFail(result);
  }
  
  return passed;
}

/**
 * Get gate history for current session
 * @returns {Array} Gate history
 */
export function getGateHistory() {
  const session = currentSession || 'default';
  return gateHistory.get(session) || [];
}

/**
 * Clear session history
 */
export function clearSession() {
  if (currentSession) {
    gateHistory.delete(currentSession);
    trace({ type: 'sop:session:cleared', sessionId: currentSession });
    currentSession = null;
  }
}

/**
 * Policy definitions with enforcement rules
 */
export const Policies = {
  redaction: {
    name: 'redaction',
    apply: (text) => {
      if (typeof text !== 'string') return text;
      return text
        .replace(/(sk-[a-z0-9]+)/gi, 'sk-xxx')
        .replace(/(api[_-]?key[:\s=]+)([^\s]+)/gi, '$1***')
        .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '***@***.***');
    },
    fails: (text) => {
      if (typeof text !== 'string') return false;
      // Fail if sensitive patterns detected after redaction
      const redacted = Policies.redaction.apply(text);
      return /sk-[a-z0-9]{20,}/i.test(redacted);
    }
  },
  
  rateLimit: {
    name: 'rateLimit',
    maxPerMinute: 60,
    window: new Map(), // timestamp -> count
    apply: () => {
      const now = Date.now();
      const minute = Math.floor(now / 60000);
      const count = Policies.rateLimit.window.get(minute) || 0;
      Policies.rateLimit.window.set(minute, count + 1);
      
      // Cleanup old windows
      for (const [key] of Policies.rateLimit.window) {
        if (key < minute - 1) {
          Policies.rateLimit.window.delete(key);
        }
      }
      
      return count < Policies.rateLimit.maxPerMinute;
    },
    fails: () => {
      const now = Date.now();
      const minute = Math.floor(now / 60000);
      const count = Policies.rateLimit.window.get(minute) || 0;
      return count >= Policies.rateLimit.maxPerMinute;
    }
  },
  
  toolScope: {
    name: 'toolScope',
    allowedTools: ['model.catalog', 'model.set', 'stack.configure', 'benchmark.run'],
    apply: (toolName) => {
      return Policies.toolScope.allowedTools.includes(toolName);
    },
    fails: (toolName) => {
      return !Policies.toolScope.allowedTools.includes(toolName);
    },
    onFail: (toolName) => {
      trace({ 
        type: 'policy:violation', 
        policy: 'toolScope', 
        tool: toolName,
        allowed: Policies.toolScope.allowedTools
      });
    }
  },
  
  maxTokens: {
    name: 'maxTokens',
    limit: 4096,
    apply: (text) => {
      if (typeof text !== 'string') return text;
      // Rough token estimation: ~4 chars per token
      const estimatedTokens = Math.ceil(text.length / 4);
      if (estimatedTokens > Policies.maxTokens.limit) {
        return text.substring(0, Policies.maxTokens.limit * 4);
      }
      return text;
    },
    fails: (text) => {
      if (typeof text !== 'string') return false;
      const estimatedTokens = Math.ceil(text.length / 4);
      return estimatedTokens > Policies.maxTokens.limit;
    }
  }
};

/**
 * Event taxonomy for structured logging
 */
export const EventTypes = Object.freeze({
  // Session lifecycle
  SESSION_INIT: 'sop:session:init',
  SESSION_CLEARED: 'sop:session:cleared',
  
  // Gate transitions
  GATE_ENTERED: 'sop:gate:entered',
  GATE_EXITED: 'sop:gate:exited',
  
  // Verification
  VERIFY_PASSED: 'verify:passed',
  VERIFY_FAILED: 'verify:failed',
  
  // Policy enforcement
  POLICY_APPLIED: 'policy:applied',
  POLICY_VIOLATION: 'policy:violation',
  
  // Tool invocation
  TOOL_INVOKED: 'tool:invoked',
  TOOL_COMPLETED: 'tool:completed',
  TOOL_FAILED: 'tool:failed',
  
  // Trace emission
  TRACE_EMIT: 'trace:emit'
});
