import type { EventStreamProvider, EventStreamOptions, EventStreamControl } from './provider'
import { createMockEventStream } from './mockStream'

export const mockProvider: EventStreamProvider = {
  connect: (options: EventStreamOptions): EventStreamControl => {
    return createMockEventStream(options)
  }
}
