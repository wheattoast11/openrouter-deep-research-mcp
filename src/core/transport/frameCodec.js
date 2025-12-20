/**
 * Frame Codec
 *
 * Length-prefixed JSON-RPC framing for reliable message transport.
 * Uses 4-byte big-endian u32 length prefix + JSON payload.
 *
 * Protocol:
 *   [4 bytes: length (big-endian u32)] [N bytes: JSON payload]
 *
 * Handles:
 * - Partial frame assembly
 * - Multiple messages in single buffer
 * - JSON parse error recovery
 *
 * @module core/transport/frameCodec
 */

'use strict';

const HEADER_SIZE = 4;
const MAX_MESSAGE_SIZE = 16 * 1024 * 1024; // 16MB max message

/**
 * Frame codec error types
 */
const FrameError = {
  OVERSIZED: 'FRAME_OVERSIZED',
  MALFORMED: 'FRAME_MALFORMED',
  PARSE_ERROR: 'JSON_PARSE_ERROR'
};

/**
 * Encode a message into a length-prefixed frame.
 *
 * @param {Object|string} message - Message to encode (object will be JSON.stringify'd)
 * @returns {Buffer} Length-prefixed frame buffer
 * @throws {Error} If message exceeds MAX_MESSAGE_SIZE
 *
 * @example
 * const frame = encode({ jsonrpc: '2.0', method: 'ping', id: 1 });
 * socket.write(frame);
 */
function encode(message) {
  const payload = typeof message === 'string'
    ? message
    : JSON.stringify(message);

  const payloadBuffer = Buffer.from(payload, 'utf8');

  if (payloadBuffer.length > MAX_MESSAGE_SIZE) {
    const err = new Error(`Message exceeds maximum size: ${payloadBuffer.length} > ${MAX_MESSAGE_SIZE}`);
    err.code = FrameError.OVERSIZED;
    throw err;
  }

  const frame = Buffer.allocUnsafe(HEADER_SIZE + payloadBuffer.length);
  frame.writeUInt32BE(payloadBuffer.length, 0);
  payloadBuffer.copy(frame, HEADER_SIZE);

  return frame;
}

/**
 * Decode messages from a buffer, handling partial frames.
 *
 * Returns all complete messages and any remaining partial buffer.
 * Caller should concatenate remainder with next incoming data.
 *
 * @param {Buffer} buffer - Input buffer (may contain partial/multiple frames)
 * @returns {{ messages: Array<Object>, remainder: Buffer }} Decoded messages and leftover bytes
 * @throws {Error} If frame header indicates oversized message
 *
 * @example
 * let buffer = Buffer.alloc(0);
 * socket.on('data', (data) => {
 *   buffer = Buffer.concat([buffer, data]);
 *   const { messages, remainder } = decode(buffer);
 *   buffer = remainder;
 *   for (const msg of messages) {
 *     handleMessage(msg);
 *   }
 * });
 */
function decode(buffer) {
  const messages = [];
  let offset = 0;

  while (offset + HEADER_SIZE <= buffer.length) {
    const payloadLength = buffer.readUInt32BE(offset);

    // Validate payload length
    if (payloadLength > MAX_MESSAGE_SIZE) {
      const err = new Error(`Frame size exceeds maximum: ${payloadLength} > ${MAX_MESSAGE_SIZE}`);
      err.code = FrameError.OVERSIZED;
      err.offset = offset;
      throw err;
    }

    // Check if we have the complete payload
    const frameEnd = offset + HEADER_SIZE + payloadLength;
    if (frameEnd > buffer.length) {
      // Partial frame - return what we have
      break;
    }

    // Extract and parse payload
    const payloadBuffer = buffer.slice(offset + HEADER_SIZE, frameEnd);
    const payloadStr = payloadBuffer.toString('utf8');

    try {
      const message = JSON.parse(payloadStr);
      messages.push(message);
    } catch (parseErr) {
      // Create a structured error but don't throw - include in result
      const err = new Error(`JSON parse error at offset ${offset}: ${parseErr.message}`);
      err.code = FrameError.PARSE_ERROR;
      err.offset = offset;
      err.raw = payloadStr.slice(0, 200); // Include truncated raw for debugging
      messages.push({ _error: err });
    }

    offset = frameEnd;
  }

  // Return remainder for next decode call
  const remainder = offset < buffer.length
    ? buffer.slice(offset)
    : Buffer.alloc(0);

  return { messages, remainder };
}

/**
 * Create a stateful frame decoder for stream processing.
 *
 * Maintains internal buffer state between data events.
 *
 * @returns {{ push: Function, flush: Function, reset: Function }}
 *
 * @example
 * const decoder = createDecoder();
 * socket.on('data', (data) => {
 *   const messages = decoder.push(data);
 *   for (const msg of messages) {
 *     handleMessage(msg);
 *   }
 * });
 */
function createDecoder() {
  let buffer = Buffer.alloc(0);

  return {
    /**
     * Push data and return decoded messages
     * @param {Buffer} data - Incoming data chunk
     * @returns {Array<Object>} Decoded messages (may be empty)
     */
    push(data) {
      buffer = Buffer.concat([buffer, data]);
      const { messages, remainder } = decode(buffer);
      buffer = remainder;
      return messages;
    },

    /**
     * Get any buffered partial frame
     * @returns {Buffer} Partial frame data (empty if none)
     */
    flush() {
      const partial = buffer;
      buffer = Buffer.alloc(0);
      return partial;
    },

    /**
     * Reset decoder state
     */
    reset() {
      buffer = Buffer.alloc(0);
    },

    /**
     * Get current buffer size
     * @returns {number} Bytes buffered
     */
    get bufferedBytes() {
      return buffer.length;
    }
  };
}

/**
 * Validate a decoded message structure for JSON-RPC 2.0.
 *
 * @param {Object} message - Decoded message object
 * @returns {{ valid: boolean, errors: Array<string> }} Validation result
 *
 * @example
 * const { valid, errors } = validateJsonRpc(message);
 * if (!valid) {
 *   console.error('Invalid message:', errors);
 * }
 */
function validateJsonRpc(message) {
  const errors = [];

  if (!message || typeof message !== 'object') {
    return { valid: false, errors: ['Message must be an object'] };
  }

  // Check for parse error marker
  if (message._error) {
    return { valid: false, errors: [message._error.message] };
  }

  // JSON-RPC 2.0 requires jsonrpc field
  if (message.jsonrpc !== '2.0') {
    errors.push('Missing or invalid jsonrpc field (must be "2.0")');
  }

  // Must have either method (request/notification) or result/error (response)
  const hasMethod = typeof message.method === 'string';
  const hasResult = 'result' in message;
  const hasError = 'error' in message;

  if (hasMethod) {
    // Request or notification
    if (message.params !== undefined && typeof message.params !== 'object') {
      errors.push('Params must be object or array if present');
    }
  } else if (hasResult || hasError) {
    // Response - must have id
    if (message.id === undefined) {
      errors.push('Response must have id field');
    }
    if (hasResult && hasError) {
      errors.push('Response cannot have both result and error');
    }
    if (hasError) {
      if (!message.error || typeof message.error !== 'object') {
        errors.push('Error must be an object');
      } else {
        if (typeof message.error.code !== 'number') {
          errors.push('Error must have numeric code');
        }
        if (typeof message.error.message !== 'string') {
          errors.push('Error must have string message');
        }
      }
    }
  } else {
    errors.push('Message must have method (request) or result/error (response)');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  encode,
  decode,
  createDecoder,
  validateJsonRpc,
  FrameError,
  HEADER_SIZE,
  MAX_MESSAGE_SIZE
};
