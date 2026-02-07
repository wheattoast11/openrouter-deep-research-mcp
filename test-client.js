const { spawn } = require('child_process');
const path = require('path');

const serverPath = path.join(__dirname, 'src/server/mcpServer.js');
console.log(`Starting server: ${serverPath}`);

const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'] // pipe stdin/stdout, inherit stderr for logs
});

let buffer = '';

server.stdout.on('data', (data) => {
  const chunk = data.toString();
  buffer += chunk;
  
  if (buffer.includes('\n')) {
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep last incomplete line

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        // console.log('Received:', JSON.stringify(msg, null, 2));
        
        // Step 2: Handle Initialize Response
        if (msg.id === 1 && msg.result) {
          console.log('✅ Initialize successful.');
          send({ jsonrpc: '2.0', method: 'notifications/initialized' });
          
          console.log('Sending tools/list request...');
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        }
        
        // Step 3: Handle Tools List
        if (msg.id === 2 && msg.result) {
          console.log(`✅ Tools list received. Count: ${msg.result.tools.length}`);
          const researchTool = msg.result.tools.find(t => t.name === 'research');
          if (researchTool) {
              console.log('✅ Research tool found.');
          } else {
              console.error('❌ Research tool MISSING!');
              process.exit(1);
          }
          console.log('🎉 End-to-end test PASSED.');
          server.kill();
          process.exit(0);
        }
      } catch (e) {
        // Ignore non-JSON lines
      }
    }
  }
});

function send(msg) {
  const str = JSON.stringify(msg);
  // console.log('Sending:', str);
  server.stdin.write(str + '\n');
}

// Step 1: Initialize
send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0' }
  }
});

setTimeout(() => {
  console.error('❌ Timeout waiting for response');
  server.kill();
  process.exit(1);
}, 10000);
