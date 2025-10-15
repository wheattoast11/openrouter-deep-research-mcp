# 🔑 Environment Configuration - Quick Setup Guide

**Version**: 2.2.0  
**Last Updated**: October 14, 2025  
**Status**: ✅ Production Ready

---

## 📋 Quick Copy-Paste Setup

### Option 1: Public Agent (Default)

```bash
# Core Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# OpenRouter API
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Database
DB_PATH=./researchAgentDB

# Embeddings (Gemini)
GEMINI_API_KEY=your_gemini_api_key_here

# Experimental Features
HYPER_MODE=false
PRIVATE_AGENT=0
```

💾 **Save as**: `.env` in project root

---

### Option 2: Private Agent (Experimental)

```bash
# Core Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# OpenRouter API
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Database
DB_PATH=./researchAgentDB

# Embeddings (Gemini)
GEMINI_API_KEY=your_gemini_api_key_here

# ============================================================================
# 🧪 PRIVATE AGENT (Experimental Features)
# ============================================================================
PRIVATE_AGENT=1
PRIVATE_PUBLISH=0
PRIVATE_REMOTE_URL=

# Deterministic Replay (Optional)
VITE_DETERMINISTIC_SEED=42

# Trace Encryption (Optional)
PRIVATE_TRACES_ENCRYPTION_KEY=

# Model Profiles (Optional)
VITE_LOCAL_MODEL_CDN=https://cdn.example.com/models/

# Browser Inference (Optional)
VITE_ENABLE_LOCAL_INFERENCE=1
VITE_ENABLE_BROWSER_INFERENCE=1

# Experimental Modes
HYPER_MODE=false
```

💾 **Save as**: `.env.private` in project root (already gitignored)

---

## 🔐 Secrets Manager Setup

### 🟢 Vercel

1. Go to: **Project Settings** → **Environment Variables**
2. Add each variable from above
3. Click **Save**

🔗 [Vercel Env Docs](https://vercel.com/docs/concepts/projects/environment-variables) - One-click setup, paste entire `.env` block

---

### 🟠 Railway

1. Go to: **Project** → **Variables**  
2. Click **+ New Variable**  
3. Paste entire `.env` block  
4. Click **Add**

🔗 [Railway Env Docs](https://docs.railway.app/develop/variables) - Bulk import supported

---

### 🔵 Render

1. Go to: **Dashboard** → **Environment**  
2. Click **Add Environment Variable**  
3. Add each variable individually  
4. Click **Save Changes**

🔗 [Render Env Docs](https://render.com/docs/configure-environment-variables) - Manual entry per variable

---

### 🟣 Netlify

1. Go to: **Site Settings** → **Environment Variables**  
2. Click **Add a variable**  
3. Paste entire `.env` block or add individually  
4. Click **Save**

🔗 [Netlify Env Docs](https://docs.netlify.com/environment-variables/overview/) - Bulk import via UI

---

### 🟡 AWS (Secrets Manager)

```bash
# Option 1: AWS Console
1. Open Secrets Manager
2. Store a new secret → Other type
3. Add key-value pairs from .env
4. Name: openrouter-agents/production

# Option 2: AWS CLI
aws secretsmanager create-secret \
  --name openrouter-agents/production \
  --secret-string file://.env
```

🔗 [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/) - JSON or key-value storage

---

### 🔴 Google Cloud (Secret Manager)

```bash
# Install gcloud CLI, then:
cat .env | while IFS='=' read -r key value; do
  echo "$value" | gcloud secrets create "$key" --data-file=-
done
```

🔗 [GCP Secret Manager](https://cloud.google.com/secret-manager) - Individual secrets per variable

---

### 🟤 Azure (Key Vault)

```bash
# Install Azure CLI, then:
cat .env | while IFS='=' read -r key value; do
  az keyvault secret set \
    --vault-name openrouter-agents-kv \
    --name "${key//_/-}" \
    --value "$value"
done
```

🔗 [Azure Key Vault](https://azure.microsoft.com/en-us/products/key-vault) - Automatic sync to App Service

---

## 📝 Variable Reference

### Core (Required)

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | - | **Required** - Get from [openrouter.ai](https://openrouter.ai) |
| `GEMINI_API_KEY` | - | **Required** - Get from [aistudio.google.com/apikey](https://aistudio.google.com/app/apikey) |
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |

### Optional (Recommended)

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Logging verbosity (debug/info/warn/error) |
| `DB_PATH` | `./researchAgentDB` | PGlite database path |
| `HYPER_MODE` | `false` | Enable experimental hyper mode |

### Private Agent (Experimental)

| Variable | Default | Description |
|----------|---------|-------------|
| `PRIVATE_AGENT` | `0` | Enable experimental features (0/1) |
| `VITE_DETERMINISTIC_SEED` | `0` | Seed for reproducible inference (0=random) |
| `PRIVATE_TRACES_ENCRYPTION_KEY` | - | 64-char hex key for trace encryption |

---

## 🎯 Quick Start

```bash
# 1. Copy template
cp env.example .env

# 2. Edit with your keys
nano .env  # or vim, code, etc.

# 3. Verify setup
cat .env | grep -E "API_KEY"

# 4. Start server
npm run server

# 5. Test
npm test
```

---

## 🔍 Troubleshooting

| Error | Solution |
|-------|----------|
| `OPENROUTER_API_KEY is required` | Add key to `.env` |
| `EACCES: permission denied` | Run `chmod 755 researchAgentDB` |
| `Embedding model not found` | Verify Gemini API key is valid |
| `Private agent not working` | Set `PRIVATE_AGENT=1` in `.env.private` |

---

## 📚 Related Docs

- [Configuration Guide](./CONFIGURATION.md)
- [Private Agent Setup](../.env.private.example)
- [Phase Lock Complete](../PHASE-LOCK-COMPLETE-OCT-14-2025.md)
- [Algebraic Tag System](./ALGEBRAIC-TAG-SYSTEM-REFERENCE.md)

---

**Status**: ✅ Production Ready  
**Version**: 2.2.0  
**Last Validated**: October 14, 2025

