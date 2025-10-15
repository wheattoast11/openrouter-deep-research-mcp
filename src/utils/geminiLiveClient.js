// src/utils/geminiLiveClient.js
/**
 * Gemini Live API Client - Real-Time Multimodal Communication
 * 
 * Features:
 * - Native audio streaming (voice input/output)
 * - Real-time function calling
 * - Screen sharing + visual understanding
 * - Low-latency responses (<500ms)
 * 
 * Based on Gemini 2.0 Flash with native audio support
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const config = require('../../config');

class GeminiLiveClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.apiKey = options.apiKey || process.env.GOOGLE_API_KEY;
    this.model = options.model || 'models/gemini-2.0-flash-exp';
    this.ws = null;
    this.connected = false;
    this.sessionId = null;
  }

  /**
   * Connect to Gemini Live API
   * @param {object} config - Configuration
   * @returns {Promise<void>}
   */
  async connect(config = {}) {
    if (this.connected) {
      console.warn('Already connected to Gemini Live API');
      return;
    }
    
    try {
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
      
      this.ws = new WebSocket(url);
      
      this.ws.on('open', async () => {
        console.error(`[${new Date().toISOString()}] Connected to Gemini Live API`);
        this.connected = true;
        
        // Send setup message
        await this._sendSetup(config);
        
        this.emit('connected');
      });
      
      this.ws.on('message', (data) => {
        this._handleMessage(data);
      });
      
      this.ws.on('close', () => {
        console.error(`[${new Date().toISOString()}] Disconnected from Gemini Live API`);
        this.connected = false;
        this.emit('disconnected');
      });
      
      this.ws.on('error', (error) => {
        console.error('Gemini Live API error:', error);
        this.emit('error', error);
      });
      
    } catch (error) {
      console.error('Connection error:', error);
      throw error;
    }
  }

  /**
   * Send audio data
   * @param {Buffer} audioBuffer - PCM audio data
   */
  async sendAudio(audioBuffer) {
    if (!this.connected) {
      throw new Error('Not connected to Gemini Live API');
    }
    
    const base64Audio = audioBuffer.toString('base64');
    
    this._send({
      realtimeInput: {
        mediaChunks: [{
          mimeType: 'audio/pcm',
          data: base64Audio
        }]
      }
    });
  }

  /**
   * Send text
   * @param {string} text - Text message
   */
  async sendText(text) {
    if (!this.connected) {
      throw new Error('Not connected to Gemini Live API');
    }
    
    this._send({
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{
            text
          }]
        }],
        turnComplete: true
      }
    });
  }

  /**
   * Send function response
   * @param {string} callId - Function call ID
   * @param {object} response - Function response
   */
  async sendFunctionResponse(callId, response) {
    this._send({
      toolResponse: {
        functionResponses: [{
          id: callId,
          response: {
            output: response
          }
        }]
      }
    });
  }

  /**
   * Speak text (using text-to-speech)
   * @param {string} text - Text to speak
   */
  async speak(text) {
    // Gemini Live API will handle TTS
    await this.sendText(text);
  }

  /**
   * Disconnect
   */
  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Send setup message
   * @private
   */
  async _sendSetup(config) {
    const setupMessage = {
      setup: {
        model: this.model,
        generationConfig: {
          responseModalities: ['AUDIO', 'TEXT'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: config.voice || 'Puck'
              }
            }
          }
        }
      }
    };
    
    // Add tools/functions if provided
    if (config.functions && config.functions.length > 0) {
      setupMessage.setup.tools = [{
        functionDeclarations: config.functions.map(fn => ({
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters || {}
        }))
      }];
    }
    
    this._send(setupMessage);
  }

  /**
   * Send message to API
   * @private
   */
  _send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Handle incoming message
   * @private
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      // Setup complete
      if (message.setupComplete) {
        this.sessionId = message.setupComplete.sessionId;
        this.emit('setup_complete', message.setupComplete);
      }
      
      // Server content (responses)
      if (message.serverContent) {
        const content = message.serverContent;
        
        // Handle different turn parts
        if (content.modelTurn) {
          for (const part of content.modelTurn.parts || []) {
            // Text response
            if (part.text) {
              this.emit('text', part.text);
            }
            
            // Audio response
            if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
              const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
              this.emit('audio', audioBuffer);
            }
            
            // Function call
            if (part.executableCode || part.codeExecutionResult) {
              this.emit('function_call', part);
            }
          }
        }
        
        // Turn complete
        if (content.turnComplete) {
          this.emit('turn_complete');
        }
      }
      
      // Tool call
      if (message.toolCall) {
        this.emit('function_call', message.toolCall);
      }
      
      // Tool call cancellation
      if (message.toolCallCancellation) {
        this.emit('function_cancelled', message.toolCallCancellation);
      }
      
    } catch (error) {
      console.error('Message handling error:', error);
      this.emit('error', error);
    }
  }
}

module.exports = GeminiLiveClient;




