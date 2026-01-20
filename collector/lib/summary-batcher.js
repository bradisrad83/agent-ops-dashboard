/**
 * SummaryBatcher - Summarizes filesystem changes over a rolling window
 * for agent-focused calm mode. Instead of emitting per-file events,
 * it emits periodic fs.summary events with aggregated counts.
 */
class SummaryBatcher {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 5000;
    this.topFilesLimit = options.topFilesLimit || 10;
    this.onFlush = options.onFlush || (() => {});
    this.verbose = options.verbose || false;

    // Track changes by kind
    this.created = new Set();
    this.modified = new Set();
    this.deleted = new Set();

    this.flushTimer = null;
    this.lastFlushTime = Date.now();
  }

  log(...args) {
    if (this.verbose) {
      console.log('[summary-batcher]', ...args);
    }
  }

  /**
   * Queue a file change for summarization.
   * @param {string} file - Relative file path
   * @param {'created'|'modified'|'deleted'} kind - Change type
   */
  queue(file, kind) {
    // Track this change
    if (kind === 'created') {
      this.created.add(file);
      // Remove from other sets if it was there
      this.modified.delete(file);
      this.deleted.delete(file);
    } else if (kind === 'modified') {
      // Only add to modified if not already created in this window
      if (!this.created.has(file)) {
        this.modified.add(file);
      }
      this.deleted.delete(file);
    } else if (kind === 'deleted') {
      // If it was created in this window, just remove it
      if (this.created.has(file)) {
        this.created.delete(file);
      } else {
        this.deleted.add(file);
      }
      this.modified.delete(file);
    }

    // Start flush timer if not already running
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush();
      }, this.windowMs);
    }
  }

  /**
   * Flush summary event if there are changes.
   */
  flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const totalFilesTouched = this.created.size + this.modified.size + this.deleted.size;

    if (totalFilesTouched === 0) {
      return;
    }

    const now = Date.now();
    const actualWindowMs = now - this.lastFlushTime;

    // Emit fs.summary event
    this.onFlush({
      type: 'fs.summary',
      payload: {
        windowMs: actualWindowMs,
        counts: {
          created: this.created.size,
          modified: this.modified.size,
          deleted: this.deleted.size
        },
        top: {
          created: Array.from(this.created).slice(0, this.topFilesLimit),
          modified: Array.from(this.modified).slice(0, this.topFilesLimit),
          deleted: Array.from(this.deleted).slice(0, this.topFilesLimit)
        },
        totalFilesTouched
      }
    });

    // Also emit fs.batch for backward compatibility with activity panel
    const allChanges = [
      ...Array.from(this.created).map(file => ({ file, kind: 'created' })),
      ...Array.from(this.modified).map(file => ({ file, kind: 'modified' })),
      ...Array.from(this.deleted).map(file => ({ file, kind: 'deleted' }))
    ];

    if (allChanges.length > 0) {
      this.onFlush({
        type: 'fs.batch',
        payload: {
          changes: allChanges,
          count: allChanges.length,
          windowMs: actualWindowMs
        }
      });
    }

    this.log(`Flushed summary: ${totalFilesTouched} files (${this.created.size} created, ${this.modified.size} modified, ${this.deleted.size} deleted)`);

    // Reset for next window
    this.created.clear();
    this.modified.clear();
    this.deleted.clear();
    this.lastFlushTime = now;
  }

  /**
   * Clear any pending timer and flush remaining changes.
   */
  stop() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}

module.exports = { SummaryBatcher };
