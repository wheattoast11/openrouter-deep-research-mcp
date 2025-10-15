# Terminals.tech Subdomain Deployment Guide

## Overview

Deploy OpenRouter Agents MCP Server to a `terminals.tech` subdomain for production hosting.

**Target subdomain:** `mcp.terminals.tech` or `agents.terminals.tech`

---

## Prerequisites

1. **DNS Access**: Access to terminals.tech DNS management (Cloudflare, Route53, etc.)
2. **Server**: VPS or cloud instance with public IP
3. **SSL Certificate**: Let's Encrypt or Cloudflare SSL
4. **Domain**: terminals.tech ownership confirmed

---

## Deployment Steps

### 1. DNS Configuration

**Option A: Direct A Record**
```
Type: A
Host: mcp
Value: <SERVER_IP>
TTL: 300
```

**Option B: CNAME (if using CDN)**
```
Type: CNAME
Host: mcp
Value: <CDN_ENDPOINT>
TTL: 300
```

**Verify DNS:**
```bash
nslookup mcp.terminals.tech
# Should return your server IP
```

### 2. Server Setup

**Install Dependencies:**
```bash
# On Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx

# Clone repo
git clone https://github.com/terminals-tech/openrouter-agents.git
cd openrouter-agents
npm install --production
```

**Configure Environment:**
```bash
# Create production .env
cp config-templates/production-stable.env .env

# Edit with your values
nano .env
```

**Required .env variables:**
```bash
# Server
SERVER_PORT=3009
PUBLIC_URL=https://mcp.terminals.tech
BIND_ADDRESS=127.0.0.1

# Auth (terminals.tech OAuth)
AUTH_JWKS_URL=https://auth.terminals.tech/.well-known/jwks.json
AUTH_EXPECTED_AUD=mcp-server
AUTH_ISSUER_URL=https://auth.terminals.tech

# API Keys
OPENROUTER_API_KEY=sk-or-v1-...
GOOGLE_API_KEY=AIza...

# Features
BETA_FEATURES=false
MODE=AGENT
LOCAL_INFERENCE_ENABLED=true
```

### 3. SSL Certificate

**Using Let's Encrypt:**
```bash
sudo certbot --nginx -d mcp.terminals.tech
```

**Using Cloudflare:**
- Enable "Full (strict)" SSL mode
- Use Cloudflare Origin Certificate
- Install certificate on server

### 4. Nginx Reverse Proxy

**Config:** `/etc/nginx/sites-available/mcp.terminals.tech`

```nginx
# HTTP → HTTPS redirect
server {
    listen 80;
    server_name mcp.terminals.tech;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name mcp.terminals.tech;

    ssl_certificate /etc/letsencrypt/live/mcp.terminals.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.terminals.tech/privkey.pem;

    # SSL security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # WebSocket support
    location /mcp/ws {
        proxy_pass http://127.0.0.1:3009;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeouts
        proxy_read_timeout 86400;
        proxy_connect_timeout 60;
        proxy_send_timeout 60;
    }

    # MCP HTTP/SSE endpoints
    location /mcp {
        proxy_pass http://127.0.0.1:3009;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE specific
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }

    # Well-known endpoints
    location /.well-known/ {
        proxy_pass http://127.0.0.1:3009;
        proxy_set_header Host $host;
    }

    # Client UI
    location / {
        proxy_pass http://127.0.0.1:3009;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/mcp.terminals.tech /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. PM2 Process Management

```bash
# Install PM2
npm install -g pm2

# Start server
pm2 start src/server/mcpServer.js --name openrouter-agents -- --env production

# Auto-restart on reboot
pm2 startup
pm2 save

# Monitor
pm2 logs openrouter-agents
pm2 monit
```

### 6. Firewall

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## Testing Deployment

### 1. Health Check
```bash
curl https://mcp.terminals.tech/.well-known/mcp-server
```

**Expected response:**
```json
{
  "version": "2025-06-18",
  "name": "openrouter_agents",
  "description": "OpenRouter MCP server for research agents",
  "capabilities": {
    "tools": true,
    "prompts": true,
    "resources": true
  }
}
```

### 2. WebSocket Connection
```javascript
const ws = new WebSocket('wss://mcp.terminals.tech/mcp/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    id: 1
  }));
};

ws.onmessage = (event) => {
  console.log(JSON.parse(event.data));
};
```

### 3. MCP Client Integration

**In Claude Desktop config** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "terminals-research-agents": {
      "url": "https://mcp.terminals.tech/mcp",
      "transport": "sse",
      "auth": {
        "type": "bearer",
        "token": "${env:TERMINALS_MCP_TOKEN}"
      }
    }
  }
}
```

**In Cursor settings** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "terminals-agents": {
      "url": "wss://mcp.terminals.tech/mcp/ws",
      "transport": "websocket",
      "headers": {
        "Authorization": "Bearer ${env:TERMINALS_MCP_TOKEN}"
      }
    }
  }
}
```

---

## Monitoring & Maintenance

### 1. Logs
```bash
# Server logs
pm2 logs openrouter-agents --lines 100

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# System logs
journalctl -u nginx -f
```

### 2. Database Backups
```bash
# Automated daily backups
crontab -e

# Add:
0 2 * * * cd /path/to/openrouter-agents && npm run backup
```

### 3. Health Monitoring
```bash
# Set up uptime monitor (e.g., UptimeRobot)
https://mcp.terminals.tech/.well-known/mcp-server

# Or use simple cron healthcheck
*/5 * * * * curl -f https://mcp.terminals.tech/.well-known/mcp-server || /usr/local/bin/restart-mcp.sh
```

### 4. Auto-Updates
```bash
# Update script
#!/bin/bash
cd /path/to/openrouter-agents
git pull origin beta
npm install --production
pm2 restart openrouter-agents
```

---

## Security Hardening

### 1. OAuth 2.1 Setup

Ensure `AUTH_JWKS_URL` points to your terminals.tech identity provider:
```bash
https://auth.terminals.tech/.well-known/jwks.json
```

### 2. Rate Limiting

Already configured in `config.js`:
```javascript
rateLimit: {
  windowMs: 60000,
  max: 100
}
```

Consider adding Nginx rate limiting:
```nginx
limit_req_zone $binary_remote_addr zone=mcp_limit:10m rate=10r/s;

location /mcp {
    limit_req zone=mcp_limit burst=20 nodelay;
    # ... rest of config
}
```

### 3. CORS

Update `.env`:
```bash
ALLOWED_ORIGINS=https://mcp.terminals.tech,https://terminals.tech
```

---

## Cloudflare Integration (Recommended)

If using Cloudflare for DNS:

1. **Add DNS Record** (via Cloudflare dashboard):
   - Type: A
   - Name: mcp
   - IPv4: <SERVER_IP>
   - Proxy status: Proxied (orange cloud)

2. **SSL/TLS Settings**:
   - Mode: Full (strict)
   - Min TLS version: 1.2
   - Always Use HTTPS: ON

3. **Page Rules**:
   ```
   mcp.terminals.tech/mcp/ws*
   - Cache Level: Bypass
   - WebSockets: On
   ```

4. **Firewall Rules**:
   - Block known bots
   - Challenge on threat score > 14
   - Allow MCP client user-agents

---

## Cost Estimate

- **VPS:** $5-20/month (DigitalOcean, Linode, Hetzner)
- **Domain:** Included (already own terminals.tech)
- **SSL:** Free (Let's Encrypt or Cloudflare)
- **CDN:** Free (Cloudflare)
- **Total:** ~$5-20/month

---

## Scalability

### Horizontal Scaling (Multiple Servers)

1. **Load Balancer**: Nginx or Cloudflare Load Balancing
2. **Shared Database**: PGlite → PostgreSQL (RDS, Supabase)
3. **Redis**: For session state (if needed)
4. **S3**: For model weights, research reports

### Vertical Scaling (Single Server)

- Start: 2 vCPU, 4GB RAM
- Growth: 4 vCPU, 8GB RAM
- Max: 8 vCPU, 16GB RAM

---

## Troubleshooting

### WebSocket Connection Fails
```bash
# Check Nginx config
sudo nginx -t

# Check if WebSocket upgrade working
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" https://mcp.terminals.tech/mcp/ws
```

### Database Locked
```bash
# Check PGlite locks
cd researchAgentDB
ls -la

# If stuck, restart server
pm2 restart openrouter-agents
```

### High Memory Usage
```bash
# Check memory
free -h

# Reduce parallelism in .env
JOBS_CONCURRENCY=1
PARALLELISM=2
```

---

## Quick Deploy Script

```bash
#!/bin/bash
# deploy-terminals-tech.sh

set -e

echo "🚀 Deploying OpenRouter Agents to terminals.tech..."

# Pull latest
git pull origin beta

# Install deps
npm install --production

# Run migrations (if any)
# npm run migrate

# Restart service
pm2 restart openrouter-agents || pm2 start src/server/mcpServer.js --name openrouter-agents

# Check health
sleep 5
curl -f https://mcp.terminals.tech/.well-known/mcp-server && echo "✅ Deployment successful" || echo "❌ Health check failed"
```

---

**Status:** Ready for deployment to `mcp.terminals.tech`  
**Estimated time:** 30-60 minutes for first setup  
**Maintenance:** Minimal (~1 hour/month for updates)

