import type { EventBus } from '../events/bus.js'
import type { Library } from '../library.js'
import type { BanjuanEvent, BanjuanEventMap, PluginCommand } from '../types.js'

export abstract class BanjuanPlugin {
  readonly id: string
  readonly library: Library
  private bus: EventBus
  private commands: PluginCommand[] = []
  private listeners: Array<{ event: BanjuanEvent; handler: (...args: any[]) => void }> = []

  constructor(id: string, library: Library, bus: EventBus) {
    this.id = id
    this.library = library
    this.bus = bus
  }

  abstract onload(): Promise<void>
  abstract onunload(): Promise<void>

  addCommand(cmd: { id: string; name: string; callback: () => Promise<void> }): void {
    const command: PluginCommand = {
      id: `${this.id}:${cmd.id}`,
      name: cmd.name,
      pluginId: this.id,
      callback: cmd.callback,
    }
    this.commands.push(command)
  }

  on<E extends BanjuanEvent>(event: E, handler: (data: BanjuanEventMap[E]) => void): void {
    this.bus.on(event, handler)
    this.listeners.push({ event, handler })
  }

  getCommands(): PluginCommand[] {
    return [...this.commands]
  }

  _cleanup(): void {
    for (const { event, handler } of this.listeners) {
      this.bus.off(event, handler)
    }
    this.listeners = []
    this.commands = []
  }
}
