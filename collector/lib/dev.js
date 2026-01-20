const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { ApiClient } = require('./client');
const { SessionManager } = require('./session');
const { FileWatcher } = require('./watcher');
const { PollingWatcher } = require('./polling-watcher');
const { GitMonitor } = require('./git');
const { buildDashboardUrl } = require('./open');
const { execSync } = require('child_process');

/**
 * Opens a URL in the default browser (cross-platform)
 */
function openUrlInBrowser(url) {
  const platform = os.platform();

  try {
    if (platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
      return true;
    }

    if (platform === 'linux') {
      try {
        execSync('which xdg-open', { stdio: 'ignore' });
        execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }

    if (platform === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore', shell: true });
      return true;
    }

    return false;
  } catch (err) {
    return false;
  }
}

/**
 * Starts the watch functionality and returns a cleanup function
 */
async function startWatch(client, activeRunId, watchPath, options) {
  const ignoreList = Array.isArray(options.watch?.ignore)
    ? options.watch.ignore
    : (options.ignore
      ? options.ignore.split(',').map(s => s.trim())
      : ['node_modules', '.git', 'dist', 'build', 'coverage']);

  const diffInterval = options.watch?.diffInterval || 5000;
  const verbose = options.verbose || false;
  const mode = options.watch?.mode || options.mode || 'auto';
  const pollInterval = options.watch?.pollInterval || 1000;
  const noBatch = options.noBatch || options.watch?.noBatch || false;

  // Start git monitor
  const gitMonitor = new GitMonitor(watchPath, {
    diffInterval,
    verbose,
    onDiff: async (event) => {
      try {
        await client.postEvent(activeRunId, event);
        if (verbose) {
          console.log('Git diff event posted');
        }
      } catch (err) {
        console.error('Failed to post git diff event:', err.message);
      }
    }
  });

  // Configure watcher options
  const watcherOptions = {
    ignore: ignoreList,
    verbose,
    debounceMs: 250,
    batchMode: !noBatch,
    onEvent: async (event) => {
      try {
        await client.postEvent(activeRunId, {
          ...event,
          level: 'info',
          agentId: 'collector'
        });
        if (verbose) {
          if (event.type === 'fs.batch') {
            console.log('File batch event posted:', event.payload.count, 'changes');
          } else {
            console.log('File change event posted:', event.payload.file, event.payload.kind);
          }
        }
      } catch (err) {
        console.error('Failed to post file change event:', err.message);
      }
    }
  };

  // Determine which watcher to use
  let watcher;
  let activeMode = mode;

  if (mode === 'poll') {
    // Force polling mode
    watcher = new PollingWatcher(watchPath, {
      ...watcherOptions,
      pollInterval
    });
    activeMode = 'poll';
  } else if (mode === 'native') {
    // Force native mode
    watcher = new FileWatcher(watchPath, watcherOptions);
    activeMode = 'native';
  } else {
    // Auto mode: try native, fallback to poll on error
    watcher = new FileWatcher(watchPath, {
      ...watcherOptions,
      onError: async (error) => {
        console.warn('Native watcher failed:', error.message);
        console.log('Switching to polling mode...');

        // Post warning event
        try {
          await client.postEvent(activeRunId, {
            type: 'watch.warning',
            level: 'warning',
            agentId: 'collector',
            payload: {
              reason: error.reason || 'Native watcher failed',
              errorCode: error.code,
              errorMessage: error.message,
              modeSwitchedTo: 'poll',
              timestamp: new Date().toISOString()
            }
          });
        } catch (err) {
          console.error('Failed to post warning event:', err.message);
        }

        // Stop native watcher
        watcher.stop();

        // Switch to polling
        watcher = new PollingWatcher(watchPath, {
          ...watcherOptions,
          pollInterval
        });
        activeMode = 'poll';
        watcher.start();
      }
    });
    activeMode = 'native';
  }

  // Start watching
  watcher.start();
  gitMonitor.start();

  // Return cleanup function and mode
  return {
    mode: activeMode,
    cleanup: () => {
      watcher.stop();
      gitMonitor.stop();
    }
  };
}

/**
 * Main dev command implementation
 */
async function devCommand(options) {
  const repoRoot = SessionManager.getRepoRoot();
  const repoName = SessionManager.getRepoName(repoRoot);
  const branch = SessionManager.getBranch();
  const sessionManager = new SessionManager(repoRoot);

  const server = options.server;
  const apiKey = options.apiKey || null;
  const watchPath = path.resolve(options.watch?.path || options.path || '.');

  const defaultTitle = options.defaultTitle || `${repoName} dev session`;
  const title = options.title || defaultTitle;

  // Determine if we should open dashboard (default: yes)
  const shouldOpen = options.noOpen ? false : (options.open === true || options.open === undefined);

  // Determine if we should watch (default: yes)
  const shouldWatch = options.noWatch ? false : (options.watch === true || options.watch === undefined || typeof options.watch === 'object');

  // Determine if we should create a new run
  const forceNewRun = options.newRun || false;

  // Banner
  console.log('AgentOps Dev Mode');
  console.log('─────────────────────────────────────');

  // Session creation / resume logic
  let activeRunId;
  let isNewSession = false;

  if (sessionManager.hasActiveSession() && !forceNewRun) {
    // Resume existing session
    const existing = sessionManager.loadSession();
    activeRunId = existing.runId;
    isNewSession = false;

    console.log('Resuming session:', repoName);
    console.log('  Run ID:', activeRunId);
    console.log('  Title:', existing.title);
    console.log('  Started:', new Date(existing.startedAt).toLocaleString());
  } else {
    // Create new session
    if (sessionManager.hasActiveSession() && forceNewRun) {
      // Stop old session if --newRun was specified
      const oldSession = sessionManager.loadSession();
      console.log('Stopping previous session:', oldSession.runId);

      const client = new ApiClient(server, apiKey);
      try {
        await client.postEvent(oldSession.runId, {
          type: 'session.stopped',
          level: 'info',
          payload: {
            reason: 'New dev session started with --newRun',
            timestamp: new Date().toISOString()
          }
        });
        await client.patchRun(oldSession.runId, { status: 'completed' });
      } catch (err) {
        console.warn('Warning: Could not stop previous session:', err.message);
      }

      sessionManager.deleteSession();
    }

    const client = new ApiClient(server, apiKey);

    // Health check
    try {
      await client.health();
    } catch (err) {
      console.error('Failed to connect to server:', server);
      console.error('Error:', err.message);
      process.exit(1);
    }

    // Create run
    activeRunId = `session-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const startedAt = Date.now();

    try {
      await client.createRun({
        id: activeRunId,
        title,
        startedAt: new Date(startedAt).toISOString(),
        status: 'running'
      });
    } catch (err) {
      console.error('Failed to create run:', err.message);
      process.exit(1);
    }

    // Update metadata
    try {
      await client.patchRun(activeRunId, {
        metadata: {
          repoRoot,
          repoName,
          branch,
          cwd: watchPath,
          tool: 'dev',
          session: true,
          collectorVersion: '0.1.0'
        }
      });
    } catch (err) {
      console.warn('Warning: Failed to update run metadata:', err.message);
    }

    // Post session.started event
    try {
      await client.postEvent(activeRunId, {
        type: 'session.started',
        level: 'info',
        payload: {
          title,
          repoName,
          branch,
          cwd: watchPath,
          hostname: os.hostname(),
          user: os.userInfo().username,
          platform: os.platform(),
          pid: process.pid
        }
      });
    } catch (err) {
      console.warn('Warning: Failed to post session.started event:', err.message);
    }

    // Save session
    const sessionData = {
      server,
      runId: activeRunId,
      title,
      startedAt,
      apiKeyPresent: !!apiKey,
      collectorVersion: '0.1.0'
    };

    try {
      sessionManager.saveSession(sessionData);
    } catch (err) {
      console.error('Failed to save session:', err.message);
      process.exit(1);
    }

    isNewSession = true;
    console.log('New session started:', repoName);
    console.log('  Run ID:', activeRunId);
    console.log('  Title:', title);
  }

  console.log('  Server:', server);
  if (branch) {
    console.log('  Branch:', branch);
  }
  console.log('');

  // Initialize client for watch
  const client = new ApiClient(server, apiKey);

  // Start watch if enabled
  let watchCleanup = null;
  let watchMode = null;

  if (shouldWatch) {
    const watchResult = await startWatch(client, activeRunId, watchPath, options);
    watchCleanup = watchResult.cleanup;
    watchMode = watchResult.mode;

    console.log('Watching:', watchPath);
    console.log('  Mode:', watchMode);
  }

  // Open dashboard if enabled
  if (shouldOpen) {
    const dashboardUrl = buildDashboardUrl(activeRunId, options);
    const opened = openUrlInBrowser(dashboardUrl);

    if (opened) {
      console.log('Dashboard opened:', dashboardUrl);
    } else {
      console.log('Dashboard:', dashboardUrl);
    }
  }

  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');

  // Graceful shutdown
  const cleanup = async () => {
    console.log('\nStopping dev session...');

    // Stop watch if it was started
    if (watchCleanup) {
      watchCleanup();
    }

    // Post session.stopped event
    try {
      await client.postEvent(activeRunId, {
        type: 'session.stopped',
        level: 'info',
        payload: {
          reason: 'User stopped dev session',
          timestamp: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error('Failed to post session.stopped event:', err.message);
    }

    // Complete the run
    try {
      await client.patchRun(activeRunId, {
        status: 'completed'
      });
      console.log('Session stopped. Run completed:', activeRunId);
    } catch (err) {
      console.error('Failed to complete run:', err.message);
    }

    // Remove session file
    try {
      sessionManager.deleteSession();
    } catch (err) {
      console.error('Failed to remove session file:', err.message);
    }

    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

module.exports = { devCommand };
