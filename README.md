# OpenRouter Agents MCP Server

A Model Context Protocol (MCP) server implementation for OpenRouter that provides sophisticated research agent capabilities. This server allows your conversational LLM to delegate research to a Claude research orchestrator that uses different specialized agents powered by various OpenRouter models.

## 🌟 Support This Project

If you find this project helpful, please consider giving it a star on GitHub! Your support helps make this project better.

[![GitHub stars](https://img.shields.io/github/stars/wheattoast11/openrouter-agents.svg?style=social&label=Star)](https://github.com/wheattoast11/openrouter-agents)
[![GitHub forks](https://img.shields.io/github/forks/wheattoast11/openrouter-agents.svg?style=social&label=Fork)](https://github.com/wheattoast11/openrouter-agents/fork)
[![GitHub issues](https://img.shields.io/github/issues/wheattoast11/openrouter-agents.svg?style=social&label=Issues)](https://github.com/wheattoast11/openrouter-agents/issues)

Your feedback and contributions are always welcome!

## Features

- Research planning with Claude 3.7 Sonnet (thinking mode)
- Multiple research agents powered by various OpenRouter LLMs
- Round-robin assignment of models to research tasks
- Configurable cost options (high/low) for different research needs
- Docker containerization for easy deployment

## How It Works

1. When you send a research query, the planning agent (Claude 3.7 Sonnet) breaks it down into multiple specialized research questions
2. Each research question is assigned to a different research agent using either high-cost or low-cost LLMs
3. The results from all agents are synthesized into a comprehensive research report
4. The final contextualized report is returned to you

## Quick Start

### Prerequisites

- Docker and Docker Compose
- OpenRouter API key

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/wheattoast11/openrouter-agents.git
   cd openrouter-agents
   ```

2. Create your .env file from the example:
   ```bash
   cp .env.example .env
   ```

3. Edit the .env file and add your OpenRouter API key:
   ```
   OPENROUTER_API_KEY=your_api_key_here
   ```

4. Build and start the Docker container:
   ```bash
   docker-compose up -d
   ```

5. The MCP server is now running on http://localhost:3000

## Claude Integration

To use this MCP server with Claude 3.7 Sonnet desktop app:

1. Open Claude desktop app
2. Go to Settings > Developer
3. Click "Edit Config"
4. Add the following to the configuration:

```json
{
  "mcpServers": [
    {
      "type": "sse",
      "name": "OpenRouter Research Agents",
      "host": "localhost",
      "port": 3000,
      "streamPath": "/sse",
      "messagePath": "/messages"
    }
  ]
}
```

5. Save and restart Claude

Once configured, you'll see the research agent tool available in Claude. You can use it like this:

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

## Usage Without Docker

If you prefer to run without Docker:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. For STDIO mode (command-line only):
   ```bash
   npm run stdio
   ```

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
