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
  | "fs.summary"
  | "git.diff"
  | "git.summary"
  | "watch.warning"
  | "collector.notice"
  | "session.started"
  | "session.stopped"
  | "note"
  | "llm.prompt"
  | "llm.response"
  | "vscode.log"
  | "vscode.error"
  | "vscode.detected"
  | "agent.stdout"
  | "agent.stderr"
  | "agent.exit"
  | "agent.started"
  | "span.start"
  | "span.end"
  | "span.event"
  | "usage.report"
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

export type SpanKind = "llm" | "tool" | "agent" | "step" | "io" | "custom";
export type SpanStatus = "ok" | "error" | "cancelled";

export interface SpanStartPayload {
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  ts?: number;
  attrs?: Record<string, any>;
}

export interface SpanEndPayload {
  spanId: string;
  ts?: number;
  status?: SpanStatus;
  attrs?: Record<string, any>;
}

export interface SpanEventPayload {
  spanId: string;
  name: string;
  ts?: number;
  attrs?: Record<string, any>;
}

export interface Span {
  spanId: string;
  runId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTs: number;
  endTs?: number;
  status?: SpanStatus;
  attrs?: Record<string, any>;
}

export interface UsageReportPayload {
  reportId?: string; // uuid for idempotency
  spanId?: string;
  runId?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  ts?: number;
  attrs?: Record<string, any>;
  source?: "metadata" | "json" | "regex" | "manual";
  confidence?: number; // 0..1
}
