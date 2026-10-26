import type { PlatformFS, PluginTrustStore } from '../platform/index.js'
import type { PlatformCrypto } from '../platform/crypto.js'
import { join } from '../platform/path.js'
import type { EventBus } from '../events/bus.js'
import type { Library } from '../library.js'
import { BanjuanPlugin } from './base.js'
import type { PluginManifest, PluginInfo, PluginCommand, PluginViewInfo } from '../types.js'

export class PluginManager {
  private plugins = new Map<string, { plugin: BanjuanPlugin; manifest: PluginManifest; path: string }>()
  /** Library-local plugins directory (always present). */
  private pluginsDir: string
  /** Directories scanned for plugins, in priority order (local overrides global). */
  private pluginDirs: string[]
  private webContentsSender: ((channel: string, data: any) => void) | null = null

  constructor(
    private library: Library,
    private bus: EventBus,
    rootPath: string,
    private fs: PlatformFS,
    globalPluginsDir?: string,
    private trust: { trust?: PluginTrustStore; crypto?: PlatformCrypto } = {},
  ) {
    this.rootPath = rootPath
    this.pluginsDir = join(rootPath, '.banjuan', 'plugins')
    // Local first so a library-local plugin can override a global one by id.
    this.pluginDirs = globalPluginsDir ? [this.pluginsDir, globalPluginsDir] : [this.pluginsDir]
  }

  private rootPath: string

  /**
   * Fingerprint of the code a plugin would run (manifest + main + renderer
   * script). Trust is given to exactly this; any change asks again.
   */
  private async codeHash(pluginPath: string): Promise<string | null> {
    const crypto = this.trust.crypto
    if (!crypto) return null
    const parts: Uint8Array[] = []
    for (const file of ['manifest.json', 'index.js', 'renderer.js']) {
      const p = join(pluginPath, file)
      const data = (await this.fs.exists(p)) ? await this.fs.readFile(p) : new Uint8Array()
      parts.push(new TextEncoder().encode(`${file}:${data.length}:`), data)
    }
    const all = new Uint8Array(parts.reduce((n, d) => n + d.length, 0))
    let off = 0
    for (const d of parts) { all.set(d, off); off += d.length }
    return crypto.sha256(all)
  }

  /** Library-local plugins run only if this device allowed this exact code. Global ones always do. */
  private async isTrusted(baseDir: string, pluginPath: string, pluginId: string): Promise<boolean> {
    if (baseDir !== this.pluginsDir) return true
    if (!this.trust.trust) return false
    const hash = await this.codeHash(pluginPath)
    return !!hash && this.trust.trust.isTrusted(this.rootPath, pluginId, hash)
  }

  async init(): Promise<void> {
    if (!(await this.fs.exists(this.pluginsDir))) {
      await this.fs.mkdir(this.pluginsDir, { recursive: true })
    }
  }

  /** Find the directory containing a plugin dir-name, searching all sources. */
  private async resolvePluginDir(pluginDirName: string): Promise<string | null> {
    for (const dir of this.pluginDirs) {
      if (await this.fs.exists(join(dir, pluginDirName, 'manifest.json'))) return dir
    }
    return null
  }

  setWebContentsSender(sender: (channel: string, data: any) => void): void {
    this.webContentsSender = sender
    for (const [, { plugin }] of this.plugins) {
      plugin._setWebContentsSender(sender)
    }
  }

  async loadAll(): Promise<void> {
    const loaded = new Set<string>()
    for (const dir of this.pluginDirs) {
      if (!(await this.fs.exists(dir))) continue
      const entries = await this.fs.readdirWithTypes(dir)
      for (const entry of entries) {
        if (!entry.isDirectory) continue
        try {
          const manifestPath = join(dir, entry.name, 'manifest.json')
          if (!(await this.fs.exists(manifestPath))) continue
          const manifest: PluginManifest = JSON.parse(await this.fs.readTextFile(manifestPath))
          if (loaded.has(manifest.id) || this.plugins.has(manifest.id)) continue
          // An untrusted library plugin is skipped (and doesn't shadow a global one with the same id).
          if (!(await this.isTrusted(dir, join(dir, entry.name), manifest.id))) {
            console.warn(`[plugins] not loading untrusted library plugin ${manifest.id} (enable it in Plugins to allow)`)
            continue
          }
          await this.loadFromDir(dir, entry.name)
          loaded.add(manifest.id)
        } catch (err) {
          // skip plugins that fail to load
          console.warn(`[plugins] failed to load ${join(dir, entry.name)}:`, err)
        }
      }
    }
  }

  async load(pluginDirName: string): Promise<void> {
    const dir = await this.resolvePluginDir(pluginDirName)
    if (!dir) throw new Error(`Plugin not found: ${pluginDirName}`)
    await this.loadFromDir(dir, pluginDirName)
  }

  private async loadFromDir(baseDir: string, pluginDirName: string): Promise<void> {
    const pluginPath = join(baseDir, pluginDirName)
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
    const result: PluginInfo[] = []
    const seen = new Set<string>()
    for (const dir of this.pluginDirs) {
      if (!(await this.fs.exists(dir))) continue
      const entries = await this.fs.readdirWithTypes(dir)
      for (const entry of entries) {
        if (!entry.isDirectory) continue
        const pluginPath = join(dir, entry.name)
        const manifestPath = join(pluginPath, 'manifest.json')
        if (!(await this.fs.exists(manifestPath))) continue
        try {
          const manifest: PluginManifest = JSON.parse(await this.fs.readTextFile(manifestPath))
          if (seen.has(manifest.id)) continue
          seen.add(manifest.id)
          const fromLibrary = dir === this.pluginsDir
          result.push({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description ?? '',
            enabled: this.plugins.has(manifest.id),
            path: pluginPath,
            source: fromLibrary ? 'library' : 'global',
            ...(fromLibrary ? { trusted: await this.isTrusted(dir, pluginPath, manifest.id) } : {}),
          })
        } catch {}
      }
    }
    return result
  }

  async enable(pluginId: string): Promise<void> {
    if (this.plugins.has(pluginId)) return
    for (const dir of this.pluginDirs) {
      if (!(await this.fs.exists(dir))) continue
      const entries = await this.fs.readdirWithTypes(dir)
      for (const entry of entries) {
        if (!entry.isDirectory) continue
        const manifestPath = join(dir, entry.name, 'manifest.json')
        if (!(await this.fs.exists(manifestPath))) continue
        let manifest: PluginManifest
        try {
          manifest = JSON.parse(await this.fs.readTextFile(manifestPath))
        } catch {
          continue
        }
        if (manifest.id === pluginId) {
          // Enabling is the user's explicit consent to run this library's plugin code here.
          if (dir === this.pluginsDir && this.trust.trust) {
            const hash = await this.codeHash(join(dir, entry.name))
            if (hash) await this.trust.trust.trust(this.rootPath, pluginId, hash)
          }
          await this.loadFromDir(dir, entry.name)
          return
        }
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
