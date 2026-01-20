# AgentOps Quick Start

Get started with AgentOps in seconds with the magical `dev` command.

## Installation

```bash
npm install -g agentops
# or
npx agentops
```

## Quick Start (Recommended)

The fastest way to get started is with the `dev` command, which handles everything in one go:

```bash
# 1. Initialize AgentOps in your repo (first time only)
npx agentops init

# 2. Start dev mode (creates/resumes session + watches files + opens dashboard)
npx agentops dev
```

That's it! The `dev` command will:
- Create a new session (or resume an existing one)
- Start watching your files for changes
- Open the dashboard in your browser
- Keep running until you press Ctrl+C

## Claude Workflow Example

Here's a typical workflow when working with Claude or other AI coding assistants:

```bash
# Start AgentOps dev mode
npx agentops dev

# Work with Claude, make changes to your code...
# Files are automatically tracked

# Log specific interactions:
npx agentops clip prompt    # Logs copied prompt from clipboard
npx agentops clip response  # Logs copied response from clipboard

# Or manually log notes:
npx agentops note "Fixed the authentication bug"

# When done, stop the session
# Press Ctrl+C to stop (run will be marked as completed)
```

## Dev Command Options

The `dev` command supports various options for customization:

```bash
# Start with a custom title
npx agentops dev --title "My Feature Work"

# Start without opening the dashboard
npx agentops dev --noOpen

# Start without file watching (session only)
npx agentops dev --noWatch

# Force a new session (stop existing)
npx agentops dev --newRun

# Use polling mode for file watching (useful on Linux or large repos)
npx agentops dev --mode poll

# Watch a specific directory
npx agentops dev --path ./src

# Ignore specific patterns
npx agentops dev --ignore "*.log,tmp/**"

# Connect to a different server
npx agentops dev --server https://my-server.com

# Use a different dashboard URL
npx agentops dev --dashboardUrl http://localhost:3000
```

## Manual Workflow (Advanced)

If you prefer more control, you can use individual commands:

```bash
# Initialize config (first time only)
npx agentops init

# Start a session
npx agentops start --title "My Work Session"

# Start watching files
npx agentops watch

# Log your work
npx agentops note "Starting to implement feature X"
npx agentops prompt "How do I implement authentication?"
npx agentops response "Here's how to implement authentication..."

# Execute and log commands
npx agentops exec -- npm test

# Open the dashboard
npx agentops open

# Copy dashboard URL to clipboard
npx agentops copy

# Stop the session when done
npx agentops stop
```

## Configuration

Create a `.agentops/config.json` file in your repo to customize defaults:

```json
{
  "server": "http://localhost:8787",
  "dashboardUrl": "http://localhost:5173",
  "defaultTitle": "My Project",
  "watch": {
    "mode": "auto",
    "path": ".",
    "ignore": ["node_modules", ".git", "dist", "build", "coverage"],
    "diffInterval": 5000,
    "pollInterval": 1000
  },
  "redact": true,
  "toolDefaults": {
    "tool": "claude-code",
    "model": "sonnet"
  }
}
```

You can also use `.agentops/config.jsonc` for a config file with comments.

## Tips

- The `dev` command automatically resumes your session if you restart it
- Use `--newRun` if you want to start fresh and stop the previous session
- File watching supports three modes:
  - `auto` (default): Try native fs.watch, fall back to polling if needed
  - `native`: Use native fs.watch (faster, but may fail on large repos)
  - `poll`: Use polling (slower, but more reliable on Linux/large repos)
- Press Ctrl+C to cleanly stop the session and mark the run as completed

## Next Steps

- View all available commands: `npx agentops --help`
- Check session status: `npx agentops status`
- Explore the dashboard to see your logged events, file changes, and git diffs
- Integrate AgentOps into your AI coding workflow for better observability

## Troubleshooting

**Session already exists error:**
```bash
# Either resume it with:
npx agentops dev

# Or force a new session:
npx agentops dev --newRun
```

**File watching not working:**
```bash
# Try polling mode:
npx agentops dev --mode poll
```

**Dashboard not opening:**
```bash
# Make sure the dashboard is running on http://localhost:5173
# Or specify a different URL:
npx agentops dev --dashboardUrl http://localhost:3000
```

## Support

For more information, visit the [AgentOps repository](https://github.com/your-org/agentops) or run `npx agentops --help`.
