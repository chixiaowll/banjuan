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
import { MindmapService } from './mindmaps/service.js'
import { GraphService } from './graph/service.js'
import { EventBus } from './events/bus.js'
import { PluginManager } from './plugins/manager.js'
import type { LibraryConfig, SyncConfig } from './types.js'
import { WebDAVAdapter } from './sync/webdav-adapter.js'
import { SyncService } from './sync/service.js'
import { StubService } from './sync/stub-service.js'
import { IndexService } from './indexing/service.js'
import { TemplateService } from './notes/template-service.js'
import { migrateNotesToJsonAsync } from './notes/migration.js'
import { AttachmentService } from './notes/attachment-service.js'

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
  readonly mindmaps: MindmapService
  readonly graph: GraphService
  readonly events: EventBus
  readonly plugins: PluginManager
  readonly templates: TemplateService
  readonly attachments: AttachmentService
  private db: PlatformDatabase
  private fs: PlatformFS

  private constructor(rootPath: string, db: PlatformDatabase, private deps: PlatformDeps) {
    this.rootPath = rootPath
    this.db = db
    this.fs = deps.fs
    this.events = new EventBus()
    this.search = new SearchService(db)
    this.documents = new DocumentService(db, rootPath, this.search, this.events, deps.fs, deps.crypto)
    this.annotations = new AnnotationService(db, rootPath, this.events, deps.fs)
    this.notes = new NoteService(db, rootPath, this.search, this.events, deps.fs)
    this.folders = new FolderService(db, this.events)
    this.noteLinks = new NoteLinkService(db)
    this.docLinks = new DocLinkService(db)
    this.tags = new TagService(db, rootPath, this.events, deps.fs)
    this.mindmaps = new MindmapService(db, rootPath, this.events, deps.fs)
    this.graph = new GraphService(db)
    this.plugins = new PluginManager(this, this.events, rootPath, deps.fs, deps.globalPluginsDir)
    this.templates = new TemplateService(db)
    this.attachments = new AttachmentService(rootPath, deps.fs)

    this.notes.setTemplateService(this.templates)
    this.notes.setLinkService(this.noteLinks)
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

    const config: LibraryConfig = {
      name: name || 'My Library',
      version: '1',
      createdAt: new Date().toISOString(),
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
    if (await deps.fs.exists(dbPath)) {
      await deps.fs.remove(dbPath)
    }
    const walPath = dbPath + '-wal'
    const shmPath = dbPath + '-shm'
    if (await deps.fs.exists(walPath)) await deps.fs.remove(walPath)
    if (await deps.fs.exists(shmPath)) await deps.fs.remove(shmPath)
    const db = await deps.dbFactory.open(dbPath)
    initSchema(db)

    return new Library(rootPath, db, deps)
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

  async getSyncConfig(): Promise<SyncConfig | null> {
    const syncPath = join(this.rootPath, '.banjuan', 'sync.json')
    if (!(await this.fs.exists(syncPath))) return null
    return JSON.parse(await this.fs.readTextFile(syncPath)) as SyncConfig
  }

  async saveSyncConfig(config: SyncConfig): Promise<void> {
    const syncPath = join(this.rootPath, '.banjuan', 'sync.json')
    await this.fs.writeTextFile(syncPath, JSON.stringify(config, null, 2))
  }

  createSyncService(remotePath?: string): SyncService {
    return new SyncService(this.rootPath, new WebDAVAdapter(this.fs), this.events, this.fs, remotePath)
  }

  async createSyncServiceConnected(config: SyncConfig): Promise<SyncService> {
    const adapter = new WebDAVAdapter(this.fs)
    await adapter.connect(config)
    return new SyncService(this.rootPath, adapter, this.events, this.fs, config.remotePath)
  }

  createIndexService(): IndexService {
    return new IndexService(this.db, this.rootPath, this.fs)
  }

  createStubService(): StubService {
    return new StubService(this.rootPath, new WebDAVAdapter(this.fs), this.fs)
  }

  private static async migrateExistingMindmapFiles(rootPath: string, fs: PlatformFS): Promise<void> {
    const banjuanDir = join(rootPath, '.banjuan')
    const notesDir = join(banjuanDir, 'notes')
    const oldDirs = [
      join(banjuanDir, 'mindmaps'),
      join(banjuanDir, 'data', 'mindmaps'),
    ]

    for (const oldDir of oldDirs) {
      if (!(await fs.exists(oldDir))) continue
      const scan = async (dir: string, prefix: string) => {
        const entries = await fs.readdirWithTypes(dir)
        for (const entry of entries) {
          const srcPath = join(dir, entry.name)
          if (entry.isDirectory) {
            await scan(srcPath, prefix ? `${prefix}/${entry.name}` : entry.name)
          } else if (entry.name.endsWith('.json')) {
            try {
              const raw = JSON.parse(await fs.readTextFile(srcPath))
              if (!raw.id) return
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
  }

  private async walkFiles(): Promise<string[]> {
    const skipDirs = new Set(['.banjuan', 'node_modules', '.git'])
    const files: string[] = []
    const walk = async (dir: string) => {
      const entries = await this.fs.readdirWithTypes(dir)
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory) {
          const topDir = relative(this.rootPath, fullPath).split('/')[0]
          if (skipDirs.has(topDir)) continue
          await walk(fullPath)
        } else {
          files.push(fullPath)
        }
      }
    }
    await walk(this.rootPath)
    return files
  }

  async scanAndImport(): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const files = await this.walkFiles()
    const result = { imported: 0, skipped: 0, errors: [] as string[] }
    for (const file of files) {
      try {
        await this.documents.import(file)
        result.imported++
      } catch {
        result.skipped++
      }
    }
    return result
  }

  async syncWithDisk(): Promise<{ imported: number; removed: number }> {
    const walkedFiles = await this.walkFiles()
    const diskFiles = new Set(walkedFiles.map(f => relative(this.rootPath, f)))

    const removed = await this.documents.purgeOrphanMetadata(diskFiles)

    let imported = 0
    for (const relPath of diskFiles) {
      try {
        await this.documents.import(relPath)
        imported++
      } catch {
        // already imported or unsupported
      }
    }

    return { imported, removed }
  }

  async close(): Promise<void> {
    await this.plugins.unloadAll()
    this.events.emit('library:closed', { path: this.rootPath })
    this.events.removeAllListeners()
    this.db.close()
  }
}
