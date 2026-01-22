const fs = require('fs');
const path = require('path');
const { ChangeBatcher } = require('./change-batcher');
const { SummaryBatcher } = require('./summary-batcher');

class FileWatcher {
  constructor(rootPath, options = {}) {
    this.rootPath = path.resolve(rootPath);
    this.ignorePatterns = options.ignore || [];
    this.debounceMs = options.debounceMs || 250;
    this.onEvent = options.onEvent || (() => {});
    this.onError = options.onError || (() => {});
    this.verbose = options.verbose || false;
    this.batchMode = options.batchMode !== false; // default true
    this.fsMode = options.fsMode || 'batch'; // 'raw', 'batch', 'summary', 'off'

    this.watchers = new Map();
    this.failed = false;

    // Use SummaryBatcher for summary mode, ChangeBatcher for others
    if (this.fsMode === 'summary') {
      this.batcher = new SummaryBatcher({
        windowMs: 5000, // 5 seconds for summary mode
        verbose: this.verbose,
        onFlush: (event) => {
          this.onEvent(event);
        }
      });
    } else {
      this.batcher = new ChangeBatcher({
        batchMode: this.batchMode,
        fsMode: this.fsMode,
        windowMs: this.debounceMs,
        verbose: this.verbose,
        onFlush: (event) => {
          this.onEvent(event);
        }
      });
    }
  }

  shouldIgnore(filePath) {
    const relativePath = path.relative(this.rootPath, filePath);
    const parts = relativePath.split(path.sep);

    for (const pattern of this.ignorePatterns) {
      if (parts.some(part => part === pattern)) {
        return true;
      }
      if (relativePath.startsWith(pattern)) {
        return true;
      }
    }

    return false;
  }

  log(...args) {
    if (this.verbose) {
      console.log('[watcher]', ...args);
    }
  }

  queueChange(filePath, kind) {
    if (this.shouldIgnore(filePath)) {
      return;
    }

    const relativePath = path.relative(this.rootPath, filePath);
    this.batcher.queue(relativePath, kind);
  }

  watchDirectory(dirPath) {
    if (this.failed) {
      return; // Stop trying if we've already failed
    }

    if (this.shouldIgnore(dirPath)) {
      return;
    }

    if (this.watchers.has(dirPath)) {
      return;
    }

    try {
      const watcher = fs.watch(dirPath, { recursive: false }, (eventType, filename) => {
        if (!filename) return;

        const fullPath = path.join(dirPath, filename);

        fs.stat(fullPath, (err, stats) => {
          if (err) {
            if (err.code === 'ENOENT') {
              this.queueChange(fullPath, 'deleted');
            }
          } else if (stats.isDirectory()) {
            this.watchDirectory(fullPath);
            this.queueChange(fullPath, 'created');
          } else if (stats.isFile()) {
            const kind = eventType === 'rename' ? 'created' : 'modified';
            this.queueChange(fullPath, kind);
          }
        });
      });

      // Handle watcher errors (ENOSPC, etc.)
      watcher.on('error', (err) => {
        this.log('Watcher error:', err.message);
        this.handleWatchError(err);
      });

      this.watchers.set(dirPath, watcher);
      this.log('Watching:', dirPath);

      fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
        if (err) return;

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subdir = path.join(dirPath, entry.name);
            this.watchDirectory(subdir);
          }
        }
      });
    } catch (err) {
      this.log('Error watching directory:', dirPath, err.message);
      this.handleWatchError(err);
    }
  }

  handleWatchError(err) {
    // Check for common resource limit errors
    const isResourceError =
      err.code === 'ENOSPC' ||  // No space (inotify limit on Linux)
      err.code === 'EMFILE' ||  // Too many open files
      err.code === 'ENFILE' ||  // File table overflow
      err.message.includes('watch') && err.message.includes('ENOSPC');

    if (isResourceError && !this.failed) {
      this.failed = true;
      this.onError({
        code: err.code || 'WATCH_ERROR',
        message: err.message,
        reason: 'Resource limits exceeded - too many files to watch'
      });
    }
  }

  start() {
    this.log('Starting file watcher on:', this.rootPath);
    this.watchDirectory(this.rootPath);
  }

  stop() {
    this.log('Stopping file watcher');

    this.batcher.stop();

    for (const watcher of this.watchers.values()) {
      watcher.close();
    }

    this.watchers.clear();
  }
}

module.exports = { FileWatcher };
