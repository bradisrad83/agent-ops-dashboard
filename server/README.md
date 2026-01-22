# Agent Ops Dashboard Server

Minimal Node.js backend server for the Agent Ops Dashboard with SSE streaming support.

## Features

- REST API for runs and events
- Server-Sent Events (SSE) for live streaming with auto-reconnect
- **SSE Resume Support** - Resume streams from last event via Last-Event-ID header
- SQLite persistence (data survives restarts)
- Monotonic event IDs via AUTOINCREMENT
- Event retention policy (configurable)
- Cursor-based pagination
- **Health Endpoint** - Monitor server and database health
- **Request Logging** - Lightweight request/response logging
- **Run Lifecycle Metadata** - Track completion time, errors, and custom metadata
- Minimal dependencies (better-sqlite3 only)

## Getting Started

### Install Dependencies

```bash
cd server
npm install
```

This installs `better-sqlite3` for SQLite persistence.

### Start the Server

```bash
node index.js
```

The server will start on port 8787 (configurable via `PORT` environment variable).

**First Run:** The server automatically creates a SQLite database at `server/data/agentops.sqlite` on startup.

### Environment Variables

- `PORT` - Server port (default: 8787)
- `AGENTOPS_API_KEY` - Optional API key for authentication
  - If not set: authentication is DISABLED (local dev mode)
  - If set: all API endpoints require `x-api-key` header
- `EVENT_RETENTION_MAX` - Maximum events per run (default: 5000)
  - When a run exceeds this limit, oldest events are pruned
  - Set to 0 to disable retention (unlimited)
- `AGENTOPS_LOG_LEVEL` - Logging level (default: info)
  - Set to `quiet` to disable request logging
- `VERSION` - Optional version string for health endpoint (default: dev)

### Authentication

Authentication is optional and controlled via the `AGENTOPS_API_KEY` environment variable:

**Local Development (Default - No Auth):**
```bash
node index.js
# All endpoints are open, no authentication required
```

**Production (With Auth):**
```bash
AGENTOPS_API_KEY=your-secret-key node index.js
# All endpoints require x-api-key header
```

When authentication is enabled, all requests must include the header:
```bash
curl -H "x-api-key: your-secret-key" http://localhost:8787/api/runs
```

Requests without the header (or with incorrect key) will receive `401 Unauthorized`.

### Start the UI

```bash
pnpm -C package dev
```

## API Endpoints

### Health

- **GET** `/health` - Server and database health check
  - Returns server status, timestamp, database status, and version
  - Requires authentication if `AGENTOPS_API_KEY` is set
  ```bash
  curl http://localhost:8787/health
  ```

  **Response:**
  ```json
  {
    "status": "ok",
    "time": 1768854394029,
    "db": "ok",
    "version": "dev"
  }
  ```

### Runs

- **GET** `/api/runs` - List all runs
  - Returns array of runs with lifecycle metadata
  - **Response fields:**
    - `id` - Run identifier
    - `title` - Run title
    - `startedAt` - ISO 8601 timestamp
    - `status` - Current status (`running`, `completed`, `error`)
    - `endedAt` - (Optional) ISO 8601 timestamp when run completed/errored
    - `errorMessage` - (Optional) Error message if status is `error`
    - `metadata` - (Optional) Custom metadata object

- **POST** `/api/runs` - Create a new run
  ```bash
  curl -X POST http://localhost:8787/api/runs \
    -H "content-type: application/json" \
    -d '{"title":"My Test Run","status":"running"}'
  ```

- **PATCH** `/api/runs/:runId` - Update run with lifecycle semantics
  - Supports partial updates (send only fields to update)
  - Returns `404` if run doesn't exist
  - **Lifecycle semantics:**
    - When status changes to `completed` or `error`, automatically sets `endedAt` timestamp
    - `errorMessage` field is stored when provided
    - `metadata` field accepts any JSON object

  ```bash
  # Mark run as completed
  curl -X PATCH http://localhost:8787/api/runs/<RUN_ID> \
    -H "content-type: application/json" \
    -d '{"status":"completed"}'

  # Mark run as error with message
  curl -X PATCH http://localhost:8787/api/runs/<RUN_ID> \
    -H "content-type: application/json" \
    -d '{"status":"error","errorMessage":"Connection timeout"}'

  # Update with custom metadata
  curl -X PATCH http://localhost:8787/api/runs/<RUN_ID> \
    -H "content-type: application/json" \
    -d '{"metadata":{"tags":["experiment","ml"],"cost":0.45}}'
  ```

  **Supported status values:** `running`, `completed`, `error`

### Events

- **GET** `/api/runs/:runId/events?limit=500&after=0` - Get events for a run
  - `limit`: Maximum number of events to return (default: 500, max: 1000)
  - `after`: Return only events after this cursor/event ID (for pagination)
  - Returns events in ascending order by ID
  - Returns empty array `[]` for unknown runId

- **POST** `/api/runs/:runId/events` - Add an event to a run
  - Auto-creates the run if it doesn't exist
  - Returns the created event with assigned ID
  - **Auto-updates run status** on terminal events:
    - `type: "run.completed"` → Sets status to `completed` and `endedAt` timestamp
    - `type: "run.error"` or `type: "error"` → Sets status to `error`, `endedAt`, and `errorMessage` from payload
  ```bash
  curl -X POST http://localhost:8787/api/runs/<RUN_ID>/events \
    -H "content-type: application/json" \
    -d '{"type":"tool.called","payload":{"toolName":"ReadFile","message":"Reading config"}}'

  # Completion event (auto-updates run status)
  curl -X POST http://localhost:8787/api/runs/<RUN_ID>/events \
    -H "content-type: application/json" \
    -d '{"type":"run.completed","payload":{"message":"Finished successfully"}}'

  # Error event (auto-updates run status with error message)
  curl -X POST http://localhost:8787/api/runs/<RUN_ID>/events \
    -H "content-type: application/json" \
    -d '{"type":"run.error","payload":{"message":"Connection timeout"}}'
  ```

### Streaming (SSE)

- **GET** `/api/runs/:runId/stream` - Server-Sent Events stream for live events
  - Auto-creates the run if it doesn't exist
  - SSE format includes `id:` field for each event (use for cursor tracking)
  - Heartbeat comments every 15 seconds: `: heartbeat <timestamp>`
  - Proper headers: `text/event-stream; charset=utf-8`, `no-cache, no-transform`
  - **SSE Resume Support:**
    - Send `Last-Event-ID: <cursor>` header to resume from a specific event
    - Or use query param: `?after=<cursor>`
    - Server streams historical events first (capped at 1000), then live events
    - Prevents duplicate events on reconnect

  ```bash
  # Initial connection
  curl -N http://localhost:8787/api/runs/<RUN_ID>/stream

  # Resume from last event ID 42
  curl -N -H "Last-Event-ID: 42" http://localhost:8787/api/runs/<RUN_ID>/stream

  # Resume using query parameter
  curl -N "http://localhost:8787/api/runs/<RUN_ID>/stream?after=42"
  ```

**SSE Event Format:**
```
: connected

id: 123
data: {"id":"123","runId":"run-xyz","type":"tool.called","ts":"2026-01-19T...","payload":{...}}

: heartbeat 1768854394029

id: 124
data: {"id":"124","runId":"run-xyz","type":"tool.result","ts":"2026-01-19T...","payload":{...}}

```

## Testing

### 1. Create a run

```bash
curl -X POST http://localhost:8787/api/runs \
  -H "content-type: application/json" \
  -d '{"title":"Test Run"}'
```

Response:
```json
{
  "id": "run-1234567890-abc123",
  "title": "Test Run",
  "startedAt": "2026-01-19T...",
  "status": "running"
}
```

### 2. Post events to the run

```bash
curl -X POST http://localhost:8787/api/runs/<RUN_ID>/events \
  -H "content-type: application/json" \
  -d '{"type":"run.started","payload":{"message":"Starting execution"}}'

curl -X POST http://localhost:8787/api/runs/<RUN_ID>/events \
  -H "content-type: application/json" \
  -d '{"type":"tool.called","payload":{"toolName":"ReadFile","message":"Reading input"}}'

curl -X POST http://localhost:8787/api/runs/<RUN_ID>/events \
  -H "content-type: application/json" \
  -d '{"type":"tool.result","payload":{"toolName":"ReadFile","result":"Success"}}'
```

### 3. View events

```bash
# Get all events
curl http://localhost:8787/api/runs/<RUN_ID>/events

# Get only new events after cursor (pagination)
curl "http://localhost:8787/api/runs/<RUN_ID>/events?after=3&limit=10"
```

### 4. Stream live events (in separate terminal)

```bash
curl -N http://localhost:8787/api/runs/<RUN_ID>/stream
```

Then post more events and watch them appear in the stream.

## Using with the Dashboard

To use the API-backed provider in your application:

**Without Authentication (Local Dev):**
```typescript
import { AgentOpsDashboard } from '@your-org/agent-ops-dashboard'
import { createApiProvider } from '@your-org/agent-ops-dashboard/providers'

const provider = createApiProvider({
  baseUrl: 'http://localhost:8787'
})

// Use the dashboard component with the provider
```

**With Authentication (Production):**
```typescript
const provider = createApiProvider({
  baseUrl: 'https://your-server.com',
  apiKey: 'your-secret-key'  // Include API key
})
```

The ApiProvider automatically:
- Fetches run lists and event history via REST API
- Attempts SSE streaming for live events
- **Auto-reconnects** on disconnect with exponential backoff (250ms → 5000ms cap)
- **Resumes streams** using Last-Event-ID header to prevent duplicate events
- Tracks last cursor to avoid emitting duplicate events
- Includes `x-api-key` header in all requests when `apiKey` is configured

## Database Management

### Database Location

The SQLite database is stored at:
```
server/data/agentops.sqlite
```

Additional files created by SQLite (WAL mode):
- `agentops.sqlite-wal` (Write-Ahead Log)
- `agentops.sqlite-shm` (Shared Memory)

### Reset Database

To start fresh and delete all runs/events:

```bash
rm -f server/data/agentops.sqlite*
```

The database will be recreated automatically on next server start.

### Backup Database

To backup your data:

```bash
cp server/data/agentops.sqlite backups/agentops-$(date +%Y%m%d).sqlite
```

### Event Retention

By default, each run keeps the newest 5000 events. Older events are automatically pruned when new events are added.

To change retention:

```bash
EVENT_RETENTION_MAX=10000 node index.js
```

To disable retention (keep all events):

```bash
EVENT_RETENTION_MAX=0 node index.js
```

### Database Schema

**Schema Migrations:**
The server automatically adds new columns on startup if they don't exist (backward compatible migrations).

**runs table:**
```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  title TEXT,
  started_at INTEGER NOT NULL,   -- epoch milliseconds
  status TEXT,                    -- 'running'|'completed'|'error'
  ended_at INTEGER NULL,          -- epoch milliseconds (auto-set on terminal status)
  error_message TEXT NULL,        -- error description
  metadata TEXT NULL              -- JSON string for custom metadata
);
```

**events table:**
```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  ts INTEGER NOT NULL,            -- epoch milliseconds
  type TEXT NOT NULL,
  level TEXT,                     -- 'info'|'warn'|'error'
  agent_id TEXT,
  task_id TEXT,
  payload TEXT NOT NULL,          -- JSON string
  FOREIGN KEY(run_id) REFERENCES runs(id)
);

CREATE INDEX idx_events_run_id_id ON events(run_id, id);
```

## Persistence Verification

To verify that data persists across server restarts:

```bash
./test-persistence.sh
```

This script:
1. Creates a run and adds events
2. Stops the server
3. Restarts the server
4. Verifies all data is still present
5. Confirms event IDs continue monotonically
6. Tests cursor pagination
