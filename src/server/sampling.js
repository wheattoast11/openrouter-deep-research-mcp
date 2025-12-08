// src/server/sampling.js
// MCP 2025-11-25 Sampling with Tools (SEP-1577)
// Server-side agentic loops using client sampling capabilities

const openRouterClient = require('../utils/openRouterClient');
const config = require('../../config');

class SamplingHandler {
  constructor() {
    this.enabled = config.mcp?.features?.sampling?.enabled !== false;
    this.toolsEnabled = config.mcp?.features?.sampling?.withTools !== false;
    this.defaultModel = config.models?.planning || 'google/gemini-2.5-pro';
    this.maxIterations = 10; // Safety limit for agentic loops
  }

  /**
   * Check if client supports sampling with tools
   * @param {Object} clientCapabilities - Client's declared capabilities
   * @returns {boolean}
   */
  clientSupportsSamplingTools(clientCapabilities) {
    return !!(clientCapabilities?.sampling?.tools);
  }

  /**
   * Create a message via sampling (SEP-1577)
   * @param {Object} request - MCP sampling/createMessage request
   * @param {Object} serverContext - Server context including client capabilities
   * @returns {Object} Sampling response
   */
  async createMessage(request, serverContext = {}) {
    const { messages, tools, toolChoice, maxTokens, temperature, model } = request.params || {};

    // Validate tools are supported if requested
    if (tools && tools.length > 0) {
      if (!this.toolsEnabled) {
        throw new Error('Sampling with tools is disabled on this server');
      }
      if (serverContext.clientCapabilities && !this.clientSupportsSamplingTools(serverContext.clientCapabilities)) {
        throw new Error('Client does not support sampling with tools');
      }
    }

    // Build OpenRouter request
    const orRequest = {
      model: model || this.defaultModel,
      messages: this.convertMessages(messages),
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens || 4000
    };

    // Add tools if present
    if (tools && tools.length > 0) {
      orRequest.tools = tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema || {}
        }
      }));

      if (toolChoice) {
        orRequest.tool_choice = this.convertToolChoice(toolChoice);
      }
    }

    process.stderr.write(`[${new Date().toISOString()}] Sampling: Creating message with model ${orRequest.model}, tools: ${tools?.length || 0}\n`);

    // Make the API call
    const response = await openRouterClient.chatCompletion(
      orRequest.model,
      orRequest.messages,
      {
        tools: orRequest.tools,
        tool_choice: orRequest.tool_choice,
        temperature: orRequest.temperature,
        max_tokens: orRequest.max_tokens
      }
    );

    return this.convertResponse(response);
  }

  /**
   * Execute an agentic loop using sampling with tools
   * Server-side agent reasoning capability
   *
   * @param {Object} initialRequest - Initial sampling request
   * @param {Function} toolExecutor - Function to execute tools: async (name, args) => result
   * @param {Object} options - Loop options
   * @returns {Object} Final result after loop completion
   */
  async executeAgenticLoop(initialRequest, toolExecutor, options = {}) {
    const maxIterations = options.maxIterations || this.maxIterations;
    const stopOnError = options.stopOnError !== false;

    let messages = [...(initialRequest.params?.messages || [])];
    const tools = initialRequest.params?.tools || [];
    const model = initialRequest.params?.model || this.defaultModel;

    const executionLog = [];
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      process.stderr.write(`[${new Date().toISOString()}] Sampling: Agentic loop iteration ${iteration}/${maxIterations}\n`);

      // Create message request
      const response = await this.createMessage({
        params: {
          messages,
          tools,
          model,
          toolChoice: { mode: 'auto' }
        }
      });

      executionLog.push({
        iteration,
        type: 'assistant_response',
        content: response.content,
        stopReason: response.stopReason
      });

      // Check if we should stop
      if (response.stopReason === 'endTurn' || response.stopReason === 'stop') {
        process.stderr.write(`[${new Date().toISOString()}] Sampling: Loop completed with stop reason: ${response.stopReason}\n`);
        return {
          result: response,
          iterations: iteration,
          log: executionLog
        };
      }

      // Handle tool calls
      if (response.stopReason === 'toolUse') {
        const toolUses = this.extractToolUses(response.content);

        if (toolUses.length === 0) {
          process.stderr.write(`[${new Date().toISOString()}] Sampling: Tool use indicated but no tools found\n`);
          return {
            result: response,
            iterations: iteration,
            log: executionLog
          };
        }

        // Add assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: response.content
        });

        // Execute tools in parallel
        const toolResults = await Promise.all(
          toolUses.map(async (toolUse) => {
            try {
              process.stderr.write(`[${new Date().toISOString()}] Sampling: Executing tool ${toolUse.name}\n`);
              const result = await toolExecutor(toolUse.name, toolUse.input);
              executionLog.push({
                iteration,
                type: 'tool_execution',
                tool: toolUse.name,
                input: toolUse.input,
                result,
                success: true
              });
              return {
                type: 'tool_result',
                toolUseId: toolUse.id,
                content: typeof result === 'string' ? result : JSON.stringify(result),
                isError: false
              };
            } catch (error) {
              executionLog.push({
                iteration,
                type: 'tool_execution',
                tool: toolUse.name,
                input: toolUse.input,
                error: error.message,
                success: false
              });

              if (stopOnError) {
                throw error;
              }

              return {
                type: 'tool_result',
                toolUseId: toolUse.id,
                content: `Error: ${error.message}`,
                isError: true
              };
            }
          })
        );

        // Add tool results to messages
        messages.push({
          role: 'user',
          content: toolResults
        });
      }
    }

    process.stderr.write(`[${new Date().toISOString()}] Sampling: Max iterations reached (${maxIterations})\n`);
    return {
      result: null,
      iterations: iteration,
      maxIterationsReached: true,
      log: executionLog
    };
  }

  /**
   * Convert MCP messages to OpenRouter format
   * @param {Array} messages - MCP format messages
   * @returns {Array} OpenRouter format messages
   */
  convertMessages(messages) {
    if (!messages || !Array.isArray(messages)) return [];

    return messages.map(msg => {
      // Handle content arrays
      if (Array.isArray(msg.content)) {
        const convertedContent = msg.content.map(c => {
          if (c.type === 'tool_result') {
            return {
              type: 'tool_result',
              tool_use_id: c.toolUseId,
              content: typeof c.content === 'string' ? c.content : JSON.stringify(c.content)
            };
          }
          if (c.type === 'tool_use') {
            return {
              type: 'tool_use',
              id: c.id,
              name: c.name,
              input: c.input
            };
          }
          return c;
        });

        return {
          role: msg.role,
          content: convertedContent
        };
      }

      // Simple text content
      return {
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : msg.content?.text || ''
      };
    });
  }

  /**
   * Convert MCP tool choice to OpenRouter format
   * @param {Object} toolChoice - MCP tool choice
   * @returns {string|Object} OpenRouter tool choice
   */
  convertToolChoice(toolChoice) {
    if (!toolChoice) return 'auto';

    const mode = toolChoice.mode || 'auto';
    switch (mode) {
      case 'none':
        return 'none';
      case 'required':
        return 'required';
      case 'auto':
      default:
        return 'auto';
    }
  }

  /**
   * Convert OpenRouter response to MCP format
   * @param {Object} response - OpenRouter response
   * @returns {Object} MCP sampling response
   */
  convertResponse(response) {
    if (!response || !response.choices || !response.choices[0]) {
      throw new Error('Invalid response from model');
    }

    const choice = response.choices[0];
    const message = choice.message;
    const content = [];

    // Add text content
    if (message.content) {
      content.push({
        type: 'text',
        text: message.content
      });
    }

    // Add tool calls
    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        // Safely parse arguments with try-catch
        let input = {};
        if (tc.function?.arguments) {
          try {
            input = JSON.parse(tc.function.arguments);
          } catch (e) {
            // If JSON is invalid, store raw string in a wrapper
            input = { _raw: tc.function.arguments };
          }
        }
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function?.name,
          input
        });
      }
    }

    // MCP spec requires content to always be an array of content blocks
    return {
      role: 'assistant',
      content: content,
      model: response.model,
      stopReason: this.mapStopReason(choice.finish_reason),
      usage: response.usage ? {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens
      } : undefined
    };
  }

  /**
   * Map OpenRouter finish reason to MCP stop reason
   * @param {string} finishReason - OpenRouter finish reason
   * @returns {string} MCP stop reason
   */
  mapStopReason(finishReason) {
    const mapping = {
      'stop': 'endTurn',
      'end_turn': 'endTurn',
      'tool_calls': 'toolUse',
      'tool_use': 'toolUse',
      'length': 'maxTokens',
      'max_tokens': 'maxTokens',
      'content_filter': 'contentFiltered'
    };
    return mapping[finishReason] || finishReason || 'endTurn';
  }

  /**
   * Extract tool use blocks from response content
   * @param {Object|Array} content - Response content
   * @returns {Array} Tool use objects
   */
  extractToolUses(content) {
    if (!content) return [];

    const contentArray = Array.isArray(content) ? content : [content];
    return contentArray.filter(c => c.type === 'tool_use');
  }
}

module.exports = new SamplingHandler();
