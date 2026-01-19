export type AgentId =
  | "orchestrator"
  | "agent-alpha"
  | "agent-beta"
  | (string & {});

export type EventType =
  | "run.started"
  | "task.progress"
  | "tool.called"
  | "tool.result"
  | "artifact.produced"
  | "run.completed"
  | "error";

export type EventLevel = "debug" | "info" | "warn" | "error";

export interface AgentOpsEvent {
  id: string;
  ts: string; // ISO-8601
  runId: string;
  agentId?: AgentId; // optional
  taskId?: string;
  type: EventType;
  level?: EventLevel;
  payload: Record<string, any>;
}
