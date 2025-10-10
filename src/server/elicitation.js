const { v4: uuidv4 } = require('uuid');

class ElicitationManager {
  constructor() {
    this.pending = new Map();
  }

  /**
   * Request input from the user and wait for a response.
   * @param {object} transport - The transport object to send notifications.
   * @param {object} request - The elicitation request details.
   * @param {string} request.prompt - The message to show the user.
   * @param {object} [request.schema] - Optional JSON schema for the expected data.
   * @returns {Promise<any>} A promise that resolves with the user's data.
   */
  request(transport, { prompt, schema }) {
    const elicitationId = uuidv4();
    
    let promiseResolver;
    const promise = new Promise((resolve) => {
      promiseResolver = resolve;
    });

    this.pending.set(elicitationId, { resolve: promiseResolver });

    transport.sendEvent('elicitation/request', {
      elicitationId,
      prompt,
      schema
    });

    return promise;
  }

  /**
   * Resolve a pending elicitation request with data from the user.
   * @param {string} elicitationId - The ID of the elicitation to resolve.
   * @param {any} data - The data provided by the user.
   * @returns {boolean} True if resolved, false if not found.
   */
  resolve(elicitationId, data) {
    const pendingRequest = this.pending.get(elicitationId);
    if (pendingRequest) {
      pendingRequest.resolve(data);
      this.pending.delete(elicitationId);
      return true;
    }
    return false;
  }
}

// Export a singleton instance
module.exports = new ElicitationManager();
