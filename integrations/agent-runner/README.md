# Agent Runner - Real-World CLI Integration

A simple CLI tool that generates real runs and events for the Agent Ops Dashboard, demonstrating how to integrate with the backend API from an actual process.

## Features

- ✅ No external dependencies (uses only built-in Node.js modules)
- ✅ Creates runs and streams structured events in real-time
- ✅ Demonstrates all event types (logs, metrics, tool calls, agent tasks)
- ✅ Proper error handling with terminal events
- ✅ Metadata updates during run execution
- ✅ Configurable via CLI flags
- ✅ Cross-platform (macOS/Linux/Windows with Node.js)

## Prerequisites

1. **Start the backend server:**
   ```bash
   # From repo root
   npm run server

   # Server will run on http://localhost:8787
   ```

2. **Start the dashboard UI (optional, for viewing):**
   ```bash
   # From repo root
   pnpm -C package dev

   # UI will be available at http://localhost:5173
   ```

## Usage

### Basic Usage

```bash
cd integrations/agent-runner
node index.js
```

This will create a run with default settings and execute 10 steps.

### Command-Line Options

```bash
node index.js [options]

Options:
  --server <url>      Server URL (default: http://localhost:8787)
  --title <string>    Run title (default: "Agent Test Run")
  --steps <number>    Number of steps to execute (default: 10)
  --interval <ms>     Interval between steps in ms (default: 500)
  --apiKey <key>      Optional API key for authentication
  --failAt <step>     Fail at specific step number (for testing error path)
  --help, -h          Show help message
```

## Example Commands

### 1. Success Run (Default)

```bash
node index.js
```

Output:
```
🤖 Agent Runner Starting...
   Server: http://localhost:8787
   Title: Agent Test Run
   Steps: 10
   Interval: 500ms

📝 Creating run...
✅ Run created: <run-id>

🚀 Posting run.started event...
✅ Run started

📊 Updating metadata...
✅ Metadata updated

🔄 Executing 10 steps...
   Step 1/10
   Step 2/10
   ...
✅ All steps completed

🎉 Posting run.completed event...
✅ Run completed successfully

📊 View in dashboard: http://localhost:5173
   Run ID: <run-id>
```

### 2. Custom Title and Steps

```bash
node index.js --title "My Custom Run" --steps 20 --interval 300
```

### 3. Forced Error (Testing Error Path)

```bash
node index.js --title "Error Test" --failAt 5
```

This will execute steps 1-4 successfully, then fail at step 5 with an error.

Output:
```
🤖 Agent Runner Starting...
   Server: http://localhost:8787
   Title: Error Test
   Steps: 10
   Interval: 500ms
   ⚠️  Will fail at step: 5

...
🔄 Executing 10 steps...
   Step 1/10
   Step 2/10
   Step 3/10
   Step 4/10
   Step 5/10

❌ Error occurred: Simulated failure at step 5

📝 Posting run.error event...
✅ Error recorded

📊 View in dashboard: http://localhost:5173
   Run ID: <run-id>
```

### 4. With API Key (Production)

First, start the server with authentication enabled:

```bash
cd server
AGENTOPS_API_KEY=your-secret-key node index.js
```

Then run the CLI with the API key:

```bash
node index.js --apiKey your-secret-key --title "Authenticated Run"
```

### 5. Quick Stress Test

Run multiple concurrent runs:

```bash
# Terminal 1
node index.js --title "Run A" --steps 15 &

# Terminal 2
node index.js --title "Run B" --steps 15 &

# Terminal 3
node index.js --title "Run C" --steps 15 &
```

## What It Does

The agent runner demonstrates a complete run lifecycle:

1. **Creates a run** via `POST /api/runs`
2. **Posts a "run.started" event** to mark the beginning
3. **Updates metadata** early in execution (cost estimate, tags, etc.)
4. **Executes N steps**, posting various event types:
   - **Log events** with `task.progress` type
   - **Tool call events** (`tool.called` + `tool.result`)
   - **Metric events** (latency measurements)
   - **Agent task events** (tasks with running/done status)
5. **On success**: Posts `run.completed` terminal event
6. **On failure**: Posts `run.error` event + PATCHes run status

## Event Types Demonstrated

The CLI generates these event types to showcase different monitoring scenarios:

- `run.started` - Run initialization
- `task.progress` - Step-by-step progress logs
- `tool.called` - Tool invocations (ReadFile, WriteFile, etc.)
- `tool.result` - Tool execution results
- `run.completed` - Successful completion
- `run.error` - Error/failure state

## Viewing Results

1. Open the dashboard at http://localhost:5173
2. The run will appear in the sidebar with:
   - Title you specified
   - Current status (running/completed/error)
   - Timestamp
3. Click on the run to see:
   - Live event stream
   - Event details with payloads
   - Error messages (if failed)
   - Metadata (cost, tags, etc.)

## Implementation Details

### HTTP Helper (No Dependencies)

The CLI includes a zero-dependency HTTP helper that:
- Supports JSON request/response
- Adds `x-api-key` header when provided
- Handles non-2xx responses with descriptive errors
- Works with both HTTP and HTTPS

```javascript
await httpRequest('http://localhost:8787/api/runs', {
  method: 'POST',
  body: { title: 'My Run' },
  apiKey: 'optional-key'
})
```

### Terminal Events

The server automatically updates run status when it receives terminal events:

- **`run.completed`** → Sets `status: "completed"` and `endedAt` timestamp
- **`run.error`** → Sets `status: "error"`, `endedAt`, and extracts `errorMessage`

The CLI also sends a PATCH request as a fallback to ensure status is updated even if event mapping changes.

### Error Handling

On error, the CLI:
1. Posts a `run.error` event with error message and stack trace
2. PATCHes the run with `status: "error"` and `errorMessage`
3. Exits with code 1

This ensures the dashboard always reflects the correct run state.

## Integration Pattern

This CLI demonstrates the recommended pattern for integrating with Agent Ops Dashboard:

```javascript
// 1. Create run
const run = await POST /api/runs { title }

// 2. Post run.started event
await POST /api/runs/:runId/events { type: "run.started", ... }

// 3. Update metadata (optional)
await PATCH /api/runs/:runId { metadata: { cost, tags, ... } }

// 4. Stream events as work happens
await POST /api/runs/:runId/events { type: "task.progress", ... }
await POST /api/runs/:runId/events { type: "tool.called", ... }
// ... more events

// 5a. On success: Post run.completed
await POST /api/runs/:runId/events { type: "run.completed", ... }

// 5b. On error: Post run.error + PATCH status
await POST /api/runs/:runId/events { type: "run.error", payload: { message } }
await PATCH /api/runs/:runId { status: "error", errorMessage }
```

## Troubleshooting

### Server Not Running

```
Error: Request failed: connect ECONNREFUSED 127.0.0.1:8787
```

**Solution**: Start the backend server first:
```bash
npm run server
```

### Authentication Error

```
Error: HTTP 401: {"error":"unauthorized"}
```

**Solution**: Either:
1. Disable auth (don't set `AGENTOPS_API_KEY` on server)
2. Or pass the API key: `--apiKey your-secret-key`

### Events Not Appearing

**Check**:
1. Server is running and healthy: `curl http://localhost:8787/health`
2. Run was created successfully (CLI prints run ID)
3. Dashboard is connected to the correct server (check browser console)

## Files

- `index.js` - Main CLI implementation
- `README.md` - This file

## License

Same as parent project.
