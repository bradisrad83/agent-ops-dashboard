const crypto = require('crypto');
const { ApiClient } = require('./client');
const { SessionManager } = require('./session');

async function stopCommand(options) {
  const repoRoot = SessionManager.getRepoRoot();
  const sessionManager = new SessionManager(repoRoot);

  if (!sessionManager.hasActiveSession()) {
    console.error('Error: No active session found');
    console.error('Start a session first with: agentops start');
    process.exit(1);
  }

  const session = sessionManager.loadSession();
  const server = options.server;
  const apiKey = options.apiKey || null;
  const runId = options.runId;
  const status = options.status || 'completed';
  const errorMessage = options.errorMessage || null;

  const client = new ApiClient(server, apiKey);

  try {
    await client.health();
  } catch (err) {
    console.error('Failed to connect to server:', server);
    console.error('Error:', err.message);
    console.error('\nSession file will not be deleted. Try again later or delete manually:');
    console.error(sessionManager.sessionFile);
    process.exit(1);
  }

  if (status === 'error') {
    try {
      await client.postEvent(runId, {
        id: `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        ts: new Date().toISOString(),
        runId,
        type: 'run.error',
        level: 'error',
        payload: {
          errorMessage: errorMessage || 'Session stopped with error status'
        }
      });
    } catch (err) {
      console.warn('Warning: Failed to post run.error event:', err.message);
    }

    try {
      await client.patchRun(runId, {
        status: 'error',
        errorMessage: errorMessage || 'Session stopped with error status'
      });
    } catch (err) {
      console.error('Failed to mark run as error:', err.message);
      process.exit(1);
    }
  } else {
    try {
      await client.postEvent(runId, {
        id: `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        ts: new Date().toISOString(),
        runId,
        type: 'session.stopped',
        level: 'info',
        payload: {
          status: 'completed'
        }
      });
    } catch (err) {
      console.warn('Warning: Failed to post session.stopped event:', err.message);
    }

    try {
      await client.postEvent(runId, {
        id: `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        ts: new Date().toISOString(),
        runId,
        type: 'run.completed',
        level: 'info',
        payload: {}
      });
    } catch (err) {
      console.warn('Warning: Failed to post run.completed event:', err.message);
    }

    try {
      await client.patchRun(runId, {
        status: 'completed'
      });
    } catch (err) {
      console.error('Failed to mark run as completed:', err.message);
      process.exit(1);
    }
  }

  try {
    sessionManager.deleteSession();
  } catch (err) {
    console.warn('Warning: Failed to delete session file:', err.message);
  }

  console.log('\nAgentOps session stopped successfully!');
  console.log('');
  console.log('  Run ID:', runId);
  console.log('  Status:', status);
  if (status === 'error' && errorMessage) {
    console.log('  Error:', errorMessage);
  }
  console.log('');
  console.log('View your session at:', `${server}/runs/${runId}`);
  console.log('');
}

module.exports = { stopCommand };
