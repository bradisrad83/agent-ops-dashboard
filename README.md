# Agent Ops Dashboard

Real-time observability dashboard for AI agents. Track file changes, git diffs, command execution, LLM prompts/responses, and custom events from your AI coding agents like Claude, Cursor, or Codex.

## Features

- **Real-time event tracking**: File changes, git diffs, command execution, LLM interactions
- **Session management**: Start/stop/resume sessions with persistent state
- **Zero runtime dependencies**: Collector uses only Node.js built-ins
- **Cross-platform**: Works on macOS, Linux, and Windows
- **Dashboard UI**: Beautiful real-time visualization of agent activities
- **Fast API server**: Built with Hono and SQLite for high performance

## Try it in 60 seconds

### 1. Start the backend services

```bash
# Clone the repository
git clone <your-repo-url>
cd agent-ops-dashboard

# Install dependencies
pnpm install

# Start the API server (Terminal 1)
npm run server

# Start the dashboard UI (Terminal 2)
pnpm -C package dev
```

The server will run on [http://localhost:8787](http://localhost:8787) and the dashboard on [http://localhost:5173](http://localhost:5173).

### 2. Install the collector in any repo

In a separate terminal, navigate to any repository you want to monitor:

```bash
# Install the collector
npm install -D @agentops/collector

# Initialize AgentOps in your repo
npx agentops init

# Start dev mode (creates session + watches files + opens dashboard)
npx agentops dev
```

That's it! The dashboard will open automatically and start showing your file changes, git diffs, and any commands you run.

### 3. Work with your AI agent

While `agentops dev` is running, all file changes are automatically tracked. You can also:

```bash
# Log LLM interactions (in another terminal)
npx agentops clip prompt     # Copy Claude's prompt, then run this
npx agentops clip response   # Copy Claude's response, then run this

# Execute commands with tracking
npx agentops exec -- npm test
npx agentops exec -- git status

# Add custom notes
npx agentops note "Starting authentication feature"
```

Press `Ctrl+C` to stop the session when done.

## Project Structure

```
agent-ops-dashboard/
├── collector/          # CLI tool for collecting events (publishable npm package)
│   ├── index.js        # Main CLI entry point
│   ├── lib/            # Core functionality
│   └── package.json    # @agentops/collector package
├── server/             # Hono + SQLite API server
│   ├── index.js        # Server entry point
│   ├── db.js           # Database layer
│   └── routes/         # API routes
├── package/            # React + Vite dashboard UI
│   └── src/
│       ├── components/ # UI components
│       └── App.tsx     # Main dashboard
└── scripts/            # Build and test scripts
    └── smoke-install.sh # End-to-end install verification
```

## Development

### Running the full stack locally

```bash
# Terminal 1: API Server
npm run server

# Terminal 2: Dashboard UI (dev mode with HMR)
npm run ui

# Terminal 3: Test collector in any repo
cd /path/to/your/repo
npm install -D /path/to/agent-ops-dashboard/collector
npx agentops dev
```

### Available npm scripts

**Root scripts:**
- `npm run server` - Start API server
- `npm run ui` - Start dashboard UI in dev mode
- `npm run ui:build` - Build dashboard UI for production
- `npm run collector:pack` - Pack collector as tarball (simulates npm publish)
- `npm run collector:dev` - Run collector dev command
- `npm run collector:init` - Run collector init command
- `npm run collector:watch` - Run collector watch command
- `npm run collector:exec` - Run collector exec command

**Collector scripts:**
- `cd collector && npm run pack` - Create publishable tarball

### Testing the full install flow

The smoke test simulates a real user installing and using the collector:

```bash
# Make sure server is running first
npm run server

# In another terminal, run the smoke test
bash scripts/smoke-install.sh
```

The smoke test will:
1. Check server health
2. Pack the collector into a tarball
3. Create a temp repository
4. Install the collector from the tarball
5. Run the full workflow (init → dev → file changes → exec → stop)
6. Verify events via API
7. Print PASS/FAIL with event counts

## Publishing the Collector

The collector is designed to be published as `@agentops/collector` on npm.

### Pre-publish checklist

1. Update version in [collector/package.json](collector/package.json)
2. Update [collector/CHANGELOG.md](collector/CHANGELOG.md)
3. Test local install:
   ```bash
   npm run collector:pack
   # Install in a test repo
   npm install -D /path/to/agent-ops-dashboard/collector/agentops-collector-*.tgz
   ```
4. Run smoke test: `bash scripts/smoke-install.sh`
5. Ensure all tests pass and events are tracked correctly

### Publishing

```bash
cd collector
npm publish
```

After publishing, users can install with:

```bash
npm install -D @agentops/collector
```

## Troubleshooting

### Port already in use

If you see `EADDRINUSE` errors:

- **Server (port 8787)**: Another process is using port 8787
  ```bash
  # Find and kill the process
  lsof -ti:8787 | xargs kill -9
  ```

- **Dashboard (port 5173)**: Another Vite dev server is running
  ```bash
  # Find and kill the process
  lsof -ti:5173 | xargs kill -9
  ```

### better-sqlite3 native module issues

If you see errors about `better-sqlite3` or native modules:

```bash
# Rebuild native modules
cd server
npm rebuild better-sqlite3

# Or reinstall
npm install
```

This is common when:
- Switching Node.js versions
- Moving between different architectures (Intel ↔ Apple Silicon)
- After system updates

### Linux clipboard requirements

On Linux, clipboard functionality requires either `xclip` (X11) or `wl-clipboard` (Wayland):

```bash
# Ubuntu/Debian
sudo apt-get install xclip          # For X11
sudo apt-get install wl-clipboard   # For Wayland

# Arch Linux
sudo pacman -S xclip                # For X11
sudo pacman -S wl-clipboard         # For Wayland

# Fedora
sudo dnf install xclip              # For X11
sudo dnf install wl-clipboard       # For Wayland
```

Without these tools, `agentops clip` and `agentops copy` commands will fail gracefully.

### Git not installed

The collector's git diff features will degrade gracefully if git is not installed:

- File watching will still work
- Git diff events won't be captured
- Commands will still be tracked

To enable full functionality, install git:

```bash
# macOS
brew install git

# Ubuntu/Debian
sudo apt-get install git

# Windows
# Download from https://git-scm.com/download/win
```

### Collector can't find config

If `npx agentops dev` says "No config found":

```bash
# Make sure you're in a repo directory
pwd

# Initialize agentops
npx agentops init --yes

# This creates .agentops/config.json in your repo root
```

### Server not reachable

If the collector can't reach the server:

```bash
# Check if server is running
curl http://localhost:8787/health

# If not, start it
npm run server

# Check the server URL in your config
cat .agentops/config.json
```

### Dashboard shows no data

If the dashboard is empty:

1. Verify server is running: `curl http://localhost:8787/health`
2. Check if you have an active session: `npx agentops status`
3. Create some activity:
   ```bash
   echo "test" > test.txt
   npx agentops exec -- node -v
   ```
4. Check API directly: `curl http://localhost:8787/api/runs`

### Permission denied errors

If you see `EACCES` or permission errors:

```bash
# Collector index.js not executable
chmod +x collector/index.js

# Or reinstall
cd collector
npm install
```

## Architecture

### Collector

The collector is a standalone Node.js CLI tool with zero runtime dependencies. It:
- Uses native `fs.watch` with automatic fallback to polling on unstable filesystems
- Batches file changes intelligently to reduce noise
- Tracks git diffs periodically using `git status` and `git diff`
- Captures command output and exit codes
- Stores session state in `.agentops/session.json` (git-ignored)
- Sends events to the server via HTTP POST

### Server

Built with [Hono](https://hono.dev/) for the API and SQLite for storage. It:
- Stores runs, events, and metadata in a single SQLite database
- Provides REST APIs for CRUD operations
- Serves the dashboard UI in production
- Runs on port 8787 by default

### Dashboard

React + Vite + TailwindCSS dashboard that:
- Shows runs in a sortable/filterable list
- Displays events in real-time with syntax highlighting
- Uses React Query for efficient data fetching
- Updates automatically via polling (WebSocket support planned)

## API Reference

### Runs

- `GET /api/runs` - List all runs
- `GET /api/runs/:id` - Get run by ID
- `POST /api/runs` - Create a new run
- `PUT /api/runs/:id` - Update run metadata
- `DELETE /api/runs/:id` - Delete a run

### Events

- `GET /api/runs/:id/events` - Get events for a run
- `POST /api/runs/:id/events` - Create an event

See [server/routes/](server/routes/) for full API documentation.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run the smoke test: `bash scripts/smoke-install.sh`
6. Submit a pull request

## License

MIT

## Support

- **Issues**: [GitHub Issues](<your-repo-url>/issues)
- **Discussions**: [GitHub Discussions](<your-repo-url>/discussions)
- **Docs**: See [collector/README.md](collector/README.md) for collector-specific documentation

---

Built with ❤️ for AI-assisted development workflows.
