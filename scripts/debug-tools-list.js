const fetch = require('node-fetch');
(async () => {
  const base = 'http://127.0.0.1:3010/mcp';
  const headers = {
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': '2025-03-26'
  };
  const initPayload = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {} } };
  const initRes = await fetch(base, { method: 'POST', headers, body: JSON.stringify(initPayload) });
  const initJson = await initRes.json();
  const sessionId = initRes.headers.get('mcp-session-id');
  console.log('Init status', initRes.status);
  console.log('Init json', initJson);
  console.log('Session', sessionId);
  const initNotif = { jsonrpc: '2.0', method: 'notifications/initialized' };
  const notifRes = await fetch(base, { method: 'POST', headers: { ...headers, 'Mcp-Session-Id': sessionId }, body: JSON.stringify(initNotif) });
  console.log('Notif status', notifRes.status);
  const listPayload = { jsonrpc: '2.0', id: 2, method: 'tools/list' };
  const listRes = await fetch(base, { method: 'POST', headers: { ...headers, 'Mcp-Session-Id': sessionId }, body: JSON.stringify(listPayload) });
  const listJson = await listRes.json();
  console.log('List status', listRes.status);
  console.log('List json', listJson);
})();
