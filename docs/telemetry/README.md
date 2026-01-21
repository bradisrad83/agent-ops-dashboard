# Telemetry & Tracing Documentation

This directory contains documentation for the AgentOps telemetry and tracing system.

## Overview

The AgentOps Dashboard provides comprehensive telemetry for agent operations, including:
- **Span-based tracing**: Hierarchical tracking of operations (LLM calls, tool use, agents)
- **Usage tracking**: Token counts and cost estimation per span
- **Auto-instrumentation**: Automatic span creation from events
- **Trace analysis**: Critical path, hotspots, and performance metrics

## Documentation Index

### Implementation Guides

- **[Span Model Implementation](../../SPAN_MODEL_IMPLEMENTATION.md)**
  - Core span data model and lifecycle
  - Parent-child relationships and hierarchies
  - Span kinds: `agent`, `llm`, `tool`, `task`, `generic`
  - Status tracking and error handling

- **[Usage Telemetry Verification](../../USAGE_TELEMETRY_VERIFICATION.md)**
  - Token counting and cost calculation
  - Usage aggregation (by span, by kind, by run)
  - Cost estimation for different model types
  - Usage API endpoints and data formats

- **[Auto-Span Implementation](../../AUTO_SPAN_IMPLEMENTATION.md)**
  - Automatic span creation from events
  - Event-to-span mapping rules
  - Lifecycle management (start/end inference)
  - Edge case handling

### API Endpoints

#### Span Endpoints

**GET `/api/runs/:runId/spans`**
- List all spans for a run
- Query params:
  - `since` (optional): Filter spans starting after this timestamp
  - `limit` (optional, default 5000, max 10000): Max spans to return
- Returns: Array of span objects sorted by `start_ts`

**Span Object Schema:**
```json
{
  "spanId": "string",
  "runId": "string",
  "parentSpanId": "string | null",
  "name": "string",
  "kind": "agent | llm | tool | task | generic",
  "startTs": "number",
  "endTs": "number | null",
  "status": "ok | error | null",
  "attrs": "object | null"
}
```

**Null Semantics:**
- `parentSpanId`: `null` indicates a root span
- `endTs`: `null` indicates span is still in progress
- `status`: `null` indicates no explicit status set (defaults to "ok")
- `attrs`: `null` indicates no attributes attached

#### Usage Endpoints

**GET `/api/runs/:runId/usage`**
- Get aggregated usage (tokens/cost) for a run
- Returns:
```json
{
  "totals": {
    "inputTokens": "number",
    "outputTokens": "number",
    "totalTokens": "number",
    "costUsd": "number | null"
  },
  "bySpan": {
    "[spanId]": {
      "inputTokens": "number",
      "outputTokens": "number",
      "totalTokens": "number",
      "costUsd": "number | null"
    }
  },
  "byKind": {
    "[kind]": {
      "inputTokens": "number",
      "outputTokens": "number",
      "totalTokens": "number",
      "costUsd": "number | null"
    }
  }
}
```

**Cost Calculation:**
- Uses model-specific pricing from `server/models.json`
- Falls back to Claude Sonnet 4 pricing if model unknown
- Returns `null` if no tokens reported

#### Trace Summary Endpoints

**GET `/api/runs/:runId/trace-summary`**
- Get comprehensive trace analysis for a run
- Returns:
```json
{
  "totalDurationMs": "number",
  "criticalPathMs": "number",
  "slowestSpans": [
    {
      "spanId": "string",
      "name": "string",
      "kind": "string",
      "durationMs": "number",
      "status": "string"
    }
  ],
  "errorSpans": [...],
  "hotspotsByKind": [
    {
      "kind": "string",
      "totalDurationMs": "number",
      "spanCount": "number",
      "errorCount": "number",
      "totalTokens": "number (optional)",
      "costUsd": "number (optional)"
    }
  ],
  "hotspotsByKindSelf": [
    {
      "kind": "string",
      "totalSelfMs": "number",
      "spanCount": "number",
      "errorCount": "number",
      "totalTokens": "number (optional)",
      "costUsd": "number (optional)"
    }
  ],
  "anomalyCounts": {
    "durationAnomalies": "number",
    "selfTimeClampedSpans": "number"
  }
}
```

**Metrics Explained:**
- `totalDurationMs`: Wall-clock time from first span start to last span end
- `criticalPathMs`: Longest path through parent-child chain (dynamic programming)
- `slowestSpans`: Top 10 spans by duration
- `errorSpans`: All spans with `status === 'error'`
- `hotspotsByKind`: Aggregated total time per span kind
- `hotspotsByKindSelf`: Aggregated self-time (exclusive time) per span kind
  - Self time = span duration - sum of direct children durations
  - Useful for finding actual work vs. coordination overhead
- `anomalyCounts`: Counters for data quality issues (only present if non-zero)

**Duration Anomalies:**
- Negative durations (endTs < startTs)
- Durations > 24 hours (86400000ms)
- These spans are excluded from aggregations

### Run-Level Overrides

The system supports manual overrides for run-level metadata:

**PATCH `/api/runs/:runId`**
- Update run metadata
- Supported fields:
  - `title`: Display name for the run
  - `status`: `running`, `completed`, `error`
  - `endedAt`: Timestamp when run ended
  - `errorMessage`: Error description (if status=error)
  - `metadata`: Free-form JSON object

**Example:**
```json
{
  "status": "completed",
  "endedAt": 1234567890000,
  "metadata": {
    "environment": "production",
    "version": "1.2.3"
  }
}
```

### Data Retention

- Events: 5000 most recent per run (configurable via `EVENT_RETENTION_MAX`)
- Spans: Unlimited (persistent)
- Usage reports: Persistent
- Runs: Persistent

### Null Handling Best Practices

1. **Always check for null before using:**
   - `span.endTs` may be null for in-progress spans
   - `span.parentSpanId` is null for root spans
   - `usage.costUsd` may be null if pricing unavailable

2. **Filtering completed spans:**
   ```javascript
   const completed = spans.filter(s => s.endTs !== null)
   ```

3. **Finding root spans:**
   ```javascript
   const roots = spans.filter(s => s.parentSpanId === null)
   ```

4. **Safe duration calculation:**
   ```javascript
   const duration = span.endTs && span.startTs
     ? span.endTs - span.startTs
     : null
   ```

## Related Documentation

- [Main README](../../README.md) - Project overview and quickstart
- [Integration Guide](../../INTEGRATION.md) - How to integrate with your agent
- [Self-Time Hotspots](../../SELF_TIME_HOTSPOTS.md) - Self-time computation details

## Support

For issues or questions:
- GitHub Issues: https://github.com/anthropics/agent-ops-dashboard/issues
- Documentation: See files linked above
