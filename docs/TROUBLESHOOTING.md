# Troubleshooting Guide

Common issues and how to fix them.

## Quick Diagnosis

```bash
# Check everything at once
zero status
```

This shows:
- API key status
- Database health
- Embedder status
- Recent job counts

## Command Failures

### "API key invalid" or "Authentication failed"

**Cause**: Missing or invalid OpenRouter API key

**Fix**:
```bash
# Re-run setup
zero init

# Or set directly
zero config set OPENROUTER_API_KEY your-key-here
```

### "Database locked"

**Cause**: Another Zero process is using the database

**Fix**:
```bash
# Find running processes
ps aux | grep zero

# Kill if needed
pkill -f "zero"

# Then retry your command
```

### "Report not found"

**Cause**: Invalid report ID or report was deleted

**Fix**:
```bash
# List available reports
zero search ""

# Or check database
zero query "SELECT id, query FROM research_reports ORDER BY created_at DESC LIMIT 10"
```

### "Job not found" or "Job expired"

**Cause**: Async jobs expire after 1 hour

**Fix**:
- Re-run the research query
- Use sync mode: `zero research "topic" --sync`

### "Embedder not ready"

**Cause**: Embedding model still loading (takes ~10 seconds on first run)

**Fix**:
```bash
# Wait and check status
zero status

# The embedder field should show "ready: true"
```

### "No result" from research

**Cause**: API returned empty response

**Fix**:
1. Check API key is valid
2. Try with `--cost high` for better models
3. Check OpenRouter dashboard for quota

## Extension Issues

### Extension shows "Connecting..." forever

**Cause**: Background service worker hasn't initialized

**Fix**:
1. Reload the extension (chrome://extensions)
2. Click the extension icon
3. Click "Test Connection"

### Buttons don't respond

**Cause**: Content script not injected

**Fix**:
1. Refresh the page
2. Check extension has permission for this site
3. Some pages (chrome://, about:) can't run extensions

### "Analyze Page" fails

**Cause**: Page has strict CSP blocking content scripts

**Fix**:
- Try on a different page
- This is expected on some secure sites

## Server Issues

### STDIO mode: "Unexpected token"

**Cause**: Non-JSON output mixed with STDIO

**Fix**:
```bash
# Suppress logs
LOG_LEVEL=error zero --stdio
```

### HTTP mode: "Port already in use"

**Cause**: Another process on port 3002

**Fix**:
```bash
# Find what's using the port
lsof -i :3002

# Use different port
zero --port 3003
```

### "ENOENT: no such file or directory"

**Cause**: Data directory doesn't exist or wrong permissions

**Fix**:
```bash
# Re-run init to recreate
zero init

# Or create manually
mkdir -p ~/.local/share/zero
```

## Performance Issues

### Research is slow

**Possible causes**:
1. Using high-cost models (slower but better)
2. Network latency to OpenRouter
3. Large query complexity

**Fix**:
```bash
# Use low-cost models
zero research "topic" --cost low

# Or check network
curl -s https://openrouter.ai/api/v1/models | head
```

### Database operations slow

**Cause**: Database needs vacuuming or large index

**Fix**:
```bash
# Check database size
ls -lh ~/.local/share/zero/

# Rebuild if needed (loses data)
rm -rf ~/.local/share/zero/
zero init
```

## Data Issues

### Wrong data directory

**Fix**:
```bash
# Check current
zero config get DATA_DIR

# Set correct one
zero config set DATA_DIR /correct/path
```

### Corrupted database

**Symptoms**: Cryptic SQL errors

**Fix**:
```bash
# Backup existing (if recoverable)
cp -r ~/.local/share/zero ~/.local/share/zero.bak

# Reinitialize
rm -rf ~/.local/share/zero
zero init
```

## Common Error Messages

| Error | Cause | Quick Fix |
|-------|-------|-----------|
| `API key invalid` | Bad/missing key | `zero init` |
| `Database locked` | Multiple processes | `pkill -f zero` |
| `Report not found` | Invalid ID | `zero search ""` |
| `Job expired` | Async job timeout | Re-run query |
| `Embedder not ready` | Still loading | Wait 10 seconds |
| `Port in use` | Another server | `--port 3003` |
| `ENOENT` | Missing directory | `zero init` |

## Getting Help

### Enable debug logging
```bash
LOG_LEVEL=debug zero <command>
```

### Check version
```bash
zero version
```

### Report an issue
1. Capture the error with debug logging
2. Note your Node.js version: `node --version`
3. Open issue at: https://github.com/terminals-tech/openrouter-agents/issues

### Join community
- Discord: [Coming soon]
- Discussions: https://github.com/terminals-tech/openrouter-agents/discussions

---

**See also**: [COMMAND-COOKBOOK.md](./COMMAND-COOKBOOK.md) | [GETTING-STARTED.md](./GETTING-STARTED.md)
