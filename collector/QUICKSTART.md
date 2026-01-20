# AgentOps Collector - Quick Start

## Installation

Install in any repo:

```bash
npm install -D @agentops/collector
```

## Initialize

Create config file (one time per repo):

```bash
npx agentops init
```

This creates:
- `.agentops/config.json` - Repo settings
- Adds `.agentops/` to `.gitignore`

## Prerequisites (Optional)

If running server locally:

1. **Start the server:**
   ```bash
   cd /path/to/agent-ops-dashboard/server
   node index.js
   # Server runs on http://localhost:8787
   ```

2. **Start the dashboard (optional, for visual feedback):**
   ```bash
   cd /path/to/agent-ops-dashboard/playground
   npm run dev
   # Dashboard at http://localhost:5173
   ```

## Basic Usage

All commands work without flags when you have an active session. Config is loaded from `.agentops/config.json`.

### Session Commands

```bash
# Start a session (uses config defaults)
npx agentops start

# Check session status
npx agentops status

# Log a prompt
npx agentops prompt "Help me implement authentication"

# Log a response
npx agentops response "I'll create an auth module..."

# Log notes
npx agentops note "Authentication complete"

# Open dashboard to active session (auto-attaches)
npx agentops open

# Copy dashboard URL to clipboard
npx agentops copy

# Stop the session
npx agentops stop
```

### Clipboard Commands (Fast Workflow)

```bash
# Start a session
npx agentops start

# Copy text in Claude Code UI, then:
npx agentops clip prompt --tool claude-code

# Copy Claude's response, then:
npx agentops clip response --tool claude-code

# Copy any notes:
npx agentops clip note

# Open dashboard
npx agentops open

# Stop when done
npx agentops stop
```

### Watch Files

```bash
# Watch current directory (uses config settings)
npx agentops watch

# Watch with verbose logging
npx agentops watch --verbose

# Watch specific path
npx agentops watch --path ./src

# Custom ignore patterns
npx agentops watch --ignore "node_modules,*.log,tmp"
```

### Execute Commands

```bash
# Run tests
npx agentops exec -- npm test

# Run build
npx agentops exec -- npm run build

# Any shell command
npx agentops exec -- ls -la
```

### Wrap CLI Agents

```bash
# Wrap Claude Code CLI and stream output to dashboard
npx agentops run --agent claude -- claude

# New session with custom title
npx agentops run --newRun --title "Refactor auth" --agent claude -- claude

# Wrap any agent with redaction
npx agentops run --agent codex --redact -- codex "implement feature"
```

## Common Scenarios

### Claude Code Workflow (AI Agent Sessions)

Track your AI coding sessions with Claude Code or any other agent:

**With calm mode (recommended - reduces noise):**
```bash
# 1. Start session with agent profile
npx agentops dev --profile agent

# 2. Use Claude Code normally - file changes are automatically summarized
npx agentops prompt "Help me implement JWT authentication"
# ... Claude responds ...
npx agentops response "I'll create an auth module with JWT tokens..."

# 3. Log notes about your progress
npx agentops note "Claude created auth.js with login/logout"
npx agentops note "Need to add token refresh logic" --level warn

# 4. Run tests
npx agentops exec -- npm test

# 5. Continue the conversation
npx agentops prompt "Add token refresh functionality"
npx agentops response "I'll add a refresh token endpoint..."

# 6. Open dashboard to review
npx agentops open

# 7. Stop the session when done (Ctrl+C)
```

**With full mode (maximum fidelity):**
```bash
# 1. Start a session
npx agentops start

# 2. Check status
npx agentops status

# 3. (Optional) Start file watching in parallel
npx agentops watch &

# 4. Use Claude Code normally, logging as you work
npx agentops prompt "Help me implement JWT authentication"
# ... Claude responds ...
npx agentops response "I'll create an auth module with JWT tokens..."

# 5. Log notes about your progress
npx agentops note "Claude created auth.js with login/logout"
npx agentops note "Need to add token refresh logic" --level warn

# 6. Run tests
npx agentops exec -- npm test

# 7. Continue the conversation
npx agentops prompt "Add token refresh functionality"
npx agentops response "I'll add a refresh token endpoint..."

# 8. Open dashboard to review
npx agentops open

# 9. Stop the session when done
npx agentops stop

# 10. If watch is running, stop it too
fg  # bring to foreground
Ctrl+C
```

**What you get:**
- All prompts, responses, notes in one timeline
- File changes tracked automatically (summarized in agent mode, detailed in full mode)
- Git diffs available if enabled
- Test results and command outputs
- Complete session history in the dashboard

### Fast Clipboard Workflow

For maximum speed, use clipboard commands to avoid typing:

```bash
# 1. Start session
npx agentops start

# 2. In Claude Code:
#    - Type your prompt
#    - Copy it (Cmd+C / Ctrl+C)
npx agentops clip prompt

# 3. Claude responds:
#    - Copy response (Cmd+C / Ctrl+C)
npx agentops clip response

# 4. Repeat steps 2-3 as many times as needed

# 5. Add notes by copying text first:
npx agentops clip note

# 6. Open dashboard anytime:
npx agentops open

# 7. Or copy URL to share:
npx agentops copy

# 8. Stop when done:
npx agentops stop
```

**Benefits:**
- No need to type or paste long prompts/responses
- Just copy and clip - takes 2 seconds
- All text safely logged without cluttering terminal
- Perfect for rapid iteration with Claude Code

**Reading from files:**

```bash
# Log large prompts/responses from files
npx agentops prompt - < my-prompt.txt
npx agentops response - < response.txt

# Or from pipes
cat long-prompt.txt | npx agentops prompt -
```

**Advanced: Multiple tags**

```bash
npx agentops note "Login component completed" --tag frontend --tag auth --tag completed
npx agentops prompt "Review security" --tag security
```

### Development Monitoring

Watch your project while you work:

```bash
cd my-project
npx agentops watch --verbose
# Edit files, watch events stream to dashboard
# Ctrl+C to stop
```

### Test Execution

Capture test output:

```bash
npx agentops exec -- npm test
# View results in dashboard
# Run status automatically marked as error if tests fail
```

### Git Integration

Automatic git diff summaries (enabled by default):

```bash
# Git monitoring uses config settings
# Edit .agentops/config.json to adjust diffInterval
npx agentops watch
```

## Configuration

Edit `.agentops/config.json` to customize defaults:

**Full fidelity mode (default):**
```json
{
  "server": "http://localhost:8787",
  "dashboardUrl": "http://localhost:5173",
  "defaultTitle": "Claude Session",
  "profile": "full",
  "watch": {
    "mode": "auto",
    "ignore": ["node_modules", ".git", "dist"],
    "diffInterval": 5000
  },
  "toolDefaults": {
    "tool": "claude-code",
    "model": "sonnet"
  }
}
```

**Agent-focused calm mode (recommended for AI agents):**
```json
{
  "server": "http://localhost:8787",
  "dashboardUrl": "http://localhost:5173",
  "defaultTitle": "Claude Session",
  "profile": "agent",
  "fsMode": "summary",
  "git": {
    "enabled": false
  },
  "toolDefaults": {
    "tool": "claude-code",
    "model": "sonnet"
  }
}
```

**What calm mode does:**
- Summarizes file changes instead of per-file spam (one event every 5 seconds)
- Disables git monitoring by default (reduces noise)
- Tighter ignore patterns (automatically excludes lockfiles, build output)
- Perfect for AI agents that make lots of file changes

**CLI override examples:**
```bash
# Use agent profile
npx agentops watch --profile agent

# Enable git in agent profile
npx agentops watch --profile agent --git --gitInterval 30000

# Use summary mode manually
npx agentops watch --fsMode summary
```

All commands automatically use these settings. CLI flags override config when needed.

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
