export type AgentId =
  | "orchestrator"
  | "agent-alpha"
  | "agent-beta"
  | (string & {});

export type EventType =
  | "run.started"
  | "run.completed"
  | "run.error"
  | "task.progress"
  | "tool.called"
  | "tool.result"
  | "artifact.produced"
  | "fs.changed"
  | "fs.batch"
  | "git.diff"
  | "watch.warning"
  | "session.started"
  | "session.stopped"
  | "note"
  | "llm.prompt"
  | "llm.response"
  | "vscode.log"
  | "vscode.error"
  | "vscode.detected"
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
