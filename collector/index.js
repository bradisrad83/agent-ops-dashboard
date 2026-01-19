#!/usr/bin/env node

const { parseArgs } = require('./lib/args');
const { watchCommand } = require('./lib/watch');
const { execCommand } = require('./lib/exec');

const HELP_TEXT = `
Agent Ops Collector CLI

Usage:
  agentops watch [options]
  agentops exec [options] -- <command> [args...]

Commands:
  watch     Watch filesystem for changes and emit events (default)
  exec      Execute a command and capture output

Options:
  --server <url>         Server URL (default: http://localhost:8787)
  --title <title>        Run title (default: "Workspace Watch")
  --path <path>          Path to watch (default: .)
  --ignore <patterns>    Comma-separated ignore patterns (default: node_modules,.git,dist,build,coverage)
  --diffInterval <ms>    Git diff check interval in ms (default: 5000)
  --apiKey <key>         API key for authentication (optional)
  --runId <id>           Use existing run ID (optional)
  --noComplete           Don't mark run as completed on exit (watch only)
  --verbose              Enable verbose logging
  --help                 Show this help message

Examples:
  # Start watching current directory
  agentops watch

  # Watch with custom server and title
  agentops watch --server http://localhost:8787 --title "My Project"

  # Watch specific path with custom ignore patterns
  agentops watch --path ./src --ignore "node_modules,*.log,tmp"

  # Execute a command and capture output
  agentops exec -- npm test

  # Execute with existing run ID
  agentops exec --runId my-run-123 -- npm run build

  # Use API key for authentication
  agentops watch --apiKey my-secret-key
`;

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const parsed = parseArgs(args);

  if (parsed.command === 'watch') {
    watchCommand(parsed.options).catch((err) => {
      console.error('Watch command failed:', err.message);
      process.exit(1);
    });
  } else if (parsed.command === 'exec') {
    execCommand(parsed.commandArgs, parsed.options).catch((err) => {
      console.error('Exec command failed:', err.message);
      process.exit(1);
    });
  } else {
    console.error('Unknown command:', parsed.command);
    console.error('Run "agentops --help" for usage information');
    process.exit(1);
  }
}

main();
