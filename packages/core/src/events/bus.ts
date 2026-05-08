import type { BanjuanEventMap, BanjuanEvent } from '../types.js'

export class EventBus {
  private listeners = new Map<string, Set<Function>>()

  emit<E extends BanjuanEvent>(event: E, data: BanjuanEventMap[E]): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      for (const handler of handlers) handler(data)
    }
  }

  on<E extends BanjuanEvent>(event: E, handler: (data: BanjuanEventMap[E]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
  }

  off<E extends BanjuanEvent>(event: E, handler: (data: BanjuanEventMap[E]) => void): void {
    this.listeners.get(event)?.delete(handler)
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }
}
