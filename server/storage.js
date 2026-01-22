/**
 * Storage layer with SQLite persistence
 *
 * Preserves the same interface as in-memory storage but uses SQLite backend.
 * SSE listener management remains in-memory (no need to persist).
 */

class Storage {
  constructor(db) {
    this.db = db // Database instance from db.js
    this.listeners = new Map() // runId -> Set of listener callbacks (in-memory)
  }

  // Run management
  createRun(runData) {
    const id = runData.id || `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    return this.db.createRun({
      id,
      title: runData.title || `Run ${id}`,
      startedAt: runData.startedAt,
      status: runData.status || 'running'
    })
  }

  getRuns() {
    return this.db.listRuns()
  }

  getRun(runId) {
    return this.db.getRun(runId)
  }

  updateRunStatus(runId, status) {
    const run = this.db.getRun(runId)
    if (run) {
      this.db.createRun({ ...run, status }) // INSERT OR REPLACE
    }
  }

  updateRun(runId, updates) {
    return this.db.updateRun(runId, updates)
  }

  // Event management
  addEvent(runId, eventData) {
    // Persist to DB first (gets monotonic ID from SQLite)
    const event = this.db.appendEvent({
      runId,
      type: eventData.type,
      payload: eventData.payload || {},
      ts: eventData.ts,
      level: eventData.level || 'info',
      agentId: eventData.agentId,
      taskId: eventData.taskId
    })

    // Notify listeners with the persisted event (includes DB-assigned ID)
    this.notifyListeners(runId, event)

    return event
  }

  getEvents(runId, options = {}) {
    const { limit = 500, after = '0' } = options
    return this.db.listEvents({ runId, after, limit })
  }

  // SSE listener management (in-memory, not persisted)
  addListener(runId, callback) {
    if (!this.listeners.has(runId)) {
      this.listeners.set(runId, new Set())
    }
    this.listeners.get(runId).add(callback)
  }

  removeListener(runId, callback) {
    const listeners = this.listeners.get(runId)
    if (listeners) {
      listeners.delete(callback)
      if (listeners.size === 0) {
        this.listeners.delete(runId)
      }
    }
  }

  notifyListeners(runId, event) {
    const listeners = this.listeners.get(runId)
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(event)
        } catch (err) {
          console.error('[Storage] Error notifying listener:', err)
        }
      })
    }
  }
}

module.exports = { Storage }
