const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { ApiClient } = require('./client');
const { FileWatcher } = require('./watcher');
const { GitMonitor } = require('./git');

async function watchCommand(options) {
  const server = options.server || 'http://localhost:8787';
  const title = options.title || 'Workspace Watch';
  const watchPath = path.resolve(options.path || '.');
  const ignoreList = options.ignore
    ? options.ignore.split(',').map(s => s.trim())
    : ['node_modules', '.git', 'dist', 'build', 'coverage'];
  const diffInterval = parseInt(options.diffInterval || '5000', 10);
  const apiKey = options.apiKey || null;
  const runId = options.runId || null;
  const verbose = options.verbose || false;
  const noComplete = options.noComplete || false;

  const client = new ApiClient(server, apiKey);

  console.log('Agent Ops Collector - Watch Mode');
  console.log('Server:', server);
  console.log('Watch path:', watchPath);
  console.log('Ignore patterns:', ignoreList.join(', '));

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

  const watcher = new FileWatcher(watchPath, {
    ignore: ignoreList,
    verbose,
    debounceMs: 250,
    onEvent: async (event) => {
      try {
        await client.postEvent(activeRunId, {
          ...event,
          level: 'info',
          agentId: 'collector'
        });
        if (verbose) {
          console.log('File change event posted:', event.payload.file, event.payload.kind);
        }
      } catch (err) {
        console.error('Failed to post file change event:', err.message);
      }
    }
  });

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
