const crypto = require('crypto');
const { readClipboard } = require('./clipboard');
const { ApiClient } = require('./client');
const { SessionManager } = require('./session');

async function clipCommand(args, options) {
  if (args.length === 0) {
    console.error('Error: Missing clip type');
    console.error('Usage: agentops clip <note|prompt|response> [options]');
    console.error('');
    console.error('Examples:');
    console.error('  agentops clip note');
    console.error('  agentops clip prompt --tool claude-code');
    console.error('  agentops clip response --tool claude-code --model sonnet');
    process.exit(1);
  }

  const clipType = args[0];
  const validTypes = ['note', 'prompt', 'response'];

  if (!validTypes.includes(clipType)) {
    console.error(`Error: Invalid clip type "${clipType}"`);
    console.error(`Valid types: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  const server = options.server;
  const apiKey = options.apiKey || null;
  const runId = options.runId;

  if (!runId) {
    console.error('Error: No active session found and no --runId provided');
    console.error('Start a session first with: agentops start');
    console.error('Or provide a run ID with: --runId <id>');
    process.exit(1);
  }

  let text;
  try {
    text = readClipboard();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (err.message.includes('Clipboard not supported')) {
      console.error('');
      console.error('To use clipboard features, install:');
      console.error('  macOS:   (built-in)');
      console.error('  Linux:   xclip or wl-clipboard');
      console.error('  Windows: (built-in)');
    }
    process.exit(1);
  }

  text = text.trim();

  if (!text) {
    console.error('Error: Clipboard is empty');
    console.error('Copy some text to your clipboard and try again');
    process.exit(1);
  }

  const client = new ApiClient(server, apiKey);

  let eventType, payload;

  if (clipType === 'note') {
    const level = options.level || 'info';
    const tags = [];
    if (options.tag) {
      if (Array.isArray(options.tag)) {
        tags.push(...options.tag);
      } else {
        tags.push(options.tag);
      }
    }

    eventType = 'note';
    payload = {
      text,
      tags: tags.length > 0 ? tags : undefined
    };

    try {
      await client.postEvent(runId, {
        id: `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        ts: new Date().toISOString(),
        runId,
        type: eventType,
        level,
        payload
      });
    } catch (err) {
      console.error('Failed to log note:', err.message);
      process.exit(1);
    }

    console.log(`Logged note from clipboard (${text.length} chars)`);

  } else if (clipType === 'prompt') {
    const tool = options.tool || options.toolDefaults?.tool || null;
    const model = options.model || options.toolDefaults?.model || null;
    const tags = [];
    if (options.tag) {
      if (Array.isArray(options.tag)) {
        tags.push(...options.tag);
      } else {
        tags.push(options.tag);
      }
    }

    eventType = 'llm.prompt';
    payload = {
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
        type: eventType,
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
        // Non-fatal
      }
    }

    console.log(`Logged prompt from clipboard (${text.length} chars)`);

  } else if (clipType === 'response') {
    const tool = options.tool || options.toolDefaults?.tool || null;
    const model = options.model || options.toolDefaults?.model || null;
    const tags = [];
    if (options.tag) {
      if (Array.isArray(options.tag)) {
        tags.push(...options.tag);
      } else {
        tags.push(options.tag);
      }
    }

    eventType = 'llm.response';
    payload = {
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
        type: eventType,
        level: 'info',
        payload
      });
    } catch (err) {
      console.error('Failed to log response:', err.message);
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
        // Non-fatal
      }
    }

    console.log(`Logged response from clipboard (${text.length} chars)`);
  }
}

module.exports = { clipCommand };
