# Agent Ops Collector - Quick Start

## Installation

```bash
cd /path/to/agent-ops-dashboard/collector
chmod +x index.js
npm link  # Optional: make 'agentops' available globally
```

## Prerequisites

1. **Start the server:**
   ```bash
   cd ../server
   node index.js
   # Server runs on http://localhost:8787
   ```

2. **Start the dashboard (optional, for visual feedback):**
   ```bash
   cd ../playground
   npm run dev
   # Dashboard at http://localhost:5173
   ```

## Basic Usage

### Watch Files

```bash
# Watch current directory
agentops watch

# Watch with verbose logging
agentops watch --verbose

# Watch specific path
agentops watch --path ./src

# Custom ignore patterns
agentops watch --ignore "node_modules,*.log,tmp"
```

### Execute Commands

```bash
# Run tests
agentops exec -- npm test

# Run build
agentops exec -- npm run build

# Any shell command
agentops exec -- ls -la
```

## Common Scenarios

### Development Monitoring

Watch your project while you work:

```bash
cd my-project
agentops watch --title "My Project Dev" --verbose
# Edit files, watch events stream to dashboard
# Ctrl+C to stop
```

### Test Execution

Capture test output:

```bash
agentops exec -- npm test
# View results in dashboard
# Run status automatically marked as error if tests fail
```

### Git Integration

Automatic git diff summaries:

```bash
# Git monitoring enabled by default if in git repo
agentops watch --diffInterval 10000  # Check every 10 seconds
```

## Advanced Options

### Custom Server

```bash
agentops watch --server https://my-server.com:8787
```

### API Key Authentication

```bash
agentops watch --apiKey my-secret-key
```

### Reuse Existing Run

```bash
# Create run manually, then use in multiple commands
RUN_ID="my-run-$(date +%s)"
agentops watch --runId $RUN_ID &
agentops exec --runId $RUN_ID -- npm test
```

### No Auto-Complete

Keep run open after watch stops:

```bash
agentops watch --noComplete
# Ctrl+C stops watching but run stays in "running" state
```

## Testing

Run automated tests:

```bash
cd collector
./test-collector.sh
```

## Getting Help

```bash
agentops --help
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Connection refused" | Start server: `cd ../server && node index.js` |
| "Permission denied" | Make executable: `chmod +x index.js` |
| No git events | Ensure git installed and in repo: `git status` |
| Too many events | Add ignore patterns: `--ignore "node_modules,dist,*.log"` |
| 401 Unauthorized | Add API key: `--apiKey <key>` or remove key from server |

## Next Steps

- Read full documentation: [README.md](README.md)
- View implementation details: [IMPLEMENTATION.md](IMPLEMENTATION.md)
- Check the dashboard to see live events
- Try editing files while watching
