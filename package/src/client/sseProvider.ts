import type { EventStreamProvider, EventStreamOptions, EventStreamControl } from './provider'
import type { AgentOpsEvent } from '../types/events'

export interface SSEProviderConfig {
  baseUrl?: string
}

export function createSSEProvider(config: SSEProviderConfig = {}): EventStreamProvider {
  const baseUrl = config.baseUrl ?? ''

  return {
    connect: (options: EventStreamOptions): EventStreamControl => {
      const { runId = 'default', onEvent } = options
      const url = `${baseUrl}/runs/${runId}/stream`

      const eventSource = new EventSource(url)

      eventSource.addEventListener('message', (event) => {
        try {
          const agentEvent: AgentOpsEvent = JSON.parse(event.data)
          onEvent(agentEvent)
        } catch (err) {
          console.warn('[sseProvider] Failed to parse event:', err)

          // Emit an error event if parsing fails
          const errorEvent: AgentOpsEvent = {
            id: `error-${Date.now()}`,
            ts: new Date().toISOString(),
            runId,
            type: 'error',
            payload: {
              message: 'Failed to parse SSE message',
              error: err instanceof Error ? err.message : String(err),
              rawData: event.data
            }
          }
          onEvent(errorEvent)
        }
      })

      eventSource.addEventListener('error', (err) => {
        console.warn('[sseProvider] EventSource error:', err)

        // Emit an error event when connection fails
        const errorEvent: AgentOpsEvent = {
          id: `error-${Date.now()}`,
          ts: new Date().toISOString(),
          runId,
          type: 'error',
          payload: {
            message: 'SSE connection error',
            readyState: eventSource.readyState
          }
        }
        onEvent(errorEvent)
      })

      return {
        stop: () => {
          eventSource.close()
        }
      }
    }
  }
}

export const sseProvider = createSSEProvider()
