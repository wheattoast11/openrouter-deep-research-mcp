@echo off
echo Starting OpenRouter Research Agents MCP Server (Node.js --stdio)...
cd /d "%~dp0"
set NODE_NO_WARNINGS=1
node src/server/mcpServer.js --stdio
