const express = require('express');
const config = require('../../config');

function setupWellKnownEndpoints(app) {
  // /.well-known/mcp-server
  app.get('/.well-known/mcp-server', (req, res) => {
    res.json({
      name: config.server.name,
      version: config.server.version,
      protocol_versions_supported: config.mcp?.supportedVersions || ['2024-11-05', '2025-03-26'],
      transports: [
        { type: 'websocket', path: '/mcp/ws' },
        { type: 'http_streamable', path: '/mcp' }
      ],
      capabilities: {
        tools: { list: true, call: true },
        resources: { list: true, read: true, subscribe: true },
        prompts: { list: true, get: true }
      },
      registry_metadata: {
        homepage: 'https://github.com/wheattoast11/openrouter-agents',
        description: 'OpenRouter Agents: Advanced research agent with knowledge graph and structured synthesis.',
        tags: ['research', 'agent', 'knowledge-graph', 'synthesis', 'openrouter']
      }
    });
  });

  // /.well-known/oauth-protected-resource
  if (config.auth?.discovery?.enabled) {
    app.get('/.well-known/oauth-protected-resource', (req, res) => {
      res.json({
        issuer: config.auth.issuer,
        authorization_servers: config.auth.discovery.authorizationServers || [],
        scopes_supported: Object.keys(config.auth.scopes.scopeMap).flatMap(key => config.auth.scopes.scopeMap[key]),
        resource: config.auth.expectedAudience
      });
    });
  }
}

module.exports = { setupWellKnownEndpoints };
