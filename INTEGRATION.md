# API-Backed Provider Integration Guide

This document describes the new API-backed provider for Agent Ops Dashboard with live SSE streaming.

## Overview

The implementation consists of:

1. **Frontend Provider** ([package/src/providers/ApiProvider.ts](package/src/providers/ApiProvider.ts))
   - Implements the existing `EventStreamProvider` contract
   - No changes required to `AgentOpsDashboard.vue`
   - REST API for runs and events
   - SSE streaming with automatic fallback to polling

2. **Backend Server** ([server/](server/))
   - Minimal Node.js server with SQLite persistence
   - REST endpoints + SSE streaming
   - Durable storage that survives restarts
   - Monotonic event IDs via SQLite AUTOINCREMENT
   - Event retention policies
   - One dependency: better-sqlite3

## Quick Start

### 1. Install Backend Dependencies

```bash
cd server
npm install
```

This installs `better-sqlite3` for SQLite persistence.

### 2. Start the Backend Server

```bash
# From repo root
npm run server

# OR directly
cd server
node index.js
```

Server runs on http://localhost:8787

On first run, the server creates a SQLite database at `server/data/agentops.sqlite`.

### 3. Start the Dashboard UI

```bash
pnpm -C package dev
```

### 4. Use the API Provider in Your Application

**Without Authentication (Local Dev):**
```typescript
import { AgentOpsDashboard, createApiProvider } from '@your-org/agent-ops-dashboard'

const provider = createApiProvider({
  baseUrl: 'http://localhost:8787'
})

// Pass to dashboard component
<AgentOpsDashboard :provider="provider" />
```

**With Authentication (Production):**
```typescript
const provider = createApiProvider({
  baseUrl: 'https://your-server.com',
  apiKey: process.env.AGENTOPS_API_KEY  // Include API key
})
```

## Architecture

### Frontend: ApiProvider

The `ApiProvider` implements three methods with production-ready robustness:

- **`listRuns()`** - Fetches all runs via `GET /api/runs`
  - Throws descriptive errors on non-200 responses with status snippet

- **`listEvents(runId)`** - Fetches event history via `GET /api/runs/:runId/events?limit=500`
  - Returns up to 500 historical events in ascending order by ID
  - Supports cursor-based pagination

- **`connect(options)`** - Establishes live streaming with duplicate prevention:
  1. **Robust SSE parsing**:
     - Handles chunked reads (partial lines across network packets)
     - Supports multi-line `data:` fields per SSE spec (joined with `\n`)
     - Correctly parses `id:`, `event:`, and `data:` fields
     - Ignores comment lines (heartbeats starting with `:`)
     - Events separated by blank lines (`\n\n` or `\r\n\r\n`)
  2. **Cursor tracking** to prevent duplicates:
     - Tracks `lastCursor` from SSE `id:` field or event payload
     - Only emits events with `id > lastCursor`
     - Works seamlessly across SSE and polling modes
  3. **Automatic fallback to polling** if SSE fails:
     - Uses `GET /api/runs/:runId/events?after=<cursor>&limit=100`
     - Simple backoff on errors (waits one interval before retry)
     - Respects `intervalMs` option (default: 1000ms)
  4. Returns `stop()` function for clean shutdown with `AbortController`

### Backend: Node.js Server

**Database Layer** ([server/db.js](server/db.js)):
- SQLite persistence with `better-sqlite3`
- Monotonic event IDs via AUTOINCREMENT (globally unique across restarts)
- Event retention policy (default: 5000 events per run)
- Cursor-based pagination with `after` parameter
- WAL mode for better concurrency
- Database location: `server/data/agentops.sqlite`

**Storage Layer** ([server/storage.js](server/storage.js)):
- Wraps database layer with same interface as before
- Persists events to SQLite before broadcasting
- In-memory SSE listener management (not persisted)
- All runs and events survive server restarts

**API Endpoints** ([server/index.js](server/index.js)):
- `GET /api/runs` - List all runs (sorted by startedAt descending)
- `POST /api/runs` - Create new run
- `PATCH /api/runs/:runId` - Update run status and/or title
  - Supports partial updates: `{ status?: "running" | "completed" | "error", title?: string }`
  - Returns `404` if run doesn't exist
- `GET /api/runs/:runId/events?limit=N&after=<cursor>` - Get events with cursor pagination
  - `limit`: default 500, max 1000
  - `after`: cursor (event ID) - returns only events with `id > after`
  - Returns empty array `[]` for unknown runId
  - Auto-creates run on POST if it doesn't exist
- `POST /api/runs/:runId/events` - Ingest new event (auto-creates run)
- `GET /api/runs/:runId/stream` - SSE stream (broadcasts new events)

**SSE Implementation** (Production-ready):
- Headers:
  - `Content-Type: text/event-stream; charset=utf-8`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`
  - CORS: `Access-Control-Allow-Origin: *` (dev mode)
- Event format:
  ```
  id: <event.id>
  data: <JSON with newlines escaped>

  ```
- Heartbeat comments every 15s: `: heartbeat <timestamp>`
- Automatic cleanup on disconnect (clears timer, removes listener)
- Safe error handling (won't crash on write errors)

## Testing

### Automated Test Script

```bash
./server/test-server.sh
```

This creates a run, posts events, fetches them, and verifies all endpoints.

### Manual Testing with HTML Client

Open [server/test-client.html](server/test-client.html) in a browser:

1. Create a run
2. Post events
3. Watch live stream
4. Verify all features work

### Manual cURL Commands

```bash
# Create run
curl -X POST http://localhost:8787/api/runs \
  -H "content-type: application/json" \
  -d '{"title":"My Run"}'

# Post event
curl -X POST http://localhost:8787/api/runs/<RUN_ID>/events \
  -H "content-type: application/json" \
  -d '{"type":"tool.called","payload":{"toolName":"ReadFile"}}'

# Fetch events
curl http://localhost:8787/api/runs/<RUN_ID>/events?limit=50

# Stream events (keep running, post events in another terminal)
curl -N http://localhost:8787/api/runs/<RUN_ID>/stream
```

## Provider Configuration

### ApiProvider Options

```typescript
interface ApiProviderConfig {
  baseUrl?: string        // Default: "http://localhost:8787"
  fetchImpl?: typeof fetch  // Injectable for testing
  apiKey?: string         // Optional API key for authentication
}
```

When `apiKey` is provided, all requests include `x-api-key` header.

### Connection Options

```typescript
interface EventStreamOptions {
  runId?: string           // Run to connect to
  onEvent: (event: AgentOpsEvent) => void
  intervalMs?: number      // Polling interval (default: 1000ms)
}
```

## SSE vs Polling

The provider automatically handles the streaming strategy:

1. **SSE (Preferred)**:
   - Real-time event delivery
   - Efficient server push
   - Automatic reconnection
   - Used when browser supports `ReadableStream`

2. **Polling (Fallback)**:
   - Periodic `GET` requests with cursor
   - Uses `after` parameter to fetch only new events
   - Activated if SSE fails or is unavailable

## Database Management

### Location

Database file: `server/data/agentops.sqlite`

### Reset Database

```bash
rm -f server/data/agentops.sqlite*
```

### Event Retention

Control max events per run via environment variable:

```bash
EVENT_RETENTION_MAX=10000 node index.js  # Keep 10k events per run
EVENT_RETENTION_MAX=0 node index.js      # Unlimited (no pruning)
```

Default: 5000 events per run

### Persistence Verification

Test that data survives restarts:

```bash
cd server
./test-persistence.sh
```

## Production Considerations

The current implementation uses SQLite for persistence. For production:

1. **Storage Scaling**: For multi-server deployments:
   - Keep SQLite for single-server setups (it's fast and reliable)
   - For distributed systems, migrate to PostgreSQL/MongoDB
   - The database layer in [server/db.js](server/db.js) can be swapped out
   - Keep the same interface (`appendEvent`, `listEvents`, etc.)

2. **Authentication**: ✅ **Now Available**
   - Set `AGENTOPS_API_KEY` environment variable to enable authentication
   - All endpoints require `x-api-key` header when enabled
   - Use `createApiProvider({ apiKey: 'your-key' })` in client code
   - For multi-tenant: extend auth to scope runs per user/organization

3. **Scaling**:
   - SQLite handles 100k+ writes/sec with WAL mode (sufficient for most use cases)
   - For multi-server SSE, use Redis Pub/Sub for event broadcasting
   - Add rate limiting for API endpoints
   - Event retention is already implemented (configurable via `EVENT_RETENTION_MAX`)

4. **Backups**:
   - SQLite database can be backed up while running
   - Use `cp server/data/agentops.sqlite backups/` for simple backups
   - For continuous backups, use tools like Litestream

6. **Monitoring**:
   - Log API requests
   - Track SSE connection counts
   - Monitor database file size (`ls -lh server/data/agentops.sqlite`)

## File Structure

```
/
├── package/src/
│   └── providers/
│       └── ApiProvider.ts          # Frontend provider implementation
├── server/
│   ├── index.js                    # HTTP server with API endpoints
│   ├── db.js                       # SQLite database layer
│   ├── storage.js                  # Storage layer (wraps db.js)
│   ├── data/                       # Database storage
│   │   └── agentops.sqlite         # SQLite database (created on first run)
│   ├── package.json                # Server package.json (better-sqlite3)
│   ├── README.md                   # Server documentation
│   ├── test-server.sh              # API endpoint tests
│   ├── test-persistence.sh         # Persistence verification tests
│   └── test-client.html            # Manual testing UI
└── package.json                    # Root scripts (npm run server)
```

## Verified Functionality

- ✅ REST endpoints (GET/POST runs and events)
- ✅ SSE streaming with heartbeat
- ✅ Event broadcasting to connected clients
- ✅ Event pagination with `after` cursor
- ✅ Automatic SSE → polling fallback
- ✅ Proper cleanup on disconnect
- ✅ CORS support for local development
- ✅ Zero frontend changes to `AgentOpsDashboard.vue`
- ✅ Provider exports from package index
- ✅ Comprehensive documentation
- ✅ SQLite persistence (data survives restarts)
- ✅ Monotonic event IDs across restarts
- ✅ Event retention policies
- ✅ Cursor pagination works across restarts

## Next Steps

1. Update your consuming application to use `createApiProvider()`
2. Start both server and dashboard UI
3. Verify the integration with your specific use case
4. Plan production storage backend (if needed)
