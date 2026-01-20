#!/usr/bin/env node

const { parseArgs } = require('./lib/args');
const { watchCommand } = require('./lib/watch');
const { execCommand } = require('./lib/exec');
const { startCommand } = require('./lib/start');
const { stopCommand } = require('./lib/stop');
const { noteCommand } = require('./lib/note');
const { promptCommand } = require('./lib/prompt');
const { responseCommand } = require('./lib/response');
const { statusCommand } = require('./lib/status');
const { openCommand } = require('./lib/open');
const { clipCommand } = require('./lib/clip');
const { copyCommand } = require('./lib/copy');
const { tailCommand } = require('./lib/tail');
const { vscodeLogsCommand } = require('./lib/vscode-logs');
const { vscodeTailCommand } = require('./lib/vscode-tail');
const { initCommand } = require('./lib/init');
const { devCommand } = require('./lib/dev');
const { loadConfig, mergeConfig } = require('./lib/config');
const { SessionManager } = require('./lib/session');

const HELP_TEXT = `
Agent Ops Collector CLI

Usage:
  agentops init [options]
  agentops dev [options]
  agentops watch [options]
  agentops exec [options] -- <command> [args...]
  agentops start [options]
  agentops stop [options]
  agentops status
  agentops open [options]
  agentops copy [options]
  agentops note <text> [options]
  agentops prompt <text> [options]
  agentops response <text> [options]
  agentops clip <note|prompt|response> [options]
  agentops tail [options]
  agentops vscode logs [options]
  agentops vscode tail [options]

Commands:
  init        Initialize AgentOps in a repo (creates config + gitignore)
  dev         Start/resume session + watch + open dashboard (one command!)
  watch       Watch filesystem for changes and emit events
  exec        Execute a command and capture output
  start       Start a new session
  stop        Stop the active session
  status      Show active session info
  open        Open dashboard to active run
  copy        Copy dashboard URL to clipboard
  note        Log a note to the active session
  prompt      Log an LLM prompt to the active session
  response    Log an LLM response to the active session
  clip        Log clipboard contents as note/prompt/response
  tail        Tail a log file and emit events
  vscode logs List available VS Code log files
  vscode tail Tail VS Code logs (auto-detect or specify file)

Session Commands:
  init [options]
    --server <url>       Server URL (default: http://localhost:8787)
    --dashboardUrl <url> Dashboard URL (default: http://localhost:5173)
    --yes                Overwrite existing config file

  dev [options]
    One command to start/resume session + watch + open dashboard
    --title <title>      Session title (default: repo name + date)
    --open               Open dashboard (default: true)
    --noOpen             Don't open dashboard
    --watch              Enable watch (default: true)
    --noWatch            Disable watch
    --newRun             Force new session (stop existing)
    --mode <mode>        Watch mode: auto|native|poll (default: auto)
    --path <path>        Watch path (default: .)
    --ignore <patterns>  Ignore patterns (comma-separated)
    --diffInterval <ms>  Git diff interval (default: 5000)
    --pollInterval <ms>  Poll interval for poll mode (default: 1000)
    --server <url>       Server URL (default: http://localhost:8787)
    --dashboardUrl <url> Dashboard URL (default: http://localhost:5173)
    --apiKey <key>       API key for authentication (optional)

  start [options]
    --title <title>      Session title (default: repo name + date)
    --server <url>       Server URL (default: http://localhost:8787)
    --apiKey <key>       API key for authentication (optional)

  stop [options]
    --status <status>    Status: completed|error (default: completed)
    --errorMessage <msg> Error message if status is error
    --server <url>       Override server URL
    --apiKey <key>       API key for authentication
    --runId <id>         Override run ID

  note <text> [options]
    --level <level>      Level: debug|info|warn|error (default: info)
    --tag <tag>          Add tag (can be used multiple times)
    --server <url>       Override server URL
    --apiKey <key>       API key for authentication
    --runId <id>         Override run ID
    Use "-" as text to read from stdin

  prompt <text> [options]
    --tool <name>        Tool name (e.g., claude, codex, cursor)
    --model <name>       Model name
    --tag <tag>          Add tag (can be used multiple times)
    --server <url>       Override server URL
    --apiKey <key>       API key for authentication
    --runId <id>         Override run ID
    Use "-" as text to read from stdin

  response <text> [options]
    --tool <name>        Tool name (e.g., claude, codex, cursor)
    --model <name>       Model name
    --tag <tag>          Add tag (can be used multiple times)
    --server <url>       Override server URL
    --apiKey <key>       API key for authentication
    --runId <id>         Override run ID
    Use "-" as text to read from stdin

  status
    Show information about the active session

  open [options]
    --print              Print URL instead of opening browser
    --runId <id>         Override run ID
    --server <url>       Override server URL
    --dashboardUrl <url> Override dashboard URL (default: http://localhost:5173)

  copy [options]
    --runId <id>         Override run ID
    --dashboardUrl <url> Override dashboard URL (default: http://localhost:5173)

  clip <note|prompt|response> [options]
    Reads clipboard and logs as specified type

    For 'note':
      --level <level>    Level: debug|info|warn|error (default: info)
      --tag <tag>        Add tag (can be used multiple times)

    For 'prompt' and 'response':
      --tool <name>      Tool name (e.g., claude-code)
      --model <name>     Model name
      --tag <tag>        Add tag (can be used multiple times)

    Common options:
      --server <url>     Override server URL
      --apiKey <key>     API key for authentication
      --runId <id>       Override run ID

Tail Options:
  tail [options]
    --file <path>        Log file to tail (required)
    --runId <id>         Override run ID
    --server <url>       Override server URL
    --apiKey <key>       API key for authentication
    --follow             Follow file (default: true)
    --fromStart          Read from start of file (default: false)
    --interval <ms>      Poll interval in ms (default: 500)
    --maxLine <chars>    Max line length (default: 4000)
    --filter <regex>     Filter lines by regex
    --level <level>      Event level: debug|info|warn|error (default: info)
    --tag <tag>          Add tag (can be used multiple times)
    --redact             Redact sensitive tokens

VS Code Log Options:
  vscode logs [options]
    --json               Output JSON format
    --limit <num>        Max files to show (default: 20)

  vscode tail [options]
    --file <path>        Specific log file to tail
    --pick <index>       Pick file from detected list (1-based index)
    --filter <regex>     Filter lines by regex
    --redact             Redact sensitive tokens
    --level <level>      Event level (default: info)
    --tag <tag>          Add tag (can be used multiple times)
    --runId <id>         Override run ID
    --server <url>       Override server URL
    --apiKey <key>       API key for authentication

Watch Options:
  --server <url>         Server URL (default: http://localhost:8787)
  --title <title>        Run title (default: "Workspace Watch")
  --path <path>          Path to watch (default: .)
  --ignore <patterns>    Comma-separated ignore patterns (default: node_modules,.git,dist,build,coverage)
  --diffInterval <ms>    Git diff check interval in ms (default: 5000)
  --apiKey <key>         API key for authentication (optional)
  --runId <id>           Use existing run ID (optional)
  --noComplete           Don't mark run as completed on exit (watch only)
  --verbose              Enable verbose logging

Exec Options:
  --server <url>         Server URL (default: http://localhost:8787)
  --apiKey <key>         API key for authentication (optional)
  --runId <id>           Use existing run ID (optional)
  --verbose              Enable verbose logging

Examples:
  # Quick Start (Recommended)
  # Initialize in a new repo
  agentops init

  # Start dev mode (creates/resumes session + watch + opens dashboard)
  agentops dev

  # Work with Claude, log as needed
  agentops clip prompt
  agentops clip response

  # Press Ctrl+C to stop

  # Manual workflow
  # Start a session
  agentops start --title "Claude Session"

  # Check session status
  agentops status

  # Log notes and prompts
  agentops note "starting work on authentication"
  agentops prompt "implement user login"
  agentops response "I'll create the login component..."

  # Read from file
  agentops prompt - < my-prompt.txt
  agentops response - < my-response.txt

  # Fast Claude workflow with clipboard
  # 1. Copy Claude prompt from UI
  agentops clip prompt --tool claude-code
  # 2. Copy Claude response from UI
  agentops clip response --tool claude-code
  # 3. Open dashboard
  agentops open

  # Copy dashboard URL
  agentops copy

  # Stop session
  agentops stop

  # Start watching current directory
  agentops watch

  # Execute a command
  agentops exec -- npm test

  # Use API key for authentication
  agentops start --apiKey my-secret-key

  # VS Code logging (optional, best-effort)
  # List available VS Code log files
  agentops vscode logs

  # Tail VS Code logs with auto-detection
  agentops vscode tail --redact --filter "Claude|tool|error"

  # Tail a specific log file
  agentops tail --file /path/to/log.txt --redact
`;

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const parsed = parseArgs(args);

  // Load config and session data
  const repoRoot = SessionManager.getRepoRoot();
  const { config, configPath } = loadConfig(repoRoot);

  // Load active session if exists
  const sessionManager = new SessionManager(repoRoot);
  const sessionData = sessionManager.hasActiveSession()
    ? sessionManager.loadSession()
    : null;

  // Merge config with CLI options and session data
  const options = mergeConfig(parsed.options, config, sessionData);

  if (parsed.command === 'init') {
    initCommand(options).catch((err) => {
      console.error('Init command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'dev') {
    devCommand(options).catch((err) => {
      console.error('Dev command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'watch') {
    watchCommand(options).catch((err) => {
      console.error('Watch command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'exec') {
    execCommand(parsed.commandArgs, options).catch((err) => {
      console.error('Exec command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'start') {
    startCommand(options).catch((err) => {
      console.error('Start command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'stop') {
    stopCommand(options).catch((err) => {
      console.error('Stop command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'note') {
    noteCommand(parsed.commandArgs, options).catch((err) => {
      console.error('Note command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'prompt') {
    promptCommand(parsed.commandArgs, options).catch((err) => {
      console.error('Prompt command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'response') {
    responseCommand(parsed.commandArgs, options).catch((err) => {
      console.error('Response command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'status') {
    statusCommand(options).catch((err) => {
      console.error('Status command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'open') {
    openCommand(options).catch((err) => {
      console.error('Open command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'clip') {
    clipCommand(parsed.commandArgs, options).catch((err) => {
      console.error('Clip command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'copy') {
    copyCommand(options).catch((err) => {
      console.error('Copy command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'tail') {
    tailCommand(options).catch((err) => {
      console.error('Tail command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'vscode') {
    // Handle vscode subcommands
    const subcommand = parsed.commandArgs[0];
    if (subcommand === 'logs') {
      vscodeLogsCommand(options).catch((err) => {
        console.error('VS Code logs command failed:', err.message);
        process.exit(1);
      });
    } else if (subcommand === 'tail') {
      vscodeTailCommand(options).catch((err) => {
        console.error('VS Code tail command failed:', err.message);
        process.exit(1);
      });
    } else {
      console.error('Unknown vscode subcommand:', subcommand);
      console.error('Valid subcommands: logs, tail');
      process.exit(1);
    }
  } else {
    console.error('Unknown command:', parsed.command);
    console.error('Run "agentops --help" for usage information');
    process.exit(1);
  }
}

main();
