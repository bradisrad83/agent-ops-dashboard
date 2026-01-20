/**
 * ChangeBatcher - Batches filesystem changes to reduce event noise.
 * Can emit either individual fs.changed events or batched fs.batch events.
 * Supports fsMode: 'raw', 'batch', 'summary', or 'off'.
 */
class ChangeBatcher {
  constructor(options = {}) {
    this.batchMode = options.batchMode !== false; // default true
    this.fsMode = options.fsMode || 'batch'; // 'raw', 'batch', 'summary', 'off'
    this.windowMs = options.windowMs || 250;
    this.onFlush = options.onFlush || (() => {});
    this.verbose = options.verbose || false;

    this.pendingChanges = new Map();
    this.debounceTimer = null;
  }

  log(...args) {
    if (this.verbose) {
      console.log('[change-batcher]', ...args);
    }
  }

  /**
   * Queue a file change for batching.
   * @param {string} file - Relative file path
   * @param {'created'|'modified'|'deleted'} kind - Change type
   */
  queue(file, kind) {
    // Handle fsMode=off early
    if (this.fsMode === 'off') {
      return;
    }

    this.pendingChanges.set(file, { file, kind });

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, this.windowMs);
  }

  /**
   * Flush all pending changes as events.
   */
  flush() {
    if (this.pendingChanges.size === 0 || this.fsMode === 'off') {
      return;
    }

    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();

    // fsMode=raw: emit individual fs.changed events
    if (this.fsMode === 'raw') {
      for (const change of changes) {
        this.onFlush({
          type: 'fs.changed',
          payload: {
            file: change.file,
            kind: change.kind,
            timestamp: new Date().toISOString(),
          },
        });
      }
      this.log(`Flushed ${changes.length} individual changes (raw mode)`);
      return;
    }

    // fsMode=batch or fsMode=summary: emit fs.batch
    // Note: fsMode=summary is handled by SummaryBatcher wrapper,
    // but we still support batch mode here for backward compatibility
    if ((this.batchMode || this.fsMode === 'batch') && changes.length > 1) {
      // Emit as fs.batch event
      this.onFlush({
        type: 'fs.batch',
        payload: {
          changes: changes.map(c => ({ file: c.file, kind: c.kind })),
          count: changes.length,
          windowMs: this.windowMs
        }
      });
      this.log(`Flushed batch: ${changes.length} changes`);
    } else {
      // Emit individual fs.changed events (single change or batch disabled)
      for (const change of changes) {
        this.onFlush({
          type: 'fs.changed',
          payload: {
            file: change.file,
            kind: change.kind,
            timestamp: new Date().toISOString(),
          },
        });
      }
      this.log(`Flushed ${changes.length} individual changes`);
    }
  }

  /**
   * Clear any pending timer and flush remaining changes.
   */
  stop() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.flush();
  }
}

module.exports = { ChangeBatcher };
