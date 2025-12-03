@echo off
echo Starting OpenRouter Research Agents MCP Server in STDIO mode...
REM IMPORTANT: Update the path below to point to where you installed this project
cd /d C:\path\to\your\openrouter-agents
node src/server/mcpServer.js --stdio
