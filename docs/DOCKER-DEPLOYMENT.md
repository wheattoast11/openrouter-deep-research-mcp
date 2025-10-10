# Docker Deployment Guide: OpenRouter Agents v2.1.1-beta

This guide provides complete instructions for deploying the OpenRouter Agents MCP server using Docker, including production-ready configurations and best practices.

## Quick Start

### Pull and Run Beta Image

```bash
# Pull the latest beta image
docker pull terminals/openrouter-agents:2.1.1-beta

# Run with basic configuration
docker run -d \
  --name openrouter-agents \
  -p 3000:3000 \
  -e OPENROUTER_API_KEY=your_openrouter_key \
  -e MODE=AGENT \
  -e BETA_FEATURES=true \
  terminals/openrouter-agents:2.1.1-beta
```

### Verify Deployment

```bash
# Check if container is running
docker ps | grep openrouter-agents

# Test the API
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer your_server_key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"ping","arguments":{}},"id":1}'
```

## Docker Compose Template

For production deployments, use docker-compose.yml for orchestrated services.

```yaml
# docker-compose.yml
version: '3.8'

services:
  openrouter-agents:
    image: terminals/openrouter-agents:2.1.1-beta
    container_name: openrouter-agents
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # Required API keys
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - SERVER_API_KEY=${SERVER_API_KEY}

      # Mode and features
      - MODE=AGENT
      - BETA_FEATURES=true
      - PLL_ENABLE=true
      - COMPRESSION_ENABLE=true

      # Performance tuning
      - PARALLELISM=4
      - ENSEMBLE_SIZE=2
      - PLL_MAX_CONCURRENCY=6

      # Storage
      - PGLITE_DATA_DIR=/data/researchAgentDB
      - REPORT_OUTPUT_PATH=/data/research_outputs

      # Security
      - REQUIRE_HTTPS=false  # Set to true in production
      - RATE_LIMIT_MAX_REQUESTS=1000

    volumes:
      - agent_data:/data/researchAgentDB
      - agent_reports:/data/research_outputs

    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/about"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

volumes:
  agent_data:
  agent_reports:
```

### Deploy with Docker Compose

1. **Create Environment File**:
   ```bash
   # .env
   OPENROUTER_API_KEY=your_openrouter_key
   SERVER_API_KEY=your_server_secret
   ```

2. **Start Services**:
   ```bash
   docker-compose up -d
   ```

3. **Check Logs**:
   ```bash
   docker-compose logs -f openrouter-agents
   ```

4. **Scale** (if needed):
   ```bash
   docker-compose up -d --scale openrouter-agents=2
   ```

## Production Considerations

### Image Security

1. **Scan for Vulnerabilities**:
   ```bash
   # Using Trivy
   docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
     aquasecurity/trivy:latest image terminals/openrouter-agents:2.1.1-beta

   # Using Docker Scout
   docker scout cves terminals/openrouter-agents:2.1.1-beta
   ```

2. **Use Specific Tags**:
   ```bash
   docker pull terminals/openrouter-agents:2.1.1-beta
   # Never use 'latest' in production
   ```

### Resource Management

1. **Memory Limits**:
   - Base: 256MB reserved, 512MB limit
   - Scale up for heavy usage: 512MB reserved, 1GB limit

2. **CPU Limits**:
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '1.0'
   ```

3. **Health Checks**:
   - Monitor `/about` endpoint
   - Restart on failure
   - Graceful shutdown on SIGTERM

### Storage and Persistence

1. **Data Directory**:
   ```yaml
   volumes:
     - ./data/researchAgentDB:/app/researchAgentDB
     - ./data/research_outputs:/app/research_outputs
   ```

2. **Backup Strategy**:
   ```bash
   # Backup PGlite database
   docker exec openrouter-agents \
     node -e "const { backupDb } = require('./src/server/tools'); backupDb({ destinationDir: '/backup' }).then(console.log);"
   ```

3. **Data Retention**:
   - Implement periodic cleanup of old reports
   - Monitor disk usage

### Networking

1. **Internal Networking**:
   ```yaml
   networks:
     - agent-network

   networks:
     agent-network:
       driver: bridge
   ```

2. **Service Discovery**:
   ```yaml
   services:
     platform:
       image: your-platform-image
       depends_on:
         - openrouter-agents
       environment:
         - MCP_SERVER_URL=http://openrouter-agents:3000
   ```

### Security

1. **API Key Management**:
   ```yaml
   environment:
     - OPENROUTER_API_KEY_FILE=/run/secrets/openrouter_key
     - SERVER_API_KEY_FILE=/run/secrets/server_key

   secrets:
     openrouter_key:
       external: true
     server_key:
       external: true
   ```

2. **Network Isolation**:
   ```yaml
   networks:
     - agent-internal

   networks:
     agent-internal:
       internal: true
   ```

3. **HTTPS in Production**:
   ```yaml
   environment:
     - REQUIRE_HTTPS=true
     - SSL_CERT_PATH=/ssl/cert.pem
     - SSL_KEY_PATH=/ssl/key.pem

   volumes:
     - ./ssl:/ssl:ro
   ```

## Scaling Strategies

### Horizontal Scaling

1. **Multiple Instances**:
   ```yaml
   services:
     openrouter-agents:
       deploy:
         replicas: 3
   ```

2. **Load Balancing**:
   ```yaml
   services:
     load-balancer:
       image: nginx:alpine
       ports:
         - "3000:3000"
       volumes:
         - ./nginx.conf:/etc/nginx/nginx.conf
   ```

### Vertical Scaling

1. **Resource Allocation**:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 2G
         cpus: '2.0'
   ```

2. **Database Optimization**:
   - Use external PostgreSQL for heavy loads
   - Implement connection pooling

## Monitoring and Observability

### Health Checks

1. **Application Health**:
   ```yaml
   healthcheck:
     test: ["CMD", "curl", "-f", "http://localhost:3000/about"]
     interval: 30s
     timeout: 10s
     retries: 3
   ```

2. **Custom Health Script**:
   ```bash
   #!/bin/bash
   curl -f http://localhost:3000/metrics | grep -q "embedder_ready 1"
   ```

### Metrics Collection

1. **Prometheus Metrics**:
   ```yaml
   environment:
     - METRICS_ENABLED=true

   # Scrape endpoint
   curl http://localhost:3000/metrics
   ```

2. **Logging**:
   ```yaml
   logging:
     driver: "json-file"
     options:
       max-size: "10m"
       max-file: "5"
   ```

### Alerting

1. **Set Up Alerts**:
   - High error rate (>5% of requests)
   - High latency (>1s for 95th percentile)
   - Low embedder readiness (<99%)

## Troubleshooting

### Common Issues

1. **Container Won't Start**:
   ```bash
   docker logs openrouter-agents
   ```
   Check for:
   - Missing environment variables
   - Port conflicts
   - Insufficient memory

2. **API Errors**:
   - Verify OPENROUTER_API_KEY is set
   - Check OpenRouter account has credits
   - Review rate limits

3. **Performance Issues**:
   ```bash
   docker stats openrouter-agents
   ```
   Monitor CPU/memory usage.

4. **Storage Issues**:
   ```bash
   docker exec openrouter-agents df -h
   ```
   Check disk space.

### Debug Mode

Enable detailed logging:

```yaml
environment:
  - DEBUG_MODE=true
  - LOG_LEVEL=debug
```

### Logs Analysis

```bash
# View recent logs
docker logs --tail 100 openrouter-agents

# Follow logs
docker logs -f openrouter-agents

# Export logs
docker logs openrouter-agents > logs.txt
```

## Production Checklist

- [ ] Image scanned for vulnerabilities
- [ ] Environment variables secured (no plaintext keys)
- [ ] Health checks implemented
- [ ] Resource limits set
- [ ] Logging configured
- [ ] Backup strategy in place
- [ ] Network security configured
- [ ] Load testing completed
- [ ] Monitoring and alerting set up
- [ ] Documentation updated for team

## Example: Full Production Stack

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  openrouter-agents:
    image: terminals/openrouter-agents:2.1.1-beta
    restart: always
    ports:
      - "127.0.0.1:3000:3000"  # Bind to localhost only
    environment:
      - OPENROUTER_API_KEY_FILE=/run/secrets/openrouter_key
      - SERVER_API_KEY_FILE=/run/secrets/server_key
      - MODE=AGENT
      - BETA_FEATURES=true
      - REQUIRE_HTTPS=true
      - LOG_LEVEL=warn
    secrets:
      - openrouter_key
      - server_key
    volumes:
      - agent_data:/app/researchAgentDB
      - agent_reports:/app/research_outputs
    healthcheck:
      test: ["CMD", "curl", "-f", "https://localhost:3000/about"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'

secrets:
  openrouter_key:
    external: true
  server_key:
    external: true

volumes:
  agent_data:
  agent_reports:
```

This deployment guide ensures reliable, secure, and scalable operation of the OpenRouter Agents MCP server in production environments.

