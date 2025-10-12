# Local Models Integration: Server-Side GGUF Inference

**Version**: 2.1.1-beta  
**Date**: October 11, 2025

## Overview

The OpenRouter Agents MCP server now supports server-side GGUF model inference using `node-llama-cpp` bindings. Models are automatically downloaded from HuggingFace at server boot and cached locally for ultra-efficient inference.

## Key Features

- **Server-Side Execution**: All inference happens on the MCP server, eliminating browser complexity
- **Automatic Model Downloads**: Models are fetched from HuggingFace on first boot and cached
- **Qwen→Utopia Pipeline**: Special logit-passing mode for reasoning enhancement
- **MCP-Native Integration**: Exposed via standard MCP tool interface, usable across all transports (STDIO, WebSocket, HTTP/SSE)

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Enable local models
LOCAL_MODELS_ENABLED=true

# Comma-separated list of HuggingFace model IDs
# Format: repo/model:quantization
LOCAL_MODEL_IDS=mradermacher/utopia-atomic-GGUF:Q2_K,mradermacher/Qwen3-4B-Thinking-2507-Esper3.1-i1-GGUF

# Download path for models (defaults to ./models)
LOCAL_MODELS_DOWNLOAD_PATH=./models
```

### Model ID Format

- **Full format**: `username/repo:quantization` (e.g., `mradermacher/utopia-atomic-GGUF:Q2_K`)
- **Auto-detect**: `username/repo` (will download first matching `.gguf` file)

## Architecture

### Components

1.  **`src/utils/localModelManager.js`**: Singleton class managing model lifecycle
    - Downloads models from HuggingFace (`@huggingface/hub`)
    - Loads GGUF models via `node-llama-cpp`
    - Manages inference sessions
    - Implements Qwen→Utopia logit pipeline

2.  **MCP Tool: `local_inference`**: Exposed inference interface
    - Standard single-model inference
    - Pipeline mode for Qwen→Utopia reasoning cascade
    - Configurable generation parameters

3.  **Server Integration**: `src/server/mcpServer.js`
    - Auto-initialization on boot (async, non-blocking)
    - Graceful degradation if models fail to load

### Inference Modes

#### Standard Inference

Run a single model:

```javascript
// MCP tool call
{
  "name": "local_inference",
  "arguments": {
    "modelId": "mradermacher/utopia-atomic-GGUF:Q2_K",
    "prompt": "What is quantum computing?",
    "options": {
      "maxTokens": 512,
      "temperature": 0.7
    }
  }
}
```

#### Pipeline Mode (Qwen→Utopia)

Use Qwen for reasoning, feed output to Utopia for high-entropy analysis:

```javascript
// MCP tool call
{
  "name": "local_inference",
  "arguments": {
    "modelId": "auto", // Auto-selects from loaded models
    "prompt": "Analyze the semantic structure of this code",
    "pipeline": true,
    "options": {
      "maxTokens": 1024,
      "temperature": 0.3
    }
  }
}
```

## Logit Pipeline Details

The `runLogitPipeline` method implements a two-stage process:

1.  **Qwen Stage**: Generates reasoning trace
2.  **Utopia Stage**: Analyzes Qwen's output with high-entropy processing

**Current Implementation**: Sequential execution with reasoning injection  
**Future Enhancement**: True logit-level extraction and injection (pending `node-llama-cpp` API support)

## Performance Characteristics

- **Startup Time**: 5-30s per model (download + load)
- **Inference Latency**: ~100-500ms for 1B-4B models (CPU-dependent)
- **Memory**: ~2-8GB RAM per loaded model
- **Disk**: GGUF files cached permanently in `LOCAL_MODELS_DOWNLOAD_PATH`

## Scalability

- **Transport-Agnostic**: Works with STDIO, WebSocket, HTTP/SSE
- **Async-First**: Compatible with `async=true` job mode
- **Resource-Efficient**: Models loaded once, reused across requests
- **Horizontal Scaling**: Each server instance maintains its own model cache

## Usage Examples

### From Cursor/Claude Desktop (STDIO)

```json
{
  "mcpServers": {
    "openrouter-agents": {
      "command": "node",
      "args": ["src/server/mcpServer.js", "--stdio"],
      "env": {
        "LOCAL_MODELS_ENABLED": "true",
        "LOCAL_MODEL_IDS": "mradermacher/utopia-atomic-GGUF:Q2_K,mradermacher/Qwen3-4B-Thinking-2507-Esper3.1-i1-GGUF"
      }
    }
  }
}
```

### From WebSocket Client

```javascript
ws.send(JSON.stringify({
  jsonrpc: '2.0',
  method: 'tools/call',
  params: {
    name: 'local_inference',
    arguments: {
      modelId: 'mradermacher/utopia-atomic-GGUF:Q2_K',
      prompt: 'Your query here',
      pipeline: false
    }
  },
  id: Date.now()
}));
```

## Future Enhancements

1.  **True Logit Extraction**: Direct access to model logits via `node-llama-cpp` API extensions
2.  **Multi-Model Ensembles**: Parallel inference across multiple local models
3.  **Quantization Options**: Runtime selection of Q2_K, Q4_K, Q8_0, etc.
4.  **GPU Acceleration**: CUDA/Metal support via llama.cpp bindings
5.  **Model Hot-Swapping**: Dynamic model loading/unloading based on usage patterns

## Troubleshooting

### Models not loading

- Check `LOCAL_MODELS_ENABLED=true`
- Verify `LOCAL_MODEL_IDS` format
- Ensure sufficient disk space in `LOCAL_MODELS_DOWNLOAD_PATH`
- Check server logs for download/load errors

### Inference errors

- Verify models are listed in `get_server_status` output
- Check prompt length against model context window
- Adjust `options.maxTokens` if hitting limits

### Pipeline mode fails

- Requires 2+ models loaded
- At least one must match "qwen" (case-insensitive)
- At least one must match "utopia" (case-insensitive)

## Related Files

- `src/utils/localModelManager.js` - Core implementation
- `src/server/tools.js` - MCP tool definition
- `src/server/mcpServer.js` - Registration and initialization
- `config.js` - Configuration schema
- `env.example` - Environment variable template

