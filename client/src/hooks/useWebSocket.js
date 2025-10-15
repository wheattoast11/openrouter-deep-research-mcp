// client/src/hooks/useWebSocket.js
/**
 * WebSocket Hook for Real-Time Communication
 * Handles connection, reconnection, and message sending
 */

import { useEffect, useState, useRef, useCallback } from 'react';

export function useWebSocket(url) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        setReconnecting(false);
        reconnectAttemptsRef.current = 0;
        
        // Send initialize message
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {
              roots: { listChanged: false },
              sampling: {}
            },
            clientInfo: {
              name: 'dreamspace-ui',
              version: '1.0.0'
            }
          }
        }));
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setConnected(false);
        
        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          setReconnecting(true);
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      setSocket(ws);
    } catch (error) {
      console.error('WebSocket connection error:', error);
    }
  }, [url]);

  const send = useCallback((message) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not ready, cannot send message');
    }
  }, [socket]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (socket) {
      socket.close();
    }
  }, [socket]);

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [url]);

  return {
    socket,
    connected,
    reconnecting,
    send,
    disconnect
  };
}




