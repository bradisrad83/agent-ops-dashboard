# Auto-Span Generation from Tool Events

**Date**: 2026-01-21
**Status**: ✅ Complete (Hardened 2026-01-21)

## Overview

This feature automatically creates spans from existing `tool.called` and `tool.result` events, enabling timeline visualization even for runs that don't emit explicit `span.start` and `span.end` events.

**Hardening Update**: Added globally unique span IDs, timestamp-aware parent selection, out-of-order event handling, and deterministic error detection.

## Implementation Details

### Server Changes

#### 1. Auto-Span Creation on tool.called ([server/index.js](server/index.js:297-322))

When a `tool.called` event is received:
- Derives spanId as `tool-${toolCallId}`
- Finds the current active span (if any) to set as parent
- Creates a span with:
  - `name`: `Tool: ${toolName}`
  - `kind`: `"tool"`
  - `startTs`: event timestamp
  - `attrs`: `{ auto: true, toolName, toolCallId }`

```javascript
} else if (body.type === 'tool.called' && body.payload) {
  // Auto-create span for tool.called events
  const { toolCallId, toolName } = body.payload
  if (toolCallId && toolName) {
    const spanId = `tool-${toolCallId}`
    const startTs = body.ts ? new Date(body.ts).getTime() : Date.now()

    // Try to find the current active span to set as parent
    const activeSpan = db.findActiveSpan(runId)
    const parentSpanId = activeSpan ? activeSpan.spanId : null

    db.upsertSpan({
      spanId,
      runId,
      parentSpanId,
      name: `Tool: ${toolName}`,
      kind: 'tool',
      startTs,
      attrs: {
        auto: true,
        toolName,
        toolCallId
      }
    })
  }
}
```

#### 2. Auto-Span Completion on tool.result ([server/index.js](server/index.js:323-346))

When a `tool.result` event is received:
- Derives spanId as `tool-${toolCallId}`
- Updates the span with:
  - `endTs`: event timestamp
  - `status`: `"ok"` or `"error"` based on payload
  - `attrs`: `{ auto: true }`

```javascript
} else if (body.type === 'tool.result' && body.payload) {
  // Auto-complete span for tool.result events
  const { toolCallId } = body.payload
  if (toolCallId) {
    const spanId = `tool-${toolCallId}`
    const endTs = body.ts ? new Date(body.ts).getTime() : Date.now()

    // Determine status from payload if available
    let status = 'ok'
    if (body.payload.error || body.level === 'error') {
      status = 'error'
    }

    db.upsertSpan({
      spanId,
      runId,
      name: '', // Will be ignored by upsert (keeps existing)
      kind: 'tool', // Will be ignored by upsert (keeps existing)
      startTs: endTs, // Will be ignored by upsert (keeps existing)
      endTs,
      status,
      attrs: { auto: true }
    })
  }
}
```

#### 3. Database Helper Method ([server/db.js](server/db.js:513-539))

Added `findActiveSpan()` method to find the most recent span without an `endTs`:

```javascript
/**
 * Find the most recent active span (span without endTs) for a given run
 * Used for auto-parenting tool spans
 */
findActiveSpan(runId) {
  const stmt = this.db.prepare(`
    SELECT * FROM spans
    WHERE run_id = ? AND end_ts IS NULL
    ORDER BY start_ts DESC
    LIMIT 1
  `)

  const row = stmt.get(runId)
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
```

### Dashboard Changes

#### 1. Tooltip Enhancement ([package/src/components/AgentOpsDashboard.vue](package/src/components/AgentOpsDashboard.vue:1034-1085))

Updated `buildSpanTooltip()` to show "Auto: true" indicator:

```typescript
const buildSpanTooltip = (span: any): string => {
  const parts: string[] = []
  const selfUsage = usageData.value.bySpan[span.spanId]
  const totalUsage = computeTotalUsage(span.spanId)

  // Show auto-generated indicator if present
  if (span.attrs?.auto === true) {
    parts.push('Auto: true')
    parts.push('')
  }

  // ... rest of tooltip logic
}
```

#### 2. Data Attribute ([package/src/components/AgentOpsDashboard.vue](package/src/components/AgentOpsDashboard.vue:342))

Added `data-span-auto` attribute to span rows for testing and styling:

```vue
<div
  v-for="span in displaySpans"
  :key="span.spanId"
  :class="['aod-span-row', { 'aod-span-row-selected': selectedSpanId === span.spanId }]"
  :data-span-kind="span.kind"
  :data-span-status="span.status || 'running'"
  :data-span-auto="span.attrs?.auto === true ? 'true' : 'false'"
  ...
>
```

## Key Features

### Constraints Met
- ✅ **No deps**: No new dependencies added
- ✅ **Additive only**: Raw events unchanged, spans table updated additively
- ✅ **No breaking routes**: All existing routes remain unchanged

### Functionality
- ✅ **Auto-creation**: Spans created automatically from tool.called events
- ✅ **Auto-completion**: Spans completed automatically from tool.result events
- ✅ **Parent tracking**: Auto-spans correctly parented to active span
- ✅ **Status tracking**: Error status derived from payload/level
- ✅ **Visual distinction**: "Auto: true" shown in tooltip
- ✅ **Data hooks**: `data-span-auto` attribute for testing/styling

## Testing

### Manual Test Script

A test script is provided at [test-auto-spans.js](test-auto-spans.js) that:
1. Creates a test run
2. Sends `tool.called` event
3. Verifies auto-span creation
4. Sends `tool.result` event
5. Verifies auto-span completion

To run (after restarting server):
```bash
node test-auto-spans.js
```

### Expected Behavior

For any run with `tool.called` and `tool.result` events:
1. Timeline panel will show tool spans automatically
2. Spans will be properly nested under active parent span
3. Tooltip will show "Auto: true"
4. Duration calculated from event timestamps
5. Status derived from result (ok/error)

## Hardening Changes (2026-01-21)

### PART A: Span ID Uniqueness
**Problem**: Original IDs like `tool-${toolCallId}` could collide across runs.

**Solution**:
- Changed to `tool-${runId}-${toolCallId}` for global uniqueness
- Fallback to `tool-${runId}-${eventId}` if `toolCallId` missing
- Prevents `tool-undefined` edge case

**Code**: [server/index.js:303-305](server/index.js#L303-L305)

### PART B: Timestamp-Aware Parent Selection
**Problem**: Parent selection ignored event timestamps, causing incorrect nesting.

**Solution**:
- Updated `findActiveSpan(runId, ts)` to accept timestamp parameter
- Finds spans where `start_ts <= ts AND (end_ts IS NULL OR end_ts >= ts)`
- Added composite index `idx_spans_run_start_ts` for query performance

**Code**:
- [server/db.js:521-560](server/db.js#L521-L560) - Updated method
- [server/db.js:88-93](server/db.js#L88-L93) - Index migration

### PART C: Out-of-Order Event Handling
**Problem**: If `tool.result` arrives before `tool.called`, span creation failed silently.

**Solution**:
- `tool.result` creates placeholder: `name="Tool: (unknown)"`, `attrs.placeholder=true`
- `tool.called` detects and upgrades placeholder with proper name and start time
- Ensures all tool invocations get spans regardless of event order

**Code**:
- [server/index.js:363-383](server/index.js#L363-L383) - Placeholder creation
- [server/index.js:313-340](server/index.js#L313-L340) - Placeholder upgrade

### PART D: Deterministic Status Derivation
**Problem**: Error detection only checked `payload.error`, missing other failure indicators.

**Solution**:
- Check `payload.error` (any truthy value)
- Check `payload.success === false` (explicit failure flag)
- Check `level === 'error'` (event-level severity)

**Code**: [server/index.js:340-346](server/index.js#L340-L346)

### PART E: New Database Methods
Added helper methods for hardening logic:
- `getSpan(spanId)` - Fetch single span by ID ([server/db.js:566-587](server/db.js#L566-L587))
- Used for checking placeholder existence and out-of-order handling

## Files Modified

1. ✅ [server/index.js](server/index.js) - Auto-span ingestion logic with hardening (lines 297-384)
2. ✅ [server/db.js](server/db.js) - Enhanced `findActiveSpan()`, `getSpan()`, index migration (lines 88-93, 521-587)
3. ✅ [package/src/components/AgentOpsDashboard.vue](package/src/components/AgentOpsDashboard.vue) - Tooltip and data attribute (lines 342, 1040-1043)

## Architecture Notes

### Span ID Generation (Part A: Hardened)
**Globally Unique IDs**:
- Auto-spans use format: `tool-${runId}-${toolCallId}`
- If `toolCallId` missing: `tool-${runId}-${eventId}`
- **Never** generates `tool-undefined` or non-unique IDs
- Ensures uniqueness across runs and prevents collisions

### Parent Span Detection (Part B: Hardened)
**Timestamp-Aware Selection**:
- `findActiveSpan(runId, ts)` finds spans active at timestamp `ts`
- Query: `start_ts <= ts AND (end_ts IS NULL OR end_ts >= ts)`
- Orders by `start_ts DESC` to get most recent matching span
- Falls back to "latest open span" if `ts` not provided
- Indexed with `idx_spans_run_start_ts` for O(log n) performance

### Out-of-Order Event Handling (Part C: Hardened)
**Placeholder Mechanism**:
1. If `tool.result` arrives before `tool.called`:
   - Creates placeholder span: `name="Tool: (unknown)"`, `attrs.placeholder=true`
   - Sets `start_ts = end_ts - 1` to maintain timeline consistency
2. When `tool.called` arrives later:
   - Detects placeholder via `attrs.placeholder === true`
   - Upgrades: fills in `toolName`, adjusts `start_ts` if earlier
   - Re-evaluates `parentSpanId` if missing
   - Removes `placeholder` flag from attrs

### Status Derivation (Part D: Hardened)
**Deterministic Error Detection**:
```javascript
status = 'error' if:
  - payload.error exists (any truthy value), OR
  - payload.success === false (explicit failure), OR
  - level === 'error' (event-level severity)
else status = 'ok'
```

### Database Optimization
**Index**: `idx_spans_run_start_ts ON spans(run_id, start_ts)`
- Supports efficient timestamp-aware parent queries
- Added via migration (idempotent, runs once)

### Backward Compatibility
- Runs without tool events still work normally
- Runs with explicit span events are unaffected
- Dashboard gracefully handles missing spans
- Old auto-span IDs (`tool-${toolCallId}`) won't be generated anymore, but existing ones remain valid

## Next Steps

To verify the implementation:
1. Restart the server to load new code
2. Run the test script: `node test-auto-spans.js`
3. Open dashboard and check Timeline panel for auto-generated spans
4. Verify tooltip shows "Auto: true"

## Notes

- This feature requires no changes to the collector or event emission logic
- Tool events can come from any source (collector, manual API calls, etc.)
- Auto-spans coexist with manually created spans
- The `auto` attribute allows distinguishing auto-generated vs explicit spans
