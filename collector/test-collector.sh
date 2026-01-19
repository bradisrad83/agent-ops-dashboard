#!/bin/bash
# Test script for Agent Ops Collector

set -e

echo "======================================"
echo "Agent Ops Collector Test Script"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if server is running
echo -e "${BLUE}[1/5]${NC} Checking if server is running..."
if lsof -Pi :8787 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${GREEN}✓${NC} Server is running on port 8787"
else
    echo -e "${YELLOW}!${NC} Server is not running. Please start it with:"
    echo "    cd ../server && node index.js"
    exit 1
fi

# Test health endpoint
echo ""
echo -e "${BLUE}[2/5]${NC} Testing server health endpoint..."
if curl -s http://localhost:8787/health > /dev/null; then
    echo -e "${GREEN}✓${NC} Server is healthy"
else
    echo -e "${YELLOW}!${NC} Server health check failed"
    exit 1
fi

# Test exec command with successful command
echo ""
echo -e "${BLUE}[3/5]${NC} Testing exec command (success case)..."
node index.js exec -- echo "Test successful execution"
echo -e "${GREEN}✓${NC} Exec command completed successfully"

# Test exec command with failing command
echo ""
echo -e "${BLUE}[4/5]${NC} Testing exec command (error case)..."
if node index.js exec -- ls /nonexistent-path-12345 >/dev/null 2>&1; then
    echo -e "${YELLOW}!${NC} Expected command to fail but it succeeded"
else
    echo -e "${GREEN}✓${NC} Exec command correctly handled error (exit code != 0)"
fi

# Test help command
echo ""
echo -e "${BLUE}[5/5]${NC} Testing help command..."
if node index.js --help | grep -q "Agent Ops Collector CLI"; then
    echo -e "${GREEN}✓${NC} Help command works"
else
    echo -e "${YELLOW}!${NC} Help command failed"
    exit 1
fi

echo ""
echo "======================================"
echo -e "${GREEN}All tests passed!${NC}"
echo "======================================"
echo ""
echo "To test watch mode manually:"
echo "  1. Open the dashboard at http://localhost:5173 (or your dashboard URL)"
echo "  2. Run: node index.js watch --verbose --path /tmp/agentops-test"
echo "  3. In another terminal, make changes:"
echo "     cd /tmp/agentops-test"
echo "     echo 'new content' >> test.js"
echo "     touch newfile.txt"
echo "  4. Watch events appear live in the dashboard"
echo "  5. Press Ctrl+C to stop watching"
echo ""
