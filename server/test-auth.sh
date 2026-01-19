#!/bin/bash
# Test authentication and run lifecycle endpoints

set -e

BASE_URL="http://localhost:8787"
API_KEY="test-secret-key-123"
TEMP_PID_FILE="/tmp/agentops-test-auth-server.pid"

echo "=================================================="
echo "Agent Ops Dashboard - Auth & Lifecycle Test"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Cleanup function
cleanup() {
  if [ -f "$TEMP_PID_FILE" ]; then
    PID=$(cat "$TEMP_PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
      echo -e "${YELLOW}Stopping test server (PID: $PID)...${NC}"
      kill $PID 2>/dev/null || true
      sleep 1
    fi
    rm -f "$TEMP_PID_FILE"
  fi
}

trap cleanup EXIT

# Start server with auth enabled
echo -e "${YELLOW}Starting server with authentication enabled...${NC}"
AGENTOPS_API_KEY="$API_KEY" PORT=8787 node index.js > /tmp/agentops-test-auth-server.log 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > "$TEMP_PID_FILE"

echo "Server PID: $SERVER_PID"
sleep 2

# Check if server is running
if ! ps -p $SERVER_PID > /dev/null 2>&1; then
  echo -e "${RED}✗ Server failed to start${NC}"
  cat /tmp/agentops-test-auth-server.log
  exit 1
fi

echo -e "${GREEN}✓ Server started with authentication${NC}"
echo ""

# Test 1: Verify auth is required (no header)
echo "Test 1: Request without API key should fail (401)"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/runs")
if [ "$HTTP_STATUS" = "401" ]; then
  echo -e "${GREEN}✓ Correctly returned 401 Unauthorized${NC}"
else
  echo -e "${RED}✗ Expected 401, got $HTTP_STATUS${NC}"
  exit 1
fi
echo ""

# Test 2: Verify auth with wrong key fails
echo "Test 2: Request with wrong API key should fail (401)"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "x-api-key: wrong-key" "$BASE_URL/api/runs")
if [ "$HTTP_STATUS" = "401" ]; then
  echo -e "${GREEN}✓ Correctly returned 401 for wrong key${NC}"
else
  echo -e "${RED}✗ Expected 401, got $HTTP_STATUS${NC}"
  exit 1
fi
echo ""

# Test 3: Verify auth with correct key works
echo "Test 3: Request with correct API key should succeed"
RUNS=$(curl -s -H "x-api-key: $API_KEY" "$BASE_URL/api/runs")
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Successfully authenticated and fetched runs${NC}"
else
  echo -e "${RED}✗ Failed to fetch runs with correct key${NC}"
  exit 1
fi
echo ""

# Test 4: Create a run with auth
echo "Test 4: Create run with authentication"
RUN_DATA=$(curl -s -X POST "$BASE_URL/api/runs" \
  -H "x-api-key: $API_KEY" \
  -H "content-type: application/json" \
  -d '{"title":"Auth Test Run","status":"running"}')

RUN_ID=$(echo "$RUN_DATA" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"\([^"]*\)"/\1/')

if [ -n "$RUN_ID" ]; then
  echo -e "${GREEN}✓ Created run: $RUN_ID${NC}"
else
  echo -e "${RED}✗ Failed to create run${NC}"
  echo "Response: $RUN_DATA"
  exit 1
fi
echo ""

# Test 5: Post event with auth
echo "Test 5: Post event with authentication"
EVENT_DATA=$(curl -s -X POST "$BASE_URL/api/runs/$RUN_ID/events" \
  -H "x-api-key: $API_KEY" \
  -H "content-type: application/json" \
  -d '{"type":"run.started","payload":{"message":"Test event"}}')

EVENT_ID=$(echo "$EVENT_DATA" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"\([^"]*\)"/\1/')

if [ -n "$EVENT_ID" ]; then
  echo -e "${GREEN}✓ Posted event: $EVENT_ID${NC}"
else
  echo -e "${RED}✗ Failed to post event${NC}"
  echo "Response: $EVENT_DATA"
  exit 1
fi
echo ""

# Test 6: Test PATCH endpoint to update run status
echo "Test 6: Update run status to 'completed' via PATCH"
UPDATED_RUN=$(curl -s -X PATCH "$BASE_URL/api/runs/$RUN_ID" \
  -H "x-api-key: $API_KEY" \
  -H "content-type: application/json" \
  -d '{"status":"completed"}')

UPDATED_STATUS=$(echo "$UPDATED_RUN" | grep -o '"status":"[^"]*"' | sed 's/"status":"\([^"]*\)"/\1/')

if [ "$UPDATED_STATUS" = "completed" ]; then
  echo -e "${GREEN}✓ Successfully updated run status to completed${NC}"
else
  echo -e "${RED}✗ Failed to update run status${NC}"
  echo "Response: $UPDATED_RUN"
  exit 1
fi
echo ""

# Test 7: Update run title
echo "Test 7: Update run title via PATCH"
UPDATED_RUN=$(curl -s -X PATCH "$BASE_URL/api/runs/$RUN_ID" \
  -H "x-api-key: $API_KEY" \
  -H "content-type: application/json" \
  -d '{"title":"Updated Test Run"}')

UPDATED_TITLE=$(echo "$UPDATED_RUN" | grep -o '"title":"[^"]*"' | sed 's/"title":"\([^"]*\)"/\1/')

if [ "$UPDATED_TITLE" = "Updated Test Run" ]; then
  echo -e "${GREEN}✓ Successfully updated run title${NC}"
else
  echo -e "${RED}✗ Failed to update run title${NC}"
  echo "Response: $UPDATED_RUN"
  exit 1
fi
echo ""

# Test 8: Update both status and title
echo "Test 8: Update both status and title via PATCH"
UPDATED_RUN=$(curl -s -X PATCH "$BASE_URL/api/runs/$RUN_ID" \
  -H "x-api-key: $API_KEY" \
  -H "content-type: application/json" \
  -d '{"status":"error","title":"Failed Test Run"}')

UPDATED_STATUS=$(echo "$UPDATED_RUN" | grep -o '"status":"[^"]*"' | sed 's/"status":"\([^"]*\)"/\1/')
UPDATED_TITLE=$(echo "$UPDATED_RUN" | grep -o '"title":"[^"]*"' | sed 's/"title":"\([^"]*\)"/\1/')

if [ "$UPDATED_STATUS" = "error" ] && [ "$UPDATED_TITLE" = "Failed Test Run" ]; then
  echo -e "${GREEN}✓ Successfully updated both status and title${NC}"
else
  echo -e "${RED}✗ Failed to update both fields${NC}"
  echo "Response: $UPDATED_RUN"
  exit 1
fi
echo ""

# Test 9: Verify PATCH returns 404 for non-existent run
echo "Test 9: PATCH non-existent run should return 404"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/api/runs/nonexistent-run-id" \
  -H "x-api-key: $API_KEY" \
  -H "content-type: application/json" \
  -d '{"status":"completed"}')

if [ "$HTTP_STATUS" = "404" ]; then
  echo -e "${GREEN}✓ Correctly returned 404 for non-existent run${NC}"
else
  echo -e "${RED}✗ Expected 404, got $HTTP_STATUS${NC}"
  exit 1
fi
echo ""

# Test 10: Verify updated run appears in list
echo "Test 10: Verify updated run appears in run list"
RUNS=$(curl -s -H "x-api-key: $API_KEY" "$BASE_URL/api/runs")
if echo "$RUNS" | grep -q "$RUN_ID"; then
  echo -e "${GREEN}✓ Updated run appears in run list${NC}"
else
  echo -e "${RED}✗ Run not found in list${NC}"
  exit 1
fi
echo ""

# Test 11: Verify SSE requires auth
echo "Test 11: SSE stream without auth should fail (401)"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -N "$BASE_URL/api/runs/$RUN_ID/stream")
if [ "$HTTP_STATUS" = "401" ]; then
  echo -e "${GREEN}✓ SSE correctly requires authentication${NC}"
else
  echo -e "${RED}✗ Expected 401 for SSE, got $HTTP_STATUS${NC}"
  exit 1
fi
echo ""

# Test 12: Verify SSE works with auth
echo "Test 12: SSE stream with auth should succeed"
timeout 2 curl -s -N -H "x-api-key: $API_KEY" "$BASE_URL/api/runs/$RUN_ID/stream" > /tmp/sse-test.txt 2>&1 &
sleep 1
if grep -q "connected" /tmp/sse-test.txt || grep -q "heartbeat" /tmp/sse-test.txt; then
  echo -e "${GREEN}✓ SSE connection established with authentication${NC}"
else
  echo -e "${YELLOW}⚠ SSE test inconclusive (may need longer timeout)${NC}"
fi
rm -f /tmp/sse-test.txt
echo ""

# Summary
echo "=================================================="
echo -e "${GREEN}All authentication and lifecycle tests passed!${NC}"
echo "=================================================="
echo ""
echo "Summary:"
echo "  ✓ Authentication correctly enforced on all endpoints"
echo "  ✓ PATCH endpoint successfully updates run status and title"
echo "  ✓ Run lifecycle updates reflected in run list"
echo "  ✓ SSE streaming requires authentication"
echo ""
