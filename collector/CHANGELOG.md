# Changelog

All notable changes to the Agent Ops Collector will be documented in this file.

## [0.1.0] - 2026-01-19

### Added

#### Core Functionality
- CLI tool with `agentops` command
- `watch` command for filesystem and git monitoring
- `exec` command for command execution and output capture
- Zero runtime dependencies (pure Node.js built-ins)

#### Filesystem Watching
- Recursive directory watching with fs.watch()
- Debounced event batching (250ms default)
- Configurable ignore patterns
- Create/modify/delete detection
- Relative path reporting

#### Git Integration
- Automatic git repository detection
- Periodic git status and diff summaries
- Configurable diff check interval (5s default)
- Graceful fallback when git unavailable
- Repo metadata extraction (branch, remote name)

#### Command Execution
- Real-time stdout/stderr streaming
- Exit code capture
- Execution duration tracking
- Output truncation (20KB per stream)
- Automatic error status on failure

#### HTTP Client
- Pure Node.js http/https implementation
- API key authentication support
- JSON request/response handling
- Health endpoint checking

#### Run Management
- Create new runs or use existing run ID
- Automatic run status transitions
- Metadata enrichment (repo, branch, system info)
- Clean shutdown handling

#### Events
- `run.started` - Watch session begins
- `fs.changed` - File operations (create/modify/delete)
- `git.diff` - Git status and diff summaries
- `tool.called` - Command execution starts
- `tool.result` - Command execution completes
- `run.completed` - Session ends
- `run.error` - Error conditions

#### CLI Options
- `--server` - Server URL
- `--title` - Run title
- `--path` - Watch path
- `--ignore` - Ignore patterns
- `--diffInterval` - Git diff interval
- `--apiKey` - API key authentication
- `--runId` - Use existing run
- `--noComplete` - Don't auto-complete run
- `--verbose` - Verbose logging

#### Documentation
- Comprehensive README with examples
- Quick start guide
- Implementation details document
- Troubleshooting guide
- Automated test script

#### Testing
- Automated test script (test-collector.sh)
- Server connectivity checks
- Success and error case validation
- Help command verification

### Technical Details

- **Total code:** ~880 lines of JavaScript
- **Files:** 6 modules + 1 entry point
- **Dependencies:** 0 runtime, Node.js >= 14
- **API compatibility:** Uses existing endpoints unchanged
- **Workspace integration:** Added to pnpm-workspace.yaml

### Architecture

```
index.js          - CLI entry point and command routing
lib/args.js       - Argument parser (zero-dependency)
lib/client.js     - HTTP client for API calls
lib/watcher.js    - Filesystem watching with debouncing
lib/git.js        - Git diff monitoring
lib/watch.js      - Watch command implementation
lib/exec.js       - Exec command implementation
```

### Known Limitations

1. Filesystem watching uses fs.watch() which has platform-specific behavior
2. Git operations spawn subprocesses (overhead ~50ms per operation)
3. No automatic retry logic for network failures
4. Output truncation may cut off relevant information in verbose commands
5. Watch mode on very large directories (10,000+ files) may be slow

### Future Considerations

- Add retry logic for network failures
- Support watching multiple paths in single session
- Add file extension filtering
- Implement smart git diff (only when files changed)
- Support custom event types via plugins
- Configuration file support (.agentopsrc)
- Publish to npm registry

## [Unreleased]

No unreleased changes yet.

---

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
