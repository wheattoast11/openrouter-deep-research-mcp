/**
 * Phase-Lock State Machine
 *
 * Implements a 4-phase handshake protocol for secure agent connection.
 * Based on challenge-response pattern with nonce verification.
 *
 * Protocol Flow:
 *   1. HELLO     → Orchestrator sends identity + capabilities
 *   2. CHALLENGE → Agent responds with challenge nonce
 *   3. RESPONSE  → Orchestrator signs challenge with proof
 *   4. ACCEPT    → Agent confirms, connection locked
 *
 * States:
 *   INITIAL → HANDSHAKE → PENDING → VERIFIED → LOCKED
 *                                      ↓
 *                                   FAILED
 *
 * @module core/bridge/phaseLock
 */

'use strict';

const crypto = require('crypto');

/**
 * Phase-lock connection states
 */
const PhaseLockState = {
  INITIAL: 'initial',
  HANDSHAKE: 'handshake',
  PENDING: 'pending',
  VERIFIED: 'verified',
  LOCKED: 'locked',
  FAILED: 'failed'
};

/**
 * Phase-lock message types
 */
const PhaseLockMessage = {
  HELLO: 'phase.hello',
  CHALLENGE: 'phase.challenge',
  RESPONSE: 'phase.response',
  ACCEPT: 'phase.accept',
  REJECT: 'phase.reject'
};

/**
 * Default timeout for handshake phases (5 seconds)
 */
const DEFAULT_TIMEOUT = 5000;

/**
 * Generate a cryptographically secure nonce
 * @param {number} [bytes=16] - Number of random bytes
 * @returns {string} Hex-encoded nonce
 */
function generateNonce(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Create a challenge response using HMAC
 * @param {string} nonce - Challenge nonce
 * @param {string} secret - Shared secret or agent ID
 * @returns {string} HMAC response
 */
function createChallengeResponse(nonce, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(nonce)
    .digest('hex');
}

/**
 * Verify a challenge response
 * @param {string} nonce - Original nonce
 * @param {string} secret - Shared secret or agent ID
 * @param {string} response - Claimed response
 * @returns {boolean} True if response is valid
 */
function verifyChallengeResponse(nonce, secret, response) {
  const expected = createChallengeResponse(nonce, secret);
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(response, 'hex')
  );
}

/**
 * Phase-Lock State Machine
 *
 * Manages the state and transitions for a single agent connection.
 */
class PhaseLockStateMachine {
  /**
   * Create a new phase-lock state machine
   *
   * @param {Object} options - Configuration options
   * @param {string} options.agentId - ID of the connecting agent
   * @param {string} options.orchestratorId - ID of the orchestrator
   * @param {string} [options.secret] - Shared secret for auth (defaults to orchestratorId)
   * @param {number} [options.timeout] - Timeout per phase in ms
   * @param {Function} [options.onStateChange] - Callback on state transitions
   */
  constructor(options) {
    this.agentId = options.agentId;
    this.orchestratorId = options.orchestratorId;
    this.secret = options.secret || options.orchestratorId;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.onStateChange = options.onStateChange || (() => {});

    this.state = PhaseLockState.INITIAL;
    this.nonce = null;
    this.remoteNonce = null;
    this.capabilities = null;
    this.remoteCapabilities = null;
    this.error = null;
    this.timeoutHandle = null;
    this.startTime = Date.now();
    this.lockedAt = null;
  }

  /**
   * Transition to a new state
   * @param {string} newState - Target state
   * @param {Object} [meta] - Additional metadata
   * @private
   */
  _transition(newState, meta = {}) {
    const oldState = this.state;
    this.state = newState;
    this.onStateChange({
      from: oldState,
      to: newState,
      agentId: this.agentId,
      timestamp: Date.now(),
      ...meta
    });
  }

  /**
   * Set a timeout for the current phase
   * @param {string} phase - Phase name for error message
   * @private
   */
  _setTimeout(phase) {
    this._clearTimeout();
    this.timeoutHandle = setTimeout(() => {
      this.error = `Timeout during ${phase} phase`;
      this._transition(PhaseLockState.FAILED, { reason: this.error });
    }, this.timeout);
  }

  /**
   * Clear any active timeout
   * @private
   */
  _clearTimeout() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  /**
   * Start the handshake (orchestrator side).
   * Generates HELLO message to send to agent.
   *
   * @param {Object} [capabilities] - Orchestrator capabilities to advertise
   * @returns {{ type: string, payload: Object }} HELLO message
   * @throws {Error} If not in INITIAL state
   */
  initiateHandshake(capabilities = {}) {
    if (this.state !== PhaseLockState.INITIAL) {
      throw new Error(`Cannot initiate handshake from state: ${this.state}`);
    }

    this.capabilities = capabilities;
    this.nonce = generateNonce();
    this._transition(PhaseLockState.HANDSHAKE);
    this._setTimeout('handshake');

    return {
      type: PhaseLockMessage.HELLO,
      payload: {
        orchestratorId: this.orchestratorId,
        nonce: this.nonce,
        capabilities: this.capabilities,
        timestamp: Date.now()
      }
    };
  }

  /**
   * Handle incoming HELLO (agent side).
   * Generates CHALLENGE response.
   *
   * @param {Object} hello - HELLO message payload
   * @returns {{ type: string, payload: Object }} CHALLENGE message
   * @throws {Error} If not in INITIAL state or invalid HELLO
   */
  handleHello(hello) {
    if (this.state !== PhaseLockState.INITIAL) {
      throw new Error(`Cannot handle HELLO from state: ${this.state}`);
    }

    if (!hello.orchestratorId || !hello.nonce) {
      throw new Error('Invalid HELLO: missing required fields');
    }

    this.remoteNonce = hello.nonce;
    this.remoteCapabilities = hello.capabilities || {};
    this.nonce = generateNonce();
    this._transition(PhaseLockState.PENDING);
    this._setTimeout('challenge');

    return {
      type: PhaseLockMessage.CHALLENGE,
      payload: {
        agentId: this.agentId,
        nonce: this.nonce,
        response: createChallengeResponse(this.remoteNonce, this.secret),
        capabilities: this.capabilities || {},
        timestamp: Date.now()
      }
    };
  }

  /**
   * Handle incoming CHALLENGE (orchestrator side).
   * Verifies agent's response and generates RESPONSE.
   *
   * @param {Object} challenge - CHALLENGE message payload
   * @returns {{ type: string, payload: Object }} RESPONSE or REJECT message
   */
  handleChallenge(challenge) {
    if (this.state !== PhaseLockState.HANDSHAKE) {
      throw new Error(`Cannot handle CHALLENGE from state: ${this.state}`);
    }

    this._clearTimeout();

    if (!challenge.agentId || !challenge.nonce || !challenge.response) {
      this.error = 'Invalid CHALLENGE: missing required fields';
      this._transition(PhaseLockState.FAILED, { reason: this.error });
      return {
        type: PhaseLockMessage.REJECT,
        payload: { reason: this.error }
      };
    }

    // Verify agent's response to our nonce
    if (!verifyChallengeResponse(this.nonce, this.secret, challenge.response)) {
      this.error = 'Challenge response verification failed';
      this._transition(PhaseLockState.FAILED, { reason: this.error });
      return {
        type: PhaseLockMessage.REJECT,
        payload: { reason: this.error }
      };
    }

    this.remoteNonce = challenge.nonce;
    this.remoteCapabilities = challenge.capabilities || {};
    this._transition(PhaseLockState.VERIFIED);
    this._setTimeout('response');

    return {
      type: PhaseLockMessage.RESPONSE,
      payload: {
        response: createChallengeResponse(this.remoteNonce, this.secret),
        timestamp: Date.now()
      }
    };
  }

  /**
   * Handle incoming RESPONSE (agent side).
   * Verifies orchestrator's response and sends ACCEPT.
   *
   * @param {Object} response - RESPONSE message payload
   * @returns {{ type: string, payload: Object }} ACCEPT or REJECT message
   */
  handleResponse(response) {
    if (this.state !== PhaseLockState.PENDING) {
      throw new Error(`Cannot handle RESPONSE from state: ${this.state}`);
    }

    this._clearTimeout();

    if (!response.response) {
      this.error = 'Invalid RESPONSE: missing response field';
      this._transition(PhaseLockState.FAILED, { reason: this.error });
      return {
        type: PhaseLockMessage.REJECT,
        payload: { reason: this.error }
      };
    }

    // Verify orchestrator's response to our nonce
    if (!verifyChallengeResponse(this.nonce, this.secret, response.response)) {
      this.error = 'Response verification failed';
      this._transition(PhaseLockState.FAILED, { reason: this.error });
      return {
        type: PhaseLockMessage.REJECT,
        payload: { reason: this.error }
      };
    }

    this.lockedAt = Date.now();
    this._transition(PhaseLockState.LOCKED);

    return {
      type: PhaseLockMessage.ACCEPT,
      payload: {
        agentId: this.agentId,
        timestamp: this.lockedAt
      }
    };
  }

  /**
   * Handle incoming ACCEPT (orchestrator side).
   * Completes the handshake.
   *
   * @param {Object} accept - ACCEPT message payload
   * @returns {boolean} True if lock successful
   */
  handleAccept(accept) {
    if (this.state !== PhaseLockState.VERIFIED) {
      throw new Error(`Cannot handle ACCEPT from state: ${this.state}`);
    }

    this._clearTimeout();
    this.lockedAt = Date.now();
    this._transition(PhaseLockState.LOCKED);

    return true;
  }

  /**
   * Handle incoming REJECT (either side).
   * Transitions to FAILED state.
   *
   * @param {Object} reject - REJECT message payload
   */
  handleReject(reject) {
    this._clearTimeout();
    this.error = reject.reason || 'Rejected by remote';
    this._transition(PhaseLockState.FAILED, { reason: this.error });
  }

  /**
   * Process an incoming phase-lock message.
   *
   * @param {Object} message - Message with type and payload
   * @returns {{ type: string, payload: Object }|null} Response message or null
   */
  process(message) {
    const { type, payload } = message;

    switch (type) {
      case PhaseLockMessage.HELLO:
        return this.handleHello(payload);
      case PhaseLockMessage.CHALLENGE:
        return this.handleChallenge(payload);
      case PhaseLockMessage.RESPONSE:
        return this.handleResponse(payload);
      case PhaseLockMessage.ACCEPT:
        this.handleAccept(payload);
        return null;
      case PhaseLockMessage.REJECT:
        this.handleReject(payload);
        return null;
      default:
        throw new Error(`Unknown phase-lock message type: ${type}`);
    }
  }

  /**
   * Check if connection is locked (handshake complete)
   * @returns {boolean}
   */
  get isLocked() {
    return this.state === PhaseLockState.LOCKED;
  }

  /**
   * Check if connection failed
   * @returns {boolean}
   */
  get isFailed() {
    return this.state === PhaseLockState.FAILED;
  }

  /**
   * Get elapsed time since handshake started
   * @returns {number} Milliseconds
   */
  get elapsed() {
    return Date.now() - this.startTime;
  }

  /**
   * Get connection info summary
   * @returns {Object}
   */
  getInfo() {
    return {
      agentId: this.agentId,
      orchestratorId: this.orchestratorId,
      state: this.state,
      isLocked: this.isLocked,
      isFailed: this.isFailed,
      error: this.error,
      capabilities: this.capabilities,
      remoteCapabilities: this.remoteCapabilities,
      elapsed: this.elapsed,
      lockedAt: this.lockedAt
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this._clearTimeout();
  }
}

/**
 * Create a phase-lock state machine for orchestrator role.
 *
 * @param {string} agentId - Target agent ID
 * @param {Object} [options] - Additional options
 * @returns {PhaseLockStateMachine}
 */
function createOrchestratorPhaseLock(agentId, options = {}) {
  return new PhaseLockStateMachine({
    agentId,
    orchestratorId: options.orchestratorId || `zero-${process.pid}`,
    secret: options.secret,
    timeout: options.timeout,
    onStateChange: options.onStateChange
  });
}

/**
 * Create a phase-lock state machine for agent role.
 *
 * @param {string} agentId - This agent's ID
 * @param {Object} [options] - Additional options
 * @returns {PhaseLockStateMachine}
 */
function createAgentPhaseLock(agentId, options = {}) {
  return new PhaseLockStateMachine({
    agentId,
    orchestratorId: options.orchestratorId || 'unknown',
    secret: options.secret,
    timeout: options.timeout,
    onStateChange: options.onStateChange
  });
}

module.exports = {
  PhaseLockState,
  PhaseLockMessage,
  PhaseLockStateMachine,
  createOrchestratorPhaseLock,
  createAgentPhaseLock,
  generateNonce,
  createChallengeResponse,
  verifyChallengeResponse,
  DEFAULT_TIMEOUT
};
