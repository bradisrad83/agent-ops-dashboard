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

interface AgentOpsEvent {
  id: string
  ts: number
  runId: string
  agentId: string
  type: 'run.started' | 'task.progress' | 'tool.called' | 'tool.result' | 'artifact.produced' | 'run.completed' | 'error'
  payload: Record<string, any>
}

const events = ref<AgentOpsEvent[]>([])
const selectedAgent = ref<string>('all')
const selectedType = ref<string>('all')

let intervalId: number | null = null
let eventCounter = 0

const agents = ['orchestrator', 'agent-alpha', 'agent-beta']
const eventTypes: AgentOpsEvent['type'][] = ['run.started', 'task.progress', 'tool.called', 'tool.result', 'artifact.produced', 'run.completed', 'error']

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

function generateEvent(): AgentOpsEvent {
  const agentId = agents[Math.floor(Math.random() * agents.length)]
  const type = eventTypes[Math.floor(Math.random() * eventTypes.length)]
  const runId = `run-${Math.floor(eventCounter / 10)}`

  const payloads: Record<AgentOpsEvent['type'], Record<string, any>> = {
    'run.started': { task: 'Processing request' },
    'task.progress': { step: Math.floor(Math.random() * 5) + 1, description: 'Executing step' },
    'tool.called': { tool: ['search', 'calculate', 'fetch'][Math.floor(Math.random() * 3)], args: {} },
    'tool.result': { result: 'success', data: { value: Math.random() * 100 } },
    'artifact.produced': { artifactId: `artifact-${Math.floor(Math.random() * 1000)}`, type: 'output' },
    'run.completed': { status: 'success', duration: Math.random() * 1000 },
    'error': { message: 'Simulated error', code: 'ERR_SIM' }
  }

  return {
    id: `evt-${++eventCounter}`,
    ts: Date.now(),
    runId,
    agentId,
    type,
    payload: payloads[type]
  }
}

function startEventStream() {
  intervalId = window.setInterval(() => {
    events.value.push(generateEvent())
    if (events.value.length > 100) {
      events.value.shift()
    }
  }, 1000)
}

onMounted(() => {
  startEventStream()
})

onUnmounted(() => {
  if (intervalId !== null) {
    clearInterval(intervalId)
  }
})
</script>
