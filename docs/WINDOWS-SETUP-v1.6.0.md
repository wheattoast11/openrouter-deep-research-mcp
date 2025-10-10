# Windows Setup Guide

**Recommended Configuration for Windows**: Use Gemini embeddings (cloud-based, no native dependencies)

## Quick Start

### Prerequisites
- **Node.js**: v18+ (v20 LTS recommended)
- **PowerShell** or **Command Prompt**
- **OpenRouter API Key** ([get one here](https://openrouter.ai/keys))
- **Google Gemini API Key** (for embeddings, [get here](https://makersuite.google.com/app/apikey))

### Installation

```powershell
# Clone repository
git clone https://github.com/wheattoast11/openrouter-deep-research.git
cd openrouter-deep-research

# Install dependencies
npm install

# Configure environment
copy .env.example .env
# Edit .env with your API keys (see configuration below)
```

### Configuration (.env)

**Minimal Required Setup (Windows-optimized)**:
```env
# OpenRouter (required for research)
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Gemini Embeddings (recommended for Windows)
EMBEDDINGS_PROVIDER=gemini
EMBEDDINGS_MODEL=gemini-embedding-001
EMBEDDINGS_DIMENSION=768
GOOGLE_API_KEY=your-gemini-key-here

# Disable local embeddings fallback (Windows compatibility)
EMBEDDINGS_FALLBACK_LOCAL=false

# Server Config
MODE=AGENT
SERVER_PORT=3002
```

**Explanation**:
- **EMBEDDINGS_PROVIDER=gemini**: Uses cloud-based Gemini embeddings (no local dependencies, no sharp issues)
- **EMBEDDINGS_FALLBACK_LOCAL=false**: Prevents attempting HuggingFace local embeddings which fail on Windows
- **MODE=AGENT**: Single-tool interface (simplest for most users)

### Start the Server

```powershell
# STDIO mode (for MCP clients like Claude Desktop)
npm run stdio

# HTTP/SSE mode (for web clients or testing)
npm start
```

## Windows-Specific Issues & Solutions

### Issue 1: Sharp Module Error

**Symptom**:
```
Error: Could not load the "sharp" module using the win32-x64 runtime
```

**Solution**: Use Gemini embeddings instead of local HuggingFace:
```env
EMBEDDINGS_PROVIDER=gemini
EMBEDDINGS_FALLBACK_LOCAL=false
GOOGLE_API_KEY=your-key
```

**Why**: The `@huggingface/transformers` package requires `sharp` (a native image processing library) which doesn't build reliably on Windows. Gemini embeddings are cloud-based and work perfectly on Windows.

---

### Issue 2: PGlite Permission Errors

**Symptom**:
```
EACCES: permission denied, mkdir '.\researchAgentDB'
```

**Solution**: Run terminal as Administrator or use a different data directory:
```env
PGLITE_DATA_DIR=C:\Users\YourUsername\AppData\Local\openrouter-agents
```

---

### Issue 3: Long Path Names

**Symptom**:
```
ENAMETOOLONG: name too long
```

**Solution**: Enable long paths in Windows:
```powershell
# Run as Administrator
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

---

## MODE Configuration

v1.6.0 introduces **MODE** to control tool exposure:

### Mode: AGENT (Recommended)
```env
MODE=AGENT
```
**Tools**: `agent`, `ping`, `get_server_status`, `job_status`, `cancel_job`, `list_tools`, `search_tools`

**Use when**: You want a single, intelligent tool that routes to research/retrieval automatically.

---

### Mode: MANUAL
```env
MODE=MANUAL
```
**Tools**: All individual tools exposed (`research`, `conduct_research`, `retrieve`, `search`, `query`, `get_report`, etc.)

**Use when**: You want fine-grained control over each operation.

---

### Mode: ALL
```env
MODE=ALL
```
**Tools**: Every available tool exposed (agent + manual + experimental).

**Use when**: Development, testing, or maximum flexibility.

---

##Testing on Windows

### Quick Smoke Test
```powershell
node scripts/smoke-test.js
```

**Expected Output**:
```
✅ Tools module loaded
✅ DbClient module loaded
✅ Security module loaded
✅ Server version correct: 1.6.0
✅ Enhanced status fields present
✅ Ping tool works
```

### Production Validation
```powershell
npm run validate:production
```

**Expected Output**:
```
33/33 checks passed
```

---

## Troubleshooting

### "Module not found" errors
```powershell
# Clean install
Remove-Item node_modules -Recurse -Force
Remove-Item package-lock.json -Force
npm install
```

### Database errors
```powershell
# Reset database (WARNING: deletes all data)
Remove-Item researchAgentDB -Recurse -Force
npm start
```

### Port already in use
```env
# Change port in .env
SERVER_PORT=3003
```

---

## Performance Tips

1. **SSD Storage**: Store `researchAgentDB` on SSD for faster vector search
2. **Disable Windows Defender**: Add project folder to exclusions (speeds up node_modules access)
3. **Use Windows Terminal**: Better performance than CMD/PowerShell 5

---

## Integration with MCP Clients

### Claude Desktop (Windows)

1. Edit `%APPDATA%\Claude\claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "openrouter-agents": {
      "command": "node",
      "args": [
        "C:\\path\\to\\openrouter-deep-research\\src\\server\\mcpServer.js",
        "--stdio"
      ],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-v1-your-key",
        "GOOGLE_API_KEY": "your-gemini-key",
        "EMBEDDINGS_PROVIDER": "gemini",
        "EMBEDDINGS_FALLBACK_LOCAL": "false",
        "MODE": "AGENT"
      }
    }
  }
}
```

2. Restart Claude Desktop

3. Test with: "Use the agent tool to research quantum computing"

---

## Getting Help

- **Documentation**: See `README.md`, `CLAUDE.md`, `docs/`
- **Issues**: GitHub Issues
- **Email**: admin@terminals.tech

---

**Last Updated**: 2025-10-07 (v1.6.0)  
**Platform**: Windows 10/11, Node v18+
