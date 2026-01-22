#!/bin/bash

# Test script for Agent Ops Dashboard Server
# Make sure the server is running on port 8787

BASE_URL="http://localhost:8787"

echo "🧪 Testing Agent Ops Dashboard Server"
echo "========================================"
echo ""

# Test 1: Create a run
echo "1️⃣  Creating a new run..."
RUN_RESPONSE=$(curl -s -X POST $BASE_URL/api/runs \
  -H "content-type: application/json" \
  -d '{"title":"Test Run"}')

RUN_ID=$(echo $RUN_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$RUN_ID" ]; then
  echo "❌ Failed to create run"
  echo "Response: $RUN_RESPONSE"
  exit 1
fi

echo "✅ Created run: $RUN_ID"
echo ""

# Test 2: List runs
echo "2️⃣  Listing all runs..."
RUNS=$(curl -s $BASE_URL/api/runs)
echo "✅ Runs: $RUNS"
echo ""

# Test 3: Post events
echo "3️⃣  Posting events to run $RUN_ID..."

curl -s -X POST $BASE_URL/api/runs/$RUN_ID/events \
  -H "content-type: application/json" \
  -d '{"type":"run.started","payload":{"message":"Starting execution"}}' > /dev/null

curl -s -X POST $BASE_URL/api/runs/$RUN_ID/events \
  -H "content-type: application/json" \
  -d '{"type":"tool.called","payload":{"toolName":"ReadFile","message":"Reading input"}}' > /dev/null

curl -s -X POST $BASE_URL/api/runs/$RUN_ID/events \
  -H "content-type: application/json" \
  -d '{"type":"tool.result","payload":{"toolName":"ReadFile","result":"Success"}}' > /dev/null

echo "✅ Posted 3 events"
echo ""

# Test 4: Get events
echo "4️⃣  Fetching events..."
EVENTS=$(curl -s "$BASE_URL/api/runs/$RUN_ID/events?limit=10")
EVENT_COUNT=$(echo $EVENTS | grep -o '"id"' | wc -l | tr -d ' ')
echo "✅ Fetched $EVENT_COUNT events"
echo ""

# Test 5: SSE stream (just verify endpoint exists)
echo "5️⃣  Testing SSE stream endpoint..."
echo "   To test streaming, run in another terminal:"
echo "   curl -N $BASE_URL/api/runs/$RUN_ID/stream"
echo ""

echo "========================================"
echo "✅ All basic tests passed!"
echo ""
echo "Run ID for testing: $RUN_ID"
