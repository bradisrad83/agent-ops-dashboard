const crypto = require('crypto');
const { ApiClient } = require('./client');
const { SessionManager } = require('./session');

async function startCommand(options) {
  const server = options.server;
  const apiKey = options.apiKey || null;
  const repoRoot = SessionManager.getRepoRoot();
  const repoName = SessionManager.getRepoName(repoRoot);
  const branch = SessionManager.getBranch();

  const defaultTitle = options.defaultTitle || `${repoName} - ${new Date().toISOString().split('T')[0]}`;
  const title = options.title || defaultTitle;

  const sessionManager = new SessionManager(repoRoot);

  if (sessionManager.hasActiveSession()) {
    const existing = sessionManager.loadSession();
    console.error('Error: Active session already exists');
    console.error('Run ID:', existing.runId);
    console.error('Title:', existing.title);
    console.error('Started:', new Date(existing.startedAt).toLocaleString());
    console.error('\nPlease stop the existing session first with: agentops stop');
    process.exit(1);
  }

  const client = new ApiClient(server, apiKey);

  try {
    await client.health();
  } catch (err) {
    console.error('Failed to connect to server:', server);
    console.error('Error:', err.message);
    process.exit(1);
  }

  const runId = `session-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const startedAt = Date.now();

  try {
    await client.createRun({
      id: runId,
      title,
      startedAt: new Date(startedAt).toISOString(),
      status: 'running'
    });
  } catch (err) {
    console.error('Failed to create run:', err.message);
    process.exit(1);
  }

  try {
    await client.patchRun(runId, {
      metadata: {
        repoRoot,
        repoName,
        branch,
        tool: 'manual',
        session: true,
        collectorVersion: '0.1.0'
      }
    });
  } catch (err) {
    console.warn('Warning: Failed to update run metadata:', err.message);
  }

  try {
    await client.postEvent(runId, {
      id: `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      ts: new Date().toISOString(),
      runId,
      type: 'session.started',
      level: 'info',
      payload: {
        title,
        repoName,
        branch,
        cwd: process.cwd()
      }
    });
  } catch (err) {
    console.warn('Warning: Failed to post session.started event:', err.message);
  }

  const sessionData = {
    server,
    runId,
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

  console.log('\nAgentOps session started successfully!');
  console.log('');
  console.log('  Run ID:', runId);
  console.log('  Title:', title);
  console.log('  Server:', server);
  console.log('  Repo:', repoName);
  if (branch) {
    console.log('  Branch:', branch);
  }
  console.log('');
  console.log('Log your work with:');
  console.log('  agentops note "your note here"');
  console.log('  agentops prompt "your prompt text"');
  console.log('  agentops response "the response text"');
  console.log('');
  console.log('When done:');
  console.log('  agentops stop');
  console.log('');
}

module.exports = { startCommand };
