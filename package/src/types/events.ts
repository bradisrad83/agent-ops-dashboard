export type AgentId = string

export type EventType =
  | 'run.started'
  | 'task.progress'
  | 'tool.called'
  | 'tool.result'
  | 'artifact.produced'
  | 'run.completed'
  | 'error'

export type EventLevel = 'debug' | 'info' | 'warn' | 'error'

export interface AgentOpsEvent {
  id: string
  ts: number
  runId: string
  agentId: AgentId
  type: EventType
  payload: Record<string, any>
}
