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

          <span class="aod-count">{{ filteredEvents.length }} events</span>
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
        </div>

        <div class="aod-events" ref="eventListRef">
          <div
            v-for="event in filteredEvents"
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
        </div>

        <!-- Inspector View -->
        <div v-if="activePanel === 'inspector'" class="aod-panel-content">
          <div v-if="selectedEvent" class="aod-inspector-content">
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
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { AgentOpsEvent, EventType } from '../types/events'
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

// Run selection state
const runs = ref<RunSummary[]>([])
const runsLoading = ref<boolean>(false)
const selectedRunId = ref<string>(props.initialRunId)

// Activity panel state
const activePanel = ref<'inspector' | 'activity'>('inspector')
const activeFileTab = ref<'created' | 'modified' | 'deleted'>('created')

let streamControl: EventStreamControl | null = null

const typePrefixes = ['all', 'run.*', 'task.*', 'tool.*', 'artifact.*', 'error']

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

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  const millis = ms % 1000
  if (seconds < 60) return `${seconds}.${Math.floor(millis / 100)}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}m ${secs}s`
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

// Compute file activity from fs.changed and fs.batch events
const fileActivity = computed(() => {
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

const scrollToBottom = () => {
  if (eventListRef.value && autoScroll.value) {
    eventListRef.value.scrollTop = eventListRef.value.scrollHeight
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
})

onMounted(async () => {
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
</style>
