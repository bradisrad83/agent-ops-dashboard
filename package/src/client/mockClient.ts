import type { AgentOpsEvent, EventType } from '../types/events'

export interface MockClientOptions {
  onEvent: (event: AgentOpsEvent) => void
  intervalMs?: number
  runId?: string
  maxEvents?: number
}

export interface MockClientControl {
  stop: () => void
}

const agents = ['orchestrator', 'agent-alpha', 'agent-beta']
const eventTypes: EventType[] = [
  'run.started',
  'task.progress',
  'tool.called',
  'tool.result',
  'artifact.produced',
  'run.completed',
  'error'
]

export function createMockEventStream(options: MockClientOptions): MockClientControl {
  const {
    onEvent,
    intervalMs = 1000,
    runId,
    maxEvents
  } = options

  let eventCounter = 0
  let intervalId: number | null = null

  function generateEvent(): AgentOpsEvent {
    const agentId = agents[Math.floor(Math.random() * agents.length)]
    const type = eventTypes[Math.floor(Math.random() * eventTypes.length)]
    const currentRunId = runId ?? `run-${Math.floor(eventCounter / 10)}`

    const payloads: Record<EventType, Record<string, any>> = {
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
      runId: currentRunId,
      agentId,
      type,
      payload: payloads[type]
    }
  }

  function stop() {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  intervalId = window.setInterval(() => {
    if (maxEvents !== undefined && eventCounter >= maxEvents) {
      stop()
      return
    }

    const event = generateEvent()
    onEvent(event)
  }, intervalMs)

  return { stop }
}
