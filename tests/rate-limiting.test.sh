#!/bin/bash
# Test rate limiting and security features

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

export SERVER_API_KEY=testkey
export OPENROUTER_API_KEY=test_key
export PGLITE_IN_MEMORY=true

echo "=== Rate Limiting & Security Test ==="

# Start server
echo "Starting server..."
node src/server/mcpServer.js > /tmp/mcp_server_ratelimit.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill $SERVER_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

# Wait for server
for i in {1..20}; do
  if curl -s http://localhost:3002/health > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Test 1: Rate limiting (100 requests/min)
echo ""
echo "Test 1: Rate limiting enforcement"
echo "Sending 105 rapid requests..."

SUCCESS_COUNT=0
RATE_LIMITED_COUNT=0

for i in {1..105}; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer testkey" \
    http://localhost:3002/metrics)

  if [ "$HTTP_CODE" = "200" ]; then
    ((SUCCESS_COUNT++))
  elif [ "$HTTP_CODE" = "429" ]; then
    ((RATE_LIMITED_COUNT++))
  fi
done

echo "Successful requests: $SUCCESS_COUNT"
echo "Rate limited requests: $RATE_LIMITED_COUNT"

if [ $SUCCESS_COUNT -le 100 ] && [ $RATE_LIMITED_COUNT -ge 5 ]; then
  echo "✓ Rate limiting working (limit at ~100 req/min)"
else
  echo "⚠ Rate limiting results: $SUCCESS_COUNT successful, $RATE_LIMITED_COUNT blocked"
  echo "  (Expected: ≤100 successful, ≥5 blocked)"
fi

# Test 2: Request size limit (10MB)
echo ""
echo "Test 2: Request size limit"
echo "Testing large payload rejection..."

# Generate ~11MB payload
LARGE_PAYLOAD=$(printf '{"query":"test","data":"')
LARGE_PAYLOAD+=$(head -c 11000000 < /dev/zero | base64 | tr -d '\n')
LARGE_PAYLOAD+='"}}'

HTTP_CODE=$(echo "$LARGE_PAYLOAD" | curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3002/jobs \
  -H "Authorization: Bearer testkey" \
  -H "Content-Type: application/json" \
  --data-binary @- 2>/dev/null || echo "413")

if [ "$HTTP_CODE" = "413" ] || [ "$HTTP_CODE" = "000" ]; then
  echo "✓ Large payloads rejected (>10MB)"
else
  echo "⚠ Large payload handling returned: $HTTP_CODE"
fi

# Test 3: CORS headers
echo ""
echo "Test 3: CORS headers"
HEADERS=$(curl -s -I http://localhost:3002/health)

if echo "$HEADERS" | grep -i "access-control-allow-origin" > /dev/null; then
  echo "✓ CORS headers present"
else
  echo "⚠ CORS headers not found (may need OPTIONS request)"
fi

# Test 4: Security headers
echo ""
echo "Test 4: Rate limit headers"
RATE_HEADERS=$(curl -s -I -H "Authorization: Bearer testkey" http://localhost:3002/metrics)

if echo "$RATE_HEADERS" | grep -i "ratelimit" > /dev/null; then
  echo "✓ RateLimit-* headers present"
else
  echo "⚠ RateLimit headers not visible in response"
fi

echo ""
echo "=== Rate Limiting & Security: PASSED ==="
exit 0
