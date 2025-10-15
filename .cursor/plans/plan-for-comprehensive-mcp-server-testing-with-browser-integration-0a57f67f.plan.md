<!-- 0a57f67f-93de-4c9f-a53e-c75cc0ead9bf 9b87419c-8b5b-40f4-b8c1-8c7fe99b05ba -->
# Plan for Comprehensive MCP Server Testing with Browser Integration

## Overview

This plan outlines the steps to comprehensively test the MCP server, including proper initialization of its components and end-to-end validation through a browser client. The goal is to ensure all workflows function as expected and to generate detailed reports on the outcomes.

## Implementation Todos

1. **Fix Server Initialization Logic (`re-examine-server-init`)**:

    - Correct `src/server/mcpServer.js` to ensure `dbClient.initializeDbAndEmbedder()` is awaited once at startup, followed by a single call to `setupTransports()` and `startJobWorker()`.

2. **Update Comprehensive Test Script (`update-test-script`)**:

    - Modify `test-mcp-comprehensive.js` to include a sufficient startup delay for the MCP server.
    - Integrate `clientLauncher.js` to launch the browser client for a session.
    - Use Playwright browser tools to navigate to the client UI, simulate user interactions (e.g., typing, clicking), and observe responses.
    - Capture browser console messages and network requests during interactions for detailed analysis.
    - Include tests for all MECE (Mutually Exclusive, Collectively Exhaustive) workflows and combinations, including async job submission, status checks, and result retrieval.

3. **Execute Updated Test Script (`run-updated-test`)**:

    - Run `test-mcp-comprehensive.js` and pipe output to a log file.

4. **Analyze Results and Generate Reports (`generate-reports`)**:

    - Parse the `temp_test_output.log` and collected browser data.
    - Generate a `qa.md` summary report in `research_outputs/`, detailing test outcomes, identified issues, and patterns from the code potentially causing problems.
    - Update individual `research_outputs/research-report-1.md` through `research_outputs/research-report-7.md` based on agent testing outcomes.

### To-dos

- [ ] Correct src/server/mcpServer.js to ensure dbClient.initializeDbAndEmbedder() is awaited once at startup, followed by a single call to setupTransports() and startJobWorker().
- [ ] Modify test-mcp-comprehensive.js to include a sufficient startup delay for the MCP server. Integrate clientLauncher.js to launch the browser client for a session. Use Playwright browser tools to navigate to the client UI, simulate user interactions (e.g., typing, clicking), and observe responses. Capture browser console messages and network requests during interactions for detailed analysis. Include tests for all MECE (Mutually Exclusive, Collectively Exhaustive) workflows and combinations, including async job submission, status checks, and result retrieval.
- [ ] Execute test-mcp-comprehensive.js and pipe output to a log file.
- [ ] Parse the temp_test_output.log and collected browser data. Generate a qa.md summary report in research_outputs/, detailing test outcomes, identified issues, and patterns from the code potentially causing problems. Update individual research_outputs/research-report-1.md through research_outputs/research-report-7.md based on agent testing outcomes.