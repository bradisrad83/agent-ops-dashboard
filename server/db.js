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
   * Run schema migrations (additive only)
   */
  runMigrations() {
    // Get current columns in runs table
    const columns = this.db.pragma('table_info(runs)')
    const columnNames = columns.map(col => col.name)

    // Add ended_at column if missing
    if (!columnNames.includes('ended_at')) {
      console.log('[DB] Migration: Adding ended_at column to runs table')
      this.db.exec('ALTER TABLE runs ADD COLUMN ended_at INTEGER NULL')
    }

    // Add error_message column if missing
    if (!columnNames.includes('error_message')) {
      console.log('[DB] Migration: Adding error_message column to runs table')
      this.db.exec('ALTER TABLE runs ADD COLUMN error_message TEXT NULL')
    }

    // Add metadata column if missing
    if (!columnNames.includes('metadata')) {
      console.log('[DB] Migration: Adding metadata column to runs table')
      this.db.exec('ALTER TABLE runs ADD COLUMN metadata TEXT NULL')
    }

    // Check if spans table exists
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='spans'").all()
    if (tables.length === 0) {
      console.log('[DB] Migration: Creating spans table')
      this.db.exec(`
        CREATE TABLE spans (
          span_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          parent_span_id TEXT NULL,
          name TEXT NOT NULL,
          kind TEXT NOT NULL,
          start_ts INTEGER NOT NULL,
          end_ts INTEGER NULL,
          status TEXT NULL,
          attrs TEXT NULL,
          FOREIGN KEY(run_id) REFERENCES runs(id)
        );

        CREATE INDEX idx_spans_run_id ON spans(run_id);
        CREATE INDEX idx_spans_parent_span_id ON spans(parent_span_id);
        CREATE INDEX idx_spans_run_start_ts ON spans(run_id, start_ts);
      `)
    }

    // Add idx_spans_run_start_ts index if missing (Part B: efficient parent selection)
    const indexes = this.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_spans_run_start_ts'").all()
    if (indexes.length === 0) {
      console.log('[DB] Migration: Adding idx_spans_run_start_ts index to spans table')
      this.db.exec('CREATE INDEX idx_spans_run_start_ts ON spans(run_id, start_ts)')
    }

    // Check if usage_reports table exists
    const usageTables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usage_reports'").all()
    if (usageTables.length === 0) {
      console.log('[DB] Migration: Creating usage_reports table')
      this.db.exec(`
        CREATE TABLE usage_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id TEXT NOT NULL,
          span_id TEXT NULL,
          ts INTEGER NOT NULL,
          model TEXT NULL,
          input_tokens INTEGER NULL,
          output_tokens INTEGER NULL,
          total_tokens INTEGER NULL,
          cost_usd REAL NULL,
          attrs TEXT NULL,
          source TEXT NULL,
          confidence REAL NULL,
          FOREIGN KEY(run_id) REFERENCES runs(id),
          FOREIGN KEY(span_id) REFERENCES spans(span_id)
        );

        CREATE INDEX idx_usage_reports_run_id ON usage_reports(run_id);
        CREATE INDEX idx_usage_reports_span_id ON usage_reports(span_id);
        CREATE INDEX idx_usage_reports_ts ON usage_reports(ts);
      `)
    }

    // Add source and confidence columns if missing from usage_reports
    const usageColumns = this.db.prepare("SELECT name FROM pragma_table_info('usage_reports')").all()
    const usageColumnNames = usageColumns.map(col => col.name)

    if (!usageColumnNames.includes('source')) {
      console.log('[DB] Migration: Adding source column to usage_reports table')
      this.db.exec('ALTER TABLE usage_reports ADD COLUMN source TEXT NULL')
    }

    if (!usageColumnNames.includes('confidence')) {
      console.log('[DB] Migration: Adding confidence column to usage_reports table')
      this.db.exec('ALTER TABLE usage_reports ADD COLUMN confidence REAL NULL')
    }

    // Add report_id column if missing from usage_reports (Part A: idempotency)
    if (!usageColumnNames.includes('report_id')) {
      console.log('[DB] Migration: Adding report_id column to usage_reports table')
      this.db.exec('ALTER TABLE usage_reports ADD COLUMN report_id TEXT NULL')

      // Add UNIQUE index on report_id (ignores NULLs automatically in SQLite)
      console.log('[DB] Migration: Adding UNIQUE index on report_id')
      this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_reports_report_id ON usage_reports(report_id)')
    }
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

    // Run migrations to add new columns if they don't exist
    this.runMigrations()

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

    return rows.map(row => {
      const result = {
        id: row.id,
        title: row.title,
        startedAt: new Date(row.started_at).toISOString(),
        status: row.status
      }

      // Add optional fields if present
      if (row.ended_at) {
        result.endedAt = new Date(row.ended_at).toISOString()
      }

      if (row.error_message) {
        result.errorMessage = row.error_message
      }

      if (row.metadata) {
        try {
          result.metadata = JSON.parse(row.metadata)
        } catch {
          // Invalid JSON, skip
        }
      }

      return result
    })
  }

  /**
   * Get a single run by ID
   */
  getRun(runId) {
    const stmt = this.db.prepare('SELECT * FROM runs WHERE id = ? LIMIT 1')
    const row = stmt.get(runId)

    if (!row) return null

    const result = {
      id: row.id,
      title: row.title,
      startedAt: new Date(row.started_at).toISOString(),
      status: row.status
    }

    // Add optional fields if present
    if (row.ended_at) {
      result.endedAt = new Date(row.ended_at).toISOString()
    }

    if (row.error_message) {
      result.errorMessage = row.error_message
    }

    if (row.metadata) {
      try {
        result.metadata = JSON.parse(row.metadata)
      } catch {
        // Invalid JSON, skip
      }
    }

    return result
  }

  /**
   * Update run fields with lifecycle semantics
   */
  updateRun(runId, updates) {
    const currentRun = this.getRun(runId)
    if (!currentRun) return null

    const { title, status, errorMessage, metadata } = updates

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

      // Lifecycle semantics: set ended_at when transitioning to terminal state
      if ((status === 'completed' || status === 'error') && !currentRun.endedAt) {
        fields.push('ended_at = ?')
        values.push(Date.now())
      }
    }

    if (errorMessage !== undefined) {
      fields.push('error_message = ?')
      values.push(errorMessage)
    }

    if (metadata !== undefined) {
      fields.push('metadata = ?')
      values.push(typeof metadata === 'string' ? metadata : JSON.stringify(metadata))
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
   * Upsert a span (create or update)
   */
  upsertSpan({ spanId, runId, parentSpanId, name, kind, startTs, endTs, status, attrs }) {
    const stmt = this.db.prepare(`
      INSERT INTO spans (span_id, run_id, parent_span_id, name, kind, start_ts, end_ts, status, attrs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(span_id) DO UPDATE SET
        end_ts = COALESCE(excluded.end_ts, end_ts),
        status = COALESCE(excluded.status, status),
        attrs = COALESCE(excluded.attrs, attrs)
    `)

    stmt.run(
      spanId,
      runId,
      parentSpanId || null,
      name,
      kind,
      startTs,
      endTs || null,
      status || null,
      attrs ? JSON.stringify(attrs) : null
    )
  }

  /**
   * List spans for a run
   */
  listSpans({ runId, since, limit = 5000 }) {
    const actualLimit = Math.min(Math.max(1, limit), 10000)

    let query = 'SELECT * FROM spans WHERE run_id = ?'
    const params = [runId]

    if (since) {
      query += ' AND start_ts >= ?'
      params.push(since)
    }

    query += ' ORDER BY start_ts ASC LIMIT ?'
    params.push(actualLimit)

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params)

    return rows.map(row => ({
      spanId: row.span_id,
      runId: row.run_id,
      parentSpanId: row.parent_span_id || undefined,
      name: row.name,
      kind: row.kind,
      startTs: row.start_ts,
      endTs: row.end_ts || undefined,
      status: row.status || undefined,
      attrs: row.attrs ? JSON.parse(row.attrs) : undefined
    }))
  }

  /**
   * Find the most recent active span (span without endTs) for a given run
   * Used for auto-parenting tool spans
   *
   * Part B: Timestamp-aware parent selection
   * - If ts provided: finds span where start_ts <= ts AND (end_ts IS NULL OR end_ts >= ts)
   * - If ts missing: falls back to latest open span (end_ts IS NULL)
   */
  findActiveSpan(runId, ts) {
    let stmt
    let row

    if (ts !== undefined && ts !== null) {
      // Timestamp-aware: find span active at the given timestamp
      stmt = this.db.prepare(`
        SELECT * FROM spans
        WHERE run_id = ?
          AND start_ts <= ?
          AND (end_ts IS NULL OR end_ts >= ?)
        ORDER BY start_ts DESC
        LIMIT 1
      `)
      row = stmt.get(runId, ts, ts)
    } else {
      // Fallback: find latest open span
      stmt = this.db.prepare(`
        SELECT * FROM spans
        WHERE run_id = ? AND end_ts IS NULL
        ORDER BY start_ts DESC
        LIMIT 1
      `)
      row = stmt.get(runId)
    }

    if (!row) return null

    return {
      spanId: row.span_id,
      runId: row.run_id,
      parentSpanId: row.parent_span_id || undefined,
      name: row.name,
      kind: row.kind,
      startTs: row.start_ts,
      endTs: row.end_ts || undefined,
      status: row.status || undefined,
      attrs: row.attrs ? JSON.parse(row.attrs) : undefined
    }
  }

  /**
   * Get a single span by spanId
   * Used for checking if span exists before updating
   */
  getSpan(spanId) {
    const stmt = this.db.prepare(`
      SELECT * FROM spans
      WHERE span_id = ?
      LIMIT 1
    `)

    const row = stmt.get(spanId)
    if (!row) return null

    return {
      spanId: row.span_id,
      runId: row.run_id,
      parentSpanId: row.parent_span_id || undefined,
      name: row.name,
      kind: row.kind,
      startTs: row.start_ts,
      endTs: row.end_ts || undefined,
      status: row.status || undefined,
      attrs: row.attrs ? JSON.parse(row.attrs) : undefined
    }
  }

  /**
   * Insert a usage report with validation and idempotency support
   * Part A: Idempotency via reportId (INSERT OR IGNORE when present)
   * Part B: Server-side validation (sanitize invalid values to NULL)
   */
  insertUsageReport({ runId, spanId, ts, model, inputTokens, outputTokens, totalTokens, costUsd, attrs, source, confidence, reportId }) {
    const timestamp = ts || Date.now()

    // Part B: Server-side validation - sanitize invalid values to NULL
    const sanitizeTokens = (val) => {
      if (val === null || val === undefined) return null
      if (typeof val !== 'number' || val < 0 || val > 50_000_000) return null
      return val
    }

    const sanitizeCost = (val) => {
      if (val === null || val === undefined) return null
      if (typeof val !== 'number' || val < 0 || val > 10_000) return null
      return val
    }

    const sanitizedInputTokens = sanitizeTokens(inputTokens)
    const sanitizedOutputTokens = sanitizeTokens(outputTokens)
    const sanitizedTotalTokens = sanitizeTokens(totalTokens)
    const sanitizedCostUsd = sanitizeCost(costUsd)

    // Part A: Use INSERT OR IGNORE when reportId is present for idempotency
    const sql = reportId
      ? `INSERT OR IGNORE INTO usage_reports (run_id, span_id, ts, model, input_tokens, output_tokens, total_tokens, cost_usd, attrs, source, confidence, report_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      : `INSERT INTO usage_reports (run_id, span_id, ts, model, input_tokens, output_tokens, total_tokens, cost_usd, attrs, source, confidence, report_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

    const stmt = this.db.prepare(sql)

    stmt.run(
      runId,
      spanId || null,
      timestamp,
      model || null,
      sanitizedInputTokens,
      sanitizedOutputTokens,
      sanitizedTotalTokens,
      sanitizedCostUsd,
      attrs ? JSON.stringify(attrs) : null,
      source || null,
      confidence !== undefined ? confidence : null,
      reportId || null
    )
  }

  /**
   * Get aggregated usage for a run
   * Prevents double counting by keeping only the latest report per span
   *
   * Strategy (Option B):
   * - Deduplicate per-span reports (keep latest per span_id)
   * - Keep latest run-level report (span_id NULL)
   * - If run-level report exists, use it for totals (override)
   * - Otherwise, sum from per-span reports
   * - bySpan always derived from per-span reports only
   */
  getRunUsage(runId) {
    // Get all usage reports for this run, sorted
    const allReportsStmt = this.db.prepare(`
      SELECT
        id,
        span_id,
        ts,
        model,
        input_tokens,
        output_tokens,
        total_tokens,
        cost_usd,
        source,
        confidence
      FROM usage_reports
      WHERE run_id = ?
      ORDER BY span_id, ts DESC, id DESC
    `)
    const allReports = allReportsStmt.all(runId)

    // Deduplicate: keep only the latest report per span (when span_id NOT NULL)
    const latestBySpan = new Map()
    let runLevelLatest = null

    for (const report of allReports) {
      if (report.span_id) {
        // Per-span report: keep latest per span_id
        if (!latestBySpan.has(report.span_id)) {
          latestBySpan.set(report.span_id, report)
        }
      } else {
        // Run-level report (span_id NULL): keep only the first (latest)
        if (!runLevelLatest) {
          runLevelLatest = report
        }
      }
    }

    // Build bySpan object from per-span reports
    const bySpan = {}
    for (const [spanId, report] of latestBySpan.entries()) {
      const inputTokens = report.input_tokens || 0
      const outputTokens = report.output_tokens || 0
      let totalTokens = report.total_tokens || 0

      // Compute total_tokens if NULL but input+output exist
      if (totalTokens === 0 && (inputTokens > 0 || outputTokens > 0)) {
        totalTokens = inputTokens + outputTokens
      }

      bySpan[spanId] = {
        inputTokens,
        outputTokens,
        totalTokens,
        // Keep cost as null when unknown (don't default to 0)
        costUsd: report.cost_usd !== null && report.cost_usd !== undefined ? report.cost_usd : null,
        model: report.model || undefined,
        source: report.source || undefined,
        confidence: report.confidence !== null && report.confidence !== undefined ? report.confidence : undefined
      }
    }

    // Compute totals (Option B: run-level override if present)
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalTotalTokens = 0
    let totalCostUsd = null
    let totalsModel = undefined
    let totalsSource = undefined
    let totalsConfidence = undefined

    if (runLevelLatest) {
      // Use run-level report for totals
      totalInputTokens = runLevelLatest.input_tokens || 0
      totalOutputTokens = runLevelLatest.output_tokens || 0
      totalTotalTokens = runLevelLatest.total_tokens || 0

      // Compute total_tokens if NULL but input+output exist
      if (totalTotalTokens === 0 && (totalInputTokens > 0 || totalOutputTokens > 0)) {
        totalTotalTokens = totalInputTokens + totalOutputTokens
      }

      // Keep cost as null when unknown
      totalCostUsd = runLevelLatest.cost_usd !== null && runLevelLatest.cost_usd !== undefined ? runLevelLatest.cost_usd : null
      totalsModel = runLevelLatest.model || undefined
      totalsSource = runLevelLatest.source || undefined
      totalsConfidence = runLevelLatest.confidence !== null && runLevelLatest.confidence !== undefined ? runLevelLatest.confidence : undefined
    } else {
      // Sum from per-span reports
      let hasCost = false

      for (const report of latestBySpan.values()) {
        const inputTokens = report.input_tokens || 0
        const outputTokens = report.output_tokens || 0
        let totalTokens = report.total_tokens || 0

        // Compute total_tokens if NULL but input+output exist
        if (totalTokens === 0 && (inputTokens > 0 || outputTokens > 0)) {
          totalTokens = inputTokens + outputTokens
        }

        totalInputTokens += inputTokens
        totalOutputTokens += outputTokens
        totalTotalTokens += totalTokens

        // Accumulate cost only if known
        if (report.cost_usd !== null && report.cost_usd !== undefined) {
          if (!hasCost) {
            totalCostUsd = 0
            hasCost = true
          }
          totalCostUsd += report.cost_usd
        }
      }
    }

    return {
      totals: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalTotalTokens,
        costUsd: totalCostUsd,
        model: totalsModel,
        source: totalsSource,
        confidence: totalsConfidence
      },
      bySpan
    }
  }

  /**
   * Compute trace summary for a run
   * Returns: { totalDurationMs, criticalPathMs, slowestSpans, errorSpans, hotspotsByKind }
   */
  getTraceSummary(runId) {
    // Get all spans for this run
    const spans = this.listSpans({ runId, limit: 10000 })

    if (spans.length === 0) {
      return {
        totalDurationMs: 0,
        criticalPathMs: 0,
        slowestSpans: [],
        errorSpans: [],
        hotspotsByKind: [],
        hotspotsByKindSelf: []
      }
    }

    // Track anomalies for data quality reporting
    let durationAnomalies = 0
    let selfTimeClampedSpans = 0

    // Calculate total duration (run start to run end/now)
    const startTimes = spans.map(s => s.startTs).filter(t => t != null)
    const endTimes = spans.map(s => s.endTs).filter(t => t != null)

    const minStart = Math.min(...startTimes)
    const maxEnd = endTimes.length > 0 ? Math.max(...endTimes) : Date.now()
    const totalDurationMs = maxEnd - minStart

    // Calculate critical path (longest parent-child chain)
    const criticalPathMs = this.calculateCriticalPath(spans)

    // Get slowest spans (top 10 by duration, with valid durations only)
    const spansWithDuration = spans
      .filter(s => s.endTs != null && s.startTs != null)
      .map(s => {
        const durationMs = s.endTs - s.startTs
        // Clamp anomalies: reject negative or > 24 hours
        if (durationMs < 0 || durationMs > 86400000) {
          durationAnomalies++
          return null
        }
        return {
          spanId: s.spanId,
          name: s.name,
          kind: s.kind,
          durationMs,
          status: s.status || 'ok'
        }
      })
      .filter(s => s !== null)
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 10)

    // Get error spans
    const errorSpans = spans
      .filter(s => s.status === 'error')
      .map(s => ({
        spanId: s.spanId,
        name: s.name,
        kind: s.kind,
        durationMs: s.endTs && s.startTs ? s.endTs - s.startTs : null,
        status: 'error'
      }))

    // Compute hotspots by kind
    const hotspotsByKind = this.computeHotspotsByKind(runId, spans)

    // Compute hotspots by kind using self time (with anomaly counting)
    const selfTimeResult = this.computeHotspotsByKindSelfWithAnomalies(runId, spans)
    const hotspotsByKindSelf = selfTimeResult.hotspots
    selfTimeClampedSpans = selfTimeResult.clampedCount

    const result = {
      totalDurationMs: Math.max(0, totalDurationMs),
      criticalPathMs: Math.max(0, criticalPathMs),
      slowestSpans: spansWithDuration,
      errorSpans,
      hotspotsByKind,
      hotspotsByKindSelf
    }

    // Only include anomaly counts if non-zero
    if (durationAnomalies > 0 || selfTimeClampedSpans > 0) {
      result.anomalyCounts = {}
      if (durationAnomalies > 0) {
        result.anomalyCounts.durationAnomalies = durationAnomalies
      }
      if (selfTimeClampedSpans > 0) {
        result.anomalyCounts.selfTimeClampedSpans = selfTimeClampedSpans
      }
    }

    return result
  }

  /**
   * Compute hotspots by kind
   * Returns: Array<{ kind, totalDurationMs, spanCount, errorCount, totalTokens?, costUsd? }>
   */
  computeHotspotsByKind(runId, spans) {
    // Group spans by kind
    const kindMap = new Map()

    for (const span of spans) {
      if (!kindMap.has(span.kind)) {
        kindMap.set(span.kind, {
          kind: span.kind,
          totalDurationMs: 0,
          spanCount: 0,
          errorCount: 0,
          spanIds: []
        })
      }

      const hotspot = kindMap.get(span.kind)
      hotspot.spanCount++
      hotspot.spanIds.push(span.spanId)

      // Add duration (only if span is complete)
      if (span.endTs && span.startTs) {
        const durationMs = span.endTs - span.startTs
        // Clamp anomalies
        if (durationMs >= 0 && durationMs <= 86400000) {
          hotspot.totalDurationMs += durationMs
        }
      }

      // Track errors
      if (span.status === 'error') {
        hotspot.errorCount++
      }
    }

    // Get usage data for the run
    const usageData = this.getRunUsage(runId)

    // Add usage totals by kind (if available)
    const hotspots = Array.from(kindMap.values()).map(hotspot => {
      let totalTokens = null
      let costUsd = null

      // Sum usage for all spans of this kind
      for (const spanId of hotspot.spanIds) {
        const spanUsage = usageData.bySpan[spanId]
        if (spanUsage) {
          if (totalTokens === null) totalTokens = 0
          totalTokens += spanUsage.totalTokens || 0

          if (spanUsage.costUsd !== null && spanUsage.costUsd !== undefined) {
            if (costUsd === null) costUsd = 0
            costUsd += spanUsage.costUsd
          }
        }
      }

      const result = {
        kind: hotspot.kind,
        totalDurationMs: hotspot.totalDurationMs,
        spanCount: hotspot.spanCount,
        errorCount: hotspot.errorCount
      }

      // Only include usage fields if available
      if (totalTokens !== null) {
        result.totalTokens = totalTokens
      }
      if (costUsd !== null) {
        result.costUsd = costUsd
      }

      return result
    })

    // Sort by total duration descending
    hotspots.sort((a, b) => b.totalDurationMs - a.totalDurationMs)

    return hotspots
  }

  /**
   * Compute hotspots by kind using self time (exclusive time per span)
   * Self time = span duration minus sum of direct children durations
   * Returns: Array<{ kind, totalSelfMs, spanCount, errorCount, totalTokens?, costUsd? }>
   */
  computeHotspotsByKindSelf(runId, spans) {
    // Build parent-child relationships
    const childrenMap = new Map()
    const spanMap = new Map()

    for (const span of spans) {
      spanMap.set(span.spanId, span)
      if (!childrenMap.has(span.spanId)) {
        childrenMap.set(span.spanId, [])
      }
      if (span.parentSpanId) {
        if (!childrenMap.has(span.parentSpanId)) {
          childrenMap.set(span.parentSpanId, [])
        }
        childrenMap.get(span.parentSpanId).push(span.spanId)
      }
    }

    // Group spans by kind and compute self time
    const kindMap = new Map()

    for (const span of spans) {
      if (!kindMap.has(span.kind)) {
        kindMap.set(span.kind, {
          kind: span.kind,
          totalSelfMs: 0,
          spanCount: 0,
          errorCount: 0,
          spanIds: []
        })
      }

      const hotspot = kindMap.get(span.kind)
      hotspot.spanCount++
      hotspot.spanIds.push(span.spanId)

      // Calculate self time (only if span is complete)
      if (span.endTs && span.startTs) {
        const durationMs = span.endTs - span.startTs
        // Clamp anomalies
        if (durationMs >= 0 && durationMs <= 86400000) {
          // Calculate sum of direct children durations
          let childrenDurationMs = 0
          const children = childrenMap.get(span.spanId) || []
          for (const childId of children) {
            const childSpan = spanMap.get(childId)
            if (childSpan && childSpan.endTs && childSpan.startTs) {
              const childDuration = childSpan.endTs - childSpan.startTs
              // Clamp child durations too
              if (childDuration >= 0 && childDuration <= 86400000) {
                childrenDurationMs += childDuration
              }
            }
          }

          // Self time = span duration - children duration (clamped to 0)
          const selfMs = Math.max(0, durationMs - childrenDurationMs)
          hotspot.totalSelfMs += selfMs
        }
      }

      // Track errors
      if (span.status === 'error') {
        hotspot.errorCount++
      }
    }

    // Get usage data for the run
    const usageData = this.getRunUsage(runId)

    // Add usage totals by kind (if available)
    const hotspots = Array.from(kindMap.values()).map(hotspot => {
      let totalTokens = null
      let costUsd = null

      // Sum usage for all spans of this kind
      for (const spanId of hotspot.spanIds) {
        const spanUsage = usageData.bySpan[spanId]
        if (spanUsage) {
          if (totalTokens === null) totalTokens = 0
          totalTokens += spanUsage.totalTokens || 0

          if (spanUsage.costUsd !== null && spanUsage.costUsd !== undefined) {
            if (costUsd === null) costUsd = 0
            costUsd += spanUsage.costUsd
          }
        }
      }

      const result = {
        kind: hotspot.kind,
        totalSelfMs: hotspot.totalSelfMs,
        spanCount: hotspot.spanCount,
        errorCount: hotspot.errorCount
      }

      // Only include usage fields if available
      if (totalTokens !== null) {
        result.totalTokens = totalTokens
      }
      if (costUsd !== null) {
        result.costUsd = costUsd
      }

      return result
    })

    // Sort by total self time descending
    hotspots.sort((a, b) => b.totalSelfMs - a.totalSelfMs)

    return hotspots
  }

  /**
   * Compute hotspots by kind using self time, with anomaly counting
   * Returns: { hotspots: Array, clampedCount: number }
   */
  computeHotspotsByKindSelfWithAnomalies(runId, spans) {
    let clampedCount = 0

    // Build parent-child relationships
    const childrenMap = new Map()
    const spanMap = new Map()

    for (const span of spans) {
      spanMap.set(span.spanId, span)
      if (!childrenMap.has(span.spanId)) {
        childrenMap.set(span.spanId, [])
      }
      if (span.parentSpanId) {
        if (!childrenMap.has(span.parentSpanId)) {
          childrenMap.set(span.parentSpanId, [])
        }
        childrenMap.get(span.parentSpanId).push(span.spanId)
      }
    }

    // Group spans by kind and compute self time
    const kindMap = new Map()

    for (const span of spans) {
      if (!kindMap.has(span.kind)) {
        kindMap.set(span.kind, {
          kind: span.kind,
          totalSelfMs: 0,
          spanCount: 0,
          errorCount: 0,
          spanIds: []
        })
      }

      const hotspot = kindMap.get(span.kind)
      hotspot.spanCount++
      hotspot.spanIds.push(span.spanId)

      // Calculate self time (only if span is complete)
      if (span.endTs && span.startTs) {
        const durationMs = span.endTs - span.startTs
        // Clamp anomalies
        if (durationMs >= 0 && durationMs <= 86400000) {
          // Calculate sum of direct children durations
          let childrenDurationMs = 0
          const children = childrenMap.get(span.spanId) || []
          for (const childId of children) {
            const childSpan = spanMap.get(childId)
            if (childSpan && childSpan.endTs && childSpan.startTs) {
              const childDuration = childSpan.endTs - childSpan.startTs
              // Clamp child durations too
              if (childDuration >= 0 && childDuration <= 86400000) {
                childrenDurationMs += childDuration
              }
            }
          }

          // Self time = span duration - children duration (clamped to 0)
          const rawSelfMs = durationMs - childrenDurationMs
          if (rawSelfMs < 0) {
            clampedCount++
          }
          const selfMs = Math.max(0, rawSelfMs)
          hotspot.totalSelfMs += selfMs
        }
      }

      // Track errors
      if (span.status === 'error') {
        hotspot.errorCount++
      }
    }

    // Get usage data for the run
    const usageData = this.getRunUsage(runId)

    // Add usage totals by kind (if available)
    const hotspots = Array.from(kindMap.values()).map(hotspot => {
      let totalTokens = null
      let costUsd = null

      // Sum usage for all spans of this kind
      for (const spanId of hotspot.spanIds) {
        const spanUsage = usageData.bySpan[spanId]
        if (spanUsage) {
          if (totalTokens === null) totalTokens = 0
          totalTokens += spanUsage.totalTokens || 0

          if (spanUsage.costUsd !== null && spanUsage.costUsd !== undefined) {
            if (costUsd === null) costUsd = 0
            costUsd += spanUsage.costUsd
          }
        }
      }

      const result = {
        kind: hotspot.kind,
        totalSelfMs: hotspot.totalSelfMs,
        spanCount: hotspot.spanCount,
        errorCount: hotspot.errorCount
      }

      // Only include usage fields if available
      if (totalTokens !== null) {
        result.totalTokens = totalTokens
      }
      if (costUsd !== null) {
        result.costUsd = costUsd
      }

      return result
    })

    // Sort by total self time descending
    hotspots.sort((a, b) => b.totalSelfMs - a.totalSelfMs)

    return { hotspots, clampedCount }
  }

  /**
   * Calculate critical path (longest chain by duration)
   * Uses dynamic programming to find max path
   */
  calculateCriticalPath(spans) {
    if (spans.length === 0) return 0

    // Build span map and children map
    const spanMap = new Map()
    const childrenMap = new Map()

    for (const span of spans) {
      spanMap.set(span.spanId, span)
      if (!childrenMap.has(span.spanId)) {
        childrenMap.set(span.spanId, [])
      }
    }

    // Build parent-child relationships
    for (const span of spans) {
      if (span.parentSpanId) {
        if (!childrenMap.has(span.parentSpanId)) {
          childrenMap.set(span.parentSpanId, [])
        }
        childrenMap.get(span.parentSpanId).push(span.spanId)
      }
    }

    // Calculate duration for each span (clamp anomalies)
    const getDuration = (span) => {
      if (!span.endTs || !span.startTs) return 0
      const duration = span.endTs - span.startTs
      // Clamp: reject negative or > 24 hours
      if (duration < 0 || duration > 86400000) return 0
      return duration
    }

    // Recursive function to find longest path from a node
    const memo = new Map()
    const findLongestPath = (spanId) => {
      if (memo.has(spanId)) {
        return memo.get(spanId)
      }

      const span = spanMap.get(spanId)
      if (!span) return 0

      const selfDuration = getDuration(span)
      const children = childrenMap.get(spanId) || []

      if (children.length === 0) {
        memo.set(spanId, selfDuration)
        return selfDuration
      }

      // Find max path through children
      let maxChildPath = 0
      for (const childId of children) {
        const childPath = findLongestPath(childId)
        maxChildPath = Math.max(maxChildPath, childPath)
      }

      const totalPath = selfDuration + maxChildPath
      memo.set(spanId, totalPath)
      return totalPath
    }

    // Find all root spans (no parent or parent doesn't exist)
    const rootSpanIds = spans
      .filter(s => !s.parentSpanId || !spanMap.has(s.parentSpanId))
      .map(s => s.spanId)

    // Find longest path from any root
    let maxPath = 0
    for (const rootId of rootSpanIds) {
      const pathLength = findLongestPath(rootId)
      maxPath = Math.max(maxPath, pathLength)
    }

    return maxPath
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
