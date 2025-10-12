# Local Models Quickstart: First-Time User Guide

## 🎯 What This Does

Run quantized GGUF models (Qwen3-4B-Thinking, Utopia-Atomic) **directly on your MCP server** for:
- **Zero-cost inference** (no API calls)
- **Privacy-first** (data never leaves your machine)
- **Logit pipeline mode** (Qwen reasoning → Utopia synthesis)

## 🚀 5-Minute Setup

### 1. Install Dependencies

Already done if you ran `npm install`. Verify:
```bash
npm list node-llama-cpp @huggingface/hub
```

### 2. Configure Environment

Create or edit `.env` in project root:

```bash
# Enable local models
LOCAL_MODELS_ENABLED=true

# Specify models (comma-separated HuggingFace repo IDs)
LOCAL_MODEL_IDS=mradermacher/Qwen3-4B-Thinking-2507-Esper3.1-i1-GGUF,wheattoast11/utopia-atomic

# Where to cache downloaded models
LOCAL_MODELS_DOWNLOAD_PATH=./models
```

### 3. Start Server

Models auto-download on first boot (may take 2-5 minutes):

```bash
node bin/openrouter-agents-mcp.js
```

Watch for these log lines:
```
LocalModelManager: Initializing...
LocalModelManager: Downloading mradermacher/Qwen3-4B-Thinking-2507-Esper3.1-i1-GGUF...
LocalModelManager: Model loaded successfully.
Local models initialized: mradermacher/Qwen3-4B-Thinking-2507-Esper3.1-i1-GGUF, wheattoast11/utopia-atomic
```

## 📡 Using Local Inference

### Via MCP Tool (Direct)

**List Tools:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}
```

**Call `local_inference`:**

**Single Model:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "local_inference",
    "arguments": {
      "modelId": "wheattoast11/utopia-atomic",
      "prompt": "Explain emergence in complex systems.",
      "options": {
        "maxTokens": 100,
        "temperature": 0.7
      }
    }
  },
  "id": 2
}
```

**Pipeline Mode (Qwen→Utopia):**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "local_inference",
    "arguments": {
      "modelId": "wheattoast11/utopia-atomic",
      "prompt": "What are the key principles of agent-based modeling?",
      "pipeline": {
        "enabled": true,
        "reasoningModel": "mradermacher/Qwen3-4B-Thinking-2507-Esper3.1-i1-GGUF"
      },
      "options": {
        "maxTokens": 200,
        "temperature": 0.8
      }
    }
  },
  "id": 3
}
```

### Via Agent Tool (Natural Language)

The `agent` tool can automatically invoke `local_inference`:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "agent",
    "arguments": {
      "query": "Use local inference with the Qwen→Utopia pipeline to explain quantum entanglement",
      "mode": "auto"
    }
  },
  "id": 4
}
```

## 🧠 Model Architectures

### Utopia-Atomic (1B)
- **Architecture:** Gemma3 text (999.9M params)
- **Use Case:** Fast, compact reasoning/analysis
- **Quantization:** Supports Q2_K for ultra-low memory
- **Context:** ~2048 tokens (configurable)

### Qwen3-4B-Thinking-2507-Esper3.1 (4B)
- **Architecture:** Qwen3 AutoModel (4B params)
- **Training:** DeepSeek reasoning datasets (V3.1, V3.2, R1-0528)
- **Specialization:** Multi-domain reasoning, DevOps, code-instruct
- **Use Case:** Chain-of-thought reasoning, problem decomposition

### Pipeline Synergy
1. **Qwen** generates high-entropy reasoning trace (4B CoT)
2. **Utopia** consumes enriched context for compressed synthesis (1B finalization)
3. **Output:** Combined `{ qwenReasoning, utopiaAnalysis, combined }`

## 🔍 Verification

Run automated E2E test:
```bash
node test-local-inference-e2e.js
```

Expected output:
```
✓ MCP Client connected via STDIO
✓ local_inference tool is available
✓ Single-model inference completed
✓ Pipeline inference completed
✅ E2E Test Complete!
```

## 🛠️ Troubleshooting

### Models not loading?
Check logs for:
```
LocalModelManager: Local models disabled via config.
```
→ Ensure `LOCAL_MODELS_ENABLED=true` in `.env`

### Download fails?
- **Network:** HuggingFace Hub requires internet access
- **Disk Space:** Qwen3-4B GGUF ~2.5GB, Utopia-Atomic ~1GB
- **Permissions:** Ensure write access to `LOCAL_MODELS_DOWNLOAD_PATH`

### Inference errors?
Check model ID format:
```
# Correct
LOCAL_MODEL_IDS=mradermacher/Qwen3-4B-Thinking-2507-Esper3.1-i1-GGUF,wheattoast11/utopia-atomic

# Incorrect (missing repo owner)
LOCAL_MODEL_IDS=Qwen3-4B-Thinking,utopia-atomic
```

## 📊 Performance Expectations

| Model | Size | Tokens/sec (CPU) | Tokens/sec (GPU) | Memory |
|-------|------|------------------|------------------|--------|
| Utopia-Atomic Q2_K | ~400MB | 15-30 | N/A | ~600MB |
| Qwen3-4B-Esper Q4_K_M | ~2.5GB | 8-15 | N/A | ~4GB |

*Benchmarks on M1 Max (CPU) and AMD Ryzen 9 5900X. GPU support requires node-llama-cpp GPU build.*

## 🎓 Prompt Engineering Tips

### For Qwen3-Esper (Reasoning)
- **Explicit CoT:** "Think step-by-step about..."
- **Domain context:** "As a DevOps engineer, explain..."
- **Multi-step:** "First analyze X, then synthesize Y."

### For Utopia-Atomic (Synthesis)
- **Concise directives:** "Summarize in one paragraph:"
- **Constrained output:** "Provide exactly 3 key insights:"
- **Abstraction:** "Distill the essence of:"

### Pipeline Mode
- **Qwen prompt:** Focus on problem decomposition
- **Utopia receives:** Qwen's reasoning + original prompt
- **Result:** Best of both worlds (deep reasoning + concise output)

## 🔗 Integration Patterns

### With Embeddings
```javascript
// Index Qwen reasoning traces for retrieval
const { qwenReasoning } = await localInference({ modelId: 'qwen', prompt });
await index_texts({ texts: [qwenReasoning], metadata: { source: 'qwen-reasoning' } });
```

### With Knowledge Graph
```javascript
// Extract entities from Utopia analysis
const { utopiaAnalysis } = await localInference({ modelId: 'utopia', prompt });
// Parse entities and add to graph
```

### With Agent Workflows
```javascript
// Use local inference for quick local validation before expensive OpenRouter calls
const localCheck = await localInference({ modelId: 'utopia', prompt: 'Is this query answerable?' });
if (localCheck.text.includes('yes')) {
  // Proceed with full research via OpenRouter
}
```

## 🌟 Next Steps

1. **Experiment with quantization levels** (Q2_K vs Q4_K_M vs Q8_0)
2. **Tune context size** in `localModelManager.js` (line 94)
3. **Implement true logit extraction** (TODO in `runLogitPipeline()`)
4. **Add more models** to `LOCAL_MODEL_IDS`

---

**Questions?** See [LOCAL-MODELS-INTEGRATION.md](../LOCAL-MODELS-INTEGRATION.md) for implementation details.


