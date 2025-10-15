// src/utils/responseValidator.js
/**
 * Response Validation Middleware
 * Ensures all tool responses match the expected schema for consistency
 */

const { z } = require('zod');

// Standard response schema for all tools
const standardResponseSchema = z.object({
  success: z.boolean().describe('Whether the operation succeeded'),
  data: z.any().describe('The actual response data'),
  metadata: z.object({
    timestamp: z.string().optional(),
    requestId: z.string().optional(),
    durationMs: z.number().optional(),
  }).optional().describe('Optional metadata about the operation')
});

/**
 * Validates a tool response against the standard schema
 * @param {any} response - The response to validate
 * @param {string} toolName - Name of the tool for error reporting
 * @returns {object} - Validated and normalized response
 */
function validateResponse(response, toolName = 'unknown') {
  try {
    // If response is already a string, assume it's legacy format
    if (typeof response === 'string') {
      try {
        const parsed = JSON.parse(response);
        return normalizeToStandard(parsed, toolName);
      } catch {
        // Not JSON, wrap as text
        return {
          success: true,
          data: response,
          metadata: { timestamp: new Date().toISOString() }
        };
      }
    }

    // If response is already in standard format, validate it
    if (response && typeof response === 'object' && 'success' in response) {
      const result = standardResponseSchema.safeParse(response);
      if (result.success) {
        return result.data;
      }
      console.warn(`[${new Date().toISOString()}] Response validation warning for ${toolName}:`, result.error);
    }

    // Otherwise, normalize to standard format
    return normalizeToStandard(response, toolName);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Response validation error for ${toolName}:`, error);
    return {
      success: false,
      data: null,
      metadata: {
        timestamp: new Date().toISOString(),
        error: error.message
      }
    };
  }
}

/**
 * Normalizes various response formats to standard schema
 * @param {any} response - Raw response
 * @param {string} toolName - Tool name
 * @returns {object} - Standardized response
 */
function normalizeToStandard(response, toolName) {
  const timestamp = new Date().toISOString();

  // Handle null/undefined
  if (response === null || response === undefined) {
    return {
      success: true,
      data: null,
      metadata: { timestamp }
    };
  }

  // Handle error objects
  if (response instanceof Error) {
    return {
      success: false,
      data: null,
      metadata: {
        timestamp,
        error: response.message,
        stack: response.stack
      }
    };
  }

  // Handle job submission responses
  if (response.job_id) {
    return {
      success: true,
      data: {
        jobId: response.job_id,
        status: response.status || 'queued',
        resources: response.resources || []
      },
      metadata: { timestamp }
    };
  }

  // Handle job status responses
  if (response.jobId && response.status) {
    return {
      success: true,
      data: response,
      metadata: { timestamp }
    };
  }

  // Default: wrap as successful data response
  return {
    success: true,
    data: response,
    metadata: { timestamp }
  };
}

/**
 * Wraps a tool handler with response validation
 * @param {Function} handler - Original tool handler
 * @param {string} toolName - Name of the tool
 * @returns {Function} - Wrapped handler
 */
function wrapWithValidation(handler, toolName) {
  return async function validatedHandler(params, mcpExchange, requestId) {
    const startTime = Date.now();
    try {
      const response = await handler(params, mcpExchange, requestId);
      const validated = validateResponse(response, toolName);
      
      // Add duration to metadata
      if (validated.metadata) {
        validated.metadata.durationMs = Date.now() - startTime;
        validated.metadata.requestId = requestId;
      }
      
      return validated;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [${requestId}] ${toolName} error:`, error);
      return {
        success: false,
        data: null,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId,
          durationMs: Date.now() - startTime,
          error: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      };
    }
  };
}

/**
 * Creates a success response
 * @param {any} data - Response data
 * @param {object} metadata - Optional metadata
 * @returns {object} - Standard success response
 */
function success(data, metadata = {}) {
  return {
    success: true,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata
    }
  };
}

/**
 * Creates an error response
 * @param {string|Error} error - Error message or object
 * @param {object} metadata - Optional metadata
 * @returns {object} - Standard error response
 */
function error(error, metadata = {}) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    data: null,
    metadata: {
      timestamp: new Date().toISOString(),
      error: message,
      ...metadata
    }
  };
}

module.exports = {
  validateResponse,
  wrapWithValidation,
  success,
  error,
  standardResponseSchema
};




