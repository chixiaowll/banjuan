import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { EventBus } from '../events/bus.js'
import type { Library } from '../library.js'
import type { BanjuanEvent, BanjuanEventMap, PluginCommand, PluginViewInfo } from '../types.js'

export interface PluginViewFactory {
  viewType: string
  displayText: string
  icon?: string
  singleton?: boolean
}

export abstract class BanjuanPlugin {
  readonly id: string
  readonly library: Library
  private bus: EventBus
  private pluginPath: string
  private commands: PluginCommand[] = []
  private listeners: Array<{ event: BanjuanEvent; handler: (...args: any[]) => void }> = []
  private cleanupCallbacks: Array<() => void> = []
  private views: PluginViewFactory[] = []
  private rpcHandlers = new Map<string, (...args: any[]) => Promise<any>>()
  private _webContentsSender: ((channel: string, data: any) => void) | null = null

  constructor(id: string, library: Library, bus: EventBus, pluginPath: string) {
    this.id = id
    this.library = library
    this.bus = bus
    this.pluginPath = pluginPath
  }

  abstract onload(): Promise<void>
  abstract onunload(): Promise<void>

  // === Commands ===
  addCommand(cmd: { id: string; name: string; callback: () => Promise<void> }): void {
    const command: PluginCommand = {
      id: `${this.id}:${cmd.id}`,
      name: cmd.name,
      pluginId: this.id,
      callback: cmd.callback,
    }
    this.commands.push(command)
  }

  // === Events ===
  on<E extends BanjuanEvent>(event: E, handler: (data: BanjuanEventMap[E]) => void): void {
    this.bus.on(event, handler)
    this.listeners.push({ event, handler })
  }

  // === Deterministic Cleanup ===
  register(cb: () => void): void {
    this.cleanupCallbacks.push(cb)
  }

  registerInterval(id: ReturnType<typeof setInterval>): void {
    this.cleanupCallbacks.push(() => clearInterval(id))
  }

  // === View Registration ===
  registerView(opts: { viewType: string; displayText: string; icon?: string; singleton?: boolean }): void {
    this.views.push({
      viewType: `${this.id}:${opts.viewType}`,
      displayText: opts.displayText,
      icon: opts.icon,
      singleton: opts.singleton,
    })
  }

  getViews(): PluginViewInfo[] {
    return this.views.map(v => ({ ...v, pluginId: this.id }))
  }

  // === RPC ===
  addRpcHandler(method: string, handler: (...args: any[]) => Promise<any>): void {
    this.rpcHandlers.set(method, handler)
  }

  async handleRpc(method: string, args: any[]): Promise<any> {
    const handler = this.rpcHandlers.get(method)
    if (!handler) throw new Error(`RPC method not found: ${this.id}:${method}`)
    return handler(...args)
  }

  sendToRenderer(channel: string, data: any): void {
    this._webContentsSender?.(`plugin:${this.id}:${channel}`, data)
  }

  /** @internal */
  _setWebContentsSender(sender: (channel: string, data: any) => void): void {
    this._webContentsSender = sender
  }

  // === Config Persistence ===
  async loadData(): Promise<any> {
    const configPath = join(this.pluginPath, 'config.json')
    if (!existsSync(configPath)) return {}
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      return {}
    }
  }

  async saveData(data: any): Promise<void> {
    const configPath = join(this.pluginPath, 'config.json')
    const dir = dirname(configPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(configPath, JSON.stringify(data, null, 2))
  }

  // === Accessors ===
  getCommands(): PluginCommand[] {
    return [...this.commands]
  }

  getPluginPath(): string {
    return this.pluginPath
  }

  // === Internal Cleanup ===
  _cleanup(): void {
    for (const { event, handler } of this.listeners) {
      this.bus.off(event, handler)
    }
    for (const cb of this.cleanupCallbacks) {
      try { cb() } catch {}
    }
    this.listeners = []
    this.cleanupCallbacks = []
    this.commands = []
    this.views = []
    this.rpcHandlers.clear()
    this._webContentsSender = null
  }
}
