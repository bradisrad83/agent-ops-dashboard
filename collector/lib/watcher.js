const fs = require('fs');
const path = require('path');

class FileWatcher {
  constructor(rootPath, options = {}) {
    this.rootPath = path.resolve(rootPath);
    this.ignorePatterns = options.ignore || [];
    this.debounceMs = options.debounceMs || 250;
    this.onEvent = options.onEvent || (() => {});
    this.verbose = options.verbose || false;

    this.watchers = new Map();
    this.pendingChanges = new Map();
    this.debounceTimer = null;
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

    this.pendingChanges.set(filePath, { file: filePath, kind });

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushChanges();
    }, this.debounceMs);
  }

  flushChanges() {
    if (this.pendingChanges.size === 0) {
      return;
    }

    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();

    for (const change of changes) {
      this.onEvent({
        type: 'fs.changed',
        payload: {
          file: path.relative(this.rootPath, change.file),
          kind: change.kind,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  watchDirectory(dirPath) {
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
    }
  }

  start() {
    this.log('Starting file watcher on:', this.rootPath);
    this.watchDirectory(this.rootPath);
  }

  stop() {
    this.log('Stopping file watcher');

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.flushChanges();
    }

    for (const watcher of this.watchers.values()) {
      watcher.close();
    }

    this.watchers.clear();
  }
}

module.exports = { FileWatcher };
