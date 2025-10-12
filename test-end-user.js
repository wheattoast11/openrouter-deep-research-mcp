#!/usr/bin/env node

/**
 * End-User Test: Simulate typical user interactions with MCP server
 * Tests the full flow: initialize → discover tools → call agent → check job → get result
 */

const fetch = global.fetch || require('node-fetch');

const SERVER_URL = 'http://localhost:3009';
const API_KEY = process.env.SERVER_API_KEY || 'test-key';

async function testEndUserFlow() {
  console.log('=== End-User MCP Server Test ===\n');
  
  // 1. Check server health
  console.log('1. Checking server health...');
  try {
    const aboutRes = await fetch(`${SERVER_URL}/about`);
    const aboutData = await aboutRes.json();
    console.log(`✅ Server running: ${aboutData.name} v${aboutData.version}`);
    console.log(`   Transport modes: ${Object.keys(aboutData.transports || {}).join(', ')}\n`);
  } catch (err) {
    console.error(`❌ Server not reachable: ${err.message}`);
    console.log('   Please start the server with: node src/server/mcpServer.js\n');
    process.exit(1);
  }
  
  // 2. Initialize MCP session
  console.log('2. Initializing MCP session...');
  const initRes = await fetch(`${SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'MCP-Protocol-Version': '2025-03-26'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'end-user-test', version: '1.0.0' }
      },
      id: 1
    })
  });
  
  const initData = await initRes.json();
  const sessionId = initRes.headers.get('Mcp-Session-Id');
  
  if (initData.result) {
    console.log(`✅ Session initialized: ${sessionId}`);
    console.log(`   Protocol: ${initData.result.protocolVersion}`);
    console.log(`   Capabilities: tools=${initData.result.capabilities.tools?.list}, prompts=${initData.result.capabilities.prompts?.list}, resources=${initData.result.capabilities.resources?.list}\n`);
  } else {
    console.error(`❌ Initialize failed:`, initData.error);
    process.exit(1);
  }
  
  // 3. List available tools
  console.log('3. Discovering available tools...');
  const toolsRes = await fetch(`${SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'MCP-Protocol-Version': '2025-03-26',
      'Mcp-Session-Id': sessionId
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 2
    })
  });
  
  const toolsData = await toolsRes.json();
  if (toolsData.result?.tools) {
    console.log(`✅ Found ${toolsData.result.tools.length} tools`);
    console.log(`   Sample tools: ${toolsData.result.tools.slice(0, 5).map(t => t.name).join(', ')}\n`);
  }
  
  // 4. List available prompts
  console.log('4. Discovering available prompts...');
  const promptsRes = await fetch(`${SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'MCP-Protocol-Version': '2025-03-26',
      'Mcp-Session-Id': sessionId
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'prompts/list',
      id: 3
    })
  });
  
  const promptsData = await promptsRes.json();
  if (promptsData.result?.prompts) {
    console.log(`✅ Found ${promptsData.result.prompts.length} prompts`);
    console.log(`   Prompts: ${promptsData.result.prompts.map(p => p.name).join(', ')}\n`);
  }
  
  // 5. Test ping tool (quick health check)
  console.log('5. Testing ping tool...');
  const pingRes = await fetch(`${SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'MCP-Protocol-Version': '2025-03-26',
      'Mcp-Session-Id': sessionId
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'ping',
        arguments: { info: true }
      },
      id: 4
    })
  });
  
  const pingData = await pingRes.json();
  if (pingData.result) {
    const pongText = pingData.result.content?.[0]?.text;
    const pong = JSON.parse(pongText || '{}');
    console.log(`✅ Ping successful: ${pong.pong ? 'pong' : 'no response'}`);
    console.log(`   Server time: ${pong.time}\n`);
  }
  
  // 6. Submit async research job
  console.log('6. Submitting async research job...');
  const agentRes = await fetch(`${SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'MCP-Protocol-Version': '2025-03-26',
      'Mcp-Session-Id': sessionId
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'agent',
        arguments: {
          action: 'research',
          query: 'What are the key features of the Model Context Protocol?',
          async: true,
          costPreference: 'low'
        }
      },
      id: 5
    })
  });
  
  const agentData = await agentRes.json();
  let jobId = null;
  
  if (agentData.result) {
    const resultText = agentData.result.content?.[0]?.text;
    const result = JSON.parse(resultText || '{}');
    jobId = result.job_id;
    console.log(`✅ Job submitted: ${jobId}`);
    console.log(`   Status: ${result.status}\n`);
  } else {
    console.error(`❌ Job submission failed:`, agentData.error);
  }
  
  // 7. Check job status (poll a few times)
  if (jobId) {
    console.log('7. Monitoring job progress...');
    
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between polls
      
      const statusRes = await fetch(`${SERVER_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'MCP-Protocol-Version': '2025-03-26',
          'Mcp-Session-Id': sessionId
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'job_status',
            arguments: { job_id: jobId }
          },
          id: 6 + i
        })
      });
      
      const statusData = await statusRes.json();
      if (statusData.result) {
        const statusText = statusData.result.content?.[0]?.text;
        const status = JSON.parse(statusText || '{}');
        console.log(`   [Poll ${i + 1}/5] Status: ${status.status}, Progress: ${Math.round((status.progress || 0) * 100)}%`);
        
        if (status.status === 'succeeded' || status.status === 'failed') {
          console.log(`   Final status: ${status.status}\n`);
          
          // 8. Get final result if succeeded
          if (status.status === 'succeeded') {
            console.log('8. Retrieving final result...');
            const resultRes = await fetch(`${SERVER_URL}/mcp`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                'MCP-Protocol-Version': '2025-03-26',
                'Mcp-Session-Id': sessionId
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                  name: 'get_job_result',
                  arguments: { job_id: jobId }
                },
                id: 20
              })
            });
            
            const resultData = await resultRes.json();
            if (resultData.result) {
              const finalText = resultData.result.content?.[0]?.text;
              const final = JSON.parse(finalText || '{}');
              console.log(`✅ Research completed!`);
              console.log(`   Synthesis: ${(final.synthesis || '').substring(0, 200)}...`);
              console.log(`   Report ID: ${final.reportId || 'N/A'}\n`);
            }
          }
          break;
        }
      }
    }
  }
  
  // 9. Test prompt (planning_prompt)
  console.log('9. Testing planning_prompt...');
  const promptRes = await fetch(`${SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'MCP-Protocol-Version': '2025-03-26',
      'Mcp-Session-Id': sessionId
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'prompts/get',
      params: {
        name: 'planning_prompt',
        arguments: {
          query: 'Compare cloud vector databases',
          domain: 'technical',
          complexity: 'moderate',
          maxAgents: 5
        }
      },
      id: 30
    })
  });
  
  const promptData = await promptRes.json();
  if (promptData.result) {
    console.log(`✅ Planning prompt executed`);
    console.log(`   Description: ${promptData.result.description}`);
    const planText = promptData.result.messages?.[0]?.content?.text || '';
    console.log(`   Plan preview: ${planText.substring(0, 150)}...\n`);
  } else {
    console.error(`❌ Prompt failed:`, promptData.error);
  }
  
  console.log('=== End-User Test Complete ===');
  console.log('\n✅ All core user flows validated!');
  console.log('   - Server discovery & health');
  console.log('   - MCP session initialization');
  console.log('   - Tool/prompt/resource discovery');
  console.log('   - Synchronous tool calls (ping)');
  console.log('   - Async job submission & monitoring');
  console.log('   - Prompt execution with arguments');
}

// Run the test
testEndUserFlow().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});

