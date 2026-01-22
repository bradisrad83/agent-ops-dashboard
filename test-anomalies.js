/**
 * Test script to verify anomaly detection in trace summary
 */

const { Database } = require('./server/db.js')
const fs = require('fs')
const path = require('path')

// Use a test database file
const testDbPath = path.join(__dirname, 'server', 'data', 'test-anomalies.sqlite')

// Remove existing test database if it exists
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath)
}

// Create a test database
const db = new Database()
db.dbPath = testDbPath
db.initDb()

// Create a test run
db.createRun({ id: 'test-run-1', title: 'Anomaly Test Run', startedAt: Date.now() })

// Test spans with anomalies
const testSpans = [
  {
    spanId: 'span-1',
    name: 'Normal Span',
    kind: 'agent',
    startTs: 1000,
    endTs: 2000, // 1000ms - normal
    parentSpanId: null,
    status: 'ok'
  },
  {
    spanId: 'span-2',
    name: 'Negative Duration Span',
    kind: 'tool',
    startTs: 3000,
    endTs: 2500, // ANOMALY: endTs < startTs (negative duration)
    parentSpanId: null,
    status: 'ok'
  },
  {
    spanId: 'span-3',
    name: 'Huge Duration Span',
    kind: 'llm',
    startTs: 1000,
    endTs: 1000 + 90000000, // ANOMALY: 90000000ms > 24 hours
    parentSpanId: null,
    status: 'ok'
  },
  {
    spanId: 'span-4',
    name: 'Parent Span',
    kind: 'agent',
    startTs: 5000,
    endTs: 7000, // 2000ms total
    parentSpanId: null,
    status: 'ok'
  },
  {
    spanId: 'span-5',
    name: 'Child Exceeds Parent',
    kind: 'tool',
    startTs: 5000,
    endTs: 8000, // ANOMALY: 3000ms > parent's 2000ms (self-time will be clamped)
    parentSpanId: 'span-4',
    status: 'ok'
  }
]

// Insert test spans
for (const span of testSpans) {
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
}

// Get trace summary
const summary = db.getTraceSummary('test-run-1')

console.log('\n=== Anomaly Detection Test ===\n')
console.log('Test Spans:')
console.log('  - span-1: Normal (1000ms)')
console.log('  - span-2: Negative duration (should be excluded)')
console.log('  - span-3: > 24 hours (should be excluded)')
console.log('  - span-4: Parent (2000ms)')
console.log('  - span-5: Child > parent (3000ms, self-time clamped)')
console.log('')

console.log('Anomaly Counts:')
if (summary.anomalyCounts) {
  console.log(`  - Duration anomalies: ${summary.anomalyCounts.durationAnomalies || 0}`)
  console.log(`  - Self-time clamped: ${summary.anomalyCounts.selfTimeClampedSpans || 0}`)
} else {
  console.log('  - None detected')
}
console.log('')

// Verify results
let passed = true

// Should have 2 duration anomalies (span-2 negative, span-3 too long)
if (!summary.anomalyCounts || summary.anomalyCounts.durationAnomalies !== 2) {
  console.log(`❌ FAIL: Expected 2 duration anomalies, got ${summary.anomalyCounts?.durationAnomalies || 0}`)
  passed = false
} else {
  console.log(`✅ PASS: Detected 2 duration anomalies`)
}

// Should have 1 self-time clamped span (span-5 child exceeds parent)
if (!summary.anomalyCounts || summary.anomalyCounts.selfTimeClampedSpans !== 1) {
  console.log(`❌ FAIL: Expected 1 self-time clamped span, got ${summary.anomalyCounts?.selfTimeClampedSpans || 0}`)
  passed = false
} else {
  console.log(`✅ PASS: Detected 1 self-time clamped span`)
}

// Hotspots should only include valid spans
console.log('\nHotspots (should exclude anomalous spans):')
for (const hotspot of summary.hotspotsByKind) {
  console.log(`  - ${hotspot.kind}: ${hotspot.totalDurationMs}ms (${hotspot.spanCount} spans)`)
}

if (passed) {
  console.log('\n✅ All anomaly detection tests passed!')
  process.exit(0)
} else {
  console.log('\n❌ Some tests failed')
  process.exit(1)
}
