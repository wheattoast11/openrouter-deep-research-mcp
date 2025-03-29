// src/utils/openRouterClient.js
const axios = require('axios');
const fetch = require('node-fetch'); // Use node-fetch v2 for CommonJS
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

  // New method for streaming chat completions
  async *streamChatCompletion(model, messages, options = {}) {
    const url = `${this.baseUrl}/chat/completions`;
    const body = JSON.stringify({
      model,
      messages,
      stream: true, // Enable streaming
      ...options
    });

    console.error(`[${new Date().toISOString()}] OpenRouterClient: Starting stream request to ${model}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'http://localhost:3002', // Adjust as needed
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

      const reader = response.body;
      const decoder = new TextDecoder();
      let buffer = '';

      for await (const chunk of reader) {
        buffer += decoder.decode(chunk, { stream: true });
        let boundary = buffer.indexOf('\n\n');

        while (boundary !== -1) {
          const message = buffer.substring(0, boundary);
          buffer = buffer.substring(boundary + 2);

          if (message.startsWith('data: ')) {
            const data = message.substring(6);
            if (data.trim() === '[DONE]') {
              console.error(`[${new Date().toISOString()}] OpenRouterClient: Stream finished [DONE]`);
              yield { done: true }; // Signal stream completion
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                yield { content: parsed.choices[0].delta.content };
              } else if (parsed.error) {
                 console.error(`[${new Date().toISOString()}] OpenRouterClient: Error in stream data:`, parsed.error);
                 yield { error: parsed.error };
              }
            } catch (e) {
              console.error(`[${new Date().toISOString()}] OpenRouterClient: Error parsing stream chunk: ${data}`, e);
              // Ignore malformed JSON chunks
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
      // Process any remaining buffer content if needed, though [DONE] should handle termination
      if (buffer.trim().length > 0 && buffer.trim().startsWith('data: ')) {
         const data = buffer.trim().substring(6);
         if (data.trim() !== '[DONE]') {
            try {
               const parsed = JSON.parse(data);
               if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                 yield { content: parsed.choices[0].delta.content };
               }
            } catch(e) {
               console.error(`[${new Date().toISOString()}] OpenRouterClient: Error parsing final stream chunk: ${data}`, e);
            }
         }
      }
       console.error(`[${new Date().toISOString()}] OpenRouterClient: Stream ended naturally.`);
       yield { done: true }; // Ensure done signal if stream ends without [DONE]

    } catch (error) {
      console.error(`[${new Date().toISOString()}] OpenRouterClient: Error during streaming request:`, error);
      yield { error: { message: `Stream failed: ${error.message}` } }; // Yield an error object
      throw error; // Re-throw for higher-level handling if necessary
    }
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
