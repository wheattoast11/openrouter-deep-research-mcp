@echo off
echo Testing OpenRouter Research Agents MCP Server...
REM IMPORTANT: Update the path below to point to where you installed this project
cd /d C:\path\to\your\openrouter-agents
node src/server/mcpServer.js --stdio < test-input.json
