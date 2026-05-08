import type { PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'
import type { EventBus } from '../events/bus.js'
import type { Library } from '../library.js'
import { BanjuanPlugin } from './base.js'
import type { PluginManifest, PluginInfo, PluginCommand, PluginViewInfo } from '../types.js'

export class PluginManager {
  private plugins = new Map<string, { plugin: BanjuanPlugin; manifest: PluginManifest; path: string }>()
  private pluginsDir: string
  private webContentsSender: ((channel: string, data: any) => void) | null = null

  constructor(
    private library: Library,
    private bus: EventBus,
    rootPath: string,
    private fs: PlatformFS,
  ) {
    this.pluginsDir = join(rootPath, '.banjuan', 'plugins')
  }

  async init(): Promise<void> {
    if (!(await this.fs.exists(this.pluginsDir))) {
      await this.fs.mkdir(this.pluginsDir, { recursive: true })
    }
  }

  setWebContentsSender(sender: (channel: string, data: any) => void): void {
    this.webContentsSender = sender
    for (const [, { plugin }] of this.plugins) {
      plugin._setWebContentsSender(sender)
    }
  }

  async loadAll(): Promise<void> {
    if (!(await this.fs.exists(this.pluginsDir))) return
    const entries = await this.fs.readdirWithTypes(this.pluginsDir)
    for (const entry of entries) {
      if (!entry.isDirectory) continue
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
    if (!(await this.fs.exists(manifestPath))) {
      throw new Error(`No manifest.json in ${pluginPath}`)
    }

    const manifest: PluginManifest = JSON.parse(await this.fs.readTextFile(manifestPath))
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is already loaded`)
    }

    const entryPath = join(pluginPath, 'index.js')
    if (!(await this.fs.exists(entryPath))) {
      throw new Error(`No index.js in ${pluginPath}`)
    }

    ;(globalThis as any).BanjuanPlugin = BanjuanPlugin
    const mod = await import(`file://${entryPath}`)
    const PluginClass = mod.default ?? mod
    if (typeof PluginClass !== 'function') {
      throw new Error(`Plugin ${manifest.id} does not export a class`)
    }

    const plugin: BanjuanPlugin = new PluginClass(manifest.id, this.library, this.bus, pluginPath, this.fs)
    if (this.webContentsSender) {
      plugin._setWebContentsSender(this.webContentsSender)
    }
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

  async listAll(): Promise<PluginInfo[]> {
    if (!(await this.fs.exists(this.pluginsDir))) return []
    const result: PluginInfo[] = []
    const entries = await this.fs.readdirWithTypes(this.pluginsDir)
    for (const entry of entries) {
      if (!entry.isDirectory) continue
      const pluginPath = join(this.pluginsDir, entry.name)
      const manifestPath = join(pluginPath, 'manifest.json')
      if (!(await this.fs.exists(manifestPath))) continue
      try {
        const manifest: PluginManifest = JSON.parse(await this.fs.readTextFile(manifestPath))
        result.push({
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description ?? '',
          enabled: this.plugins.has(manifest.id),
          path: pluginPath,
        })
      } catch {}
    }
    return result
  }

  async enable(pluginId: string): Promise<void> {
    if (this.plugins.has(pluginId)) return
    if (!(await this.fs.exists(this.pluginsDir))) throw new Error('Plugins directory not found')
    const entries = await this.fs.readdirWithTypes(this.pluginsDir)
    for (const entry of entries) {
      if (!entry.isDirectory) continue
      const manifestPath = join(this.pluginsDir, entry.name, 'manifest.json')
      if (!(await this.fs.exists(manifestPath))) continue
      let manifest: PluginManifest
      try {
        manifest = JSON.parse(await this.fs.readTextFile(manifestPath))
      } catch {
        continue
      }
      if (manifest.id === pluginId) {
        await this.load(entry.name)
        return
      }
    }
    throw new Error(`Plugin not found: ${pluginId}`)
  }

  async disable(pluginId: string): Promise<void> {
    await this.unload(pluginId)
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

  // === NEW: View Registry ===
  getViews(): PluginViewInfo[] {
    const views: PluginViewInfo[] = []
    for (const [, { plugin }] of this.plugins) {
      views.push(...plugin.getViews())
    }
    return views
  }

  // === NEW: RPC ===
  async handleRpc(pluginId: string, method: string, args: any[]): Promise<any> {
    const entry = this.plugins.get(pluginId)
    if (!entry) throw new Error(`Plugin not found: ${pluginId}`)
    return entry.plugin.handleRpc(method, args)
  }

  // === NEW: CSS Path ===
  async getPluginCssPath(pluginId: string): Promise<string | null> {
    const entry = this.plugins.get(pluginId)
    if (!entry) return null
    const cssPath = join(entry.path, 'styles.css')
    return (await this.fs.exists(cssPath)) ? cssPath : null
  }

  // === NEW: Renderer script path ===
  async getPluginRendererPath(pluginId: string): Promise<string | null> {
    const entry = this.plugins.get(pluginId)
    if (!entry) return null
    const rendererPath = join(entry.path, 'renderer.js')
    return (await this.fs.exists(rendererPath)) ? rendererPath : null
  }

  // === NEW: Config ===
  async loadPluginData(pluginId: string): Promise<any> {
    const entry = this.plugins.get(pluginId)
    if (!entry) return {}
    return entry.plugin.loadData()
  }

  async savePluginData(pluginId: string, data: any): Promise<void> {
    const entry = this.plugins.get(pluginId)
    if (!entry) return
    await entry.plugin.saveData(data)
  }
}
