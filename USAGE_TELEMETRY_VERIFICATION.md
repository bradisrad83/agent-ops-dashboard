# Usage Telemetry Verification Guide

This document describes the hardening changes made to the usage telemetry system and provides verification steps to ensure correctness.

## Overview

The usage telemetry system has been hardened to prevent double counting and improve reliability. Key changes include:

1. **Optional metadata fields** - Added `source` and `confidence` to track telemetry quality
2. **Server-side deduplication** - Prevents double counting when multiple reports exist for the same span
3. **Collector improvements** - Enhanced extraction logic with confidence tracking
4. **Dashboard enhancements** - Better formatting and tooltips showing usage metadata

## Architecture

### Data Flow

```
Collector → usage.report event → Server → Database → Aggregation → Dashboard
            (with source/conf)           (with dedupe)
```

### Payload Structure

```typescript
interface UsageReportPayload {
  spanId?: string;
  runId?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  ts?: number;
  attrs?: Record<string, any>;
  source?: "metadata" | "json" | "regex" | "manual";  // NEW
  confidence?: number;  // NEW: 0..1
}
```

## Database Schema

### usage_reports Table

The `usage_reports` table includes the following columns:

- `id` (INTEGER PRIMARY KEY AUTOINCREMENT) - Unique report ID
- `run_id` (TEXT NOT NULL) - Run identifier
- `span_id` (TEXT NULL) - Span identifier (nullable)
- `ts` (INTEGER NOT NULL) - Timestamp
- `model` (TEXT NULL) - Model name
- `input_tokens` (INTEGER NULL) - Input token count
- `output_tokens` (INTEGER NULL) - Output token count
- `total_tokens` (INTEGER NULL) - Total token count
- `cost_usd` (REAL NULL) - Cost in USD
- `attrs` (TEXT NULL) - JSON attributes
- `source` (TEXT NULL) - **NEW**: Source of the data
- `confidence` (REAL NULL) - **NEW**: Confidence level (0..1)

### Migrations

The system automatically adds `source` and `confidence` columns to existing tables via additive migrations.

## Deduplication Logic

### Problem

Multiple `usage.report` events may be emitted for the same span, leading to double counting in totals. Additionally, run-level reports (with `span_id = NULL`) may conflict with per-span aggregation.

### Solution (Option B: Run-Level Override)

The `db.getRunUsage()` method implements the following strategy:

1. **Fetch all reports** for the run, sorted by `span_id, ts DESC, id DESC`
2. **Deduplicate per-span reports**:
   - For each unique `span_id` (NOT NULL), keep only the latest report
3. **Keep latest run-level report**:
   - Find the single latest report where `span_id IS NULL` (if any)
4. **Compute totals**:
   - **If run-level report exists**: Use it for totals (override), ignore per-span sums
   - **Otherwise**: Sum from deduplicated per-span reports
5. **Build `bySpan`**: Always derived from per-span reports (never includes run-level)
6. **Compute missing `total_tokens`**: When NULL but `input_tokens + output_tokens` exist

### Key Guarantees

- **Per-span deduplication**: Only the most recent report per span is counted
- **Run-level override**: If present, run-level report provides totals
- **Cost integrity**:
  - **Unknown cost is NULL** (never 0 unless explicitly reported as 0)
  - Never fabricates cost
  - API returns `costUsd: null` when unknown
  - Dashboard shows "Cost: unknown" in tooltips
  - No cost display in UI when NULL

### Cost Handling Rules

**CRITICAL**: Unknown cost MUST be represented as NULL/undefined, never as 0.

- **Database**: Stores `cost_usd` as NULL when unknown
- **API Response**: Returns `costUsd: null` when unknown
- **Dashboard**:
  - Does NOT render cost stat/segment when `costUsd === null`
  - Tooltip shows `"Cost: unknown"` when NULL
  - `data-usage-cost` attribute is empty string when NULL (not "0")

## Collector Best Practices

### Confidence Levels

The collector assigns confidence levels based on extraction method:

- **0.9**: Structured metadata/JSON from API response (preferred)
- **0.4**: Regex extraction from plaintext with explicit labels
- **Not emitted**: If confidence < 0.4 or data is unreliable

### Extraction Rules

1. **Prefer structured data** - Use API metadata if available
2. **Gate regex tightly** - Require explicit "Input tokens:" / "Output tokens:" labels
3. **Never infer cost** - Only capture cost if explicitly labeled with "$"
4. **Sanity checks** - Validate token counts are reasonable (0 < tokens < 1,000,000)

### Example: Claude Pair Workflow

```javascript
// Only emit if we find explicit token labels
const usagePattern = /(?:input[_\s]?tokens?|Input\s+tokens?)[:\s]+(\d+)[\s\S]*?(?:output[_\s]?tokens?|Output\s+tokens?)[:\s]+(\d+)/i;
const usageMatch = responseText.match(usagePattern);

if (usageMatch) {
  const inputTokens = parseInt(usageMatch[1], 10);
  const outputTokens = parseInt(usageMatch[2], 10);

  // Sanity check
  if (inputTokens > 0 && inputTokens < 1000000 && outputTokens > 0 && outputTokens < 1000000) {
    await postSpanEvent(runId, 'usage.report', {
      spanId,
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      source: 'regex',
      confidence: 0.4
    }, options);
  }
}
```

## Dashboard Features

### Formatting Helpers

- `formatDurationMs(ms)` - Format milliseconds to human-readable duration
- `formatTokens(tokens)` - Format token count with locale (e.g., "1,234")
- `formatUsd(usd)` - Format USD cost (e.g., "$0.0042")

### Timeline Enhancements

Each span row in the Timeline view now includes:

1. **Duration display** - Shows duration + tokens + cost (if present)
2. **Tooltip** - Hover to see detailed metadata:
   - Model name
   - Input/output/total tokens
   - Cost
   - Source (metadata/json/regex/manual)
   - Confidence percentage
3. **Data attributes** - For testing/automation:
   - `data-usage-source` - Source type or "absent"
   - `data-usage-confidence` - Confidence value or "absent"

### Example Tooltip

```
Model: claude-sonnet-4-5
Input: 1,234
Output: 567
Total: 1,801 tokens
Cost: $0.0042
Source: regex
Confidence: 40%
```

## Verification Checklist

### 1. Multiple Reports Per Span (No Double Counting)

**Test**: Send multiple `usage.report` events for the same span with different timestamps.

**Expected**: GET `/api/runs/:runId/usage` returns only the latest report's values in totals and bySpan.

```bash
# Send first report
curl -X POST http://localhost:3131/api/runs/test-run/events \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt-1",
    "ts": "2026-01-21T10:00:00Z",
    "runId": "test-run",
    "type": "usage.report",
    "payload": {
      "spanId": "span-1",
      "inputTokens": 100,
      "outputTokens": 50,
      "totalTokens": 150,
      "source": "regex",
      "confidence": 0.4
    }
  }'

# Send second report (newer, should override)
curl -X POST http://localhost:3131/api/runs/test-run/events \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt-2",
    "ts": "2026-01-21T10:01:00Z",
    "runId": "test-run",
    "type": "usage.report",
    "payload": {
      "spanId": "span-1",
      "inputTokens": 200,
      "outputTokens": 100,
      "totalTokens": 300,
      "source": "metadata",
      "confidence": 0.9
    }
  }'

# Verify aggregation
curl http://localhost:3131/api/runs/test-run/usage

# Expected output:
# {
#   "totals": {
#     "inputTokens": 200,
#     "outputTokens": 100,
#     "totalTokens": 300,
#     "costUsd": 0
#   },
#   "bySpan": {
#     "span-1": {
#       "inputTokens": 200,
#       "outputTokens": 100,
#       "totalTokens": 300,
#       "costUsd": 0,
#       "source": "metadata",
#       "confidence": 0.9
#     }
#   }
# }
```

### 2. Total Tokens Computation

**Test**: Send report with input/output but NULL total_tokens.

**Expected**: Aggregation computes total_tokens = input + output.

```bash
curl -X POST http://localhost:3131/api/runs/test-run/events \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt-3",
    "ts": "2026-01-21T10:00:00Z",
    "runId": "test-run",
    "type": "usage.report",
    "payload": {
      "spanId": "span-2",
      "inputTokens": 500,
      "outputTokens": 300
    }
  }'

# Expected: bySpan["span-2"].totalTokens === 800
```

### 3. Cost Integrity (NULL for Unknown)

**Test**: Send report without cost.

**Expected**: Aggregation keeps costUsd as NULL (not 0), never fabricates a value.

```bash
curl -X POST http://localhost:3131/api/runs/test-run/events \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt-4",
    "ts": "2026-01-21T10:00:00Z",
    "runId": "test-run",
    "type": "usage.report",
    "payload": {
      "spanId": "span-3",
      "inputTokens": 1000,
      "outputTokens": 500
    }
  }'

# Expected: bySpan["span-3"].costUsd === null (not 0, not computed/inferred)
```

### 4. Run-Level Override (Option B)

**Test**: Send both per-span and run-level reports.

**Expected**: Run-level report overrides totals; bySpan still contains per-span data.

```bash
# Send per-span report
curl -X POST http://localhost:3131/api/runs/test-run/events \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt-5",
    "ts": "2026-01-21T10:00:00Z",
    "runId": "test-run",
    "type": "usage.report",
    "payload": {
      "spanId": "span-4",
      "inputTokens": 100,
      "outputTokens": 50,
      "source": "metadata",
      "confidence": 0.9
    }
  }'

# Send run-level report (no spanId)
curl -X POST http://localhost:3131/api/runs/test-run/events \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt-6",
    "ts": "2026-01-21T10:01:00Z",
    "runId": "test-run",
    "type": "usage.report",
    "payload": {
      "inputTokens": 500,
      "outputTokens": 300,
      "totalTokens": 800,
      "costUsd": 0.015,
      "source": "manual",
      "confidence": 1.0
    }
  }'

# Verify aggregation
curl http://localhost:3131/api/runs/test-run/usage

# Expected output:
# {
#   "totals": {
#     "inputTokens": 500,      // From run-level (override)
#     "outputTokens": 300,     // From run-level (override)
#     "totalTokens": 800,      // From run-level (override)
#     "costUsd": 0.015,        // From run-level (override)
#     "model": undefined,
#     "source": "manual",
#     "confidence": 1.0
#   },
#   "bySpan": {
#     "span-4": {              // Per-span still available
#       "inputTokens": 100,
#       "outputTokens": 50,
#       "totalTokens": 150,
#       "costUsd": null,
#       "source": "metadata",
#       "confidence": 0.9
#     }
#   }
# }
```

### 5. Dashboard Tooltip (Unknown Cost)

**Test**: Open the dashboard Timeline view and hover over a span with usage data but no cost.

**Expected**: Tooltip shows `"Cost: unknown"` when cost is NULL.

**Test**: Open the dashboard Timeline view and hover over a span with usage data including cost.

**Expected**: Tooltip shows model, tokens, cost (e.g., "$0.0042"), source, confidence.

### 6. Dashboard Cost Display

**Test**: View dashboard with usage data where cost is NULL.

**Expected**:
- No cost stat shown in run stats strip
- No cost segment in timeline duration display
- `data-usage-cost=""` (empty string) on span rows

**Test**: View dashboard with usage data where cost is explicitly 0.

**Expected**:
- Cost stat shows "$0.0000" in run stats strip
- Cost segment shows "$0.0000" in timeline
- `data-usage-cost="0"` on span rows

### 7. Collector Confidence Threshold

**Test**: Modify collector to emit usage with confidence < 0.4.

**Expected**: Collector does not emit the `usage.report` event.

### 8. Source Field Tracking

**Test**: Send reports from different sources (metadata, json, regex, manual).

**Expected**: Each report's `source` field is persisted and returned in `/usage` endpoint.

## Troubleshooting

### Totals Don't Match Per-Span Sum

**Cause**: A run-level report (span_id NULL) exists and is overriding totals (Option B).

**Solution**: This is expected behavior. When a run-level report exists, it provides the totals. The bySpan breakdown still shows per-span data.

### Cost Shows 0 Instead of NULL

**Cause**: Old code was defaulting unknown cost to 0.

**Solution**: This has been fixed. Unknown cost is now NULL. Existing reports with 0 cost may need manual correction if they should be NULL.

### Cost Shows Unexpected Value

**Cause**: Multiple reports with different costs; only latest is kept per span.

**Solution**: Verify timestamp ordering. The latest report (by ts, then id) wins per span. If a run-level report exists, it overrides all totals.

### Missing Source/Confidence in Old Data

**Cause**: Existing reports were created before the hardening changes.

**Solution**: These fields are optional (NULL). New reports will populate them.

### Dashboard Shows "No usage data" Tooltip

**Cause**: No usage report exists for that span, or usage has all zero values.

**Solution**: Verify the collector is emitting `usage.report` events with valid data.

## Backward Compatibility

- All changes are **additive only**
- Existing event streams continue to work
- Routes remain unchanged
- Older reports without `source`/`confidence` fields are handled gracefully (NULL)

## Performance Considerations

The deduplication logic fetches all reports for a run and processes them in memory. For runs with thousands of usage reports, this may have a slight performance impact. Consider the following optimizations if needed:

1. Use a SQL query with `ROW_NUMBER()` window function (requires newer SQLite)
2. Implement server-side caching for aggregated usage data
3. Archive old usage reports after a retention period

## Summary

The hardened usage telemetry system provides:

- ✅ No double counting per span
- ✅ Source and confidence tracking
- ✅ Accurate totals matching per-span sums
- ✅ Cost integrity (never fabricated)
- ✅ Enhanced dashboard with tooltips
- ✅ Backward compatible with existing data
- ✅ No new dependencies

All changes maintain the existing event stream architecture and API contracts.
