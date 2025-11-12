#!/bin/bash
# Comprehensive MCP v1.6.0 Test Suite Runner
# Tests all critical features for production readiness

set -e

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$TEST_DIR")"
cd "$PROJECT_ROOT"

export NODE_ENV=test
export SERVER_API_KEY=testkey
export SERVER_PORT=3002
export OPENROUTER_API_KEY=test_key
export PGLITE_IN_MEMORY=true
export INDEXER_ENABLED=false

RESULTS_DIR="$TEST_DIR/results"
mkdir -p "$RESULTS_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SUMMARY_FILE="$RESULTS_DIR/test_summary_$TIMESTAMP.txt"

echo "=== MCP v1.6.0 Compliance Test Suite ===" | tee "$SUMMARY_FILE"
echo "Started: $(date)" | tee -a "$SUMMARY_FILE"
echo "" | tee -a "$SUMMARY_FILE"

TESTS_PASSED=0
TESTS_FAILED=0

# Test result tracking
test_result() {
  local name="$1"
  local result="$2"

  if [ "$result" -eq 0 ]; then
    echo "✓ $name" | tee -a "$SUMMARY_FILE"
    ((TESTS_PASSED++))
  else
    echo "✗ $name" | tee -a "$SUMMARY_FILE"
    ((TESTS_FAILED++))
  fi
}

echo "Starting test execution..." | tee -a "$SUMMARY_FILE"
echo "" | tee -a "$SUMMARY_FILE"

# Run test scripts if they exist
for test_script in "$TEST_DIR"/*.test.sh; do
  if [ -f "$test_script" ]; then
    test_name=$(basename "$test_script" .test.sh)
    echo "Running $test_name..." | tee -a "$SUMMARY_FILE"

    if bash "$test_script" > "$RESULTS_DIR/${test_name}_$TIMESTAMP.log" 2>&1; then
      test_result "$test_name" 0
    else
      test_result "$test_name" 1
    fi
  fi
done

echo "" | tee -a "$SUMMARY_FILE"
echo "=== Test Summary ===" | tee -a "$SUMMARY_FILE"
echo "Passed: $TESTS_PASSED" | tee -a "$SUMMARY_FILE"
echo "Failed: $TESTS_FAILED" | tee -a "$SUMMARY_FILE"
echo "Completed: $(date)" | tee -a "$SUMMARY_FILE"

if [ $TESTS_FAILED -eq 0 ]; then
  echo "" | tee -a "$SUMMARY_FILE"
  echo "✓ ALL TESTS PASSED" | tee -a "$SUMMARY_FILE"
  exit 0
else
  echo "" | tee -a "$SUMMARY_FILE"
  echo "✗ SOME TESTS FAILED" | tee -a "$SUMMARY_FILE"
  exit 1
fi
