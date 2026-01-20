const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { ApiClient } = require('./client');
const { FileWatcher } = require('./watcher');
const { PollingWatcher } = require('./polling-watcher');
const { GitMonitor } = require('./git');

async function watchCommand(options) {
  const server = options.server;
  const title = options.title || 'Workspace Watch';
  const watchPath = path.resolve(options.watch?.path || options.path || '.');
  const ignoreList = Array.isArray(options.watch?.ignore)
    ? options.watch.ignore
    : (options.ignore
      ? options.ignore.split(',').map(s => s.trim())
      : ['node_modules', '.git', 'dist', 'build', 'coverage']);
  const diffInterval = options.git?.interval || options.watch?.diffInterval || 5000;
  const apiKey = options.apiKey || null;
  const runId = options.runId || null;
  const verbose = options.verbose || false;
  let noComplete = options.noComplete || false;

  // Calm mode options
  const profile = options.profile || 'full';
  const quiet = options.quiet || false;
  const fsMode = options.fsMode || 'batch';
  const gitEnabled = options.git?.enabled !== undefined ? options.git.enabled : true;

  // C2: Session-aware watch
  // If active session exists and user didn't explicitly set --noComplete,
  // default to --noComplete automatically (so watch doesn't complete the session run)
  if (runId && options.noComplete === undefined) {
    noComplete = true;
    console.log('Active session detected: watch will not complete the session when stopped.');
    console.log('Use explicit --noComplete=false to override this behavior.');
    console.log('');
  }

  // New options for watch modes
  const mode = options.watch?.mode || options.mode || 'auto'; // 'native', 'poll', or 'auto'
  const pollInterval = options.watch?.pollInterval || 1000;
  const noBatch = options.noBatch || options.watch?.noBatch || false;

  const client = new ApiClient(server, apiKey);

  console.log('Agent Ops Collector - Watch Mode');
  console.log('Server:', server);
  console.log('Watch path:', watchPath);
  console.log('Watch mode:', mode);
  console.log('Profile:', profile);
  if (!quiet) {
    console.log('FS mode:', fsMode);
    console.log('Git monitoring:', gitEnabled ? 'enabled' : 'disabled');
    console.log('Ignore patterns:', ignoreList.join(', '));
    if (mode === 'poll' || mode === 'auto') {
      console.log('Poll interval:', pollInterval, 'ms');
    }
    console.log('Batching:', noBatch ? 'disabled' : 'enabled');
  }

  // Emit calm mode notice if profile=agent
  if (profile === 'agent') {
    console.log('');
    console.log('Calm mode enabled: summarizing file changes and reducing noise.');
  }

  let activeRunId = runId;

  try {
    await client.health();
    console.log('Connected to server');
  } catch (err) {
    console.error('Failed to connect to server:', err.message);
    process.exit(1);
  }

  if (!activeRunId) {
    console.log('Creating new run...');
    try {
      const run = await client.createRun({
        id: `watch-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        title,
        startedAt: new Date().toISOString(),
        status: 'running'
      });
      activeRunId = run.id;
      console.log('Run created:', activeRunId);
    } catch (err) {
      console.error('Failed to create run:', err.message);
      process.exit(1);
    }
  } else {
    console.log('Using existing run:', activeRunId);
    try {
      await client.patchRun(activeRunId, {
        title,
        status: 'running'
      });
    } catch (err) {
      console.warn('Failed to update run:', err.message);
    }
  }

  const gitMonitor = new GitMonitor(watchPath, {
    diffInterval,
    verbose,
    enabled: gitEnabled,
    emitSummary: profile === 'agent',
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

  const repoInfo = gitMonitor.getRepoInfo();

  try {
    await client.patchRun(activeRunId, {
      metadata: {
        repoName: repoInfo.repoName || null,
        branch: repoInfo.branch || null,
        cwd: watchPath,
        collectorVersion: '0.1.0'
      }
    });
  } catch (err) {
    console.warn('Failed to update run metadata:', err.message);
  }

  try {
    await client.postEvent(activeRunId, {
      type: 'run.started',
      level: 'info',
      agentId: 'collector',
      payload: {
        cwd: watchPath,
        path: watchPath,
        hostname: os.hostname(),
        user: os.userInfo().username,
        platform: os.platform(),
        pid: process.pid,
        title
      }
    });
    console.log('Watch started event posted');
  } catch (err) {
    console.error('Failed to post start event:', err.message);
  }

  // Emit collector.notice for calm mode
  if (profile === 'agent') {
    try {
      await client.postEvent(activeRunId, {
        type: 'collector.notice',
        level: 'info',
        agentId: 'collector',
        payload: {
          profile,
          fsMode,
          gitEnabled,
          message: 'Calm mode: summarizing file changes and suppressing frequent git.diff'
        }
      });
    } catch (err) {
      console.error('Failed to post collector notice:', err.message);
    }
  }

  // Determine which watcher to use
  let watcher;
  let activeMode = mode;

  const watcherOptions = {
    ignore: ignoreList,
    verbose,
    debounceMs: options.watch?.batchWindowMs || 250,
    batchMode: !noBatch,
    fsMode,
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
          } else if (event.type === 'fs.summary') {
            console.log('File summary event posted:', event.payload.totalFilesTouched, 'files');
          } else {
            console.log('File change event posted:', event.payload.file, event.payload.kind);
          }
        }
      } catch (err) {
        console.error('Failed to post file change event:', err.message);
      }
    }
  };

  if (mode === 'poll') {
    // Force polling mode
    console.log('Using polling mode (forced)');
    watcher = new PollingWatcher(watchPath, {
      ...watcherOptions,
      pollInterval
    });
    activeMode = 'poll';
  } else if (mode === 'native') {
    // Force native mode
    console.log('Using native fs.watch mode (forced)');
    watcher = new FileWatcher(watchPath, watcherOptions);
    activeMode = 'native';
  } else {
    // Auto mode: try native, fallback to poll on error
    console.log('Using auto mode (will try native, fallback to poll if needed)');
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

  watcher.start();
  gitMonitor.start();

  console.log('\nWatching for changes... (Press Ctrl+C to stop)');

  const cleanup = async () => {
    console.log('\nStopping watch...');

    watcher.stop();
    gitMonitor.stop();

    try {
      await client.postEvent(activeRunId, {
        type: 'run.completed',
        level: 'info',
        agentId: 'collector',
        payload: {
          reason: 'User stopped watch',
          timestamp: new Date().toISOString()
        }
      });
      console.log('Watch stopped event posted');
    } catch (err) {
      console.error('Failed to post stop event:', err.message);
    }

    if (!noComplete) {
      try {
        await client.patchRun(activeRunId, {
          status: 'completed'
        });
        console.log('Run marked as completed');
      } catch (err) {
        console.error('Failed to complete run:', err.message);
      }
    }

    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

module.exports = { watchCommand };
