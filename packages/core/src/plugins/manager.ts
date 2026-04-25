import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { EventBus } from '../events/bus.js'
import type { Library } from '../library.js'
import { BanjuanPlugin } from './base.js'
import type { PluginManifest, PluginInfo, PluginCommand } from '../types.js'

export class PluginManager {
  private plugins = new Map<string, { plugin: BanjuanPlugin; manifest: PluginManifest; path: string }>()
  private pluginsDir: string

  constructor(
    private library: Library,
    private bus: EventBus,
    rootPath: string,
  ) {
    this.pluginsDir = join(rootPath, '.banjuan', 'plugins')
    if (!existsSync(this.pluginsDir)) {
      mkdirSync(this.pluginsDir, { recursive: true })
    }
  }

  async loadAll(): Promise<void> {
    if (!existsSync(this.pluginsDir)) return
    const entries = readdirSync(this.pluginsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        await this.load(entry.name)
      } catch {
        // skip plugins that fail to load
      }
    }
  }

  async load(pluginDirName: string): Promise<void> {
    const pluginPath = join(this.pluginsDir, pluginDirName)
    const manifestPath = join(pluginPath, 'manifest.json')
    if (!existsSync(manifestPath)) {
      throw new Error(`No manifest.json in ${pluginPath}`)
    }

    const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is already loaded`)
    }

    const entryPath = join(pluginPath, 'index.js')
    if (!existsSync(entryPath)) {
      throw new Error(`No index.js in ${pluginPath}`)
    }

    const mod = await import(`file://${entryPath}`)
    const PluginClass = mod.default ?? mod
    if (typeof PluginClass !== 'function') {
      throw new Error(`Plugin ${manifest.id} does not export a class`)
    }

    const plugin: BanjuanPlugin = new PluginClass(manifest.id, this.library, this.bus)
    await plugin.onload()
    this.plugins.set(manifest.id, { plugin, manifest, path: pluginPath })
  }

  async unload(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId)
    if (!entry) return
    await entry.plugin.onunload()
    entry.plugin._cleanup()
    this.plugins.delete(pluginId)
  }

  async unloadAll(): Promise<void> {
    for (const [id] of this.plugins) {
      await this.unload(id)
    }
  }

  list(): PluginInfo[] {
    const result: PluginInfo[] = []
    for (const [id, { manifest, path }] of this.plugins) {
      result.push({
        id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description ?? '',
        enabled: true,
        path,
      })
    }
    return result
  }

  getCommands(): PluginCommand[] {
    const commands: PluginCommand[] = []
    for (const [, { plugin }] of this.plugins) {
      commands.push(...plugin.getCommands())
    }
    return commands
  }

  async runCommand(commandId: string): Promise<void> {
    for (const [, { plugin }] of this.plugins) {
      const cmd = plugin.getCommands().find(c => c.id === commandId)
      if (cmd) {
        await cmd.callback()
        return
      }
    }
    throw new Error(`Command not found: ${commandId}`)
  }
}
