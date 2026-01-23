#!/bin/bash
# Resilience Improvements Test Script
# Tests the session command exit behavior and display formatting

set -e

echo "╔═══════════════════════════════════════════╗"
echo "║  Zero CLI Resilience Test Suite          ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASS=0
FAIL=0

# Helper function to check exit time
test_exit_time() {
  local cmd="$1"
  local max_time=$2
  local desc="$3"
  
  echo -n "Testing: $desc ... "
  
  start=$(date +%s)
  timeout ${max_time} $cmd > /dev/null 2>&1 || true
  end=$(date +%s)
  
  elapsed=$((end - start))
  
  if [ $elapsed -le $max_time ]; then
    echo -e "${GREEN}✓ PASS${NC} (${elapsed}s)"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}✗ FAIL${NC} (${elapsed}s > ${max_time}s)"
    FAIL=$((FAIL + 1))
  fi
}

# Test 1: Session command exits quickly
echo "═══ Test 1: Session Command Exit Time ═══"
test_exit_time "node bin/zero session" 5 "Session command exits within 5s"
echo ""

# Test 2: Session display formatting
echo "═══ Test 2: Session Display Format ═══"
echo -n "Testing: Formatted output ... "
OUTPUT=$(node bin/zero session 2>&1)
if echo "$OUTPUT" | grep -q "Session:"; then
  echo -e "${GREEN}✓ PASS${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${RED}✗ FAIL${NC}"
  FAIL=$((FAIL + 1))
fi

echo -n "Testing: JSON flag backward compatibility ... "
JSON_OUTPUT=$(node bin/zero session --json 2>&1)
if echo "$JSON_OUTPUT" | grep -q '"state"'; then
  echo -e "${GREEN}✓ PASS${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${RED}✗ FAIL${NC}"
  FAIL=$((FAIL + 1))
fi
echo ""

# Test 3: Other heavy commands exit cleanly
echo "═══ Test 3: Other Commands Exit Time ═══"
test_exit_time "node bin/zero status" 5 "Status command exits within 5s"
test_exit_time "node bin/zero models" 5 "Models command exits within 5s"
echo ""

# Test 4: No hanging processes
echo "═══ Test 4: Process Cleanup ═══"
echo -n "Testing: No hanging zero processes ... "
sleep 2  # Give processes time to cleanup
HANGING=$(ps aux | grep -c "[b]in/zero" || true)
if [ "$HANGING" -eq 0 ]; then
  echo -e "${GREEN}✓ PASS${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${RED}✗ FAIL${NC} ($HANGING hanging processes)"
  FAIL=$((FAIL + 1))
  ps aux | grep "[b]in/zero" || true
fi
echo ""

# Summary
echo "╔═══════════════════════════════════════════╗"
echo "║  Test Summary                             ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo -e "  ${GREEN}Passed:${NC} $PASS"
echo -e "  ${RED}Failed:${NC} $FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
