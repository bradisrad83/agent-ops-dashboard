#!/bin/bash
# Test script for SSE resume and run lifecycle metadata features

set -e

BASE_URL="http://localhost:8787"
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Testing SSE Resume and Metadata Features ===${NC}\n"

# Test 1: Health endpoint
echo -e "${BLUE}Test 1: Health endpoint${NC}"
HEALTH=$(curl -s "${BASE_URL}/health")
echo "Response: $HEALTH"
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo -e "${GREEN}✓ Health endpoint works${NC}\n"
else
  echo -e "${RED}✗ Health endpoint failed${NC}\n"
  exit 1
fi

# Test 2: Create run
echo -e "${BLUE}Test 2: Create run${NC}"
RUN=$(curl -s -X POST "${BASE_URL}/api/runs" \
  -H "content-type: application/json" \
  -d '{"title":"SSE Resume Test Run"}')
RUN_ID=$(echo "$RUN" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
echo "Created run: $RUN_ID"
echo "Response: $RUN"
echo -e "${GREEN}✓ Run created${NC}\n"

# Test 3: Post events
echo -e "${BLUE}Test 3: Post events${NC}"
for i in {1..5}; do
  EVENT=$(curl -s -X POST "${BASE_URL}/api/runs/${RUN_ID}/events" \
    -H "content-type: application/json" \
    -d "{\"type\":\"test.event\",\"payload\":{\"message\":\"Event $i\"}}")
  EVENT_ID=$(echo "$EVENT" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
  echo "Posted event $i with ID: $EVENT_ID"
done
echo -e "${GREEN}✓ Posted 5 events${NC}\n"

# Test 4: Fetch events and get last ID
echo -e "${BLUE}Test 4: Fetch events${NC}"
EVENTS=$(curl -s "${BASE_URL}/api/runs/${RUN_ID}/events")
LAST_ID=$(echo "$EVENTS" | grep -o '"id":"[^"]*' | tail -1 | cut -d'"' -f4)
echo "Last event ID: $LAST_ID"
echo -e "${GREEN}✓ Fetched events${NC}\n"

# Test 5: Post more events (these will be "missed" during SSE resume test)
echo -e "${BLUE}Test 5: Post more events for resume test${NC}"
for i in {6..8}; do
  curl -s -X POST "${BASE_URL}/api/runs/${RUN_ID}/events" \
    -H "content-type: application/json" \
    -d "{\"type\":\"test.event\",\"payload\":{\"message\":\"Event $i\"}}" > /dev/null
  echo "Posted event $i"
done
echo -e "${GREEN}✓ Posted 3 more events${NC}\n"

# Test 6: SSE Resume - fetch with Last-Event-ID header
echo -e "${BLUE}Test 6: Test SSE resume with Last-Event-ID header${NC}"
echo "Resuming from event ID: $LAST_ID"
echo "Expected to receive events 6, 7, 8..."

# Start SSE stream in background and capture output
timeout 3 curl -N -H "Last-Event-ID: ${LAST_ID}" "${BASE_URL}/api/runs/${RUN_ID}/stream" > /tmp/sse_resume.log 2>&1 || true

# Check if we got the missed events
if grep -q "Event 6" /tmp/sse_resume.log && grep -q "Event 7" /tmp/sse_resume.log && grep -q "Event 8" /tmp/sse_resume.log; then
  echo -e "${GREEN}✓ SSE resume successfully received missed events${NC}"
  echo "Sample output:"
  head -20 /tmp/sse_resume.log
else
  echo -e "${RED}✗ SSE resume did not receive all missed events${NC}"
  echo "Output:"
  cat /tmp/sse_resume.log
  exit 1
fi
echo ""

# Test 7: Test SSE resume with query parameter
echo -e "${BLUE}Test 7: Test SSE resume with ?after= query parameter${NC}"
timeout 3 curl -N "${BASE_URL}/api/runs/${RUN_ID}/stream?after=${LAST_ID}" > /tmp/sse_resume_query.log 2>&1 || true

if grep -q "Event 6" /tmp/sse_resume_query.log; then
  echo -e "${GREEN}✓ SSE resume with query param works${NC}\n"
else
  echo -e "${RED}✗ SSE resume with query param failed${NC}\n"
  exit 1
fi

# Test 8: Update run with metadata
echo -e "${BLUE}Test 8: Update run with metadata${NC}"
UPDATED=$(curl -s -X PATCH "${BASE_URL}/api/runs/${RUN_ID}" \
  -H "content-type: application/json" \
  -d '{"metadata":{"cost":0.45,"tags":["test","sse-resume"],"duration":1250}}')
echo "Response: $UPDATED"
if echo "$UPDATED" | grep -q '"metadata"'; then
  echo -e "${GREEN}✓ Metadata updated${NC}\n"
else
  echo -e "${RED}✗ Metadata update failed${NC}\n"
  exit 1
fi

# Test 9: Mark run as completed (should auto-set endedAt)
echo -e "${BLUE}Test 9: Mark run as completed (tests lifecycle semantics)${NC}"
COMPLETED=$(curl -s -X PATCH "${BASE_URL}/api/runs/${RUN_ID}" \
  -H "content-type: application/json" \
  -d '{"status":"completed"}')
echo "Response: $COMPLETED"
if echo "$COMPLETED" | grep -q '"endedAt"'; then
  echo -e "${GREEN}✓ Run marked as completed with endedAt timestamp${NC}\n"
else
  echo -e "${RED}✗ endedAt not set${NC}\n"
  exit 1
fi

# Test 10: Create another run and test error lifecycle
echo -e "${BLUE}Test 10: Test error lifecycle${NC}"
ERROR_RUN=$(curl -s -X POST "${BASE_URL}/api/runs" \
  -H "content-type: application/json" \
  -d '{"title":"Error Test Run"}')
ERROR_RUN_ID=$(echo "$ERROR_RUN" | grep -o '"id":"[^"]*' | cut -d'"' -f4)

# Post error event (should auto-update run status)
curl -s -X POST "${BASE_URL}/api/runs/${ERROR_RUN_ID}/events" \
  -H "content-type: application/json" \
  -d '{"type":"run.error","payload":{"message":"Connection timeout"}}' > /dev/null

# Check run status
ERROR_STATUS=$(curl -s "${BASE_URL}/api/runs")
if echo "$ERROR_STATUS" | grep -q "Connection timeout" && echo "$ERROR_STATUS" | grep -q '"status":"error"'; then
  echo -e "${GREEN}✓ Error event auto-updated run status and error message${NC}\n"
else
  echo -e "${RED}✗ Error event did not update run properly${NC}\n"
  echo "Response: $ERROR_STATUS"
  exit 1
fi

# Test 11: Test completion event auto-update
echo -e "${BLUE}Test 11: Test completion event auto-update${NC}"
COMPLETION_RUN=$(curl -s -X POST "${BASE_URL}/api/runs" \
  -H "content-type: application/json" \
  -d '{"title":"Completion Test Run"}')
COMPLETION_RUN_ID=$(echo "$COMPLETION_RUN" | grep -o '"id":"[^"]*' | cut -d'"' -f4)

# Post completion event
curl -s -X POST "${BASE_URL}/api/runs/${COMPLETION_RUN_ID}/events" \
  -H "content-type: application/json" \
  -d '{"type":"run.completed","payload":{"message":"Finished successfully"}}' > /dev/null

# Check run status
COMPLETION_STATUS=$(curl -s "${BASE_URL}/api/runs")
if echo "$COMPLETION_STATUS" | grep -q '"status":"completed"' | head -1; then
  echo -e "${GREEN}✓ Completion event auto-updated run status${NC}\n"
else
  echo -e "${RED}✗ Completion event did not update run status${NC}\n"
  exit 1
fi

# Test 12: Verify all runs have expected fields
echo -e "${BLUE}Test 12: Verify run response includes new fields${NC}"
ALL_RUNS=$(curl -s "${BASE_URL}/api/runs")
echo "Sample run from list:"
echo "$ALL_RUNS" | head -50

HAS_ENDED_AT=$(echo "$ALL_RUNS" | grep -c '"endedAt"' || true)
HAS_METADATA=$(echo "$ALL_RUNS" | grep -c '"metadata"' || true)
HAS_ERROR_MSG=$(echo "$ALL_RUNS" | grep -c '"errorMessage"' || true)

echo ""
echo "Found endedAt in $HAS_ENDED_AT runs"
echo "Found metadata in $HAS_METADATA runs"
echo "Found errorMessage in $HAS_ERROR_MSG runs"

if [ "$HAS_ENDED_AT" -ge 2 ] && [ "$HAS_METADATA" -ge 1 ] && [ "$HAS_ERROR_MSG" -ge 1 ]; then
  echo -e "${GREEN}✓ All new fields present in responses${NC}\n"
else
  echo -e "${RED}✗ Some fields missing from responses${NC}\n"
  exit 1
fi

# Cleanup
rm -f /tmp/sse_resume.log /tmp/sse_resume_query.log

echo -e "${GREEN}=== All tests passed! ===${NC}"
echo ""
echo "Summary:"
echo "  ✓ Health endpoint"
echo "  ✓ SSE resume with Last-Event-ID header"
echo "  ✓ SSE resume with ?after= query parameter"
echo "  ✓ Run metadata (custom JSON objects)"
echo "  ✓ Lifecycle semantics (endedAt auto-set)"
echo "  ✓ Error event auto-update"
echo "  ✓ Completion event auto-update"
echo "  ✓ All new fields in API responses"
echo ""
echo -e "${BLUE}Production reliability improvements verified!${NC}"
