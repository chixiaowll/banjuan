import { EventEmitter } from 'node:events'
import type { BanjuanEventMap, BanjuanEvent } from '../types.js'

export class EventBus {
  private emitter = new EventEmitter()

  emit<E extends BanjuanEvent>(event: E, data: BanjuanEventMap[E]): void {
    this.emitter.emit(event, data)
  }

  on<E extends BanjuanEvent>(event: E, handler: (data: BanjuanEventMap[E]) => void): void {
    this.emitter.on(event, handler)
  }

  off<E extends BanjuanEvent>(event: E, handler: (data: BanjuanEventMap[E]) => void): void {
    this.emitter.off(event, handler)
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners()
  }
}
