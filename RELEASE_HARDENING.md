# Release Hardening Summary

This document summarizes the hardening improvements made for the release. All changes are additive only, with no breaking changes and no new dependencies.

## Changes Made

### 1. Documentation Index

**Created**: [docs/telemetry/README.md](docs/telemetry/README.md)

Comprehensive telemetry documentation index including:
- Overview of span-based tracing, usage tracking, and auto-instrumentation
- Links to all implementation guides (Span Model, Usage Telemetry, Auto-Span)
- Complete API endpoint documentation with schemas
- Null semantics and best practices
- Run-level override documentation
- Data retention policies

**Endpoints documented**:
- `GET /api/runs/:runId/spans`
- `GET /api/runs/:runId/usage`
- `GET /api/runs/:runId/trace-summary`
- `PATCH /api/runs/:runId`

### 2. Node Version Guardrails

**Files Added/Modified**:
- `.nvmrc`: Specifies Node 20.19.0
- `package.json`: Added `engines.node >= 20.19.0` (root, package, server)
- `README.md`: Updated with Node version requirement notice

**Rationale**: Vite 7 requires Node 20.19+. The guardrails help users identify version issues early. Users running older Node versions will see clear error messages from npm/pnpm about engine requirements.

**User Experience**:
```
Requirements
- Node.js >= 20.19.0 (required for full build with Vite 7)
- pnpm (package manager)

Note: The server and collector can run on older Node versions (16+),
but building the UI package requires Node 20.19+
```

### 3. Anomaly Counters in Trace Summary

**Server Changes** ([server/db.js](server/db.js)):

#### New Function: `computeHotspotsByKindSelfWithAnomalies()`
- Enhanced version of self-time computation that tracks anomalies
- Returns `{ hotspots, clampedCount }` tuple
- Counts spans where `rawSelfMs < 0` (child duration exceeded parent)

#### Updated: `getTraceSummary()`
- Now tracks two types of anomalies:
  - **Duration anomalies**: Spans with negative duration or > 24 hours
  - **Self-time clamped spans**: Spans where children exceeded parent duration
- Adds optional `anomalyCounts` field to result (only present if non-zero)

**Client Changes**:

**Types** ([package/src/client/provider.ts](package/src/client/provider.ts)):
```typescript
export interface TraceSummary {
  // ... existing fields
  anomalyCounts?: {
    durationAnomalies?: number
    selfTimeClampedSpans?: number
  }
}
```

**UI** ([package/src/components/AgentOpsDashboard.vue](package/src/components/AgentOpsDashboard.vue)):
- Added subtle warning section in Summary panel
- Only displays when anomalies are present
- Shows counts with descriptive explanations
- Styled with amber/warning colors (not alarming, just informative)

**Example Display**:
```
⚠️ Data Quality Notes
  2  spans with invalid duration (negative or >24h) excluded from metrics
  1  span with negative self-time (children exceeded parent duration)
```

**Testing**: Created [test-anomalies.js](test-anomalies.js) to verify detection works correctly.

### 4. Sensitive Data Audit

**Audit Results**: ✅ No issues found

**Verified**:
- ✅ Request logging only includes: method, path, status code, duration
- ✅ API keys are never logged (checked all console.* calls)
- ✅ Request bodies (`attrs`, `payload`) are never logged
- ✅ Headers are never logged
- ✅ Database values are not dumped to logs

**Server logging is safe**:
```javascript
// Only logs non-sensitive info
console.log(`[${timestamp}] ${method} ${pathname} ${status} ${duration}ms`)
```

**No changes needed** - the codebase already follows security best practices.

### 5. Build Verification

**Verified**:
- ✅ TypeScript compilation passes (`vue-tsc --noEmit`)
- ✅ Server syntax valid (`node -c server/*.js`)
- ✅ Self-time tests pass ([test-self-time.js](test-self-time.js))
- ✅ Anomaly detection tests pass ([test-anomalies.js](test-anomalies.js))

**Test Results**:
```
✅ All tests passed!
  - Self-time computation correct
  - Anomaly detection working
  - Duration anomalies: 2 detected
  - Self-time clamped: 1 detected
```

## Backward Compatibility

All changes are fully backward compatible:

1. **Documentation**: New files, no changes to existing behavior
2. **Node version**: Only affects new builds, doesn't break existing installations
3. **Anomaly counters**: Optional field, older clients ignore it gracefully
4. **Logging**: No changes to logging behavior

## Security

No security concerns:
- No new dependencies added
- No sensitive data logged
- No API surface changes
- All changes are additive and defensive

## Summary

This hardening pass improves:
- **Documentation**: Comprehensive API reference for integrators
- **Developer Experience**: Clear Node version requirements
- **Data Quality**: Visibility into data anomalies
- **Security**: Verified no sensitive data exposure

**Status**: Ready for release ✅
