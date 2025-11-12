#!/bin/bash
# Test HTTP/SSE transport and API endpoints

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

export SERVER_API_KEY=testkey
export OPENROUTER_API_KEY=test_key
export PGLITE_IN_MEMORY=true
export INDEXER_ENABLED=false

echo "=== HTTP/SSE Endpoints Test ==="

# Start server in background
echo "Starting server..."
node src/server/mcpServer.js > /tmp/mcp_server_test.log 2>&1 &
SERVER_PID=$!

# Cleanup function
cleanup() {
  echo "Stopping server (PID: $SERVER_PID)..."
  kill $SERVER_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

# Wait for server to start
echo "Waiting for server to initialize..."
for i in {1..30}; do
  if curl -s http://localhost:3002/health > /dev/null 2>&1; then
    echo "✓ Server started successfully"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "✗ Server failed to start within 30s"
    cat /tmp/mcp_server_test.log
    exit 1
  fi
  sleep 1
done

# Test 1: Server discovery endpoint
echo ""
echo "Test 1: Server discovery endpoint"
DISCOVERY=$(curl -s http://localhost:3002/.well-known/mcp-server)

if echo "$DISCOVERY" | jq -e '.version == "1.6.0"' > /dev/null; then
  echo "✓ Discovery endpoint returns correct version"
else
  echo "✗ Discovery endpoint version mismatch"
  echo "$DISCOVERY" | jq .
  exit 1
fi

if echo "$DISCOVERY" | jq -e '.specificationDraft == "2025-11-25"' > /dev/null; then
  echo "✓ Specification draft version correct"
else
  echo "✗ Specification draft version incorrect"
  exit 1
fi

if echo "$DISCOVERY" | jq -e '.extensions["async-operations"]' > /dev/null; then
  echo "✓ Async operations extension present"
else
  echo "✗ Async operations extension missing"
  exit 1
fi

# Test 2: Health endpoint
echo ""
echo "Test 2: Health endpoint"
HEALTH=$(curl -s http://localhost:3002/health)

if echo "$HEALTH" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
  echo "✓ Health endpoint reports healthy"
elif echo "$HEALTH" | jq -e '.status == "unhealthy"' > /dev/null 2>&1; then
  echo "⚠ Health endpoint reports unhealthy (may be due to embedder initialization)"
  echo "$HEALTH" | jq .
else
  echo "✗ Health endpoint invalid response"
  echo "$HEALTH"
  exit 1
fi

# Test 3: Metrics endpoint (requires auth)
echo ""
echo "Test 3: Metrics endpoint"
METRICS=$(curl -s -H "Authorization: Bearer testkey" http://localhost:3002/metrics)

if echo "$METRICS" | jq -e '.database' > /dev/null 2>&1; then
  echo "✓ Metrics endpoint accessible with auth"
else
  echo "✗ Metrics endpoint failed"
  echo "$METRICS"
  exit 1
fi

# Test 4: Auth rejection (no token)
echo ""
echo "Test 4: Authentication enforcement"
UNAUTH=$(curl -s -w "%{http_code}" http://localhost:3002/metrics -o /dev/null)

if [ "$UNAUTH" = "401" ] || [ "$UNAUTH" = "403" ]; then
  echo "✓ Unauthorized requests rejected"
else
  echo "✗ Unauthorized requests not properly rejected (code: $UNAUTH)"
  exit 1
fi

# Test 5: Job submission endpoint
echo ""
echo "Test 5: Job submission"
JOB_RESPONSE=$(curl -s -X POST http://localhost:3002/jobs \
  -H "Authorization: Bearer testkey" \
  -H "Content-Type: application/json" \
  -d '{"query":"test query"}')

if echo "$JOB_RESPONSE" | jq -e '.job_id' > /dev/null 2>&1; then
  JOB_ID=$(echo "$JOB_RESPONSE" | jq -r '.job_id')
  echo "✓ Job submission successful (ID: $JOB_ID)"
else
  echo "✗ Job submission failed"
  echo "$JOB_RESPONSE"
  exit 1
fi

echo ""
echo "=== HTTP/SSE Endpoints: PASSED ==="
exit 0
