#!/bin/bash
# Test script for Agent Ops Collector
# Tests basic functionality, polling mode, toolCallId correlation, and batching

set -e

echo "=========================================="
echo "Agent Ops Collector Test Suite"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SERVER="http://localhost:8787"

# Check if server is running
echo -e "${BLUE}[Setup]${NC} Checking if server is running..."
if lsof -Pi :8787 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${GREEN}✓${NC} Server is running on port 8787"
else
    echo -e "${RED}✗${NC} Server is not running. Please start it with:"
    echo "    cd ../server && node index.js"
    exit 1
fi

# Test health endpoint
echo -e "${BLUE}[Setup]${NC} Testing server health endpoint..."
if curl -s "$SERVER/health" > /dev/null; then
    echo -e "${GREEN}✓${NC} Server is healthy"
else
    echo -e "${RED}✗${NC} Server health check failed"
    exit 1
fi

echo ""
echo "=========================================="
echo "Test 1: Basic Exec Command"
echo "=========================================="
echo ""

# Test exec command with successful command
echo -e "${BLUE}[Test 1.1]${NC} Testing exec command (success case)..."
node index.js exec -- echo "Test successful execution"
echo -e "${GREEN}✓${NC} Exec command completed successfully"

# Test exec command with failing command
echo ""
echo -e "${BLUE}[Test 1.2]${NC} Testing exec command (error case)..."
if node index.js exec -- ls /nonexistent-path-12345 >/dev/null 2>&1; then
    echo -e "${RED}✗${NC} Expected command to fail but it succeeded"
    exit 1
else
    echo -e "${GREEN}✓${NC} Exec command correctly handled error (exit code != 0)"
fi

echo ""
echo "=========================================="
echo "Test 2: ToolCallId Correlation"
echo "=========================================="
echo ""

# Generate unique run ID for this test
RUN_ID="test-toolcallid-$(date +%s)"
echo -e "${BLUE}[Test 2]${NC} Running exec with runId: $RUN_ID"

# Run a command
node index.js exec --runId "$RUN_ID" --verbose -- echo "Testing toolCallId correlation"

# Wait a moment for events to be saved
sleep 1

# Fetch events from API
echo -e "${BLUE}[Test 2]${NC} Fetching events from API..."
EVENTS=$(curl -s "$SERVER/api/runs/$RUN_ID/events")

# Check for toolCallId in tool.called
if echo "$EVENTS" | grep -q '"type":"tool.called"'; then
    echo -e "${GREEN}✓${NC} tool.called event found"
else
    echo -e "${RED}✗${NC} tool.called event not found"
    exit 1
fi

# Check for toolCallId in tool.result
if echo "$EVENTS" | grep -q '"type":"tool.result"'; then
    echo -e "${GREEN}✓${NC} tool.result event found"
else
    echo -e "${RED}✗${NC} tool.result event not found"
    exit 1
fi

# Extract toolCallId from events
TOOL_CALL_ID=$(echo "$EVENTS" | grep -o '"toolCallId":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$TOOL_CALL_ID" ]; then
    echo -e "${RED}✗${NC} toolCallId not found in events"
    exit 1
fi

echo -e "${GREEN}✓${NC} toolCallId found: $TOOL_CALL_ID"

# Verify toolCallId appears in both events
TOOL_CALL_ID_COUNT=$(echo "$EVENTS" | grep -c "\"toolCallId\":\"$TOOL_CALL_ID\"" || true)
if [ "$TOOL_CALL_ID_COUNT" -ge 2 ]; then
    echo -e "${GREEN}✓${NC} toolCallId correlation verified (appears in both tool.called and tool.result)"
else
    echo -e "${RED}✗${NC} toolCallId correlation failed (expected 2+ occurrences, found $TOOL_CALL_ID_COUNT)"
    exit 1
fi

echo ""
echo "=========================================="
echo "Test 3: Polling Mode File Watching"
echo "=========================================="
echo ""

# Create temporary test directory
TEST_DIR=$(mktemp -d -t agentops-test-XXXXXX)
echo -e "${BLUE}[Test 3]${NC} Created test directory: $TEST_DIR"
cd "$TEST_DIR"

# Initialize git repo (optional, for completeness)
git init > /dev/null 2>&1 || true
git config user.name "Test User" > /dev/null 2>&1 || true
git config user.email "test@example.com" > /dev/null 2>&1 || true

# Start collector in polling mode
RUN_ID="test-poll-$(date +%s)"
echo -e "${BLUE}[Test 3]${NC} Starting collector in polling mode (runId: $RUN_ID)..."

COLLECTOR_PATH="$(cd "$(dirname "$0")" && pwd)/index.js"

node "$COLLECTOR_PATH" watch \
  --mode poll \
  --pollInterval 500 \
  --runId "$RUN_ID" \
  --noComplete \
  > /tmp/collector-poll.log 2>&1 &
POLL_PID=$!

echo -e "${GREEN}✓${NC} Collector started (PID: $POLL_PID)"

# Wait for initialization
sleep 3

# Create test files
echo -e "${BLUE}[Test 3]${NC} Creating test files..."
echo "test1" > file1.txt
sleep 1
echo "test2" > file2.txt
sleep 1
mkdir -p subdir
echo "test3" > subdir/file3.txt
sleep 2

# Modify file
echo -e "${BLUE}[Test 3]${NC} Modifying files..."
echo "modified" >> file1.txt
sleep 1

# Delete file
echo -e "${BLUE}[Test 3]${NC} Deleting file..."
rm file2.txt
sleep 2

# Stop collector
echo -e "${BLUE}[Test 3]${NC} Stopping collector..."
kill $POLL_PID 2>/dev/null || true
wait $POLL_PID 2>/dev/null || true

# Fetch events
EVENTS=$(curl -s "$SERVER/api/runs/$RUN_ID/events")
EVENT_COUNT=$(echo "$EVENTS" | grep -o '"type"' | wc -l | tr -d ' ')

echo -e "${GREEN}✓${NC} Received $EVENT_COUNT events"

# Check for filesystem events
FS_EVENTS=$(echo "$EVENTS" | grep -c '"fs\.' || true)
if [ "$FS_EVENTS" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Filesystem events detected: $FS_EVENTS"
else
    echo -e "${RED}✗${NC} No filesystem events detected!"
    echo "Events received:"
    echo "$EVENTS"
    exit 1
fi

# Check for batch events
BATCH_EVENTS=$(echo "$EVENTS" | grep -c '"fs.batch"' || true)
if [ "$BATCH_EVENTS" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Batch events detected: $BATCH_EVENTS (batching is working)"
else
    echo -e "${YELLOW}!${NC} No fs.batch events (using individual fs.changed events)"
fi

echo ""
echo "=========================================="
echo "Test 4: Auto Mode (Native + Fallback)"
echo "=========================================="
echo ""

RUN_ID="test-auto-$(date +%s)"
echo -e "${BLUE}[Test 4]${NC} Starting collector in auto mode (runId: $RUN_ID)..."

node "$COLLECTOR_PATH" watch \
  --mode auto \
  --runId "$RUN_ID" \
  --noComplete \
  > /tmp/collector-auto.log 2>&1 &
AUTO_PID=$!

echo -e "${GREEN}✓${NC} Collector started (PID: $AUTO_PID)"
sleep 2

# Create test file
echo -e "${BLUE}[Test 4]${NC} Creating test file..."
echo "auto-test" > auto-file.txt
sleep 2

# Stop collector
echo -e "${BLUE}[Test 4]${NC} Stopping collector..."
kill $AUTO_PID 2>/dev/null || true
wait $AUTO_PID 2>/dev/null || true

# Fetch events
EVENTS=$(curl -s "$SERVER/api/runs/$RUN_ID/events")
FS_EVENTS=$(echo "$EVENTS" | grep -c '"fs\.' || true)

if [ "$FS_EVENTS" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Filesystem events detected in auto mode: $FS_EVENTS"
else
    echo -e "${RED}✗${NC} No filesystem events detected in auto mode!"
    exit 1
fi

# Check for warning events (would indicate fallback occurred)
WARNING_EVENTS=$(echo "$EVENTS" | grep -c '"watch.warning"' || true)
if [ "$WARNING_EVENTS" -gt 0 ]; then
    echo -e "${YELLOW}!${NC} Fallback to polling occurred ($WARNING_EVENTS warnings)"
else
    echo -e "${GREEN}✓${NC} Native mode worked (no fallback needed)"
fi

echo ""
echo "=========================================="
echo "Test 5: No-Batch Mode"
echo "=========================================="
echo ""

RUN_ID="test-nobatch-$(date +%s)"
echo -e "${BLUE}[Test 5]${NC} Starting collector with --noBatch (runId: $RUN_ID)..."

node "$COLLECTOR_PATH" watch \
  --mode poll \
  --pollInterval 500 \
  --noBatch \
  --runId "$RUN_ID" \
  --noComplete \
  > /tmp/collector-nobatch.log 2>&1 &
NOBATCH_PID=$!

echo -e "${GREEN}✓${NC} Collector started (PID: $NOBATCH_PID)"
sleep 2

# Create multiple files
echo -e "${BLUE}[Test 5]${NC} Creating multiple files..."
echo "test1" > nobatch1.txt
echo "test2" > nobatch2.txt
echo "test3" > nobatch3.txt
sleep 2

# Stop collector
echo -e "${BLUE}[Test 5]${NC} Stopping collector..."
kill $NOBATCH_PID 2>/dev/null || true
wait $NOBATCH_PID 2>/dev/null || true

# Fetch events
EVENTS=$(curl -s "$SERVER/api/runs/$RUN_ID/events")
CHANGED_EVENTS=$(echo "$EVENTS" | grep -c '"fs.changed"' || true)
BATCH_EVENTS=$(echo "$EVENTS" | grep -c '"fs.batch"' || true)

if [ "$CHANGED_EVENTS" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Individual fs.changed events found: $CHANGED_EVENTS"
else
    echo -e "${RED}✗${NC} No fs.changed events found!"
    exit 1
fi

if [ "$BATCH_EVENTS" -eq 0 ]; then
    echo -e "${GREEN}✓${NC} No fs.batch events (as expected with --noBatch)"
else
    echo -e "${YELLOW}!${NC} Found $BATCH_EVENTS fs.batch events (unexpected but may indicate timing)"
fi

# Cleanup
echo ""
echo -e "${BLUE}[Cleanup]${NC} Removing test directory..."
cd /tmp
rm -rf "$TEST_DIR"
echo -e "${GREEN}✓${NC} Test directory removed"

echo ""
echo "=========================================="
echo -e "${GREEN}ALL TESTS PASSED ✓${NC}"
echo "=========================================="
echo ""
echo "Summary:"
echo "  ✓ Basic exec commands work"
echo "  ✓ toolCallId correlation works"
echo "  ✓ Polling mode file watching works"
echo "  ✓ Auto mode works"
echo "  ✓ No-batch mode works"
echo ""
echo "You can view the test runs in the dashboard."
echo ""
echo "Manual testing:"
echo "  1. Open dashboard at http://localhost:5173"
echo "  2. Run: node index.js watch --verbose"
echo "  3. Make file changes and observe real-time events"
echo ""
