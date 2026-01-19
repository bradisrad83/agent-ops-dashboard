import type { AgentOpsEvent } from '../types/events'

export type RunSummary = {
  id: string
  startedAt: string // ISO-8601
  title?: string
  status?: 'running' | 'completed' | 'error'
}

export interface EventStreamOptions {
  runId?: string
  onEvent: (event: AgentOpsEvent) => void
  intervalMs?: number
}

export interface EventStreamControl {
  stop: () => void
}

export interface EventStreamProvider {
  connect: (options: EventStreamOptions) => EventStreamControl

  // Optional "history + runs" APIs (backwards compatible)
  listRuns?: () => Promise<RunSummary[]>
  listEvents?: (runId: string) => Promise<AgentOpsEvent[]>
}
