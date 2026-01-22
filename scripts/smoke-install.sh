#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# smoke-install.sh
#
# End-to-end smoke test that simulates a real user installing @agentops/collector
# from a tarball and verifying the full workflow works correctly.
#
# Usage: bash scripts/smoke-install.sh
#
# Prerequisites:
# - Server running at http://localhost:8787
# - Node.js and npm installed
###############################################################################

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_URL="${SERVER_URL:-http://localhost:8787}"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:5173}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE=""
TEMP_DIR=""
DEV_PID=""

# Cleanup function
cleanup() {
  local exit_code=$?

  if [ -n "$DEV_PID" ] && kill -0 "$DEV_PID" 2>/dev/null; then
    echo -e "${YELLOW}Stopping dev process (PID: $DEV_PID)...${NC}"
    kill -SIGINT "$DEV_PID" 2>/dev/null || true
    sleep 2
    kill -9 "$DEV_PID" 2>/dev/null || true
  fi

  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    echo -e "${YELLOW}Cleaning up temp directory: $TEMP_DIR${NC}"
    rm -rf "$TEMP_DIR"
  fi

  if [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
    if [ $exit_code -ne 0 ]; then
      echo -e "${RED}Last 50 lines of log:${NC}"
      tail -50 "$LOG_FILE"
    fi
    rm -f "$LOG_FILE"
  fi

  exit $exit_code
}

trap cleanup EXIT INT TERM

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if server is running
check_server() {
  log_info "Checking if server is running at $SERVER_URL/health..."

  if ! command -v curl &> /dev/null; then
    log_error "curl is not installed. Please install curl and try again."
    exit 1
  fi

  local max_retries=3
  local retry=0

  while [ $retry -lt $max_retries ]; do
    if curl -sf "$SERVER_URL/health" > /dev/null 2>&1; then
      log_success "Server is reachable"
      return 0
    fi

    retry=$((retry + 1))
    if [ $retry -lt $max_retries ]; then
      log_warn "Server not reachable, retrying ($retry/$max_retries)..."
      sleep 2
    fi
  done

  log_error "Server is not reachable at $SERVER_URL/health"
  log_error "Please start the server with: npm run server"
  exit 1
}

# Build and pack the collector
pack_collector() {
  log_info "Building and packing collector..."

  cd "$REPO_ROOT"

  # Run pack command
  local pack_output
  pack_output=$(npm run collector:pack 2>&1) || {
    log_error "Failed to pack collector"
    echo "$pack_output"
    exit 1
  }

  # Find the tarball (it should be in collector/ directory)
  local tarball
  tarball=$(find "$REPO_ROOT/collector" -name "agentops-collector-*.tgz" -type f | head -1)

  if [ -z "$tarball" ]; then
    log_error "Could not find packed tarball in collector/ directory"
    exit 1
  fi

  log_success "Packed tarball: $tarball"
  echo "$tarball"
}

# Create temp test directory
create_temp_repo() {
  log_info "Creating temporary test repository..."

  TEMP_DIR=$(mktemp -d -t agentops-smoke-test.XXXXXX)
  LOG_FILE="$TEMP_DIR/smoke-test.log"

  log_success "Created temp directory: $TEMP_DIR"

  cd "$TEMP_DIR"

  # Initialize npm project
  npm init -y > "$LOG_FILE" 2>&1

  # Initialize git repo (needed for git diff features)
  git init >> "$LOG_FILE" 2>&1
  git config user.email "test@example.com" >> "$LOG_FILE" 2>&1
  git config user.name "Test User" >> "$LOG_FILE" 2>&1

  log_success "Initialized npm project and git repository"
}

# Install collector from tarball
install_collector() {
  local tarball=$1

  log_info "Installing collector from tarball..."

  cd "$TEMP_DIR"
  npm install -D "$tarball" >> "$LOG_FILE" 2>&1 || {
    log_error "Failed to install collector"
    tail -30 "$LOG_FILE"
    exit 1
  }

  log_success "Collector installed"
}

# Run the happy path workflow
run_happy_path() {
  log_info "Running happy path workflow..."

  cd "$TEMP_DIR"

  # Step 1: Initialize agentops
  log_info "  1/6 Running: npx agentops init"
  npx agentops init --server "$SERVER_URL" --dashboardUrl "$DASHBOARD_URL" --yes >> "$LOG_FILE" 2>&1 || {
    log_error "Failed to run agentops init"
    tail -30 "$LOG_FILE"
    exit 1
  }
  log_success "  1/6 Initialized agentops"

  # Step 2: Start dev mode in background
  log_info "  2/6 Starting: npx agentops dev --noOpen --newRun"
  npx agentops dev --noOpen --newRun >> "$LOG_FILE" 2>&1 &
  DEV_PID=$!
  log_success "  2/6 Dev process started (PID: $DEV_PID)"

  # Step 3: Wait for session to be created
  log_info "  3/6 Waiting for session to be created..."
  sleep 3
  log_success "  3/6 Session should be active"

  # Step 4: Create a file change
  log_info "  4/6 Creating file change..."
  echo "test content" > test.txt
  git add test.txt >> "$LOG_FILE" 2>&1 || true
  sleep 1
  echo "modified content" >> test.txt
  log_success "  4/6 File changed"

  # Step 5: Execute a command through agentops
  log_info "  5/6 Running: npx agentops exec -- node -v"
  npx agentops exec -- node -v >> "$LOG_FILE" 2>&1 || {
    log_error "Failed to run agentops exec"
    tail -30 "$LOG_FILE"
    exit 1
  }
  log_success "  5/6 Command executed"

  # Step 6: Wait for events to be processed
  log_info "  6/6 Waiting for events to be processed..."
  sleep 3
  log_success "  6/6 Events should be processed"

  # Stop dev process cleanly
  if [ -n "$DEV_PID" ] && kill -0 "$DEV_PID" 2>/dev/null; then
    log_info "Stopping dev process..."
    kill -SIGINT "$DEV_PID" 2>/dev/null || true
    sleep 2

    # Force kill if still running
    if kill -0 "$DEV_PID" 2>/dev/null; then
      kill -9 "$DEV_PID" 2>/dev/null || true
    fi
    DEV_PID=""
  fi

  log_success "Happy path workflow completed"
}

# Verify via API
verify_api() {
  log_info "Verifying events via API..."

  # Get all runs
  local runs_response
  runs_response=$(curl -sf "$SERVER_URL/api/runs" 2>&1) || {
    log_error "Failed to fetch runs from API"
    echo "$runs_response"
    exit 1
  }

  # Parse runs count using node
  local runs_count
  runs_count=$(node -e "
    const data = $runs_response;
    console.log(data.runs ? data.runs.length : 0);
  " 2>&1) || {
    log_error "Failed to parse runs response"
    echo "$runs_count"
    exit 1
  }

  if [ "$runs_count" -eq 0 ]; then
    log_error "No runs found in API"
    exit 1
  fi

  log_success "Found $runs_count run(s)"

  # Get the newest run ID
  local run_id
  run_id=$(node -e "
    const data = $runs_response;
    if (!data.runs || data.runs.length === 0) {
      console.error('No runs found');
      process.exit(1);
    }
    // Sort by createdAt descending and get first
    const sorted = data.runs.sort((a, b) =>
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
    console.log(sorted[0].id);
  " 2>&1) || {
    log_error "Failed to extract run ID"
    echo "$run_id"
    exit 1
  }

  log_info "Checking events for run: $run_id"

  # Get events for the run
  local events_response
  events_response=$(curl -sf "$SERVER_URL/api/runs/$run_id/events?limit=200" 2>&1) || {
    log_error "Failed to fetch events from API"
    echo "$events_response"
    exit 1
  }

  # Parse and verify events using node
  local verification_result
  verification_result=$(node -e "
    const data = $events_response;

    if (!data.events || !Array.isArray(data.events)) {
      console.error('No events array found');
      process.exit(1);
    }

    const events = data.events;
    const eventTypes = events.map(e => e.type);

    // Count specific event types
    const fsCounts = eventTypes.filter(t => t === 'fs.changed' || t === 'fs.batch').length;
    const toolCounts = eventTypes.filter(t => t === 'tool.called' || t === 'tool.result').length;
    const sessionCounts = eventTypes.filter(t => t === 'session.started' || t === 'session.stopped').length;

    const totalEvents = events.length;

    // We expect at least one of: fs events, tool events, or session events
    const hasExpectedEvents = fsCounts > 0 || toolCounts > 0 || sessionCounts > 0;

    if (!hasExpectedEvents) {
      console.error('No expected events found');
      console.error('Event types:', JSON.stringify(eventTypes));
      process.exit(1);
    }

    // Output results as JSON
    console.log(JSON.stringify({
      runId: '$run_id',
      totalEvents: totalEvents,
      fsEvents: fsCounts,
      toolEvents: toolCounts,
      sessionEvents: sessionCounts
    }));
  " 2>&1) || {
    log_error "Event verification failed"
    echo "$verification_result"
    exit 1
  }

  # Parse verification results
  local run_id_out total_events fs_events tool_events session_events
  run_id_out=$(echo "$verification_result" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.runId);")
  total_events=$(echo "$verification_result" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.totalEvents);")
  fs_events=$(echo "$verification_result" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.fsEvents);")
  tool_events=$(echo "$verification_result" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.toolEvents);")
  session_events=$(echo "$verification_result" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.sessionEvents);")

  log_success "Events verified for run: $run_id_out"
  log_info "  Total events: $total_events"
  log_info "  FS events: $fs_events"
  log_info "  Tool events: $tool_events"
  log_info "  Session events: $session_events"
}

# Main execution
main() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}  AgentOps Collector Smoke Test${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""

  check_server

  local tarball
  tarball=$(pack_collector)

  create_temp_repo
  install_collector "$tarball"
  run_happy_path
  verify_api

  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  SMOKE TEST PASSED ✓${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""

  exit 0
}

main "$@"
