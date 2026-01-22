# Self-Time Hotspots Implementation

## Overview
Added "self time" mode to hotspots visualization to improve accuracy and clarity. Self time represents the exclusive time spent in each span, excluding time spent in child spans. This provides a more accurate view of where time is actually being spent, avoiding the issue where nested spans cause total time to exceed wall-clock time.

## Changes Made

### Server ([server/db.js](server/db.js))

#### New Function: `computeHotspotsByKindSelf(runId, spans)` (lines 946-1061)
- Computes hotspots using self-time instead of total span time
- **Self time formula**: `selfMs = max(0, spanDuration - sum(directChildDurations))`
- Builds parent-child relationships between spans
- Groups spans by `kind` and aggregates:
  - `totalSelfMs`: Sum of self-time for all spans of this kind
  - `spanCount`: Number of spans
  - `errorCount`: Number of error spans
  - `totalTokens`: Aggregated token usage (optional)
  - `costUsd`: Aggregated cost (optional)
- Returns sorted array (descending by totalSelfMs)

#### Updated: `getTraceSummary(runId)` (lines 793-864)
- Now calls `computeHotspotsByKindSelf()` in addition to existing `computeHotspotsByKind()`
- Returns both `hotspotsByKind` (total time) and `hotspotsByKindSelf` (self time)
- Backward compatible: existing code continues to work

### Client Types ([package/src/client/provider.ts](package/src/client/provider.ts))

#### New Interface: `HotspotByKindSelf` (lines 53-59)
```typescript
export interface HotspotByKindSelf {
  kind: string
  totalSelfMs: number      // Self time instead of totalDurationMs
  spanCount: number
  errorCount: number
  totalTokens?: number
  costUsd?: number
}
```

#### Updated: `TraceSummary` (lines 61-67)
- Added optional field: `hotspotsByKindSelf?: HotspotByKindSelf[]`

### Client Component ([package/src/components/AgentOpsDashboard.vue](package/src/components/AgentOpsDashboard.vue))

#### State Management (line 757)
- Added toggle state: `hotspotMode = ref<'total' | 'self'>('total')`

#### Computed Property: `displayedHotspots` (lines 858-878)
- Returns the appropriate hotspot data based on `hotspotMode`
- **Total mode**: Uses `traceSummary.hotspotsByKind`
- **Self mode**:
  - Uses `traceSummary.hotspotsByKindSelf` if available (server-provided)
  - Falls back to `computeHotspotsSelfTime(spans)` if not (client-side computation)
- Normalizes data structure for consistent rendering

#### Client-Side Fallback: `computeHotspotsSelfTime(spansList)` (lines 1867-1983)
- Mirrors server-side self-time computation
- Used when server doesn't provide `hotspotsByKindSelf`
- Ensures feature works even with older server versions

#### UI Toggle (lines 410-435)
- Added toggle buttons: "Total" vs "Self"
- Button tooltips explain the difference:
  - **Total**: "Total span time (may exceed wall time due to nesting)"
  - **Self**: "Self time (exclusive time, approximates time spent in each span excluding children)"
- Displays `displayedHotspots` based on selected mode

#### Timeline Filter Clear (line 1632)
- Clears `timelineKindFilter` when `selectedRunId` changes
- Prevents stale filters when switching between runs

#### Styles (lines 3139-3182)
- Added `.aod-details-section-title-with-toggle` for layout
- Added `.aod-hotspot-mode-toggle` for toggle button container
- Added `.aod-toggle-btn` with hover and active states

## User Benefits

1. **Accuracy**: Self time shows actual time spent in each span type, not inflated by nested children
2. **Clarity**: Toggle allows users to switch between perspectives:
   - **Total time**: Understand overall span duration (useful for latency analysis)
   - **Self time**: Identify where code is actually spending time (useful for optimization)
3. **Backward Compatible**: Older servers without self-time computation fall back to client-side calculation
4. **No Breaking Changes**: All existing functionality preserved

## Testing

Created verification script ([test-self-time.js](test-self-time.js)) that validates:
- Server-side self-time computation
- Correct handling of parent-child relationships
- Proper clamping (self time never negative)
- Token and cost aggregation

Test results:
```
✅ All tests passed!
```

## Example

Given these spans:
- `span-1` (agent): 4000ms total, with 2 child spans
- `span-2` (tool): 1000ms total, child of span-1
- `span-3` (tool): 1000ms total, child of span-1
- `span-4` (llm): 1500ms total, child of span-2

**Total Time View**:
- agent: 4000ms
- tool: 2000ms (1000 + 1000)
- llm: 1500ms

**Self Time View**:
- agent: 2000ms (4000 - 1000 - 1000)
- tool: 1000ms (span-2: 0ms + span-3: 1000ms)
- llm: 1500ms

Self time correctly shows that:
- The agent span spent 2000ms in its own code
- Only one tool span (span-3) had self-time; span-2's time was all in its child
- The llm span had no children, so self-time = total time
