// src/utils/openRouterClient.js
const axios = require('axios');
const fetch = require('node-fetch'); // Use node-fetch v2 for CommonJS
const { createParser } = require('eventsource-parser');
const config = require('../../config');

class OpenRouterClient {
  constructor() {
    this.apiKey = config.openrouter.apiKey;
    this.baseUrl = config.openrouter.baseUrl;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
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

  async chatCompletion(model, messages, options = {}) {
    try {
      const response = await this.client.post('/chat/completions', {
        model,
        messages,
        ...options
      });
      
      return response.data;
    } catch (error) {
      console.error('Error calling OpenRouter API:', error.response?.data || error.message);
      throw error;
    }
  }

  // New method for streaming chat completions (robust SSE parsing)
  async *streamChatCompletion(model, messages, options = {}) {
    const url = `${this.baseUrl}/chat/completions`;
    const body = JSON.stringify({
      model,
      messages,
      stream: true,
      ...options
    });

    console.error(`[${new Date().toISOString()}] OpenRouterClient: Starting stream request to ${model}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'http://localhost:3002',
          'X-Title': 'OpenRouter Research Agents',
          'Content-Type': 'application/json'
        },
        body: body
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[${new Date().toISOString()}] OpenRouterClient: Stream request failed with status ${response.status}. Body: ${errorBody}`);
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorBody}`);
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

      (async () => {
        try {
          for await (const chunk of response.body) {
            const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
            parser.feed(text);
            if (isDone) break;
          }
        } catch (streamErr) {
          push({ error: { message: `Stream failed: ${streamErr.message}` } });
        } finally {
          // emit final usage if not already emitted
          if (finalUsage) push({ usage: finalUsage });
          push({ done: true });
        }
      })();

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
      console.error(`[${new Date().toISOString()}] OpenRouterClient: Error during streaming request:`, error);
      yield { error: { message: `Stream failed: ${error.message}` } };
      throw error;
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
