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

### Session Commands

```bash
# Start a session
agentops start --title "My Session"

# Check session status
agentops status

# Log a prompt
agentops prompt "Help me implement authentication"

# Log a response
agentops response "I'll create an auth module..."

# Log notes
agentops note "Authentication complete" --level info

# Open dashboard to active session
agentops open

# Copy dashboard URL to clipboard
agentops copy

# Stop the session
agentops stop
```

### Clipboard Commands (Fast Workflow)

```bash
# Start a session
agentops start --title "Fast Session"

# Copy text in Claude Code UI, then:
agentops clip prompt --tool claude-code

# Copy Claude's response, then:
agentops clip response --tool claude-code

# Copy any notes:
agentops clip note

# Open dashboard
agentops open

# Stop when done
agentops stop
```

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

### Claude Code Workflow (AI Agent Sessions)

Track your AI coding sessions with Claude Code or any other agent:

```bash
# 1. Start a session
agentops start --title "Implement User Authentication"

# 2. Check status
agentops status

# 3. (Optional) Start file watching in parallel
agentops watch --noComplete &

# 4. Use Claude Code normally, logging as you work
agentops prompt "Help me implement JWT authentication"
# ... Claude responds ...
agentops response "I'll create an auth module with JWT tokens..."

# 5. Log notes about your progress
agentops note "Claude created auth.js with login/logout"
agentops note "Need to add token refresh logic" --level warn

# 6. Run tests
agentops exec -- npm test

# 7. Continue the conversation
agentops prompt "Add token refresh functionality"
agentops response "I'll add a refresh token endpoint..."

# 8. Open dashboard to review
agentops open

# 9. Stop the session when done
agentops stop

# 10. If watch is running, stop it too
fg  # bring to foreground
Ctrl+C
```

**What you get:**
- All prompts, responses, notes in one timeline
- File changes and git diffs tracked automatically (if watch is running)
- Test results and command outputs
- Complete session history in the dashboard

### Fast Clipboard Workflow

For maximum speed, use clipboard commands to avoid typing:

```bash
# 1. Start session
agentops start --title "Fast Claude Session"

# 2. In Claude Code:
#    - Type your prompt
#    - Copy it (Cmd+C / Ctrl+C)
agentops clip prompt --tool claude-code

# 3. Claude responds:
#    - Copy response (Cmd+C / Ctrl+C)
agentops clip response --tool claude-code

# 4. Repeat steps 2-3 as many times as needed

# 5. Add notes by copying text first:
agentops clip note

# 6. Open dashboard anytime:
agentops open

# 7. Or copy URL to share:
agentops copy

# 8. Stop when done:
agentops stop
```

**Benefits:**
- No need to type or paste long prompts/responses
- Just copy and clip - takes 2 seconds
- All text safely logged without cluttering terminal
- Perfect for rapid iteration with Claude Code

**Reading from files:**

```bash
# Log large prompts/responses from files
agentops prompt - < my-prompt.txt
agentops response - < response.txt

# Or from pipes
cat long-prompt.txt | agentops prompt -
```

**Advanced: Multiple tags**

```bash
agentops note "Login component completed" --tag frontend --tag auth --tag completed
agentops prompt "Review security" --tool claude --model claude-sonnet-4.5 --tag security
```

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
