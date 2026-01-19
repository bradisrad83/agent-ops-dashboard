const { spawn } = require('child_process');
const crypto = require('crypto');
const { ApiClient } = require('./client');

async function execCommand(commandArgs, options) {
  if (commandArgs.length === 0) {
    console.error('Error: No command specified');
    console.error('Usage: agentops exec [options] -- <command> [args...]');
    process.exit(1);
  }

  const server = options.server || 'http://localhost:8787';
  const apiKey = options.apiKey || null;
  const runId = options.runId || null;
  const verbose = options.verbose || false;

  const client = new ApiClient(server, apiKey);

  console.log('Agent Ops Collector - Exec Mode');
  console.log('Server:', server);
  console.log('Command:', commandArgs.join(' '));

  let activeRunId = runId;

  try {
    await client.health();
    if (verbose) {
      console.log('Connected to server');
    }
  } catch (err) {
    console.error('Failed to connect to server:', err.message);
    process.exit(1);
  }

  if (!activeRunId) {
    if (verbose) {
      console.log('Creating new run...');
    }
    try {
      const run = await client.createRun({
        id: `exec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        title: `Exec: ${commandArgs.join(' ')}`,
        startedAt: new Date().toISOString(),
        status: 'running'
      });
      activeRunId = run.id;
      if (verbose) {
        console.log('Run created:', activeRunId);
      }
    } catch (err) {
      console.error('Failed to create run:', err.message);
      process.exit(1);
    }
  } else {
    if (verbose) {
      console.log('Using existing run:', activeRunId);
    }
  }

  const startTime = Date.now();
  const cwd = process.cwd();

  try {
    await client.postEvent(activeRunId, {
      type: 'tool.called',
      level: 'info',
      agentId: 'collector',
      payload: {
        toolName: 'exec',
        command: commandArgs.join(' '),
        cwd,
        timestamp: new Date().toISOString()
      }
    });
    if (verbose) {
      console.log('Command exec event posted');
    }
  } catch (err) {
    console.error('Failed to post exec event:', err.message);
  }

  console.log('');

  const maxOutputLength = 20 * 1024;
  let stdoutBuffer = '';
  let stderrBuffer = '';

  const child = spawn(commandArgs[0], commandArgs.slice(1), {
    cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true
  });

  child.stdout.on('data', (data) => {
    const str = data.toString();
    process.stdout.write(str);

    if (stdoutBuffer.length < maxOutputLength) {
      stdoutBuffer += str;
      if (stdoutBuffer.length > maxOutputLength) {
        stdoutBuffer = stdoutBuffer.substring(0, maxOutputLength) + '\n... (truncated)';
      }
    }
  });

  child.stderr.on('data', (data) => {
    const str = data.toString();
    process.stderr.write(str);

    if (stderrBuffer.length < maxOutputLength) {
      stderrBuffer += str;
      if (stderrBuffer.length > maxOutputLength) {
        stderrBuffer = stderrBuffer.substring(0, maxOutputLength) + '\n... (truncated)';
      }
    }
  });

  child.on('close', async (exitCode) => {
    const durationMs = Date.now() - startTime;

    console.log('');

    try {
      await client.postEvent(activeRunId, {
        type: 'tool.result',
        level: exitCode === 0 ? 'info' : 'error',
        agentId: 'collector',
        payload: {
          toolName: 'exec',
          exitCode,
          durationMs,
          stdoutSnippet: stdoutBuffer,
          stderrSnippet: stderrBuffer,
          timestamp: new Date().toISOString()
        }
      });
      if (verbose) {
        console.log('Command result event posted');
      }
    } catch (err) {
      console.error('Failed to post result event:', err.message);
    }

    if (exitCode !== 0) {
      try {
        await client.postEvent(activeRunId, {
          type: 'run.error',
          level: 'error',
          agentId: 'collector',
          payload: {
            error: `Command exited with code ${exitCode}`,
            command: commandArgs.join(' '),
            exitCode,
            timestamp: new Date().toISOString()
          }
        });

        await client.patchRun(activeRunId, {
          status: 'error',
          errorMessage: `Command exited with code ${exitCode}`
        });

        if (verbose) {
          console.log('Run marked as error');
        }
      } catch (err) {
        console.error('Failed to mark run as error:', err.message);
      }
    } else {
      try {
        await client.patchRun(activeRunId, {
          status: 'completed'
        });
        if (verbose) {
          console.log('Run marked as completed');
        }
      } catch (err) {
        console.error('Failed to complete run:', err.message);
      }
    }

    process.exit(exitCode);
  });

  child.on('error', async (err) => {
    console.error('Failed to execute command:', err.message);

    try {
      await client.postEvent(activeRunId, {
        type: 'run.error',
        level: 'error',
        agentId: 'collector',
        payload: {
          error: err.message,
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
}

module.exports = { execCommand };
