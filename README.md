[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/wheattoast11-openrouter-deep-research-mcp-badge.png)](https://mseep.ai/app/wheattoast11-openrouter-deep-research-mcp)

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
- **Aug 09, 2025 Updates**:
  - **Per-connection HTTP/SSE routing** with API key auth; legacy fallback retained
  - **Dynamic model catalog** via OpenRouter `/models` + new `list_models` tool
  - **Robust SSE parsing** using `eventsource-parser` for stable streaming
  - **DB QoL tools**: `export_reports`, `import_reports`, `backup_db`, `db_health`, `reindex_vectors`
  - **Config/env quality**: `SERVER_PORT` support; CSV or JSON parsing for model lists; `ENSEMBLE_SIZE`; clearer Node ≥18 requirement

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

## Cline / Cursor / VS Code MCP Integration (STDIO)

This method uses the STDIO transport and is recommended for integrations within VS Code (using Cline or Cursor extensions).

1.  **Locate your MCP settings file:**
    *   **Cline (in VS Code/Cursor):** Typically found at:
        *   Windows: `c:\Users\YOUR_USERNAME\AppData\Roaming\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
        *   macOS: `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
        *   Linux: `~/.config/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
        *(Replace `YOUR_USERNAME` and potentially `Cursor` with `Code` if using standard VS Code)*
    *   **Other MCP Clients:** Consult their documentation for the settings file location.

2.  **Edit the MCP settings file:** Add the following configuration object within the main `mcpServers` object.
    *   **CRITICAL:** Replace `"YOUR_PROJECT_PATH_HERE"` with the **absolute path** to the directory where you cloned this repository (e.g., `C:/Users/tdesa/Documents/ai_projects/openrouter-agents`).
    *   **CRITICAL:** Replace `"YOUR_OPENROUTER_API_KEY_HERE"` with your actual OpenRouter API key.

    ```json
    {
      "mcpServers": {
        // ... potentially other existing servers ...

        "openrouter-research-agents": {
          "command": "cmd.exe", 
          "args": [
            "/c",
            "YOUR_PROJECT_PATH_HERE\\start-mcp-server.bat" // Use double backslashes for paths in JSON on Windows
            // On macOS/Linux, use: "command": "YOUR_PROJECT_PATH_HERE/start-mcp-server.sh" (or similar) and remove "/c" from args
          ],
          "env": {
            // This ensures the server process gets the API key directly.
            // It overrides any value set in the .env file for this specific server instance.
            "OPENROUTER_API_KEY": "YOUR_OPENROUTER_API_KEY_HERE"
            // You can add other environment variables here if needed, e.g.:
            // "LOG_LEVEL": "debug"
          },
          "disabled": false, // Set to false to enable the server
          "autoApprove": [ // Optional: Tools Cline can use without asking permission
            "conduct_research",
            "research_follow_up",
            "get_past_research",
            "rate_research_report",
            "list_research_history",
            "get_report_content",
            "get_server_status" // Add the new status tool
          ]
        }

        // ... potentially other existing servers ...
      }
    }
    ```
    *   **Batch/Shell Script:** Using the provided `.bat` (Windows) or a corresponding `.sh` (macOS/Linux) script ensures the Node.js server starts with the correct environment variables loaded (via `dotenv`) and in the correct working directory.
    *   **API Key in `env`:** Providing the `OPENROUTER_API_KEY` in the `env` block is the most reliable way to ensure the server process receives it, especially across different platforms and client configurations.

3.  **Save the settings file.** Your MCP client (Cline, Cursor) should automatically detect and start the server. You might need to restart the client or IDE if it doesn't appear immediately.

Once configured, you'll see the `conduct_research` and other research tools available in Cline. You can use them like this:

```
Can you research the latest advancements in quantum computing?
```

Or specify a cost preference:

```
Can you conduct a high-cost research on climate change mitigation strategies?
```

You can also check the server's status:

```
Use the get_server_status tool.
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
# Or provide JSON arrays with domains, e.g.:
# HIGH_COST_MODELS=[{"name":"perplexity/sonar-deep-research","domains":["search","general"]}]
# LOW_COST_MODELS=[{"name":"openai/gpt-4o-mini-search-preview","domains":["search","general"]}]
```

You can also customize the database and cache settings in the `.env` file:

```
PGLITE_DATA_DIR=./researchAgentDB
CACHE_TTL_SECONDS=3600
SERVER_PORT=3002
ENSEMBLE_SIZE=2
```

## Alternative Installation: HTTP/SSE (e.g., for Claude Desktop App)

The server can also be run as a standalone HTTP/SSE service. This is suitable for clients like the Claude Desktop App or custom web applications.

### Running the Server (HTTP/SSE)

1.  Clone this repository (if not already done):
    ```bash
    git clone https://github.com/wheattoast11/openrouter-deep-research-mcp.git
    cd openrouter-agents
    ```
2.  Create and configure your `.env` file as described in the standard installation (Steps 3 & 4).
    *   **IMPORTANT for HTTP/SSE:** Ensure you set the `SERVER_API_KEY` in your `.env` file for authentication (unless you explicitly disable it with `ALLOW_NO_API_KEY=true` for testing).
      ```dotenv
      # .env file
      OPENROUTER_API_KEY=your_openrouter_key_here
      SERVER_API_KEY=your_secure_mcp_server_key_here # Add this line!
      # Optional: ALLOW_NO_API_KEY=true (Only for testing, disables auth if SERVER_API_KEY is also unset)
      ```
3.  Start the server using npm (this runs `node src/server/mcpServer.js`):
    ```bash
    npm start
    ```
4.  The MCP server will start listening for HTTP/SSE connections on the configured port (default: `3002`). Check the console output for the exact port and authentication status.

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
      "port": 3002, // Or your configured port (from .env or config.js). SERVER_PORT or PORT
      "streamPath": "/sse",
      "messagePath": "/messages",
      // IMPORTANT: Add apiKey if you set SERVER_API_KEY in the server's .env
      "apiKey": "your_secure_mcp_server_key_here" 
    }
    ```
    *   The `apiKey` here **must match** the `SERVER_API_KEY` you set in the server's `.env` file.

5.  Save the configuration and restart the Claude Desktop App.

## Persistence & Data Storage

This server uses:

- **In-memory cache**: For efficient response caching (using node-cache)
- **PGLite with pgvector**: For persistent storage of research reports and vector search capabilities
  - Research reports are stored with vector embeddings for semantic similarity search
  - Vector search is used to find relevant past research for new queries
  - All data is stored locally in the specified data directory (default: './researchAgentDB')
  - Backups can be created via the `backup_db` tool; it produces a `.tar.gz` archive of the PGLite data directory and a JSON manifest in `./backups` by default

### Backup & Restore
- Create backup:
  ```json
  { "tool": "backup_db", "args": { "destinationDir": "./backups" } }
  ```
  Returns `{ archive: "./backups/pglite-backup-<timestamp>.tar.gz", manifest: "manifest-<timestamp>.json" }`.
- Restore (manual): stop the server, extract the archive to the configured `PGLITE_DATA_DIR`, then start the server.

## Troubleshooting

- **Connection Issues**: Ensure Claude's developer settings match the server configuration
- **API Key Errors**: Verify your OpenRouter API key is correct
- **No Agents Found**: If planning fails, ensure the planning model (Claude 3.7 Sonnet by default) is accessible via your OpenRouter key and check server logs for XML parsing errors.
- **Model Errors**: Check if the specific research models used are available and enabled in your OpenRouter account. Check server logs for API errors from OpenRouter.
- **DB/Embedder Issues**: Use the `get_server_status` tool to check if the database and embedding model initialized correctly. Check server logs for errors during initialization.

## Available Tools

This MCP server provides the following tools:

- `conduct_research`: Performs the main research orchestration.
- `research_follow_up`: Conducts follow-up research based on an original query.
- `get_past_research`: Finds semantically similar past research reports from the database.
- `rate_research_report`: Adds user feedback (rating/comment) to a specific report.
- `list_research_history`: Lists recent research reports, optionally filtered by query text.
- `get_report_content`: Retrieves the full text content of a specific report by its ID.
- `get_server_status`: Provides diagnostic information about the server's state (DB connection, embedder status, cache stats, etc.).
- `list_models`: Returns the current dynamic model catalog snapshot (use `{ "refresh": true }` to refetch).
- `export_reports`: Export reports as JSON or NDJSON (supports `limit`, `queryFilter`).
- `import_reports`: Import reports from JSON or NDJSON content.
- `backup_db`: Create a simple manifest-based backup record for file-backed DBs.
- `db_health`: Quick database/embedder health summary.
- `reindex_vectors`: Rebuild the pgvector HNSW index for `reports.query_embedding`.
- `search_web`: Lightweight web search via DuckDuckGo Instant Answer API; returns related topics.
- `fetch_url`: Fetch URL content and extract readable text snippet (HTML stripped), capped by `maxBytes`.

> Note: Use `search_web`/`fetch_url` responsibly and respect robots.txt and site policies. These utilities are for lightweight lookups and previews, not bulk crawling.

## Advanced Configuration

The server configuration can be modified primarily via the `.env` file. You can adjust:

- Available models
- Default cost preferences
- Planning agent settings
- Server port (`SERVER_PORT`)
- Database directory (`PGLITE_DATA_DIR`) and cache TTL (`CACHE_TTL_SECONDS`)
- Authentication key (`SERVER_API_KEY`) and whether to allow disabling it (`ALLOW_NO_API_KEY`)

More advanced settings (like specific model names, retry logic, vector dimensions) are in `config.js`, but modifying the `.env` file is recommended for most common adjustments.

### Authentication Security (HTTP/SSE)

As of the latest update, API key authentication is now **mandatory by default** for HTTP/SSE transport:

1.  **Mandatory by Default:** API key authentication is required for the HTTP/SSE transport.
2.  **Set the Key:** Define `SERVER_API_KEY=your_secure_api_key_here` in your `.env` file when running the server via `npm start`.
3.  **Client Configuration:** Ensure the connecting client (e.g., Claude Desktop App) provides this same key in its configuration (`apiKey` field).
4.  **Disabling (Testing Only):** For local testing *only*, you can set `ALLOW_NO_API_KEY=true` in the `.env` file. If this is true AND `SERVER_API_KEY` is *not* set, authentication will be bypassed. **Do not use this in production.**

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
