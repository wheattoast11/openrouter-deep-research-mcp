# OpenRouterAI Research Agents MCP Server Enhancement Plan

## Context and Task

You are tasked with planning the implementation of improvements to the OpenRouterAI Research Agents MCP Server based on QA testing results and MECE analysis. The server implements the Model Context Protocol (MCP) to provide advanced research capabilities via several tools (`conduct_research`, `research_follow_up`, `get_past_research`, `rate_research_report`, `list_research_history`).

Please develop a detailed, actionable implementation plan that addresses identified issues while prioritizing improvements based on impact and effort. Your plan should include specific code changes, dependency management strategies, and testing approaches.

## Key Files to Review

Review these files to understand the current implementation and identified issues:

1. **Core Implementation Files:**
   - `src/server/mcpServer.js` - Contains MCP server setup and tool registrations
   - `src/server/tools.js` - Contains tool implementations (primarily `conductResearch`)
   - `src/agents/researchAgent.js` - Handles research execution
   - `src/agents/planningAgent.js` - Plans research queries
   - `src/agents/contextAgent.js` - Contextualizes research results
   - `src/utils/dbClient.js` - Database operations
   - `src/utils/openRouterClient.js` - OpenRouter API client
   - `src/utils/xmlParser.js` - Handles XML parsing
   - `config.js` - Configuration settings

2. **QA and Analysis Files:**
   - `qa-test-results.md` - Detailed test results for all MCP tools
   - `mece-analysis-updated.md` - MECE analysis of issues and remediation steps
   - `implementation-plan-updated.md` - Current phased implementation plan
   - `qa-summary-report-updated.md` - Summary of QA findings
   - `test-mcp-tools.js` - The test script used for QA

## Key Issues to Address

Based on the analysis files, focus on these key areas:

1. **Feature Completeness**: The `mcpServer.js` registers all five tools, but the implementation in `tools.js` only contains detailed handling for `conductResearch`.

2. **Dependency Management**: Issues with missing dependencies (e.g., 'date-fns') highlight the need for better dependency documentation and management.

3. **Fallback Mechanisms**: There's a fallback from 'high' to 'low' cost models in `conductResearch`, but other tools don't have similar fallback mechanisms.

4. **Caching Strategy**: Current in-memory cache has a fixed TTL of 1 hour and max 100 keys, which may not be optimal for varying query patterns.

5. **Error Handling Consistency**: Error handling patterns vary across tools and lack consistent categorization.

6. **Testing Infrastructure**: Current tests are simulation-based rather than actual API integration tests.

7. **Progress Reporting**: Progress reporting is inconsistent across tools.

8. **Authentication**: Basic API key authentication is optional, presenting potential security risks.

## Research Tasks

Please use the browser to research the following topics to enhance your implementation plan:

1. **Model Context Protocol (MCP)**: Research the latest best practices for implementing MCP servers and tools.

2. **Circuit Breaker Pattern**: Research implementation strategies in Node.js for API resilience.

3. **Adaptive Caching Strategies**: Research techniques for implementing adaptive TTL and cache sizing based on query patterns.

4. **Error Categorization in Node.js**: Research approaches for standardized error handling.

5. **Jest/Mocha Integration Testing**: Research approaches for testing API endpoints with actual backend integration.

## Expected Output

Provide a comprehensive implementation plan that includes:

1. **Conceptual Framework**: Overview of the approach for each major improvement area.

2. **Specific Code Changes**: For each area, provide concrete examples of code changes, including:
   - New function implementations
   - Modifications to existing functions
   - New modules/files to be created

3. **Implementation Phases**:
   - Phase 1 (1-2 weeks): High-priority improvements
   - Phase 2 (2-4 weeks): Medium-priority improvements
   - Phase 3 (1-3 months): Long-term improvements

4. **Testing Strategy**: How to verify the improvements, including:
   - Unit test examples
   - Integration test approaches
   - Validation criteria

5. **Dependency Management**: Specific recommendations for package.json updates and dependency documentation.

Your plan should be technically precise, actionable, and prioritized to maximize impact while minimizing risk. Include code snippets where helpful to illustrate implementation details.
