const fs = require('fs');
const path = require('path');
const { ChangeBatcher } = require('./change-batcher');

/**
 * PollingWatcher - Lightweight directory scanner for environments where fs.watch is unreliable.
 * Uses periodic stat-based scanning instead of native file system events.
 */
class PollingWatcher {
  constructor(rootPath, options = {}) {
    this.rootPath = path.resolve(rootPath);
    this.ignorePatterns = options.ignore || [];
    this.pollInterval = options.pollInterval || 1000;
    this.onEvent = options.onEvent || (() => {});
    this.verbose = options.verbose || false;
    this.maxFiles = options.maxFiles || 50000;
    this.batchMode = options.batchMode !== false; // default true
    this.debounceMs = options.debounceMs || 250;

    // Map: filePath -> { mtimeMs, size }
    this.fileMap = new Map();
    this.pollTimer = null;
    this.isScanning = false;

    // Use ChangeBatcher for batching
    this.batcher = new ChangeBatcher({
      batchMode: this.batchMode,
      windowMs: this.debounceMs,
      verbose: this.verbose,
      onFlush: (event) => {
        this.onEvent(event);
      }
    });
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
      console.log('[polling-watcher]', ...args);
    }
  }

  /**
   * Recursively scan a directory and collect file stats.
   * Returns array of { path, mtimeMs, size }
   */
  async scanDirectory(dirPath, results = []) {
    if (this.shouldIgnore(dirPath)) {
      return results;
    }

    // Safety check: don't scan too many files
    if (results.length >= this.maxFiles) {
      console.warn(`[polling-watcher] Max files limit (${this.maxFiles}) reached. Some files may not be monitored.`);
      return results;
    }

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (this.shouldIgnore(fullPath)) {
          continue;
        }

        if (results.length >= this.maxFiles) {
          break;
        }

        try {
          if (entry.isDirectory()) {
            await this.scanDirectory(fullPath, results);
          } else if (entry.isFile()) {
            const stats = await fs.promises.stat(fullPath);
            results.push({
              path: fullPath,
              mtimeMs: stats.mtimeMs,
              size: stats.size
            });
          }
        } catch (err) {
          // File may have been deleted or inaccessible - skip it
          if (err.code !== 'ENOENT' && err.code !== 'EACCES') {
            this.log('Error scanning file:', fullPath, err.message);
          }
        }
      }
    } catch (err) {
      // Directory may have been deleted or inaccessible - skip it
      if (err.code !== 'ENOENT' && err.code !== 'EACCES') {
        this.log('Error scanning directory:', dirPath, err.message);
      }
    }

    return results;
  }

  /**
   * Perform a single poll cycle:
   * - Scan all files
   * - Compare with previous snapshot
   * - Emit change events
   */
  async poll() {
    if (this.isScanning) {
      this.log('Skipping poll - previous scan still in progress');
      return;
    }

    this.isScanning = true;

    try {
      const currentFiles = await this.scanDirectory(this.rootPath);
      const newFileMap = new Map();
      const changes = [];

      // Build new file map and detect created/modified files
      for (const file of currentFiles) {
        newFileMap.set(file.path, { mtimeMs: file.mtimeMs, size: file.size });

        const existing = this.fileMap.get(file.path);
        if (!existing) {
          // New file
          changes.push({ file: file.path, kind: 'created' });
        } else if (existing.mtimeMs !== file.mtimeMs || existing.size !== file.size) {
          // Modified file
          changes.push({ file: file.path, kind: 'modified' });
        }
      }

      // Detect deleted files
      for (const [filePath] of this.fileMap) {
        if (!newFileMap.has(filePath)) {
          changes.push({ file: filePath, kind: 'deleted' });
        }
      }

      // Update file map
      this.fileMap = newFileMap;

      // Queue changes for batching
      if (changes.length > 0) {
        for (const change of changes) {
          const relativePath = path.relative(this.rootPath, change.file);
          this.batcher.queue(relativePath, change.kind);
        }
        this.log(`Detected ${changes.length} file changes`);
      }
    } catch (err) {
      this.log('Error during poll:', err.message);
    } finally {
      this.isScanning = false;
    }
  }

  async start() {
    this.log('Starting polling watcher on:', this.rootPath);
    this.log('Poll interval:', this.pollInterval, 'ms');

    // Initial scan to build baseline
    this.log('Performing initial scan...');
    const initialFiles = await this.scanDirectory(this.rootPath);
    this.log(`Initial scan complete: ${initialFiles.length} files found`);

    for (const file of initialFiles) {
      this.fileMap.set(file.path, { mtimeMs: file.mtimeMs, size: file.size });
    }

    // Start polling
    this.pollTimer = setInterval(() => {
      this.poll();
    }, this.pollInterval);
  }

  stop() {
    this.log('Stopping polling watcher');

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.batcher.stop();
    this.fileMap.clear();
  }
}

module.exports = { PollingWatcher };
