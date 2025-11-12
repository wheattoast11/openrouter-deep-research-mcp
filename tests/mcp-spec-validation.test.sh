#!/bin/bash
# Validate MCP specification compliance

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

export SERVER_API_KEY=testkey

echo "=== MCP Specification Validation ==="

# Start server
node src/server/mcpServer.js > /tmp/mcp_spec_validation.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill $SERVER_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

# Wait for startup
for i in {1..20}; do
  curl -s http://localhost:3002/health > /dev/null 2>&1 && break
  sleep 1
done

echo ""
echo "Test 1: Server discovery metadata"
DISCOVERY=$(curl -s http://localhost:3002/.well-known/mcp-server)

# Check required fields
REQUIRED_FIELDS=("name" "version" "specification" "capabilities" "transports")

for field in "${REQUIRED_FIELDS[@]}"; do
  if echo "$DISCOVERY" | jq -e ".$field" > /dev/null 2>&1; then
    echo "✓ Field '$field' present"
  else
    echo "✗ Required field '$field' missing"
    exit 1
  fi
done

# Check capabilities
if echo "$DISCOVERY" | jq -e '.capabilities.tools' > /dev/null 2>&1; then
  echo "✓ Tools capability declared"
else
  echo "✗ Tools capability missing"
  exit 1
fi

if echo "$DISCOVERY" | jq -e '.capabilities.prompts' > /dev/null 2>&1; then
  echo "✓ Prompts capability declared"
else
  echo "✗ Prompts capability missing"
  exit 1
fi

if echo "$DISCOVERY" | jq -e '.capabilities.resources' > /dev/null 2>&1; then
  echo "✓ Resources capability declared"
else
  echo "✗ Resources capability missing"
  exit 1
fi

# Check transports
TRANSPORT_COUNT=$(echo "$DISCOVERY" | jq '.transports | length')
if [ "$TRANSPORT_COUNT" -ge 2 ]; then
  echo "✓ Multiple transports available ($TRANSPORT_COUNT)"
else
  echo "⚠ Limited transports: $TRANSPORT_COUNT"
fi

# Check extensions (November 2025 draft)
if echo "$DISCOVERY" | jq -e '.extensions["async-operations"]' > /dev/null 2>&1; then
  echo "✓ Extension: async-operations"
else
  echo "✗ Extension async-operations missing"
  exit 1
fi

if echo "$DISCOVERY" | jq -e '.extensions["knowledge-base"]' > /dev/null 2>&1; then
  echo "✓ Extension: knowledge-base"
else
  echo "✗ Extension knowledge-base missing"
  exit 1
fi

if echo "$DISCOVERY" | jq -e '.extensions["multi-agent"]' > /dev/null 2>&1; then
  echo "✓ Extension: multi-agent"
else
  echo "✗ Extension multi-agent missing"
  exit 1
fi

echo ""
echo "Test 2: Specification version compliance"
SPEC_VERSION=$(echo "$DISCOVERY" | jq -r '.specification')
SPEC_DRAFT=$(echo "$DISCOVERY" | jq -r '.specificationDraft')

if [ "$SPEC_VERSION" = "2025-06-18" ]; then
  echo "✓ Specification version: $SPEC_VERSION"
else
  echo "⚠ Specification version: $SPEC_VERSION (expected 2025-06-18)"
fi

if [ "$SPEC_DRAFT" = "2025-11-25" ]; then
  echo "✓ Draft specification: $SPEC_DRAFT"
else
  echo "⚠ Draft specification: $SPEC_DRAFT (expected 2025-11-25)"
fi

echo ""
echo "Test 3: Endpoint documentation"
ENDPOINTS=$(echo "$DISCOVERY" | jq -r '.endpoints | keys | .[]')
echo "✓ Documented endpoints:"
echo "$ENDPOINTS" | sed 's/^/  - /'

echo ""
echo "=== MCP Specification Validation: PASSED ==="
exit 0
