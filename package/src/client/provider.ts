import type { AgentOpsEvent, Span } from '../types/events'

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

export interface UsageReport {
  totals: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    costUsd: number
  }
  bySpan: Record<string, {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    costUsd: number
    model?: string
  }>
}

export interface TraceSummarySpan {
  spanId: string
  name: string
  kind: string
  durationMs: number
  status: string
}

export interface HotspotByKind {
  kind: string
  totalDurationMs: number
  spanCount: number
  errorCount: number
  totalTokens?: number
  costUsd?: number
}

export interface HotspotByKindSelf {
  kind: string
  totalSelfMs: number
  spanCount: number
  errorCount: number
  totalTokens?: number
  costUsd?: number
}

export interface TraceSummary {
  totalDurationMs: number
  criticalPathMs: number
  slowestSpans: TraceSummarySpan[]
  errorSpans: TraceSummarySpan[]
  hotspotsByKind: HotspotByKind[]
  hotspotsByKindSelf?: HotspotByKindSelf[]
  anomalyCounts?: {
    durationAnomalies?: number
    selfTimeClampedSpans?: number
  }
}

export interface EventStreamProvider {
  connect: (options: EventStreamOptions) => EventStreamControl

  // Optional "history + runs" APIs (backwards compatible)
  listRuns?: () => Promise<RunSummary[]>
  listEvents?: (runId: string) => Promise<AgentOpsEvent[]>
  listSpans?: (runId: string) => Promise<Span[]>
  getUsage?: (runId: string) => Promise<UsageReport>
  getTraceSummary?: (runId: string) => Promise<TraceSummary>
}
