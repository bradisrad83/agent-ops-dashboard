import type { AgentOpsEvent, EventType } from '../types/events'

export interface MockStreamOptions {
  onEvent: (event: AgentOpsEvent) => void
  intervalMs?: number
  runId?: string
}

export interface MockStreamControl {
  stop: () => void
}

const agents = ['orchestrator', 'agent-alpha', 'agent-beta']
const eventTypes: EventType[] = [
  'run.started',
  'run.completed',
  'run.error',
  'task.progress',
  'tool.called',
  'tool.result',
  'artifact.produced',
  'fs.changed',
  'git.diff',
  'error'
]

export function createMockEventStream(options: MockStreamOptions): MockStreamControl {
  const {
    onEvent,
    intervalMs = 1000,
    runId
  } = options

  let eventCounter = 0
  let intervalId: number | null = null

  function generateEvent(): AgentOpsEvent {
    const agentId = agents[Math.floor(Math.random() * agents.length)]
    const type = eventTypes[Math.floor(Math.random() * eventTypes.length)]
    const currentRunId = runId ?? `run-${Math.floor(eventCounter / 10)}`

    const payloads: Record<EventType, Record<string, any>> = {
      'run.started': { task: 'Processing request', title: 'Mock Run', cwd: '/workspace', hostname: 'localhost', user: 'dev', platform: 'darwin', pid: 12345 },
      'run.completed': { status: 'success', duration: Math.random() * 1000, reason: 'Completed successfully' },
      'run.error': { error: 'Simulated run error', command: 'npm test', exitCode: 1 },
      'task.progress': { step: Math.floor(Math.random() * 5) + 1, description: 'Executing step' },
      'tool.called': { toolName: 'exec', command: ['npm test', 'npm run build', 'git status'][Math.floor(Math.random() * 3)], cwd: '/workspace', timestamp: new Date().toISOString() },
      'tool.result': { toolName: 'exec', exitCode: Math.random() > 0.8 ? 1 : 0, durationMs: Math.floor(Math.random() * 5000), stdoutSnippet: 'Command output...', stderrSnippet: '', timestamp: new Date().toISOString() },
      'artifact.produced': { artifactId: `artifact-${Math.floor(Math.random() * 1000)}`, type: 'output' },
      'fs.changed': { file: ['src/App.vue', 'src/main.ts', 'package.json', 'README.md'][Math.floor(Math.random() * 4)], kind: ['created', 'modified', 'deleted'][Math.floor(Math.random() * 3)], timestamp: new Date().toISOString() },
      'git.diff': { statusPorcelain: ' M src/App.vue\n M src/main.ts\n?? new-file.ts', diffStat: 'src/App.vue | 12 ++++++------\nsrc/main.ts | 5 +++++\n2 files changed, 11 insertions(+), 6 deletions(-)', timestamp: new Date().toISOString() },
      'error': { message: 'Simulated error', code: 'ERR_SIM' }
    }

    return {
      id: `evt-${++eventCounter}`,
      ts: new Date().toISOString(),
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
    const event = generateEvent()
    onEvent(event)
  }, intervalMs)

  return { stop }
}
