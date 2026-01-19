import type { EventStreamProvider, EventStreamOptions, EventStreamControl, RunSummary } from '../client/provider'
import type { AgentOpsEvent } from '../types/events'

export interface ApiProviderConfig {
  baseUrl?: string
  fetchImpl?: typeof fetch
  apiKey?: string
}

export function createApiProvider(config: ApiProviderConfig = {}): EventStreamProvider {
  const baseUrl = config.baseUrl ?? 'http://localhost:8787'
  const fetchImpl = config.fetchImpl ?? fetch
  const apiKey = config.apiKey

  // Helper: get headers with optional API key
  function getHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      ...additionalHeaders
    }
    if (apiKey) {
      headers['x-api-key'] = apiKey
    }
    return headers
  }

  // Helper: safe fetch with error handling
  async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
    const mergedOptions = {
      ...options,
      headers: getHeaders(options?.headers as Record<string, string>)
    }
    const response = await fetchImpl(url, mergedOptions)
    if (!response.ok) {
      let errorText = ''
      try {
        errorText = await response.text()
        errorText = errorText.substring(0, 200) // Snippet only
      } catch {
        // Ignore read errors
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}${errorText ? ' - ' + errorText : ''}`)
    }
    return response
  }

  return {
    listRuns: async (): Promise<RunSummary[]> => {
      const response = await safeFetch(`${baseUrl}/api/runs`)
      return response.json()
    },

    listEvents: async (runId: string): Promise<AgentOpsEvent[]> => {
      const response = await safeFetch(`${baseUrl}/api/runs/${runId}/events?limit=500`)
      return response.json()
    },

    connect: (options: EventStreamOptions): EventStreamControl => {
      const { runId = 'default', onEvent, intervalMs = 1000 } = options
      const sseUrl = `${baseUrl}/api/runs/${runId}/stream`

      let stopped = false
      let abortController = new AbortController()
      let lastCursor: string | number = 0
      let sseActive = false
      let pollingInterval: ReturnType<typeof setInterval> | null = null

      // Helper: check if event should be emitted (no duplicates)
      const shouldEmit = (eventId: string | number): boolean => {
        const numId = typeof eventId === 'number' ? eventId : parseInt(String(eventId), 10)
        const lastNum = typeof lastCursor === 'number' ? lastCursor : parseInt(String(lastCursor), 10)

        if (isNaN(numId)) return true // Can't compare, emit it
        if (isNaN(lastNum)) return true

        return numId > lastNum
      }

      // Helper: update cursor from event
      const updateCursor = (eventId: string | number) => {
        const numId = typeof eventId === 'number' ? eventId : parseInt(String(eventId), 10)
        const lastNum = typeof lastCursor === 'number' ? lastCursor : parseInt(String(lastCursor), 10)

        if (!isNaN(numId) && (isNaN(lastNum) || numId > lastNum)) {
          lastCursor = numId
        }
      }

      // SSE implementation with robust parsing
      const trySSE = async () => {
        try {
          const response = await fetchImpl(sseUrl, {
            signal: abortController.signal,
            headers: getHeaders({ 'Accept': 'text/event-stream' })
          })

          if (!response.ok) {
            console.warn(`[ApiProvider] SSE failed with status ${response.status}, falling back to polling`)
            startPolling()
            return
          }

          if (!response.body) {
            console.warn('[ApiProvider] No response body, falling back to polling')
            startPolling()
            return
          }

          sseActive = true

          // Parse SSE stream
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          while (!stopped) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            // Process complete events (separated by blank lines)
            let eventBoundary: number
            while ((eventBoundary = buffer.indexOf('\n\n')) !== -1) {
              const eventBlock = buffer.substring(0, eventBoundary)
              buffer = buffer.substring(eventBoundary + 2)

              if (stopped) break

              // Parse SSE event fields
              const lines = eventBlock.split(/\r?\n/)
              let eventId: string | null = null
              const dataLines: string[] = []

              for (const line of lines) {
                if (line.startsWith(':')) {
                  // Comment/heartbeat - ignore
                  continue
                } else if (line.startsWith('id:')) {
                  eventId = line.substring(3).trim()
                } else if (line.startsWith('event:')) {
                  // Event type field - could be used for filtering, currently ignored
                  continue
                } else if (line.startsWith('data:')) {
                  dataLines.push(line.substring(5).trim())
                } else if (line === '') {
                  // Blank line within event block (shouldn't happen, but handle it)
                  continue
                }
              }

              // Join multi-line data with newlines per SSE spec
              if (dataLines.length > 0) {
                const dataStr = dataLines.join('\n')

                try {
                  // Try to parse as JSON
                  const event: AgentOpsEvent = JSON.parse(dataStr)

                  // Use SSE id field if present, otherwise event.id
                  const cursorId = eventId || event.id

                  if (shouldEmit(cursorId)) {
                    onEvent(event)
                    updateCursor(cursorId)
                  }
                } catch (err) {
                  console.warn('[ApiProvider] Failed to parse SSE event data:', err, dataStr.substring(0, 100))
                }
              }
            }
          }

          sseActive = false
        } catch (err: any) {
          sseActive = false

          if (err.name === 'AbortError' || stopped) {
            return
          }

          console.warn('[ApiProvider] SSE error, falling back to polling:', err.message)

          if (!stopped) {
            startPolling()
          }
        }
      }

      // Polling fallback with backoff
      const startPolling = () => {
        if (pollingInterval || stopped || sseActive) return

        const poll = async () => {
          if (stopped || sseActive) return

          try {
            const url = `${baseUrl}/api/runs/${runId}/events?after=${lastCursor}&limit=100`
            const response = await fetchImpl(url, {
              headers: getHeaders()
            })

            if (!response.ok) {
              console.warn(`[ApiProvider] Polling failed: ${response.status}`)
              // Simple backoff: just wait for next interval
              return
            }

            const events: AgentOpsEvent[] = await response.json()

            for (const event of events) {
              if (stopped || sseActive) break

              if (shouldEmit(event.id)) {
                onEvent(event)
                updateCursor(event.id)
              }
            }
          } catch (err: any) {
            if (!stopped && !sseActive) {
              console.warn('[ApiProvider] Polling error:', err.message || err)
              // Backoff: wait one interval before retry
            }
          }
        }

        // Initial poll
        poll()

        // Set up interval
        pollingInterval = setInterval(poll, intervalMs)
      }

      // Start with SSE
      trySSE()

      return {
        stop: () => {
          stopped = true
          abortController.abort()

          if (pollingInterval) {
            clearInterval(pollingInterval)
            pollingInterval = null
          }
        }
      }
    }
  }
}

export const apiProvider = createApiProvider()
