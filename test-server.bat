@echo off
echo Testing OpenRouter Research Agents MCP Server...
cd C:\Users\tdesa\Documents\ai_projects\openrouter-agents
node src/server/mcpServer.js --stdio < test-input.json
