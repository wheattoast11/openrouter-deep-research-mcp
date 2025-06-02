[![Verified on MseeP](https://mseep.ai/badge.svg)](https://mseep.ai/app/673d036f-d9e8-4fd7-9352-566c61d365f5)
# OpenRouter Agents MCP Server

A Model Context Protocol (MCP) server implementation for OpenRouter that provides sophisticated research agent capabilities. This server allows your conversational LLM to delegate research to a Claude research orchestrator that uses different specialized agents powered by various OpenRouter models.

## 🚀 New Beta Branch (03-29-2025)

### OpenRouter Agents MCP Server Technical Overview
The OpenRouter Agents MCP Server implements a sophisticated orchestration system for AI-powered research. This summary highlights the key technical components and capabilities in the latest beta (03-29-2025).

#### Core Architecture
- **Model Context Protocol (MCP)**: Full implementation with both STDIO and HTTP/SSE transports
- **Multi-Agent Orchestration**: Hierarchical system with planning, research, and context agent roles
- **Vector Embedding Database**: PGLite with pgvector for semantic knowledge storage
- **Round-Robin Load Balancing**: Distributes research tasks across different models for optimal results
- **Adaptive Fallback System**: High to low-cost model degradation when primary research fails

#### Research Capabilities
- **Multi-Stage Planning**: Claude 3.7 Sonnet decomposes complex queries into specialized sub-questions
- **Parallel Execution**: Concurrent research across multiple LLMs for comprehensive results
- **Context-Aware Refinement**: Second-stage planning that identifies and fills gaps in initial research
- **Semantic Knowledge Base**: Vector search finds relevant past research to enhance new queries
- **Adaptive Synthesis**: Contextual agent integrates findings with customizable audience levels and formats

#### Recent Enhancements
- **Cross-Model Resilience**: Comprehensive error handling keeps research flowing despite individual model failures
- **Dynamic Caching**: Intelligent TTL and cache optimization based on query complexity
- **DB Resilience**: Retry logic with exponential backoff for database operations
- **Defensive Programming**: Null-safe operations throughout the codebase
- **Enhanced User Feedback**: Rating system with detailed error recovery
- **Comprehensive Testing**: Verified functionality across all five MCP tools

The beta improves both reliability and research quality through architectural enhancements while maintaining the plug-and-play simplicity of the original implementation. The system seamlessly integrates with Cline in VS Code and Claude Desktop App, providing enterprise-grade research capabilities in a self-contained package.

These improvements deliver a more reliable and powerful research experience while maintaining the server's ease of use. To try the beta version:

```bash
git clone https://github.com/wheattoast11/openrouter-deep-research-mcp.git
cd openrouter-agents
git checkout beta
npm install
```

## 🌟 Support This Project

If you find this project helpful, please consider giving it a star on GitHub! Your support helps make this project better.

[![GitHub stars](https://img.shields.io/github/stars/wheattoast11/openrouter-deep-research-mcp.svg?style=social&label=Star)](https://github.com/wheattoast11/openrouter-agents)
[![GitHub forks](https://img.shields.io/github/forks/wheattoast11/openrouter-deep-research-mcp?style=social&label=Fork)](https://github.com/wheattoast11/openrouter-agents/fork)
[![GitHub issues](https://img.shields.io/github/issues/wheattoast11/openrouter-deep-research-mcp.svg?style=social&label=Issues)](https://github.com/wheattoast11/openrouter-agents/issues)

Your feedback and contributions are always welcome!

## Prerequisites

- Node.js (v18 or later recommended) and npm
- Git
- An OpenRouter API key (Get one at [https://openrouter.ai/](https://openrouter.ai/))

## Features

- Research planning with Claude 3.7 Sonnet (thinking mode)
- Multiple research agents powered by various OpenRouter LLMs
- Round-robin assignment of models to research tasks
- Configurable cost options (high/low) for different research needs
- Self-contained with no external database dependencies
- In-memory caching for fast response times
- PGLite with vector extension for persistent storage and similarity search

## How It Works

1. When you send a research query, the planning agent (Claude 3.7 Sonnet) breaks it down into multiple specialized research questions
2. Each research question is assigned to a different research agent using either high-cost or low-cost LLMs
3. The results from all agents are synthesized into a comprehensive research report
4. Results are cached in memory and stored persistently with embedded vector search capabilities
5. The final contextualized report is returned to you

## Installation (Node.js / Standard)

This is the recommended method for integrating with MCP clients like Cline in VS Code.

1. Clone this repository:
   ```bash
   git clone https://github.com/wheattoast11/openrouter-deep-research-mcp.git
   cd openrouter-agents
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your `.env` file from the example:
   ```bash
   cp .env.example .env
   ```
   *(On Windows, you might use `copy .env.example .env`)*

4. Edit the `.env` file and add your OpenRouter API key:
   ```dotenv
   OPENROUTER_API_KEY=your_api_key_here
   ```
   *(Ensure this file is saved in the root directory of the project)*

## Cline / VS Code MCP Integration (Recommended)

To use this server with Cline in VS Code, you need to add it to your MCP settings file.

1.  **Locate your Cline MCP settings file:**
    *   Typically found at: `c:\Users\YOUR_USERNAME\AppData\Roaming\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json` (Windows) or `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` (macOS). Replace `YOUR_USERNAME` accordingly.

2.  **Edit the `cline_mcp_settings.json` file:** Add the following configuration object within the main `mcpServers` object. **Make sure to replace `"YOUR_PROJECT_PATH_HERE"` with the absolute path to where you cloned this repository and `"YOUR_OPENROUTER_API_KEY_HERE"` with your actual API key.**

    ```json
    {
      "mcpServers": {
        // ... potentially other existing servers ...

        "openrouter-research-agents": {
          "command": "cmd.exe", 
          "args": [
            "/c", 
            "YOUR_PROJECT_PATH_HERE/start-mcp-server.bat"
          ], 
          "env": {
            // IMPORTANT: Replace with your actual OpenRouter API Key
            "OPENROUTER_API_KEY": "YOUR_OPENROUTER_API_KEY_HERE" 
          },
          "disabled": false, // Ensure the server is enabled
          "autoApprove": [
            "conduct_research",
            "research_follow_up",
            "get_past_research",
            "rate_research_report",
            "list_research_history"
          ]
        }

        // ... potentially other existing servers ...
      }
    }
    ```
    *   **Why the batch file?** Using the batch file ensures the server starts with the proper environment and directory context.
    *   **Why the API key in `env`?** While the server uses `dotenv` to load the `.env` file, providing the key in the `env` block ensures the server process always has access to it.

3.  **Save the settings file.** Cline should automatically detect the new server configuration. You might need to restart VS Code or the Cline extension if it doesn't appear immediately.

Once configured, you'll see the `conduct_research` and other research tools available in Cline. You can use them like this:

```
Can you research the latest advancements in quantum computing?
```

Or specify a cost preference:

```
Can you conduct a high-cost research on climate change mitigation strategies?
```

## Available Models

### High-Cost Models

- perplexity/sonar-deep-research
- perplexity/sonar-pro
- perplexity/sonar-reasoning-pro
- openai/gpt-4o-search-preview

### Low-Cost Models

- perplexity/sonar-reasoning
- openai/gpt-4o-mini-search-preview
- google/gemini-2.0-flash-001

## Customization

You can customize the available models by editing the `.env` file:

```
HIGH_COST_MODELS=perplexity/sonar-deep-research,perplexity/sonar-pro,other-model
LOW_COST_MODELS=perplexity/sonar-reasoning,openai/gpt-4o-mini-search-preview,other-model
```

You can also customize the database and cache settings in the `.env` file:

```
PGLITE_DATA_DIR=./researchAgentDB
CACHE_TTL_SECONDS=3600
```

## Alternative Installation: HTTP/SSE for Claude Desktop App

The server can also be run as a standalone HTTP/SSE service for integration with the Claude Desktop App.

### HTTP/SSE Installation Steps

1.  Clone this repository (if not already done):
    ```bash
    git clone https://github.com/wheattoast11/openrouter-deep-research-mcp.git
    cd openrouter-agents
    ```
2.  Create and configure your `.env` file as described in the standard installation (Steps 3 & 4).
3.  Start the server using npm:
    ```bash
    npm start
    ```
4.  The MCP server will be running and accessible via HTTP/SSE on `http://localhost:3002` (or the port specified in your `.env`).

### Claude Desktop App Integration (HTTP/SSE)

1.  Open Claude desktop app.
2.  Go to Settings > Developer.
3.  Click "Edit Config".
4.  Add the following to the `mcpServers` array in the configuration:

    ```json
    {
      "type": "sse",
      "name": "OpenRouter Research Agents (HTTP)", // Differentiate if also using STDIO
      "host": "localhost",
      "port": 3002, // Or your configured port
      "streamPath": "/sse",
      "messagePath": "/messages"
    }
    ```
5.  Save and restart Claude.

## Persistence & Data Storage

This server uses:

- **In-memory cache**: For efficient response caching (using node-cache)
- **PGLite with pgvector**: For persistent storage of research reports and vector search capabilities
  - Research reports are stored with vector embeddings for semantic similarity search
  - Vector search is used to find relevant past research for new queries
  - All data is stored locally in the specified data directory (default: './researchAgentDB')

## Troubleshooting

- **Connection Issues**: Ensure Claude's developer settings match the server configuration
- **API Key Errors**: Verify your OpenRouter API key is correct
- **No Agents Found**: If planning fails, ensure Claude is parsing the XML correctly
- **Model Errors**: Check if the specified models are available in your OpenRouter account

## Advanced Configuration

The server configuration can be modified in `config.js`. You can adjust:

- Available models
- Default cost preferences
- Planning agent settings
- Server port and configuration
- Database and cache settings

### Authentication Security

As of the latest update, API key authentication is now **mandatory by default** for HTTP/SSE transport:

1. Set the `SERVER_API_KEY` environment variable in your `.env` file for production:
   ```
   SERVER_API_KEY=your_secure_api_key_here
   ```

2. For development/testing only, you can disable authentication by setting:
   ```
   ALLOW_NO_API_KEY=true
   ```

This provides enhanced security for production deployments while maintaining flexibility for development and testing.

## Testing Tools

The repository includes several testing tools to verify the implementation:

1. **Basic Tool Testing**:
   ```bash
   test-all-tools.bat
   ```
   This script tests all five MCP tools in isolation to verify they are working correctly.

2. **MCP Server Testing**:
   ```bash
   test-mcp-server.js
   ```
   Tests the MCP server implementation including all transport options.

3. **Research Agent Testing**:
   ```bash
   test-research-agent.js
   ```
   Tests the core research agent functionality with actual OpenRouter API calls.

These tools help ensure that all components are functioning correctly after any modifications.

## License

MIT
