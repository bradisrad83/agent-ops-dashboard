import type { EventStreamProvider, EventStreamOptions, EventStreamControl, RunSummary } from './provider'
import type { AgentOpsEvent } from '../types/events'
import { createMockEventStream } from './mockStream'

export const mockProvider: EventStreamProvider = {
  connect: (options: EventStreamOptions): EventStreamControl => {
    return createMockEventStream(options)
  },

  listRuns: async (): Promise<RunSummary[]> => {
    const now = Date.now()
    const statuses: Array<"running" | "completed" | "error"> = ["running", "completed", "error"]
    const titles = [
      "Analyze customer feedback patterns",
      "Generate monthly sales report",
      "Process invoice batch #4892",
      "Train sentiment analysis model",
      "Optimize database queries",
      "Generate API documentation",
      "Migrate user data to new schema",
      "Run integration test suite",
      "Deploy to production environment",
      "Backup critical system data"
    ]

    return Array.from({ length: 10 }, (_, i) => {
      const id = "run-" + String(1000 + i)
      const minutesAgo = i * 15 + Math.floor(Math.random() * 10)
      const startedAt = new Date(now - minutesAgo * 60 * 1000).toISOString()
      const status = i === 0 ? "running" : statuses[Math.floor(Math.random() * statuses.length)]
      const title = titles[i]

      return { id, startedAt, status, title }
    })
  },

  listEvents: async (runId: string): Promise<AgentOpsEvent[]> => {
    const eventCount = 30 + Math.floor(Math.random() * 51)
    const now = Date.now()
    const baseTime = now - 3600000

    const eventTypes = [
      'run.started',
      'run.completed',
      'task.progress',
      'tool.called',
      'tool.result',
      'artifact.produced',
      'error'
    ]

    const agentIds = ['orchestrator', 'agent-alpha', 'agent-beta']

    return Array.from({ length: eventCount }, (_, i) => {
      const ts = new Date(baseTime + (i * (3600000 / eventCount))).toISOString()
      const type = eventTypes[Math.floor(Math.random() * eventTypes.length)] as any
      const agentId = agentIds[Math.floor(Math.random() * agentIds.length)]
      const level = type === 'error' ? 'error' : (Math.random() > 0.8 ? 'warn' : 'info')

      let payload: Record<string, unknown> = {}

      if (type.startsWith('run.')) {
        payload = { message: "Run " + type.split('.')[1] + " for " + runId }
      } else if (type.startsWith('task.')) {
        payload = {
          message: "Task " + i + ": Processing data",
          status: type.split('.')[1],
          progress: type === 'task.progress' ? Math.floor((i / eventCount) * 100) : undefined
        }
      } else if (type.startsWith('tool.')) {
        payload = {
          toolName: ['ReadFile', 'WriteFile', 'ExecuteCommand', 'Search'][i % 4],
          message: "Tool " + type.split('.')[1]
        }
      } else if (type.startsWith('artifact.')) {
        payload = {
          description: "Artifact " + i + ": Generated output",
          artifactId: "artifact-" + i
        }
      } else if (type === 'error') {
        payload = {
          error: 'Simulated error',
          message: 'Something went wrong during processing',
          code: "ERR_" + Math.floor(Math.random() * 100)
        }
      }

      return {
        id: "event-" + runId + "-" + String(i + 1).padStart(4, '0'),
        ts,
        runId,
        agentId,
        type,
        level,
        payload
      } as AgentOpsEvent
    })
  }
}
