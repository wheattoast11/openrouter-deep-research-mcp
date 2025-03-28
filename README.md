# OpenRouter Agents MCP Server

A Model Context Protocol (MCP) server implementation for OpenRouter that provides sophisticated research agent capabilities. This server allows your conversational LLM to delegate research to a Claude research orchestrator that uses different specialized agents powered by various OpenRouter models.

## 🌟 Support This Project

If you find this project helpful, please consider giving it a star on GitHub! Your support helps make this project better.

[![GitHub stars](https://img.shields.io/github/stars/wheattoast11/openrouter-agents.svg?style=social&label=Star)](https://github.com/wheattoast11/openrouter-agents)
[![GitHub forks](https://img.shields.io/github/forks/wheattoast11/openrouter-agents.svg?style=social&label=Fork)](https://github.com/wheattoast11/openrouter-agents/fork)
[![GitHub issues](https://img.shields.io/github/issues/wheattoast11/openrouter-agents.svg?style=social&label=Issues)](https://github.com/wheattoast11/openrouter-agents/issues)

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
- Docker containerization available as an alternative deployment method

## How It Works

1. When you send a research query, the planning agent (Claude 3.7 Sonnet) breaks it down into multiple specialized research questions
2. Each research question is assigned to a different research agent using either high-cost or low-cost LLMs
3. The results from all agents are synthesized into a comprehensive research report
4. The final contextualized report is returned to you

## Installation (Node.js / Standard)

This is the recommended method for integrating with MCP clients like Cline in VS Code.

1. Clone this repository:
   ```bash
   git clone https://github.com/wheattoast11/openrouter-agents.git
   cd openrouter-agents
   ```

2. Create your .env file from the example:
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
          "command": "node",
          // IMPORTANT: Replace YOUR_PROJECT_PATH_HERE with the correct absolute path
          "args": ["YOUR_PROJECT_PATH_HERE/src/server/mcpServer.js", "--stdio"], 
          "env": {
            // IMPORTANT: Replace with your actual OpenRouter API Key
            "OPENROUTER_API_KEY": "YOUR_OPENROUTER_API_KEY_HERE" 
          },
          "disabled": false, // Ensure the server is enabled
          "autoApprove": []  // Default auto-approve settings
        }

        // ... potentially other existing servers ...
      }
    }
    ```
    *   **Why the absolute path?** Cline needs the full path to execute the server script correctly from its own context.
    *   **Why the API key in `env`?** While the server uses `dotenv` to load the `.env` file, Cline executes the command directly. Providing the key in the `env` block ensures the server process started by Cline has access to it.

3.  **Save the settings file.** Cline should automatically detect the new server configuration. You might need to restart VS Code or the Cline extension if it doesn't appear immediately.

Once configured, you'll see the `conduct_research` and `research_follow_up` tools available in Cline. You can use them like this:

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

## Alternative Installation: Docker & Claude Desktop App

This method uses Docker and is suitable for running the server as a standalone container, often used with the Claude Desktop App via HTTP/SSE.

### Prerequisites for Docker

- Docker and Docker Compose

### Docker Installation Steps

1.  Clone this repository (if not already done):
    ```bash
    git clone https://github.com/wheattoast11/openrouter-agents.git
    cd openrouter-agents
    ```
2.  Create and configure your `.env` file as described in the standard installation (Step 3 & 4).
3.  Build and start the Docker container:
    ```bash
    docker-compose up -d
    ```
4.  The MCP server will be running and accessible via HTTP/SSE on `http://localhost:3000` (or the port specified in your `.env`).

### Claude Desktop App Integration (HTTP/SSE)

If you are running the server (either via Docker or `npm start`), you can connect the Claude Desktop App:

1.  Open Claude desktop app.
2.  Go to Settings > Developer.
3.  Click "Edit Config".
4.  Add the following to the `mcpServers` array in the configuration:

    ```json
    {
      "type": "sse",
      "name": "OpenRouter Research Agents (HTTP)", // Differentiate if also using STDIO
      "host": "localhost",
      "port": 3000, // Or your configured port
      "streamPath": "/sse",
      "messagePath": "/messages"
    }
    ```
5.  Save and restart Claude.

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

## License

MIT
