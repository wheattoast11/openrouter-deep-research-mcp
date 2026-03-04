/**
 * Transport Layer
 *
 * Provides socket-based communication for multi-agent orchestration.
 *
 * @module core/transport
 */

'use strict';

const frameCodec = require('./frameCodec');
const socketTransport = require('./socketTransport');
const socketClient = require('./socketClient');

module.exports = {
  // Frame Codec
  encode: frameCodec.encode,
  decode: frameCodec.decode,
  createDecoder: frameCodec.createDecoder,
  validateJsonRpc: frameCodec.validateJsonRpc,
  FrameError: frameCodec.FrameError,
  HEADER_SIZE: frameCodec.HEADER_SIZE,
  MAX_MESSAGE_SIZE: frameCodec.MAX_MESSAGE_SIZE,

  // Socket Transport (Server)
  SocketTransport: socketTransport.SocketTransport,
  SocketConnection: socketTransport.SocketConnection,
  ConnectionState: socketTransport.ConnectionState,
  getSocketPath: socketTransport.getSocketPath,
  SOCKET_BASE_DIR: socketTransport.SOCKET_BASE_DIR,

  // Socket Client
  SocketClient: socketClient.SocketClient,
  ClientState: socketClient.ClientState,
  createClient: socketClient.createClient,
  connectClient: socketClient.connectClient,
  DEFAULT_RECONNECT: socketClient.DEFAULT_RECONNECT
};
