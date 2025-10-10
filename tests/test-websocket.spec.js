#!/usr/bin/env node
// tests/test-websocket.spec.js
// WebSocket transport validation for v2.0

const assert = require('assert');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'src', 'server', 'mcpServer.js');

async function testWebSocketConnection() {
  console.log('\n=== WebSocket Connection Test ===');
  
  // Start server
  const port = 38501;
  const serverProc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      SERVER_PORT: String(port),
      MODE: 'AGENT',
      ALLOW_NO_API_KEY: 'true',
      LOG_LEVEL: 'error',
      PUBLIC_URL: `http://127.0.0.1:${port}`
    },
    stdio: ['ignore', 'ignore', 'inherit']
  });

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/mcp/ws?token=test`);
    const receivedEvents = [];
    let sessionStarted = false;

    const cleanup = () => {
      ws.close();
      if (!serverProc.killed) {
        serverProc.kill('SIGTERM');
      }
    };

    ws.on('open', () => {
      console.log('✓ WebSocket connection established');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        receivedEvents.push(message);
        
        console.log('✓ Received event:', message.type);
        
        if (message.type === 'session.started') {
          sessionStarted = true;
          assert(message.payload.sessionId, 'Should have session ID');
          assert(message.payload.capabilities, 'Should have capabilities');
          console.log('✓ Session started with capabilities:', Object.keys(message.payload.capabilities));
          
          // Test sending a command
          ws.send(JSON.stringify({
            type: 'agent.steer',
            payload: { new_goal: 'Test goal' }
          }));
        }
        
        if (message.type === 'agent.steered') {
          console.log('✓ Agent steering acknowledged');
          cleanup();
          
          assert(sessionStarted, 'Session should have started');
          assert(receivedEvents.length >= 2, 'Should have received multiple events');
          
          console.log('\n✅ WebSocket tests passed\n');
          resolve();
        }
      } catch (error) {
        cleanup();
        reject(error);
      }
    });

    ws.on('error', (error) => {
      cleanup();
      reject(new Error(`WebSocket error: ${error.message}`));
    });

    ws.on('close', () => {
      if (!sessionStarted) {
        cleanup();
        reject(new Error('WebSocket closed before session started'));
      }
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      cleanup();
      if (!sessionStarted) {
        reject(new Error('Test timeout'));
      }
    }, 15000);
  });
}

(async () => {
  try {
    await testWebSocketConnection();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ WebSocket test failed:', error.message);
    process.exit(1);
  }
})();

