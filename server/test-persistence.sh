#!/bin/bash

# Test script for SQLite persistence across server restarts

set -e

echo "🧪 Testing SQLite Persistence"
echo "=============================="
echo ""

# Clean previous test data
echo "1. Cleaning previous test data..."
rm -f data/agentops.sqlite*
echo "   ✓ Cleaned"
echo ""

# Start server in background
echo "2. Starting server (first time)..."
node index.js > /tmp/agentops-test.log 2>&1 &
SERVER_PID=$!
sleep 2
echo "   ✓ Server started (PID: $SERVER_PID)"
echo ""

# Create a run and add events
echo "3. Creating run and adding events..."
RUN_ID=$(curl -s -X POST http://localhost:8787/api/runs \
  -H "Content-Type: application/json" \
  -d '{"title":"Persistence Test"}' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "   ✓ Created run: $RUN_ID"

for i in {1..3}; do
  curl -s -X POST http://localhost:8787/api/runs/$RUN_ID/events \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"test.event\",\"payload\":{\"num\":$i}}" > /dev/null
  echo "   ✓ Added event $i"
done
echo ""

# Get events before restart
echo "4. Fetching events before restart..."
EVENTS_BEFORE=$(curl -s http://localhost:8787/api/runs/$RUN_ID/events)
EVENT_COUNT_BEFORE=$(echo $EVENTS_BEFORE | grep -o '"id"' | wc -l | tr -d ' ')
echo "   ✓ Events before restart: $EVENT_COUNT_BEFORE"
echo ""

# Stop server
echo "5. Stopping server..."
kill $SERVER_PID
sleep 1
echo "   ✓ Server stopped"
echo ""

# Restart server
echo "6. Restarting server..."
node index.js > /tmp/agentops-test.log 2>&1 &
SERVER_PID=$!
sleep 2
echo "   ✓ Server restarted (PID: $SERVER_PID)"
echo ""

# Verify data persists
echo "7. Verifying data persistence..."
RUNS_AFTER=$(curl -s http://localhost:8787/api/runs)
RUN_COUNT=$(echo $RUNS_AFTER | grep -o '"id"' | wc -l | tr -d ' ')
echo "   ✓ Runs after restart: $RUN_COUNT"

EVENTS_AFTER=$(curl -s http://localhost:8787/api/runs/$RUN_ID/events)
EVENT_COUNT_AFTER=$(echo $EVENTS_AFTER | grep -o '"id"' | wc -l | tr -d ' ')
echo "   ✓ Events after restart: $EVENT_COUNT_AFTER"

if [ "$EVENT_COUNT_BEFORE" -eq "$EVENT_COUNT_AFTER" ]; then
  echo "   ✅ Event count matches!"
else
  echo "   ❌ Event count mismatch: $EVENT_COUNT_BEFORE vs $EVENT_COUNT_AFTER"
  kill $SERVER_PID
  exit 1
fi
echo ""

# Add more events after restart
echo "8. Adding events after restart..."
curl -s -X POST http://localhost:8787/api/runs/$RUN_ID/events \
  -H "Content-Type: application/json" \
  -d '{"type":"test.event","payload":{"num":4}}' > /dev/null
echo "   ✓ Added event 4"

EVENTS_FINAL=$(curl -s http://localhost:8787/api/runs/$RUN_ID/events)
EVENT_COUNT_FINAL=$(echo $EVENTS_FINAL | grep -o '"id"' | wc -l | tr -d ' ')
echo "   ✓ Total events: $EVENT_COUNT_FINAL"

if [ "$EVENT_COUNT_FINAL" -eq 4 ]; then
  echo "   ✅ Event ID continues monotonically!"
else
  echo "   ❌ Expected 4 events, got $EVENT_COUNT_FINAL"
  kill $SERVER_PID
  exit 1
fi
echo ""

# Test cursor pagination
echo "9. Testing cursor pagination..."
EVENTS_AFTER_CURSOR=$(curl -s "http://localhost:8787/api/runs/$RUN_ID/events?after=2")
CURSOR_COUNT=$(echo $EVENTS_AFTER_CURSOR | grep -o '"id"' | wc -l | tr -d ' ')
echo "   ✓ Events after cursor 2: $CURSOR_COUNT"

if [ "$CURSOR_COUNT" -eq 2 ]; then
  echo "   ✅ Cursor pagination works!"
else
  echo "   ❌ Expected 2 events after cursor, got $CURSOR_COUNT"
  kill $SERVER_PID
  exit 1
fi
echo ""

# Cleanup
echo "10. Cleanup..."
kill $SERVER_PID
echo "   ✓ Server stopped"
echo ""

echo "✅ All persistence tests passed!"
echo ""
echo "Test database preserved at: server/data/agentops.sqlite"
echo "To reset: rm -f server/data/agentops.sqlite*"
