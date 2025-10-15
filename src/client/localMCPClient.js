/**
 * Local MCP Client - Minimalist MCP client for browser/local environments
 * 
 * Supports two modes:
 * 1. Server-Connected: WebSocket connection to MCP server
 * 2. Fully-Local: Run agents locally with browser inference
 * 
 * @module client/localMCPClient
 */

const EventEmitter = require('events');

/**
 * Local MCP Client
 * 
 * Lightweight MCP client that can connect to server or run fully locally
 */
class LocalMCPClient extends EventEmitter {
  constructor(mode = 'server-connected', options = {}) {
    super();
    
    this.mode = mode; // 'server-connected' | 'fully-local'
    this.options = options;
    this.connected = false;
    this.transport = null;
    this.jobs = new Map(); // jobId -> job metadata
    this.subscriptions = new Map(); // resourceUri -> callback
    this.requestId = 0;
    this.verbose = options.verbose !== false;
    
    // For fully-local mode
    this.localAgent = null;
    this.localInference = null;
  }

  /**
   * Connect to MCP server or initialize local mode
   * 
   * @param {string|Object} transport - WebSocket URL or transport object
   * @returns {Promise<void>}
   */
  async connect(transport) {
    if (this.connected) {
      this.log('Already connected');
      return;
    }

    if (this.mode === 'server-connected') {
      await this._connectToServer(transport);
    } else if (this.mode === 'fully-local') {
      await this._initializeLocal();
    }

    this.connected = true;
    this.emit('connected');
    this.log(`Connected in ${this.mode} mode`);
  }

  /**
   * Connect to MCP server via WebSocket
   * @private
   */
  async _connectToServer(transport) {
    if (typeof transport === 'string') {
      // WebSocket URL
      this.transport = this._createWebSocketTransport(transport);
    } else {
      // Custom transport (e.g., STDIO)
      this.transport = transport;
    }

    await this.transport.connect();
    
    // Set up message handlers
    this.transport.on('message', (message) => this._handleMessage(message));
    this.transport.on('error', (error) => this.emit('error', error));
    this.transport.on('close', () => {
      this.connected = false;
      this.emit('disconnected');
    });
  }

  /**
   * Initialize fully-local mode
   * @private
   */
  async _initializeLocal() {
    const { getInstance: getInferenceEngine } = require('../inference/browserInference');
    const { ZeroAgent } = require('../agents/localZeroAgent');
    
    // Initialize browser inference
    this.localInference = getInferenceEngine(this.options.inference || {});
    await this.localInference.initialize();
    
    // Initialize local agent
    this.localAgent = new ZeroAgent({
      inferenceEngine: this.localInference,
      ...this.options.agent
    });
    
    this.log('Local mode initialized with browser inference');
  }

  /**
   * Submit a job (async operation)
   * 
   * @param {string} operation - Operation name (e.g., 'agent', 'research')
   * @param {Object} params - Operation parameters
   * @returns {Promise<Object>} Job result with job_id
   */
  async submitJob(operation, params) {
    if (!this.connected) {
      throw new Error('Not connected. Call connect() first.');
    }

    if (this.mode === 'server-connected') {
      return await this._submitJobToServer(operation, params);
    } else {
      return await this._submitJobLocal(operation, params);
    }
  }

  /**
   * Submit job to MCP server
   * @private
   */
  async _submitJobToServer(operation, params) {
    const requestId = `req-${this.requestId++}`;
    
    const message = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: operation,
        arguments: { ...params, async: true }
      }
    };

    const response = await this._sendRequest(message);
    
    if (response.error) {
      throw new Error(response.error.message);
    }

    const jobId = response.result.job_id;
    
    this.jobs.set(jobId, {
      jobId,
      operation,
      params,
      status: 'queued',
      events: []
    });

    return { job_id: jobId, status: 'queued' };
  }

  /**
   * Submit job for local execution
   * @private
   */
  async _submitJobLocal(operation, params) {
    const jobId = `local-job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    this.jobs.set(jobId, {
      jobId,
      operation,
      params,
      status: 'running',
      events: []
    });

    // Execute locally in background
    setImmediate(async () => {
      try {
        await this._executeLocalJob(jobId, operation, params);
      } catch (error) {
        this._appendJobEvent(jobId, {
          type: 'error',
          message: error.message
        });
        this._updateJobStatus(jobId, 'failed');
      }
    });

    return { job_id: jobId, status: 'queued' };
  }

  /**
   * Execute job locally
   * @private
   */
  async _executeLocalJob(jobId, operation, params) {
    this._updateJobStatus(jobId, 'running');
    
    const onEvent = (type, payload) => {
      this._appendJobEvent(jobId, { type, ...payload });
    };

    let result;
    
    if (operation === 'agent' || operation === 'research') {
      result = await this.localAgent.execute(params, { job_id: jobId }, onEvent);
    } else {
      throw new Error(`Unsupported local operation: ${operation}`);
    }

    this._updateJobStatus(jobId, 'succeeded', result);
    
    this._appendJobEvent(jobId, {
      type: 'completed',
      result: result
    });
  }

  /**
   * Monitor job events (streaming)
   * 
   * @param {string} jobId - Job ID
   * @yields {Object} Job events as they arrive
   */
  async* monitorJob(jobId) {
    const job = this.jobs.get(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    let lastEventIndex = 0;

    while (true) {
      // Yield new events
      if (job.events.length > lastEventIndex) {
        for (let i = lastEventIndex; i < job.events.length; i++) {
          yield job.events[i];
        }
        lastEventIndex = job.events.length;
      }

      // Check if job is complete
      if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
        break;
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Get job status
   * 
   * @param {string} jobId - Job ID
   * @param {string} format - Format ('summary' | 'events' | 'full')
   * @returns {Promise<Object>} Job status
   */
  async getJobStatus(jobId, format = 'summary') {
    if (this.mode === 'server-connected') {
      return await this._getJobStatusFromServer(jobId, format);
    } else {
      return this._getJobStatusLocal(jobId, format);
    }
  }

  /**
   * Get job status from server
   * @private
   */
  async _getJobStatusFromServer(jobId, format) {
    const requestId = `req-${this.requestId++}`;
    
    const message = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: 'job_status',
        arguments: { job_id: jobId, format }
      }
    };

    const response = await this._sendRequest(message);
    
    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result;
  }

  /**
   * Get job status from local storage
   * @private
   */
  _getJobStatusLocal(jobId, format) {
    const job = this.jobs.get(jobId);
    
    if (!job) {
      return { error: 'Job not found' };
    }

    if (format === 'summary') {
      return {
        job_id: jobId,
        status: job.status,
        operation: job.operation,
        event_count: job.events.length
      };
    } else if (format === 'events') {
      return {
        job_id: jobId,
        status: job.status,
        events: job.events
      };
    } else {
      return job;
    }
  }

  /**
   * Call a tool directly (synchronous)
   * 
   * @param {string} name - Tool name
   * @param {Object} args - Tool arguments
   * @returns {Promise<Object>} Tool result
   */
  async callTool(name, args) {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    if (this.mode === 'server-connected') {
      return await this._callToolOnServer(name, args);
    } else {
      throw new Error('Synchronous tool calls not supported in fully-local mode');
    }
  }

  /**
   * Call tool on server
   * @private
   */
  async _callToolOnServer(name, args) {
    const requestId = `req-${this.requestId++}`;
    
    const message = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    };

    const response = await this._sendRequest(message);
    
    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result;
  }

  /**
   * List available tools
   * 
   * @returns {Promise<Array>} Array of tool definitions
   */
  async listTools() {
    if (this.mode === 'server-connected') {
      const requestId = `req-${this.requestId++}`;
      
      const message = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/list'
      };

      const response = await this._sendRequest(message);
      return response.result?.tools || [];
    } else {
      return this._getLocalTools();
    }
  }

  /**
   * Get local tools
   * @private
   */
  _getLocalTools() {
    return [
      {
        name: 'agent',
        description: 'Execute agent research task locally',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            costPreference: { type: 'string', enum: ['low', 'medium', 'high'] }
          },
          required: ['query']
        }
      }
    ];
  }

  /**
   * Subscribe to resource updates
   * 
   * @param {string} uri - Resource URI
   * @param {Function} callback - Callback for updates
   */
  subscribeToResource(uri, callback) {
    this.subscriptions.set(uri, callback);
    
    if (this.mode === 'server-connected') {
      // Send subscription request to server
      const message = {
        jsonrpc: '2.0',
        method: 'resources/subscribe',
        params: { uri }
      };
      
      this.transport.send(message);
    }
  }

  /**
   * Unsubscribe from resource
   * 
   * @param {string} uri - Resource URI
   */
  unsubscribeFromResource(uri) {
    this.subscriptions.delete(uri);
    
    if (this.mode === 'server-connected') {
      const message = {
        jsonrpc: '2.0',
        method: 'resources/unsubscribe',
        params: { uri }
      };
      
      this.transport.send(message);
    }
  }

  /**
   * Disconnect from server
   */
  async disconnect() {
    if (!this.connected) return;

    if (this.transport) {
      await this.transport.close();
    }

    this.connected = false;
    this.emit('disconnected');
    this.log('Disconnected');
  }

  /**
   * Create WebSocket transport
   * @private
   */
  _createWebSocketTransport(url) {
    const WebSocket = typeof window !== 'undefined' ? window.WebSocket : require('ws');
    
    const ws = new WebSocket(url);
    const emitter = new EventEmitter();
    
    ws.onopen = () => emitter.emit('open');
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      emitter.emit('message', message);
    };
    ws.onerror = (error) => emitter.emit('error', error);
    ws.onclose = () => emitter.emit('close');
    
    return {
      connect: () => new Promise((resolve, reject) => {
        emitter.once('open', resolve);
        emitter.once('error', reject);
      }),
      send: (message) => ws.send(JSON.stringify(message)),
      close: () => ws.close(),
      on: (event, handler) => emitter.on(event, handler)
    };
  }

  /**
   * Send request and wait for response
   * @private
   */
  async _sendRequest(message) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 30000);

      const handler = (response) => {
        if (response.id === message.id) {
          clearTimeout(timeout);
          this.transport.removeListener('message', handler);
          resolve(response);
        }
      };

      this.transport.on('message', handler);
      this.transport.send(message);
    });
  }

  /**
   * Handle incoming message
   * @private
   */
  _handleMessage(message) {
    // Handle notifications
    if (!message.id && message.method) {
      this._handleNotification(message);
    }
  }

  /**
   * Handle notification
   * @private
   */
  _handleNotification(notification) {
    if (notification.method === 'notifications/resources/updated') {
      const { uri } = notification.params;
      const callback = this.subscriptions.get(uri);
      if (callback) {
        callback(notification.params);
      }
    }
  }

  /**
   * Update job status locally
   * @private
   */
  _updateJobStatus(jobId, status, result = null) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      if (result) {
        job.result = result;
      }
      this.emit('job:status', { jobId, status, result });
    }
  }

  /**
   * Append job event locally
   * @private
   */
  _appendJobEvent(jobId, event) {
    const job = this.jobs.get(jobId);
    if (job) {
      event.timestamp = new Date().toISOString();
      job.events.push(event);
      this.emit('job:event', { jobId, event });
    }
  }

  /**
   * Log message (if verbose)
   * @private
   */
  log(message) {
    if (this.verbose) {
      console.log(`[LocalMCPClient] ${message}`);
    }
  }
}

module.exports = {
  LocalMCPClient
};


