/**
 * Test script to verify self-time hotspot computation
 */

// Mock spans with parent-child relationships
const testSpans = [
  {
    spanId: 'span-1',
    name: 'Root Agent',
    kind: 'agent',
    startTs: 1000,
    endTs: 5000, // 4000ms total
    parentSpanId: null,
    status: 'ok'
  },
  {
    spanId: 'span-2',
    name: 'Tool Call 1',
    kind: 'tool',
    startTs: 1500,
    endTs: 2500, // 1000ms total
    parentSpanId: 'span-1',
    status: 'ok'
  },
  {
    spanId: 'span-3',
    name: 'Tool Call 2',
    kind: 'tool',
    startTs: 3000,
    endTs: 4000, // 1000ms total
    parentSpanId: 'span-1',
    status: 'ok'
  },
  {
    spanId: 'span-4',
    name: 'LLM Call',
    kind: 'llm',
    startTs: 2000,
    endTs: 3500, // 1500ms total
    parentSpanId: 'span-2',
    status: 'ok'
  }
]

// Import the Database class
const { Database } = require('./server/db.js')
const fs = require('fs')
const path = require('path')

// Use a test database file
const testDbPath = path.join(__dirname, 'server', 'data', 'test-self-time.sqlite')

// Remove existing test database if it exists
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath)
}

// Create a test database
const db = new Database()
db.dbPath = testDbPath
db.initDb()

// Create a test run
try {
  db.createRun({ id: 'test-run-1', title: 'Test Run', startedAt: Date.now() })
} catch (err) {
  console.log('Run already exists or error creating:', err.message)
}

// Insert test spans using upsertSpan
for (const span of testSpans) {
  try {
    db.upsertSpan({
      spanId: span.spanId,
      runId: 'test-run-1',
      name: span.name,
      kind: span.kind,
      parentSpanId: span.parentSpanId,
      startTs: span.startTs,
      endTs: span.endTs,
      status: span.status
    })
  } catch (err) {
    console.error(`Error inserting span ${span.spanId}:`, err.message)
  }
}

// Verify spans were inserted
const spans = db.listSpans({ runId: 'test-run-1' })
console.log(`\nInserted ${spans.length} spans`)
if (spans.length === 0) {
  console.error('ERROR: No spans were inserted!')
  process.exit(1)
}

// Get trace summary with self-time hotspots
const summary = db.getTraceSummary('test-run-1')

console.log('\n=== Trace Summary Test ===\n')
console.log('Test Spans:')
console.log('  - span-1 (agent): 4000ms total, children: 2000ms, expected self: 2000ms')
console.log('  - span-2 (tool): 1000ms total, children: 1500ms, expected self: 0ms (clamped)')
console.log('  - span-3 (tool): 1000ms total, children: 0ms, expected self: 1000ms')
console.log('  - span-4 (llm): 1500ms total, children: 0ms, expected self: 1500ms')
console.log('')

console.log('Hotspots by Kind (Total Time):')
for (const hotspot of summary.hotspotsByKind) {
  console.log(`  - ${hotspot.kind}: ${hotspot.totalDurationMs}ms (${hotspot.spanCount} spans)`)
}
console.log('')

console.log('Hotspots by Kind (Self Time):')
if (summary.hotspotsByKindSelf) {
  for (const hotspot of summary.hotspotsByKindSelf) {
    console.log(`  - ${hotspot.kind}: ${hotspot.totalSelfMs}ms (${hotspot.spanCount} spans)`)
  }
} else {
  console.log('  ERROR: hotspotsByKindSelf not found!')
}
console.log('')

// Verify results
let passed = true

// Check total time hotspots
const toolTotal = summary.hotspotsByKind.find(h => h.kind === 'tool')
const agentTotal = summary.hotspotsByKind.find(h => h.kind === 'agent')
const llmTotal = summary.hotspotsByKind.find(h => h.kind === 'llm')

if (!toolTotal || toolTotal.totalDurationMs !== 2000) {
  console.log(`❌ FAIL: tool total time expected 2000ms, got ${toolTotal?.totalDurationMs}ms`)
  passed = false
}
if (!agentTotal || agentTotal.totalDurationMs !== 4000) {
  console.log(`❌ FAIL: agent total time expected 4000ms, got ${agentTotal?.totalDurationMs}ms`)
  passed = false
}
if (!llmTotal || llmTotal.totalDurationMs !== 1500) {
  console.log(`❌ FAIL: llm total time expected 1500ms, got ${llmTotal?.totalDurationMs}ms`)
  passed = false
}

// Check self time hotspots
if (summary.hotspotsByKindSelf) {
  const toolSelf = summary.hotspotsByKindSelf.find(h => h.kind === 'tool')
  const agentSelf = summary.hotspotsByKindSelf.find(h => h.kind === 'agent')
  const llmSelf = summary.hotspotsByKindSelf.find(h => h.kind === 'llm')

  if (!toolSelf || toolSelf.totalSelfMs !== 1000) {
    console.log(`❌ FAIL: tool self time expected 1000ms, got ${toolSelf?.totalSelfMs}ms`)
    passed = false
  }
  if (!agentSelf || agentSelf.totalSelfMs !== 2000) {
    console.log(`❌ FAIL: agent self time expected 2000ms, got ${agentSelf?.totalSelfMs}ms`)
    passed = false
  }
  if (!llmSelf || llmSelf.totalSelfMs !== 1500) {
    console.log(`❌ FAIL: llm self time expected 1500ms, got ${llmSelf?.totalSelfMs}ms`)
    passed = false
  }
} else {
  console.log('❌ FAIL: hotspotsByKindSelf not found')
  passed = false
}

if (passed) {
  console.log('✅ All tests passed!')
  process.exit(0)
} else {
  console.log('\n❌ Some tests failed')
  process.exit(1)
}
