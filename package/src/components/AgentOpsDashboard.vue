<template>
  <div class="aod-shell">
    <div class="aod-header">
      <div class="aod-title">Agent Ops Dashboard</div>
      <div class="aod-subtitle">v0.1 — event-driven UI</div>
    </div>

    <div class="aod-grid">
      <aside class="aod-panel">
        <div class="aod-panel-title">Agents</div>
        <div class="aod-muted">Coming next</div>
      </aside>

      <main class="aod-panel">
        <div class="aod-panel-title">Event Stream</div>

        <div class="aod-filters">
          <label>
            Agent:
            <select v-model="selectedAgent" class="aod-select">
              <option v-for="agent in agentList" :key="agent" :value="agent">
                {{ agent }}
              </option>
            </select>
          </label>

          <label>
            Type:
            <select v-model="selectedType" class="aod-select">
              <option v-for="type in typeList" :key="type" :value="type">
                {{ type }}
              </option>
            </select>
          </label>

          <span class="aod-count">{{ filteredEvents.length }} events</span>
        </div>

        <div class="aod-events">
          <div
            v-for="event in filteredEvents"
            :key="event.id"
            class="aod-event"
            :data-type="event.type"
          >
            <div class="aod-event-header">
              <span class="aod-event-id">{{ event.id }}</span>
              <span class="aod-event-agent">{{ event.agentId }}</span>
              <span class="aod-event-type">{{ event.type }}</span>
              <span class="aod-event-time">{{ new Date(event.ts).toLocaleTimeString() }}</span>
            </div>
            <div class="aod-event-meta">
              <span class="aod-event-run">Run: {{ event.runId }}</span>
            </div>
            <div class="aod-event-payload">
              {{ JSON.stringify(event.payload, null, 2) }}
            </div>
          </div>
        </div>
      </main>

      <aside class="aod-panel">
        <div class="aod-panel-title">Inspector</div>
        <div class="aod-muted">Coming next</div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { AgentOpsEvent, EventType } from '../types/events'
import { createMockEventStream, type MockClientControl } from '../client/mockClient'

const events = ref<AgentOpsEvent[]>([])
const selectedAgent = ref<string>('all')
const selectedType = ref<string>('all')

let mockClient: MockClientControl | null = null

const eventTypes: EventType[] = [
  'run.started',
  'task.progress',
  'tool.called',
  'tool.result',
  'artifact.produced',
  'run.completed',
  'error'
]

const agentList = computed(() => {
  const unique = new Set(events.value.map(e => e.agentId))
  return ['all', ...Array.from(unique)]
})

const typeList = computed(() => ['all', ...eventTypes])

const filteredEvents = computed(() => {
  return events.value.filter(event => {
    const agentMatch = selectedAgent.value === 'all' || event.agentId === selectedAgent.value
    const typeMatch = selectedType.value === 'all' || event.type === selectedType.value
    return agentMatch && typeMatch
  })
})

onMounted(() => {
  mockClient = createMockEventStream({
    onEvent: (event) => {
      events.value.push(event)
      if (events.value.length > 100) {
        events.value.shift()
      }
    },
    intervalMs: 1000
  })
})

onUnmounted(() => {
  if (mockClient) {
    mockClient.stop()
  }
})
</script>
