const fs = require('fs');
const { ApiClient } = require('./client');
const { SessionManager } = require('./session');

// Redact sensitive patterns from log lines
function redactLine(line) {
  return line
    .replace(/sk-[A-Za-z0-9]{20,}/g, 'sk-***REDACTED***')
    .replace(/api[_-]?key["']?\s*[:=]\s*["'][^"']+/gi, 'api_key=***REDACTED***')
    .replace(/bearer\s+[A-Za-z0-9\._-]+/gi, 'Bearer ***REDACTED***');
}

// Check if a line looks like an error
function isErrorLine(line) {
  return /error|exception|stack/i.test(line);
}

// Polling-based file tailer (no dependencies)
class FileTailer {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.follow = options.follow !== false;
    this.fromStart = options.fromStart === true;
    this.interval = options.interval || 500;
    this.maxLine = options.maxLine || 4000;
    this.filterRegex = options.filter ? new RegExp(options.filter) : null;
    this.level = options.level || 'info';
    this.tags = options.tag || [];
    this.redact = options.redact === true;

    this.position = 0;
    this.partialLine = '';
    this.timer = null;
    this.fd = null;
  }

  async start(onLine) {
    try {
      const stats = await fs.promises.stat(this.filePath);

      if (this.fromStart) {
        // Read from start, but cap to last 256KB to avoid memory issues
        const maxBytes = 256 * 1024;
        if (stats.size > maxBytes) {
          this.position = stats.size - maxBytes;
        }
        await this.readNewData(onLine);
      } else {
        // Start at end of file
        this.position = stats.size;
      }

      if (this.follow) {
        this.timer = setInterval(() => this.poll(onLine), this.interval);
      }
    } catch (err) {
      throw new Error(`Failed to start tailing ${this.filePath}: ${err.message}`);
    }
  }

  async poll(onLine) {
    try {
      const stats = await fs.promises.stat(this.filePath);

      if (stats.size > this.position) {
        await this.readNewData(onLine);
      } else if (stats.size < this.position) {
        // File was truncated or rotated
        this.position = 0;
        this.partialLine = '';
        await this.readNewData(onLine);
      }
    } catch (err) {
      // File might have been deleted/rotated - try to continue
      if (err.code === 'ENOENT') {
        this.position = 0;
        this.partialLine = '';
      }
    }
  }

  async readNewData(onLine) {
    const bytesToRead = (await fs.promises.stat(this.filePath)).size - this.position;

    if (bytesToRead <= 0) return;

    const buffer = Buffer.alloc(bytesToRead);
    const fd = await fs.promises.open(this.filePath, 'r');

    try {
      await fd.read(buffer, 0, bytesToRead, this.position);
      this.position += bytesToRead;

      const text = this.partialLine + buffer.toString('utf8');
      const lines = text.split('\n');

      // Keep the last partial line
      this.partialLine = lines.pop() || '';

      // Process complete lines
      for (const line of lines) {
        this.processLine(line, onLine);
      }
    } finally {
      await fd.close();
    }
  }

  processLine(line, onLine) {
    if (!line.trim()) return;

    // Truncate long lines
    let processedLine = line.length > this.maxLine
      ? line.substring(0, this.maxLine) + '...[truncated]'
      : line;

    // Apply filter
    if (this.filterRegex && !this.filterRegex.test(processedLine)) {
      return;
    }

    // Redact if enabled
    if (this.redact) {
      processedLine = redactLine(processedLine);
    }

    // Determine event type and level
    const isError = isErrorLine(processedLine);
    const eventType = isError ? 'vscode.error' : 'vscode.log';
    const level = isError ? 'error' : this.level;

    onLine({
      line: processedLine,
      type: eventType,
      level,
      tags: this.tags
    });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.fd) {
      this.fd = null;
    }
  }
}

async function tailCommand(options) {
  const filePath = options.file;

  if (!filePath) {
    console.error('Error: --file is required for tail command');
    process.exit(1);
  }

  // Check if file exists
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch (err) {
    console.error(`Error: Cannot read file ${filePath}`);
    process.exit(1);
  }

  // Setup API client and session
  const repoRoot = SessionManager.getRepoRoot();
  const sessionManager = new SessionManager(repoRoot);
  const session = options.runId ? { runId: options.runId } : sessionManager.loadSession();

  if (!session) {
    console.error('Error: No active session. Use --runId or run "agentops start" first.');
    process.exit(1);
  }

  const serverUrl = options.server || session.server || 'http://localhost:8787';
  const apiKey = options.apiKey || session.apiKey;
  const client = new ApiClient(serverUrl, apiKey);

  console.log(`Tailing: ${filePath}`);
  console.log(`Run ID: ${session.runId}`);
  console.log('Press Ctrl+C to stop\n');

  const tailer = new FileTailer(filePath, {
    follow: options.follow !== false,
    fromStart: options.fromStart === true,
    interval: parseInt(options.interval) || 500,
    maxLine: parseInt(options.maxLine) || 4000,
    filter: options.filter,
    level: options.level || 'info',
    tag: options.tag,
    redact: options.redact === true
  });

  let eventCount = 0;

  await tailer.start(async (lineData) => {
    try {
      await client.postEvent(session.runId, {
        type: lineData.type,
        level: lineData.level,
        payload: {
          line: lineData.line,
          file: filePath,
          tags: lineData.tags
        }
      });
      eventCount++;

      // Print indicator every 10 events
      if (eventCount % 10 === 0) {
        process.stdout.write('.');
      }
    } catch (err) {
      console.error('\nError posting event:', err.message);
    }
  });

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nStopping tail...');
    tailer.stop();

    try {
      await client.postEvent(session.runId, {
        type: 'note',
        level: 'info',
        payload: {
          text: `Stopped tailing ${filePath} (${eventCount} events captured)`
        }
      });
    } catch (err) {
      console.error('Error posting final event:', err.message);
    }

    console.log(`Captured ${eventCount} events`);
    process.exit(0);
  });
}

module.exports = { tailCommand };
