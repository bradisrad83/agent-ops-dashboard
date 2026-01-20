const crypto = require('crypto');
const { ApiClient } = require('./client');
const { SessionManager } = require('./session');

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function promptCommand(args, options) {
  const repoRoot = SessionManager.getRepoRoot();
  const sessionManager = new SessionManager(repoRoot);

  let session = null;
  if (!options.runId && sessionManager.hasActiveSession()) {
    session = sessionManager.loadSession();
  }

  const server = options.server || (session ? session.server : 'http://localhost:8787');
  const apiKey = options.apiKey || null;
  const runId = options.runId || (session ? session.runId : null);

  if (!runId) {
    console.error('Error: No active session found and no --runId provided');
    console.error('Start a session first with: agentops start');
    console.error('Or provide a run ID with: --runId <id>');
    process.exit(1);
  }

  let text = args.join(' ');

  if (text === '-') {
    try {
      text = await readStdin();
      text = text.trim();
    } catch (err) {
      console.error('Failed to read from stdin:', err.message);
      process.exit(1);
    }
  }

  if (!text) {
    console.error('Error: Prompt text is required');
    console.error('Usage: agentops prompt "your prompt text"');
    console.error('   or: agentops prompt - < prompt.txt');
    process.exit(1);
  }

  const tool = options.tool || null;
  const model = options.model || null;
  const tags = [];
  if (options.tag) {
    if (Array.isArray(options.tag)) {
      tags.push(...options.tag);
    } else {
      tags.push(options.tag);
    }
  }

  const client = new ApiClient(server, apiKey);

  const payload = {
    text,
    tags: tags.length > 0 ? tags : undefined
  };

  if (tool) payload.tool = tool;
  if (model) payload.model = model;

  try {
    await client.postEvent(runId, {
      id: `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      ts: new Date().toISOString(),
      runId,
      type: 'llm.prompt',
      level: 'info',
      payload
    });
  } catch (err) {
    console.error('Failed to log prompt:', err.message);
    process.exit(1);
  }

  if (tool || model) {
    try {
      await client.patchRun(runId, {
        metadata: {
          lastTool: tool || undefined,
          lastModel: model || undefined
        }
      });
    } catch (err) {
      // Non-fatal, just log a warning
    }
  }

  console.log('Prompt logged successfully');
}

module.exports = { promptCommand };
