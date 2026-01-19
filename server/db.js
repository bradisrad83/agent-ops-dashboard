/**
 * SQLite persistence layer for Agent Ops Dashboard
 *
 * Provides durable storage for runs and events with:
 * - Monotonic event IDs via AUTOINCREMENT
 * - Cursor-based pagination
 * - Event retention policies
 * - Survives server restarts
 */

const fs = require('fs')
const path = require('path')

const DB_DIR = path.join(__dirname, 'data')
const DB_PATH = path.join(DB_DIR, 'agentops.sqlite')
const EVENT_RETENTION_MAX = parseInt(process.env.EVENT_RETENTION_MAX || '5000', 10)

// Try to load better-sqlite3, fall back gracefully
let Database3
try {
  Database3 = require('better-sqlite3')
} catch (err) {
  console.error('[DB] better-sqlite3 not found. Please install it:')
  console.error('      cd server && npm install better-sqlite3')
  throw new Error('Missing required dependency: better-sqlite3')
}

/**
 * SQLite database wrapper
 */
class Database {
  constructor() {
    this.dbPath = DB_PATH
    this.retentionMax = EVENT_RETENTION_MAX
    this.db = null
  }

  /**
   * Initialize database schema
   */
  initDb() {
    // Ensure data directory exists
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true })
    }

    // Open database
    this.db = new Database3(this.dbPath)

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL')

    // Create schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        title TEXT,
        started_at INTEGER NOT NULL,
        status TEXT
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        level TEXT,
        agent_id TEXT,
        task_id TEXT,
        payload TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_events_run_id_id ON events(run_id, id);
    `)

    console.log(`[DB] Initialized database at ${this.dbPath}`)
    console.log(`[DB] Event retention: ${this.retentionMax} events per run`)

    // Log current state
    const nextId = this.getNextEventId()
    const runCount = this.db.prepare('SELECT COUNT(*) as count FROM runs').get().count
    console.log(`[DB] Existing runs: ${runCount}, Next event ID: ${nextId}`)
  }

  /**
   * Create or update a run
   */
  createRun({ id, title, startedAt, status = 'running' }) {
    const ts = startedAt ? new Date(startedAt).getTime() : Date.now()

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO runs (id, title, started_at, status)
      VALUES (?, ?, ?, ?)
    `)

    stmt.run(id, title || '', ts, status)

    return {
      id,
      title: title || '',
      startedAt: new Date(ts).toISOString(),
      status
    }
  }

  /**
   * List all runs, sorted by started_at DESC
   */
  listRuns() {
    const stmt = this.db.prepare('SELECT * FROM runs ORDER BY started_at DESC')
    const rows = stmt.all()

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      startedAt: new Date(row.started_at).toISOString(),
      status: row.status
    }))
  }

  /**
   * Get a single run by ID
   */
  getRun(runId) {
    const stmt = this.db.prepare('SELECT * FROM runs WHERE id = ? LIMIT 1')
    const row = stmt.get(runId)

    if (!row) return null

    return {
      id: row.id,
      title: row.title,
      startedAt: new Date(row.started_at).toISOString(),
      status: row.status
    }
  }

  /**
   * Update run fields (status and/or title)
   */
  updateRun(runId, updates) {
    const currentRun = this.getRun(runId)
    if (!currentRun) return null

    const { title, status } = updates

    // Build dynamic update query
    const fields = []
    const values = []

    if (title !== undefined) {
      fields.push('title = ?')
      values.push(title)
    }

    if (status !== undefined) {
      fields.push('status = ?')
      values.push(status)
    }

    if (fields.length === 0) {
      // No fields to update, return current run
      return currentRun
    }

    values.push(runId)

    const stmt = this.db.prepare(`
      UPDATE runs
      SET ${fields.join(', ')}
      WHERE id = ?
    `)

    stmt.run(...values)

    // Return updated run
    return this.getRun(runId)
  }

  /**
   * Append an event and return it with its assigned ID
   */
  appendEvent({ runId, type, payload, ts, level, agentId, taskId }) {
    const timestamp = ts ? new Date(ts).getTime() : Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO events (run_id, ts, type, level, agent_id, task_id, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const info = stmt.run(
      runId,
      timestamp,
      type,
      level || 'info',
      agentId || null,
      taskId || null,
      JSON.stringify(payload || {})
    )

    // Apply retention policy
    this.pruneEvents(runId)

    // Return the full event
    return {
      id: String(info.lastInsertRowid),
      runId,
      ts: new Date(timestamp).toISOString(),
      type,
      level: level || 'info',
      agentId,
      taskId,
      payload: payload || {}
    }
  }

  /**
   * List events for a run with cursor pagination
   */
  listEvents({ runId, after = '0', limit = 500 }) {
    const afterId = parseInt(after, 10) || 0
    const actualLimit = Math.min(Math.max(1, limit), 1000)

    const stmt = this.db.prepare(`
      SELECT * FROM events
      WHERE run_id = ? AND id > ?
      ORDER BY id ASC
      LIMIT ?
    `)

    const rows = stmt.all(runId, afterId, actualLimit)

    return rows.map(row => ({
      id: String(row.id),
      runId: row.run_id,
      ts: new Date(row.ts).toISOString(),
      type: row.type,
      level: row.level,
      agentId: row.agent_id || undefined,
      taskId: row.task_id || undefined,
      payload: JSON.parse(row.payload)
    }))
  }

  /**
   * Get or create a run (auto-create behavior)
   */
  getOrCreateRun(runId, title) {
    let run = this.getRun(runId)
    if (!run) {
      run = this.createRun({ id: runId, title: title || `Run ${runId}` })
    }
    return run
  }

  /**
   * Prune old events beyond retention limit
   */
  pruneEvents(runId) {
    if (this.retentionMax <= 0) return

    // Only prune if we have more than retention max
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM events WHERE run_id = ?')
    const count = countStmt.get(runId).count

    if (count <= this.retentionMax) return

    // Delete oldest events beyond retention
    // OFFSET n gives us the (n+1)th row, so we use (retentionMax - 1)
    const deleteStmt = this.db.prepare(`
      DELETE FROM events
      WHERE run_id = ?
      AND id < (
        SELECT id FROM events
        WHERE run_id = ?
        ORDER BY id DESC
        LIMIT 1 OFFSET ?
      )
    `)

    deleteStmt.run(runId, runId, this.retentionMax - 1)
  }

  /**
   * Get the next event ID (useful for understanding current state)
   */
  getNextEventId() {
    const result = this.db.prepare('SELECT MAX(id) as max_id FROM events').get()
    return (result.max_id || 0) + 1
  }

  /**
   * Close database (cleanup)
   */
  close() {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

module.exports = { Database }
