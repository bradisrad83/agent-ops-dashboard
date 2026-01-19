import type { AgentOpsEvent } from '../types/events'

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
}
