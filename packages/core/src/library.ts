import type { PlatformDatabase } from './platform/index.js'
import type { PlatformDeps, PlatformFS } from './platform/index.js'
import { join, relative, dirname } from './platform/path.js'
import { initSchema } from './db/schema.js'
import { DocumentService } from './documents/service.js'
import { AnnotationService } from './annotations/service.js'
import { NoteService } from './notes/service.js'
import { NoteLinkService } from './notes/link-service.js'
import { DocLinkService } from './notes/doc-link-service.js'
import { FolderService } from './notes/folder-service.js'
import { TagService } from './tags/service.js'
import { SearchService } from './search/service.js'
import { DocTextService } from './search/doc-text.js'
import { MindmapService } from './mindmaps/service.js'
import { GraphService } from './graph/service.js'
import { EventBus } from './events/bus.js'
import { PluginManager } from './plugins/manager.js'
import type { LibraryConfig, SyncConfig } from './types.js'
import { WebDAVAdapter } from './sync/webdav-adapter.js'
import { SyncService, webdavTarget } from './sync/service.js'
import { StubService } from './sync/stub-service.js'
import { IndexService } from './indexing/service.js'
import { TemplateService } from './notes/template-service.js'
import { TrashService } from './trash/service.js'
import { migrateNotesToJsonAsync } from './notes/migration.js'
import { AttachmentService } from './notes/attachment-service.js'

/**
 * Hard cap on how many files a single library will enumerate/import. A study
 * ("书房") holds at most ~5200 files, so anything past this means a wrong
 * directory was picked (a home folder, a code tree); stop before it hangs the app.
 */
export const MAX_LIBRARY_FILES = 5200

export class Library {
  readonly rootPath: string
  readonly documents: DocumentService
  readonly annotations: AnnotationService
  readonly notes: NoteService
  readonly folders: FolderService
  readonly noteLinks: NoteLinkService
  readonly docLinks: DocLinkService
  readonly tags: TagService
  readonly search: SearchService
  readonly docText: DocTextService
  readonly mindmaps: MindmapService
  readonly graph: GraphService
  readonly events: EventBus
  readonly plugins: PluginManager
  readonly templates: TemplateService
  readonly attachments: AttachmentService
  readonly trash: TrashService
  private db: PlatformDatabase
  private fs: PlatformFS

  private constructor(rootPath: string, db: PlatformDatabase, private deps: PlatformDeps) {
    this.rootPath = rootPath
    this.db = db
    this.fs = deps.fs
    this.events = new EventBus()
    this.search = new SearchService(db)
    this.docText = new DocTextService(db)
    this.documents = new DocumentService(db, rootPath, this.search, this.events, deps.fs, deps.crypto)
    this.annotations = new AnnotationService(db, rootPath, this.events, deps.fs)
    this.notes = new NoteService(db, rootPath, this.search, this.events, deps.fs)
    this.folders = new FolderService(db, this.events)
    this.noteLinks = new NoteLinkService(db)
    this.docLinks = new DocLinkService(db)
    this.tags = new TagService(db, rootPath, this.events, deps.fs)
    this.mindmaps = new MindmapService(db, rootPath, this.events, deps.fs)
    this.graph = new GraphService(db)
    this.plugins = new PluginManager(this, this.events, rootPath, deps.fs, deps.globalPluginsDir, { trust: deps.pluginTrust, crypto: deps.crypto })
    this.templates = new TemplateService(db, rootPath, deps.fs)
    this.attachments = new AttachmentService(rootPath, deps.fs)

    this.trash = new TrashService(db, rootPath, deps.fs, () => this.createIndexService(), this.annotations)
    this.documents.setTrash(this.trash)
    this.notes.setTrash(this.trash)

    this.notes.setTemplateService(this.templates)
    this.notes.setLinkService(this.noteLinks)
    this.notes.setDocLinkService(this.docLinks)
    this.mindmaps.setLinkService(this.noteLinks)
  }

  static async isLibrary(rootPath: string, deps: PlatformDeps): Promise<boolean> {
    return deps.fs.exists(join(rootPath, '.banjuan'))
  }

  static async init(rootPath: string, deps: PlatformDeps, name?: string): Promise<Library> {
    const banjuanDir = join(rootPath, '.banjuan')
    if (await deps.fs.exists(banjuanDir)) {
      throw new Error(`Library already exists at ${rootPath}`)
    }

    await deps.fs.mkdir(banjuanDir, { recursive: true })
    await deps.fs.mkdir(join(banjuanDir, 'data', 'documents'), { recursive: true })
    await deps.fs.mkdir(join(banjuanDir, 'data', 'annotations'), { recursive: true })
    await deps.fs.mkdir(join(banjuanDir, 'stubs'), { recursive: true })
    await deps.fs.mkdir(join(banjuanDir, 'notes'), { recursive: true })

    const createdAt = new Date().toISOString()
    const id = (await deps.crypto.sha256(new TextEncoder().encode(rootPath + '|' + createdAt))).slice(0, 32)
    const config: LibraryConfig = {
      id,
      name: name || 'My Library',
      version: '1',
      createdAt,
    }
    await deps.fs.writeTextFile(join(banjuanDir, 'config.json'), JSON.stringify(config, null, 2))
    await deps.fs.writeTextFile(join(banjuanDir, 'tags.json'), '[]')

    const dbPath = join(banjuanDir, 'db.sqlite')
    const db = await deps.dbFactory.open(dbPath)
    initSchema(db)

    return new Library(rootPath, db, deps)
  }

  static async open(rootPath: string, deps: PlatformDeps): Promise<Library> {
    const banjuanDir = join(rootPath, '.banjuan')
    if (!(await deps.fs.exists(banjuanDir))) {
      throw new Error(`${rootPath} is not a library — .banjuan directory not found`)
    }

    // Migrate old mindmap files to unified notes directory
    await Library.migrateExistingMindmapFiles(rootPath, deps.fs)

    const dbPath = join(banjuanDir, 'db.sqlite')
    // Persist the DB across opens — it is a cache rebuilt from the on-disk
    // source of truth only when stale (IndexService.isStale) or on an explicit
    // "彻底重建". initSchema is idempotent (CREATE IF NOT EXISTS + additive ALTERs).
    const db = await deps.dbFactory.open(dbPath)
    initSchema(db)

    // Back-fill identity for libraries created before `id` existed (idempotent).
    const cfgPath = join(banjuanDir, 'config.json')
    try {
      const cfg = JSON.parse(await deps.fs.readTextFile(cfgPath))
      if (!cfg.id) {
        cfg.id = (await deps.crypto.sha256(new TextEncoder().encode(rootPath + '|' + (cfg.createdAt ?? '')))).slice(0, 32)
        await deps.fs.writeTextFile(cfgPath, JSON.stringify(cfg, null, 2))
      }
    } catch { /* config unreadable — leave as-is */ }

    const library = new Library(rootPath, db, deps)
    try {
      const purged = await library.trash.purgeExpired()
      if (purged) console.log(`[trash] purged ${purged} entries older than the retention period`)
    } catch (e) {
      console.warn('[trash] purging expired entries failed', e)
    }
    return library
  }

  static async migrateNotes(rootPath: string, fs: PlatformFS): Promise<{ migrated: number; errors: string[] }> {
    const notesDir = join(rootPath, '.banjuan', 'notes')
    return migrateNotesToJsonAsync(notesDir, fs)
  }

  async getConfig(): Promise<LibraryConfig> {
    const configPath = join(this.rootPath, '.banjuan', 'config.json')
    return JSON.parse(await this.fs.readTextFile(configPath)) as LibraryConfig
  }

  async getName(): Promise<string> {
    const config = await this.getConfig()
    return config.name
  }

  async setName(name: string): Promise<void> {
    const configPath = join(this.rootPath, '.banjuan', 'config.json')
    const config = await this.getConfig()
    config.name = name
    await this.fs.writeTextFile(configPath, JSON.stringify(config, null, 2))
  }

  async getId(): Promise<string> {
    const config = await this.getConfig()
    return config.id
  }

  async adoptLibraryId(id: string): Promise<void> {
    const configPath = join(this.rootPath, '.banjuan', 'config.json')
    const config = await this.getConfig()
    config.id = id
    await this.fs.writeTextFile(configPath, JSON.stringify(config, null, 2))
  }

  async getSyncConfig(): Promise<SyncConfig | null> {
    const syncPath = join(this.rootPath, '.banjuan', 'sync.json')
    if (!(await this.fs.exists(syncPath))) return null
    const { passwordSealed, ...stored } = JSON.parse(await this.fs.readTextFile(syncPath)) as SyncConfig & { passwordSealed?: string }
    if (typeof passwordSealed === 'string') {
      let password = ''
      try { password = this.deps.secrets?.open(passwordSealed) ?? '' } catch { /* sealed on another machine: ask again */ }
      return { ...stored, password }
    }
    // A plain password from before (or saved without a keychain): seal it now.
    if (stored.password && this.deps.secrets) await this.saveSyncConfig(stored)
    return stored
  }

  /** The password is sealed by the platform's keychain when there is one (PlatformDeps.secrets). */
  async saveSyncConfig(config: SyncConfig): Promise<void> {
    const syncPath = join(this.rootPath, '.banjuan', 'sync.json')
    let stored: Record<string, unknown> = { ...config }
    if (config.password && this.deps.secrets) {
      try {
        const { password, ...rest } = config
        stored = { ...rest, passwordSealed: this.deps.secrets.seal(password) }
      } catch { /* no keychain right now: keep it as before */ }
    }
    await this.fs.writeTextFile(syncPath, JSON.stringify(stored, null, 2))
  }

  createSyncService(remotePath?: string): SyncService {
    return new SyncService(this.rootPath, new WebDAVAdapter(this.fs), this.events, this.fs, remotePath, this.deps.crypto)
  }

  async createSyncServiceConnected(config: SyncConfig): Promise<SyncService> {
    const adapter = new WebDAVAdapter(this.fs)
    await adapter.connect(config)
    return new SyncService(this.rootPath, adapter, this.events, this.fs, config.remotePath, this.deps.crypto, undefined, webdavTarget(config))
  }

  createIndexService(): IndexService {
    return new IndexService(this.db, this.rootPath, this.fs)
  }

  createStubService(): StubService {
    return new StubService(this.rootPath, new WebDAVAdapter(this.fs), this.fs)
  }

  /**
   * Mind maps from before they were notes (.banjuan/mindmaps, .banjuan/data/mindmaps)
   * become note files. Each is migrated once: the ids done are recorded in
   * .banjuan/migrated-mindmaps.json (synced, so every device agrees). It used
   * to run on every open and write any map whose note file wasn't at its
   * original place — bringing back maps that had been deleted, and copying maps
   * moved into a folder back to the top.
   */
  private static async migrateExistingMindmapFiles(rootPath: string, fs: PlatformFS): Promise<void> {
    const banjuanDir = join(rootPath, '.banjuan')
    const notesDir = join(banjuanDir, 'notes')
    const oldDirs = [
      join(banjuanDir, 'mindmaps'),
      join(banjuanDir, 'data', 'mindmaps'),
    ]
    const present: string[] = []
    for (const d of oldDirs) if (await fs.exists(d)) present.push(d)
    if (present.length === 0) return

    const markerPath = join(banjuanDir, 'migrated-mindmaps.json')
    let done = new Set<string>()
    let firstRun = true
    try {
      done = new Set(JSON.parse(await fs.readTextFile(markerPath)) as string[])
      firstRun = false
    } catch { /* no record yet */ }
    // Without a record (libraries migrated by earlier versions), a map whose
    // note file exists anywhere counts as done.
    const noteFiles = new Set<string>()
    if (firstRun && (await fs.exists(notesDir))) {
      const walk = async (dir: string) => {
        for (const e of await fs.readdirWithTypes(dir)) {
          if (e.isDirectory) await walk(join(dir, e.name))
          else noteFiles.add(e.name)
        }
      }
      await walk(notesDir).catch(() => {})
    }

    let changed = false
    for (const oldDir of present) {
      const scan = async (dir: string, prefix: string) => {
        const entries = await fs.readdirWithTypes(dir)
        for (const entry of entries) {
          const srcPath = join(dir, entry.name)
          if (entry.isDirectory) {
            await scan(srcPath, prefix ? `${prefix}/${entry.name}` : entry.name)
          } else if (entry.name.endsWith('.json')) {
            try {
              const raw = JSON.parse(await fs.readTextFile(srcPath))
              if (!raw.id || typeof raw.id !== 'string') continue   // not a map; the rest of the folder still is
              if (done.has(raw.id)) continue
              done.add(raw.id)
              changed = true
              if (noteFiles.has(`${raw.id}.json`)) continue
              const meta = {
                id: raw.id,
                title: raw.title,
                type: 'mindmap' as const,
                docId: raw.docId ?? null,
                folderId: null,
                annotationIds: [],
                tags: raw.tags ?? [],
                contentFormat: 'json' as const,
                typeMeta: { layout: raw.layout ?? 'mindmap', theme: raw.theme ?? 'classic' },
                createdAt: raw.createdAt,
                updatedAt: raw.updatedAt,
              }
              const newFileData = {
                meta,
                nodes: raw.nodes ?? [],
                edges: raw.edges ?? [],
              }
              const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
              const destPath = join(notesDir, relPath)
              if (!(await fs.exists(destPath))) {
                await fs.mkdir(dirname(destPath), { recursive: true })
                await fs.writeTextFile(destPath, JSON.stringify(newFileData, null, 2))
              }
            } catch { /* skip malformed files */ }
          }
        }
      }
      await scan(oldDir, '')
    }
    if (changed) await fs.writeTextFile(markerPath, JSON.stringify([...done].sort(), null, 2))
  }

  private async walkFiles(limit = MAX_LIBRARY_FILES): Promise<{ files: string[]; truncated: boolean }> {
    return Library.walkFilesIn(this.fs, this.rootPath, limit)
  }

  /**
   * Enumerate files under a directory, stopping as soon as `limit` is reached.
   * Static so callers can size up a directory BEFORE creating a library in it
   * (the over-cap pre-check), without having to construct/init a Library first.
   */
  static async walkFilesIn(fs: PlatformFS, rootPath: string, limit = MAX_LIBRARY_FILES): Promise<{ files: string[]; truncated: boolean }> {
    const skipDirs = new Set(['.banjuan', 'node_modules', '.git'])
    const files: string[] = []
    let truncated = false
    const walk = async (dir: string) => {
      if (truncated) return
      const entries = await fs.readdirWithTypes(dir)
      for (const entry of entries) {
        if (truncated) return
        if (entry.name.startsWith('.')) continue
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory) {
          const topDir = relative(rootPath, fullPath).split('/')[0]
          if (skipDirs.has(topDir)) continue
          await walk(fullPath)
        } else {
          if (files.length >= limit) { truncated = true; return }
          files.push(fullPath)
        }
      }
    }
    await walk(rootPath)
    return { files, truncated }
  }

  /** True if the directory holds more than the import cap — used as a pre-check before init. */
  static async exceedsFileCap(rootPath: string, fs: PlatformFS, limit = MAX_LIBRARY_FILES): Promise<boolean> {
    const { truncated } = await Library.walkFilesIn(fs, rootPath, limit)
    return truncated
  }

  async scanAndImport(): Promise<{ imported: number; skipped: number; errors: string[]; truncated: boolean; limit: number }> {
    const { files, truncated } = await this.walkFiles()
    const result = { imported: 0, skipped: 0, errors: [] as string[], truncated, limit: MAX_LIBRARY_FILES }
    // Over the cap → import nothing; the directory is almost certainly wrong.
    if (truncated) return result
    for (const r of await this.documents.importMany(files)) {
      if (r.doc) result.imported++
      else result.skipped++
    }
    return result
  }

  async syncWithDisk(): Promise<{ imported: number; removed: number; missing: number; truncated: boolean; limit: number }> {
    const { files: walkedFiles, truncated } = await this.walkFiles()
    // Over the cap → touch nothing: don't import, and don't reconcile (the disk
    // view is incomplete, so any "missing" verdict would be wrong).
    if (truncated) return { imported: 0, removed: 0, missing: 0, truncated, limit: MAX_LIBRARY_FILES }

    const diskFiles = new Set(walkedFiles.map(f => relative(this.rootPath, f)))

    // Never silently delete metadata for a vanished file — flag it as missing
    // instead, so annotations/tags survive and it reappears if the file comes
    // back. Permanent removal only happens via the explicit rebuild dialog
    // (purgeDocuments). `removed` is kept at 0 for backward compatibility.
    const missing = await this.documents.reconcileMissing(diskFiles)

    // Only import files not already in the index. import() does an fs.exists()
    // per call (a Capacitor bridge round-trip on mobile), so skipping known
    // paths keeps a normal open to just the directory walk above.
    const known = await this.documents.listImportedPaths()
    // Unsupported files or races just come back with an error — safe to skip.
    const fresh = [...diskFiles].filter(p => !known.has(p))
    const imported = (await this.documents.importMany(fresh)).filter(r => r.doc).length

    return { imported, removed: 0, missing, truncated, limit: MAX_LIBRARY_FILES }
  }

  /**
   * Documents whose metadata exists but whose backing file is gone from disk.
   * Drives the "rebuild" dialog where the user decides what to purge vs keep.
   */
  async detectMissingFiles(): Promise<Array<{ id: string; title: string; path: string }>> {
    const { files, truncated } = await this.walkFiles()
    // A truncated walk means the disk view is incomplete — we cannot tell which
    // metadata is genuinely orphaned, so report nothing rather than false hits.
    if (truncated) return []
    const diskFiles = new Set(files.map(f => relative(this.rootPath, f)))
    const missing: Array<{ id: string; title: string; path: string }> = []
    for (const meta of await this.documents.listAllMetadata()) {
      if (!diskFiles.has(meta.path)) {
        missing.push({ id: meta.id, title: meta.title, path: meta.path })
      }
    }
    return missing
  }

  /** Permanently purge the given documents and their annotations. */
  async purgeDocuments(ids: string[]): Promise<number> {
    let purged = 0
    for (const id of ids) {
      await this.annotations.deleteByDoc(id)
      await this.documents.purgeById(id)
      purged++
    }
    return purged
  }

  /**
   * Persist the in-memory DB cache to disk. On mobile (sql.js) the DB only
   * lives in memory until snapshotted, and close() never runs when iOS kills
   * the app — so callers flush after building/updating the cache to avoid
   * rebuilding it from disk on every launch. No-op on file-backed engines.
   */
  async flush(): Promise<void> {
    await this.db.save?.()
  }

  async close(): Promise<void> {
    await this.plugins.unloadAll()
    this.events.emit('library:closed', { path: this.rootPath })
    this.events.removeAllListeners()
    this.db.close()
  }
}
