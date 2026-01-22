const { spawn } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { ApiClient } = require('./client');
const { SessionManager } = require('./session');
const { buildDashboardUrl } = require('./open');
const { execSync } = require('child_process');

// Redact sensitive patterns from log lines (reused from tail.js)
function redactLine(line) {
  return line
    .replace(/sk-[A-Za-z0-9]{20,}/g, 'sk-***REDACTED***')
    .replace(/api[_-]?key["']?\s*[:=]\s*["'][^"']+/gi, 'api_key=***REDACTED***')
    .replace(/bearer\s+[A-Za-z0-9\._-]+/gi, 'Bearer ***REDACTED***');
}

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
 * Line batcher for streaming output
 */
class LineBatcher {
  constructor(options = {}) {
    this.maxBatchLines = options.maxBatchLines || 50;
    this.maxBatchChars = options.maxBatchChars || 20000;
    this.flushMs = options.flushMs || 500;
    this.maxLine = options.maxLine || 2000;
    this.redact = options.redact || false;

    this.stdoutBuffer = [];
    this.stderrBuffer = [];
    this.stdoutPartial = '';
    this.stderrPartial = '';
    this.timer = null;
  }

  processChunk(data, stream) {
    const buffer = stream === 'stdout' ? this.stdoutBuffer : this.stderrBuffer;
    const partial = stream === 'stdout' ? this.stdoutPartial : this.stderrPartial;

    const text = partial + data.toString();
    const lines = text.split('\n');

    // Keep the last partial line
    const newPartial = lines.pop() || '';
    if (stream === 'stdout') {
      this.stdoutPartial = newPartial;
    } else {
      this.stderrPartial = newPartial;
    }

    // Process complete lines
    for (const line of lines) {
      if (!line.trim()) continue;

      // Truncate if needed
      let processedLine = line.length > this.maxLine
        ? line.substring(0, this.maxLine) + '...[truncated]'
        : line;

      // Redact if enabled
      if (this.redact) {
        processedLine = redactLine(processedLine);
      }

      buffer.push(processedLine);
    }
  }

  shouldFlush(stream) {
    const buffer = stream === 'stdout' ? this.stdoutBuffer : this.stderrBuffer;
    const totalChars = buffer.join('\n').length;

    return buffer.length >= this.maxBatchLines || totalChars >= this.maxBatchChars;
  }

  getBatch(stream) {
    const buffer = stream === 'stdout' ? this.stdoutBuffer : this.stderrBuffer;

    if (buffer.length === 0) return null;

    const batch = [...buffer];

    // Clear buffer
    if (stream === 'stdout') {
      this.stdoutBuffer = [];
    } else {
      this.stderrBuffer = [];
    }

    return batch;
  }

  flushPartial(stream) {
    const partial = stream === 'stdout' ? this.stdoutPartial : this.stderrPartial;

    if (!partial.trim()) return null;

    // Process the partial line
    let processedLine = partial.length > this.maxLine
      ? partial.substring(0, this.maxLine) + '...[truncated]'
      : partial;

    if (this.redact) {
      processedLine = redactLine(processedLine);
    }

    // Clear partial
    if (stream === 'stdout') {
      this.stdoutPartial = '';
    } else {
      this.stderrPartial = '';
    }

    return [processedLine];
  }

  hasData() {
    return this.stdoutBuffer.length > 0 ||
           this.stderrBuffer.length > 0 ||
           this.stdoutPartial.trim().length > 0 ||
           this.stderrPartial.trim().length > 0;
  }
}

async function runCommand(commandArgs, options) {
  if (commandArgs.length === 0) {
    console.error('Error: No command specified');
    console.error('Usage: agentops run [options] -- <command> [args...]');
    process.exit(1);
  }

  const repoRoot = SessionManager.getRepoRoot();
  const repoName = SessionManager.getRepoName(repoRoot);
  const branch = SessionManager.getBranch();
  const sessionManager = new SessionManager(repoRoot);

  const server = options.server;
  const apiKey = options.apiKey || null;
  const agent = options.agent || 'unknown';
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const redact = options.redact || false;
  const maxLine = parseInt(options.maxLine) || 2000;
  const flushMs = parseInt(options.flushMs) || 500;
  const maxBatchLines = parseInt(options.maxBatchLines) || 50;
  const maxBatchChars = parseInt(options.maxBatchChars) || 20000;

  // Parse --env flags into environment object
  const customEnv = {};
  if (options.env) {
    const envArray = Array.isArray(options.env) ? options.env : [options.env];
    for (const envPair of envArray) {
      const [key, ...valueParts] = envPair.split('=');
      if (key) {
        customEnv[key] = valueParts.join('=');
      }
    }
  }

  const defaultTitle = options.defaultTitle || `${agent} run - ${repoName}`;
  const title = options.title || defaultTitle;

  // Determine if we should open dashboard (default: yes, unless noOpen)
  const shouldOpen = !options.noOpen && (options.open !== false);

  // Determine if we should create a new run
  const forceNewRun = options.newRun || false;

  const client = new ApiClient(server, apiKey);

  console.log('Agent Ops Collector - Run Mode');
  console.log('Server:', server);
  console.log('Agent:', agent);
  console.log('Command:', commandArgs.join(' '));
  console.log('');

  let activeRunId;
  let isNewSession = false;

  // Session creation / resume logic
  if (sessionManager.hasActiveSession() && !forceNewRun) {
    // Resume existing session
    const existing = sessionManager.loadSession();
    activeRunId = existing.runId;
    isNewSession = false;

    console.log('Using existing session:', existing.title);
    console.log('  Run ID:', activeRunId);
  } else {
    // Create new session
    if (sessionManager.hasActiveSession() && forceNewRun) {
      // Stop old session if --newRun was specified
      const oldSession = sessionManager.loadSession();
      console.log('Stopping previous session:', oldSession.runId);

      try {
        await client.postEvent(oldSession.runId, {
          type: 'session.stopped',
          level: 'info',
          payload: {
            reason: 'New run session started with --newRun',
            timestamp: new Date().toISOString()
          }
        });
        await client.patchRun(oldSession.runId, { status: 'completed' });
      } catch (err) {
        console.warn('Warning: Could not stop previous session:', err.message);
      }

      sessionManager.deleteSession();
    }

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
          cwd,
          tool: agent,
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
          cwd,
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
    console.log('New session started:', title);
    console.log('  Run ID:', activeRunId);
  }

  // Open dashboard if enabled
  if (shouldOpen && isNewSession) {
    const dashboardUrl = buildDashboardUrl(activeRunId, options);
    const opened = openUrlInBrowser(dashboardUrl);

    if (opened) {
      console.log('Dashboard opened:', dashboardUrl);
    } else {
      console.log('Dashboard:', dashboardUrl);
    }
  }

  console.log('');

  const startTime = Date.now();

  // Create span for the agent run
  const spanId = `span-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const commandStr = commandArgs.join(' ');
  const commandPreview = commandStr.length > 80 ? commandStr.substring(0, 80) + '...' : commandStr;

  try {
    await client.postEvent(activeRunId, {
      type: 'span.start',
      level: 'info',
      agentId: agent,
      payload: {
        spanId,
        name: `Agent run: ${commandPreview}`,
        kind: 'agent',
        ts: Date.now(),
        attrs: {
          agent,
          command: commandArgs[0],
          args: commandArgs.slice(1),
          cwd,
          repoRoot
        }
      }
    });
  } catch (err) {
    console.error('Failed to post span.start event:', err.message);
  }

  // Post agent.started event
  try {
    await client.postEvent(activeRunId, {
      type: 'agent.started',
      level: 'info',
      agentId: agent,
      payload: {
        agent,
        command: commandArgs[0],
        args: commandArgs.slice(1),
        cwd,
        repoRoot,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Failed to post agent.started event:', err.message);
  }

  // Create line batcher
  const batcher = new LineBatcher({
    maxBatchLines,
    maxBatchChars,
    flushMs,
    maxLine,
    redact
  });

  // Spawn the child process
  const env = { ...process.env, ...customEnv };
  const child = spawn(commandArgs[0], commandArgs.slice(1), {
    cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
    env
  });

  // Set up flush timer
  const flushInterval = setInterval(async () => {
    // Flush stdout
    const stdoutBatch = batcher.getBatch('stdout');
    if (stdoutBatch) {
      try {
        await client.postEvent(activeRunId, {
          type: 'agent.stdout',
          level: 'info',
          agentId: agent,
          payload: {
            agent,
            lines: stdoutBatch,
            stream: 'stdout',
            timestamp: new Date().toISOString()
          }
        });
      } catch (err) {
        console.error('Failed to post stdout event:', err.message);
      }
    }

    // Flush stderr
    const stderrBatch = batcher.getBatch('stderr');
    if (stderrBatch) {
      try {
        await client.postEvent(activeRunId, {
          type: 'agent.stderr',
          level: 'warn',
          agentId: agent,
          payload: {
            agent,
            lines: stderrBatch,
            stream: 'stderr',
            timestamp: new Date().toISOString()
          }
        });
      } catch (err) {
        console.error('Failed to post stderr event:', err.message);
      }
    }
  }, flushMs);

  // Handle stdout
  child.stdout.on('data', async (data) => {
    // Echo to console
    process.stdout.write(data);

    // Buffer lines
    batcher.processChunk(data, 'stdout');

    // Check if we should flush immediately
    if (batcher.shouldFlush('stdout')) {
      const batch = batcher.getBatch('stdout');
      if (batch) {
        try {
          await client.postEvent(activeRunId, {
            type: 'agent.stdout',
            level: 'info',
            agentId: agent,
            payload: {
              agent,
              lines: batch,
              stream: 'stdout',
              timestamp: new Date().toISOString()
            }
          });
        } catch (err) {
          console.error('Failed to post stdout event:', err.message);
        }
      }
    }
  });

  // Handle stderr
  child.stderr.on('data', async (data) => {
    // Echo to console
    process.stderr.write(data);

    // Buffer lines
    batcher.processChunk(data, 'stderr');

    // Check if we should flush immediately
    if (batcher.shouldFlush('stderr')) {
      const batch = batcher.getBatch('stderr');
      if (batch) {
        try {
          await client.postEvent(activeRunId, {
            type: 'agent.stderr',
            level: 'warn',
            agentId: agent,
            payload: {
              agent,
              lines: batch,
              stream: 'stderr',
              timestamp: new Date().toISOString()
            }
          });
        } catch (err) {
          console.error('Failed to post stderr event:', err.message);
        }
      }
    }
  });

  // Handle process exit
  child.on('close', async (exitCode, signal) => {
    clearInterval(flushInterval);

    const durationMs = Date.now() - startTime;

    console.log('');

    // Flush any remaining buffered lines
    const finalStdout = batcher.getBatch('stdout');
    const partialStdout = batcher.flushPartial('stdout');
    const finalStderr = batcher.getBatch('stderr');
    const partialStderr = batcher.flushPartial('stderr');

    // Post remaining stdout
    if (finalStdout) {
      try {
        await client.postEvent(activeRunId, {
          type: 'agent.stdout',
          level: 'info',
          agentId: agent,
          payload: {
            agent,
            lines: finalStdout,
            stream: 'stdout',
            timestamp: new Date().toISOString()
          }
        });
      } catch (err) {
        console.error('Failed to post final stdout event:', err.message);
      }
    }

    if (partialStdout) {
      try {
        await client.postEvent(activeRunId, {
          type: 'agent.stdout',
          level: 'info',
          agentId: agent,
          payload: {
            agent,
            lines: partialStdout,
            stream: 'stdout',
            timestamp: new Date().toISOString()
          }
        });
      } catch (err) {
        console.error('Failed to post partial stdout event:', err.message);
      }
    }

    // Post remaining stderr
    if (finalStderr) {
      try {
        await client.postEvent(activeRunId, {
          type: 'agent.stderr',
          level: 'warn',
          agentId: agent,
          payload: {
            agent,
            lines: finalStderr,
            stream: 'stderr',
            timestamp: new Date().toISOString()
          }
        });
      } catch (err) {
        console.error('Failed to post final stderr event:', err.message);
      }
    }

    if (partialStderr) {
      try {
        await client.postEvent(activeRunId, {
          type: 'agent.stderr',
          level: 'warn',
          agentId: agent,
          payload: {
            agent,
            lines: partialStderr,
            stream: 'stderr',
            timestamp: new Date().toISOString()
          }
        });
      } catch (err) {
        console.error('Failed to post partial stderr event:', err.message);
      }
    }

    // Post agent.exit event
    try {
      await client.postEvent(activeRunId, {
        type: 'agent.exit',
        level: exitCode === 0 ? 'info' : 'error',
        agentId: agent,
        payload: {
          agent,
          exitCode,
          signal,
          durationMs,
          timestamp: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error('Failed to post agent.exit event:', err.message);
    }

    // End span
    const spanStatus = exitCode === 0 ? 'ok' : 'error';
    try {
      await client.postEvent(activeRunId, {
        type: 'span.end',
        level: 'info',
        agentId: agent,
        payload: {
          spanId,
          ts: Date.now(),
          status: spanStatus,
          attrs: {
            exitCode,
            signal,
            durationMs
          }
        }
      });
    } catch (err) {
      console.error('Failed to post span.end event:', err.message);
    }

    // Handle non-zero exit
    if (exitCode !== 0) {
      try {
        await client.postEvent(activeRunId, {
          type: 'run.error',
          level: 'error',
          agentId: agent,
          payload: {
            errorMessage: `Agent exited with code ${exitCode}`,
            exitCode,
            timestamp: new Date().toISOString()
          }
        });

        await client.patchRun(activeRunId, {
          status: 'error',
          errorMessage: `Agent exited with code ${exitCode}`
        });

        console.log('Run marked as error (exit code:', exitCode + ')');
      } catch (err) {
        console.error('Failed to mark run as error:', err.message);
      }
    } else {
      try {
        await client.postEvent(activeRunId, {
          type: 'run.completed',
          level: 'info',
          agentId: agent,
          payload: {
            timestamp: new Date().toISOString()
          }
        });

        await client.patchRun(activeRunId, {
          status: 'completed'
        });

        console.log('Run completed successfully');
      } catch (err) {
        console.error('Failed to complete run:', err.message);
      }
    }

    process.exit(exitCode || 0);
  });

  // Handle spawn error
  child.on('error', async (err) => {
    clearInterval(flushInterval);

    console.error('Failed to execute command:', err.message);

    // End span with error status
    try {
      await client.postEvent(activeRunId, {
        type: 'span.end',
        level: 'info',
        agentId: agent,
        payload: {
          spanId,
          ts: Date.now(),
          status: 'error',
          attrs: {
            errorMessage: err.message
          }
        }
      });
    } catch (postErr) {
      console.error('Failed to post span.end event:', postErr.message);
    }

    try {
      await client.postEvent(activeRunId, {
        type: 'run.error',
        level: 'error',
        agentId: agent,
        payload: {
          errorMessage: err.message,
          command: commandArgs.join(' '),
          timestamp: new Date().toISOString()
        }
      });

      await client.patchRun(activeRunId, {
        status: 'error',
        errorMessage: err.message
      });
    } catch (postErr) {
      console.error('Failed to post error:', postErr.message);
    }

    process.exit(1);
  });

  // Handle SIGINT (Ctrl+C) - forward to child
  let sigintCount = 0;
  const handleSigint = () => {
    sigintCount++;

    if (sigintCount === 1) {
      console.log('\nSending SIGINT to child process...');
      child.kill('SIGINT');

      // Wait up to 3 seconds for graceful shutdown
      setTimeout(() => {
        if (!child.killed) {
          console.log('Child process did not exit, sending SIGKILL...');
          child.kill('SIGKILL');
        }
      }, 3000);
    } else if (sigintCount === 2) {
      console.log('Force killing child process...');
      child.kill('SIGKILL');
    }
  };

  process.on('SIGINT', handleSigint);
  process.on('SIGTERM', handleSigint);
}

module.exports = { runCommand };
