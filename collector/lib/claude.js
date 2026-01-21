const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const readline = require('readline');
const { readClipboard } = require('./clipboard');
const { ApiClient } = require('./client');
const { SessionManager } = require('./session');
const { startCommand } = require('./start');

// Redact sensitive patterns from text
function redactLine(line) {
  return line
    .replace(/sk-[A-Za-z0-9]{20,}/g, 'sk-***REDACTED***')
    .replace(/api[_-]?key["']?\s*[:=]\s*["'][^"']+/gi, 'api_key=***REDACTED***')
    .replace(/bearer\s+[A-Za-z0-9\._-]+/gi, 'Bearer ***REDACTED***');
}

// Read from stdin
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// Wait for user to press Enter
async function waitForEnter(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

// Auto-start session if needed
async function ensureSession(options) {
  const repoRoot = SessionManager.getRepoRoot();
  const sessionManager = new SessionManager(repoRoot);

  if (sessionManager.hasActiveSession()) {
    const sessionData = sessionManager.loadSession();
    return sessionData.runId;
  }

  // No active session - start one
  const title = options.title || 'Claude Session';
  console.log(`No active session found. Starting new session: "${title}"`);
  console.log('');

  await startCommand({ ...options, title });

  // Reload session data
  const sessionData = sessionManager.loadSession();
  return sessionData.runId;
}

// Post a span event
async function postSpanEvent(runId, eventType, payload, options) {
  const server = options.server;
  const apiKey = options.apiKey || null;
  const client = new ApiClient(server, apiKey);

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
    console.error(`Failed to log ${eventType}:`, err.message);
    // Non-fatal for spans
  }
}

// Post an LLM event
async function postLlmEvent(runId, eventType, text, options) {
  const server = options.server;
  const apiKey = options.apiKey || null;
  const client = new ApiClient(server, apiKey);

  const tool = options.tool || options.toolDefaults?.tool || 'claude';
  const model = options.model || options.toolDefaults?.model || 'unknown';
  const tags = [];

  if (options.tag) {
    if (Array.isArray(options.tag)) {
      tags.push(...options.tag);
    } else {
      tags.push(options.tag);
    }
  }

  // Apply redaction if requested
  let finalText = text;
  if (options.redact) {
    finalText = redactLine(text);
  }

  const payload = {
    text: finalText,
    tool,
    model,
    tags: tags.length > 0 ? tags : undefined,
    source: options.source || undefined
  };

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
    console.error(`Failed to log ${eventType}:`, err.message);
    process.exit(1);
  }

  // Update run metadata with tool/model
  try {
    await client.patchRun(runId, {
      metadata: {
        lastTool: tool,
        lastModel: model
      }
    });
  } catch (err) {
    // Non-fatal
  }
}

// Command: agentops claude prompt
async function claudePromptCommand(args, options) {
  let text;
  let source;

  // Determine source: args, stdin, or clipboard (default)
  if (args.length > 0 && args[0] === '-') {
    // Read from stdin
    try {
      text = await readStdin();
      text = text.trim();
      source = 'stdin';
    } catch (err) {
      console.error('Failed to read from stdin:', err.message);
      process.exit(1);
    }
  } else if (args.length > 0) {
    // Text provided as arguments (for manual override, but not primary use case)
    text = args.join(' ');
    source = 'args';
  } else {
    // Default: read from clipboard
    try {
      text = readClipboard();
      text = text.trim();
      source = 'clipboard';
    } catch (err) {
      console.error(`Error: ${err.message}`);
      if (err.message.includes('Clipboard not supported')) {
        console.error('');
        console.error('To use clipboard features, install:');
        console.error('  macOS:   (built-in)');
        console.error('  Linux:   xclip or wl-clipboard');
        console.error('  Windows: (built-in)');
        console.error('');
        console.error('Alternatively, use stdin: agentops claude prompt -');
      }
      process.exit(1);
    }
  }

  if (!text) {
    console.error('Error: Prompt text is empty');
    console.error('Usage: agentops claude prompt              (reads from clipboard)');
    console.error('   or: agentops claude prompt -            (reads from stdin)');
    process.exit(1);
  }

  const runId = await ensureSession(options);
  await postLlmEvent(runId, 'llm.prompt', text, { ...options, source });

  console.log(`Logged prompt from ${source} (${text.length} chars)`);
}

// Command: agentops claude response
async function claudeResponseCommand(args, options) {
  let text;
  let source;

  // Determine source: args, stdin, or clipboard (default)
  if (args.length > 0 && args[0] === '-') {
    // Read from stdin
    try {
      text = await readStdin();
      text = text.trim();
      source = 'stdin';
    } catch (err) {
      console.error('Failed to read from stdin:', err.message);
      process.exit(1);
    }
  } else if (args.length > 0) {
    // Text provided as arguments
    text = args.join(' ');
    source = 'args';
  } else {
    // Default: read from clipboard
    try {
      text = readClipboard();
      text = text.trim();
      source = 'clipboard';
    } catch (err) {
      console.error(`Error: ${err.message}`);
      if (err.message.includes('Clipboard not supported')) {
        console.error('');
        console.error('To use clipboard features, install:');
        console.error('  macOS:   (built-in)');
        console.error('  Linux:   xclip or wl-clipboard');
        console.error('  Windows: (built-in)');
        console.error('');
        console.error('Alternatively, use stdin: agentops claude response -');
      }
      process.exit(1);
    }
  }

  if (!text) {
    console.error('Error: Response text is empty');
    console.error('Usage: agentops claude response            (reads from clipboard)');
    console.error('   or: agentops claude response -          (reads from stdin)');
    process.exit(1);
  }

  const runId = await ensureSession(options);
  await postLlmEvent(runId, 'llm.response', text, { ...options, source });

  console.log(`Logged response from ${source} (${text.length} chars)`);
}

// Command: agentops claude pair
async function claudePairCommand(args, options) {
  const runId = await ensureSession(options);

  // Create span for this interaction
  const spanId = `span-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const tool = options.tool || options.toolDefaults?.tool || 'claude';
  const model = options.model || options.toolDefaults?.model || 'unknown';

  console.log('Claude Pair Workflow');
  console.log('====================');
  console.log('');
  console.log('Step 1: Copy your prompt to the clipboard, then press Enter');

  await waitForEnter('Press Enter when ready...');

  // Read prompt from clipboard
  let promptText;
  try {
    promptText = readClipboard();
    promptText = promptText.trim();
  } catch (err) {
    console.error(`Error reading prompt: ${err.message}`);
    if (err.message.includes('Clipboard not supported')) {
      console.error('');
      console.error('To use clipboard features, install:');
      console.error('  macOS:   (built-in)');
      console.error('  Linux:   xclip or wl-clipboard');
      console.error('  Windows: (built-in)');
    }
    process.exit(1);
  }

  if (!promptText) {
    console.error('Error: Clipboard is empty (prompt)');
    process.exit(1);
  }

  // Start span with prompt preview
  const promptPreview = promptText.length > 80 ? promptText.substring(0, 80) + '...' : promptText;
  const spanAttrs = { tool, model };
  if (options.tag) {
    spanAttrs.tags = Array.isArray(options.tag) ? options.tag : [options.tag];
  }

  await postSpanEvent(runId, 'span.start', {
    spanId,
    name: `Claude: ${promptPreview}`,
    kind: 'llm',
    ts: Date.now(),
    attrs: spanAttrs
  }, options);

  await postLlmEvent(runId, 'llm.prompt', promptText, { ...options, source: 'clipboard' });
  console.log(`✓ Prompt logged (${promptText.length} chars)`);
  console.log('');

  console.log('Step 2: Copy Claude\'s response to the clipboard, then press Enter');
  await waitForEnter('Press Enter when ready...');

  // Read response from clipboard
  let responseText;
  let spanStatus = 'ok';
  try {
    responseText = readClipboard();
    responseText = responseText.trim();
  } catch (err) {
    console.error(`Error reading response: ${err.message}`);
    spanStatus = 'error';
    await postSpanEvent(runId, 'span.end', {
      spanId,
      ts: Date.now(),
      status: spanStatus
    }, options);
    process.exit(1);
  }

  if (!responseText) {
    console.error('Error: Clipboard is empty (response)');
    spanStatus = 'error';
    await postSpanEvent(runId, 'span.end', {
      spanId,
      ts: Date.now(),
      status: spanStatus
    }, options);
    process.exit(1);
  }

  await postLlmEvent(runId, 'llm.response', responseText, { ...options, source: 'clipboard' });
  console.log(`✓ Response logged (${responseText.length} chars)`);

  // Try to extract usage information from the response
  // Claude responses may contain usage metadata in various formats
  // This is best-effort extraction with confidence tracking
  try {
    let usagePayload = null;
    let source = null;
    let confidence = 0;

    // TODO: Check for structured metadata/JSON first (highest confidence)
    // This would come from actual API response metadata if available
    // For now, we only have plaintext parsing

    // Try regex extraction from plaintext (low confidence)
    // Only proceed if we find explicit token labels
    const usagePattern = /(?:input[_\s]?tokens?|Input\s+tokens?)[:\s]+(\d+)[\s\S]*?(?:output[_\s]?tokens?|Output\s+tokens?)[:\s]+(\d+)/i;
    const usageMatch = responseText.match(usagePattern);

    if (usageMatch) {
      // Found token counts with explicit labels - use regex source
      const inputTokens = parseInt(usageMatch[1], 10);
      const outputTokens = parseInt(usageMatch[2], 10);

      // Only emit if values are reasonable (sanity check)
      if (inputTokens > 0 && inputTokens < 1000000 && outputTokens > 0 && outputTokens < 1000000) {
        // Part C: Generate reportId for idempotency
        const reportId = `report-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

        usagePayload = {
          reportId,
          spanId,
          model,
          ts: Date.now(),
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          source: 'regex',
          confidence: 0.4
        };
        source = 'regex';
        confidence = 0.4;
      }
    }

    // Cost extraction (never infer - only use if explicitly labeled with $)
    const costPattern = /(?:cost|price)[:\s]*\$\s*([\d.]+)/i;
    const costMatch = responseText.match(costPattern);

    if (costMatch && usagePayload) {
      const cost = parseFloat(costMatch[1]);
      if (!isNaN(cost) && cost >= 0 && cost < 1000) {
        usagePayload.costUsd = cost;
      }
    }

    // Only emit usage report if we have high confidence data
    if (usagePayload && confidence >= 0.4) {
      await postSpanEvent(runId, 'usage.report', usagePayload, options);
    }
  } catch (err) {
    // Non-fatal - usage extraction is best-effort
  }

  // End span successfully
  await postSpanEvent(runId, 'span.end', {
    spanId,
    ts: Date.now(),
    status: spanStatus
  }, options);

  console.log('');
  console.log('Both prompt and response logged successfully!');
}

// Command: agentops claude ask (best-effort one-shot)
async function claudeAskCommand(args, options) {
  if (args.length === 0) {
    console.error('Error: No prompt provided');
    console.error('Usage: agentops claude ask "<prompt text>"');
    process.exit(1);
  }

  const promptText = args.join(' ');
  const runId = await ensureSession(options);

  // Log the prompt first
  await postLlmEvent(runId, 'llm.prompt', promptText, { ...options, source: 'args' });
  console.log(`Logged prompt (${promptText.length} chars)`);

  // Try different Claude CLI invocation methods
  const methods = [
    { cmd: 'claude', args: ['-p', promptText], name: 'claude -p' },
    { cmd: 'claude', args: ['--prompt', promptText], name: 'claude --prompt' },
    { cmd: 'echo', args: [promptText, '|', 'claude'], name: 'echo | claude', shell: true }
  ];

  let responseText = null;
  let errorMessage = null;

  for (const method of methods) {
    try {
      console.log(`Trying: ${method.name}...`);

      let result;
      if (method.shell) {
        // Use shell for piped commands
        result = execSync(`echo "${promptText.replace(/"/g, '\\"')}" | claude`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 60000 // 60 second timeout
        });
      } else {
        // Try spawning the command directly
        result = execSync(`${method.cmd} ${method.args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 60000
        });
      }

      responseText = result.trim();
      if (responseText) {
        console.log('✓ Claude CLI responded successfully');
        break;
      }
    } catch (err) {
      errorMessage = err.message;
      // Continue to next method
    }
  }

  if (responseText) {
    // Success - log response
    await postLlmEvent(runId, 'llm.response', responseText, { ...options, source: 'claude-cli' });
    console.log(`Logged response (${responseText.length} chars)`);
    console.log('');
    console.log('Response:');
    console.log(responseText);
  } else {
    // All methods failed
    const server = options.server;
    const apiKey = options.apiKey || null;
    const client = new ApiClient(server, apiKey);

    // Log error event
    try {
      await client.postEvent(runId, {
        id: `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        ts: new Date().toISOString(),
        runId,
        type: 'run.error',
        level: 'error',
        payload: {
          error: 'Claude CLI one-shot not available',
          message: errorMessage || 'None of the attempted methods worked',
          tool: 'claude'
        }
      });
    } catch (err) {
      // Non-fatal
    }

    // Also log a placeholder response indicating CLI not available
    try {
      await client.postEvent(runId, {
        id: `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        ts: new Date().toISOString(),
        runId,
        type: 'llm.response',
        level: 'info',
        payload: {
          text: `[Claude CLI not available - ${errorMessage || 'unknown error'}]`,
          tool: 'claude',
          model: options.model || options.toolDefaults?.model || 'unknown',
          source: 'claude-cli-error'
        }
      });
    } catch (err) {
      // Non-fatal
    }

    console.error('');
    console.error('Claude CLI one-shot not detected.');
    console.error('');
    console.error('Use the clipboard workflow instead:');
    console.error('  agentops claude pair');
    console.error('');
    console.error('Or use individual commands:');
    console.error('  agentops claude prompt    (copy prompt first)');
    console.error('  agentops claude response  (copy response first)');
  }
}

// Main router for claude subcommands
async function claudeCommand(args, options) {
  if (args.length === 0) {
    console.error('Error: Missing claude subcommand');
    console.error('');
    console.error('Usage:');
    console.error('  agentops claude prompt [options]         Log a prompt from clipboard');
    console.error('  agentops claude response [options]       Log a response from clipboard');
    console.error('  agentops claude pair [options]           Interactive: capture prompt + response');
    console.error('  agentops claude ask "<text>" [options]   Best-effort one-shot (requires claude CLI)');
    console.error('');
    console.error('Options:');
    console.error('  --model <name>    Model name (default: from config or "unknown")');
    console.error('  --tag <tag>       Add tag (repeatable)');
    console.error('  --title <title>   Session title if starting new session (default: "Claude Session")');
    console.error('  --redact          Redact sensitive tokens (API keys, etc.)');
    console.error('');
    console.error('Examples:');
    console.error('  # Copy prompt, then:');
    console.error('  agentops claude prompt --model sonnet');
    console.error('');
    console.error('  # Copy response, then:');
    console.error('  agentops claude response');
    console.error('');
    console.error('  # Interactive pair workflow:');
    console.error('  agentops claude pair --title "My Claude Session"');
    console.error('');
    console.error('  # Read from stdin:');
    console.error('  agentops claude prompt - < prompt.txt');
    console.error('  agentops claude response - < response.txt');
    process.exit(1);
  }

  const subcommand = args[0];
  const subcommandArgs = args.slice(1);

  if (subcommand === 'prompt') {
    await claudePromptCommand(subcommandArgs, options);
  } else if (subcommand === 'response') {
    await claudeResponseCommand(subcommandArgs, options);
  } else if (subcommand === 'pair') {
    await claudePairCommand(subcommandArgs, options);
  } else if (subcommand === 'ask') {
    await claudeAskCommand(subcommandArgs, options);
  } else {
    console.error(`Error: Unknown claude subcommand: ${subcommand}`);
    console.error('Valid subcommands: prompt, response, pair, ask');
    process.exit(1);
  }
}

module.exports = { claudeCommand };
