// src/utils/openRouterClient.js
const axios = require('axios');
const fetch = require('node-fetch'); // Use node-fetch v2 for CommonJS
const { createParser } = require('eventsource-parser');
const config = require('../../config');
const {
  APIError,
  ConfigurationError,
  RetryExhaustedError,
  isRetryable
} = require('./errors');
const providerTelemetry = require('./providerTelemetry');

// Retry wrapper for retryable errors
const DEFAULT_RETRY_AFTER_MS = 1500;
const KEY_COOLDOWN_BASE_MS = Number(process.env.OPENROUTER_KEY_COOLDOWN_MS) || 5000;
const FAILURE_WINDOW_MS = 60000;
const DEGRADED_THRESHOLD = 3;
const SEVERE_THRESHOLD = 6;

function normalizeRetryAfterMs(headers) {
  const raw = headers?.get?.('retry-after') || headers?.['retry-after'];
  if (!raw) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(raw);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const parsedDate = Date.parse(raw);
  if (!Number.isNaN(parsedDate)) {
    const delta = parsedDate - Date.now();
    return Math.max(delta, DEFAULT_RETRY_AFTER_MS);
  }
  return DEFAULT_RETRY_AFTER_MS;
}

function jitterDelay(baseMs, attempt) {
  const expo = baseMs * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = expo * (0.85 + Math.random() * 0.3);
  return Math.min(jitter, 30000);
}

async function withRetry(fn, maxRetries = config.openrouter?.retries || 3, delayMs = config.openrouter?.retryDelayMs || 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const retryable = isRetryable(err);
      if (attempt === maxRetries || !retryable) throw err;
      const waitMs = err?.context?.retryAfter || jitterDelay(delayMs, attempt);
      console.error(`[${new Date().toISOString()}] OpenRouterClient: Retry ${attempt}/${maxRetries} after ${Math.round(waitMs)}ms - ${err.message}`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw new RetryExhaustedError('openrouter', maxRetries, lastError);
}

function parseOpenRouterError(responseData) {
  if (!responseData) return { message: 'OpenRouter API error' };
  if (typeof responseData === 'string') {
    return { message: responseData };
  }
  if (responseData.error) {
    if (typeof responseData.error === 'string') return { message: responseData.error };
    if (responseData.error.message) {
      return { message: responseData.error.message, code: responseData.error.code };
    }
  }
  if (responseData.message) return { message: responseData.message };
  try {
    return { message: JSON.stringify(responseData).slice(0, 400) };
  } catch (_) {
    return { message: 'OpenRouter API error' };
  }
}

class OpenRouterClient {
  constructor() {
    this.apiKeys = Array.isArray(config.openrouter.apiKeys) ? config.openrouter.apiKeys : [];
    this.apiKey = config.openrouter.apiKey || this.apiKeys[0];
    if (this.apiKey && this.apiKeys.length === 0) {
      this.apiKeys = [this.apiKey];
    }
    this._keyIndex = 0;
    this._keyState = new Map();
    this._failureWindow = [];
    this._lastFailureStatus = null;
    this.baseUrl = config.openrouter.baseUrl;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.openrouter?.timeout || 180000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'http://localhost:3002',
        'X-Title': 'OpenRouter Research Agents',
        'Content-Type': 'application/json'
      }
    });
    this._batchQueue = [];
    this._batchTimer = null;
    this._batchMaxSize = Number(process.env.BATCH_MAX_SIZE) || 8;
    this._batchMaxDelayMs = Number(process.env.BATCH_MAX_DELAY_MS) || 150;
  }

  _getKeyState(key) {
    if (!key) return null;
    if (!this._keyState.has(key)) {
      this._keyState.set(key, {
        failures: 0,
        cooldownUntil: 0,
        lastFailureAt: 0,
        lastStatus: null
      });
    }
    return this._keyState.get(key);
  }

  _recordFailure(statusCode) {
    const now = Date.now();
    this._failureWindow.push(now);
    this._failureWindow = this._failureWindow.filter(ts => now - ts <= FAILURE_WINDOW_MS);
    if (statusCode) {
      this._lastFailureStatus = statusCode;
    }
  }

  _recordSuccess() {
    const now = Date.now();
    this._failureWindow = this._failureWindow.filter(ts => now - ts <= FAILURE_WINDOW_MS);
  }

  getDegradedLevel() {
    const now = Date.now();
    this._failureWindow = this._failureWindow.filter(ts => now - ts <= FAILURE_WINDOW_MS);
    const count = this._failureWindow.length;
    if (count >= SEVERE_THRESHOLD) return 'severe';
    if (count >= DEGRADED_THRESHOLD) return 'degraded';
    return 'none';
  }

  getLastFailureStatus() {
    return this._lastFailureStatus;
  }

  _getActiveApiKey() {
    if (this.apiKeys.length === 0) return this.apiKey;
    return this.apiKeys[this._keyIndex % this.apiKeys.length];
  }

  _setActiveApiKey(nextKey) {
    if (!nextKey) return;
    this.apiKey = nextKey;
    this.client.defaults.headers.Authorization = `Bearer ${nextKey}`;
  }

  _rotateApiKey(reason = 'unknown') {
    if (this.apiKeys.length <= 1) return false;
    const now = Date.now();
    const prevIndex = this._keyIndex;
    for (let i = 0; i < this.apiKeys.length; i++) {
      const nextIndex = (this._keyIndex + 1 + i) % this.apiKeys.length;
      const candidate = this.apiKeys[nextIndex];
      const state = this._getKeyState(candidate);
      if (!state || state.cooldownUntil <= now) {
        this._keyIndex = nextIndex;
        this._setActiveApiKey(candidate);
        providerTelemetry.recordKeyRotation({ provider: 'openrouter' });
        console.error(`[${new Date().toISOString()}] OpenRouterClient: Rotated API key (${reason}) index ${prevIndex} -> ${this._keyIndex}`);
        return true;
      }
    }
    this._keyIndex = (this._keyIndex + 1) % this.apiKeys.length;
    this._setActiveApiKey(this.apiKeys[this._keyIndex]);
    providerTelemetry.recordKeyRotation({ provider: 'openrouter' });
    console.error(`[${new Date().toISOString()}] OpenRouterClient: Rotated API key (${reason}) to cooled key index ${prevIndex} -> ${this._keyIndex}`);
    return true;
  }

  _selectApiKey() {
    if (this.apiKeys.length === 0) return this.apiKey;
    const now = Date.now();
    for (let i = 0; i < this.apiKeys.length; i++) {
      const idx = (this._keyIndex + i) % this.apiKeys.length;
      const candidate = this.apiKeys[idx];
      const state = this._getKeyState(candidate);
      if (!state || state.cooldownUntil <= now) {
        this._keyIndex = idx;
        this._setActiveApiKey(candidate);
        return candidate;
      }
    }
    const fallback = this.apiKeys[this._keyIndex % this.apiKeys.length];
    this._setActiveApiKey(fallback);
    return fallback;
  }

  _ensureApiKey() {
    if (!this.apiKey) {
      throw new ConfigurationError('OpenRouter API key not configured', 'OPENROUTER_API_KEY');
    }
  }

  _wrapAxiosError(error, context = {}) {
    if (error instanceof APIError) return error;
    if (error?.response) {
      const payload = parseOpenRouterError(error.response.data);
      return new APIError(payload.message || 'OpenRouter API error', error.response.status, error.response.data, {
        context: {
          ...context,
          status: error.response.status,
          code: payload.code
        }
      });
    }
    return new APIError(error.message || 'OpenRouter request failed', 0, null, { context });
  }

  _wrapFetchError(status, bodyText, context = {}, headers = null) {
    const payload = parseOpenRouterError(bodyText);
    const err = new APIError(payload.message || `OpenRouter API error (${status})`, status, bodyText, {
      context: {
        ...context,
        status
      }
    });
    if (status === 429) {
      err.context.retryAfter = normalizeRetryAfterMs(headers);
    }
    return err;
  }

  _markKeyFailure(key, statusCode, retryAfterMs) {
    if (!key) return;
    const state = this._getKeyState(key);
    if (!state) return;
    state.failures += 1;
    state.lastFailureAt = Date.now();
    state.lastStatus = statusCode || state.lastStatus;
    let cooldownMs = retryAfterMs || KEY_COOLDOWN_BASE_MS * Math.pow(2, Math.min(state.failures - 1, 4));
    if (statusCode === 403 && !retryAfterMs) {
      cooldownMs = Math.max(cooldownMs, 60000);
    }
    state.cooldownUntil = Date.now() + cooldownMs;
  }

  _markKeySuccess(key) {
    if (!key) return;
    const state = this._getKeyState(key);
    if (!state) return;
    state.failures = 0;
    state.cooldownUntil = 0;
  }

  async chatCompletion(model, messages, options = {}) {
    this._ensureApiKey();

    const minMax = Number(config.models?.minMaxTokens || 0);
    const merged = { ...options };
    if (minMax > 0) {
      merged.max_tokens = Math.max(Number(merged.max_tokens || 0), minMax);
    }

    // Strip temperature for models that don't support it (e.g., OpenAI o1/o3/o4)
    if (model.includes('openai/o1') || model.includes('openai/o3') || model.includes('openai/o4')) {
      delete merged.temperature;
      delete merged.top_p; // Often also unsupported in reasoning models
    }

    return withRetry(async () => {
      const activeKey = this._selectApiKey();
      const startTime = Date.now();
      try {
        this._setActiveApiKey(activeKey);
        const response = await this.client.post('/chat/completions', {
          model,
          messages,
          ...merged
        });
        this._markKeySuccess(activeKey);
        this._recordSuccess();
        providerTelemetry.recordRequest({
          provider: 'openrouter',
          model,
          success: true,
          latencyMs: Date.now() - startTime
        });
        return response.data;
      } catch (error) {
        const wrapped = this._wrapAxiosError(error, { model, path: '/chat/completions' });
        if (wrapped?.statusCode === 403 || wrapped?.statusCode === 429) {
          if (this._rotateApiKey(`status-${wrapped.statusCode}`)) {
            wrapped.context = { ...wrapped.context, canRotateKey: true };
            if (wrapped.statusCode === 403) {
              wrapped.isRetryable = true;
            }
          }
        }
        if (wrapped?.statusCode === 429) {
          wrapped.context.retryAfter = normalizeRetryAfterMs(error?.response?.headers);
        }
        this._markKeyFailure(activeKey, wrapped?.statusCode, wrapped?.context?.retryAfter);
        this._recordFailure(wrapped?.statusCode);
        providerTelemetry.recordRequest({
          provider: 'openrouter',
          model,
          success: false,
          latencyMs: Date.now() - startTime,
          statusCode: wrapped?.statusCode,
          errorCategory: wrapped?.category
        });
        console.error('Error calling OpenRouter API:', wrapped.responseBody || wrapped.message);
        throw wrapped;
      }
    });
  }

  // New method for streaming chat completions (robust SSE parsing)
  async *streamChatCompletion(model, messages, options = {}) {
    this._ensureApiKey();

    const url = `${this.baseUrl}/chat/completions`;
    const minMax = Number(config.models?.minMaxTokens || 0);
    const merged = { ...options };
    if (minMax > 0) {
      merged.max_tokens = Math.max(Number(merged.max_tokens || 0), minMax);
    }

    // Strip temperature for models that don't support it (e.g., OpenAI o1/o3/o4)
    if (model.includes('openai/o1') || model.includes('openai/o3') || model.includes('openai/o4')) {
      delete merged.temperature;
      delete merged.top_p;
    }

    const body = JSON.stringify({
      model,
      messages,
      stream: true,
      ...merged
    });

    console.error(`[${new Date().toISOString()}] OpenRouterClient: Starting stream request to ${model}`);
    const timeoutMs = config.openrouter?.timeout || 180000;

    try {
      const response = await withRetry(async () => {
        const activeKey = this._selectApiKey();
        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${activeKey}`,
              'HTTP-Referer': 'http://localhost:3002',
              'X-Title': 'OpenRouter Research Agents',
              'Content-Type': 'application/json'
            },
            body: body,
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            this._markKeySuccess(activeKey);
            this._recordSuccess();
            providerTelemetry.recordRequest({
              provider: 'openrouter',
              model,
              success: true,
              latencyMs: Date.now() - startTime,
              stream: true
            });
          } else if (res.status === 403 || res.status === 429) {
            this._markKeyFailure(activeKey, res.status, normalizeRetryAfterMs(res.headers));
            this._recordFailure(res.status);
            providerTelemetry.recordRequest({
              provider: 'openrouter',
              model,
              success: false,
              latencyMs: Date.now() - startTime,
              statusCode: res.status,
              errorCategory: null,
              stream: true
            });
          }
          return res;
        } catch (err) {
          clearTimeout(timeoutId);
          this._markKeyFailure(activeKey, null);
          this._recordFailure();
          providerTelemetry.recordRequest({
            provider: 'openrouter',
            model,
            success: false,
            latencyMs: Date.now() - startTime,
            stream: true
          });
          throw err;
        }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[${new Date().toISOString()}] OpenRouterClient: Stream request failed with status ${response.status}. Body: ${errorBody}`);
        let wrapped = this._wrapFetchError(response.status, errorBody, { model, path: '/chat/completions', stream: true }, response.headers);
        if (response.status === 403 || response.status === 429) {
          if (this._rotateApiKey(`status-${response.status}`)) {
            wrapped.context = { ...wrapped.context, canRotateKey: true };
            if (response.status === 403) {
              wrapped.isRetryable = true;
            }
          }
        }
        throw wrapped;
      }

      const decoder = new TextDecoder();
      let finalUsage = null;

      let isDone = false;
      const parser = createParser(event => {
        if (event.type !== 'event') return;
        const { data, event: evt } = event; // evt may be undefined for default "message" events
        if (evt && /ping|heartbeat/i.test(evt)) {
          return; // ignore heartbeats
        }
        if (!data) return;
        if (data.trim() === '[DONE]') {
          isDone = true;
          return;
        }
        try {
          const parsed = JSON.parse(data);
          // OpenAI/OpenRouter compatible delta format
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            // yield content tokens
            // Note: Generators cannot yield inside callbacks; set a queue instead
            this._enqueue?.({ content: delta.content });
          } else if (parsed.usage) {
            // capture usage if provided mid/final stream
            finalUsage = parsed.usage;
            this._enqueue?.({ usage: finalUsage });
          } else if (parsed.error) {
            this._enqueue?.({ error: parsed.error });
          }
        } catch (e) {
          // Non-JSON payloads ignored
          console.error(`[${new Date().toISOString()}] OpenRouterClient: Error parsing stream event data`, e);
        }
      });

      // Simple async queue to bridge parser callback and async generator
      const queue = [];
      let resolveWaiter;
      const waitForItem = () => new Promise(res => (resolveWaiter = res));
      const push = item => {
        queue.push(item);
        if (resolveWaiter) {
          resolveWaiter();
          resolveWaiter = null;
        }
      };
      this._enqueue = push;

      // Stream processing with proper error handling
      const streamPromise = (async () => {
        try {
          for await (const chunk of response.body) {
            const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
            parser.feed(text);
            if (isDone) break;
          }
        } catch (streamErr) {
          // Enhanced error payload with classification
          const errorPayload = {
            error: {
              message: `Stream failed: ${streamErr.message}`,
              code: streamErr.code || 'STREAM_ERROR',
              category: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH'].includes(streamErr.code) ? 'NETWORK' : 'UNKNOWN',
              isRetryable: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(streamErr.code),
              originalError: {
                name: streamErr.name,
                message: streamErr.message,
                code: streamErr.code
              }
            }
          };
          console.error(`[${new Date().toISOString()}] OpenRouterClient: Stream error:`, JSON.stringify(errorPayload));
          push(errorPayload);
        } finally {
          // emit final usage if not already emitted
          if (finalUsage) push({ usage: finalUsage });
          push({ done: true });
        }
      })();

      // Handle unhandled promise rejections from stream processing
      streamPromise.catch(err => {
        console.error(`[${new Date().toISOString()}] OpenRouterClient: Unhandled stream rejection:`, err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
      });

      // Drain queue as async generator output
      while (true) {
        if (queue.length > 0) {
          const item = queue.shift();
          if (item.done) {
            console.error(`[${new Date().toISOString()}] OpenRouterClient: Stream finished [DONE]`);
            return;
          }
          yield item;
          continue;
        }
        await waitForItem();
      }

    } catch (error) {
        const wrapped = error instanceof APIError
          ? error
          : this._wrapAxiosError(error, { model, path: '/chat/completions', stream: true });
        this._recordFailure(wrapped?.statusCode);
        providerTelemetry.recordRequest({
          provider: 'openrouter',
          model,
          success: false,
          statusCode: wrapped?.statusCode,
          errorCategory: wrapped?.category,
          stream: true
        });
        console.error(`[${new Date().toISOString()}] OpenRouterClient: Error during streaming request:`, wrapped.message);
        yield { error: { message: `Stream failed: ${wrapped.message}` } };
        throw wrapped;
    }
  }

  // Hybrid batching: size OR timeout policy
  enqueueBatch(taskFn) {
    return new Promise((resolve, reject) => {
      this._batchQueue.push({ taskFn, resolve, reject });
      if (this._batchQueue.length >= this._batchMaxSize) {
        this._flushBatch();
      } else if (!this._batchTimer) {
        this._batchTimer = setTimeout(() => this._flushBatch(), this._batchMaxDelayMs);
      }
    });
  }

  async _flushBatch() {
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = null;
    }
    const queue = this._batchQueue.splice(0, this._batchQueue.length);
    if (queue.length === 0) return;
    // Execute in parallel but bounded
    await Promise.all(queue.map(async ({ taskFn, resolve, reject }) => {
      try { const res = await taskFn(); resolve(res); } catch (e) { reject(e); }
    }));
  }

  async getModels() {
    try {
      const response = await this.client.get('/models');
      return response.data;
    } catch (error) {
      console.error('Error fetching models:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new OpenRouterClient();
