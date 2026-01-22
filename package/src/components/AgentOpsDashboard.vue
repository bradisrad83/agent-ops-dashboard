<template>
  <div class="aod-shell">
    <div class="aod-header">
      <div class="aod-title">Agent Ops Dashboard</div>
      <div class="aod-subtitle">v0.1 — event-driven UI</div>
    </div>

    <div class="aod-grid" :class="{ 'aod-grid-with-runs': props.showRuns }">
      <!-- Runs Sidebar -->
      <aside v-if="props.showRuns" class="aod-panel aod-runs-sidebar">
        <div class="aod-panel-title">Runs</div>

        <!-- Loading state -->
        <div v-if="runsLoading" class="aod-runs-loading">
          <div class="aod-muted">Loading runs...</div>
        </div>

        <!-- Empty state -->
        <div v-else-if="runs.length === 0" class="aod-runs-empty">
          <div class="aod-muted">No runs available</div>
        </div>

        <!-- Runs list -->
        <div v-else class="aod-runs-list">
          <div
            v-for="run in runs"
            :key="run.id"
            :class="['aod-run-row', { 'aod-run-row-selected': selectedRunId === run.id }]"
            :data-run-status="run.status || 'running'"
            @click="selectedRunId = run.id"
          >
            <div class="aod-run-header">
              <span class="aod-run-status-dot" :data-status="run.status || 'running'"></span>
              <span class="aod-run-time">{{ formatTimeHHMM(run.startedAt) }}</span>
            </div>
            <div class="aod-run-title">{{ run.title || run.id }}</div>
          </div>
        </div>
      </aside>

      <main class="aod-panel aod-main">
        <div class="aod-panel-title">Event Stream</div>

        <!-- Run Stats Strip -->
        <div class="aod-run-stats" data-panel="run-stats">
          <div class="aod-run-stats-main">
            <span :class="['aod-stats-status-dot', `aod-stats-status-${runStats.status}`]"></span>
            <span class="aod-stats-title">{{ runStats.title }}</span>
            <span class="aod-stats-badge">{{ runStats.status }}</span>
          </div>
          <div class="aod-run-stats-metrics">
            <div class="aod-stat-item">
              <span class="aod-stat-label">Elapsed</span>
              <span class="aod-stat-value">{{ formatElapsed(runStats.elapsed) }}</span>
            </div>
            <div class="aod-stat-item">
              <span class="aod-stat-label">Events</span>
              <span class="aod-stat-value">{{ runStats.eventCount }}</span>
            </div>
            <div class="aod-stat-item" v-if="runStats.errorCount > 0">
              <span class="aod-stat-label">Errors</span>
              <span class="aod-stat-value aod-stat-error">{{ runStats.errorCount }}</span>
            </div>
            <div class="aod-stat-item" v-if="usageData.totals.totalTokens > 0">
              <span class="aod-stat-label">Tokens</span>
              <span class="aod-stat-value">{{ usageData.totals.totalTokens.toLocaleString() }}</span>
            </div>
            <div class="aod-stat-item" v-if="usageData.totals.costUsd !== null && usageData.totals.costUsd !== undefined">
              <span class="aod-stat-label">Cost</span>
              <span class="aod-stat-value">${{ usageData.totals.costUsd.toFixed(4) }}</span>
            </div>
            <div class="aod-stat-item" v-if="runStats.lastActivity">
              <span class="aod-stat-label">Last Activity</span>
              <span class="aod-stat-value">{{ formatTimeHHMM(runStats.lastActivity) }}</span>
            </div>
          </div>
        </div>

        <div class="aod-filters">
          <input
            v-model="searchQuery"
            type="text"
            class="aod-search"
            placeholder="Search events (agent, type, payload...)"
          />

          <div class="aod-filter-chips">
            <button
              v-for="prefix in typePrefixes"
              :key="prefix"
              :class="['aod-chip', { 'aod-chip-active': selectedTypePrefix === prefix }]"
              @click="selectedTypePrefix = prefix"
            >
              {{ prefix }}
            </button>
          </div>

          <span class="aod-count">{{ visibleEvents.length }} events</span>
        </div>

        <div class="aod-toolbar">
          <button
            :class="['aod-toolbar-btn', { 'aod-toolbar-btn-active': isPaused }]"
            @click="togglePause"
            :title="isPaused ? 'Resume event stream' : 'Pause event stream'"
          >
            {{ isPaused ? '▶ Resume' : '⏸ Pause' }}
          </button>
          <button
            class="aod-toolbar-btn"
            @click="clearEvents"
            title="Clear all events"
          >
            🗑 Clear
          </button>
          <button
            class="aod-toolbar-btn"
            @click="exportJSON"
            title="Export filtered events as JSON"
          >
            ⬇ Export JSON
          </button>
          <button
            :class="['aod-toolbar-btn', { 'aod-toolbar-btn-active': autoScroll }]"
            @click="toggleAutoScroll"
            :title="autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'"
          >
            {{ autoScroll ? '🔽 Auto-scroll: ON' : '🔽 Auto-scroll: OFF' }}
          </button>
          <button
            :class="['aod-toolbar-btn', { 'aod-toolbar-btn-active': agentViewEnabled }]"
            @click="toggleAgentView"
            :title="agentViewEnabled ? 'Show all events' : 'Show agent-relevant events only'"
            data-action="agent-view"
          >
            {{ agentViewEnabled ? '👁 Agent view: ON' : '👁 Agent view: OFF' }}
          </button>
        </div>

        <div v-if="agentViewEnabled" class="aod-agent-view-hint">
          Showing agent-relevant events only
        </div>

        <div class="aod-events" ref="eventListRef">
          <div
            v-for="event in visibleEvents"
            :key="event.id"
            :class="['aod-event-row', { 'aod-event-row-selected': selectedEvent?.id === event.id }]"
            :data-agent="event.agentId || ''"
            :data-type="event.type"
            :data-level="event.level || 'info'"
            @click="selectedEvent = event"
          >
            <span class="aod-event-time">{{ formatTime(event.ts) }}</span>
            <span class="aod-event-agent">{{ event.agentId || 'system' }}</span>
            <span :class="['aod-event-badge', `aod-badge-${getTypePrefix(event.type)}`]">
              {{ event.type }}
            </span>
            <span class="aod-event-summary">{{ getSummary(event) }}</span>
          </div>
        </div>
      </main>

      <aside class="aod-panel aod-inspector">
        <!-- Panel Switcher -->
        <div class="aod-panel-header">
          <button
            :class="['aod-panel-tab', { 'aod-panel-tab-active': activePanel === 'inspector' }]"
            @click="activePanel = 'inspector'"
          >
            Inspector
          </button>
          <button
            :class="['aod-panel-tab', { 'aod-panel-tab-active': activePanel === 'activity' }]"
            @click="activePanel = 'activity'"
          >
            Activity
          </button>
          <button
            :class="['aod-panel-tab', { 'aod-panel-tab-active': activePanel === 'timeline' }]"
            @click="activePanel = 'timeline'"
          >
            Timeline
          </button>
          <button
            :class="['aod-panel-tab', { 'aod-panel-tab-active': activePanel === 'summary' }]"
            @click="activePanel = 'summary'"
          >
            Summary
          </button>
        </div>

        <!-- Inspector View -->
        <div v-if="activePanel === 'inspector'" class="aod-panel-content">
          <div v-if="selectedEvent" class="aod-inspector-content">
            <!-- Show usage info if available for span events -->
            <div v-if="selectedEvent.type === 'span.start' && selectedEvent.payload?.spanId && usageData.bySpan[selectedEvent.payload.spanId]" class="aod-usage-section">
              <div class="aod-usage-title">Usage</div>
              <div class="aod-usage-grid">
                <div class="aod-usage-item">
                  <span class="aod-usage-label">Input Tokens</span>
                  <span class="aod-usage-value">{{ (usageData.bySpan[selectedEvent.payload.spanId]?.inputTokens || 0).toLocaleString() }}</span>
                </div>
                <div class="aod-usage-item">
                  <span class="aod-usage-label">Output Tokens</span>
                  <span class="aod-usage-value">{{ (usageData.bySpan[selectedEvent.payload.spanId]?.outputTokens || 0).toLocaleString() }}</span>
                </div>
                <div class="aod-usage-item">
                  <span class="aod-usage-label">Total Tokens</span>
                  <span class="aod-usage-value">{{ (usageData.bySpan[selectedEvent.payload.spanId]?.totalTokens || 0).toLocaleString() }}</span>
                </div>
                <div v-if="usageData.bySpan[selectedEvent.payload.spanId]?.costUsd !== null && usageData.bySpan[selectedEvent.payload.spanId]?.costUsd !== undefined" class="aod-usage-item">
                  <span class="aod-usage-label">Cost</span>
                  <span class="aod-usage-value">${{ usageData.bySpan[selectedEvent.payload.spanId]!.costUsd!.toFixed(4) }}</span>
                </div>
                <div v-if="usageData.bySpan[selectedEvent.payload.spanId]?.model" class="aod-usage-item">
                  <span class="aod-usage-label">Model</span>
                  <span class="aod-usage-value">{{ usageData.bySpan[selectedEvent.payload.spanId]?.model }}</span>
                </div>
              </div>
            </div>
            <pre class="aod-json">{{ JSON.stringify(selectedEvent, null, 2) }}</pre>
          </div>
          <div v-else class="aod-muted">Select an event to inspect</div>
        </div>

        <!-- Activity View -->
        <div v-if="activePanel === 'activity'" class="aod-panel-content" data-panel="activity">
          <!-- Files Section -->
          <div class="aod-activity-section" data-section="files">
            <div class="aod-activity-section-title">Files</div>

            <!-- File Tabs -->
            <div class="aod-activity-tabs">
              <button
                :class="['aod-activity-tab', { 'aod-activity-tab-active': activeFileTab === 'created' }]"
                @click="activeFileTab = 'created'"
              >
                Created ({{ fileActivity.created.length }})
              </button>
              <button
                :class="['aod-activity-tab', { 'aod-activity-tab-active': activeFileTab === 'modified' }]"
                @click="activeFileTab = 'modified'"
              >
                Modified ({{ fileActivity.modified.length }})
              </button>
              <button
                :class="['aod-activity-tab', { 'aod-activity-tab-active': activeFileTab === 'deleted' }]"
                @click="activeFileTab = 'deleted'"
              >
                Deleted ({{ fileActivity.deleted.length }})
              </button>
            </div>

            <!-- File List -->
            <div class="aod-activity-list">
              <div
                v-for="file in fileActivity[activeFileTab]"
                :key="file.path"
                class="aod-file-item"
                :data-file-kind="file.lastKind"
              >
                <div class="aod-file-path">{{ file.path }}</div>
                <div class="aod-file-meta">
                  <span class="aod-file-count" v-if="file.count > 1">{{ file.count }}x</span>
                  <span class="aod-file-time">{{ formatTimeHHMM(file.lastTs) }}</span>
                </div>
              </div>
              <div v-if="fileActivity[activeFileTab].length === 0" class="aod-muted">
                No {{ activeFileTab }} files
              </div>
            </div>
          </div>

          <!-- Commands Section -->
          <div class="aod-activity-section" data-section="commands">
            <div class="aod-activity-section-title">Commands</div>

            <div class="aod-activity-list">
              <div
                v-for="cmd in commandActivity"
                :key="cmd.callEventId"
                class="aod-command-item"
                :data-command-status="cmd.status === 'success' ? 'ok' : cmd.status === 'error' ? 'fail' : 'running'"
                @click="selectedEvent = events.find(e => e.id === cmd.callEventId) || null"
              >
                <div class="aod-command-header">
                  <span :class="['aod-command-status', `aod-command-status-${cmd.status}`]"></span>
                  <span class="aod-command-text">{{ cmd.command }}</span>
                </div>
                <div class="aod-command-meta">
                  <span v-if="cmd.durationMs !== undefined" class="aod-command-duration">
                    {{ formatDuration(cmd.durationMs) }}
                  </span>
                  <span class="aod-command-time">{{ formatTimeHHMM(cmd.timestamp) }}</span>
                </div>
              </div>
              <div v-if="commandActivity.length === 0" class="aod-muted">
                No commands executed
              </div>
            </div>
          </div>

          <!-- Git Section -->
          <div class="aod-activity-section" data-section="git" v-if="gitActivity">
            <div class="aod-activity-section-title">Git Changes</div>

            <div class="aod-git-summary">
              <div class="aod-git-stat">
                <span class="aod-git-label">Files Changed:</span>
                <span class="aod-git-value">{{ gitActivity.filesChanged }}</span>
              </div>
              <div class="aod-git-stat">
                <span class="aod-git-label">Last Update:</span>
                <span class="aod-git-value">{{ formatTimeHHMM(gitActivity.timestamp) }}</span>
              </div>
            </div>

            <div class="aod-git-diff">
              <pre class="aod-git-code">{{ gitActivity.diffStat || 'No changes' }}</pre>
            </div>

            <div class="aod-git-status" v-if="gitActivity.statusPorcelain">
              <div class="aod-git-status-title">Status</div>
              <pre class="aod-git-code">{{ gitActivity.statusPorcelain }}</pre>
            </div>
          </div>
          <div v-else class="aod-muted" style="padding: 16px;">
            No git changes detected
          </div>
        </div>

        <!-- Timeline View -->
        <div v-if="activePanel === 'timeline'" class="aod-panel-content" data-panel="timeline">
          <!-- Kind filter indicator -->
          <div v-if="timelineKindFilter" class="aod-timeline-filter-bar">
            <span class="aod-filter-label">Filtered by kind:</span>
            <span class="aod-span-kind-badge" :data-kind="timelineKindFilter">{{ timelineKindFilter }}</span>
            <button class="aod-filter-clear-btn" @click="timelineKindFilter = null" title="Clear filter">
              × Clear
            </button>
          </div>

          <div v-if="spansLoading" class="aod-muted" style="padding: 16px;">
            Loading spans...
          </div>
          <div v-else-if="displaySpans.length === 0" class="aod-muted" style="padding: 16px;">
            No spans available
          </div>
          <div v-else class="aod-timeline-list">
            <div
              v-for="span in displaySpans"
              :key="span.spanId"
              :class="['aod-span-row', { 'aod-span-row-selected': selectedSpanId === span.spanId }]"
              :data-span-kind="span.kind"
              :data-span-status="span.status || 'running'"
              :data-span-auto="span.attrs?.auto === true ? 'true' : 'false'"
              :data-usage="usageData.bySpan[span.spanId] ? 'present' : 'absent'"
              :data-usage-scope="'self'"
              :data-usage-tokens="usageData.bySpan[span.spanId]?.totalTokens || 0"
              :data-usage-cost="usageData.bySpan[span.spanId]?.costUsd ?? ''"
              :data-usage-source="usageData.bySpan[span.spanId]?.source || 'absent'"
              :data-usage-confidence="usageData.bySpan[span.spanId]?.confidence !== undefined ? usageData.bySpan[span.spanId]?.confidence : 'absent'"
              :title="buildSpanTooltip(span)"
              :style="{ paddingLeft: `${span.level * 16 + 8}px` }"
              @click="handleSpanClick(span.spanId)"
            >
              <div class="aod-span-header">
                <span class="aod-span-status-dot" :data-status="span.status || 'running'"></span>
                <span class="aod-span-kind-badge" :data-kind="span.kind">{{ span.kind }}</span>
              </div>
              <div class="aod-span-name">{{ span.name }}</div>
              <div class="aod-span-duration">{{ formatSpanDisplay(span) }}</div>
            </div>
          </div>
        </div>

        <!-- Summary View -->
        <div v-if="activePanel === 'summary'" class="aod-panel-content" data-panel="summary">
          <div v-if="traceSummaryLoading" class="aod-muted" style="padding: 16px;">
            Loading trace summary...
          </div>
          <div v-else-if="!traceSummary" class="aod-muted" style="padding: 16px;">
            No trace summary available
          </div>
          <div v-else class="aod-summary-content">
            <!-- Key Metrics -->
            <div class="aod-details-section">
              <div class="aod-details-section-title">Key Metrics</div>
              <div class="aod-details-grid">
                <div class="aod-details-item">
                  <span class="aod-details-label">Total Duration</span>
                  <span class="aod-details-value">{{ formatDurationMs(traceSummary.totalDurationMs) }}</span>
                </div>
                <div class="aod-details-item">
                  <span class="aod-details-label">Longest span chain</span>
                  <span class="aod-details-value">{{ formatDurationMs(traceSummary.criticalPathMs) }}</span>
                </div>
                <div class="aod-details-item">
                  <span class="aod-details-label">Total Spans</span>
                  <span class="aod-details-value">{{ spans.length }}</span>
                </div>
                <div class="aod-details-item" v-if="traceSummary.errorSpans.length > 0">
                  <span class="aod-details-label">Error Spans</span>
                  <span class="aod-details-value aod-stat-error">{{ traceSummary.errorSpans.length }}</span>
                </div>
              </div>
            </div>

            <!-- Hotspots by Kind -->
            <div class="aod-details-section" v-if="displayedHotspots.length > 0" data-summary-hotspots="true">
              <div class="aod-details-section-title-with-toggle">
                <div class="aod-details-section-title">Hotspots</div>
                <div class="aod-hotspot-mode-toggle">
                  <button
                    class="aod-toggle-btn"
                    :class="{ active: hotspotMode === 'total' }"
                    @click="hotspotMode = 'total'"
                    title="Total span time (may exceed wall time due to nesting)"
                  >
                    Total
                  </button>
                  <button
                    class="aod-toggle-btn"
                    :class="{ active: hotspotMode === 'self' }"
                    @click="hotspotMode = 'self'"
                    title="Self time (exclusive time, approximates time spent in each span excluding children)"
                  >
                    Self
                  </button>
                </div>
              </div>
              <div class="aod-hotspots-list">
                <div
                  v-for="hotspot in displayedHotspots"
                  :key="hotspot.kind"
                  class="aod-hotspot-row"
                  :data-hotspot-kind="hotspot.kind"
                  @click="filterByKind(hotspot.kind)"
                  :title="`Click to filter timeline by ${hotspot.kind}`"
                >
                  <div class="aod-hotspot-header">
                    <span class="aod-span-kind-badge" :data-kind="hotspot.kind">{{ hotspot.kind }}</span>
                    <span class="aod-hotspot-count">{{ hotspot.spanCount }} span{{ hotspot.spanCount !== 1 ? 's' : '' }}</span>
                  </div>
                  <div class="aod-hotspot-metrics">
                    <div class="aod-hotspot-duration">
                      {{ formatDurationMs(hotspot.totalDurationMs) }}
                      <span class="aod-hotspot-percent" v-if="traceSummary.totalDurationMs > 0">
                        ({{ ((hotspot.totalDurationMs / traceSummary.totalDurationMs) * 100).toFixed(1) }}%)
                      </span>
                    </div>
                    <div class="aod-hotspot-extras">
                      <span v-if="hotspot.errorCount > 0" class="aod-hotspot-errors">
                        {{ hotspot.errorCount }} error{{ hotspot.errorCount !== 1 ? 's' : '' }}
                      </span>
                      <span v-if="hotspot.totalTokens" class="aod-hotspot-tokens">
                        {{ hotspot.totalTokens.toLocaleString() }} tokens
                      </span>
                      <span v-if="hotspot.costUsd !== null && hotspot.costUsd !== undefined" class="aod-hotspot-cost">
                        ${{ hotspot.costUsd.toFixed(4) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Data Quality Warnings -->
            <div class="aod-details-section aod-anomaly-warning" v-if="traceSummary.anomalyCounts && (traceSummary.anomalyCounts.durationAnomalies || traceSummary.anomalyCounts.selfTimeClampedSpans)">
              <div class="aod-anomaly-title">⚠️ Data Quality Notes</div>
              <div class="aod-anomaly-list">
                <div v-if="traceSummary.anomalyCounts.durationAnomalies" class="aod-anomaly-item">
                  <span class="aod-anomaly-count">{{ traceSummary.anomalyCounts.durationAnomalies }}</span>
                  <span class="aod-anomaly-desc">span{{ traceSummary.anomalyCounts.durationAnomalies !== 1 ? 's' : '' }} with invalid duration (negative or >24h) excluded from metrics</span>
                </div>
                <div v-if="traceSummary.anomalyCounts.selfTimeClampedSpans" class="aod-anomaly-item">
                  <span class="aod-anomaly-count">{{ traceSummary.anomalyCounts.selfTimeClampedSpans }}</span>
                  <span class="aod-anomaly-desc">span{{ traceSummary.anomalyCounts.selfTimeClampedSpans !== 1 ? 's' : '' }} with negative self-time (children exceeded parent duration)</span>
                </div>
              </div>
            </div>

            <!-- Slowest Spans -->
            <div class="aod-details-section" v-if="traceSummary.slowestSpans.length > 0">
              <div class="aod-details-section-title">Slowest Spans</div>
              <div class="aod-summary-spans-list">
                <div
                  v-for="span in traceSummary.slowestSpans"
                  :key="span.spanId"
                  class="aod-summary-span-row"
                  :data-span-status="span.status"
                  @click="handleSpanClick(span.spanId)"
                >
                  <div class="aod-summary-span-header">
                    <span class="aod-span-status-dot" :data-status="span.status"></span>
                    <span class="aod-span-kind-badge" :data-kind="span.kind">{{ span.kind }}</span>
                  </div>
                  <div class="aod-summary-span-name">{{ span.name }}</div>
                  <div class="aod-summary-span-duration">{{ formatDurationMs(span.durationMs) }}</div>
                </div>
              </div>
            </div>

            <!-- Error Spans -->
            <div class="aod-details-section" v-if="traceSummary.errorSpans.length > 0">
              <div class="aod-details-section-title">Error Spans</div>
              <div class="aod-summary-spans-list">
                <div
                  v-for="span in traceSummary.errorSpans"
                  :key="span.spanId"
                  class="aod-summary-span-row"
                  :data-span-status="span.status"
                  @click="handleSpanClick(span.spanId)"
                >
                  <div class="aod-summary-span-header">
                    <span class="aod-span-status-dot" :data-status="span.status"></span>
                    <span class="aod-span-kind-badge" :data-kind="span.kind">{{ span.kind }}</span>
                  </div>
                  <div class="aod-summary-span-name">{{ span.name }}</div>
                  <div class="aod-summary-span-duration" v-if="span.durationMs !== null">
                    {{ formatDurationMs(span.durationMs) }}
                  </div>
                  <div class="aod-summary-span-duration" v-else>—</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Span Details View (Part B) -->
        <div v-if="activePanel === 'span-details'" class="aod-panel-content" data-panel="span-details">
          <div v-if="selectedSpanId && getSpanById(selectedSpanId)" class="aod-span-details">
            <template v-if="getSpanById(selectedSpanId)">
              <!-- Header -->
              <div class="aod-span-details-header">
                <button class="aod-back-btn" @click="activePanel = 'timeline'" title="Back to Timeline">
                  ← Back
                </button>
                <div class="aod-span-details-title">Span Details</div>
              </div>

              <!-- Basic Info -->
              <div class="aod-details-section" :data-selected-span="selectedSpanId">
                <div class="aod-details-section-title">Overview</div>
                <div class="aod-details-grid">
                  <div class="aod-details-item">
                    <span class="aod-details-label">Name</span>
                    <span class="aod-details-value">{{ getSpanById(selectedSpanId)!.name }}</span>
                  </div>
                  <div class="aod-details-item">
                    <span class="aod-details-label">Kind</span>
                    <span class="aod-details-value">
                      <span class="aod-span-kind-badge" :data-kind="getSpanById(selectedSpanId)!.kind">
                        {{ getSpanById(selectedSpanId)!.kind }}
                      </span>
                    </span>
                  </div>
                  <div class="aod-details-item">
                    <span class="aod-details-label">Status</span>
                    <span class="aod-details-value">
                      <span class="aod-span-status-dot" :data-status="getSpanById(selectedSpanId)!.status || 'running'"></span>
                      {{ getSpanById(selectedSpanId)!.status || 'running' }}
                    </span>
                  </div>
                  <div class="aod-details-item">
                    <span class="aod-details-label">Duration</span>
                    <span class="aod-details-value">{{ formatSpanDuration(getSpanById(selectedSpanId)!) }}</span>
                  </div>
                  <div class="aod-details-item">
                    <span class="aod-details-label">Start Time</span>
                    <span class="aod-details-value">{{ formatTime(new Date(getSpanById(selectedSpanId)!.startTs).toISOString()) }}</span>
                  </div>
                  <div class="aod-details-item" v-if="getSpanById(selectedSpanId)!.endTs">
                    <span class="aod-details-label">End Time</span>
                    <span class="aod-details-value">{{ formatTime(new Date(getSpanById(selectedSpanId)!.endTs!).toISOString()) }}</span>
                  </div>
                </div>
              </div>

              <!-- Usage Info -->
              <div class="aod-details-section" v-if="usageData.bySpan[selectedSpanId]">
                <div class="aod-details-section-title">Usage (Self)</div>
                <div class="aod-details-grid">
                  <div class="aod-details-item" v-if="usageData.bySpan[selectedSpanId].model">
                    <span class="aod-details-label">Model</span>
                    <span class="aod-details-value">{{ usageData.bySpan[selectedSpanId].model }}</span>
                  </div>
                  <div class="aod-details-item" v-if="usageData.bySpan[selectedSpanId].inputTokens">
                    <span class="aod-details-label">Input Tokens</span>
                    <span class="aod-details-value">{{ formatTokens(usageData.bySpan[selectedSpanId].inputTokens) }}</span>
                  </div>
                  <div class="aod-details-item" v-if="usageData.bySpan[selectedSpanId].outputTokens">
                    <span class="aod-details-label">Output Tokens</span>
                    <span class="aod-details-value">{{ formatTokens(usageData.bySpan[selectedSpanId].outputTokens) }}</span>
                  </div>
                  <div class="aod-details-item">
                    <span class="aod-details-label">Total Tokens</span>
                    <span class="aod-details-value">{{ formatTokens(usageData.bySpan[selectedSpanId].totalTokens) }}</span>
                  </div>
                  <div class="aod-details-item" v-if="usageData.bySpan[selectedSpanId].costUsd !== null && usageData.bySpan[selectedSpanId].costUsd !== undefined">
                    <span class="aod-details-label">Cost</span>
                    <span class="aod-details-value">{{ formatUsd(usageData.bySpan[selectedSpanId].costUsd!) }}</span>
                  </div>
                  <div class="aod-details-item" v-if="usageData.bySpan[selectedSpanId].source">
                    <span class="aod-details-label">Source</span>
                    <span class="aod-details-value">{{ usageData.bySpan[selectedSpanId].source }}</span>
                  </div>
                  <div class="aod-details-item" v-if="usageData.bySpan[selectedSpanId].confidence !== undefined">
                    <span class="aod-details-label">Confidence</span>
                    <span class="aod-details-value">{{ (usageData.bySpan[selectedSpanId].confidence! * 100).toFixed(0) }}%</span>
                  </div>
                </div>
              </div>

              <!-- Total Usage (Self + Children) -->
              <div class="aod-details-section" v-if="computeTotalUsage(selectedSpanId).totalTokens > 0 || computeTotalUsage(selectedSpanId).costUsd !== null">
                <div class="aod-details-section-title">Usage (Total: Self + Children)</div>
                <div class="aod-details-grid">
                  <div class="aod-details-item">
                    <span class="aod-details-label">Total Tokens</span>
                    <span class="aod-details-value">{{ formatTokens(computeTotalUsage(selectedSpanId).totalTokens) }}</span>
                  </div>
                  <div class="aod-details-item" v-if="computeTotalUsage(selectedSpanId).costUsd !== null">
                    <span class="aod-details-label">Total Cost</span>
                    <span class="aod-details-value">{{ formatUsd(computeTotalUsage(selectedSpanId).costUsd!) }}</span>
                  </div>
                </div>
              </div>

              <!-- Attributes -->
              <div class="aod-details-section" v-if="getSpanById(selectedSpanId)!.attrs && Object.keys(getSpanById(selectedSpanId)!.attrs || {}).length > 0">
                <div class="aod-details-section-title">Attributes</div>
                <pre class="aod-json">{{ JSON.stringify(getSpanById(selectedSpanId)!.attrs, null, 2) }}</pre>
              </div>

              <!-- Children Spans -->
              <div class="aod-details-section" v-if="getSpanChildren(selectedSpanId).length > 0">
                <div class="aod-details-section-title">Child Spans ({{ getSpanChildren(selectedSpanId).length }})</div>
                <div class="aod-children-list">
                  <div
                    v-for="childSpan in getSpanChildren(selectedSpanId)"
                    :key="childSpan.spanId"
                    class="aod-child-span-row"
                    @click="handleSpanClick(childSpan.spanId)"
                  >
                    <div class="aod-child-span-header">
                      <span class="aod-span-status-dot" :data-status="childSpan.status || 'running'"></span>
                      <span class="aod-span-kind-badge" :data-kind="childSpan.kind">{{ childSpan.kind }}</span>
                    </div>
                    <div class="aod-child-span-name">{{ childSpan.name }}</div>
                    <div class="aod-child-span-duration">{{ formatSpanDuration(childSpan) }}</div>
                  </div>
                </div>
              </div>

              <!-- Events in Span Toggle -->
              <div class="aod-details-section">
                <div class="aod-details-section-title">
                  <label class="aod-toggle-label">
                    <input type="checkbox" v-model="showEventsInSpan" class="aod-toggle-checkbox" />
                    Show events in span ({{ getEventsInSpan(getSpanById(selectedSpanId)!).length }})
                  </label>
                </div>
                <div v-if="showEventsInSpan" class="aod-events-in-span-list">
                  <div
                    v-for="event in getEventsInSpan(getSpanById(selectedSpanId)!)"
                    :key="event.id"
                    class="aod-event-in-span-row"
                    @click="selectedEvent = event; activePanel = 'inspector'"
                  >
                    <span class="aod-event-time">{{ formatTime(event.ts) }}</span>
                    <span :class="['aod-event-badge', `aod-badge-${getTypePrefix(event.type)}`]">
                      {{ event.type }}
                    </span>
                    <span class="aod-event-summary">{{ getSummary(event) }}</span>
                  </div>
                  <div v-if="getEventsInSpan(getSpanById(selectedSpanId)!).length === 0" class="aod-muted">
                    No events in this span
                  </div>
                </div>
              </div>
            </template>
          </div>
          <div v-else class="aod-muted">No span selected</div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { AgentOpsEvent, EventType, Span } from '../types/events'
import type { EventStreamControl, EventStreamProvider, RunSummary } from '../client/provider'
import { mockProvider } from '../client/mockProvider'

interface Props {
  provider?: EventStreamProvider
  runId?: string
  intervalMs?: number
  maxEvents?: number
  showRuns?: boolean
  initialRunId?: string
}

const props = withDefaults(defineProps<Props>(), {
  provider: () => mockProvider,
  intervalMs: 1000,
  maxEvents: 100,
  showRuns: true,
  initialRunId: 'default'
})

const events = ref<AgentOpsEvent[]>([])
const selectedEvent = ref<AgentOpsEvent | null>(null)
const searchQuery = ref<string>('')
const selectedTypePrefix = ref<string>('all')
const isPaused = ref<boolean>(false)
const autoScroll = ref<boolean>(true)
const eventListRef = ref<HTMLElement | null>(null)
const agentViewEnabled = ref<boolean>(false)

// Run selection state
const runs = ref<RunSummary[]>([])
const runsLoading = ref<boolean>(false)
const selectedRunId = ref<string>(props.initialRunId)

// Activity panel state
const activePanel = ref<'inspector' | 'activity' | 'timeline' | 'summary' | 'span-details'>('inspector')
const activeFileTab = ref<'created' | 'modified' | 'deleted'>('created')

// Timeline state
const spans = ref<Span[]>([])
const spansLoading = ref<boolean>(false)
const selectedSpanId = ref<string | null>(null)
const timelineKindFilter = ref<string | null>(null)

// Usage tracking state
const usageData = ref<{
  totals: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    costUsd: number | null
    model?: string
    source?: string
    confidence?: number
  }
  bySpan: Record<string, {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    costUsd: number | null
    model?: string
    source?: string
    confidence?: number
  }>
}>({
  totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: null },
  bySpan: {}
})

// Trace summary state
const traceSummary = ref<{
  totalDurationMs: number
  criticalPathMs: number
  slowestSpans: Array<{
    spanId: string
    name: string
    kind: string
    durationMs: number
    status: string
  }>
  errorSpans: Array<{
    spanId: string
    name: string
    kind: string
    durationMs: number | null
    status: string
  }>
  hotspotsByKind: Array<{
    kind: string
    totalDurationMs: number
    spanCount: number
    errorCount: number
    totalTokens?: number
    costUsd?: number
  }>
  hotspotsByKindSelf?: Array<{
    kind: string
    totalSelfMs: number
    spanCount: number
    errorCount: number
    totalTokens?: number
    costUsd?: number
  }>
  anomalyCounts?: {
    durationAnomalies?: number
    selfTimeClampedSpans?: number
  }
} | null>(null)
const traceSummaryLoading = ref<boolean>(false)
const hotspotMode = ref<'total' | 'self'>('total')

let streamControl: EventStreamControl | null = null

const typePrefixes = ['all', 'run.*', 'task.*', 'tool.*', 'artifact.*', 'error']

// Agent-relevant event types (excludes fs/git/vscode/system noise)
const agentRelevantTypes: Set<EventType> = new Set<EventType>([
  'llm.prompt',
  'llm.response',
  'agent.started',
  'agent.stdout',
  'agent.stderr',
  'agent.exit',
  'tool.called',
  'tool.result',
  'run.started',
  'run.completed',
  'run.error',
  'session.started',
  'session.stopped',
  'span.start',
  'span.end',
  'span.event',
  'note',
  'error'
])

const getTypePrefix = (type: string): string => {
  if (type === 'error') return 'error'
  const parts = type.split('.')
  return parts[0] || 'unknown'
}

const formatTime = (ts: string): string => {
  const date = new Date(ts)
  return date.toLocaleTimeString('en-US', { hour12: false })
}

const formatTimeHHMM = (ts: string): string => {
  const date = new Date(ts)
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

const formatElapsed = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes < 60) return `${minutes}m ${secs}s`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins}m`
}

// Format duration in milliseconds
const formatDurationMs = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  const millis = ms % 1000
  if (seconds < 60) return `${seconds}.${Math.floor(millis / 100)}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}m ${secs}s`
}

// Legacy alias for compatibility
const formatDuration = formatDurationMs

// Format token count with locale
const formatTokens = (tokens: number): string => {
  return tokens.toLocaleString()
}

// Format USD cost
const formatUsd = (usd: number): string => {
  return `$${usd.toFixed(4)}`
}

const getSummary = (event: AgentOpsEvent): string => {
  const payload = event.payload
  if (!payload || typeof payload !== 'object') return ''

  // Extract meaningful summary from common payload fields
  if (payload.message) return String(payload.message)
  if (payload.description) return String(payload.description)
  if (payload.toolName) return `Tool: ${payload.toolName}`
  if (payload.status) return `Status: ${payload.status}`
  if (payload.error) return `Error: ${payload.error}`

  // Fallback: show first key-value pair
  const keys = Object.keys(payload)
  if (keys.length > 0) {
    const firstKey = keys[0]
    const value = payload[firstKey]
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value)
    return `${firstKey}: ${valueStr.slice(0, 50)}${valueStr.length > 50 ? '...' : ''}`
  }

  return ''
}

const displayedHotspots = computed(() => {
  if (!traceSummary.value) return []

  if (hotspotMode.value === 'self') {
    // Use self-time hotspots if available
    if (traceSummary.value.hotspotsByKindSelf && traceSummary.value.hotspotsByKindSelf.length > 0) {
      return traceSummary.value.hotspotsByKindSelf.map(h => ({
        kind: h.kind,
        totalDurationMs: h.totalSelfMs,
        spanCount: h.spanCount,
        errorCount: h.errorCount,
        totalTokens: h.totalTokens,
        costUsd: h.costUsd
      }))
    }
    // Fall back to client-side computation if server doesn't provide it
    return computeHotspotsSelfTime(spans.value)
  }

  // Default to total span time
  return traceSummary.value.hotspotsByKind || []
})

const filteredEvents = computed(() => {
  return events.value.filter(event => {
    // Type prefix filter
    if (selectedTypePrefix.value !== 'all') {
      if (selectedTypePrefix.value === 'error') {
        if (event.type !== 'error') return false
      } else {
        const prefix = selectedTypePrefix.value.replace('.*', '')
        if (!event.type.startsWith(prefix + '.')) return false
      }
    }

    // Text search filter
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase()
      const agentMatch = event.agentId?.toLowerCase().includes(query)
      const typeMatch = event.type.toLowerCase().includes(query)
      const payloadMatch = JSON.stringify(event.payload).toLowerCase().includes(query)

      if (!agentMatch && !typeMatch && !payloadMatch) return false
    }

    return true
  })
})

// Visible events: applies agent view filter on top of existing filters
const visibleEvents = computed(() => {
  let result = filteredEvents.value

  // Apply agent view filter if enabled
  if (agentViewEnabled.value) {
    result = result.filter(event => agentRelevantTypes.has(event.type))
  }

  return result
})

// Activity data derived from events
interface FileActivity {
  path: string
  lastTs: string
  count: number
  lastKind: 'created' | 'modified' | 'deleted'
}

interface CommandActivity {
  command: string
  cwd: string
  exitCode?: number
  durationMs?: number
  timestamp: string
  status: 'running' | 'success' | 'error'
  callEventId: string
}

interface GitActivity {
  statusPorcelain: string
  diffStat: string
  timestamp: string
  filesChanged: number
}

type FileTab = 'created' | 'modified' | 'deleted'

// Compute file activity from fs.changed and fs.batch events
const fileActivity = computed((): Record<'created' | 'modified' | 'deleted', FileActivity[]> => {
  const created: FileActivity[] = []
  const modified: FileActivity[] = []
  const deleted: FileActivity[] = []

  const fileMap = new Map<string, FileActivity>()

  events.value.forEach(event => {
    // Handle individual fs.changed events
    if (event.type === 'fs.changed' && event.payload) {
      const file = event.payload.file
      const kind = event.payload.kind as 'created' | 'modified' | 'deleted'
      const ts = event.payload.timestamp || event.ts

      if (!file || !kind) return

      const existing = fileMap.get(file)
      if (existing) {
        existing.count++
        existing.lastTs = ts
        existing.lastKind = kind
      } else {
        fileMap.set(file, {
          path: file,
          lastTs: ts,
          count: 1,
          lastKind: kind
        })
      }
    }

    // Handle batched fs.batch events
    if (event.type === 'fs.batch' && event.payload && event.payload.changes) {
      const changes = event.payload.changes as Array<{ file: string; kind: 'created' | 'modified' | 'deleted' }>
      const ts = event.ts

      for (const change of changes) {
        const file = change.file
        const kind = change.kind

        if (!file || !kind) continue

        const existing = fileMap.get(file)
        if (existing) {
          existing.count++
          existing.lastTs = ts
          existing.lastKind = kind
        } else {
          fileMap.set(file, {
            path: file,
            lastTs: ts,
            count: 1,
            lastKind: kind
          })
        }
      }
    }
  })

  // Split by last kind and cap each list
  fileMap.forEach(file => {
    if (file.lastKind === 'created') created.push(file)
    else if (file.lastKind === 'modified') modified.push(file)
    else if (file.lastKind === 'deleted') deleted.push(file)
  })

  // Sort by timestamp (newest first) and cap to 50
  const sortByTime = (a: FileActivity, b: FileActivity) =>
    new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime()

  return {
    created: created.sort(sortByTime).slice(0, 50),
    modified: modified.sort(sortByTime).slice(0, 50),
    deleted: deleted.sort(sortByTime).slice(0, 50)
  }
})

// Compute command activity by pairing tool.called and tool.result
const commandActivity = computed(() => {
  const commands: CommandActivity[] = []
  const callMap = new Map<string, CommandActivity>()

  // Build index of tool.result events by toolCallId for fast lookup
  const resultsByToolCallId = new Map<string, any>()
  events.value.forEach(event => {
    if (event.type === 'tool.result' && event.payload && event.payload.toolCallId) {
      resultsByToolCallId.set(event.payload.toolCallId, event.payload)
    }
  })

  events.value.forEach((event, index) => {
    if (event.type === 'tool.called' && event.payload) {
      const command = event.payload.command
      const cwd = event.payload.cwd
      const timestamp = event.payload.timestamp || event.ts
      const toolCallId = event.payload.toolCallId

      if (!command) return

      const entry: CommandActivity = {
        command,
        cwd: cwd || '',
        timestamp,
        status: 'running',
        callEventId: event.id
      }

      callMap.set(event.id, entry)

      // Prefer pairing by toolCallId if available
      if (toolCallId && resultsByToolCallId.has(toolCallId)) {
        const result = resultsByToolCallId.get(toolCallId)
        if (result) {
          entry.exitCode = result.exitCode
          entry.durationMs = result.durationMs
          entry.status = result.exitCode === 0 ? 'success' : 'error'
        }
      } else {
        // Fallback: Look ahead for matching tool.result (within next 100 events)
        const lookAheadLimit = Math.min(index + 100, events.value.length)
        for (let i = index + 1; i < lookAheadLimit; i++) {
          const nextEvent = events.value[i]
          if (nextEvent && nextEvent.type === 'tool.result' && nextEvent.payload) {
            // Pair by proximity (legacy behavior)
            entry.exitCode = nextEvent.payload.exitCode
            entry.durationMs = nextEvent.payload.durationMs
            entry.status = nextEvent.payload.exitCode === 0 ? 'success' : 'error'
            break
          }
        }
      }

      commands.push(entry)
    }
  })

  // Return last 30 commands, newest first
  return commands.slice(-30).reverse()
})

// Compute git activity from git.diff events
const gitActivity = computed(() => {
  const gitEvents = events.value
    .filter(e => e.type === 'git.diff' && e.payload)
    .map(e => ({
      statusPorcelain: e.payload.statusPorcelain || '',
      diffStat: e.payload.diffStat || '',
      timestamp: e.payload.timestamp || e.ts,
      filesChanged: (e.payload.statusPorcelain || '').split('\n').filter((line: string) => line.trim()).length
    }))

  return gitEvents.length > 0 ? gitEvents[gitEvents.length - 1] : null
})

// Compute display spans with nesting levels (Part C: with cycle protection)
const displaySpans = computed(() => {
  if (spans.value.length === 0) return []

  // Apply kind filter if set
  let filteredSpans = spans.value
  if (timelineKindFilter.value) {
    filteredSpans = spans.value.filter(s => s.kind === timelineKindFilter.value)
  }

  // Build parent-child map
  const childrenMap = new Map<string, any[]>()

  for (const span of filteredSpans) {
    if (span.parentSpanId) {
      if (!childrenMap.has(span.parentSpanId)) {
        childrenMap.set(span.parentSpanId, [])
      }
      childrenMap.get(span.parentSpanId)!.push(span)
    }
  }

  // Flatten with levels
  const result: any[] = []
  const visited = new Set<string>()

  // Part C: Cycle protection - track current path to detect cycles
  const addSpanWithChildren = (span: any, level: number, pathSet: Set<string>) => {
    // Cycle detection: if span is already in current path, skip it
    if (pathSet.has(span.spanId)) {
      console.warn(`[displaySpans] Cycle detected: span ${span.spanId} is already in path`)
      return
    }

    // Duplicate detection: if span was already visited in a different branch, skip it
    if (visited.has(span.spanId)) return

    visited.add(span.spanId)

    result.push({ ...span, level })

    const children = childrenMap.get(span.spanId) || []
    // Create new path set for children (include current span)
    const newPath = new Set(pathSet)
    newPath.add(span.spanId)

    for (const child of children) {
      addSpanWithChildren(child, level + 1, newPath)
    }
  }

  // Start with root spans (no parent)
  const rootSpans = filteredSpans.filter(s => !s.parentSpanId)
  for (const span of rootSpans) {
    addSpanWithChildren(span, 0, new Set())
  }

  return result
})

// Format span duration (duration only, no usage info)
const formatSpanDuration = (span: any): string => {
  if (!span.endTs) {
    return 'running'
  }

  const durationMs = span.endTs - span.startTs
  return formatDurationMs(durationMs)
}

// Part E: Compute total usage for a span (self + descendants)
const computeTotalUsage = (spanId: string): { totalTokens: number; costUsd: number | null } => {
  const childSpanIds = new Set<string>()

  // Find all descendant spans recursively (Part C: with cycle protection)
  const collectDescendants = (currentSpanId: string, visited: Set<string>) => {
    if (visited.has(currentSpanId)) {
      // Cycle detected, stop recursion
      return
    }
    visited.add(currentSpanId)

    for (const span of spans.value) {
      if (span.parentSpanId === currentSpanId && !childSpanIds.has(span.spanId)) {
        childSpanIds.add(span.spanId)
        collectDescendants(span.spanId, visited)
      }
    }
  }

  collectDescendants(spanId, new Set([spanId]))

  // Sum up self + descendants
  let totalTokens = 0
  let totalCostUsd: number | null = null
  let hasCost = false

  // Self usage
  const selfUsage = usageData.value.bySpan[spanId]
  if (selfUsage) {
    totalTokens += selfUsage.totalTokens || 0
    if (selfUsage.costUsd !== null && selfUsage.costUsd !== undefined) {
      totalCostUsd = (totalCostUsd || 0) + selfUsage.costUsd
      hasCost = true
    }
  }

  // Descendants usage - convert Set to Array to avoid downlevelIteration issues
  const childSpanIdsArray = Array.from(childSpanIds)
  for (const childSpanId of childSpanIdsArray) {
    const childUsage = usageData.value.bySpan[childSpanId]
    if (childUsage) {
      totalTokens += childUsage.totalTokens || 0
      if (childUsage.costUsd !== null && childUsage.costUsd !== undefined) {
        totalCostUsd = (totalCostUsd || 0) + childUsage.costUsd
        hasCost = true
      }
    }
  }

  return {
    totalTokens,
    costUsd: hasCost ? totalCostUsd : null
  }
}

// Build tooltip for span row with usage metadata (Part E: show both self and total)
const buildSpanTooltip = (span: any): string => {
  const parts: string[] = []
  const selfUsage = usageData.value.bySpan[span.spanId]
  const totalUsage = computeTotalUsage(span.spanId)

  // Show auto-generated indicator if present
  if (span.attrs?.auto === true) {
    parts.push('Auto: true')
    parts.push('')
  }

  if (selfUsage) {
    // Self usage section
    parts.push('--- Self Usage ---')
    if (selfUsage.model) {
      parts.push(`Model: ${selfUsage.model}`)
    }
    if (selfUsage.inputTokens > 0) {
      parts.push(`Input: ${formatTokens(selfUsage.inputTokens)}`)
    }
    if (selfUsage.outputTokens > 0) {
      parts.push(`Output: ${formatTokens(selfUsage.outputTokens)}`)
    }
    if (selfUsage.totalTokens > 0) {
      parts.push(`Self Tokens: ${formatTokens(selfUsage.totalTokens)}`)
    }
    // Show cost only if known (not null/undefined)
    if (selfUsage.costUsd !== null && selfUsage.costUsd !== undefined) {
      parts.push(`Self Cost: ${formatUsd(selfUsage.costUsd)}`)
    }
    if (selfUsage.source) {
      parts.push(`Source: ${selfUsage.source}`)
    }
    if (selfUsage.confidence !== undefined) {
      parts.push(`Confidence: ${(selfUsage.confidence * 100).toFixed(0)}%`)
    }
  }

  // Total usage section (self + descendants)
  if (totalUsage.totalTokens > 0 || totalUsage.costUsd !== null) {
    if (parts.length > 0) parts.push('')
    parts.push('--- Total (Self + Children) ---')
    if (totalUsage.totalTokens > 0) {
      parts.push(`Total Tokens: ${formatTokens(totalUsage.totalTokens)}`)
    }
    if (totalUsage.costUsd !== null) {
      parts.push(`Total Cost: ${formatUsd(totalUsage.costUsd)}`)
    }
  }

  return parts.length > 0 ? parts.join('\n') : 'No usage data'
}

// Format span display text with optional usage summary
const formatSpanDisplay = (span: any): string => {
  const parts = [formatSpanDuration(span)]
  const usage = usageData.value.bySpan[span.spanId]

  if (usage) {
    if (usage.totalTokens > 0) {
      parts.push(`${formatTokens(usage.totalTokens)} tok`)
    }
    // Only show cost if known (not null/undefined)
    if (usage.costUsd !== null && usage.costUsd !== undefined) {
      parts.push(formatUsd(usage.costUsd))
    }
  }

  return parts.join(' • ')
}

// Handle span click (Part B: open span details panel)
const handleSpanClick = (spanId: string) => {
  selectedSpanId.value = spanId
  // Switch to span details panel
  activePanel.value = 'span-details'
}

const filterByKind = (kind: string) => {
  // Set the kind filter
  timelineKindFilter.value = kind
  // Switch to timeline panel
  activePanel.value = 'timeline'
}

// Toggle showing events within span timeframe
const showEventsInSpan = ref<boolean>(false)

// Get span by ID
const getSpanById = (spanId: string): Span | undefined => {
  return spans.value.find(s => s.spanId === spanId)
}

// Get immediate children of a span
const getSpanChildren = (spanId: string): Span[] => {
  return spans.value.filter(s => s.parentSpanId === spanId)
}

// Filter events within span timeframe (Part C: handle missing endTs gracefully)
const getEventsInSpan = (span: Span): AgentOpsEvent[] => {
  if (!span.startTs) return []

  const startTime = span.startTs
  const endTime = span.endTs || Date.now() // Part C: use current time if no endTs

  return events.value.filter(event => {
    // Part C: skip gracefully if event timestamp is missing
    if (!event.ts) return false

    try {
      const eventTime = new Date(event.ts).getTime()
      return eventTime >= startTime && eventTime <= endTime
    } catch {
      // Part C: skip if timestamp parsing fails
      return false
    }
  })
}

// Compute error count
const errorCount = computed(() => {
  return events.value.filter(e => {
    if (e.type === 'error' || e.type === 'run.error') return true
    if (e.level === 'error') return true
    if (e.type === 'tool.result' && e.payload?.exitCode !== 0) return true
    return false
  }).length
})

// Compute run stats
const runStats = computed(() => {
  const runStartEvent = events.value.find(e => e.type === 'run.started')
  const currentRun = runs.value.find(r => r.id === selectedRunId.value)
  const lastEvent = events.value[events.value.length - 1]

  const startedAt = currentRun?.startedAt || runStartEvent?.ts
  const status = currentRun?.status || 'running'
  const title = currentRun?.title || runStartEvent?.payload?.title || selectedRunId.value

  let elapsed = 0
  if (startedAt) {
    const start = new Date(startedAt).getTime()
    const end = status === 'running' ? Date.now() : new Date(lastEvent?.ts || Date.now()).getTime()
    elapsed = Math.floor((end - start) / 1000)
  }

  return {
    title,
    status,
    elapsed,
    eventCount: events.value.length,
    errorCount: errorCount.value,
    lastActivity: lastEvent?.ts || null
  }
})

const togglePause = () => {
  isPaused.value = !isPaused.value
}

const clearEvents = () => {
  events.value = []
  selectedEvent.value = null
}

const exportJSON = () => {
  const dataStr = JSON.stringify(filteredEvents.value, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'agent-ops-events.json'
  link.click()
  URL.revokeObjectURL(url)
}

const toggleAutoScroll = () => {
  autoScroll.value = !autoScroll.value
}

const toggleAgentView = () => {
  agentViewEnabled.value = !agentViewEnabled.value
  // Clear selectedEvent if it becomes hidden due to agent view filter
  if (agentViewEnabled.value && selectedEvent.value) {
    if (!agentRelevantTypes.has(selectedEvent.value.type)) {
      selectedEvent.value = null
    }
  }
}

const scrollToBottom = () => {
  if (eventListRef.value && autoScroll.value) {
    eventListRef.value.scrollTop = eventListRef.value.scrollHeight
  }
}

// localStorage helpers with safe try/catch
const safeLocalStorageGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch (error) {
    console.warn(`[localStorage] Failed to get ${key}:`, error)
    return null
  }
}

const safeLocalStorageSet = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch (error) {
    console.warn(`[localStorage] Failed to set ${key}:`, error)
  }
}

// Part A: Debounced refetch with maxWait and runId guard
let spansRefetchTimer: ReturnType<typeof setTimeout> | null = null
let usageRefetchTimer: ReturnType<typeof setTimeout> | null = null
let spansMaxWaitTimer: ReturnType<typeof setTimeout> | null = null
let usageMaxWaitTimer: ReturnType<typeof setTimeout> | null = null
let isFetchingSpans = ref<boolean>(false)
let isFetchingUsage = ref<boolean>(false)
let pendingSpansFetch = ref<boolean>(false)
let pendingUsageFetch = ref<boolean>(false)

const debouncedRefetchSpans = (eventRunId: string) => {
  // Only refetch if event belongs to currently selected run
  if (eventRunId !== selectedRunId.value) return

  // Clear existing debounce timer
  if (spansRefetchTimer) clearTimeout(spansRefetchTimer)

  // Set maxWait timer if not already set
  if (!spansMaxWaitTimer) {
    spansMaxWaitTimer = setTimeout(() => {
      spansMaxWaitTimer = null
      if (spansRefetchTimer) clearTimeout(spansRefetchTimer)
      spansRefetchTimer = null
      executeFetchSpans(eventRunId)
    }, 2000)
  }

  // Set trailing debounce timer
  spansRefetchTimer = setTimeout(() => {
    if (spansMaxWaitTimer) {
      clearTimeout(spansMaxWaitTimer)
      spansMaxWaitTimer = null
    }
    spansRefetchTimer = null
    executeFetchSpans(eventRunId)
  }, 250)
}

const executeFetchSpans = (runId: string) => {
  if (runId !== selectedRunId.value) return

  if (isFetchingSpans.value) {
    // Already fetching, mark pending
    pendingSpansFetch.value = true
    return
  }

  if (props.provider.listSpans && activePanel.value === 'timeline') {
    loadSpans(runId)
  }
}

const debouncedRefetchUsage = (eventRunId: string) => {
  // Only refetch if event belongs to currently selected run
  if (eventRunId !== selectedRunId.value) return

  // Clear existing debounce timer
  if (usageRefetchTimer) clearTimeout(usageRefetchTimer)

  // Set maxWait timer if not already set
  if (!usageMaxWaitTimer) {
    usageMaxWaitTimer = setTimeout(() => {
      usageMaxWaitTimer = null
      if (usageRefetchTimer) clearTimeout(usageRefetchTimer)
      usageRefetchTimer = null
      executeFetchUsage(eventRunId)
    }, 2000)
  }

  // Set trailing debounce timer
  usageRefetchTimer = setTimeout(() => {
    if (usageMaxWaitTimer) {
      clearTimeout(usageMaxWaitTimer)
      usageMaxWaitTimer = null
    }
    usageRefetchTimer = null
    executeFetchUsage(eventRunId)
  }, 250)
}

const executeFetchUsage = (runId: string) => {
  if (runId !== selectedRunId.value) return

  if (isFetchingUsage.value) {
    // Already fetching, mark pending
    pendingUsageFetch.value = true
    return
  }

  if (props.provider.getUsage) {
    loadUsage(runId)
  }
}

const connectStream = (runId: string) => {
  // Stop any existing stream
  if (streamControl) {
    streamControl.stop()
    streamControl = null
  }

  // Clear events and selection
  events.value = []
  selectedEvent.value = null

  // Load history events if listEvents exists
  const loadHistoryAndConnect = async () => {
    if (props.provider.listEvents) {
      try {
        const historyEvents = await props.provider.listEvents(runId)
        // Apply maxEvents cap to history
        const cappedHistory = historyEvents.slice(-props.maxEvents)
        events.value = cappedHistory
      } catch (error) {
        console.error('Failed to load event history:', error)
      }
    }

    // Load initial spans and usage if timeline panel is active
    if (activePanel.value === 'timeline') {
      if (props.provider.listSpans) {
        await loadSpans(runId)
      }
      if (props.provider.getUsage) {
        await loadUsage(runId)
      }
    }

    // Connect live stream
    streamControl = props.provider.connect({
      runId,
      intervalMs: props.intervalMs,
      onEvent: (event) => {
        // Only append events when not paused
        if (!isPaused.value) {
          events.value.push(event)
          if (events.value.length > props.maxEvents) {
            events.value.shift()
          }

          // Part A: Trigger live updates for spans and usage (with runId guard)
          if (event.type === 'span.start' || event.type === 'span.end') {
            debouncedRefetchSpans(event.runId)
          }
          if (event.type === 'usage.report') {
            debouncedRefetchUsage(event.runId)
          }

          // Auto-scroll to bottom if enabled
          setTimeout(() => scrollToBottom(), 0)
        }
      }
    })
  }

  loadHistoryAndConnect()
}

// Watch selectedRunId to reconnect stream
watch(selectedRunId, (newRunId) => {
  connectStream(newRunId)

  // Clear timeline kind filter when switching runs
  timelineKindFilter.value = null

  // If on span-details panel, switch back to timeline and clear selection
  if (activePanel.value === 'span-details') {
    activePanel.value = 'timeline'
    selectedSpanId.value = null
  }

  // Also load spans for the new run if on timeline panel
  if (activePanel.value === 'timeline') {
    loadSpans(newRunId)
  }
})

// Watch activePanel to load spans and usage when Timeline is shown
watch(activePanel, (newPanel) => {
  if (newPanel === 'timeline') {
    if (props.provider.listSpans) {
      loadSpans(selectedRunId.value)
    }
    if (props.provider.getUsage) {
      loadUsage(selectedRunId.value)
    }
  } else if (newPanel === 'summary') {
    // Load spans first if not already loaded
    if (props.provider.listSpans && spans.value.length === 0) {
      loadSpans(selectedRunId.value).then(() => {
        loadTraceSummary(selectedRunId.value)
      })
    } else {
      loadTraceSummary(selectedRunId.value)
    }
  }
})

// Load spans for a run (Part A: with in-flight tracking)
const loadSpans = async (runId: string) => {
  if (!props.provider.listSpans) return

  isFetchingSpans.value = true
  spansLoading.value = true
  try {
    spans.value = await props.provider.listSpans(runId)
    // Also load usage data
    loadUsage(runId)
  } catch (error) {
    console.error('Failed to load spans:', error)
    spans.value = []
  } finally {
    spansLoading.value = false
    isFetchingSpans.value = false

    // If pending fetch was requested, execute it now
    if (pendingSpansFetch.value) {
      pendingSpansFetch.value = false
      // Use a small delay to avoid tight loops
      setTimeout(() => {
        if (props.provider.listSpans && activePanel.value === 'timeline') {
          loadSpans(runId)
        }
      }, 100)
    }
  }
}

// Load usage data for a run (Part A: with in-flight tracking)
const loadUsage = async (runId: string) => {
  if (!props.provider.getUsage) return

  isFetchingUsage.value = true
  try {
    usageData.value = await props.provider.getUsage(runId)
  } catch (error) {
    console.error('Failed to load usage:', error)
    // Reset to empty state on error
    usageData.value = {
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: null },
      bySpan: {}
    }
  } finally {
    isFetchingUsage.value = false

    // If pending fetch was requested, execute it now
    if (pendingUsageFetch.value) {
      pendingUsageFetch.value = false
      // Use a small delay to avoid tight loops
      setTimeout(() => {
        if (props.provider.getUsage) {
          loadUsage(runId)
        }
      }, 100)
    }
  }
}

// Load trace summary for a run
const loadTraceSummary = async (runId: string) => {
  traceSummaryLoading.value = true
  try {
    // Try to fetch from server endpoint first
    if (props.provider.getTraceSummary) {
      try {
        traceSummary.value = await props.provider.getTraceSummary(runId)
        return
      } catch (error) {
        console.warn('Failed to load trace summary from server, using client-side fallback:', error)
      }
    }

    // Client-side fallback: compute from loaded spans
    if (spans.value.length === 0) {
      traceSummary.value = null
      return
    }

    const computedSummary = computeTraceSummaryFromSpans(spans.value)
    traceSummary.value = computedSummary
  } catch (error) {
    console.error('Failed to compute trace summary:', error)
    traceSummary.value = null
  } finally {
    traceSummaryLoading.value = false
  }
}

// Client-side trace summary computation (fallback)
const computeTraceSummaryFromSpans = (spansList: Span[]) => {
  if (spansList.length === 0) {
    return {
      totalDurationMs: 0,
      criticalPathMs: 0,
      slowestSpans: [],
      errorSpans: [],
      hotspotsByKind: []
    }
  }

  // Calculate total duration
  const startTimes = spansList.map(s => s.startTs).filter(t => t != null)
  const endTimes = spansList.map(s => s.endTs).filter(t => t != null)
  const minStart = Math.min(...startTimes)
  const maxEnd = endTimes.length > 0 ? Math.max(...endTimes) : Date.now()
  const totalDurationMs = Math.max(0, maxEnd - minStart)

  // Calculate critical path
  const criticalPathMs = calculateCriticalPathClient(spansList)

  // Get slowest spans (top 10 by duration)
  const spansWithDuration = spansList
    .filter(s => s.endTs != null && s.startTs != null)
    .map(s => {
      const durationMs = s.endTs! - s.startTs
      // Clamp anomalies
      if (durationMs < 0 || durationMs > 86400000) return null
      return {
        spanId: s.spanId,
        name: s.name,
        kind: s.kind,
        durationMs,
        status: s.status || 'ok'
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10)

  // Get error spans
  const errorSpans = spansList
    .filter(s => s.status === 'error')
    .map(s => ({
      spanId: s.spanId,
      name: s.name,
      kind: s.kind,
      durationMs: s.endTs && s.startTs ? s.endTs - s.startTs : null,
      status: 'error' as const
    }))

  // Compute hotspots by kind
  const kindMap = new Map<string, {
    kind: string
    totalDurationMs: number
    spanCount: number
    errorCount: number
    spanIds: string[]
  }>()

  for (const span of spansList) {
    if (!kindMap.has(span.kind)) {
      kindMap.set(span.kind, {
        kind: span.kind,
        totalDurationMs: 0,
        spanCount: 0,
        errorCount: 0,
        spanIds: []
      })
    }

    const hotspot = kindMap.get(span.kind)!
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

  // Build hotspots array with usage data
  const hotspotsByKind = Array.from(kindMap.values()).map(hotspot => {
    let totalTokens: number | undefined = undefined
    let costUsd: number | undefined = undefined

    // Sum usage for all spans of this kind
    for (const spanId of hotspot.spanIds) {
      const spanUsage = usageData.value.bySpan[spanId]
      if (spanUsage) {
        if (totalTokens === undefined) totalTokens = 0
        totalTokens += spanUsage.totalTokens || 0

        if (spanUsage.costUsd !== null && spanUsage.costUsd !== undefined) {
          if (costUsd === undefined) costUsd = 0
          costUsd += spanUsage.costUsd
        }
      }
    }

    return {
      kind: hotspot.kind,
      totalDurationMs: hotspot.totalDurationMs,
      spanCount: hotspot.spanCount,
      errorCount: hotspot.errorCount,
      ...(totalTokens !== undefined && { totalTokens }),
      ...(costUsd !== undefined && { costUsd })
    }
  })

  // Sort by total duration descending
  hotspotsByKind.sort((a, b) => b.totalDurationMs - a.totalDurationMs)

  return {
    totalDurationMs,
    criticalPathMs,
    slowestSpans: spansWithDuration,
    errorSpans,
    hotspotsByKind
  }
}

// Client-side self-time hotspots computation (fallback)
const computeHotspotsSelfTime = (spansList: Span[]) => {
  if (spansList.length === 0) return []

  // Build parent-child relationships
  const childrenMap = new Map<string, string[]>()
  const spanMap = new Map<string, Span>()

  for (const span of spansList) {
    spanMap.set(span.spanId, span)
    if (!childrenMap.has(span.spanId)) {
      childrenMap.set(span.spanId, [])
    }
    if (span.parentSpanId) {
      if (!childrenMap.has(span.parentSpanId)) {
        childrenMap.set(span.parentSpanId, [])
      }
      childrenMap.get(span.parentSpanId)!.push(span.spanId)
    }
  }

  // Group spans by kind and compute self time
  const kindMap = new Map<string, {
    kind: string
    totalSelfMs: number
    spanCount: number
    errorCount: number
    spanIds: string[]
  }>()

  for (const span of spansList) {
    if (!kindMap.has(span.kind)) {
      kindMap.set(span.kind, {
        kind: span.kind,
        totalSelfMs: 0,
        spanCount: 0,
        errorCount: 0,
        spanIds: []
      })
    }

    const hotspot = kindMap.get(span.kind)!
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

  // Build hotspots array with usage data
  const hotspots = Array.from(kindMap.values()).map(hotspot => {
    let totalTokens: number | undefined = undefined
    let costUsd: number | undefined = undefined

    // Sum usage for all spans of this kind
    for (const spanId of hotspot.spanIds) {
      const spanUsage = usageData.value.bySpan[spanId]
      if (spanUsage) {
        if (totalTokens === undefined) totalTokens = 0
        totalTokens += spanUsage.totalTokens || 0

        if (spanUsage.costUsd !== null && spanUsage.costUsd !== undefined) {
          if (costUsd === undefined) costUsd = 0
          costUsd += spanUsage.costUsd
        }
      }
    }

    return {
      kind: hotspot.kind,
      totalDurationMs: hotspot.totalSelfMs, // Use totalSelfMs as the duration field
      spanCount: hotspot.spanCount,
      errorCount: hotspot.errorCount,
      ...(totalTokens !== undefined && { totalTokens }),
      ...(costUsd !== undefined && { costUsd })
    }
  })

  // Sort by total self time descending
  hotspots.sort((a, b) => b.totalDurationMs - a.totalDurationMs)

  return hotspots
}

// Client-side critical path calculation
const calculateCriticalPathClient = (spansList: Span[]): number => {
  if (spansList.length === 0) return 0

  const spanMap = new Map<string, Span>()
  const childrenMap = new Map<string, string[]>()

  for (const span of spansList) {
    spanMap.set(span.spanId, span)
    if (!childrenMap.has(span.spanId)) {
      childrenMap.set(span.spanId, [])
    }
  }

  for (const span of spansList) {
    if (span.parentSpanId) {
      if (!childrenMap.has(span.parentSpanId)) {
        childrenMap.set(span.parentSpanId, [])
      }
      childrenMap.get(span.parentSpanId)!.push(span.spanId)
    }
  }

  const getDuration = (span: Span): number => {
    if (!span.endTs || !span.startTs) return 0
    const duration = span.endTs - span.startTs
    if (duration < 0 || duration > 86400000) return 0
    return duration
  }

  const memo = new Map<string, number>()
  const findLongestPath = (spanId: string): number => {
    if (memo.has(spanId)) return memo.get(spanId)!

    const span = spanMap.get(spanId)
    if (!span) return 0

    const selfDuration = getDuration(span)
    const children = childrenMap.get(spanId) || []

    if (children.length === 0) {
      memo.set(spanId, selfDuration)
      return selfDuration
    }

    let maxChildPath = 0
    for (const childId of children) {
      const childPath = findLongestPath(childId)
      maxChildPath = Math.max(maxChildPath, childPath)
    }

    const totalPath = selfDuration + maxChildPath
    memo.set(spanId, totalPath)
    return totalPath
  }

  const rootSpanIds = spansList
    .filter(s => !s.parentSpanId || !spanMap.has(s.parentSpanId))
    .map(s => s.spanId)

  let maxPath = 0
  for (const rootId of rootSpanIds) {
    const pathLength = findLongestPath(rootId)
    maxPath = Math.max(maxPath, pathLength)
  }

  return maxPath
}

// Persist agentViewEnabled to localStorage
watch(agentViewEnabled, (newValue) => {
  safeLocalStorageSet('agentops.agentView', newValue ? '1' : '0')
})

// Persist activePanel to localStorage
watch(activePanel, (newValue) => {
  safeLocalStorageSet('agentops.activePanel', newValue)
})

onMounted(async () => {
  // Load agentViewEnabled from localStorage
  const savedAgentView = safeLocalStorageGet('agentops.agentView')
  if (savedAgentView !== null) {
    agentViewEnabled.value = savedAgentView === '1'
  }

  // Load activePanel from localStorage
  const savedPanel = safeLocalStorageGet('agentops.activePanel')
  if (savedPanel && ['inspector', 'activity', 'timeline', 'summary', 'span-details'].includes(savedPanel)) {
    activePanel.value = savedPanel as 'inspector' | 'activity' | 'timeline' | 'summary' | 'span-details'
  }

  // Load runs if listRuns exists
  if (props.provider.listRuns) {
    runsLoading.value = true
    try {
      runs.value = await props.provider.listRuns()

      // Choose selectedRunId in order:
      // 1. If initialRunId exists in runs list, use it
      // 2. Else use the first run in the list
      // 3. Else fallback to "default"
      const initialRunExists = runs.value.some(run => run.id === props.initialRunId)
      if (initialRunExists) {
        selectedRunId.value = props.initialRunId
      } else if (runs.value.length > 0) {
        selectedRunId.value = runs.value[0].id
      } else {
        selectedRunId.value = 'default'
      }
    } catch (error) {
      console.error('Failed to load runs:', error)
      selectedRunId.value = props.initialRunId
    } finally {
      runsLoading.value = false
    }
  } else {
    // No listRuns, use initialRunId
    selectedRunId.value = props.initialRunId
  }

  // Initial connection (watch will handle it if listRuns exists)
  if (!props.provider.listRuns) {
    connectStream(selectedRunId.value)
  }
})

onUnmounted(() => {
  if (streamControl) {
    streamControl.stop()
  }
})
</script>

<style scoped>
/* Design System — CSS Variables */
.aod-shell {
  /* Neutral palette */
  --bg: #fafafa;
  --surface: #ffffff;
  --border: #e0e0e0;
  --border-light: #f5f5f5;
  --text: #1a1a1a;
  --text-secondary: #525252;
  --muted: #737373;

  /* Accent */
  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-light: #dbeafe;
  --accent-medium: #93c5fd;

  /* Status colors */
  --status-success: #10b981;
  --status-error: #ef4444;
  --status-running: #f59e0b;

  /* Badge colors */
  --badge-run-bg: #dbeafe;
  --badge-run-text: #1e40af;
  --badge-task-bg: #f3e8ff;
  --badge-task-text: #6b21a8;
  --badge-tool-bg: #dcfce7;
  --badge-tool-text: #166534;
  --badge-artifact-bg: #fef3c7;
  --badge-artifact-text: #92400e;
  --badge-error-bg: #fee2e2;
  --badge-error-text: #991b1b;
  --badge-unknown-bg: #f5f5f5;
  --badge-unknown-text: #404040;

  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'SF Mono', Monaco, 'Courier New', monospace;
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 13px;
  --text-md: 14px;
  --text-lg: 16px;
  --text-xl: 18px;

  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: var(--font-sans);
  font-size: var(--text-md);
  background: var(--bg);
  color: var(--text);
}

/* Header */
.aod-header {
  padding: 24px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.aod-title {
  font-size: var(--text-xl);
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--text);
}

.aod-subtitle {
  font-size: var(--text-sm);
  color: var(--muted);
}

/* Layout Grid */
.aod-grid {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 0;
  flex: 1;
  overflow: hidden;
}

.aod-grid-with-runs {
  grid-template-columns: 280px 1fr 400px;
}

.aod-panel {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--border);
  overflow: hidden;
}

.aod-main {
  border-right: 1px solid var(--border);
}

.aod-inspector {
  border-right: none;
}

.aod-panel-title {
  padding: 12px 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
}

/* Run Stats Strip */
.aod-run-stats {
  padding: 12px 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.aod-run-stats-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.aod-stats-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.aod-stats-status-running {
  background: #10b981;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.aod-stats-status-completed {
  background: var(--accent);
}

.aod-stats-status-error {
  background: #ef4444;
}

.aod-stats-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text);
}

.aod-stats-badge {
  font-size: var(--text-xs);
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 500;
  text-transform: uppercase;
  background: var(--border-light);
  color: var(--text-secondary);
}

.aod-run-stats-metrics {
  display: flex;
  gap: 20px;
  align-items: center;
}

.aod-stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.aod-stat-label {
  font-size: var(--text-xs);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.aod-stat-value {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text);
  font-family: var(--font-mono);
}

.aod-stat-error {
  color: #ef4444;
}

/* Filters */
.aod-filters {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.aod-search {
  width: 100%;
  height: 32px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: var(--text-base);
  font-family: var(--font-sans);
  color: var(--text);
  background: var(--surface);
}

.aod-search::placeholder {
  color: var(--muted);
}

.aod-search:focus {
  outline: none;
  border-color: var(--accent);
}

/* Toolbar */
.aod-toolbar {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  background: var(--bg);
}

/* Agent View Hint */
.aod-agent-view-hint {
  padding: 8px 16px;
  background: var(--accent-light);
  border-bottom: 1px solid var(--border);
  font-size: var(--text-sm);
  color: var(--accent-hover);
  text-align: center;
  font-weight: 500;
}

.aod-toolbar-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font-size: var(--text-sm);
  font-family: var(--font-sans);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.aod-toolbar-btn:hover {
  background: var(--bg);
  border-color: var(--text-secondary);
}

.aod-toolbar-btn-active {
  background: var(--accent-light);
  color: var(--accent-hover);
  border-color: var(--accent);
}

.aod-toolbar-btn-active:hover {
  background: var(--accent-light);
  border-color: var(--accent-hover);
}

/* Filter Chips */
.aod-filter-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.aod-chip {
  height: 28px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.aod-chip:hover {
  background: var(--bg);
  border-color: var(--text-secondary);
}

.aod-chip-active {
  background: var(--accent-light);
  color: var(--accent-hover);
  border-color: var(--accent);
}

.aod-chip-active:hover {
  background: var(--accent-light);
  border-color: var(--accent-hover);
}

.aod-count {
  font-size: var(--text-sm);
  color: var(--muted);
  align-self: flex-end;
}

/* Event List */
.aod-events {
  flex: 1;
  overflow-y: auto;
}

.aod-event-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background 0.1s;
}

.aod-event-row:hover {
  background: var(--bg);
}

.aod-event-row-selected {
  background: var(--accent-light);
  border-left: 3px solid var(--accent);
  padding-left: 13px;
}

.aod-event-time {
  font-size: var(--text-sm);
  color: var(--muted);
  font-family: var(--font-mono);
  min-width: 70px;
}

.aod-event-agent {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  font-weight: 500;
  min-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Event Type Badges — Using attribute selectors */
.aod-event-badge {
  font-size: var(--text-xs);
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 500;
  white-space: nowrap;
  min-width: 100px;
  text-align: center;
}

/* Badge colors via data-type attribute selectors */
.aod-event-row[data-type^="run."] .aod-event-badge {
  background: var(--badge-run-bg);
  color: var(--badge-run-text);
}

.aod-event-row[data-type^="task."] .aod-event-badge {
  background: var(--badge-task-bg);
  color: var(--badge-task-text);
}

.aod-event-row[data-type^="tool."] .aod-event-badge {
  background: var(--badge-tool-bg);
  color: var(--badge-tool-text);
}

.aod-event-row[data-type^="artifact."] .aod-event-badge {
  background: var(--badge-artifact-bg);
  color: var(--badge-artifact-text);
}

.aod-event-row[data-type="error"] .aod-event-badge {
  background: var(--badge-error-bg);
  color: var(--badge-error-text);
}

/* Fallback for unknown types */
.aod-event-badge {
  background: var(--badge-unknown-bg);
  color: var(--badge-unknown-text);
}

.aod-event-summary {
  flex: 1;
  font-size: var(--text-base);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Inspector Panel */
.aod-inspector-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.aod-usage-section {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 4px;
  border: 1px solid var(--border);
}

.aod-usage-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.aod-usage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}

.aod-usage-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aod-usage-label {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.aod-usage-value {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text);
  font-family: var(--font-mono);
}

.aod-json {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  background: var(--bg);
  padding: 12px;
  border-radius: 4px;
  color: var(--text);
}

.aod-muted {
  padding: 16px;
  color: var(--muted);
  font-size: var(--text-base);
  font-style: italic;
}

/* Runs Sidebar */
.aod-runs-sidebar {
  border-right: 1px solid var(--border);
}

.aod-runs-loading,
.aod-runs-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}

.aod-runs-list {
  flex: 1;
  overflow-y: auto;
}

.aod-run-row {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background 0.1s;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.aod-run-row:hover {
  background: var(--bg);
}

.aod-run-row-selected {
  background: var(--accent-light);
  border-left: 3px solid var(--accent);
  padding-left: 13px;
}

.aod-run-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.aod-run-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.aod-run-status-dot[data-status="running"] {
  background: #10b981;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.aod-run-status-dot[data-status="completed"] {
  background: var(--accent);
}

.aod-run-status-dot[data-status="error"] {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.aod-run-time {
  font-size: var(--text-xs);
  color: var(--muted);
  font-family: var(--font-mono);
}

.aod-run-title {
  font-size: var(--text-sm);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.aod-run-row-selected .aod-run-title {
  color: var(--accent-hover);
  font-weight: 500;
}

/* Panel Header with Tabs */
.aod-panel-header {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

.aod-panel-tab {
  flex: 1;
  padding: 12px 16px;
  border: none;
  background: transparent;
  font-size: var(--text-base);
  font-family: var(--font-sans);
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  border-bottom: 2px solid transparent;
}

.aod-panel-tab:hover {
  background: var(--surface);
  color: var(--text);
}

.aod-panel-tab-active {
  color: var(--accent-hover);
  border-bottom-color: var(--accent);
  background: var(--surface);
}

.aod-panel-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* Activity Sections */
.aod-activity-section {
  border-bottom: 1px solid var(--border);
}

.aod-activity-section-title {
  padding: 12px 16px;
  font-weight: 600;
  font-size: var(--text-base);
  background: var(--bg);
  color: var(--text);
  border-bottom: 1px solid var(--border-light);
}

.aod-activity-tabs {
  display: flex;
  padding: 8px 16px;
  gap: 8px;
  background: var(--surface);
  border-bottom: 1px solid var(--border-light);
}

.aod-activity-tab {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font-size: var(--text-sm);
  font-family: var(--font-sans);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.aod-activity-tab:hover {
  background: var(--bg);
  border-color: var(--text-secondary);
}

.aod-activity-tab-active {
  background: var(--accent-light);
  color: var(--accent-hover);
  border-color: var(--accent);
}

.aod-activity-list {
  max-height: 300px;
  overflow-y: auto;
}

/* File Items */
.aod-file-item {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  transition: background 0.1s;
}

.aod-file-item:hover {
  background: var(--bg);
}

.aod-file-path {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.aod-file-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.aod-file-count {
  font-size: var(--text-xs);
  padding: 2px 6px;
  border-radius: 10px;
  background: var(--accent-light);
  color: var(--accent-hover);
  font-weight: 500;
}

.aod-file-time {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--muted);
}

/* Command Items */
.aod-command-item {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background 0.1s;
}

.aod-command-item:hover {
  background: var(--bg);
}

.aod-command-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.aod-command-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.aod-command-status-success {
  background: #10b981;
}

.aod-command-status-error {
  background: #ef4444;
}

.aod-command-status-running {
  background: #f59e0b;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.aod-command-text {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.aod-command-meta {
  display: flex;
  gap: 12px;
  margin-left: 16px;
  align-items: center;
}

.aod-command-duration {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-weight: 500;
}

.aod-command-time {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--muted);
}

/* Git Section */
.aod-git-summary {
  padding: 12px 16px;
  display: flex;
  gap: 20px;
  background: var(--bg);
  border-bottom: 1px solid var(--border-light);
}

.aod-git-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aod-git-label {
  font-size: var(--text-xs);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.aod-git-value {
  font-family: var(--font-mono);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text);
}

.aod-git-diff,
.aod-git-status {
  padding: 12px 16px;
}

.aod-git-status-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}

.aod-git-code {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
  background: var(--bg);
  padding: 10px;
  border-radius: 4px;
  color: var(--text);
  border: 1px solid var(--border-light);
  max-height: 200px;
  overflow-y: auto;
}

/* Timeline Styles */
.aod-timeline-list {
  display: flex;
  flex-direction: column;
}

.aod-span-row {
  padding: 10px 8px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background 0.15s;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aod-span-row:hover {
  background: var(--bg);
}

.aod-span-row-selected {
  background: var(--accent-light);
  border-left: 3px solid var(--accent);
}

.aod-span-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.aod-span-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.aod-span-status-dot[data-status="ok"] {
  background: var(--status-success);
}

.aod-span-status-dot[data-status="error"] {
  background: var(--status-error);
}

.aod-span-status-dot[data-status="running"] {
  background: var(--status-running);
  animation: pulse 2s ease-in-out infinite;
}

.aod-span-status-dot[data-status="cancelled"] {
  background: var(--muted);
}

.aod-span-kind-badge {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.aod-span-kind-badge[data-kind="llm"] {
  background: var(--badge-task-bg);
  color: var(--badge-task-text);
}

.aod-span-kind-badge[data-kind="tool"] {
  background: var(--badge-tool-bg);
  color: var(--badge-tool-text);
}

.aod-span-kind-badge[data-kind="agent"] {
  background: var(--badge-run-bg);
  color: var(--badge-run-text);
}

.aod-span-kind-badge[data-kind="step"],
.aod-span-kind-badge[data-kind="io"],
.aod-span-kind-badge[data-kind="custom"] {
  background: var(--badge-artifact-bg);
  color: var(--badge-artifact-text);
}

.aod-span-name {
  font-size: var(--text-sm);
  color: var(--text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aod-span-duration {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-top: 2px;
}

/* Span Details Panel (Part B) */
.aod-span-details {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

.aod-span-details-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 10;
}

.aod-back-btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font-size: var(--text-sm);
  font-family: var(--font-sans);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.aod-back-btn:hover {
  background: var(--bg);
  border-color: var(--accent);
  color: var(--accent);
}

.aod-span-details-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text);
}

.aod-details-section {
  padding: 16px;
  border-bottom: 1px solid var(--border-light);
}

.aod-details-section-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.aod-details-section-title-with-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.aod-hotspot-mode-toggle {
  display: flex;
  gap: 4px;
  background: var(--bg-alt);
  border-radius: 6px;
  padding: 2px;
}

.aod-toggle-btn {
  padding: 4px 10px;
  font-size: var(--text-xs);
  color: var(--muted);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.aod-toggle-btn:hover {
  color: var(--text);
  background: var(--bg-hover);
}

.aod-toggle-btn.active {
  color: var(--text);
  background: var(--bg);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.aod-anomaly-warning {
  background: rgba(255, 200, 100, 0.1);
  border: 1px solid rgba(255, 200, 100, 0.3);
  border-radius: 6px;
  padding: 12px;
}

.aod-anomaly-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}

.aod-anomaly-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.aod-anomaly-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: var(--text-xs);
  color: var(--text);
}

.aod-anomaly-count {
  font-weight: 600;
  color: rgb(200, 120, 0);
  min-width: 20px;
}

.aod-anomaly-desc {
  color: var(--muted);
}

.aod-details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.aod-details-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aod-details-label {
  font-size: var(--text-xs);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.aod-details-value {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 6px;
}

.aod-children-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aod-child-span-row {
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--surface);
}

.aod-child-span-row:hover {
  background: var(--bg);
  border-color: var(--accent);
}

.aod-child-span-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.aod-child-span-name {
  font-size: var(--text-sm);
  color: var(--text);
  font-weight: 500;
}

.aod-child-span-duration {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.aod-toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--text);
  font-weight: 500;
}

.aod-toggle-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.aod-events-in-span-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border-light);
  border-radius: 6px;
}

.aod-event-in-span-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background 0.1s;
}

.aod-event-in-span-row:last-child {
  border-bottom: none;
}

.aod-event-in-span-row:hover {
  background: var(--bg);
}

.aod-event-in-span-row .aod-event-time {
  font-size: var(--text-xs);
  color: var(--muted);
  font-family: var(--font-mono);
  min-width: 70px;
}

.aod-event-in-span-row .aod-event-badge {
  font-size: var(--text-xs);
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
  white-space: nowrap;
  min-width: 90px;
  text-align: center;
}

.aod-event-in-span-row .aod-event-summary {
  flex: 1;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Summary Panel Styles */
.aod-summary-content {
  height: 100%;
  overflow-y: auto;
}

.aod-summary-spans-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aod-summary-span-row {
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--surface);
}

.aod-summary-span-row:hover {
  background: var(--bg);
  border-color: var(--accent);
}

.aod-summary-span-row[data-span-status="error"] {
  border-color: var(--error);
  background: rgba(239, 68, 68, 0.05);
}

.aod-summary-span-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.aod-summary-span-name {
  font-size: var(--text-sm);
  color: var(--text);
  font-weight: 500;
}

.aod-summary-span-duration {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
</style>
