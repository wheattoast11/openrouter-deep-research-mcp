FROM node:20-alpine AS base

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source after dependencies to leverage Docker layer caching
COPY . .

# Sensible runtime defaults (override via environment at deploy time)
ENV NODE_ENV=production \
    MODE=AGENT \
    ZERO_ORCHESTRATOR=true \
    ASYNC_JOBS=true \
    WS_STREAMING_ENABLED=true

# The MCP server listens on 3000 by default
EXPOSE 3000

CMD ["npm", "start"]