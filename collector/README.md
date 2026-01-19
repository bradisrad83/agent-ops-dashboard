# Agent Ops Collector

CLI tool to collect file changes, git diffs, and command execution events for the Agent Ops Dashboard.

## Features

- **Filesystem watching**: Recursively monitors directories for file changes (create/modify/delete)
- **Git diff tracking**: Periodic git status and diff summaries
- **Command execution**: Capture command output and exit codes
- **Debounced events**: Batches rapid file changes to reduce noise
- **Zero runtime dependencies**: Uses only Node.js built-ins

## Installation

### Local Development

From the repo root:

```bash
# Install dependencies (if any are added later)
cd collector
npm install

# Make CLI executable
chmod +x index.js

# Link for global usage (optional)
npm link
```

### As Dependency in Another Project

```bash
npm install -D /path/to/agent-ops-dashboard/collector
```

Or once published:

```bash
npm install -D @agent-ops/collector
```

## Quick Start

### 1. Start the Agent Ops Server

From the repo root:

```bash
cd server
npm install
node index.js
```

The server will start on `http://localhost:8787` by default.

### 2. Start the Dashboard UI

In another terminal:

```bash
cd playground  # or wherever the dashboard app is located
npm install
npm run dev
```

Open the dashboard in your browser (typically `http://localhost:5173`).

### 3. Run the Collector

In your project directory:

```bash
# Watch mode (default)
agentops watch

# Or with explicit command
agentops watch --title "My Project Watch"
```

You should now see events appearing live in the dashboard!

## Commands

### `watch` - Watch Filesystem & Git Changes

Monitors the workspace for file changes and emits events to the backend.

```bash
agentops watch [options]
```

**Options:**

- `--server <url>` - Server URL (default: `http://localhost:8787`)
- `--title <title>` - Run title (default: `"Workspace Watch"`)
- `--path <path>` - Path to watch (default: `.`)
- `--ignore <patterns>` - Comma-separated ignore patterns (default: `node_modules,.git,dist,build,coverage`)
- `--diffInterval <ms>` - Git diff check interval in milliseconds (default: `5000`)
- `--apiKey <key>` - API key for authentication (optional)
- `--runId <id>` - Use existing run ID instead of creating new one (optional)
- `--noComplete` - Don't mark run as completed on exit (optional)
- `--verbose` - Enable verbose logging

**Examples:**

```bash
# Watch current directory with defaults
agentops watch

# Watch specific path
agentops watch --path ./src

# Custom ignore patterns
agentops watch --ignore "node_modules,*.log,tmp,cache"

# Connect to remote server
agentops watch --server https://my-server.com:8787 --apiKey my-secret

# Use existing run
agentops watch --runId my-run-123

# Verbose logging
agentops watch --verbose
```

**Events Emitted:**

- `run.started` - When watch begins (includes system info)
- `fs.changed` - File created/modified/deleted
- `git.diff` - Periodic git status and diff summaries
- `run.completed` - When watch stops (Ctrl+C)

**Stop Watching:**

Press `Ctrl+C` to stop. The collector will:
1. Stop filesystem and git monitoring
2. Post `run.completed` event
3. Mark run as completed (unless `--noComplete` is set)
4. Exit cleanly

### `exec` - Execute Command

Runs a command and captures its output, sending execution events to the backend.

```bash
agentops exec [options] -- <command> [args...]
```

**Note:** The `--` separator is required to distinguish collector options from the command being executed.

**Options:**

- `--server <url>` - Server URL (default: `http://localhost:8787`)
- `--apiKey <key>` - API key for authentication (optional)
- `--runId <id>` - Use existing run ID (optional)
- `--verbose` - Enable verbose logging

**Examples:**

```bash
# Run tests
agentops exec -- npm test

# Run build
agentops exec -- npm run build

# Run with existing run ID
agentops exec --runId my-run-123 -- npm test

# Custom script
agentops exec -- python script.py --arg1 value1

# Shell command
agentops exec -- bash -c "echo hello && ls -la"
```

**Events Emitted:**

- `tool.called` - Before command execution (includes command and cwd)
- `tool.result` - After execution (includes exit code, duration, stdout/stderr snippets)
- `run.error` - If command fails (exit code != 0)

**Output Capture:**

- stdout/stderr are streamed to terminal in real-time
- Captured output is truncated to 20KB per stream
- Exit code determines run status (0 = completed, non-zero = error)

## Architecture

### Directory Structure

```
collector/
├── index.js              # CLI entry point
├── lib/
│   ├── args.js          # Argument parsing
│   ├── client.js        # HTTP client for API calls
│   ├── watcher.js       # Filesystem watching
│   ├── git.js           # Git diff monitoring
│   ├── watch.js         # Watch command implementation
│   └── exec.js          # Exec command implementation
├── package.json
└── README.md
```

### How It Works

1. **HTTP Client** (`lib/client.js`):
   - Uses Node.js `http`/`https` modules
   - Implements `createRun()`, `patchRun()`, `postEvent()` methods
   - Adds `x-api-key` header when API key provided

2. **File Watcher** (`lib/watcher.js`):
   - Uses `fs.watch()` with recursive directory scanning
   - Debounces changes (250ms) to batch rapid updates
   - Respects ignore patterns
   - Detects create/modify/delete operations

3. **Git Monitor** (`lib/git.js`):
   - Checks if git is available via `git --version`
   - Runs `git status --porcelain` and `git diff --stat`
   - Emits events at configurable intervals
   - Truncates large outputs to 10KB
   - Gracefully disables if git not available

4. **Event Flow**:
   ```
   File Change → Watcher → Debounce → Event → HTTP Client → API → SQLite → SSE → Dashboard
   ```

## API Integration

The collector uses the existing Agent Ops API:

### Create Run
```
POST /api/runs
{
  "id": "watch-123456-abc",
  "title": "My Watch Session",
  "startedAt": "2026-01-19T...",
  "status": "running"
}
```

### Post Event
```
POST /api/runs/:runId/events
{
  "type": "fs.changed",
  "level": "info",
  "agentId": "collector",
  "payload": {
    "file": "src/index.js",
    "kind": "modified",
    "timestamp": "2026-01-19T..."
  }
}
```

### Update Run
```
PATCH /api/runs/:runId
{
  "status": "completed",
  "metadata": {
    "repoName": "my-repo",
    "branch": "main",
    "cwd": "/path/to/project",
    "collectorVersion": "0.1.0"
  }
}
```

## Authentication

If the server has `AGENTOPS_API_KEY` environment variable set, all requests require authentication:

```bash
# Set on server
export AGENTOPS_API_KEY=my-secret-key

# Use in collector
agentops watch --apiKey my-secret-key
```

Without API key configured on server, all endpoints are open (development mode).

## Event Types

The collector emits these event types:

| Event Type | Description | Payload |
|------------|-------------|---------|
| `run.started` | Watch session started | System info (hostname, user, platform, etc.) |
| `fs.changed` | File created/modified/deleted | `{ file, kind, timestamp }` |
| `git.diff` | Git status/diff summary | `{ statusPorcelain, diffStat, timestamp }` |
| `tool.called` | Command execution started | `{ toolName, command, cwd, timestamp }` |
| `tool.result` | Command execution finished | `{ toolName, exitCode, durationMs, stdout, stderr }` |
| `run.completed` | Watch/exec session ended | `{ reason, timestamp }` |
| `run.error` | Command failed | `{ error, command, exitCode, timestamp }` |

## Troubleshooting

### Server Connection Failed

**Error:** `Failed to connect to server: ECONNREFUSED`

**Solutions:**
- Ensure server is running: `cd server && node index.js`
- Check server port: default is 8787
- Verify URL: `--server http://localhost:8787`

### Permission Denied

**Error:** `EACCES: permission denied`

**Solutions:**
- Make CLI executable: `chmod +x collector/index.js`
- Check file permissions in watched directory
- Don't run as root unless necessary

### Git Monitoring Not Working

**Symptoms:** No git diff events appearing

**Solutions:**
- Ensure `git` is installed: `git --version`
- Ensure you're in a git repository: `git status`
- Check `--diffInterval` is not too large
- Enable verbose logging: `--verbose`

### Authentication Required

**Error:** `HTTP 401: Unauthorized`

**Solutions:**
- Get API key from server admin
- Pass API key: `--apiKey <key>`
- Or disable auth on server (remove `AGENTOPS_API_KEY` env var)

### Too Many Events

**Issue:** Dashboard overwhelmed with file changes

**Solutions:**
- Add more ignore patterns: `--ignore "node_modules,.git,dist,*.log,tmp"`
- Increase debounce in code (edit `lib/watcher.js` `debounceMs`)
- Watch a smaller path: `--path ./src`

### Events Not Appearing Live

**Issue:** Events only appear after page refresh

**Solutions:**
- Check SSE connection in browser DevTools (Network tab)
- Verify server is sending SSE headers correctly
- Check browser console for errors
- Try refreshing the dashboard

## Database Management

### View Database Contents

```bash
cd server
sqlite3 data/agentops.sqlite

# View runs
sqlite> SELECT * FROM runs;

# View recent events
sqlite> SELECT * FROM events ORDER BY id DESC LIMIT 10;

# Exit
sqlite> .quit
```

### Clear Database

```bash
cd server
rm data/agentops.sqlite
# Database will be recreated on next server start
```

Or via SQL:

```bash
sqlite3 data/agentops.sqlite "DELETE FROM events; DELETE FROM runs; VACUUM;"
```

## Advanced Usage

### Multiple Collectors

Run multiple collectors against the same server:

```bash
# Terminal 1: Watch backend
cd backend
agentops watch --title "Backend Watch" --path ./src

# Terminal 2: Watch frontend
cd frontend
agentops watch --title "Frontend Watch" --path ./src
```

Each creates a separate run visible in the dashboard.

### Continuous Integration

Use in CI pipelines:

```bash
#!/bin/bash
# Start collector in background
agentops watch --server $AGENTOPS_SERVER --apiKey $AGENTOPS_KEY --noComplete &
COLLECTOR_PID=$!

# Run your CI tasks
npm test
npm run build

# Stop collector
kill $COLLECTOR_PID
```

### Chaining Commands

```bash
# Run multiple commands in sequence
agentops exec -- npm install && \
agentops exec -- npm test && \
agentops exec -- npm run build
```

Each command creates events in separate runs unless `--runId` is shared.

## Limitations

- **Filesystem watching**: Uses `fs.watch()`, which has platform-specific behavior
  - macOS: Native FSEvents (very efficient)
  - Linux: inotify (efficient but may hit limits on large directories)
  - Windows: ReadDirectoryChangesW (can be slow on large directories)

- **Git operations**: Spawns git processes, so performance depends on repo size

- **Output capture**: Exec command truncates stdout/stderr to 20KB per stream

- **No retry logic**: Network failures will be logged but not retried (for simplicity)

## Future Enhancements

Potential improvements (not yet implemented):

- [ ] Add retry logic for network failures
- [ ] Support watching multiple paths in single session
- [ ] Add filtering by file extension (e.g., only watch `*.js` files)
- [ ] Implement smart batching for git diff (only when files actually changed)
- [ ] Add support for custom event types
- [ ] Publish to npm registry

## Development

### Testing Locally

```bash
# 1. Start server
cd server
node index.js

# 2. Start dashboard (optional, for visual feedback)
cd playground
npm run dev

# 3. Test collector in any directory
cd /tmp/test-project
/path/to/collector/index.js watch --verbose

# 4. Make changes
echo "test" > test.txt
git add test.txt
git commit -m "test"
```

### Adding New Event Types

1. Define event type in main package: `package/src/types/events.ts`
2. Emit from collector using `client.postEvent()`
3. Dashboard will automatically display new event types

### Debugging

Enable verbose logging:

```bash
agentops watch --verbose
agentops exec --verbose -- npm test
```

This shows:
- API request/response details
- File watcher activity
- Git monitoring status
- Event posting confirmations

## License

MIT

## Support

For issues, questions, or contributions:
- GitHub: [agent-ops-dashboard](https://github.com/your-org/agent-ops-dashboard)
- Documentation: [server/README.md](../server/README.md)
