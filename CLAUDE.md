# OpenRouter Agents: Guidance for AI Agents (v2.1)

This document provides technical guidance for AI agents interacting with the `openrouter-agents` codebase.

**LAST VALIDATED**: October 7, 2025
**VERSION**: 2.1.0

## 🚀 Core Architecture (v2.1)

The server has been refactored to a fully stateless, asynchronous, and agentic architecture.

-   **Stateless by Default**: All state (jobs, caches, sessions) is persisted in the PGlite database. Server instances are ephemeral and scalable.
-   **Asynchronous Operations**: The primary `agent` tool is asynchronous. It returns a `job_id` immediately, and results are streamed back over a WebSocket connection.
-   **Bidirectional Communication**: The primary transport is now WebSocket (`/mcp/ws`), enabling real-time, conversational interaction.
-   **Unified Agent Tool**: The `agent` tool is the single entry point for all research, retrieval, and follow-up tasks. Manual tools are deprecated.
-   **`@terminals-tech` Ecosystem**: The server is now standardized on the `@terminals-tech` ecosystem for core functionalities:
    -   `@terminals-tech/core`: For deterministic concurrency (`BoundedExecutor`).
    -   `@terminals-tech/embeddings`: For a single, standardized embedding provider (`gemini-embedding-001`).
    -   `@terminals-tech/graph`: For knowledge graph integration, sharing the main PGlite database.

## 🔑 Key File Locations

-   **`src/server/mcpServer.js`**: Main server entry point. Defines Express routes, middleware (including rate limiting and authentication), and WebSocket setup.
-   **`src/server/wsTransport.js`**: WebSocket transport layer. Handles real-time message passing and job monitoring.
-   **`src/server/tools.js`**: Defines the unified `agent` tool and its asynchronous execution logic.
-   **`src/utils/dbClient.js`**: Manages the PGlite database schema, including tables for jobs, caches, and the knowledge graph.
-   **`src/utils/advancedCache.js`**: Implements the database-backed caching layer.
-   **`src/agents/*.js`**: Contains the core agent logic (planning, research, context). Now refactored to use `@terminals-tech/core`.
-   **`client/`**: A minimalist React-based conversational UI for interacting with the agent over WebSockets.

## 🛠️ Development Workflow

### 1. Modifying the Agent Logic

-   **Planning**: `src/agents/planningAgent.js`
-   **Research**: `src/agents/researchAgent.js` (Note: `conductParallelResearch` now uses `BoundedExecutor`).
-   **Synthesis**: `src/agents/contextAgent.js`

### 2. Adding Dependencies

Always add new dependencies to `package.json` using `npm install --save <package-name>`.

### 3. Database Schema Changes

-   Modify the table creation queries in `src/utils/dbClient.js`.
-   If migrating existing data, create a new migration script in `src/utils/dbMigrations.js`. The vector dimension migration (`src/utils/vectorDimensionMigration.js`) serves as a good example.

### 4. Client UI Changes

-   The UI is a simple React application located in `client/`.
-   Components are in `client/src/components/`.
-   The main application logic is in `client/src/App.jsx`.

## 🔒 Security

-   **Authentication**: The server acts as an OAuth 2.0 Resource Server, validating JWTs via a JWKS URL specified in the environment (`AUTH_JWKS_URL`).
-   **Rate Limiting**: `express-rate-limit` is applied to all incoming HTTP requests to prevent abuse.
-   **Input Validation**: All tool inputs are validated using Zod schemas defined in `src/server/tools.js`.

## 🤖 Agent Zero Workflow

-   The `.github/workflows/agent-zero.yml` file defines a GitHub Action.
-   It triggers on pull request comments that start with `@zero`.
-   The action is responsible for parsing the comment, invoking the agent (this part requires implementation, e.g., an HTTP call to a running instance of the server), and posting the results back to the PR.

---
*This document is validated against the v2.1.0 codebase.*