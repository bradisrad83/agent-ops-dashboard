<template>
  <div class="aod-shell">
    <div class="aod-header">
      <div class="aod-title">Agent Ops Dashboard</div>
      <div class="aod-subtitle">v0.1 — event-driven UI</div>
    </div>

    <div class="aod-grid">
      <main class="aod-panel aod-main">
        <div class="aod-panel-title">Event Stream</div>

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

        <div class="aod-events">
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
        <div class="aod-panel-title">Inspector</div>
        <div v-if="selectedEvent" class="aod-inspector-content">
          <pre class="aod-json">{{ JSON.stringify(selectedEvent, null, 2) }}</pre>
        </div>
        <div v-else class="aod-muted">Select an event to inspect</div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { AgentOpsEvent, EventType } from '../types/events'
import type { EventStreamControl, EventStreamProvider } from '../client/provider'
import { mockProvider } from '../client/mockProvider'

interface Props {
  provider?: EventStreamProvider
  runId?: string
  intervalMs?: number
  maxEvents?: number
}

const props = withDefaults(defineProps<Props>(), {
  provider: () => mockProvider,
  intervalMs: 1000,
  maxEvents: 100
})

const events = ref<AgentOpsEvent[]>([])
const selectedEvent = ref<AgentOpsEvent | null>(null)
const searchQuery = ref<string>('')
const selectedTypePrefix = ref<string>('all')

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

onMounted(() => {
  streamControl = props.provider.connect({
    runId: props.runId,
    intervalMs: props.intervalMs,
    onEvent: (event) => {
      events.value.push(event)
      if (events.value.length > props.maxEvents) {
        events.value.shift()
      }
    }
  })
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
</style>
